# Lane D: Cockpit UI

**Owner:** Nicky

**Mission:** make the Time Machine show the code: session nodes in the graph, the blast radius in the drift alert, honest KPIs, a ledger page, and navigation.

**You own:** everything under `apps/web/` that TEAM.md section 2 does not give to A or C. The main paths are `src/components/**`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/ledger/**`, `src/stores/**`, `src/types/decision.ts`, `src/data/**`, `src/lib/sessionGraph.ts` and `apps/web/test/sessionGraph.test.ts`.
**Repo:** `https://github.com/avery-w/Bobathon_FA26_`. **Branch:** `lane/d-cockpit`, from `final` after S1.
**Spec:** FINAL_BUILD_PLAN.md M6a–6h, plus the `sessionGraph.ts` half of M5b (`buildSessionGraph`, `impactAsOf` and their tests).

**Before S1:** unzip both zips and open `Bobathon_Final` in Bob (TEAM.md section 0). Write no code. Have Bob read `team-plan/`, `team-plan/contracts/ledger-response.json` and the components in `Bobathon_FA26-main/src/`, and draft your task list in a scratch file.

**At S1:** clone `https://github.com/avery-w/Bobathon_FA26_` into `Bobathon_Final/bob-time-machine`, open that folder in Bob, and run `git checkout -b lane/d-cockpit origin/final`. Push your branch with `git push -u origin lane/d-cockpit`.

---

## How you work before Lane C is done

Foundation gives you a stub `/api/ledger` that serves the contract fixtures, so you never wait for real data:

```bash
pnpm --filter bob-time-machine dev                           # full ledger (ledger-response.json)
BTM_MOCK=nospend pnpm --filter bob-time-machine dev          # costs unavailable
BTM_MOCK=unavailable pnpm --filter bob-time-machine dev      # Provenance not connected
```

Import types only from `@/types/ledger`, which is frozen. Do not import from `@/lib/ledger` or `@/lib/server`; those are Lane C's and may not exist yet. All your data comes through `fetch('/api/ledger')` and `fetch('/api/config')`.

## Steps (one Bob task each)

1. **D1: `src/lib/sessionGraph.ts` and its tests.** Pure functions, `import type` only. Fixtures come from `contracts/ledger-response.json`, read in the test with `fileURLToPath(new URL('../../../contracts/ledger-response.json', import.meta.url))`.
   - **Required test cases:** node count 4; positions `x = 50, 380, 710, 1040`, `y = 640`; edge colours; edges from `RCA-2024-88` → A, `CISO-2024-12` → D, `ADR-104` → all four; an unknown ref adds no edge.
   - **`impactAsOf(rows, 'ADR-104', …)`:**

     | Epoch | Result |
     | --- | --- |
     | `2024-12-12` | all zeros |
     | `2025-02-28` | sessions 3, lines 47, unreviewed 31, rejected 0, cost 6.87 |
     | `2026-03-31` | 4 / 49 / 33 / 2 / 7.35 |

2. **D2: M6a and M6b** (types, `ref`s, the new milestone, the store with `PRESENT_INDEX`, `edges` in state, and `loadLedger`).
3. **D3: M6c and M6d** (graph session nodes, slider with four stops).
4. **D4: M6e** (the "Code built on this decision" card, the dated banner, `SessionPanel`).
5. **D5: M6f** (KPIs).
6. **D6: M6g and M6h** (ledger page, top bar navigation). The "Bob Usage" link gets its URL from `/api/config`.

## PRs (two)

| PR | Contents |
| --- | --- |
| **D-1** | D1–D5 (graph, store, slider, drift card, KPIs) |
| **D-2** | D6 (ledger page and navigation) |

Check each PR against the M6 acceptance list (FINAL_BUILD_PLAN.md) **using the stub**:
- Checks 1–5 with `BTM_MOCK` unset.
- Check 6 with `BTM_MOCK=nospend`: costs show `—`, nothing breaks.
- Check 7 with `BTM_MOCK=unavailable`: static graph plus the "Provenance not connected" line.

Before S3, the "Open compliance report" button can show a 404 (Lane C's route). That's expected; note it in your status file.

## At S3 (Lane C's live data is merged)

Rebase, run `pnpm demo`, start the app without `BTM_MOCK`, and run checks 1–7 again on live data. The numbers must be identical, because the stub and the live API serve the same contract. Any difference is a contract bug: report it in the chat, and do not patch around it in the UI.

## Must stay true

- Every number on screen comes from the ledger response or the existing `demoData.ts`. No numbers typed into components.
- The existing look stays: obsidian theme, inline styles plus Tailwind, no new dependencies, `/api/drift` and `/api/replay` untouched.
- Do not edit `apps/web/package.json`, `apps/web/src/types/ledger.ts`, `contracts/` or Lane C's files. If you need a change there, write it under "Needs from other lanes" in your status file and tell the owner.

## Kickoff prompt for your Bob

```text
You are Lane D (Cockpit UI). The open folder is the team repo; the plan is in docs/team/. Read TEAM.md, lanes/D-cockpit.md,
FINAL_BUILD_PLAN.md (M5b and M6) and
contracts/README.md. Only edit the apps/web files TEAM.md assigns to Lane D. Get data only from
/api/ledger and /api/config, typed with @/types/ledger. In this task, do step D1 (sessionGraph.ts and
its tests). Run `pnpm test` and stop when green.
```
