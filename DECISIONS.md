# Decisions

Ambiguities in the spec, resolved with the simplest option.

1. **pnpm via corepack.** pnpm was not installed on the build machine; installed through `corepack` (ships with Node). `packageManager` is pinned in the root `package.json`.
2. **Dev dependencies.** The spec's stack lists runtime pieces. Build/test tooling not named there (`typescript`, `eslint`, `typescript-eslint`, `@types/node`, `@types/vscode`) is added as **devDependencies only**; no extra runtime dependencies are added.
3. **ESM everywhere** (`"type": "module"`, `NodeNext`), except the VS Code extension bundle, which esbuild emits as CommonJS because VS Code loads extensions via `require`.
4. **Tests live in `packages/*/test/`**, run from the repo root with one `vitest` config. In-process tests import `@provenance/core` from source via an alias, so they do not need a prior build. End-to-end tests (CLI, MCP) spawn the built binaries in `dist/`, so `pnpm build` runs before `pnpm test` (same as CI).
5. **Node floor.** `engines.node >= 20` as the spec says. Node 20 is past upstream EOL, so Node 22+ is recommended in the README; no code relies on features newer than Node 20.
6. **Notes ref.** `git notes --ref=provenance` resolves to `refs/notes/provenance`; the code always passes the full ref name.
7. **Hunk granularity.** Hunks come straight from `git diff --unified=0`; adjacent hunks are not merged.
8. **VS Code test harness.** `@vscode/test-electron` downloads a VS Code build, so it needs network. It is wired as `pnpm --filter provenance-vscode test:vscode` and is **not** part of the default `pnpm test`; the hover/gutter logic is pure functions covered by regular vitest tests.
9. **TypeScript pinned to 6.0.x.** `typescript-eslint` 8.x does not yet support TypeScript 7 (unmet peer), so the toolchain uses the newest TypeScript it supports. Revisit when `typescript-eslint` adds TS 7 support.
10. **`@types/vscode` pinned to `~1.100.0`** to match `engines.vscode ^1.100.0` (the types must not be newer than the minimum supported VS Code).
11. **esbuild install script** is explicitly approved (`allowBuilds` in `pnpm-workspace.yaml`); no other dependency build scripts are allowed.
12. **Notes written over stdin.** `git notes --ref=refs/notes/provenance add -f -F - <sha>` with the JSON on stdin instead of a temp file. Same behaviour, no temp-file cleanup, no race.
13. **Notes identity fallback.** `git notes add` creates a commit on the notes ref and needs a committer identity. If `user.name`/`user.email` are unset (CI, hooks), core passes `-c user.name=Provenance -c user.email=provenance@localhost` for that call only.
14. **Several sessions, no `filesChanged`.** In a multi-session commit, a session that lists no `filesChanged` gets no hunks (the spec says each gets hunks "in its `filesChanged`"). If two sessions claim the same file, both are linked; attribution returns the first matching link.
15. **Links with zero hunks are kept**, so the commit still records that the session was linked to it.
16. **Missing session file.** If a note references a session whose file is not present (for example not yet pulled), attribution returns `kind: "ai"` with `session: null` and the `sessionId`, rather than pretending the line is human-written.
17. **Corrupt or unknown-version note** is treated as "no note" for attribution (the blame view must not break), and is replaced on the next link.
18. **Diff flags.** `git diff` runs with `--no-renames --src-prefix=a/ --dst-prefix=b/ -c core.quotepath=off` so output does not depend on user config. Blame follows renames by itself, so renames need no special handling.
19. **`prov sync`.** Fetch goes to `refs/notes/origin/provenance`, then `git notes merge -s ours` into the local ref (conflicts only arise when both sides annotated the same commit; local wins), then push. A remote without the ref is not an error.
20. **`filesChanged` paths** are normalized to repo-relative POSIX paths on record; a path outside the repo is rejected.
21. **`.provenance/` is never attributed.** Session files are committed alongside the code, so they appear in the same diff. Hunks under `.provenance/` are dropped when linking (`isProvenancePath`), and the report (M6) also excludes those files from "tracked lines". They are bookkeeping, not code.
22. **`prov blame --json` shape.** To avoid repeating the full session on every line, output is `{ file, head, lines: [{ line, kind, sessionId?, commit? }], sessions: { <id>: Session } }`. `head` is the HEAD sha (or null) so the VS Code extension can key its cache on it. `prov explain --json` returns the full attribution object with the session inline.
23. **CLI paths.** `<file>` arguments are resolved relative to `--repo` (default: current directory) and must stay inside the repo. `--context` / `--files` on `prov record` are also resolved from that directory.
24. **`--reviewer` is required** for `prov review`; no implicit fallback to `git config user.name`. The VS Code extension supplies the git user name itself.
25. **`prov report`** is added to the CLI in Milestone 6, since it depends on the report builder. Every other command in the table ships in Milestone 4.
26. **CLI errors** are one line on stderr (`{"error": "..."}` with `--json`), never a stack trace. Unexpected failures print a generic message and exit 1.
27. **Report scope.** "Tracked lines" are text lines of tracked files at HEAD (from one `git grep -I -c`), excluding `.provenance/`. Binary files and empty files count as zero lines. Only files named by a note (followed through renames via `git log -M`) are blamed; everything else is counted as human-written without blaming.
28. **Report blames `HEAD`, not the working tree**, so unsaved edits never change a compliance number. The editor-facing `prov blame` still blames the working tree so unsaved lines show as uncommitted.
29. **"Unreviewed" includes rejected.** An AI line is "unreviewed" in the summary if its session is not `approved`. The report lists rejected sessions' lines first, in their own block, because they are the worst case.
30. **`--since`** filters sessions by `createdAt`. Lines from older sessions are then counted as human in that view, because the report is about the sessions in the window.
31. **HTML report** is one file: inline CSS, no scripts, no external URLs. All session text is HTML-escaped (prompts are untrusted).
32. **VS Code harness clears `ELECTRON_RUN_AS_NODE`.** When `test:vscode` runs from an Electron-based editor, the variable is inherited and the downloaded VS Code starts as plain Node, treating the demo-repo path as a script (`Cannot find module`). `runTest.ts` deletes it from its own environment before launching. With that, all four extension-host tests pass.
33. **`.gitignore` not written by the tooling.** The editing tools refuse to write `.gitignore`, so it is created from the shell. It ignores `node_modules/`, `dist/`, `dist-test/`, `.vscode-test/`, `demo-repo/`, `report.html`, `.env*`, `*.vsix` and `.provenance/pending.json`.

34. **Spec file is read-only; progress lives in `STATUS.md`.** The spec is restored to its content in `5f8f7d9` minus that commit's "Build progress" section. `STATUS.md` holds the section as it stood in the working tree (Build progress, Known gaps, Next steps, Future plans) followed by the original `5f8f7d9` section, both word for word. The spec is never edited again.
