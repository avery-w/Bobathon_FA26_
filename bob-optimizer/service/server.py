"""Local web server for the personal Bob analytics dashboard.

Binds to 127.0.0.1 only. Access requires a one-time code printed in the terminal.
Data never leaves this machine; the server makes no outbound connections.
"""

import argparse
import datetime as dt
import hmac
import json
import logging
import os
import secrets
import threading
import time
import webbrowser
from http import cookies
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import analytics

HOST = "127.0.0.1"
APP_DIR = Path(__file__).resolve().parent
WEB_DIR = APP_DIR / "web"
DEFAULT_CONFIG_PATH = Path("~/.bob-dashboard/config.json").expanduser()
COOKIE_NAME = "bobdash"
SESSION_SECONDS = 8 * 3600
MAX_BODY = 65536  # fits a prompt of MAX_PROMPT_CHARS even when JSON-escaped
SETTING_KEYS = ("reset_day", "monthly_budget", "cost_multiplier", "show_prompt_snippets", "show_prompts")
MAX_FAILURES = 5
LOCKOUT_SECONDS = 60

STATIC = {
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
}

CSP = (
    "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    "connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
)

log = logging.getLogger("bob-analytics")


def _initial_code():
    """Use the launcher-provided code (shared with the web app) or generate a fresh one."""
    supplied = os.environ.get("BOB_ACCESS_CODE", "")
    if supplied:
        if len(supplied) < 16:
            raise SystemExit("BOB_ACCESS_CODE must be at least 16 characters")
        return supplied
    return secrets.token_urlsafe(18)


class State:
    def __init__(self, config_path):
        self.config_path = Path(config_path)
        self.lock = threading.Lock()
        self.cfg = analytics.load_config(self.config_path)
        self.code = _initial_code()
        self.sessions = {}
        self.failures = 0
        self.locked_until = 0.0

    def new_session(self):
        sid = secrets.token_urlsafe(32)
        with self.lock:
            now = time.time()
            self.sessions = {k: v for k, v in self.sessions.items() if v > now}
            self.sessions[sid] = now + SESSION_SECONDS
        return sid

    def valid_session(self, sid):
        if not sid:
            return False
        with self.lock:
            exp = self.sessions.get(sid)
            if exp is None or exp < time.time():
                self.sessions.pop(sid, None)
                return False
            return True

    def check_code(self, supplied):
        with self.lock:
            now = time.time()
            if now < self.locked_until:
                return "locked"
            if hmac.compare_digest(supplied.encode("utf-8"), self.code.encode("utf-8")):
                self.failures = 0
                return "ok"
            self.failures += 1
            if self.failures >= MAX_FAILURES:
                self.failures = 0
                self.locked_until = now + LOCKOUT_SECONDS
                return "locked"
            return "bad"

    def save_settings(self, updates):
        with self.lock:
            merged = dict(self.cfg)
            merged.update(updates)
            analytics._validate_config(merged)
            self.config_path.parent.mkdir(parents=True, exist_ok=True)
            os.chmod(self.config_path.parent, 0o700)
            tmp = self.config_path.with_suffix(".tmp")
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(merged, fh, indent=2)
            os.replace(tmp, self.config_path)
            self.cfg = merged
            return dict(merged)


def make_handler(state, allowed_hosts):
    class Handler(BaseHTTPRequestHandler):
        server_version = "BobAnalytics"
        sys_version = ""
        protocol_version = "HTTP/1.1"

        def log_message(self, fmt, *args):  # never log paths, queries, or bodies
            if self.command in ("GET", "POST"):
                log.info("%s %s", self.command, self.path.split("?", 1)[0])

        # ---- helpers
        def _send(self, status, body, ctype, extra=None):
            if isinstance(body, str):
                body = body.encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Security-Policy", CSP)
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "same-origin")
            self.send_header("Cross-Origin-Resource-Policy", "same-origin")
            self.send_header("X-Frame-Options", "DENY")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def _json(self, status, obj):
            self._send(status, json.dumps(obj), "application/json; charset=utf-8")

        def _host_ok(self):
            return self.headers.get("Host", "") in allowed_hosts

        def _origin_ok(self):
            origin = self.headers.get("Origin")
            if origin is None:
                return True
            return origin in {"http://" + h for h in allowed_hosts}

        def _authed(self):
            # The web app authenticates server-to-server with the shared access code.
            token = self.headers.get("X-Bob-Service-Token")
            if token and hmac.compare_digest(token.encode("utf-8"), state.code.encode("utf-8")):
                return True
            raw = self.headers.get("Cookie")
            if not raw:
                return False
            try:
                jar = cookies.SimpleCookie(raw)
            except cookies.CookieError:
                return False
            morsel = jar.get(COOKIE_NAME)
            return bool(morsel and state.valid_session(morsel.value))

        def _login_page(self, message="", status=200):
            html = (WEB_DIR / "login.html").read_text(encoding="utf-8").replace("{{MESSAGE}}", message)
            self._send(status, html, "text/html; charset=utf-8")

        def _read_body(self):
            try:
                n = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                n = -1
            if n < 0 or n > MAX_BODY:
                # Body is left unread, so the connection must not be reused.
                self.close_connection = True
                return None
            return self.rfile.read(n)

        # ---- routes
        def do_GET(self):
            if not self._host_ok():
                return self._json(403, {"error": "Forbidden"})
            path = self.path.split("?", 1)[0]
            if path == "/":
                if not self._authed():
                    return self._login_page()
                return self._send(200, (WEB_DIR / "index.html").read_bytes(), "text/html; charset=utf-8")
            if path in STATIC:
                name, ctype = STATIC[path]
                return self._send(200, (WEB_DIR / name).read_bytes(), ctype)
            if path == "/api/data":
                if not self._authed():
                    return self._json(401, {"error": "Not signed in"})
                as_of = None
                raw_date = (parse_qs(urlparse(self.path).query, keep_blank_values=True).get("as_of") or [None])[0]
                if raw_date is not None:
                    try:
                        as_of = dt.date.fromisoformat(raw_date)
                    except ValueError:
                        return self._json(400, {"error": "Invalid date"})
                    if as_of >= dt.date.today():
                        as_of = None
                with state.lock:
                    cfg = dict(state.cfg)
                try:
                    return self._json(200, analytics.analyze(cfg, as_of=as_of))
                except FileNotFoundError:
                    return self._json(404, {"error": "Bob database not found. Check db_path in settings."})
                except Exception:
                    log.exception("analysis failed")
                    return self._json(500, {"error": "Could not read Bob data"})
            if path == "/api/settings":
                if not self._authed():
                    return self._json(401, {"error": "Not signed in"})
                with state.lock:
                    cfg = {k: state.cfg[k] for k in SETTING_KEYS}
                return self._json(200, cfg)
            return self._json(404, {"error": "Not found"})

        def do_POST(self):
            # Always consume the body first so a rejected request cannot desync a kept-alive connection.
            body = self._read_body()
            if body is None:
                return self._json(400, {"error": "Invalid request"})
            if not self._host_ok() or not self._origin_ok():
                return self._json(403, {"error": "Forbidden"})
            path = self.path.split("?", 1)[0]
            if path == "/login":
                from urllib.parse import parse_qs

                fields = parse_qs(body.decode("utf-8", "replace"))
                supplied = (fields.get("code") or [""])[0].strip()
                result = state.check_code(supplied)
                if result == "ok":
                    sid = state.new_session()
                    cookie = f"{COOKIE_NAME}={sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_SECONDS}"
                    return self._send(303, b"", "text/plain", {"Location": "/", "Set-Cookie": cookie})
                if result == "locked":
                    return self._login_page("Too many attempts. Wait a minute and try again.", 429)
                return self._login_page("That code is not correct.", 401)
            if path == "/api/settings":
                if not self._authed():
                    return self._json(401, {"error": "Not signed in"})
                if not self.headers.get("Content-Type", "").startswith("application/json"):
                    return self._json(415, {"error": "Invalid request"})
                try:
                    data = json.loads(body)
                    if not isinstance(data, dict):
                        raise ValueError
                    updates = {k: data[k] for k in SETTING_KEYS if k in data}
                    state.save_settings(updates)
                except (ValueError, TypeError):
                    return self._json(400, {"error": "Invalid settings"})
                except OSError:
                    log.exception("could not save settings")
                    return self._json(500, {"error": "Could not save settings"})
                return self._json(200, {"ok": True})
            if path == "/api/optimize":
                if not self._authed():
                    return self._json(401, {"error": "Not signed in"})
                if not self.headers.get("Content-Type", "").startswith("application/json"):
                    return self._json(415, {"error": "Invalid request"})
                try:
                    data = json.loads(body)
                    text = data.get("text") if isinstance(data, dict) else None
                    if not isinstance(text, str):
                        raise ValueError
                except (ValueError, TypeError):
                    return self._json(400, {"error": "Invalid request"})
                try:
                    # The prompt is analysed in memory only: never logged, stored, or sent anywhere.
                    return self._json(200, analytics.analyze_prompt(text))
                except Exception:
                    log.error("prompt analysis failed")
                    return self._json(500, {"error": "Could not analyse prompt"})
            return self._json(404, {"error": "Not found"})

    return Handler


def main():
    parser = argparse.ArgumentParser(description="Personal Bob analytics dashboard (local only)")
    parser.add_argument("--config", default=str(DEFAULT_CONFIG_PATH), help="path to config.json")
    parser.add_argument("--no-browser", action="store_true", help="do not open a browser window")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    state = State(args.config)
    port = state.cfg["port"]
    env_port = os.environ.get("BOB_SERVICE_PORT", "")
    if env_port:
        if not env_port.isdigit() or not 1024 <= int(env_port) <= 65535:
            raise SystemExit("BOB_SERVICE_PORT must be a number from 1024 to 65535")
        port = int(env_port)
    allowed_hosts = {f"{HOST}:{port}", f"localhost:{port}"}
    httpd = ThreadingHTTPServer((HOST, port), make_handler(state, allowed_hosts))
    httpd.timeout = 30

    url = f"http://localhost:{port}/"
    print(f"\nBob Analytics is running at {url}", flush=True)
    if "BOB_ACCESS_CODE" in os.environ:
        print("Access code: supplied by BOB_ACCESS_CODE\n", flush=True)
    else:
        print(f"Access code (valid until you stop the server): {state.code}\n", flush=True)
    print("Press Ctrl+C to stop.", flush=True)
    if not args.no_browser:
        threading.Timer(0.5, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
