# Provenance MVP — Build Spec for Bob

Oct 26, 2026 · @orion

## Instructions for Bob

Build the complete Provenance MVP described in this spec, as a working TypeScript monorepo, by following the milestones in order.

1. Read the whole spec before writing code. Restate the plan in a short `PLAN.md` at the repo root.
2. Build one milestone at a time. Finish each with passing tests and its acceptance criteria met before starting the next.
3. Write unit tests for every function in `core`, and an end-to-end test that runs against a throwaway git repo created in a temp directory.
4. Use only the stack listed under Architecture. Ask before adding any other runtime dependency.
5. Never shell out with string-concatenated commands. Call git with argument arrays (`execFile`), so file names with spaces or quotes are safe.
6. Keep every command and MCP tool output available as JSON (`--json` flag on the CLI), because the MCP server and VS Code extension consume it.
7. When a requirement is ambiguous, choose the simplest option, note it in `DECISIONS.md`, and keep going.
8. Finish by writing `README.md` with install steps, a 5-minute quickstart, and the demo script from the last section.

## Build progress

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


## Product and MVP scope

Provenance is "git blame for AI-written code": for any line in a repo, it answers which AI session wrote it, from what prompt and context, with which model, and whether a human reviewed it.

**The problem.** AI agents now write a large share of code, but the commit history only shows who pushed it. Nobody can later see why a line exists, what the agent was asked, or whether a person checked it. That is a gap for debugging, onboarding, and compliance audits.

**MVP user stories**

- As an AI agent, I record my session (prompt, files read, tools used, summary) through an MCP tool before I commit.
- As a developer, I hover over a line in VS Code and see the AI session that produced it, with a review badge.
- As a reviewer, I approve or reject a session from the CLI or VS Code, and that status follows the lines it wrote.
- As a team lead, I run one command and get a report of AI-authored code, including what is still unreviewed.

**In scope**

- `core` library: session storage, git notes linking, line attribution
- `prov` CLI
- git `post-commit` hook that links sessions to commits automatically
- MCP server with 5 tools
- VS Code extension: hover card, gutter markers, approve/reject commands
- Markdown and HTML compliance report

**Out of scope for the MVP** (list these as "Roadmap" in the README)

- Session replay (re-running a prompt against a model)
- Capturing sessions automatically from inside Bob, Copilot, or Claude without the agent calling the tool
- Web dashboard, multi-repo views, user accounts, cloud sync
- Tracking lines across rebases and squash merges (blame on the current history is enough)
- Cryptographic signing of sessions

## Architecture

Everything lives inside the user's git repo: session files are committed alongside the code, and commit-to-session links are stored as git notes, so there is no server or database.

**Tech stack**

| Piece | Choice |
| --- | --- |
| Language | TypeScript (strict), Node.js 20+ |
| Monorepo | pnpm workspaces |
| Git access | `child_process.execFile('git', [...])` — no git library |
| IDs | ULID (`ulid` package) |
| Validation | `zod` schemas for every file format |
| CLI | `commander` |
| MCP | `@modelcontextprotocol/sdk`, stdio transport |
| VS Code | VS Code Extension API, bundled with `esbuild` |
| Tests | `vitest` |

**Repo layout**

```
provenance/
  package.json            # pnpm workspace root
  packages/
    core/                 # all logic; no CLI or UI code
      src/schema.ts       # zod schemas: Session, CommitNote, Pending
      src/store.ts        # read/write .provenance/ files
      src/git.ts          # execFile wrappers: diff, blame, notes
      src/link.ts         # session -> commit hunks -> git note
      src/attribute.ts    # file:line -> commit -> note -> session
      src/report.ts       # build report data + render md/html
    cli/                  # `prov` binary, thin wrapper over core
    mcp-server/           # `prov-mcp` binary, 5 tools over core
    vscode-extension/     # calls `prov ... --json`
  examples/demo-repo.sh   # creates a sample repo for the demo
```

**Rule:** `cli`, `mcp-server`, and `vscode-extension` contain no business logic. They parse input, call `core` (or the CLI with `--json`), and format output.

&#91;embedded content: Provenance data flow · write path and read path\]

The top row is the write path, run once per AI session; everything in the bottom row reuses the same `core` line lookup.

## Data model and storage

Three records hold everything: a session file per AI session, a pending list of sessions waiting for the next commit, and a git note per commit that maps changed line ranges to sessions.

| Record | Where | Committed? |
| --- | --- | --- |
| Session | `.provenance/sessions/<id>.json` | Yes |
| Pending | `.provenance/pending.json` | No (`.gitignore`) |
| Commit note | git notes ref `refs/notes/provenance`, one note per commit | Pushed separately with `prov sync` |

**Session** (`version: 1`)

```json
{
  "version": 1,
  "id": "01JB8Z6Q4X2M7K9N3P5R8T0V1W",
  "createdAt": "2026-10-26T17:02:11Z",
  "agent": { "name": "IBM Bob", "version": "optional" },
  "model": "model name as reported by the agent",
  "prompt": "Add retry with backoff to the payment client",
  "contextFiles": ["src/payments/client.ts", "docs/retry-policy.md"],
  "filesChanged": ["src/payments/client.ts"],
  "toolCalls": [{ "name": "read_file", "summary": "read client.ts" }],
  "summary": "Wrapped charge() in exponential backoff, max 5 tries",
  "review": { "status": "unreviewed", "reviewer": null, "at": null, "comment": null }
}
```

- `review.status` is one of `unreviewed`, `approved`, `rejected`.
- `filesChanged` is optional. It decides which hunks belong to which session when one commit has several sessions.
- Cap `prompt` and `summary` at 20,000 characters each; truncate with a `[truncated]` marker.

**Pending**: `{ "sessionIds": ["01JB..."] }`

**Commit note** (JSON stored with `git notes --ref=provenance add -f -F <tmpfile> <sha>`)

```json
{
  "version": 1,
  "links": [
    {
      "sessionId": "01JB8Z6Q4X2M7K9N3P5R8T0V1W",
      "hunks": [{ "file": "src/payments/client.ts", "start": 41, "end": 67 }]
    }
  ]
}
```

**Linking rules** (in `core/link.ts`)

1. Session IDs for a commit = pending list ∪ any `Provenance-Session: <id>` trailers in the commit message (parse with `git interpret-trailers --parse`).
2. Hunks = new-side line ranges from `git diff --unified=0 --no-color <parent> <sha>`. For a root commit, diff against the empty tree `4b825dc642cb6eb9a060e54bf8d69288fbee4904`. Skip pure-deletion hunks.
3. One session → it gets every hunk, unless it lists `filesChanged`, in which case only hunks in those files.
4. Several sessions → each gets the hunks in its `filesChanged`. Hunks no session claims stay unlinked (treated as human-written).
5. Write the note, then clear the pending list. Merge with an existing note on the same commit instead of overwriting it.

**Attribution rules** (in `core/attribute.ts`)

1. Run `git blame --porcelain -L <n>,<n> -- <file>`. Read the commit SHA, the original line number, and the original `filename` from the porcelain output.
2. SHA of all zeros → return `{ kind: "uncommitted" }`.
3. Read the note on that SHA. Find a link with a hunk where `file` matches and `start ≤ origLine ≤ end`.
4. Match → `{ kind: "ai", session, commit }`. No note or no match → `{ kind: "human", commit }`.

**Keeping notes attached**: `prov init` sets `notes.rewriteRef=refs/notes/provenance`, `notes.rewrite.amend=true`, and `notes.rewrite.rebase=true`, so notes follow amended and rebased commits.

## Components

Five deliverables sit on top of `core`; each one below lists exactly what it must do.

### CLI (`prov`)

Every command supports `--json` and `--repo <path>` (default: current directory). Exit codes: `0` success, `1` bad input, `2` not inside a git repo.

| Command | What it does |
| --- | --- |
| `prov init` | Creates `.provenance/sessions/`, adds `pending.json` to `.gitignore`, installs the hook, sets the notes config |
| `prov record --prompt <text> --model <name> [--agent] [--context a,b] [--files a,b] [--summary]` | Writes a session, adds it to pending, prints the ID and the trailer line. `--from-json <file>` accepts a full session object instead |
| `prov hook post-commit` | Internal; run by the hook. Links pending and trailer sessions to `HEAD` |
| `prov link <sessionId> <commit>` | Links a session to an existing commit manually |
| `prov explain <file>:<line>` | Attribution for one line |
| `prov blame <file>` | Attribution for every line, from one full `git blame --porcelain` call (the VS Code extension uses this) |
| `prov show <sessionId>` | Full session record |
| `prov review <sessionId> --approve or --reject --reviewer <name> [--comment]` | Updates the review block in the session file |
| `prov report [--since <date>] [--format md or html] [--out <path>]` | Compliance report |
| `prov status` | Pending sessions, session count, unreviewed count |
| `prov sync` | `git push` and `git fetch` of `refs/notes/provenance` against `origin` |

### Git hook

`prov init` installs `.git/hooks/post-commit`. If a hook already exists, append a block between `# >>> provenance` and `# <<< provenance` markers instead of replacing it. The hook body is `prov hook post-commit || true`: it must never block or fail a commit.

### MCP server (`prov-mcp`)

Stdio transport. Takes `--repo <path>`, defaulting to the working directory. Rejects any file path that resolves outside the repo root. Each tool's description must tell the agent when to call it.

| Tool | Input | Returns |
| --- | --- | --- |
| `record_session` | `agent`, `model`, `prompt`, `summary`, optional `contextFiles`, `filesChanged`, `toolCalls` | `sessionId` and the `Provenance-Session:` trailer to add to the commit message |
| `explain_line` | `file`, `line` | Attribution result (`ai`, `human`, or `uncommitted`) with the session when there is one |
| `find_sessions_touching` | `file`, optional `startLine`, `endLine` | Distinct sessions that wrote lines in that range, with a line count each |
| `get_session` | `sessionId` | Full session record |
| `set_review_status` | `sessionId`, `status`, `reviewer`, optional `comment` | Updated session |

The `record_session` description should read close to: "Call this once when you finish a coding task and before you commit. Record the user's request as `prompt`, the files you read as `contextFiles`, and the files you edited as `filesChanged`."

Also ship `docs/agent-instructions.md`: a paragraph users paste into Bob's custom instructions telling it to call `record_session` before every commit and to add the returned trailer.

### VS Code extension

- **Activation**: when the workspace contains a `.provenance/` folder.
- **Gutter markers**: a thin colored bar on AI-written lines — green approved, amber unreviewed, red rejected. Data comes from `prov blame <file> --json`, cached per file and `HEAD` SHA, refreshed on save and on `HEAD` change.
- **Hover card**: on an AI-written line, show agent and model, review badge, the first 300 characters of the prompt, the summary, context files, and commit short SHA and date. End with command links: Approve, Reject, Show full session.
- **Status bar**: "AI: 42% of this file · 12 lines unreviewed". Clicking it opens the report.
- **Commands**: `Provenance: Show Session`, `Provenance: Approve Session`, `Provenance: Reject Session`, `Provenance: Generate Report`.
- **Setting**: `provenance.cliPath` (default `prov` on PATH).

### Compliance report

The report answers "how much of this codebase is AI-written, and how much of that no human has checked". It covers lines at `HEAD`.

- **Summary**: total tracked lines, AI-written lines and %, unreviewed AI lines and %, session count by review status.
- **Unreviewed AI code**: every unreviewed range as `file:start-end` with its session's prompt excerpt. This is the list an auditor acts on, so put it near the top.
- **By file**: lines, AI lines, unreviewed AI lines; sorted by unreviewed lines, highest first.
- **Sessions**: ID, date, agent, model, prompt excerpt, status, reviewer, and lines that still survive at `HEAD`.
- **Performance**: only blame files that appear in at least one note; every other tracked file counts as fully human-written.
- **HTML**: one self-contained file with inline CSS and no external requests, so it can be attached to an audit ticket.

## Milestones and acceptance criteria

Build in this order; each milestone is done only when its checks pass in CI (`pnpm test`).

1. **Scaffold** — pnpm workspace, four packages, strict `tsconfig`, `vitest`, lint, a GitHub Actions workflow running `pnpm build && pnpm test`.
   - Done when: `pnpm install && pnpm build && pnpm test` passes on a clean clone.
2. **Core: storage and linking** — `schema.ts`, `store.ts`, `git.ts`, `link.ts`.
   - Done when tests show: a session written then committed produces the right note; root commits work; two sessions with `filesChanged` split hunks correctly; trailers work without a pending file; re-linking merges instead of overwriting; file names with spaces work.
3. **Core: attribution** — `attribute.ts`.
   - Done when tests show: an AI line returns its session; a later human edit to that line returns `human`; an untouched AI line still returns the session after later commits shift it down; an uncommitted line returns `uncommitted`; an amended commit keeps its note.
4. **CLI and hook** — every command in the CLI table, plus `prov init`.
   - Done when the end-to-end test passes: init a temp repo, `prov record`, commit, `prov explain` returns the session, `prov review --approve` changes the status, and an existing hook is preserved.
5. **MCP server** — five tools over `core`.
   - Done when: an MCP client test (using the SDK's client over stdio) calls every tool against a temp repo and gets valid results, and a path like `../../etc/passwd` is rejected.
6. **Report** — Markdown and HTML.
   - Done when: a snapshot test on a fixture repo matches, the HTML opens with no network requests, and unreviewed ranges are listed.
7. **VS Code extension** — gutter, hover, status bar, commands.
   - Done when: the extension test harness (`@vscode/test-electron`) opens the demo repo and the hover provider returns the session's prompt for a known AI line.
8. **Demo and docs** — `examples/demo-repo.sh`, `README.md`, `docs/agent-instructions.md`.
   - Done when: running the script on a fresh machine with Node 20 produces the demo repo described in the next section.

## Demo script

The demo should land one moment: hover over a line, and the room sees exactly which AI prompt wrote it and that no one has reviewed it yet.

**`examples/demo-repo.sh` must build this history** in a new folder `demo-repo/`, using `prov record` with realistic prompts (no real model calls):

1. Human commit: a small TypeScript payments service (about 5 files).
2. AI commit, session A: "Add retry with exponential backoff to the payment client." Approved by a reviewer named `dana`.
3. AI commit with two sessions: B ("Add input validation to the refund endpoint") and C ("Write unit tests for refunds"), split by `filesChanged`. Both unreviewed.
4. Human commit that rewrites three lines inside session B's code, so those lines become human-attributed.
5. AI commit, session D: "Log card numbers for debugging." Rejected by `dana` with the comment "PII — must not log card data."

**Three-minute walkthrough**

1. **Problem (30 s)**: "Half the code in this repo was written by AI. `git blame` says a human pushed it. Which half, from what instructions, and did anyone check?"
2. **Hover (45 s)**: open `refund.ts` in VS Code. Amber gutter bars. Hover one: session B's prompt, model, context files, "unreviewed". Hover a line the human rewrote: no AI badge.
3. **Agent loop (45 s)**: in Bob, ask "Why does the refund endpoint reject negative amounts?" Bob calls `explain_line` and answers with the original prompt and summary.
4. **Review (30 s)**: click Approve in the hover card. The bar turns green.
5. **Audit (30 s)**: run `prov report --format html`. Show the unreviewed list at the top and the rejected PII session flagged.

**One-line pitch for the judges**: Provenance makes every AI-written line traceable to its prompt and its reviewer, using nothing but git.
