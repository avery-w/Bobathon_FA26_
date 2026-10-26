# Provenance

**git blame for AI-written code.** For any line in a repo, Provenance answers: which AI session wrote it, from what prompt and context, with which model, and whether a human reviewed it.

Everything lives in your git repo. Sessions are JSON files under `.provenance/sessions/` that you commit with the code, and commit-to-session links are git notes on `refs/notes/provenance`. There is no server and no database.

## Contents

- [Install](#install)
- [5-minute quickstart](#5-minute-quickstart)
- [Demo](#demo)
- [CLI reference](#cli-reference)
- [MCP server](#mcp-server)
- [VS Code extension](#vs-code-extension)
- [Report](#report)
- [How it works](#how-it-works)
- [Development](#development)
- [Roadmap](#roadmap)
- [Status](STATUS.md)

## Install

Requirements: **Node 22 recommended** (CI tests Node 20 and 22; 20 is the minimum), `git`, and [pnpm](https://pnpm.io), which `corepack` provides at the version pinned in `package.json`.

The supported route installs everything under your home directory and needs no admin rights. Run it in order, from a fresh shell:

```bash
git clone --branch provenance https://github.com/avery-w/Bobathon_FA26.git provenance && cd provenance
mkdir -p ~/.local/bin
export PATH="$HOME/.local/bin:$PATH"          # also add this line to ~/.zshrc or ~/.bashrc
corepack enable --install-directory ~/.local/bin   # puts `pnpm` in ~/.local/bin; plain `corepack enable` fails with EACCES when Node is installed system-wide
pnpm install
pnpm build

# Wrapper scripts for the two binaries. They use the full path to `node`, because GUI apps such as VS Code may not have it on their PATH.
printf '#!/bin/sh\nexec %s %s/packages/cli/dist/bin.js "$@"\n' "$(command -v node)" "$PWD" > ~/.local/bin/prov
printf '#!/bin/sh\nexec %s %s/packages/mcp-server/dist/bin.js "$@"\n' "$(command -v node)" "$PWD" > ~/.local/bin/prov-mcp
chmod +x ~/.local/bin/prov ~/.local/bin/prov-mcp

prov --help
```

`prov-mcp` is a stdio server and has no `--help`. To check it starts, run it inside any git repo with stdin closed: `prov-mcp --repo . < /dev/null` prints `prov-mcp running on stdio for <repo>` to stderr and exits.

The wrappers point at this clone, so keep the folder and re-run `pnpm build` after you pull changes.

**Alternative: `pnpm link --global`.** This only works if pnpm has a writable global directory (run `pnpm setup` once, and `pnpm` itself must be on your `PATH`; it failed with EACCES where `corepack enable` could not write). Then:

```bash
pnpm --dir packages/cli link --global           # provides `prov`
pnpm --dir packages/mcp-server link --global    # provides `prov-mcp`
```

## 5-minute quickstart

```bash
cd your-project            # any git repository
prov init                  # creates .provenance/, installs the post-commit hook, sets git notes config
```

`prov init` never replaces an existing `post-commit` hook; it appends a block between `# >>> provenance` and `# <<< provenance`. The hook runs `prov hook post-commit || true`, so it can never block a commit.

**1. Record an AI session** (an agent normally does this through the [MCP server](#mcp-server); here it is by hand):

```bash
prov record --agent "IBM Bob" --model "granite" \
  --prompt "Add retry with backoff to the payment client" \
  --context src/payments/client.ts --files src/payments/client.ts \
  --summary "Wrapped charge() in exponential backoff, max 5 tries"
# 01JB8Z6Q4X2M7K9N3P5R8T0V1W
# Provenance-Session: 01JB8Z6Q4X2M7K9N3P5R8T0V1W
```

**2. Commit.** The session is pending, so the hook links it to the commit automatically. You can also (or instead) add the trailer to the message:

```bash
git add -A && git commit -m "feat: retry charges

Provenance-Session: 01JB8Z6Q4X2M7K9N3P5R8T0V1W"
```

**3. Ask about a line:**

```bash
prov explain src/payments/client.ts:42
prov blame src/payments/client.ts
```

**4. Review:**

```bash
prov review 01JB8Z6Q4X2M7K9N3P5R8T0V1W --approve --reviewer dana --comment "Matches our retry policy"
```

**5. Audit:**

```bash
prov status
prov report --format html --out report.html
```

**6. Share the notes.** Git does not push notes by default:

```bash
prov sync     # fetch, merge and push refs/notes/provenance against origin
```

Every command takes `--json` (machine-readable output) and `--repo <path>` (default: current directory). Exit codes: `0` success, `1` bad input, `2` not inside a git repo.

## Demo

[`examples/demo-repo.sh`](examples/demo-repo.sh) builds a small TypeScript payments service in `./demo-repo` with this history (no model calls; sessions are recorded with `prov record`):

| # | Commit | Session | Review |
| --- | --- | --- | --- |
| 1 | Human: payments service skeleton | none | none |
| 2 | AI: retry with exponential backoff | A | approved by `dana` |
| 3 | AI: refund validation and tests | B and C, split by `filesChanged` | unreviewed |
| 4 | Human: rewrites three lines of B's code | none (those lines become human-attributed) | none |
| 5 | AI: "Log card numbers for debugging." | D | rejected by `dana`: "PII — must not log card data." |

The reviews are recorded just before the commits that carry them, so the history is exactly these five commits.

```bash
pnpm build                        # the script uses the built CLI if `prov` is not on PATH
bash examples/demo-repo.sh        # or: bash examples/demo-repo.sh my-folder
cd demo-repo
prov explain src/refund.ts:9      # session B, unreviewed
prov report --format html --out report.html
```

For a live demo, use [`examples/reset-demo.sh`](examples/reset-demo.sh) instead. It rebuilds `~/prov-demo` from scratch (safe to rerun between takes) and also writes `.vscode/settings.json` (so the extension finds `prov`) and `.bob/mcp.json` (so Bob can call `prov-mcp`). It needs `prov` and `prov-mcp` on `PATH`.

```bash
bash examples/reset-demo.sh
```

Then open `~/prov-demo` in VS Code, choose **Trust Folder** when the Restricted Mode banner appears, and open `src/refund.ts`. To install the extension: `pnpm --filter provenance-vscode package:vsix` (from the repo root; it builds and writes `packages/vscode-extension/provenance-vscode-0.1.0.vsix`), then `code --install-extension packages/vscode-extension/provenance-vscode-0.1.0.vsix`, or use **Extensions: Install from VSIX...** in the editor. Installing the `.vsix` is the supported route. Pressing F5 (launch configs in `.vscode/launch.json`, with a `preLaunchTask` that builds) is **untested**: it did nothing in Bob's IDE, which may not expose Run and Debug.

Suggested three-minute walkthrough:

1. **Problem (30 s).** "Half the code in this repo was written by AI. `git blame` says a human pushed it. Which half, from what instructions, and did anyone check?"
2. **Hover (45 s).** Open `src/refund.ts` in VS Code with the extension. Amber gutter bars mark unreviewed AI lines. Hover one: session B's prompt, model, context files, "unreviewed". Hover a line the human rewrote: no AI badge.
3. **Agent loop (45 s).** In Bob, ask "Why does the refund endpoint reject negative amounts?" Bob calls `explain_line` and answers with the original prompt and summary.
4. **Review (30 s).** Click Approve in the hover card. The bar turns green.

   *Optional live step, between steps 3 and 4:* have Bob write a real session. It is not part of `demo-repo.sh` or `reset-demo.sh`, so those stay scripted and repeatable. After `bash examples/reset-demo.sh`, open `~/prov-demo` in Bob and give it exactly this prompt:

   > Reject refund amounts with more than two decimal places, and add a test for it in test/refund.test.ts. Use the provenance MCP server: call `record_session` before you commit, and put the trailer it returns in the commit message.

   Then run `prov explain src/refund.ts:13` and `prov report --format md`. The new session shows Bob's real agent name and model (or `unknown` if Bob cannot report its model), not `granite-demo`.
5. **Audit (30 s).** `prov report --format html`. Show the unreviewed list at the top and the rejected PII session flagged.

> Provenance makes every AI-written line traceable to its prompt and its reviewer, using nothing but git.

## CLI reference

| Command | What it does |
| --- | --- |
| `prov init` | Creates `.provenance/sessions/`, ignores `pending.json`, installs the hook, sets the notes config |
| `prov record --prompt <text> --model <name> [--agent] [--context a,b] [--files a,b] [--summary]` | Writes a session, adds it to pending, prints the id and the trailer line. `--from-json <file>` accepts a full session object |
| `prov hook post-commit` | Internal; run by the hook. Links pending and trailer sessions to `HEAD` |
| `prov link <sessionId> <commit>` | Links a session to an existing commit manually |
| `prov explain <file>:<line>` | Attribution for one line |
| `prov blame <file>` | Attribution for every line (used by the VS Code extension) |
| `prov show <sessionId>` | Full session record |
| `prov review <sessionId> --approve \| --reject --reviewer <name> [--comment]` | Updates the review block in the session file |
| `prov report [--since <date>] [--format md\|html] [--out <path>]` | Compliance report |
| `prov status` | Pending sessions, session count, review counts |
| `prov sync` | Fetch, merge and push `refs/notes/provenance` against `origin` |

## MCP server

`prov-mcp` is a stdio MCP server with five tools: `record_session`, `explain_line`, `find_sessions_touching`, `get_session`, `set_review_status`. It takes `--repo <path>` (default: working directory) and rejects any file path that resolves outside the repo.

```json
{
  "mcpServers": {
    "provenance": { "command": "prov-mcp", "args": ["--repo", "/absolute/path/to/your/repo"] }
  }
}
```

To make an agent record every session and add the commit trailer, paste the paragraph from [`docs/agent-instructions.md`](docs/agent-instructions.md) into its custom instructions.

## VS Code extension

Package: `packages/vscode-extension` (built with esbuild into `dist/extension.js`). It activates when the workspace contains a `.provenance/` folder and calls `prov blame --json`, so `prov` must be on `PATH` or set in `provenance.cliPath`.

- **Gutter bars** on AI-written lines: green approved, amber unreviewed, red rejected.
- **Hover card**: agent and model, review badge, prompt excerpt, summary, context files, commit and date, with Approve / Reject / Show full session links.
- **Status bar**: "AI: 42% of this file · 12 lines unreviewed"; click to open the report.
- **Commands**: `Provenance: Show Session`, `Approve Session`, `Reject Session`, `Generate Report`.

To try it without installing, open `packages/vscode-extension` in VS Code and press F5 (Run Extension), then open the demo repo. F5 is untested (see Install); the `.vsix` route is the supported one.

## Report

`prov report` starts with a one-line headline, for example "1 rejected session still in code (2 lines) · 29.5% of lines are unreviewed AI code"; the HTML version adds a bar split into human, AI reviewed and AI unreviewed lines ([screenshot](docs/report-headline.png)). Below that it covers lines at `HEAD`: totals and AI share, the unreviewed AI ranges as `file:start-end` with prompt excerpts (near the top, because that is what an auditor acts on), a per-file table sorted by unreviewed lines, and every session with the lines that still survive. Rejected sessions are listed first in their own block. `--format html` writes one self-contained file with inline CSS, no scripts and no external requests, so it can be attached to an audit ticket.

## How it works

| Record | Where | Committed? |
| --- | --- | --- |
| Session | `.provenance/sessions/<id>.json` | Yes |
| Pending list | `.provenance/pending.json` | No |
| Commit note | git notes ref `refs/notes/provenance` | Pushed with `prov sync` |

1. On commit, the hook collects session ids from the pending list and from `Provenance-Session:` trailers, takes the new-side hunks of the commit, and stores a note mapping hunks to sessions.
2. To explain a line, `git blame --porcelain` gives the commit and original line; the note on that commit says which session, if any, wrote it. A later human edit changes the blamed commit, so the line becomes human-attributed.
3. `prov init` sets `notes.rewriteRef`, `notes.rewrite.amend` and `notes.rewrite.rebase`, so notes follow amended and rebased commits.

Design decisions for every ambiguity in the spec are numbered in [`DECISIONS.md`](DECISIONS.md); the build plan is in [`PLAN.md`](PLAN.md).

## Development

```bash
pnpm install
pnpm build
pnpm lint
pnpm test                                    # unit + end-to-end tests (needs `pnpm build` first)
pnpm --filter provenance-vscode test:vscode  # extension-host test; downloads VS Code on first run
```

Layout: `packages/core` holds all logic (schema, store, git, link, attribute, report); `cli`, `mcp-server` and `vscode-extension` are thin wrappers with no business logic.

## Roadmap

Out of scope for the MVP:

- Session replay (re-running a prompt against a model)
- Capturing sessions automatically from inside Bob, Copilot, or Claude without the agent calling the tool
- Web dashboard, multi-repo views, user accounts, cloud sync
- Tracking lines across rebases and squash merges (blame on the current history is enough)
- Cryptographic signing of sessions

## License

Apache-2.0
