import datetime as dt
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import analytics  # noqa: E402

D = dt.date


def ms(y, m, d, hh=12):
    return int(dt.datetime(y, m, d, hh).timestamp() * 1000)


def cfg(**kw):
    c = dict(analytics.DEFAULT_CONFIG)
    c.update(kw)
    return c


def make_db(path, tasks, messages):
    con = sqlite3.connect(path)
    con.executescript(
        """
        CREATE TABLE tasks (id TEXT PRIMARY KEY, project_id TEXT, parent_id TEXT, title TEXT,
            status TEXT, first_message TEXT, directory TEXT, costs TEXT, created_at INTEGER,
            updated_at INTEGER, task_type TEXT);
        CREATE TABLE messages (id TEXT PRIMARY KEY, task_id TEXT, role TEXT, data TEXT, created_at INTEGER);
        """
    )
    for t in tasks:
        con.execute(
            "INSERT INTO tasks (id, project_id, parent_id, costs, created_at, updated_at, task_type) VALUES (?,?,?,?,?,?,?)",
            (t["id"], t.get("project_id", "file:/tmp/proj"), t.get("parent_id"),
             json.dumps(t.get("costs", {})), t["created_at"], t.get("updated_at", t["created_at"]),
             t.get("task_type", "normal")),
        )
    for i, m in enumerate(messages):
        con.execute("INSERT INTO messages VALUES (?,?,?,?,?)", (f"m{i}", m["task_id"], m["role"], json.dumps(m["data"]), m["ts"]))
    con.commit()
    con.close()


def user_msg(task, ts, text, mode="agent"):
    return {"task_id": task, "role": "user", "ts": ts, "data": {"content": text, "_meta": {"mode": {"id": mode}}}}


def asst_msg(task, ts, cost, stop=None):
    meta = {"spend": {"cost": cost, "contextTokens": 10}}
    if stop:
        meta["stopReason"] = stop
    return {"task_id": task, "role": "assistant", "ts": ts, "data": {"content": "", "_meta": meta}}


def tool_msg(task, ts, name, error=False, content="ok"):
    return {"task_id": task, "role": "tool", "ts": ts,
            "data": {"content": content, "toolUsage": {"signature": {"name": name, "isError": error}}}}


class CycleTests(unittest.TestCase):
    def test_cycle_start_default_reset(self):
        self.assertEqual(analytics.cycle_start(D(2026, 10, 26), 1), D(2026, 10, 1))

    def test_cycle_start_before_reset_day_uses_previous_month(self):
        self.assertEqual(analytics.cycle_start(D(2026, 10, 10), 15), D(2026, 9, 15))
        self.assertEqual(analytics.cycle_start(D(2026, 1, 3), 15), D(2025, 12, 15))

    def test_reset_day_clamps_to_short_month(self):
        self.assertEqual(analytics.cycle_start(D(2026, 2, 28), 31), D(2026, 2, 28))
        self.assertEqual(analytics.next_cycle_start(D(2026, 1, 31), 31), D(2026, 2, 28))
        self.assertEqual(analytics.next_cycle_start(D(2026, 12, 15), 15), D(2027, 1, 15))

    def test_reset_on_today_starts_new_cycle(self):
        self.assertEqual(analytics.cycle_start(D(2026, 10, 15), 15), D(2026, 10, 15))


class ConfigTests(unittest.TestCase):
    def test_defaults_valid(self):
        analytics._validate_config(dict(analytics.DEFAULT_CONFIG))

    def test_rejects_bad_values(self):
        for bad in (
            {"reset_day": 0}, {"reset_day": 32}, {"reset_day": True}, {"reset_day": 1.5},
            {"monthly_budget": 0}, {"monthly_budget": -5}, {"monthly_budget": "40"},
            {"cost_multiplier": 0}, {"cost_multiplier": True}, {"port": 80}, {"port": 70000},
            {"show_prompt_snippets": "yes"}, {"db_path": ""},
        ):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    analytics._validate_config(cfg(**bad))

    def test_load_ignores_unknown_keys_and_missing_file(self):
        with tempfile.TemporaryDirectory() as td:
            p = Path(td) / "c.json"
            self.assertEqual(analytics.load_config(p)["reset_day"], 1)
            p.write_text(json.dumps({"reset_day": 9, "evil": "x"}))
            c = analytics.load_config(p)
            self.assertEqual(c["reset_day"], 9)
            self.assertNotIn("evil", c)
            p.write_text("[]")
            with self.assertRaises(ValueError):
                analytics.load_config(p)

class AnalyzerTests(unittest.TestCase):
    def test_vague_prompt_gets_placeholders(self):
        r = analytics.analyze_prompt("make it better")
        ids = [i["id"] for i in r["issues"]]
        for want in ("too_short", "missing_context", "missing_goal", "missing_format"):
            self.assertIn(want, ids)
        self.assertIn("make it better", r["suggested"])
        self.assertIn("[file]", r["suggested"])
        self.assertLess(r["score"], 50)

    def test_strong_prompt_needs_no_rewrite(self):
        text = ("In @src/app.py the login() function raises KeyError. I want it to return a 401 instead, "
                "so that clients can retry. Return a diff only.")
        r = analytics.analyze_prompt(text)
        self.assertEqual(r["issues"], [])
        self.assertEqual(r["suggested"], "")
        self.assertEqual(r["score"], 100)

    def test_numbered_steps_toward_one_goal_are_not_split(self):
        text = ("Step 1: define the cache key in @src/cache.py\nStep 2: add expiry\n3. write tests\n"
                "4. update the docs, so that lookups are faster. Return a diff.")
        f = analytics.prompt_features(text)
        self.assertTrue(f["single_objective"])
        r = analytics.analyze_prompt(text)
        self.assertNotIn("multi_objective", [i["id"] for i in r["issues"]])
        self.assertTrue(r["stepwise"])

    def test_numbered_list_without_step_label_is_still_flagged(self):
        text = "1. fix the bug in a.py\n2. add tests\n3. update the docs\n4. rename the module"
        self.assertFalse(analytics.prompt_features(text)["single_objective"])
        self.assertFalse(analytics.analyze_prompt(text)["stepwise"])

    def test_every_issue_has_source_and_reason(self):
        text = "1. fix\n2. add\n3. update\n4. rename style " + "x" * 4000 + " password=abcd1234"
        r = analytics.analyze_prompt(text)
        self.assertGreaterEqual(len(r["issues"]), 5)
        for i in r["issues"]:
            self.assertIn(i["source"], analytics.SOURCE_LABELS)
            self.assertEqual(i["source_label"], analytics.SOURCE_LABELS[i["source"]])
            self.assertTrue(i["why"])
        for iid, (source, why) in analytics.ISSUE_META.items():
            self.assertIn(source, analytics.SOURCE_LABELS, iid)
            self.assertTrue(why, iid)

    def test_example_tip_only_when_style_requested_without_example(self):
        ids = lambda t: [i["id"] for i in analytics.analyze_prompt(t)["issues"]]
        self.assertIn("add_example", ids("Write the docstrings in the same format as the rest of the module"))
        self.assertNotIn("add_example", ids("Write docstrings in the same format, for example: Args: x (int): the value"))
        self.assertNotIn("add_example", ids("make it better"))
        r = analytics.analyze_prompt("Write the docstrings in the same format as the rest of the module")
        self.assertIn("Example:", r["suggested"])
        before = analytics.prompt_features("Write the docstrings in the same format as the rest of the module")["quality"]
        self.assertEqual(r["score"], round(100 * before))

    def test_multi_objective_is_split(self):
        text = "1. fix the bug in a.py\n2. add tests\n3. update the docs\n4. then refactor the module"
        r = analytics.analyze_prompt(text)
        self.assertIn("multi_objective", [i["id"] for i in r["issues"]])
        self.assertIn("send separately", r["suggested"])

    def test_secrets_are_detected_and_redacted(self):
        samples = [
            "key AKIAIOSFODNN7EXAMPLE here",
            "token ghp_" + "a" * 36,
            "sk-" + "b" * 30,
            "password = 'hunter2hunter2'",
            "postgres://admin:s3cretpw@db.example.com/x",
            "Authorization: Bearer abcdefghijklmnop1234",
            "-----BEGIN RSA PRIVATE KEY-----",
        ]
        for s in samples:
            self.assertTrue(analytics.has_secret(s), s)
            r = analytics.analyze_prompt(s)
            self.assertIn("secret", [i["id"] for i in r["issues"]], s)
            self.assertIn("[REDACTED]", r["redacted"], s)
        r = analytics.analyze_prompt(samples[3])
        self.assertNotIn("hunter2", json.dumps(r))
        self.assertFalse(analytics.has_secret("explain how passwords are hashed"))

    def test_input_is_capped_and_hostile_input_is_fast(self):
        import time

        big = "a" * 500_000
        t0 = time.time()
        r = analytics.analyze_prompt(big)
        analytics.analyze_prompt("password" + " " * 200_000 + "x" * 50_000)
        analytics.analyze_prompt("sk-" + "a" * 100_000)
        self.assertLess(time.time() - t0, 3)
        self.assertTrue(r["truncated"])
        self.assertEqual(r["chars"], analytics.MAX_PROMPT_CHARS)

    def test_bad_input_types(self):
        for v in (None, 5, ["x"], ""):
            r = analytics.analyze_prompt(v)
            self.assertEqual(r["suggested"], "")




class PromptTests(unittest.TestCase):
    def test_vague_prompt_scores_low(self):
        self.assertLessEqual(analytics.prompt_features("fix it")["quality"], 0.5)

    def test_good_prompt_scores_high(self):
        f = analytics.prompt_features(
            "In @src/app.py the login handler throws a KeyError. I want it fixed so that "
            "missing fields return a 400. Return a short summary of the change."
        )
        self.assertEqual(f["quality"], 1.0)

    def test_multi_objective_detected(self):
        t = "1. add tests\n2. refactor the module\n3. update docs\n and then deploy it, also rename things"
        self.assertFalse(analytics.prompt_features(t)["single_objective"])

    def test_empty_prompt_safe(self):
        self.assertEqual(analytics.prompt_features("")["has_context"], False)
        self.assertEqual(analytics.prompt_features(None)["quality"], 0.25)


class ComputeTests(unittest.TestCase):
    TODAY = D(2026, 10, 26)

    def run_compute(self, tasks, messages, **kw):
        with tempfile.TemporaryDirectory() as td:
            p = str(Path(td) / "bob.db")
            make_db(p, tasks, messages)
            t, m = analytics.read_db(p)
            return analytics.compute(t, m, cfg(**kw), today=self.TODAY)

    def test_empty_database(self):
        r = self.run_compute([], [])
        self.assertEqual(r["totals"]["cost"], 0)
        self.assertIsNone(r["efficiency"]["score"])
        self.assertEqual(r["cycle"]["status"], "no_budget")
        self.assertEqual(r["recommendations"][0]["id"], "not_enough_data")
        self.assertEqual(r["cycle"]["days_total"], 31)

    def test_cost_attribution_and_cycles(self):
        tasks = [
            {"id": "a", "project_id": "file:/work/alpha", "created_at": ms(2026, 9, 20), "updated_at": ms(2026, 9, 20),
             "costs": {"cost": 1.0}},
            {"id": "b", "project_id": "file:/work/beta", "created_at": ms(2026, 10, 25), "updated_at": ms(2026, 10, 25),
             "costs": {"cost": 3.0}},
        ]
        msgs = [
            user_msg("a", ms(2026, 9, 20), "x"), asst_msg("a", ms(2026, 9, 20), 1.0),
            user_msg("b", ms(2026, 10, 25), "x"), asst_msg("b", ms(2026, 10, 25), 2.0),
        ]
        r = self.run_compute(tasks, msgs)
        self.assertAlmostEqual(r["totals"]["cost"], 4.0)  # b's 1.0 residual is attributed, not lost
        self.assertAlmostEqual(r["cycle"]["spent"], 3.0)
        by_label = {c["label"]: c["cost"] for c in r["cycles"]}
        self.assertAlmostEqual(by_label["Sep 2026"], 1.0)
        self.assertAlmostEqual(by_label["Oct 2026"], 3.0)
        folders = {f["folder"]: f["cost"] for f in r["folders"]}
        self.assertAlmostEqual(folders["/work/beta"], 3.0)

    def test_no_double_count_when_message_spend_matches_task_cost(self):
        tasks = [{"id": "a", "created_at": ms(2026, 10, 25), "costs": {"cost": 2.0}}]
        msgs = [user_msg("a", ms(2026, 10, 25), "x"), asst_msg("a", ms(2026, 10, 25), 2.0)]
        self.assertAlmostEqual(self.run_compute(tasks, msgs)["totals"]["cost"], 2.0)

    def test_subagent_cost_rolls_into_parent_and_is_not_a_conversation(self):
        tasks = [
            {"id": "p", "created_at": ms(2026, 10, 25), "costs": {"cost": 1.0}},
            {"id": "s", "parent_id": "p", "task_type": "subagent", "created_at": ms(2026, 10, 25), "costs": {"cost": 0.5}},
        ]
        msgs = [user_msg("p", ms(2026, 10, 25), "x"), asst_msg("p", ms(2026, 10, 25), 1.0)]
        r = self.run_compute(tasks, msgs)
        self.assertEqual(r["totals"]["conversations"], 1)
        self.assertAlmostEqual(r["totals"]["cost"], 1.5)
        self.assertAlmostEqual(r["top_conversations"][0]["cost"], 1.5)

    def test_cost_multiplier(self):
        tasks = [{"id": "a", "created_at": ms(2026, 10, 25), "costs": {"cost": 1.0}}]
        msgs = [user_msg("a", ms(2026, 10, 25), "x"), asst_msg("a", ms(2026, 10, 25), 1.0)]
        self.assertAlmostEqual(self.run_compute(tasks, msgs, cost_multiplier=10)["totals"]["cost"], 10.0)

    def test_budget_projection_and_run_out(self):
        tasks = [{"id": "a", "created_at": ms(2026, 10, 2), "costs": {"cost": 26.0}}]
        msgs = [user_msg("a", ms(2026, 10, 2), "x"), asst_msg("a", ms(2026, 10, 2), 26.0)]
        r = self.run_compute(tasks, msgs, monthly_budget=40)
        c = r["cycle"]
        self.assertEqual(c["days_elapsed"], 26)
        self.assertAlmostEqual(c["avg_daily"], 1.0)
        self.assertAlmostEqual(c["projected"], 31.0)
        self.assertEqual(c["status"], "on_track")
        r2 = self.run_compute(tasks, msgs, monthly_budget=20)
        self.assertEqual(r2["cycle"]["status"], "exceeded")
        self.assertIn("budget_exceeded", [x["id"] for x in r2["recommendations"]])
        r3 = self.run_compute(tasks, msgs, monthly_budget=28)
        self.assertEqual(r3["cycle"]["status"], "over_pace")
        self.assertIsNotNone(r3["cycle"]["run_out_date"])

    def test_outcomes_and_tool_errors(self):
        t = ms(2026, 10, 20)
        tasks = [{"id": i, "created_at": t, "costs": {"cost": 0.1}} for i in ("one", "multi", "cancel")]
        msgs = [
            user_msg("one", t, "do thing"), asst_msg("one", t + 1, 0.1),
            user_msg("multi", t, "a"), asst_msg("multi", t + 1, 0.05), user_msg("multi", t + 2, "b"), asst_msg("multi", t + 3, 0.05),
            user_msg("cancel", t, "a"), asst_msg("cancel", t + 1, 0.1, stop="user_cancelled"),
            tool_msg("one", t, "execute_command", error=True, content="Exit code 127"),
            tool_msg("one", t, "ask_followup_question", error=True, content="Tool call to ask_followup_question was cancelled."),
        ]
        r = self.run_compute(tasks, msgs)
        o = r["outcomes"]["totals"]
        self.assertEqual((o["one_shot"], o["multi_turn"], o["cancelled"]), (1, 1, 1))
        m = r["efficiency"]["metrics"]
        self.assertAlmostEqual(m["tool_error_rate"], 0.5)  # only the real failure counts
        self.assertEqual(m["questions_dismissed"], 1)

    def test_malformed_message_rows_are_skipped(self):
        tasks = [{"id": "a", "created_at": ms(2026, 10, 25), "costs": {"cost": 1.0}}]
        with tempfile.TemporaryDirectory() as td:
            p = str(Path(td) / "bob.db")
            make_db(p, tasks, [user_msg("a", ms(2026, 10, 25), "hello")])
            con = sqlite3.connect(p)
            con.execute("INSERT INTO messages VALUES ('x','a','assistant','not json',1)")
            con.execute("INSERT INTO messages VALUES ('y','a','assistant','[1,2]',2)")
            con.execute("INSERT INTO messages VALUES ('z','a','assistant','{\"_meta\":{\"spend\":{\"cost\":\"nan\"}}}',3)")
            con.commit()
            con.close()
            t, m = analytics.read_db(p)
            r = analytics.compute(t, m, cfg(), today=self.TODAY)
        self.assertAlmostEqual(r["totals"]["cost"], 1.0)

    def test_heavy_and_unused_mcp_recommendations(self):
        t = ms(2026, 10, 20)
        costs = {"cost": 1.0, "contextTokens": 150000,
                 "contextWindowBreakdown": {"breakdown": {"mcpToolDefinitions": 4000, "projectRules": 4000}}}
        tasks = [{"id": i, "created_at": t, "costs": costs} for i in "abc"]
        msgs = []
        for i in "abc":
            msgs += [user_msg(i, t, "fix it"), asst_msg(i, t + 1, 1.0)]
        ids = [x["id"] for x in self.run_compute(tasks, msgs)["recommendations"]]
        for want in ("long_conversations", "unused_mcp", "heavy_rules", "missing_context"):
            self.assertIn(want, ids)

    def test_snippets_hidden_by_default(self):
        tasks = [{"id": "a", "created_at": ms(2026, 10, 25), "costs": {"cost": 1.0}}]
        msgs = [user_msg("a", ms(2026, 10, 25), "zebrafish prompt text"), asst_msg("a", ms(2026, 10, 25), 1.0)]
        self.assertNotIn("zebrafish", json.dumps(self.run_compute(tasks, msgs)))
        shown = self.run_compute(tasks, msgs, show_prompt_snippets=True)
        self.assertIn("zebrafish prompt text", json.dumps(shown))

    def _convo(self, n, prompts, day=25, cost=1.0):
        task = {"id": n, "created_at": ms(2026, 10, day), "costs": {"cost": cost}}
        msgs = []
        for i, p in enumerate(prompts):
            msgs.append(user_msg(n, ms(2026, 10, day, 9 + i), p))
        msgs.append(asst_msg(n, ms(2026, 10, day, 9), cost))
        return task, msgs

    def test_prompt_review_is_opt_in_and_redacted(self):
        t, m = self._convo("a", ["fix it password=hunter2xyz"])
        off = self.run_compute([t], m)
        self.assertEqual(off["prompt_review"], {"enabled": False, "items": []})
        self.assertNotIn("hunter2xyz", json.dumps(off))
        on = self.run_compute([t], m, show_prompts=True)
        self.assertTrue(on["prompt_review"]["enabled"])
        item = on["prompt_review"]["items"][0]
        self.assertNotIn("hunter2xyz", json.dumps(on))
        self.assertIn("secret", [i["id"] for i in item["issues"]])
        self.assertTrue(item["suggested"])

    def test_hygiene_and_repeats(self):
        tasks, msgs = [], []
        for i in range(3):
            t, m = self._convo(f"c{i}", ["please summarise the changes"], day=20 + i)
            tasks.append(t)
            msgs += m
        t, m = self._convo("s", ["token: abcd1234efgh"], day=24)
        tasks.append(t)
        msgs += m
        r = self.run_compute(tasks, msgs)
        self.assertEqual(r["hygiene"]["prompts_with_secrets"], 1)
        self.assertEqual(r["hygiene"]["repeated"][0]["count"], 3)
        self.assertNotIn("summarise", json.dumps(r["hygiene"]))
        ids = [x["id"] for x in r["recommendations"]]
        self.assertIn("repeated_prompts", ids)
        self.assertIn("secrets_in_prompts", ids)

    def test_habits_streaks_and_gap(self):
        t1, m1 = self._convo("a", ["one", "two"], day=24)
        m1.append(user_msg("a", ms(2026, 10, 26, 9), "three"))
        t2, m2 = self._convo("b", ["x"], day=25)
        r = self.run_compute([t1, t2], m1 + m2)
        h = r["habits"]
        self.assertEqual(h["active_days"], 3)
        self.assertEqual(h["longest_streak"], 3)
        self.assertEqual(h["current_streak"], 3)
        self.assertEqual(h["resumed_after_gap"], 1)
        self.assertEqual(sum(sum(row) for row in h["heatmap"]), 4)

    def test_comparison_with_previous_cycle(self):
        old_t = {"id": "o", "created_at": ms(2026, 9, 3), "costs": {"cost": 2.0}}
        old_m = [user_msg("o", ms(2026, 9, 3), "hi"), asst_msg("o", ms(2026, 9, 3), 2.0)]
        new_t, new_m = self._convo("n", ["hi"], day=3, cost=5.0)
        r = self.run_compute([old_t, new_t], old_m + new_m)
        c = r["comparison"]
        self.assertAlmostEqual(c["same_point"], 2.0)
        self.assertAlmostEqual(c["spent"], 5.0)
        self.assertAlmostEqual(c["delta_pct"], 1.5)
        self.assertEqual(c["prev_label"], "Sep 2026")

    def test_many_turns_recommendation_is_framed_as_cost_signal(self):
        tasks, msgs = [], []
        for n in range(3):
            t, m = self._convo(f"t{n}", [f"follow up {i}" for i in range(8)], day=20 + n)
            tasks.append(t)
            msgs += m
        recs = {x["id"]: x for x in self.run_compute(tasks, msgs)["recommendations"]}
        self.assertIn("many_turns", recs)
        self.assertIn("not a flaw", recs["many_turns"]["title"])
        self.assertIn("on purpose", recs["many_turns"]["action"])




class ReadTests(unittest.TestCase):
    def test_missing_db(self):
        with self.assertRaises(FileNotFoundError):
            analytics.read_db("/nonexistent/bob.db")

    def test_database_is_opened_read_only(self):
        with tempfile.TemporaryDirectory() as td:
            p = str(Path(td) / "bob.db")
            make_db(p, [], [])
            # Path with a space and special chars must still work
            q = Path(td) / "dir with space#"
            q.mkdir()
            (q / "bob.db").write_bytes(Path(p).read_bytes())
            analytics.read_db(str(q / "bob.db"))

    def test_folder_names(self):
        home = str(Path.home())
        self.assertEqual(analytics._folder(f"file:{home}/proj"), "~/proj")
        self.assertEqual(analytics._folder("file:/other/x"), "/other/x")
        self.assertEqual(analytics._folder(None), "(unknown)")


if __name__ == "__main__":
    unittest.main()
