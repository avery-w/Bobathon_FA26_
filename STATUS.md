# Provenance status

Progress notes for the Provenance MVP. The build spec (`Provenance MVP — Build Spec for Bob.md`) is the source of truth and is never edited; record progress here instead.

The sections below were moved word for word out of the spec file. The first is the section as it stood before this move; the second is the original "Build progress" section from commit `5f8f7d9`.

## Build progress

Last updated: Oct 26, 2026 · branch `provenance` on `avery-w/Bobathon_FA26`.

**Status: MVP complete and demoed. Remaining work is product hardening. Merging with the other two projects is a future plan, not a current concern (see "Future plans").**

`pnpm lint`, `pnpm build` and `pnpm test` pass (10 test files, 122 tests), and the GitHub Actions **CI** run is green on both commits on `provenance`. The VS Code extension-host test passes 4 of 4 (run locally; it downloads VS Code, so it is not part of CI). Plan is in `PLAN.md`; every ambiguity is numbered in `DECISIONS.md` (33 entries).

### Completed

| # | Milestone | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Scaffold | Done | pnpm workspace, 4 packages, strict tsconfig, vitest, eslint, `.github/workflows/ci.yml`; CI green on GitHub |
| 2 | Core: storage and linking | Done | `schema.ts`, `store.ts`, `git.ts`, `link.ts`; tests cover root commits, `filesChanged` splitting, trailers without pending, merge on re-link, file names with spaces |
| 3 | Core: attribution | Done | `attribute.ts`; tests cover AI line, later human edit, shifted line, uncommitted line, amended commit, rename |
| 4 | CLI and hook | Done | All commands plus `--json`; e2e test covers init, record, commit, explain, review, existing hook preserved |
| 5 | MCP server | Done | 5 tools over stdio; SDK client test calls every tool and confirms `../../etc/passwd` is rejected |
| 6 | Report | Done | `prov report` for Markdown and HTML; snapshot tests; HTML has no URLs, scripts or external requests |
| 7 | VS Code extension | Done | Gutter bars, hover card, status bar, four commands, `provenance.cliPath`; bundled with esbuild; 12 unit tests plus the 4-test extension-host run |
| 8 | Demo and docs | Done | `examples/demo-repo.sh`, `examples/reset-demo.sh`, `README.md`, `docs/agent-instructions.md` |

**Added after the original build:**

- `examples/reset-demo.sh` rebuilds `~/prov-demo` and writes `.vscode/settings.json` (extension finds `prov`) and `.bob/mcp.json` (Bob finds `prov-mcp`). Safe to rerun between demo takes.
- `.vscode/launch.json` at the repo root and in `packages/vscode-extension/`.
- README install section now covers the `corepack enable` permission error and a wrapper-script fallback; `*.vsix` is gitignored.

### Verified by hand (Oct 26)

- **Install:** `prov` and `prov-mcp` run from a fresh shell via wrapper scripts in `~/.local/bin`.
- **Demo repo:** `prov explain`, `prov blame`, `prov status` and `prov report` give the expected output (4 sessions, 55% AI in `refund.ts`).
- **VS Code hover:** installed as a `.vsix`. Amber gutter bars, hover card (prompt, model, context files, commit, Approve/Reject) and the status bar all work. The folder must be **trusted**; in Restricted Mode the extension stays off.
- **Bob + MCP:** `provenance` is registered in Bob's global `~/.bob/settings/mcp.json` and Bob calls it. A scripted MCP client also passed `find_sessions_touching`, `explain_line`, `record_session` (then commit with trailer, then `explain`) and path-traversal rejection.

### Known gaps and caveats

- **Demo data is scripted.** The four sessions, the prompts, the agent name (`IBM Bob`) and model (`granite-demo`) and the reviews by `dana` are all written by `demo-repo.sh`. The report's numbers are computed from the repo (sessions, git notes, `git blame`), but no model wrote that code.
- **Capture is not automatic.** Sessions exist only if the agent calls `record_session` (see `docs/agent-instructions.md`). Code written before setup shows as human. Listed as out of scope in the README Roadmap.
- **F5 launch was not confirmed.** It did nothing at first; the config was added, but the working path was installing the `.vsix`. Bob's IDE may not expose the Run and Debug panel.
- **`pnpm link --global` was not confirmed.** It failed in the user's shell at `corepack enable` (EACCES); the wrapper-script route works instead.
- **Notes are not pushed by default.** `refs/notes/provenance` needs `prov sync`; the GitHub repo has none yet.
- **Report is plain.** Tables only, no headline callout or chart. Worth improving if the report stays in the demo.

### Next steps

Work stays on the `provenance` branch. Do not push to `main`.

1. **Run a real session in the demo.** Have Bob make a small change in `~/prov-demo` and record it through MCP, so at least one session is not scripted.
2. **Decide on the report.** Add a headline ("N rejected sessions still in code"), a split bar, or drop it from the main demo.
3. **Housekeeping.** Run `prov sync` when real notes exist, and remove the `provenance` entry from `~/.bob/settings/mcp.json` after the demo (backup: `mcp.json.bak-provenance`).

### Future plans (not a current concern)

Merging this project with the two related projects is planned for later. Nothing above depends on it, so none of it needs action now.

- **Where the other projects are.** `main` on `avery-w/Bobathon_FA26` holds a teammate's Bob Time Machine (Next.js, npm, its own CI); the Provenance files were removed from it (`c85b8b5`). The third project has not been located yet.
- **Layout and tooling.** Pick a layout (for example `packages/*` for libraries and `apps/*` for apps) and a single package manager. This repo uses pnpm; Time Machine uses npm.
- **Root collisions to resolve.** `package.json`, lockfiles, `tsconfig.base.json`, `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `README.md`, `.github/workflows/ci.yml`.
- **History.** `git merge --allow-unrelated-histories` or `git subtree add`; the Provenance and `main` histories share only commit `5f8f7d9`.
- **CI.** Give each project its own path-filtered workflow once they share a repo.
- **Pull request and default branch.** Open a PR from `provenance` once the layout is agreed, and decide then whether the GitHub default branch changes.
- **Teammates.** Tell them `prov` uses the nearest `.git`, so run it on other projects or the demo repo and not on a merged repo's root.

---

# Original build progress (commit 5f8f7d9)

Last updated: Oct 26, 2026. **All 8 milestones are built.** `pnpm build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` all pass (10 test files, 122 tests), and the VS Code extension-host test passes (4 of 4). Plan is in `PLAN.md`; every ambiguity I resolved is numbered in `DECISIONS.md` (33 entries).

| # | Milestone | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Scaffold | Done | pnpm workspace, 4 packages, strict tsconfig, vitest, eslint, `.github/workflows/ci.yml` |
| 2 | Core: storage and linking | Done | `schema.ts`, `store.ts`, `git.ts`, `link.ts`; tests cover root commits, `filesChanged` splitting, trailers without pending, merge on re-link, file names with spaces |
| 3 | Core: attribution | Done | `attribute.ts`; tests cover AI line, later human edit, shifted line, uncommitted line, amended commit, rename |
| 4 | CLI and hook | Done | All commands in the CLI table plus `--json`; e2e test runs init, record, commit, explain, review, and checks an existing hook is preserved |
| 5 | MCP server | Done | 5 tools over stdio; SDK client test calls every tool and confirms `../../etc/passwd` is rejected |
| 6 | Report | Done | `prov report` for Markdown and HTML; snapshot tests; HTML has no URLs, scripts or external requests; unreviewed ranges listed above "By file" |
| 7 | VS Code extension | Done | Gutter bars, hover card, status bar, four commands and `provenance.cliPath`, bundled with esbuild. 12 vitest tests cover hover and status logic. The `@vscode/test-electron` run opens the demo repo and passes 4 of 4: hover on an AI line returns the prompt, unreviewed badge and review links; hover on a human-rewritten line has no AI card; hover on the approved session shows the approved badge and reviewer; the four commands are registered. Fix: `runTest.ts` clears the inherited `ELECTRON_RUN_AS_NODE` variable (DECISIONS.md #32). This harness stays outside the default `pnpm test` because it downloads VS Code (DECISIONS.md #8) |
| 8 | Demo and docs | Done | `examples/demo-repo.sh` builds the 5-step history and is tested. `README.md` (install, quickstart, demo walkthrough, CLI/MCP/extension/report sections, Roadmap) and `docs/agent-instructions.md` (MCP config, paste-in paragraph, example commit) are written |

**Also built beyond the table:** `prov init` / `prov sync` logic lives in `core` (`init.ts`), so the CLI stays a thin wrapper.

### What I have not verified

- The README install commands (`pnpm setup`, `pnpm --dir packages/cli link --global`, `pnpm --dir packages/mcp-server link --global`) were written from the package setup and not run.
- The README's "press F5 in `packages/vscode-extension`" step was not tried; the extension was only tested through the automated harness. There is no `.vscode/launch.json`, so F5 may need a "Run Extension" configuration.
- The CI workflow has never run (the folder is not a git repo), so the clean-clone claim in milestone 1 is untested on GitHub.
- `pnpm` is not on this machine's PATH. I ran everything through `corepack enable --install-directory /tmp/corepack-bin`.

### Next steps for you

Do these in order, in your own terminal. The shared GitHub repo has two other contributors, so Provenance goes in a `provenance/` subfolder on a branch and arrives through a pull request.

1. **Clone the shared repo and branch.** `git clone <shared-repo-url> shared-repo && cd shared-repo && git checkout -b add-provenance`. Do **not** run `git init` in this workspace folder.
2. **Copy the project into a subfolder**, leaving out build output and the VS Code download:
   `mkdir provenance && rsync -a --exclude node_modules --exclude dist --exclude dist-test --exclude .vscode-test --exclude demo-repo --exclude .bob --exclude .github /Users/orionsun/Documents/Bobathon_V2/ provenance/`
   `.github` is excluded because GitHub only runs workflows from the repo root. The old `.github/workflows/ci.yml` in this folder is for a standalone repo and is replaced by step 4.
3. **Create `provenance/.gitignore`** (my file tool refuses to write this file) containing: `node_modules/`, `dist/`, `dist-test/`, `.vscode-test/`, `demo-repo/`, `.env*`.
4. **Add `.github/workflows/provenance-ci.yml` at the repo root.** It must run only for changes under `provenance/`, use `working-directory: provenance`, point `pnpm/action-setup` at `provenance/package.json`, and set `cache-dependency-path: provenance/pnpm-lock.yaml`. Steps: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build && pnpm test`. Ask me for the full file if you want it written out.
5. **Check what is staged.** `git add -A && git status --short`. Every path must start with `provenance/` or be `.github/workflows/provenance-ci.yml`. If anything else shows up, stop.
6. **Run the checks from the new location** (optional but recommended): `cd provenance && corepack enable && pnpm install && pnpm lint && pnpm build && pnpm test`.
7. **Commit, push the branch and open a pull request.** `git commit -m "feat: add Provenance MVP under provenance/"`, then `git push -u origin add-provenance`. Do not push to `main`. Confirm the **Provenance CI** run passes on the PR. If it fails, send me the error.
8. **Optional: verify the README steps** (`pnpm setup`, the two `link --global` commands, `prov --help`, `bash examples/demo-repo.sh`, `prov explain src/refund.ts:9` inside `demo-repo/`) and tell me which fail so I can fix the README.
9. **Optional: try the extension by hand.** Open `packages/vscode-extension` in VS Code, press F5, open `demo-repo/src/refund.ts` in the new window, and look for amber gutter bars and the hover card. If F5 does nothing, tell me and I will add a `.vscode/launch.json`.
10. **Tell your teammates** that `prov` run on the shared repo treats the whole repo as its repository (it uses the nearest `.git`). Use it on other projects or the demo repo, not on the `provenance/` folder itself. The tests and `demo-repo.sh` build their own temporary repos and are not affected.

