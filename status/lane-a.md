# Lane A Status

## Done

- M0: renamed `origin` → `legacy`, created `final` branch
- M1a: imported Bob Time Machine into `apps/web` with full git history
- M1b: imported Bob Analytics into `apps/analytics`
- M1c: moved Provenance docs to `docs/provenance/`, Time Machine docs to `docs/time-machine/`, copied team plan to `docs/team/`
- M1d: updated workspace files (`pnpm-workspace.yaml`, `package.json`, `apps/web/package.json`, `eslint.config.js`, `vitest.config.ts`, `.gitignore`)
- M1f: ran `pnpm install`, updated `pnpm-lock.yaml`, `pnpm build:web` succeeds
- Copied `contracts/` to repo root and `contracts/ledger.ts` to `apps/web/src/types/ledger.ts`
- Wrote stub `apps/web/src/app/api/ledger/route.ts` (BTM_MOCK support)
- Wrote stub `apps/web/src/app/api/config/route.ts`
- Created `status/` and `decisions/` lane files, root `STATUS.md`, `DECISIONS.md`, `PLAN.md`

## Next

- Run full check suite and push `final` to the team repo (S1)
- A1: CI workflow (M1e)
- A2: Demo scenario (M4a–4c)
- A3: Integration test (M4d)

## Blocked

None.

## Needs from other lanes

- B: `decisionRefs` schema and `prov impact` (needed for A3 stage 2)
- C: live `/api/ledger` (needed for A3 stage 3)
