# Team Mode: 4 Lanes, 4 Bob Sessions, 1 Repo

Read this first. It explains how four people, each running their own IBM Bob session, build `FINAL_BUILD_PLAN.md` at the same time without stepping on each other.

The idea in one line: **every file has exactly one owner, every hand-off goes through a frozen contract, and code only meets in `final` through one merge queue.**

---

## 0. Getting started (everyone)

Everyone starts from the same two downloads: **`Bobathon_Final.zip`** (the three projects) and **`Bobathon_Team_Plan.zip`** (this plan). Everything ends up in the new team repo **`https://github.com/avery-w/Bobathon_FA26_`**. The old repo `avery-w/Bobathon_FA26` is read-only: never push to it.

1. **Unzip both.** Unzip `Bobathon_Final.zip` anywhere you like, which gives you a `Bobathon_Final/` folder. Unzip `Bobathon_Team_Plan.zip` **into** that folder as `Bobathon_Final/team-plan/`:
   ```bash
   unzip Bobathon_Final.zip                                  # creates Bobathon_Final/
   unzip Bobathon_Team_Plan.zip -d Bobathon_Final/team-plan
   rm -rf __MACOSX                                           # macOS zip leftovers, if present
   ```
2. **Open it in Bob.** Choose **File → Open Folder…**, select `Bobathon_Final`, and trust the folder if Bob asks. Open the Bob chat panel and start a new task for each step in your brief.
3. **Before S1, Bob works in `Bobathon_Final`.** It can read all three projects and `team-plan/`.
   - Lane A builds the combined repo inside `Bobathon_Final/Bobathon_V2/`.
   - Lane B works inside `Bobathon_Final/Bobathon_V2/` on its own branch.
   - Lanes C and D only read and plan until S1.
4. **At S1, everyone switches to a clone of the team repo.** Lane A pushes Foundation to `https://github.com/avery-w/Bobathon_FA26_`. Then everyone (Lane A included) clones it inside `Bobathon_Final` and opens **that** folder in Bob for all remaining work:
   ```bash
   cd Bobathon_Final
   git clone https://github.com/avery-w/Bobathon_FA26_.git bob-time-machine
   cd bob-time-machine && corepack enable && pnpm install --frozen-lockfile
   ```
   In Bob, choose **File → Open Folder…** → `Bobathon_Final/bob-time-machine`. From then on the plan lives in the repo at `docs/team/`, and `contracts/` sits at the repo root.
5. **Repo access:** Avery owns `https://github.com/avery-w/Bobathon_FA26_`. Avery creates it **empty** (no README, licence or .gitignore) and adds Orion, Ashwini and Nicky as collaborators with write access **before S1**.

---

## 1. The four lanes

| Lane | Name | Builds (milestones in FINAL_BUILD_PLAN.md) | Owner |
| --- | --- | --- | --- |
| **A** | Platform, Demo & Integration *(lead)* | Foundation (most of M1), CI (M1e), M4, `dev-all.sh` (M6i), M7, merge queue | **Orion** |
| **B** | Provenance | M2 | **Ashwini** |
| **C** | Data Bridge | M3 + M5 (server modules, API routes, `joinLedger`) | **Avery** |
| **D** | Cockpit UI | M6a–h + `sessionGraph.ts` from M5b | **Nicky** |

Each lane has its own brief in `lanes/`. Bob reads it from `team-plan/` before S1 and from `docs/team/` in the repo after S1, together with this file, `FINAL_BUILD_PLAN.md` and `contracts/`.

---

## 2. Who owns which files

The owner is the only lane that commits changes to these paths. If your Bob needs a change in someone else's file, it **stops and asks** (section 6). It never edits the file itself.

| Path | Owner |
| --- | --- |
| Root files: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `.github/**` | **A** |
| `contracts/**`, `apps/web/src/types/ledger.ts` | **A** (contract owner, see section 5) |
| `demo/**`, `scripts/**`, `test/**` (root), `examples/**` (read-only for everyone) | **A** |
| Root `README.md`, `ARCHITECTURE.md`, `STATUS.md`, `DECISIONS.md`, `PLAN.md`, `docs/time-machine/**`, `docs/team/**` | **A** |
| `apps/web/package.json`, `apps/web/tsconfig.json` | **A** |
| `packages/**`, `docs/provenance/**` (except the read-only spec) | **B** |
| `apps/analytics/**` | **C** |
| `apps/web/src/lib/server/**`, `apps/web/src/lib/ledger.ts`, `apps/web/src/app/api/ledger/**`, `apps/web/src/app/api/impact/**`, `apps/web/src/app/api/config/**`, `apps/web/test/ledger.test.ts` | **C** (A writes the first stub versions in Foundation, then hands them to C) |
| Everything else under `apps/web/` (`src/components/**`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/ledger/**`, `src/app/globals.css`, `src/stores/**`, `src/types/decision.ts`, `src/data/**`, `src/lib/sessionGraph.ts`, `apps/web/test/sessionGraph.test.ts`, `tailwind.config.ts`, `postcss.config.js`) | **D** |
| `apps/web/src/app/api/drift/**`, `apps/web/src/app/api/replay/**` | Nobody (unchanged) |
| `status/lane-X.md`, `decisions/lane-X.md` | Lane X |

The files that cause most merge conflicts are `STATUS.md`, `DECISIONS.md` and the lockfile. Here is how each is handled:

- **Status:** each lane writes only `status/lane-X.md`. A merges them into the root `STATUS.md` in M7.
- **Decisions:** each lane numbers its own (`A1…`, `B1…`, `C1…`, `D1…`) in `decisions/lane-X.md`.
- **Lockfile:** nobody adds dependencies (FINAL_BUILD_PLAN.md rule 4). Always run `pnpm install --frozen-lockfile`. If `pnpm-lock.yaml` shows up in your diff, revert it.

---

## 3. Order of work and sync points

```
          ┌── Foundation (A, ~1 h) ──┐
A ────────┴──────────────────────────┴── CI ── M4 demo ── integration test ───── M6i, M7, PR
B ── M2 (starts at once: packages/ never moves) ──── PR #B ───────────────────────────────
C ············ (prep) ·········· M3 ── M5 (against contracts) ──── PR #C ─────────────────
D ············ (prep) ·········· M6 (against stub API + contracts) ──────── PR #D ────────
                               S1                    S2           S3        S4
```

| Sync point | Trigger | Everyone does |
| --- | --- | --- |
| **S1** | Foundation is pushed to `final` on `https://github.com/avery-w/Bobathon_FA26_` | Clone the team repo (section 0, step 4) and open it in Bob. B rebases its branch onto `final`. Run `pnpm install --frozen-lockfile` and the check suite. C and D start building. |
| **S2** | PR #B is merged (decision refs are real) | A: the scenario now keeps `decisionRefs`, so A turns on the impact assertions in the integration test. C: run the live check of M5's `/api/impact`. |
| **S3** | PR #C is merged (real `/api/ledger`) | D: stop setting `BTM_MOCK`, check the M6 acceptance list on live data. |
| **S4** | PR #D is merged | A: full M6 acceptance run and M7 docs, then publishes `final` as `main` with the `v1.0-bobathon` tag. |

**Before S1:**
- **B** can start right away: branch from `provenance` inside `Bobathon_Final/Bobathon_V2`, because Foundation does not move anything under `packages/`. Leave the `docs/provenance/` edits (M2g) until after S1, because Foundation moves those files.
- **C** and **D** prepare. Have Bob read the brief, the plan and the contracts, and write a short task list into a scratch file in `Bobathon_Final/` (it moves into `status/lane-X.md` after S1). Write no code until S1, because Foundation moves the folders you will work in.

PRs #B, #C and #D can merge in any order. The order above is just the likely one.

---

## 4. Branches and the merge queue

- **Repo:** `https://github.com/avery-w/Bobathon_FA26_`. Every lane branch and PR goes there.
- **Integration branch:** `final`. Only A merges into it. Nobody else pushes to it, and nobody force-pushes it. Nobody pushes to `main`; A publishes `final` as `main` at the end.
- **Lane branches:** `lane/a-platform`, `lane/b-provenance`, `lane/c-data`, `lane/d-cockpit`. Short-lived sub-branches like `lane/b-provenance-mcp` are fine.
- **Keep PRs small.** At most 2–3 PRs per lane, for example B: "core + CLI", then "MCP + VS Code + docs".
- **Merge queue (A runs it):**
  1. Merge one PR at a time.
  2. Before merging, the PR must be rebased on the current `final` and the check suite must be green. The check suite is in FINAL_BUILD_PLAN.md and is the same for every lane.
  3. After each merge, A posts in the team chat: `final → <short sha>: merged <PR>. Rebase before your next PR.`
- **When to rebase:** only at a sync point or right before you open a PR. **Never rebase in the middle of a Bob task.** Frequent mid-task rebasing is the main cause of whiplash.

---

## 5. Contracts: how lanes work without waiting

`contracts/` holds the exact JSON every hand-off produces for the demo scenario. Each file was generated from a real Provenance run, and `contracts/README.md` says who produces and who consumes each one. Everyone builds against these files, not against each other's unfinished code.

- **D builds the whole UI before C finishes.** Foundation ships stub routes:
  - `GET /api/ledger` returns `contracts/ledger-response.json`.
  - Setting `BTM_MOCK=nospend` or `BTM_MOCK=unavailable` returns the other two fixtures.
  - `GET /api/config` returns `{ "analyticsUrl": "http://localhost:8765/" }`.
  - **C keeps `BTM_MOCK` support** when it replaces the stubs, so D can still test the failure states, and the demo has a fallback.
- **C builds and tests `joinLedger` before B finishes.** C's unit test feeds it `prov-report.json`, `prov-impact.json` and `spend-export.json` and expects exactly `ledger-response.json`. The same test with spend `null` expects `ledger-no-spend.json`.
- **B proves its output matches.** B adds a shape test: the keys of `prov impact --json` and of a `report.sessions[]` row must equal the keys in the fixtures.
- **A is the referee.** The integration test builds the real demo, runs the real CLI and `export.py`, calls C's `joinLedger`, and deep-compares the result with `ledger-response.json`. It ignores only `head`.

### Changing a contract

Contracts are frozen during the build, and changes should be rare. If a lane needs one:
1. **Ask:** post in the team chat what you need and why, tagging A.
2. **Change:** A makes the change in one small PR to `contracts/` and `apps/web/src/types/ledger.ts`, and bumps the version line in `contracts/README.md`.
3. **Additive only:** during the build, only add optional fields. Renaming or removing a field needs all four lanes to agree.
4. **Everyone rebases** after A merges the change.

---

## 6. Rules for every Bob session (paste with your lane brief)

```text
You are working in Lane <X> of a 4-lane team build. Read docs/team/TEAM.md,
docs/team/lanes/<X>-*.md, docs/team/FINAL_BUILD_PLAN.md and contracts/README.md before
writing code. (Before S1 these are in team-plan/ instead of docs/team/.)
- Only create or edit files that TEAM.md section 2 assigns to Lane <X>. Before editing any file,
  check that it is in your list. If a change is needed in a file you do not own, do not edit it:
  write the request under "Needs from other lanes" in status/lane-<x>.md and tell me.
- Never edit contracts/, apps/web/src/types/ledger.ts, the root config files, or pnpm-lock.yaml
  (unless you are Lane A).
- Never add or upgrade dependencies. Use `pnpm install --frozen-lockfile`.
- Never run a formatter or linter with --fix on files outside your lane. Never rename or move
  files you do not own.
- Never push to `final` or `main`, and never force-push a shared branch. Commit to your lane branch only.
- Do not rebase or pull in the middle of a task unless I ask.
- Record progress in status/lane-<x>.md and judgment calls in decisions/lane-<x>.md (numbered <X>1, <X>2, …).
- Run the check suite from FINAL_BUILD_PLAN.md before every commit you intend to push.
- Start a new Bob task for each numbered step in your lane brief.
```

---

## 7. Team rhythm

- **Chat updates:** one team chat thread. Post only at sync points, when you open a PR, and when you are blocked.
- **Status file:** each lane keeps its own up to date with what's done, what's next, any blocker, and "Needs from other lanes". A reads them all at every sync point.
- **Blocked for more than 20 minutes?** Post in the chat. A either answers, changes a contract, or re-scopes.
- **Demo freeze:** once S4 is reached, only A merges, and only fixes for M6 acceptance failures.

---

## 8. How this overrides FINAL_BUILD_PLAN.md

In team mode, the following replace the plan's "Instructions for Bob":
- Rule 2 (one milestone at a time, in order) is replaced by the lane order in section 3.
- Rule 3 (STATUS.md, DECISIONS.md) is replaced by the per-lane files in section 2.
- Rule 8 (work on `final`) is replaced by the lane branches and merge queue in section 4.

Everything else in FINAL_BUILD_PLAN.md applies unchanged: the specs, numbers, guardrails and check suite.
