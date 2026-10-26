# Lane A: Platform, Demo & Integration (lead)

**Owner:** Orion

**Mission:** build the shared ground everyone stands on, then prove that the three other lanes' work fits together. You also run the merge queue.

**You own:** see TEAM.md section 2, every row marked **A**.
**Repo:** `https://github.com/avery-w/Bobathon_FA26_` (empty until you push Foundation). **Branch:** Foundation goes straight onto `final`; after that, use `lane/a-platform` and PRs like everyone else.
**Spec:** FINAL_BUILD_PLAN.md: M0, M1, M4, M6i, M7, and optionally M8.

---

## Step A0: Foundation (do this first; everyone else waits for it)

Aim for about an hour. Leave out anything that is not on this list; it goes in a later PR.

**Before you start:** Avery has created the empty repo and added you as a collaborator. Both zips are unzipped as described in TEAM.md section 0. Bob has `Bobathon_Final` open. Every command in A0 runs in `Bobathon_Final/Bobathon_V2`.

1. **M0, then M1a, 1b, 1c, 1d and 1f**, exactly as written in the plan. **Skip 1e (CI) for now**: the old root workflow keeps working, and you replace it in A1.
2. **Contracts and plan:** copy `../team-plan/contracts/` to the repo root as `contracts/`. Copy `../team-plan/TEAM.md`, `../team-plan/FINAL_BUILD_PLAN.md` and `../team-plan/lanes/` to `docs/team/` (M1c). Copy `contracts/ledger.ts` byte-for-byte to `apps/web/src/types/ledger.ts`.
3. **Stub routes** (these hand over to Lane C after S1):
   - `apps/web/src/app/api/ledger/route.ts`:
     - `export const dynamic = 'force-dynamic'; export const runtime = 'nodejs';`
     - Root is `process.env.BTM_ROOT ?? path.resolve(process.cwd(), '..', '..')`.
     - `BTM_MOCK` picks the file: `nospend` → `ledger-no-spend.json`; `unavailable` → `ledger-unavailable.json`; anything else, or unset → `ledger-response.json`.
     - Read the file with `fs.promises.readFile`, `JSON.parse` it, and return it with `NextResponse.json`.
     - Put a top comment: `// STUB (Lane A Foundation). Lane C replaces the unset-BTM_MOCK branch with live data.`
   - `apps/web/src/app/api/config/route.ts`: returns `{ analyticsUrl: process.env.BTM_ANALYTICS_URL ?? 'http://localhost:8765/' }`, with the same `dynamic` and `runtime` exports.
4. **Lane files:** create `status/lane-a.md` through `status/lane-d.md`, each with the headings `Done`, `Next`, `Blocked`, `Needs from other lanes`. Create `decisions/lane-a.md` through `decisions/lane-d.md`, each with only a title. Make the root `STATUS.md` and `DECISIONS.md` one-line pointers to those folders for now. Make `PLAN.md` a short restatement of the four lanes.
5. **Check:**
   - The check suite is green: 126 Provenance tests, 54 analytics tests, and the web build succeeds.
   - `pnpm --filter bob-time-machine dev`, then `curl -s 127.0.0.1:3000/api/ledger | head -c 200` shows `"status": "ok"`.
   - `BTM_MOCK=unavailable` shows `"status": "unavailable"`.
6. **Ship:** the new repo is empty, so Foundation is pushed directly as `final`:
   ```bash
   git remote add origin https://github.com/avery-w/Bobathon_FA26_.git
   git push -u origin final
   ```
   Do not push `main`, `provenance` or any notes refs. Then post **S1** in the team chat: `final → <sha>: Foundation pushed. Everyone: clone the team repo (TEAM.md §0 step 4). Ashwini: rebase. Avery, Nicky: start.`
7. **Switch your own workspace:** clone `https://github.com/avery-w/Bobathon_FA26_` into `Bobathon_Final/bob-time-machine`, then in Bob choose **File → Open Folder…** → `bob-time-machine`. From here on, never work in `Bobathon_V2` again.

## Step A1: CI (M1e)

Write the four-job workflow exactly as in M1e, as its own PR. Merge it once all four jobs are green.

## Step A2: Demo scenario (M4a–4c)

- Build `demo/payments-scenario.sh`, `demo/seed_bob_db.py` and `demo/build-demo.sh` as specified.
- **Before S2**, `prov record --from-json` silently drops `decisionRefs`, because the schema doesn't know the field yet. Write the refs in the JSON anyway. They will survive once PR #B lands, and nothing else changes.
- **Check before merging:** `pnpm demo` twice in a row; then `prov report --json` on `demo/out/payments-repo` gives 131 / 49 / 33 and surviving lines A=16, B=12, C=19, D=2. Compare it with `contracts/prov-report.json`, ignoring `head`, `generatedAt`, `out`, and `decisionRefs` before S2.
- Merge as early as possible. C and D need `demo/out` for their live checks.

## Step A3: Integration test, built up in three stages

Write `test/integration/combined.test.ts` (M4d) and grow it as lanes land:

| Stage | When | Assertions to add |
| --- | --- | --- |
| 1 | Together with A2 | Report numbers and the five commit dates |
| 2 | After **S2** (PR #B merged) | `prov impact --json` deep-equals `contracts/prov-impact.json` (fixture `ranges` include `promptExcerpt`; match them fully); the M4d totals for ADR-104, RCA-2024-88 and CISO-2024-12 |
| 3 | After **S3** (PR #C merged) | `export.py` output equals `contracts/spend-export.json` except `generatedAt`. Then import `joinLedger` from `apps/web/src/lib/ledger.ts`, feed it the real report, impact and spend output, and deep-compare the result with `contracts/ledger-response.json`, setting `head` to the real HEAD sha first. |

The test must import nothing but `joinLedger` from the web app. If stage 3 fails, find which side drifted from the contract, and send the fix to that lane. Do not change the contract to make the test pass.

## Step A4: `scripts/dev-all.sh` (M6i)

Write it any time after A2.

## Step A5: Full acceptance and submission (after S4)

1. **M6 acceptance:** run all 7 manual checks yourself on a fresh clone of `https://github.com/avery-w/Bobathon_FA26_` (branch `final`), and record the results in `status/lane-a.md`.
2. **M7:** write the README, ARCHITECTURE.md and the demo script. Merge the four `status/` and `decisions/` files into the root `STATUS.md` and `DECISIONS.md`, keeping the lane prefixes.
3. **Publish (M7 step 5):** once the team agrees in the chat, run `git push origin final:main`, then tag and push `v1.0-bobathon`. Ask Avery to set `main` as the default branch on GitHub. Post the repo link in the chat.

## Running the merge queue

- **One PR at a time.** Before merging, the PR must be rebased on `final`, the check suite must be green in CI, and the diff must touch only that lane's paths. Check with `git diff --name-only final...<branch>` against TEAM.md section 2.
- **Wrong-owner files:** if a PR touches a file another lane owns, send it back. The only exception is a change that owner has approved in the chat; record it in `decisions/lane-a.md`.
- **After each merge,** post the new `final` sha and what landed.

## Kickoff prompt for your Bob

```text
You are Lane A (Platform, Demo & Integration). The open folder is Bobathon_Final. Read
team-plan/TEAM.md, team-plan/lanes/A-platform.md, team-plan/FINAL_BUILD_PLAN.md and
team-plan/contracts/README.md. The repo you build in is Bobathon_V2/; run every git and pnpm
command there. Do only Step A0 (Foundation) in this task: FINAL_BUILD_PLAN.md M0 and M1 (skip M1e),
then the contract and plan copy, stub routes and lane files from A0. Stop when A0's checks pass and
show me the push commands from A0 step 6 before running them.
```
Start a new Bob task for each later step (A1, A2, …), using the same opening sentence.
