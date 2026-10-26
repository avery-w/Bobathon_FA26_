# Lane B: Provenance

**Owner:** Ashwini

**Mission:** teach Provenance about decisions: sessions record `decisionRefs`, `prov impact` reports the blast radius of a decision, and Bob can ask about it through MCP.

**You own:** `packages/**` and `docs/provenance/**` (except the read-only spec).
**Branch:** `lane/b-provenance`.
**Spec:** FINAL_BUILD_PLAN.md M2 (2a–2g).

You can **start immediately**. Foundation does not move anything under `packages/`.

---

## Before S1 (Foundation not merged yet)

Unzip both zips and open `Bobathon_Final` in Bob (TEAM.md section 0). Work inside `Bobathon_V2`, which is already a git repo:
```bash
cd Bobathon_Final/Bobathon_V2
git checkout provenance && git checkout -b lane/b-provenance
corepack enable && pnpm install --frozen-lockfile && pnpm build && pnpm test     # 126 pass
```
Never push from this folder. Its `origin` is the old repo.

Build M2a–2f on this branch. Leave **2g (docs)** for after S1, because Foundation moves those files into `docs/provenance/`.

## At S1

Lane A announces S1 in the chat. Then move your branch onto the team repo's `final`, still inside `Bobathon_V2`:
```bash
git remote add team https://github.com/avery-w/Bobathon_FA26_.git
git fetch team
git rebase --onto team/final provenance lane/b-provenance
pnpm install --frozen-lockfile && pnpm build:prov && pnpm test
git push -u team lane/b-provenance
```
This should be conflict-free: you only touched `packages/`, and Foundation didn't. Then switch workspaces: clone the team repo into `Bobathon_Final/bob-time-machine` (TEAM.md section 0, step 4), run `git checkout lane/b-provenance`, and open `bob-time-machine` in Bob. Keep working there.

## After S1

1. **Docs (M2g):** do the docs updates in `docs/provenance/agent-instructions.md` and `docs/provenance/README.md`.
2. **Contract shape test:** add `packages/cli/test/contract.test.ts`. It builds a throwaway repo with one session that has `decisionRefs` (reuse the helpers from `e2e.test.ts`), commits it, and runs `prov report --json` and `prov impact --json`. Then it asserts:
   - The key set of `report.sessions[0]` equals the key set of `contracts/prov-report.json` → `report.sessions[0]`.
   - The key sets of a `decisions[0]` entry, its `totals`, and a `ranges[]` item equal those in `contracts/prov-impact.json`.

   Read the fixtures through a path relative to the repo root: `fileURLToPath(new URL('../../../contracts/…', import.meta.url))`.

## PRs (two)

| PR | Contents | Can open |
| --- | --- | --- |
| **B-1** | 2a schema, 2b report rows, 2c impact, 2d CLI (`--decision`, `prov impact`) and their tests | Right after S1 (after rebasing) |
| **B-2** | 2e MCP (`record_session.decisionRefs`, `find_sessions_for_decision`, plus the expected `mcp.test.ts` tool-list update), 2f VS Code hover, 2g docs, contract shape test | After B-1 is merged |

When B-1 merges, that is **S2**: Lane A turns on the impact checks in the integration test.

## Must stay true (Lane A's integration test checks these)

- Existing snapshots unchanged: `git diff --stat final -- '*.snap'` is empty.
- On the demo repo, `prov impact --json` deep-equals `contracts/prov-impact.json`, ignoring nothing. Key order inside objects doesn't matter. Array order does: `decisions` by ref, `sessionIds` by createdAt, `ranges` by file then start.
- `prov impact --json` for an unknown ref returns zero totals and exit code 0.

## Not yours

`contracts/`, root configs, `examples/` (read-only; `demo-repo.sh` and its test must keep passing unchanged), and anything in `apps/`, `demo/` or `test/`. If you think a contract is wrong, post in the chat and tag Lane A (TEAM.md section 5).

## Kickoff prompt for your Bob

```text
You are Lane B (Provenance). Before S1 the open folder is Bobathon_Final, the plan is in team-plan/, and you work in the
Bobathon_V2/ repo; after S1 the open folder is the repo and the plan is in docs/team/. Read TEAM.md, lanes/B-provenance.md,
FINAL_BUILD_PLAN.md (section M2) and
contracts/README.md. Only edit files under packages/ (and docs/provenance/ after S1). In this task, build
M2a, M2b and M2c with their tests. Run `pnpm lint && pnpm build && pnpm test` and stop when green.
```
Next tasks: M2d (CLI), then M2e (MCP), then M2f (VS Code), then (after S1) M2g plus the contract test.
