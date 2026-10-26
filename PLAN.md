# Plan

Four lanes build the combined Bob Time Machine product in parallel:

| Lane | Owner | Milestone(s) |
|------|-------|--------------|
| A: Platform, Demo & Integration | Orion | Foundation (M0, M1), CI (M1e), Demo (M4), Integration test (M4d), `dev-all.sh` (M6i), Docs (M7) |
| B: Provenance | Ashwini | Decision refs + `prov impact` (M2) |
| C: Data Bridge | Avery | `export.py`, cost API, `joinLedger` (M3, M5) |
| D: Cockpit UI | Nicky | Graph, drift card, KPIs, ledger page (M6a–h) |

Sync points: S1 (Foundation pushed) → S2 (PR #B merged) → S3 (PR #C merged) → S4 (PR #D merged) → submission.

Full spec: [docs/team/FINAL_BUILD_PLAN.md](docs/team/FINAL_BUILD_PLAN.md)
Team rules: [docs/team/TEAM.md](docs/team/TEAM.md)
