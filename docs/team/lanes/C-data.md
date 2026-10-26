# Lane C: Data Bridge

**Owner:** Avery

**Mission:** turn Bob's usage database into a cost for each AI session, and serve the joined ledger that the cockpit reads.

**You own:** `apps/analytics/**`, `apps/web/src/lib/server/**`, `apps/web/src/lib/ledger.ts`, `apps/web/src/app/api/ledger/**`, `apps/web/src/app/api/impact/**`, `apps/web/src/app/api/config/**` and `apps/web/test/ledger.test.ts`.
**Repo:** `https://github.com/avery-w/Bobathon_FA26_`. **Branch:** `lane/c-data`, from `final` after S1.
**Spec:** FINAL_BUILD_PLAN.md M3 (all of it) and M5. In M5 you skip **5a** (the types are frozen in `contracts/ledger.ts` and already at `apps/web/src/types/ledger.ts`) and the `sessionGraph.ts` half of **5b** (that is Lane D's).

**Before S1:** unzip both zips and open `Bobathon_Final` in Bob (TEAM.md section 0). Write no code. Have Bob read `team-plan/`, `team-plan/contracts/` and `Bobathon_FA26-bob_analytics/bob-analytics/`, and draft your task list in a scratch file.

**At S1:** clone `https://github.com/avery-w/Bobathon_FA26_` into `Bobathon_Final/bob-time-machine`, open that folder in Bob, and run `git checkout -b lane/c-data origin/final`. Push your branch with `git push -u origin lane/c-data`.

---

## Step C1: Analytics (M3), as PR C-1

Build M3a–3e exactly as specified. In addition:

- **Contract test** in `apps/analytics/tests/test_provenance_join.py`:
  - Build a temp repo containing the four scenario session files (ids and `createdAt` from FINAL_BUILD_PLAN.md M4a; other fields can be minimal but must be valid).
  - Build a temp DB with the four scenario tasks from M4b (`demo-task-A` to `demo-task-D`, costs 3.42 / 2.10 / 1.35 / 0.48, each window from 20 minutes before to 2 minutes after its session).
  - Run `export.py` against them and check the output equals `contracts/spend-export.json`, except `generatedAt`.
- You do not need Lane A's `demo/` for this, because the test builds its own data.

PR C-1 touches `apps/analytics/` only, so it can merge early and independently.

## Step C2: Web data layer (M5), as PR C-2

1. **`apps/web/src/lib/ledger.ts`** (pure; `import type` only):
   - Export the input types for the three sources: `ProvReport` (the `report` object from `prov report --json`), `ProvImpacts` (`{ decisions: … }`) and `SpendExport`. Base them on the fixture shapes.
   - Export `joinLedger(report: ProvReport, impacts: ProvImpacts, spend: SpendExport | null, repoName: string): LedgerResponse`, using the types from `@/types/ledger`.
   - Rules: FINAL_BUILD_PLAN.md M5b and `contracts/README.md` ("Rules for matching"). `impacts[].ranges` keep only `file, start, end, sessionId, status`. `impacts[].cost` is the sum of its sessions' costs (null without spend).
2. **`apps/web/test/ledger.test.ts`:**
   - Join the three fixtures; the result must **deep-equal** `contracts/ledger-response.json`.
   - Join with `spend = null`; the result must deep-equal `contracts/ledger-no-spend.json`.
   - Plus the M5b cases: rounding, and cost per line with 0 lines gives `null`.
3. **`src/lib/server/sources.ts`:** as in M5c.
4. **Routes** (M5d): replace Lane A's stub in `api/ledger/route.ts` and add `api/impact`, `api/ledger/report` and `api/config` (keep it as is, or tidy it up).
   - **Keep `BTM_MOCK`:** when it is set (`ok`, `nospend` or `unavailable`), return the matching fixture without running anything. Lane D uses it to test states, and it is the demo fallback. `ok` maps to `ledger-response.json`.
   - When `BTM_MOCK` is unset, serve live data.
   - Read fixtures from `<root>/contracts/`.

## Live check (after S2 and Lane A's demo PR)

```bash
pnpm build:prov && pnpm demo
pnpm --filter bob-time-machine dev        # no BTM_MOCK
curl -s 127.0.0.1:3000/api/ledger > /tmp/live.json
```
- `/tmp/live.json` must equal `contracts/ledger-response.json` except `head`.
- `/api/impact?ref=ADR-104` returns 49 lines and cost 7.35.
- `/api/impact?ref=../x` returns 400.
- With the analytics database renamed, `/api/ledger` matches `ledger-no-spend.json` (except `head`).

Record the results in `status/lane-c.md`. When C-2 merges, that is **S3**.

## Must stay true

- `server.py`, `compute()`, the analytics web dashboard and the security behaviour are unchanged. The 54 old analytics tests pass without edits.
- `export.py` never prints prompt text.
- No absolute paths in any API response (`repoName` only).
- Do not edit `apps/web/src/types/ledger.ts` or `contracts/`. If they need a change, ask Lane A (TEAM.md section 5).

## Kickoff prompt for your Bob

```text
You are Lane C (Data Bridge). The open folder is the team repo; the plan is in docs/team/. Read TEAM.md, lanes/C-data.md,
FINAL_BUILD_PLAN.md (M3 and M5) and
contracts/README.md. Only edit the files TEAM.md assigns to Lane C. In this task, build M3a and M3b with
tests. Run `pnpm test:py` and stop when green.
```
Next tasks: M3c, 3d and 3e plus the contract test (then open PR C-1); then `ledger.ts` and its tests; then `sources.ts` and the routes (then open PR C-2).
