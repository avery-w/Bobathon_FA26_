# Bob Analytics: a personal dashboard that runs on your computer

Reads Bob's own local database (`~/.bob/db/bob.db`) and shows **your** usage:
Bobcoin spend by day, by folder and by credit cycle, plus prompt-quality and
efficiency insights with best-practice advice. No hooks, no installs, no network.

## Run it

```sh
cd bobathon/bob-analytics
./run.sh            # or: python3 server.py
```

The terminal prints a one-time **access code**. Your browser opens
`http://localhost:8765/`; paste the code to sign in. Press Ctrl+C to stop.
Requires Python 3.9+ and nothing else (standard library only).

## First thing to do: set your credit cycle

Click **Cycle & budget settings** and enter:

| Setting | Meaning |
|---|---|
| Reset day of month | The day your Bob credits reset. Drives every cycle chart. Defaults to the 1st. |
| Monthly budget | Optional. Enables the budget line, pace status, and run-out date. |
| Cost multiplier | Scales the costs stored in Bob's database. Leave at 1 unless the numbers differ from your Bob budget gauge (see Assumptions). |
| Show prompt snippets | Off by default. Adds a 60-character opening-prompt snippet to the costliest-conversations table. |

Settings are saved to `~/.bob-dashboard/config.json` (mode 600).

## What you get

- KPI cards: spent this cycle, projected by reset, days until reset, efficiency score, cost per conversation, one-shot rate
- **Credit cycle chart**: cumulative spend, projection to reset, budget line, even-pace line
- **Daily spend this cycle by folder**, **usage by folder**, **spend per credit cycle by folder**
- Prompt-quality donut, one-shot vs multi-turn donut, tool usage, weekly outcomes, spend by mode
- Efficiency score with a component breakdown
- **Recommendations** generated from your own data, and general best practices
- **Prompt optimizer**: type or paste a prompt and get a live score, a list of what is missing, and a suggested version
- **Prompt review** (opt-in): your own past opening prompts, lowest-scoring first, each with a suggested improvement
- **Usage habits**: weekday-by-hour heatmap, active days and streaks, share of spend in your costliest 20% of conversations, share of context that is fixed overhead, conversations resumed after a 24h+ gap
- **Spend vs the same point last cycle**
- **Prompt hygiene**: prompts that appear to contain secrets, requests you repeat 3+ times, very long pastes
- Costliest conversations

### Prompt optimizer and review

- The suggested version is a **template, not an AI rewrite**. It keeps your wording and adds `[bracketed]` lines (context, goal, constraints, output format) for whatever is missing. A prompt with several tasks is split into "start with this" and "send separately".
- Anything that looks like a password, API key, token, private key, or credentials in a URL is replaced with `[REDACTED]` before text leaves the analyser. The detection is pattern-based and will miss some secrets, so do not rely on it as a safeguard.
- Past prompts are shown only after you tick **Show my past prompts** in settings. They stay on this computer and are served only to your signed-in browser session.
- The optimizer reads at most 8000 characters per prompt. Text is analysed in memory and is not stored or logged.

## Where the data comes from

Bob keeps a local SQLite database. The dashboard opens it **read-only** and uses:

- `tasks`: working folder (`project_id`), dates, per-task `costs`, subagent links
- `messages`: per-response `spend.cost`, your mode, tool calls and failures, cancelled responses, your opening prompts

Prompt text is analysed in memory to score prompts and is **never stored or sent
anywhere**. The API returns only scores and counts unless you turn on snippets.

## Assumptions (please check these)

1. **Unit.** Bob's database stores a numeric `cost`. I could not find documentation that confirms it is in Bobcoins, so the dashboard labels it Bobcoins as a working assumption. Compare the total with the budget gauge in the Bob panel. If they differ by a constant factor, set the **cost multiplier**.
2. **History.** Only conversations still in your local database are counted. Anything deleted or from another machine is not included.
3. **Folder.** Spend is attributed to the workspace folder a conversation was opened in.
4. **Subagent cost** is added to the parent conversation.
5. **Costs not itemised per message** (when a task's total exceeds the sum of its messages) are attributed to the task's last-updated date.
6. **Outcomes are heuristic.** *One-shot* = a single prompt that was not cancelled. *Multi-turn* = more than one prompt. *Cancelled* = last response was cancelled. There is no reliable "resolved" signal in the data.
7. **Prompt quality** checks four things in the opening prompt: enough detail, a file/error reference, a goal or output format, and a single objective. It is a keyword heuristic, so treat it as a nudge.
8. **Efficiency score** = 35% prompt quality + 25% few clarifying questions + 25% focused conversations + 15% tool reliability. These weights are my own defaults. No source supports them.
9. **Multi-turn is a cost signal, not a failure.** Every turn re-sends the whole context, so long threads cost more. But follow-ups can be deliberate (prompt chaining, refining a result), so the one-shot rate and the "many turns" recommendation are worded as cost signals.
10. **Numbered steps toward one goal are one task.** A numbered list is counted as a single objective when the prompt labels it as steps ("Step 1", "follow these steps", "in order"). An unlabeled numbered list of 4+ items is still treated as several tasks.

Thresholds live at the top of `analytics.py`. They are defaults, not documented values.

### Where each prompt check comes from

Every issue in the optimizer shows a tag and a one-line reason.

| Check | Source | Notes |
|---|---|---|
| Too short | IBM prompt engineering article | "The more detailed the instruction, the more likely the output meets expectations." The 60-character cut-off is my own. |
| Missing file or error | Bob docs (Writing effective prompts, Context mentions) | Use `@` mentions for specific files and code. Detecting one is my keyword check. |
| Missing goal | IBM article | A prompt defines the task and context. The article does not mention goals, so this is a nudge. |
| Missing output format | IBM article | A direct instruction works when the model knows the exact format and topic. |
| Several tasks | Bob docs and IBM article | Break complex tasks into smaller steps; prompt chaining. |
| Large paste | Bob docs | Use direct file references; do not give Bob your whole codebase. |
| Add an example | Bob docs and IBM article (few-shot) | Optional, shown only when you ask for a style or format. Not scored. |
| Possible secret | My heuristic | General security practice, not Bob guidance. |

The IBM article covers prompt quality, not cost. It gives no numbers (ideal length, turn limits, scoring), so every threshold and weight in this project remains an unsupported default.

## Security and privacy

- Binds to `127.0.0.1` only; makes no outbound connections.
- Random access code (CSPRNG) checked in constant time; 5 wrong tries lock sign-in for 60 seconds.
- Session cookie is `HttpOnly` and `SameSite=Strict`; the code is never placed in a URL.
- `Host` and `Origin` checks block DNS-rebinding and cross-site requests.
- Strict Content-Security-Policy (no inline scripts or styles), `no-store` caching, `nosniff`.
- All page text is inserted as text, never as HTML, so chat content cannot inject markup.
- Request logs record only method and path. Errors returned to the browser are generic.
- Settings are validated server-side; only the five user-facing keys can be changed.
- `POST /api/optimize` requires sign-in, a JSON content type, and the same Host/Origin checks; request bodies are capped at 64 KB.
- Bob's database is opened read-only and is never modified.

## Tests

```sh
python3 -m unittest discover -s tests -v
```

## Troubleshooting

- *"Bob database not found"*: set `db_path` in `~/.bob-dashboard/config.json`.
- *Port in use*: set `"port"` (1024-65535) in the same file.
- *Empty charts*: you need at least a few conversations; recommendations appear after three.
