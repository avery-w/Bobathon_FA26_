# Provenance MVP — Plan

Source of truth: `Provenance MVP — Build Spec for Bob.md`. This file restates it briefly.

**Goal.** "git blame for AI-written code": for any line, show which AI session wrote it, from what prompt, with which model, and whether a human reviewed it. Everything lives in the user's git repo (session JSON files + git notes on `refs/notes/provenance`). No server, no database.

**Stack.** TypeScript strict, Node 20+, pnpm workspaces, `git` via `execFile` only, `ulid`, `zod`, `commander`, `@modelcontextprotocol/sdk` (stdio), VS Code API bundled with `esbuild`, `vitest`.

**Layout.**

```
packages/core            all logic: schema, store, git, link, attribute, report
packages/cli             `prov` binary (thin wrapper, --json everywhere)
packages/mcp-server      `prov-mcp` binary, 5 tools
packages/vscode-extension  calls `prov ... --json`
examples/demo-repo.sh    builds the demo history
docs/agent-instructions.md
```

**Rule.** `cli`, `mcp-server`, `vscode-extension` hold no business logic.

## Milestones (strictly in order; each finishes with green tests)

| # | Milestone | Done when |
| --- | --- | --- |
| 1 | Scaffold | `pnpm install && pnpm build && pnpm test` pass on clean clone; CI workflow added |
| 2 | Core: storage + linking | session→commit→note works; root commits; `filesChanged` splitting; trailers w/o pending; re-link merges; filenames with spaces |
| 3 | Core: attribution | AI line→session; human edit→`human`; shifted line still resolves; uncommitted; amend keeps note |
| 4 | CLI + hook | e2e: init, record, commit, explain, review --approve, existing hook preserved |
| 5 | MCP server | SDK client over stdio calls all 5 tools; `../../etc/passwd` rejected |
| 6 | Report | md + HTML snapshot test; no network refs in HTML; unreviewed ranges listed |
| 7 | VS Code extension | gutter, hover, status bar, commands; hover returns prompt for known AI line |
| 8 | Demo + docs | `examples/demo-repo.sh`, `README.md`, `docs/agent-instructions.md` |

## Cross-cutting rules

- Git is always called with argument arrays (`execFile`), never string-concatenated commands.
- Every CLI command and MCP tool has JSON output.
- Ambiguities are resolved with the simplest option and logged in `DECISIONS.md`.
- Unit tests for every exported `core` function; e2e test against a throwaway temp git repo.
