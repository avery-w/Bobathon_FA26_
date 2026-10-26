import http.client
import json
import sys
import tempfile
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import server  # noqa: E402
from test_analytics import make_db, user_msg, asst_msg, ms  # noqa: E402


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.td = tempfile.TemporaryDirectory()
        base = Path(cls.td.name)
        make_db(
            str(base / "bob.db"),
            [{"id": "a", "created_at": ms(2026, 10, 25), "costs": {"cost": 1.0}}],
            [user_msg("a", ms(2026, 10, 25), "hello"), asst_msg("a", ms(2026, 10, 25), 1.0)],
        )
        cfgp = base / "cfg" / "config.json"
        cfgp.parent.mkdir()
        cfgp.write_text(json.dumps({"db_path": str(base / "bob.db"), "port": 8799}))
        cls.state = server.State(cfgp)
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.make_handler(cls.state, set()))
        cls.port = cls.httpd.server_address[1]
        hosts = {f"127.0.0.1:{cls.port}", f"localhost:{cls.port}"}
        cls.httpd.RequestHandlerClass = server.make_handler(cls.state, hosts)
        cls.hosts = hosts
        cls.cfgp = cfgp
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.td.cleanup()

    def req(self, method, path, body=None, headers=None, host=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        h = {"Host": host or f"127.0.0.1:{self.port}"}
        h.update(headers or {})
        c.request(method, path, body=body, headers=h)
        r = c.getresponse()
        data = r.read()
        hdrs = {k.lower(): v for k, v in r.getheaders()}
        c.close()
        return r.status, hdrs, data

    def login(self):
        self.state.failures = 0
        self.state.locked_until = 0
        st, h, _ = self.req("POST", "/login", f"code={self.state.code}".encode(),
                            {"Content-Type": "application/x-www-form-urlencoded"})
        self.assertEqual(st, 303)
        return h["set-cookie"].split(";")[0]

    def test_unauthenticated_access_denied(self):
        st, _, body = self.req("GET", "/")
        self.assertEqual(st, 200)
        self.assertIn(b"Access code", body)
        self.assertEqual(self.req("GET", "/api/data")[0], 401)
        self.assertEqual(self.req("GET", "/api/settings")[0], 401)
        self.assertEqual(self.req("POST", "/api/settings", b"{}", {"Content-Type": "application/json"})[0], 401)

    def test_login_cookie_flags_and_data(self):
        st, h, _ = self.req("POST", "/login", f"code={self.state.code}".encode(),
                            {"Content-Type": "application/x-www-form-urlencoded"})
        self.assertEqual(st, 303)
        cookie = h["set-cookie"]
        for flag in ("HttpOnly", "SameSite=Strict"):
            self.assertIn(flag, cookie)
        st, _, body = self.req("GET", "/api/data", headers={"Cookie": cookie.split(";")[0]})
        self.assertEqual(st, 200)
        self.assertAlmostEqual(json.loads(body)["totals"]["cost"], 1.0)

    def test_wrong_code_and_lockout(self):
        self.state.failures = 0
        self.state.locked_until = 0
        for _ in range(server.MAX_FAILURES - 1):
            self.assertEqual(self.req("POST", "/login", b"code=nope",
                                      {"Content-Type": "application/x-www-form-urlencoded"})[0], 401)
        self.assertEqual(self.req("POST", "/login", b"code=nope",
                                  {"Content-Type": "application/x-www-form-urlencoded"})[0], 429)
        # correct code is also refused while locked out
        self.assertEqual(self.req("POST", "/login", f"code={self.state.code}".encode(),
                                  {"Content-Type": "application/x-www-form-urlencoded"})[0], 429)
        self.state.failures = 0
        self.state.locked_until = 0

    def test_security_headers(self):
        _, h, _ = self.req("GET", "/style.css")
        self.assertIn("default-src 'none'", h["content-security-policy"])
        self.assertEqual(h["x-content-type-options"], "nosniff")
        self.assertEqual(h["cache-control"], "no-store")
        self.assertNotIn("python", h.get("server", "").lower().replace("bobanalytics", ""))

    def test_rejects_foreign_host_header(self):
        self.assertEqual(self.req("GET", "/", host="evil.example")[0], 403)
        self.assertEqual(self.req("GET", "/api/data", host="evil.example:80")[0], 403)

    def test_rejects_cross_origin_post(self):
        cookie = self.login()
        st, _, _ = self.req("POST", "/api/settings", json.dumps({"reset_day": 5}).encode(),
                            {"Content-Type": "application/json", "Origin": "http://evil.example", "Cookie": cookie})
        self.assertEqual(st, 403)

    def test_settings_validation_and_persistence(self):
        cookie = self.login()
        hd = {"Content-Type": "application/json", "Cookie": cookie}
        ok = self.req("POST", "/api/settings", json.dumps({"reset_day": 15, "monthly_budget": 40}).encode(), hd)
        self.assertEqual(ok[0], 200)
        saved = json.loads(self.cfgp.read_text())
        self.assertEqual(saved["reset_day"], 15)
        self.assertEqual(oct(self.cfgp.stat().st_mode & 0o777), "0o600")
        for bad in ({"reset_day": 99}, {"monthly_budget": -1}, {"cost_multiplier": 0}, {"reset_day": "x"}, []):
            st, _, body = self.req("POST", "/api/settings", json.dumps(bad).encode(), hd)
            self.assertEqual(st, 400, bad)
            self.assertNotIn(b"Traceback", body)
        self.assertEqual(json.loads(self.cfgp.read_text())["reset_day"], 15)
        # unknown keys cannot be injected (e.g. changing db_path or port)
        self.req("POST", "/api/settings", json.dumps({"db_path": "/etc/passwd", "port": 1234}).encode(), hd)
        saved = json.loads(self.cfgp.read_text())
        self.assertNotEqual(saved["db_path"], "/etc/passwd")
        self.assertNotEqual(saved["port"], 1234)
        self.assertEqual(self.req("POST", "/api/settings", b"{}", {"Content-Type": "text/plain", "Cookie": cookie})[0], 415)

    def test_oversized_body_rejected(self):
        self.assertEqual(self.req("POST", "/login", b"x" * (server.MAX_BODY + 1),
                                  {"Content-Type": "application/x-www-form-urlencoded"})[0], 400)
    def test_optimize_requires_auth_and_validates(self):
        hd = {"Content-Type": "application/json"}
        body = json.dumps({"text": "make it better"}).encode()
        self.assertEqual(self.req("POST", "/api/optimize", body, hd)[0], 401)
        cookie = self.login()
        hd["Cookie"] = cookie
        st, _, out = self.req("POST", "/api/optimize", body, hd)
        self.assertEqual(st, 200)
        data = json.loads(out)
        self.assertIn("make it better", data["suggested"])
        self.assertEqual(self.req("POST", "/api/optimize", body, {"Content-Type": "text/plain", "Cookie": cookie})[0], 415)
        for bad in (b"not json", b"[]", json.dumps({"text": 5}).encode(), b"{}"):
            st, _, out = self.req("POST", "/api/optimize", bad, hd)
            self.assertEqual(st, 400, bad)
            self.assertNotIn(b"Traceback", out)
        evil = dict(hd, Origin="http://evil.example")
        self.assertEqual(self.req("POST", "/api/optimize", body, evil)[0], 403)

    def test_optimize_redacts_and_does_not_log_prompt(self):
        import logging

        seen = []

        class Grab(logging.Handler):
            def emit(self, rec):
                seen.append(rec.getMessage())

        root = logging.getLogger()
        h = Grab()
        root.addHandler(h)
        old = root.level
        root.setLevel(logging.DEBUG)
        try:
            hd = {"Content-Type": "application/json", "Cookie": self.login()}
            body = json.dumps({"text": "debug password=zebra-pw-12345 please"}).encode()
            st, _, out = self.req("POST", "/api/optimize", body, hd)
        finally:
            root.removeHandler(h)
            root.setLevel(old)
        self.assertEqual(st, 200)
        self.assertNotIn(b"zebra-pw-12345", out)
        self.assertFalse([m for m in seen if "zebra" in m])

    def test_show_prompts_setting_roundtrip(self):
        hd = {"Content-Type": "application/json", "Cookie": self.login()}
        self.assertEqual(self.req("POST", "/api/settings", json.dumps({"show_prompts": True}).encode(), hd)[0], 200)
        st, _, body = self.req("GET", "/api/data", headers={"Cookie": hd["Cookie"]})
        self.assertTrue(json.loads(body)["prompt_review"]["enabled"])
        self.assertEqual(self.req("POST", "/api/settings", json.dumps({"show_prompts": "yes"}).encode(), hd)[0], 400)
        self.req("POST", "/api/settings", json.dumps({"show_prompts": False}).encode(), hd)



    def test_path_traversal_not_served(self):
        for p in ("/../server.py", "/..%2fserver.py", "/web/../server.py", "/etc/passwd"):
            self.assertEqual(self.req("GET", p)[0], 404, p)

    def test_form_login_with_same_origin_header_succeeds(self):
        self.state.failures = 0
        self.state.locked_until = 0
        st, h, _ = self.req("POST", "/login", f"code={self.state.code}".encode(),
                            {"Content-Type": "application/x-www-form-urlencoded",
                             "Origin": f"http://localhost:{self.port}"},
                            host=f"localhost:{self.port}")
        self.assertEqual(st, 303)
        self.assertEqual(h["referrer-policy"], "same-origin")

    def test_rejected_post_does_not_leak_body_or_desync_connection(self):
        import logging
        import socket

        records = []

        class Grab(logging.Handler):
            def emit(self, rec):
                records.append(rec.getMessage())

        lg = logging.getLogger("bob-analytics")
        lg.setLevel(logging.INFO)
        grab = Grab()
        lg.addHandler(grab)
        try:
            body = b"code=SECRETCODE123"
            s = socket.create_connection(("127.0.0.1", self.port), timeout=2)
            s.sendall(b"POST /login HTTP/1.1\r\nHost: localhost:%d\r\nOrigin: null\r\n"
                      b"Content-Type: application/x-www-form-urlencoded\r\nContent-Length: %d\r\n\r\n"
                      % (self.port, len(body)) + body)
            def read_response():
                buf = b""
                while b"\r\n\r\n" not in buf:
                    buf += s.recv(4096)
                head, _, rest = buf.partition(b"\r\n\r\n")
                length = int([ln.split(b":")[1] for ln in head.split(b"\r\n")
                              if ln.lower().startswith(b"content-length")][0])
                while len(rest) < length:
                    rest += s.recv(4096)
                return head.split(b"\r\n")[0]

            first = read_response()
            s.sendall(b"GET /style.css HTTP/1.1\r\nHost: localhost:%d\r\n\r\n" % self.port)
            second = read_response()
            s.close()
        finally:
            lg.removeHandler(grab)
        self.assertIn(b"403", first)
        self.assertIn(b"200", second)  # same connection is still in sync
        self.assertFalse(any("SECRETCODE123" in r for r in records))

    def test_binds_to_loopback_only(self):
        self.assertEqual(self.httpd.server_address[0], "127.0.0.1")
        self.assertEqual(server.HOST, "127.0.0.1")

    def test_service_token_authenticates_server_to_server(self):
        good = {"X-Bob-Service-Token": self.state.code}
        self.assertEqual(self.req("GET", "/api/data", headers=good)[0], 200)
        self.assertEqual(self.req("GET", "/api/data", headers={"X-Bob-Service-Token": "wrong"})[0], 401)
        self.assertEqual(self.req("GET", "/api/data", host="evil.example", headers=good)[0], 403)

    def test_as_of_query_is_validated(self):
        good = {"X-Bob-Service-Token": self.state.code}
        self.assertEqual(self.req("GET", "/api/data?as_of=2026-10-25", headers=good)[0], 200)
        for bad in ("nope", "2026-13-40", "", "../../etc"):
            st, _, body = self.req("GET", f"/api/data?as_of={bad}", headers=good)
            self.assertEqual(st, 400, bad)
            self.assertNotIn(b"Traceback", body)

    def test_short_launcher_code_is_rejected(self):
        import os
        old = os.environ.get("BOB_ACCESS_CODE")
        os.environ["BOB_ACCESS_CODE"] = "short"
        try:
            with self.assertRaises(SystemExit):
                server._initial_code()
        finally:
            if old is None:
                del os.environ["BOB_ACCESS_CODE"]
            else:
                os.environ["BOB_ACCESS_CODE"] = old




if __name__ == "__main__":
    unittest.main()
