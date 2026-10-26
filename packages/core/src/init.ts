import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { InputError } from "./errors.js";
import { configureNotesRewrite, git, hooksDir } from "./git.js";
import { NOTES_REF } from "./schema.js";
import { PROVENANCE_DIR, ensureStore } from "./store.js";

export const HOOK_BEGIN = "# >>> provenance";
export const HOOK_END = "# <<< provenance";
export const HOOK_COMMAND = "prov hook post-commit || true";
export const HOOK_BLOCK = `${HOOK_BEGIN}\n${HOOK_COMMAND}\n${HOOK_END}\n`;
const GITIGNORE_ENTRY = `${PROVENANCE_DIR}/pending.json`;

export type HookAction = "created" | "appended" | "updated" | "unchanged";

/**
 * Insert the provenance block into `existing` hook content.
 * No hook => a new `#!/bin/sh` script. Existing hook => block appended (user content is never replaced);
 * an existing provenance block is refreshed in place so running init twice is a no-op.
 */
export function mergeHookContent(existing: string | null): { content: string; action: HookAction } {
  if (existing === null || existing.trim() === "") {
    return { content: `#!/bin/sh\n${HOOK_BLOCK}`, action: "created" };
  }
  const begin = existing.indexOf(HOOK_BEGIN);
  const end = existing.indexOf(HOOK_END);
  if (begin >= 0 && end > begin) {
    const after = existing.slice(end + HOOK_END.length).replace(/^\n/, "");
    const content = existing.slice(0, begin) + HOOK_BLOCK + after;
    return { content, action: content === existing ? "unchanged" : "updated" };
  }
  const sep = existing.endsWith("\n") ? "\n" : "\n\n";
  return { content: existing + sep + HOOK_BLOCK, action: "appended" };
}

/** Add `entry` to .gitignore content if missing. Returns null when no change is needed. */
export function mergeGitignore(existing: string | null, entry: string = GITIGNORE_ENTRY): string | null {
  const lines = (existing ?? "").split(/\r?\n/).map((l) => l.trim());
  if (lines.includes(entry) || lines.includes(`/${entry}`)) return null;
  const base = existing ?? "";
  return base + (base === "" || base.endsWith("\n") ? "" : "\n") + entry + "\n";
}

export interface InitResult {
  root: string;
  hookPath: string;
  hook: HookAction;
  gitignore: "created" | "updated" | "unchanged";
  sessionsDir: string;
}

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

/** `prov init`: store folder, .gitignore entry, post-commit hook, notes rewrite config. Idempotent. */
export async function initRepo(root: string): Promise<InitResult> {
  await ensureStore(root);

  const giPath = path.join(root, ".gitignore");
  const giExisting = await readIfExists(giPath);
  const giNext = mergeGitignore(giExisting);
  if (giNext !== null) await writeFile(giPath, giNext, "utf8");

  const dir = await hooksDir(root);
  await mkdir(dir, { recursive: true });
  const hookPath = path.join(dir, "post-commit");
  const { content, action } = mergeHookContent(await readIfExists(hookPath));
  if (action !== "unchanged") await writeFile(hookPath, content, "utf8");
  await chmod(hookPath, 0o755);

  await configureNotesRewrite(root);

  return {
    root,
    hookPath,
    hook: action,
    gitignore: giNext === null ? "unchanged" : giExisting === null ? "created" : "updated",
    sessionsDir: path.join(root, PROVENANCE_DIR, "sessions"),
  };
}

export interface SyncResult {
  remote: string;
  fetched: boolean;
  merged: boolean;
  pushed: boolean;
}

/**
 * `prov sync`: fetch the remote notes, merge them into the local notes ref (local wins on conflict),
 * then push the notes ref. A remote that has no notes yet is not an error.
 */
export async function syncNotes(root: string, remote = "origin"): Promise<SyncResult> {
  const remotes = (await git(root, ["remote"])).stdout.split("\n").map((s) => s.trim());
  if (!remotes.includes(remote)) throw new InputError(`No git remote named '${remote}'`);

  const tracking = "refs/notes/origin/provenance";
  const fetch = await git(root, ["fetch", remote, `+${NOTES_REF}:${tracking}`], { allowFailure: true, timeoutMs: 120_000 });
  const fetched = fetch.code === 0;

  let merged = false;
  if (fetched) {
    const ident = await git(root, ["var", "GIT_COMMITTER_IDENT"], { allowFailure: true });
    const idArgs = ident.code === 0 ? [] : ["-c", "user.name=Provenance", "-c", "user.email=provenance@localhost"];
    await git(root, [...idArgs, "notes", `--ref=${NOTES_REF}`, "merge", "-s", "ours", tracking]);
    merged = true;
  }

  const hasLocal = (await git(root, ["rev-parse", "--verify", "--quiet", NOTES_REF], { allowFailure: true })).code === 0;
  let pushed = false;
  if (hasLocal) {
    await git(root, ["push", remote, `${NOTES_REF}:${NOTES_REF}`], { timeoutMs: 120_000 });
    pushed = true;
  }
  return { remote, fetched, merged, pushed };
}
