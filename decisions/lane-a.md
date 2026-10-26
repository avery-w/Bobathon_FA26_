# Lane A Decisions

**A1.** The `pnpm install` after adding `apps/web` to the workspace required regenerating `pnpm-lock.yaml` (the lockfile had no `importers["apps/web"]` entry). Ran `pnpm install` (not `--frozen-lockfile`) once to update the lockfile, then committed the updated `pnpm-lock.yaml`. From S1 onward, `--frozen-lockfile` is enforced for everyone.
