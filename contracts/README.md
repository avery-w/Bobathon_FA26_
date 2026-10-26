# Contracts

These files are the **only** thing the four lanes share while building in parallel. Every lane builds against them from the first minute, and nobody waits for another lane's code.

They were generated from a real `prov report --json` run on the Provenance demo repo. Session ids and dates were then rewritten to the scenario values (FINAL_BUILD_PLAN.md, M4a), `decisionRefs` were added, and the costs from M4b were applied. Producers must make their real output match these files. Consumers may rely on them.

Contract version: **1** (bump this line in any contract PR)

| File | What it is | Producer (must match it) | Consumers (build against it) |
| --- | --- | --- | --- |
| `prov-report.json` | `prov report --json` on `demo/out/payments-repo` | Lane B (CLI) + Lane A (scenario data) | Lane C |
| `prov-impact.json` | `prov impact --json` (no ref) on the same repo | Lane B | Lane C |
| `spend-export.json` | `python3 apps/analytics/export.py --repo … --db demo/out/bob.db` | Lane C (code) + Lane A (seeded DB) | Lane C |
| `ledger-response.json` | `GET /api/ledger` body when everything is up | Lane C | Lane D |
| `ledger-no-spend.json` | `GET /api/ledger` body when `export.py` fails | Lane C | Lane D |
| `ledger-unavailable.json` | `GET /api/ledger` body when `prov` fails | Lane C | Lane D |
| `ledger.ts` | TypeScript types for the three ledger bodies and `/api/config` | Lane A | Lanes C and D (copied to `apps/web/src/types/ledger.ts`) |

## Rules for matching

- **Ignore volatile fields:** `head`, `generatedAt` and `out`. Everything else must be equal: values, key names, ordering of arrays.
- **Ordering:**
  - `report.sessions` and `rows` are in session-id order (which is `createdAt` order).
  - `decisions` and `impacts` are sorted by `ref`.
  - `ranges` are sorted by `file`, then `start`.
  - `spend.sessions` is in session-id order.
- **Money** is raw numbers, rounded to 4 decimals in data. The UI rounds to 2 decimals for display.
- **No spend** (`ledger-no-spend.json`): every cost field is `null`, `taskId` is `null`, `match` is `"none"`, and `unmatchedSessions` equals the row count.

## Key numbers (for eyeballing)

| | Sessions | Lines at HEAD | Unreviewed | Rejected | Bobcoins |
| --- | --- | --- | --- | --- | --- |
| ADR-104 | 4 | 49 | 33 | 2 | 7.35 |
| RCA-2024-88 | 1 (A) | 16 | 0 | 0 | 3.42 |
| CISO-2024-12 | 1 (D) | 2 | 2 | 2 | 0.48 |

Repo totals: 131 lines, 49 AI (37.4%), 33 unreviewed AI (25.2%). Costs: approved 3.42, unreviewed 3.45, rejected 0.48, at risk 3.93, 0.15 per surviving line.
