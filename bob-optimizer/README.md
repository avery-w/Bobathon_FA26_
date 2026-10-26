# Bob Optimizer

One application that combines two projects:

- **Bob Time Machine** (`Bobathon_FA26`): a causal graph of decisions, a time slider, and drift alerts that fire when a new fact breaks an old assumption.
- **Bob Analytics** (`bob_analytics`): a read-only view of your own Bob usage (spend, credit cycle, prompt quality, efficiency, habits) with advice.

Nothing from either project was removed. They are joined by **one time slider** and **one drift engine**.

## How the two are woven together

| Idea | Time Machine side | Analytics side |
|---|---|---|
| One slider | Replays what the team knew on a past date | Replays Bob usage as it was known on that date (`as_of`) |
| One graph | ADR decisions, assumptions, evidence | Folder, conversation and "usage assumption" nodes join the same graph |
| One drift engine | A new bulletin contradicts ADR-104 | Spend, efficiency, trend, and secrets-in-prompts alerts break standing usage assumptions |
| One KPI bar | Decisions tracked, drift, reviews, age | Spend, projection, efficiency, one-shot rate |

Usage alerts are raised when:

1. budget is exceeded or the spend pace is over budget,
2. the efficiency score is low,
3. spend is trending above the last credit cycle,
4. prompts appear to contain secrets.

## The three pages

| Page | Path | What it does |
|---|---|---|
| **Home** | `/` | Combined KPIs, the shared slider, drift on the chosen day, and the top things to act on |
| **Decision Cockpit** | `/cockpit` | The causal graph (decisions plus usage), the slider, and the drift panel with the ARB review action |
| **Usage Lab** | `/usage` | The full analytics dashboard: KPIs, prompt optimizer, credit cycle, folder and quality charts, efficiency, recommendations, usage drift, prompt review, habits, costliest conversations, best practices, settings |

The slider position is shared across all three pages.

## Architecture

```
Browser ──> Next.js (127.0.0.1:3000) ──> Python service (127.0.0.1:8766) ──> ~/.bob/db/bob.db (read-only)
              login, pages, proxy        analytics, prompt optimizer
```

- `web/`: Next.js 16, React 19, Tailwind 4, React Flow, Zustand.
- `service/`: the Python standard-library data engine. It still has its own small UI, which is unused by the new app.

## Run it

Requirements: Node.js 22 or newer, Python 3.9 or newer.

```sh
./run.sh
```

The script installs dependencies and builds on first run. It prints a one-time **access code** and the URL (`http://127.0.0.1:3000/`). Paste the code to sign in. Ctrl+C stops both processes.

Optional environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `BOB_WEB_PORT` | `3000` | Web port |
| `BOB_SERVICE_PORT` | `8766` | Python service port |
| `BOB_ACCESS_CODE` | random | Shared sign-in code, at least 16 characters. Leave unset to get a random one each run |

First, open **Usage Lab -> Settings** and set your credit-cycle reset day and budget. They are saved to `~/.bob-dashboard/config.json`.

## API (all require sign-in)

| Endpoint | Purpose |
|---|---|
| `GET /api/analytics[?as_of=YYYY-MM-DD]` | Usage analytics, optionally replayed to a date |
| `GET/POST /api/settings` | Read or update the five user settings |
| `POST /api/optimize` | Score and improve a prompt |
| `GET /api/replay?cutoffDate=YYYY-MM-DD` | Decision graph plus usage for a date |
| `GET /api/drift` | Decision alerts and `usageAlerts` |
| `POST /api/drift` | Ingest a document and check it against decisions |

Server-to-server callers can send `Authorization: Bearer <access code>`.

## Security model

- Both servers bind to `127.0.0.1` only.
- One random access code, compared in constant time. Five wrong tries lock sign-in for 60 seconds.
- The session cookie is `HttpOnly` and `SameSite=Strict`, and is HMAC-signed.
- `Host` and `Origin` checks block DNS rebinding and cross-site requests.
- A per-request nonce Content-Security-Policy and standard security headers are applied in `web/src/proxy.ts`.
- The Python service rejects any request without the shared token, so it is not usable directly.
- Errors returned to the browser are generic. Logs do not contain prompts or the access code.
- Conversation ids in the graph are hashed, and no prompt text is sent to the graph.
- Bob's database is opened read-only.
- `npm audit` reports 0 vulnerabilities.

## Assumptions and limits

All the original analytics assumptions still apply (see `service/README.md`): the Bobcoin unit, heuristic outcomes and prompt quality, and adjustable thresholds and weights that no source supports.

New with time travel:

- **Replay is approximate.** Bob stores a task's total cost, not a history of it. When a task's total exceeds the sum of its itemised messages, the remainder is attributed to the task's last-updated date. A replay of an earlier date therefore cannot know the final total of a task that was still in progress.
- **Data starts when you first used Bob.** Earlier dates show only the sample decision history.
- **The ADR-104 decision history and the March 2026 bulletin are sample data** from the original Time Machine demo. The usage side is real.

## Tests

```sh
cd service && python3 -m unittest discover -s tests   # 59 tests
cd web && npm test && npm run typecheck && npm run build
```
