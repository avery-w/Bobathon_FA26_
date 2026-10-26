"""Personal Bob analytics.

Reads Bob's local SQLite database (read-only) and computes spend, folder usage,
credit-cycle pacing, efficiency metrics, and best-practice recommendations.
Nothing is written, uploaded, or stored by this module.
"""

import calendar
import datetime as dt
import hashlib
import json
import re
import sqlite3
from collections import Counter, defaultdict
from pathlib import Path
from urllib.parse import quote

UNIT = "Bobcoins"

DEFAULT_CONFIG = {
    "db_path": "~/.bob/db/bob.db",
    "reset_day": 1,
    "monthly_budget": None,
    "cost_multiplier": 1.0,
    "port": 8765,
    "show_prompt_snippets": False,
    "show_prompts": False,
}

# Heuristic thresholds (documented in README).
MIN_PROMPT_CHARS = 60
LARGE_CONTEXT_TOKENS = 100_000
LONG_CONVERSATION_PROMPTS = 12
HEAVY_RULES_TOKENS = 2_500
REPEATED_TOOL_CALLS = 15
MULTI_OBJECTIVE_THRESHOLD = 4
REPEAT_MIN = 3
LARGE_PASTE_CHARS = 4_000
STALE_GAP_MS = 24 * 3_600_000
MAX_PROMPT_CHARS = 8_000  # longest prompt the optimizer accepts
REVIEW_LIMIT = 12

_FILE_RE = re.compile(
    r"(?:@\S+|\b[\w\-./]+\.(?:py|js|jsx|ts|tsx|java|go|rs|rb|php|c|cpp|h|cs|md|json|ya?ml|"
    r"toml|sql|html|css|sh|xml|cbl|cob|rpg)\b|(?:^|\s)~?/[\w.\-]+/[\w.\-/]+)",
    re.I,
)
_ERR_RE = re.compile(
    r"```|traceback|exception|stack ?trace|\berror\b|\bfailed\b|\bfailing\b", re.I
)
_GOAL_RE = re.compile(
    r"\b(so that|in order to|because|goal|objective|i want|i need|we need|should|must|needs? to)\b",
    re.I,
)
_FORMAT_RE = re.compile(
    r"\b(table|json|csv|bullet(?:s| list)?|markdown|summary|step[- ]by[- ]step|format|"
    r"return only|diagram|mermaid|one[- ]pager|code block|outline|diff|patch)\b",
    re.I,
)
_NUMBERED_RE = re.compile(r"(?m)^\s*\d+[.)]\s+")
# A numbered list that is announced as steps toward one goal is good practice (chain-of-thought
# style), so it is not counted as several separate tasks. "step by step" alone does not qualify.
_STEPWISE_RE = re.compile(
    r"\bstep\s*\d+\b|\b(?:follow|do|use|take) (?:these|the following|the) steps\b|"
    r"\b(?:these|following) steps\b|\bin (?:this )?order\b",
    re.I,
)
# Asking for a particular style or format is where an example helps most.
_STYLE_RE = re.compile(
    r"\b(style|tone|template|convention|naming|formatted like|same format|match the|consistent with)\b", re.I
)
_EXAMPLE_RE = re.compile(r"\b(for example|e\.g\.|example:|such as|like this|for instance|sample)\b|```", re.I)

SOURCE_LABELS = {
    "bob_docs": "Bob docs",
    "ibm_article": "IBM prompt engineering article",
    "heuristic": "My heuristic",
}
# Why each check exists and where it comes from. Numeric cut-offs and keyword lists are
# always this project's own defaults, even when the underlying advice is documented.
ISSUE_META = {
    "secret": ("heuristic", "Credentials pasted into a chat can leak. This is general security practice, not Bob guidance."),
    "too_short": ("ibm_article", "IBM article: the more detailed the instruction, the more likely the output meets expectations. The 60-character cut-off is my own default."),
    "missing_context": ("bob_docs", "Bob docs (Writing effective prompts): use @ mentions to reference specific files and code. Spotting a file or error is my keyword check."),
    "missing_goal": ("ibm_article", "IBM article: a prompt defines the task and sets the context. It does not mention goals, so treat this as a nudge."),
    "missing_format": ("ibm_article", "IBM article: a direct instruction works when the model knows the exact format and topic."),
    "multi_objective": ("bob_docs", "Bob docs: break complex tasks into smaller steps. IBM article: prompt chaining uses a chain of smaller prompts. Numbered steps toward one goal are fine."),
    "large_paste": ("bob_docs", "Bob docs: use direct file references, avoid giving Bob your whole codebase, and paste only the lines needed."),
    "add_example": ("bob_docs", "Bob docs: include examples when a specific format or style is required. IBM article: few-shot prompting. Optional and not scored."),
}
_CONJ_RE = re.compile(r"\b(?:and then|then|also|additionally|as well as|plus)\b", re.I)


# --------------------------------------------------------------------------- config
def load_config(path):
    cfg = dict(DEFAULT_CONFIG)
    p = Path(path)
    if p.exists():
        user = json.loads(p.read_text(encoding="utf-8"))
        if not isinstance(user, dict):
            raise ValueError("config must be a JSON object")
        cfg.update({k: v for k, v in user.items() if k in DEFAULT_CONFIG})
    _validate_config(cfg)
    return cfg


def _is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _validate_config(cfg):
    if not isinstance(cfg["db_path"], str) or not cfg["db_path"]:
        raise ValueError("db_path must be a non-empty string")
    rd = cfg["reset_day"]
    if not isinstance(rd, int) or isinstance(rd, bool) or not 1 <= rd <= 31:
        raise ValueError("reset_day must be an integer from 1 to 31")
    b = cfg["monthly_budget"]
    if b is not None and (not _is_num(b) or b <= 0):
        raise ValueError("monthly_budget must be null or a positive number")
    if not _is_num(cfg["cost_multiplier"]) or cfg["cost_multiplier"] <= 0:
        raise ValueError("cost_multiplier must be a positive number")
    port = cfg["port"]
    if not isinstance(port, int) or isinstance(port, bool) or not 1024 <= port <= 65535:
        raise ValueError("port must be an integer from 1024 to 65535")
    for key in ("show_prompt_snippets", "show_prompts"):
        if not isinstance(cfg[key], bool):
            raise ValueError(f"{key} must be true or false")


# --------------------------------------------------------------------------- reading
def _loads(raw):
    try:
        v = json.loads(raw) if raw else {}
    except (TypeError, ValueError):
        return {}
    return v if isinstance(v, dict) else {}


def _num(v):
    try:
        f = float(v)
    except (TypeError, ValueError):
        return 0.0
    return f if f == f and f not in (float("inf"), float("-inf")) else 0.0


def _compact(task_id, role, raw, created_at):
    """Keep only the fields analytics needs; drop everything else immediately."""
    j = _loads(raw)
    if not j:
        return None
    meta = j.get("_meta") if isinstance(j.get("_meta"), dict) else {}
    rec = {"task_id": task_id, "role": role, "ts": created_at}
    if role == "user":
        content = j.get("content")
        rec["text"] = content if isinstance(content, str) else ""
        mode = meta.get("mode") if isinstance(meta.get("mode"), dict) else {}
        rec["mode"] = mode.get("id")
    elif role == "assistant":
        spend = meta.get("spend") if isinstance(meta.get("spend"), dict) else {}
        rec["cost"] = _num(spend.get("cost"))
        rec["stop_reason"] = meta.get("stopReason")
    elif role == "tool":
        usage = j.get("toolUsage") if isinstance(j.get("toolUsage"), dict) else {}
        sig = usage.get("signature") if isinstance(usage.get("signature"), dict) else {}
        content = j.get("content") if isinstance(j.get("content"), str) else ""
        is_error = bool(sig.get("isError"))
        rec["tool"] = sig.get("name") or "unknown"
        rec["is_error"] = is_error
        rec["cancelled"] = is_error and "was cancelled" in content[:160].lower()
    else:
        return None
    return rec


def read_db(db_path):
    """Open Bob's database read-only and return (tasks, compact messages)."""
    p = Path(db_path).expanduser()
    if not p.is_file():
        raise FileNotFoundError("Bob database not found")
    con = sqlite3.connect("file:%s?mode=ro" % quote(str(p)), uri=True, timeout=5)
    try:
        con.row_factory = sqlite3.Row
        tasks = [
            dict(r)
            for r in con.execute(
                "SELECT id, project_id, parent_id, task_type, costs, created_at, updated_at FROM tasks"
            )
        ]
        messages = []
        for r in con.execute(
            "SELECT task_id, role, data, created_at FROM messages ORDER BY created_at"
        ):
            rec = _compact(r["task_id"], r["role"], r["data"], r["created_at"])
            if rec:
                messages.append(rec)
    finally:
        con.close()
    return tasks, messages


# --------------------------------------------------------------------------- helpers
def _date(ms):
    return dt.datetime.fromtimestamp(ms / 1000).date()


def _folder(project_id):
    if not isinstance(project_id, str) or not project_id:
        return "(unknown)"
    path = project_id[5:] if project_id.startswith("file:") else project_id
    home = str(Path.home())
    if path == home:
        return "~"
    if path.startswith(home + "/"):
        return "~" + path[len(home):]
    return path


def cycle_start(d, reset_day):
    def clamp(y, m):
        return dt.date(y, m, min(reset_day, calendar.monthrange(y, m)[1]))

    s = clamp(d.year, d.month)
    if s > d:
        y, m = (d.year, d.month - 1) if d.month > 1 else (d.year - 1, 12)
        s = clamp(y, m)
    return s


def next_cycle_start(start, reset_day):
    y, m = (start.year, start.month + 1) if start.month < 12 else (start.year + 1, 1)
    return dt.date(y, m, min(reset_day, calendar.monthrange(y, m)[1]))


def _cycle_label(start, reset_day):
    return f"{start:%b %Y}" if reset_day == 1 else f"{start:%b} {start.day}"


def is_stepwise(text):
    return bool(_STEPWISE_RE.search((text or "")[:MAX_PROMPT_CHARS]))


def prompt_features(text):
    t = (text or "")[:MAX_PROMPT_CHARS]
    numbered = 0 if _STEPWISE_RE.search(t) else len(_NUMBERED_RE.findall(t))
    objectives = 1 + numbered + len(_CONJ_RE.findall(t))
    f = {
        "length_ok": len(t.strip()) >= MIN_PROMPT_CHARS,
        "has_context": bool(_FILE_RE.search(t) or _ERR_RE.search(t)),
        "has_goal_or_format": bool(_GOAL_RE.search(t) or _FORMAT_RE.search(t)),
        "single_objective": objectives < MULTI_OBJECTIVE_THRESHOLD,
    }
    f["quality"] = sum(f.values()) / 4.0
    return f


def _bucket(q):
    if q >= 0.75:
        return "Excellent"
    if q >= 0.5:
        return "Good"
    if q >= 0.25:
        return "Needs work"
    return "Poor"

# --------------------------------------------------------------------------- prompt analyzer
# Patterns use bounded quantifiers and no nested repetition, so they stay linear on
# untrusted text. Input is also capped at MAX_PROMPT_CHARS before any matching.
_SECRET_RES = [
    re.compile(r"-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----"),
    re.compile(r"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,100}\b"),
    re.compile(r"\bsk-[A-Za-z0-9_\-]{20,200}"),
    re.compile(r"\bxox[abprs]-[A-Za-z0-9\-]{10,100}"),
    re.compile(r"\beyJ[A-Za-z0-9_\-]{10,500}\.[A-Za-z0-9_\-]{10,500}\.[A-Za-z0-9_\-]{10,500}"),
    re.compile(r"(?i)\bbearer\s+[A-Za-z0-9._\-]{16,300}"),
    re.compile(
        r"(?i)\b(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key)\b"
        r"\s{0,3}[:=]\s{0,3}['\"]?[^\s'\"]{4,200}"
    ),
    re.compile(r"\b[a-z][a-z0-9+.\-]{1,20}://[^\s:/@]{1,100}:[^\s/@]{1,100}@"),
]
_SPLIT_RE = re.compile(r"(?m)^\s*\d+[.)]\s+|\b(?:and then|then|also|additionally|as well as|plus)\b", re.I)


def _cap(text):
    return text[:MAX_PROMPT_CHARS] if isinstance(text, str) else ""


def has_secret(text):
    t = _cap(text)
    return any(r.search(t) for r in _SECRET_RES)


def redact(text):
    t = _cap(text)
    for r in _SECRET_RES:
        t = r.sub("[REDACTED]", t)
    return t


def _objectives(text):
    parts = [p.strip(" ,;.\n\t") for p in _SPLIT_RE.split(text)]
    return [" ".join(p.split()) for p in parts if len(p) > 3]


def analyze_prompt(text):
    """Score one prompt and propose a clearer version.

    Returns a dict with a 0-100 score, a list of issues, a template-based suggested
    version containing [placeholders] to fill in, and a redacted copy of the text.
    The original text is never returned unredacted.
    """
    raw = _cap(text)
    truncated = isinstance(text, str) and len(text) > MAX_PROMPT_CHARS
    clean = redact(raw)
    feats = prompt_features(raw)
    core = " ".join(clean.split())
    issues = []

    def issue(iid, level, message):
        source, why = ISSUE_META[iid]
        issues.append(
            {
                "id": iid,
                "level": level,
                "message": message,
                "source": source,
                "source_label": SOURCE_LABELS[source],
                "why": why,
            }
        )

    if has_secret(raw):
        issue("secret", "warn", "This looks like it contains a password, key or token. Remove it and refer to it by name.")
    if not feats["length_ok"]:
        issue("too_short", "tip", f"Under {MIN_PROMPT_CHARS} characters. Describe the task and any constraints.")
    if not feats["has_context"]:
        issue("missing_context", "warn", "No file, path or error text. Name the file (@file) or paste the exact error.")
    if not _GOAL_RE.search(raw):
        issue("missing_goal", "tip", "No goal stated. Say what should be true when the task is done.")
    if not _FORMAT_RE.search(raw):
        issue("missing_format", "tip", "No output format. Say whether you want a diff, summary, table or steps.")
    objectives = [] if feats["single_objective"] else _objectives(raw)
    if not feats["single_objective"]:
        issue(
            "multi_objective", "warn",
            "Several tasks in one prompt. If they are steps toward one goal, label them 'Step 1, Step 2'. "
            "If they are separate tasks, send them one at a time or ask for a plan first.",
        )
    if len(raw) >= LARGE_PASTE_CHARS:
        issue("large_paste", "tip", "Very long prompt. Point Bob at the file with @file instead of pasting it.")
    if _STYLE_RE.search(raw) and not _EXAMPLE_RE.search(raw):
        issue("add_example", "tip", "You ask for a specific style or format. A short example of it helps (optional, not scored).")

    suggested = ""
    if core:
        lines = []
        if objectives:
            lines.append(f"Start with only this: {objectives[0][:300]}")
            for i, o in enumerate(objectives[1:4], 2):
                lines.append(f"(Task {i}, send separately: {o[:120]})")
        else:
            lines.append(core if len(core) <= 400 else core[:400].rstrip() + " ...")
        ids = {i["id"] for i in issues}
        if "missing_context" in ids:
            lines.append("Context: @[file] or the exact error: [paste the relevant lines only]")
        if "missing_goal" in ids or "too_short" in ids:
            lines.append("Goal: [what should be true when this is done]")
        if "too_short" in ids:
            lines.append("Constraints: [language/version, style, what must not change]")
        if "missing_format" in ids:
            lines.append("Output: [a diff / a short summary / a table / numbered steps]")
        if "large_paste" in ids:
            lines.append("Use @[file] rather than pasting its contents.")
        if "add_example" in ids:
            lines.append("Example: [paste one short sample of the style or format you want]")
        suggested = "\n".join(lines) if len(lines) > 1 else ""

    return {
        "score": round(100 * feats["quality"]),
        "bucket": _bucket(feats["quality"]),
        "checks": {
            "length": feats["length_ok"],
            "context": feats["has_context"],
            "goal_or_format": feats["has_goal_or_format"],
            "single_objective": feats["single_objective"],
        },
        "stepwise": is_stepwise(raw),
        "issues": issues,
        "suggested": suggested,
        "redacted": core[:2000],
        "truncated": truncated,
        "chars": len(raw),
    }




def _pct(x):
    return f"{round(100 * x)}%"


def _share(n, d):
    return n / d if d else 0.0


# --------------------------------------------------------------------------- compute
def compute(tasks, messages, cfg, today=None):
    today = today or dt.date.today()
    mult = float(cfg["cost_multiplier"])
    reset_day = cfg["reset_day"]

    by_task = defaultdict(list)
    for m in messages:
        by_task[m["task_id"]].append(m)

    events = []  # {date, cost, folder}
    convs = {}
    sub_cost = defaultdict(float)
    tool_calls_total = Counter()
    tool_errors_total = Counter()
    mode_cost = Counter()
    mode_prompts = Counter()

    for t in tasks:
        costs = _loads(t.get("costs"))
        total = max(0.0, _num(costs.get("cost"))) * mult
        folder = _folder(t.get("project_id"))
        msgs = sorted(by_task.get(t["id"], []), key=lambda m: m["ts"])

        mode = None
        first_mode = None
        msg_cost = 0.0
        prompts = []
        prompt_ts = []
        resumed = 0
        prev_ts = None
        clar = dismissed_q = cancelled_tools = errors = n_tools = mcp_calls = 0
        per_tool = Counter()
        last_stop = None

        for m in msgs:
            if m["role"] == "user":
                prompts.append(m["text"])
                prompt_ts.append(m["ts"])
                if prev_ts is not None and m["ts"] - prev_ts >= STALE_GAP_MS:
                    resumed += 1
                mode = m.get("mode") or mode
                first_mode = first_mode or mode
                mode_prompts[mode or "unknown"] += 1
            elif m["role"] == "assistant":
                c = m["cost"] * mult
                if c:
                    events.append({"date": _date(m["ts"]), "cost": c, "folder": folder})
                    msg_cost += c
                    mode_cost[mode or "unknown"] += c
                last_stop = m.get("stop_reason")
            else:
                name = m["tool"]
                n_tools += 1
                per_tool[name] += 1
                tool_calls_total[name] += 1
                if name.startswith("mcp__"):
                    mcp_calls += 1
                if name == "ask_followup_question":
                    clar += 1
                if m["cancelled"]:
                    cancelled_tools += 1
                    if name == "ask_followup_question":
                        dismissed_q += 1
                elif m["is_error"]:
                    errors += 1
                    tool_errors_total[name] += 1
            prev_ts = m["ts"]

        total = max(total, msg_cost)
        residual = total - msg_cost
        if residual > 1e-9:
            events.append({"date": _date(t["updated_at"]), "cost": residual, "folder": folder})
            mode_cost[mode or "unknown"] += residual

        if t.get("task_type") == "subagent":
            if t.get("parent_id"):
                sub_cost[t["parent_id"]] += total
            continue

        bd = costs.get("contextWindowBreakdown")
        breakdown = bd.get("breakdown") if isinstance(bd, dict) and isinstance(bd.get("breakdown"), dict) else {}
        convs[t["id"]] = {
            "id": t["id"],
            "folder": folder,
            "created_at": t["created_at"],
            "date": _date(t["created_at"]),
            "mode": first_mode or "unknown",
            "prompts": prompts,
            "prompt_ts": prompt_ts,
            "resumed": resumed,
            "cost": total,
            "context_tokens": int(_num(costs.get("contextTokens"))),
            "breakdown": {k: int(_num(v)) for k, v in breakdown.items()},
            "clarifications": clar,
            "dismissed_questions": dismissed_q,
            "cancelled_tools": cancelled_tools,
            "errors": errors,
            "tool_calls": n_tools,
            "mcp_calls": mcp_calls,
            "per_tool": per_tool,
            "last_stop": last_stop,
        }

    for parent, c in sub_cost.items():
        if parent in convs:
            convs[parent]["cost"] += c

    conv_list = list(convs.values())
    for c in conv_list:
        n = len(c["prompts"])
        if n == 0:
            c["outcome"] = "empty"
        elif c["last_stop"] == "user_cancelled":
            c["outcome"] = "cancelled"
        elif n == 1:
            c["outcome"] = "one_shot"
        else:
            c["outcome"] = "multi_turn"

    # ---- spend over time
    daily = defaultdict(float)
    daily_folder = defaultdict(lambda: defaultdict(float))
    cyc_folder = defaultdict(lambda: defaultdict(float))
    folder_cost = defaultdict(float)
    for e in events:
        daily[e["date"]] += e["cost"]
        daily_folder[e["date"]][e["folder"]] += e["cost"]
        cyc_folder[cycle_start(e["date"], reset_day)][e["folder"]] += e["cost"]
        folder_cost[e["folder"]] += e["cost"]
    total_cost = sum(e["cost"] for e in events)

    c_start = cycle_start(today, reset_day)
    c_end = next_cycle_start(c_start, reset_day)
    days_total = (c_end - c_start).days
    days_elapsed = (today - c_start).days + 1
    days_left = (c_end - today).days
    spent = 0.0
    daily_out = []
    d = c_start
    while d <= today:
        spent += daily.get(d, 0.0)
        daily_out.append(
            {
                "date": d.isoformat(),
                "cost": round(daily.get(d, 0.0), 4),
                "cumulative": round(spent, 4),
                "by_folder": {k: round(v, 4) for k, v in daily_folder.get(d, {}).items()},
            }
        )
        d += dt.timedelta(days=1)
    avg_daily = spent / days_elapsed if days_elapsed else 0.0
    projected = avg_daily * days_total
    budget = cfg["monthly_budget"]
    run_out = None
    status = "no_budget"
    if budget:
        if spent >= budget:
            status = "exceeded"
        else:
            status = "over_pace" if projected > budget else "on_track"
            if avg_daily > 0:
                run_day = today + dt.timedelta(days=int((budget - spent) / avg_daily) + 1)
                if run_day < c_end:
                    run_out = run_day.isoformat()
    cycle = {
        "start": c_start.isoformat(),
        "end": c_end.isoformat(),
        "days_total": days_total,
        "days_elapsed": days_elapsed,
        "days_left": days_left,
        "spent": round(spent, 4),
        "budget": budget,
        "remaining": round(budget - spent, 4) if budget else None,
        "avg_daily": round(avg_daily, 4),
        "projected": round(projected, 4),
        "run_out_date": run_out,
        "status": status,
        "daily": daily_out,
    }

    cycles = []
    if events:
        s = cycle_start(min(e["date"] for e in events), reset_day)
        while s <= c_start:
            e_ = next_cycle_start(s, reset_day)
            by_f = cyc_folder.get(s, {})
            cycles.append(
                {
                    "start": s.isoformat(),
                    "end": e_.isoformat(),
                    "label": _cycle_label(s, reset_day),
                    "cost": round(sum(by_f.values()), 4),
                    "by_folder": {k: round(v, 4) for k, v in by_f.items()},
                }
            )
            s = e_

    active = [c for c in conv_list if c["prompts"]]
    folder_stats = defaultdict(lambda: {"conversations": 0, "prompts": 0, "last_used": None})
    for c in conv_list:
        fs = folder_stats[c["folder"]]
        fs["conversations"] += 1
        fs["prompts"] += len(c["prompts"])
        fs["last_used"] = max(fs["last_used"] or c["date"], c["date"])
    for f in folder_cost:
        folder_stats[f]
    folders = sorted(
        (
            {
                "folder": f,
                "cost": round(folder_cost.get(f, 0.0), 4),
                "conversations": s_["conversations"],
                "prompts": s_["prompts"],
                "last_used": s_["last_used"].isoformat() if s_["last_used"] else None,
                "cost_per_conversation": round(
                    _share(folder_cost.get(f, 0.0), s_["conversations"]), 4
                ),
            }
            for f, s_ in folder_stats.items()
        ),
        key=lambda x: -x["cost"],
    )

    # ---- prompt quality (opening prompts only)
    feats = [prompt_features(c["prompts"][0]) for c in active]
    n_open = len(feats)
    avg_quality = sum(f["quality"] for f in feats) / n_open if n_open else None
    buckets = Counter(_bucket(f["quality"]) for f in feats)
    order = ["Excellent", "Good", "Needs work", "Poor"]

    # ---- efficiency metrics
    n_active = len(active)
    outcomes = Counter(c["outcome"] for c in conv_list)
    tool_calls = sum(tool_calls_total.values())
    real_errors = sum(tool_errors_total.values())
    clar_convs = sum(1 for c in active if c["clarifications"] > 0)
    questions = sum(c["clarifications"] for c in active)
    dismissed = sum(c["dismissed_questions"] for c in active)
    heavy = [
        c for c in active
        if c["context_tokens"] >= LARGE_CONTEXT_TOKENS or len(c["prompts"]) >= LONG_CONVERSATION_PROMPTS
    ]
    mcp_unused = [
        c for c in active
        if c["breakdown"].get("mcpToolDefinitions", 0) > 0 and c["mcp_calls"] == 0
    ]
    rules_tokens = [
        c["breakdown"].get("baseRules", 0)
        + c["breakdown"].get("projectRules", 0)
        + c["breakdown"].get("customInstructions", 0)
        for c in active
        if c["breakdown"]
    ]
    repeated = max(
        ((n, t, c) for c in active for t, n in c["per_tool"].items() if t != "ask_followup_question"),
        default=None,
        key=lambda x: x[0],
    )
    metrics = {
        "conversations_with_prompts": n_active,
        "avg_prompts_per_conversation": round(_share(sum(len(c["prompts"]) for c in active), n_active), 2),
        "avg_cost_per_conversation": round(_share(sum(c["cost"] for c in active), n_active), 4),
        "avg_cost_per_prompt": round(_share(sum(c["cost"] for c in active), sum(len(c["prompts"]) for c in active)), 4),
        "one_shot_rate": round(_share(outcomes["one_shot"], n_active), 3),
        "follow_up_rate": round(
            _share(sum(len(c["prompts"]) - 1 for c in active), sum(len(c["prompts"]) for c in active)), 3
        ),
        "clarification_rate": round(_share(clar_convs, n_active), 3),
        "questions_asked": questions,
        "questions_dismissed": dismissed,
        "cancelled_rate": round(_share(outcomes["cancelled"], n_active), 3),
        "tool_error_rate": round(_share(real_errors, tool_calls), 3),
        "heavy_conversations": len(heavy),
        "avg_rules_tokens": round(sum(rules_tokens) / len(rules_tokens)) if rules_tokens else 0,
    }

    components = []
    if n_active:
        parts = [
            ("prompt_quality", "Opening prompt quality", avg_quality, 0.35,
             f"{_pct(avg_quality)} average across {n_open} opening prompts"),
            ("clarity", "Needs few clarifications", 1 - metrics["clarification_rate"], 0.25,
             f"{clar_convs} of {n_active} conversations needed Bob to ask questions"),
            ("context_health", "Focused conversations", 1 - _share(len(heavy), n_active), 0.25,
             f"{len(heavy)} of {n_active} conversations became long or context-heavy"),
            ("reliability", "Tool reliability", 1 - metrics["tool_error_rate"], 0.15,
             f"{real_errors} failed tool calls out of {tool_calls}"),
        ]
        score = round(100 * sum(v * w for _, _, v, w, _ in parts))
        components = [
            {"key": k, "label": lbl, "value": round(v * 100), "weight": w, "detail": d}
            for k, lbl, v, w, d in parts
        ]
    else:
        score = None

    # ---- weekly outcomes
    weekly = defaultdict(Counter)
    for c in active:
        wk = c["date"] - dt.timedelta(days=c["date"].weekday())
        weekly[wk][c["outcome"]] += 1
    weekly_out = [
        {"week": wk.isoformat(), **{k: weekly[wk][k] for k in ("one_shot", "multi_turn", "cancelled")}}
        for wk in sorted(weekly)
    ]

    # ---- top conversations
    top = sorted(conv_list, key=lambda c: -c["cost"])[:10]
    top_out = []
    for c in top:
        row = {
            "date": c["date"].isoformat(),
            "folder": c["folder"],
            "mode": c["mode"],
            "prompts": len(c["prompts"]),
            "cost": round(c["cost"], 4),
            "context_tokens": c["context_tokens"],
            "outcome": c["outcome"],
        }
        if cfg["show_prompt_snippets"] and c["prompts"]:
            row["snippet"] = " ".join(c["prompts"][0].split())[:60]
        top_out.append(row)

    cycle_convs = [c for c in conv_list if c_start <= c["date"] < c_end]
    cycle_cost_by_conv = sorted((c["cost"] for c in cycle_convs), reverse=True)
    cycle_folder_cost = cyc_folder.get(c_start, {})
    # ---- prompt hygiene (counts only; prompt text is never placed in the payload here)
    all_prompts = [p for c in conv_list for p in c["prompts"]]
    norm_counts = Counter()
    for p in all_prompts:
        norm = " ".join(_cap(p).lower().split())
        if len(norm) >= 12:
            norm_counts[hashlib.sha256(norm.encode("utf-8")).hexdigest()[:8]] += 1
    hygiene = {
        "prompts_with_secrets": sum(1 for p in all_prompts if has_secret(p)),
        "repeated": [
            {"id": k, "count": n} for k, n in norm_counts.most_common(5) if n >= REPEAT_MIN
        ],
        "large_pastes": sum(1 for p in all_prompts if len(p) >= LARGE_PASTE_CHARS),
    }

    # ---- usage habits
    heat = [[0] * 24 for _ in range(7)]
    active_days = set()
    for c in conv_list:
        for ts in c["prompt_ts"]:
            when = dt.datetime.fromtimestamp(ts / 1000)
            heat[when.weekday()][when.hour] += 1
            active_days.add(when.date())
    longest = run = 0
    prev_day = None
    for day in sorted(active_days):
        run = run + 1 if prev_day and (day - prev_day).days == 1 else 1
        longest = max(longest, run)
        prev_day = day
    current = 0
    day = today if today in active_days else today - dt.timedelta(days=1)
    while day in active_days:
        current += 1
        day -= dt.timedelta(days=1)
    ranked = sorted((c["cost"] for c in active), reverse=True)
    top_n = max(1, -(-len(ranked) // 5)) if ranked else 0
    top20_share = (
        sum(ranked[:top_n]) / sum(ranked) if len(ranked) >= 5 and sum(ranked) > 0 else None
    )
    overhead_keys = (
        "roleDefinition", "staticSections", "skills", "baseRules", "projectRules",
        "customInstructions", "environment", "toolSystemPrompts", "toolDefinitions",
        "mcpToolDefinitions",
    )
    overhead = [
        sum(c["breakdown"].get(k, 0) for k in overhead_keys) / c["context_tokens"]
        for c in active
        if c["breakdown"] and c["context_tokens"] > 0
    ]
    habits = {
        "heatmap": heat,
        "active_days": len(active_days),
        "longest_streak": longest,
        "current_streak": current,
        "resumed_after_gap": sum(1 for c in active if c["resumed"]),
        "top20_share": round(top20_share, 3) if top20_share is not None else None,
        "fixed_overhead_share": round(sum(overhead) / len(overhead), 3) if overhead else None,
    }

    # ---- comparison with the same point in the previous cycle
    prev_start = cycle_start(c_start - dt.timedelta(days=1), reset_day)
    same_point = 0.0
    d = prev_start
    for _ in range(days_elapsed):
        if d >= c_start:
            break
        same_point += daily.get(d, 0.0)
        d += dt.timedelta(days=1)
    comparison = {
        "spent": round(spent, 4),
        "same_point": round(same_point, 4),
        "prev_label": _cycle_label(prev_start, reset_day),
        "delta_pct": round((spent - same_point) / same_point, 3) if same_point > 0 else None,
    }

    # ---- prompt review (opening prompts, redacted); only when the user opted in
    review_items = []
    if cfg["show_prompts"]:
        candidates = sorted(
            (c for c in active if c["prompts"][0].strip()),
            key=lambda c: (prompt_features(c["prompts"][0])["quality"], -c["cost"]),
        )
        for c in candidates[:REVIEW_LIMIT]:
            review_items.append(
                {
                    "date": c["date"].isoformat(),
                    "folder": c["folder"],
                    "cost": round(c["cost"], 4),
                    "prompts": len(c["prompts"]),
                    **analyze_prompt(c["prompts"][0]),
                }
            )



    ctx = {
        "n_active": n_active,
        "n_open": n_open,
        "feats": feats,
        "metrics": metrics,
        "outcomes": outcomes,
        "heavy": heavy,
        "mcp_unused": mcp_unused,
        "repeated": repeated,
        "cycle": cycle,
        "cycle_cost_by_conv": cycle_cost_by_conv,
        "cycle_folder_cost": dict(cycle_folder_cost),
        "avg_quality": avg_quality,
        "hygiene": hygiene,
        "habits": habits,
        "comparison": comparison,
    }
    recs = recommend(ctx)

    return {
        "generated_at": dt.datetime.now().isoformat(timespec="seconds"),
        "unit": UNIT,
        "data_range": {
            "first": min(e["date"] for e in events).isoformat() if events else None,
            "last": max(e["date"] for e in events).isoformat() if events else None,
        },
        "settings": {
            "reset_day": reset_day,
            "monthly_budget": budget,
            "cost_multiplier": mult,
        },
        "totals": {
            "cost": round(total_cost, 4),
            "conversations": len(conv_list),
            "prompts": sum(len(c["prompts"]) for c in conv_list),
            "folders": len(folders),
        },
        "cycle": cycle,
        "cycles": cycles,
        "folders": folders,
        "modes": sorted(
            (
                {"mode": k, "prompts": mode_prompts.get(k, 0), "cost": round(mode_cost.get(k, 0.0), 4)}
                for k in set(mode_cost) | set(mode_prompts)
            ),
            key=lambda x: -x["cost"],
        ),
        "tools": [
            {"tool": t, "calls": n, "errors": tool_errors_total.get(t, 0)}
            for t, n in tool_calls_total.most_common(12)
        ],
        "outcomes": {
            "totals": {k: outcomes.get(k, 0) for k in ("one_shot", "multi_turn", "cancelled", "empty")},
            "weekly": weekly_out,
        },
        "prompt_quality": {
            "average": round(avg_quality, 3) if avg_quality is not None else None,
            "buckets": [{"label": b, "count": buckets.get(b, 0)} for b in order],
        },
        "efficiency": {"score": score, "components": components, "metrics": metrics},
        "top_conversations": top_out,
        "recommendations": recs,
        "habits": habits,
        "comparison": comparison,
        "hygiene": hygiene,
        "prompt_review": {"enabled": bool(cfg["show_prompts"]), "items": review_items},
        "best_practices": BEST_PRACTICES,
    }


# --------------------------------------------------------------------------- advice
BEST_PRACTICES = [
    {
        "title": "Start a new task when the goal changes",
        "detail": "Every prompt re-sends the whole conversation. A new task drops stale context and keeps Bobcoin use down.",
    },
    {
        "title": "Put context in the first prompt",
        "detail": "Name the file or error, state the goal, and say what output you want. This avoids clarifying questions.",
    },
    {
        "title": "Add only the context you need",
        "detail": "Paste the failing lines, not the whole log. Use @file mentions instead of pasting whole files.",
    },
    {
        "title": "Disable MCP servers and tools you are not using",
        "detail": "Their definitions load on every prompt, and heavy MCP use raises consumption.",
    },
    {
        "title": "Keep rules and AGENTS.md short",
        "detail": "Rules are injected into every conversation, so long rule files add a fixed cost to every prompt.",
    },
    {
        "title": "Use a subagent for broad exploration",
        "detail": "Repo-wide reads in a subagent return a summary instead of filling your main conversation.",
    },
    {
        "title": "Prefer small, reviewed changes",
        "detail": "Small approved steps are cheaper to correct than one large run that goes the wrong way.",
    },
    {
        "title": "Check your budget regularly",
        "detail": "Watch the gauge in the Bob panel and this dashboard's cycle chart so you do not run out mid-task.",
    },
]


def recommend(ctx):
    recs = []
    n_active = ctx["n_active"]
    n_open = ctx["n_open"]
    feats = ctx["feats"]
    m = ctx["metrics"]
    cycle = ctx["cycle"]

    def add(rid, level, title, evidence, action):
        recs.append({"id": rid, "level": level, "title": title, "evidence": evidence, "action": action})

    if n_open >= 3:
        no_ctx = sum(1 for f in feats if not f["has_context"])
        no_goal = sum(1 for f in feats if not f["has_goal_or_format"])
        short = sum(1 for f in feats if not f["length_ok"])
        multi = sum(1 for f in feats if not f["single_objective"])
        if _share(no_ctx, n_open) > 0.4:
            add("missing_context", "warn", "Add a file or error to your opening prompt",
                f"{no_ctx} of {n_open} opening prompts ({_pct(no_ctx / n_open)}) name no file, path, or error.",
                "Start with the file (@file) or the exact error text so Bob does not have to search or ask.")
        if _share(no_goal, n_open) > 0.5:
            add("missing_goal", "warn", "State your goal and the output you want",
                f"{no_goal} of {n_open} opening prompts do not mention a goal or an output format.",
                "Add one line such as 'so that ...' and 'return a table / summary / diff'.")
        if _share(short, n_open) > 0.4:
            add("short_prompts", "tip", "Opening prompts are very short",
                f"{short} of {n_open} opening prompts are under {MIN_PROMPT_CHARS} characters.",
                "Short is fine for follow-ups, but the first prompt should describe the task and constraints.")
        if _share(multi, n_open) > 0.2:
            add("multi_objective", "tip", "Split prompts that ask for many things at once",
                f"{multi} of {n_open} opening prompts look like they bundle several tasks.",
                "Give Bob one objective per task, or ask it to plan first. Numbered steps toward one goal "
                "are fine if you label them 'Step 1, Step 2'.")

    if n_active >= 3 and m["clarification_rate"] >= 0.3:
        add("clarifications", "warn", "Bob often has to ask you questions",
            f"Bob asked clarifying questions in {_pct(m['clarification_rate'])} of conversations "
            f"({m['questions_asked']} questions, {m['questions_dismissed']} dismissed).",
            "Answer the likely questions up front: scope, constraints, preferred technology, and output format.")
    if n_active >= 3 and m["cancelled_rate"] >= 0.2:
        add("cancelled", "warn", "Many conversations end by cancelling Bob",
            f"{_pct(m['cancelled_rate'])} of conversations ended on a cancelled response.",
            "Interrupt earlier with a clearer correction, or restate the task in a new conversation.")
    if ctx["heavy"]:
        c = ctx["heavy"][0]
        add("long_conversations", "warn", "Start a new task when a conversation gets long",
            f"{len(ctx['heavy'])} conversation(s) passed {LARGE_CONTEXT_TOKENS // 1000}k context tokens or "
            f"{LONG_CONVERSATION_PROMPTS} prompts (largest: {c['context_tokens']:,} tokens).",
            "Summarise the outcome, then start a new task. Context is re-sent on every prompt.")
    if n_active >= 3 and m["avg_prompts_per_conversation"] > 6:
        add("many_turns", "tip", "Conversations run many turns (a cost signal, not a flaw)",
            f"You average {m['avg_prompts_per_conversation']} prompts per conversation. Every turn re-sends the "
            "whole context, so long threads cost more.",
            "Iterating on purpose (prompt chaining, refining a result) is a valid technique. If your follow-ups "
            "were corrections for missing details, put those details in the first prompt. Start a new task "
            "when the goal changes.")
    if ctx["mcp_unused"]:
        tokens = max(c["breakdown"].get("mcpToolDefinitions", 0) for c in ctx["mcp_unused"])
        add("unused_mcp", "warn", "MCP tools are loaded but not used",
            f"{len(ctx['mcp_unused'])} conversation(s) loaded MCP tool definitions (up to {tokens:,} tokens) "
            "and never called an MCP tool.",
            "Disable unused MCP servers or individual tools in Settings → MCP.")
    if m["avg_rules_tokens"] > HEAVY_RULES_TOKENS:
        add("heavy_rules", "tip", "Your rules add a large fixed cost to every prompt",
            f"Rules and custom instructions average about {m['avg_rules_tokens']:,} tokens per conversation.",
            "Trim rule files to short, operational instructions.")
    if ctx["repeated"] and ctx["repeated"][0] >= REPEATED_TOOL_CALLS:
        n, tool, _ = ctx["repeated"]
        add("repeated_tool", "tip", "One tool was called many times in a single conversation",
            f"'{tool}' ran {n} times in one conversation.",
            "Narrow the question first, or hand broad research to a subagent so the main thread stays small.")
    if m["tool_error_rate"] > 0.1 and n_active >= 3:
        add("tool_errors", "tip", "A noticeable share of tool calls fail",
            f"{_pct(m['tool_error_rate'])} of tool calls returned an error.",
            "Check that required tools and runtimes are installed so Bob does not retry blindly.")

    if cycle["status"] == "exceeded":
        add("budget_exceeded", "warn", "You have used your full budget for this cycle",
            f"Spent {cycle['spent']:.2f} of {cycle['budget']:.2f} with {cycle['days_left']} day(s) until reset.",
            "Prioritise essential tasks and start fresh conversations to avoid carrying large context.")
    elif cycle["status"] == "over_pace":
        extra = f" You would run out around {cycle['run_out_date']}." if cycle["run_out_date"] else ""
        add("over_pace", "warn", "You are on pace to exceed this cycle's budget",
            f"Projected {cycle['projected']:.2f} against a budget of {cycle['budget']:.2f}.{extra}",
            "Apply the tips above to your costliest conversations, or spread heavy work across the cycle.")
    costs = ctx["cycle_cost_by_conv"]
    if len(costs) >= 3 and sum(costs) > 0 and costs[0] / sum(costs) > 0.4:
        add("dominant_conversation", "tip", "One conversation dominates this cycle",
            f"Your costliest conversation is {_pct(costs[0] / sum(costs))} of this cycle's spend.",
            "Open it in the table below and look for where it grew: repeated reads, big pastes, or long history.")
    fc = ctx["cycle_folder_cost"]
    if len(fc) >= 2 and sum(fc.values()) > 0:
        top_f, top_v = max(fc.items(), key=lambda kv: kv[1])
        if top_v / sum(fc.values()) > 0.6:
            add("dominant_folder", "tip", "Most of this cycle's spend is in one folder",
                f"{top_f} accounts for {_pct(top_v / sum(fc.values()))} of this cycle.",
                "Check whether that folder's rules or tools are heavier than your other projects.")

    hyg = ctx.get("hygiene")
    hab = ctx.get("habits")
    cmp_ = ctx.get("comparison")
    if hyg:
        if hyg["prompts_with_secrets"]:
            add("secrets_in_prompts", "warn", "Some prompts may contain credentials",
                f"{hyg['prompts_with_secrets']} of your prompts contain text that looks like a password, key, or token.",
                "Do not paste secrets into chat. Keep them in environment variables or a secrets manager "
                "and refer to them by name.")
        if hyg["repeated"]:
            top_rep = hyg["repeated"][0]["count"]
            add("repeated_prompts", "tip", "You send the same request again and again",
                f"{len(hyg['repeated'])} request(s) were sent {REPEAT_MIN}+ times (most repeated: {top_rep} times).",
                "Save repeated requests as a custom slash command or skill so you only type them once.")
        if hyg["large_pastes"] >= 2:
            add("large_pastes", "tip", "Several prompts are very long",
                f"{hyg['large_pastes']} prompts were over {LARGE_PASTE_CHARS:,} characters.",
                "Send only the relevant lines, or point Bob at the file with @file instead of pasting it.")
    if hab:
        if hab["resumed_after_gap"] >= 2:
            add("resumed_after_gap", "tip", "You often come back to old conversations",
                f"{hab['resumed_after_gap']} conversations continued after a break of {STALE_GAP_MS // 3_600_000}+ hours.",
                "After a long break, start a new task with a short summary so stale context is not re-sent.")
        if hab["top20_share"] is not None and hab["top20_share"] >= 0.8:
            add("cost_concentration", "tip", "A few conversations drive most of your spend",
                f"The costliest 20% of conversations account for {_pct(hab['top20_share'])} of spend.",
                "Review those few first; fixing one runaway conversation saves more than tuning many small ones.")
    if cmp_ and cmp_["delta_pct"] is not None and cmp_["delta_pct"] >= 0.5:
        add("up_vs_last_cycle", "tip", "Spend is well above the same point last cycle",
            f"{cmp_['spent']:.2f} so far versus {cmp_['same_point']:.2f} at this point in {cmp_['prev_label']} "
            f"(up {_pct(cmp_['delta_pct'])}).",
            "Check the costliest conversations and folders below for what changed.")


    if n_active >= 3 and not any(r["level"] == "warn" for r in recs):
        add("healthy", "good", "Your usage looks efficient",
            f"Efficiency signals are healthy across {n_active} conversations.",
            "Keep starting new tasks when the goal changes and keep opening prompts specific.")
    if n_active < 3:
        add("not_enough_data", "tip", "Not enough history yet for personalised advice",
            f"Only {n_active} conversation(s) with prompts so far.",
            "The general best practices below still apply. Personalised insights appear after a few more conversations.")
    return recs


def analyze(cfg, today=None):
    tasks, messages = read_db(cfg["db_path"])
    return compute(tasks, messages, cfg, today)
