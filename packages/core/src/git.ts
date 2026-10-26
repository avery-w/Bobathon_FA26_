import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import { GitError, InputError, NotAGitRepoError } from "./errors.js";
import {
  CommitNoteSchema,
  NOTES_REF,
  SessionIdSchema,
  TRAILER_KEY,
  type CommitNote,
  type Hunk,
} from "./schema.js";

/** Git's well-known empty tree object (used to diff root commits). */
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
export const ZERO_SHA_RE = /^0+$/;

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_BUFFER = 256 * 1024 * 1024;

export interface GitRunOptions {
  /** Written to the child's stdin. */
  input?: string;
  timeoutMs?: number;
  /** Return the result instead of throwing on a non-zero exit. */
  allowFailure?: boolean;
}

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Run `git <args>` in `cwd`. Always uses an argument array (never a shell), so
 * file names with spaces, quotes or other special characters are safe.
 */
export function git(cwd: string, args: readonly string[], opts: GitRunOptions = {}): Promise<GitResult> {
  const env = { ...process.env };
  // A hook inherits these from the parent git process; they must not redirect us.
  delete env["GIT_DIR"];
  delete env["GIT_WORK_TREE"];
  delete env["GIT_INDEX_FILE"];
  env["GIT_TERMINAL_PROMPT"] = "0";

  const fullArgs = ["-c", "core.quotepath=false", ...args];
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      fullArgs,
      { cwd, env, encoding: "utf8", maxBuffer: MAX_BUFFER, timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (!error) return resolve({ stdout, stderr, code: 0 });
        const code = typeof error.code === "number" ? error.code : null;
        if (code !== null && opts.allowFailure) return resolve({ stdout, stderr, code });
        reject(new GitError(`git ${args[0] ?? ""} failed`, args, code, stderr));
      },
    );
    if (opts.input !== undefined) {
      child.stdin?.on("error", () => undefined); // EPIPE is reported through the exit code
      child.stdin?.end(opts.input);
    }
  });
}

/** Absolute path of the work tree containing `dir`. Throws NotAGitRepoError. */
export async function findRepoRoot(dir: string): Promise<string> {
  const abs = path.resolve(dir);
  try {
    if (!(await stat(abs)).isDirectory()) throw new NotAGitRepoError(abs);
    const { stdout } = await git(abs, ["rev-parse", "--show-toplevel"]);
    const root = stdout.trim();
    if (!root) throw new NotAGitRepoError(abs);
    return root;
  } catch (e) {
    if (e instanceof NotAGitRepoError) throw e;
    throw new NotAGitRepoError(abs);
  }
}

function assertRev(rev: string): void {
  if (typeof rev !== "string" || rev.length === 0 || rev.startsWith("-") || rev.includes("\0")) {
    throw new InputError(`Invalid commit reference: ${rev}`);
  }
}

/** Resolve any commit-ish to a full SHA. Throws InputError if it does not exist. */
export async function resolveCommit(root: string, rev: string): Promise<string> {
  assertRev(rev);
  const r = await git(root, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], { allowFailure: true });
  const sha = r.stdout.trim();
  if (r.code !== 0 || !sha) throw new InputError(`Unknown commit: ${rev}`);
  return sha;
}

/** First parent of `sha`, or null for a root commit. */
export async function parentOf(root: string, sha: string): Promise<string | null> {
  const r = await git(root, ["rev-parse", "--verify", "--quiet", `${sha}^1`], { allowFailure: true });
  const parent = r.stdout.trim();
  return r.code === 0 && parent ? parent : null;
}

/** Current HEAD SHA, or null when the repository has no commits yet. */
export async function headSha(root: string): Promise<string | null> {
  const r = await git(root, ["rev-parse", "--verify", "--quiet", "HEAD^{commit}"], { allowFailure: true });
  const sha = r.stdout.trim();
  return r.code === 0 && sha ? sha : null;
}

// ---------------------------------------------------------------- paths

/** Decode a git C-style quoted path (`"a\tb\303\251"`). Unquoted input is returned as is. */
export function unquoteGitPath(s: string): string {
  if (!(s.length >= 2 && s.startsWith('"') && s.endsWith('"'))) return s;
  const body = s.slice(1, -1);
  const bytes: number[] = [];
  const simple: Record<string, number> = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11, "\\": 92, '"': 34 };
  for (let i = 0; i < body.length; i++) {
    const ch = body[i] as string;
    if (ch !== "\\") {
      bytes.push(...Buffer.from(ch, "utf8"));
      continue;
    }
    const next = body[i + 1] ?? "";
    if (/[0-7]/.test(next)) {
      const oct = /^[0-7]{1,3}/.exec(body.slice(i + 1))?.[0] ?? next;
      bytes.push(parseInt(oct, 8) & 0xff);
      i += oct.length;
    } else {
      bytes.push(simple[next] ?? next.charCodeAt(0));
      i += 1;
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

// ---------------------------------------------------------------- diff

/**
 * Parse `git diff --unified=0` output into new-side hunks.
 * Pure deletions (new-side length 0) are skipped, as are deleted files.
 */
export function parseDiffHunks(diff: string): Hunk[] {
  const hunks: Hunk[] = [];
  let file: string | null = null;
  let inHeader = false;
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      file = null;
      inHeader = true;
      continue;
    }
    if (inHeader && line.startsWith("+++ ")) {
      let name = line.slice(4);
      if (name.endsWith("\t")) name = name.slice(0, -1); // git adds a tab after names with spaces
      name = unquoteGitPath(name);
      file = name === "/dev/null" ? null : name.replace(/^b\//, "");
      continue;
    }
    if (line.startsWith("@@")) {
      inHeader = false;
      const m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!m || file === null) continue;
      const start = Number(m[1]);
      const count = m[2] === undefined ? 1 : Number(m[2]);
      if (count === 0) continue;
      hunks.push({ file, start, end: start + count - 1 });
    }
  }
  return hunks;
}

/** New-side line ranges introduced by commit `sha` (against its first parent, or the empty tree). */
export async function diffHunks(root: string, sha: string): Promise<Hunk[]> {
  const parent = (await parentOf(root, sha)) ?? EMPTY_TREE;
  const { stdout } = await git(root, [
    "diff",
    "--unified=0",
    "--no-color",
    "--no-renames",
    "--no-ext-diff",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    parent,
    sha,
  ]);
  return parseDiffHunks(stdout);
}

// ---------------------------------------------------------------- blame

export interface BlameLine {
  /** Line number in the current file (1-based). */
  line: number;
  sha: string;
  /** Line number in `origFile` at commit `sha`. */
  origLine: number;
  origFile: string;
  /** ISO-8601 UTC author date; null for uncommitted lines. */
  date: string | null;
}

/** Parse `git blame --porcelain` output. */
export function parseBlamePorcelain(out: string): BlameLine[] {
  const result: BlameLine[] = [];
  const filenames = new Map<string, string>();
  const dates = new Map<string, string>();
  let cur: { sha: string; origLine: number; line: number } | null = null;

  for (const raw of out.split("\n")) {
    if (raw.startsWith("\t")) {
      if (cur) {
        const zero = ZERO_SHA_RE.test(cur.sha);
        result.push({
          line: cur.line,
          sha: cur.sha,
          origLine: cur.origLine,
          origFile: filenames.get(cur.sha) ?? "",
          date: zero ? null : (dates.get(cur.sha) ?? null),
        });
        cur = null;
      }
      continue;
    }
    if (cur === null) {
      const m = /^([0-9a-f]{40,64}) (\d+) (\d+)(?: \d+)?$/.exec(raw);
      if (m) cur = { sha: m[1] as string, origLine: Number(m[2]), line: Number(m[3]) };
      continue;
    }
    if (raw.startsWith("filename ")) {
      filenames.set(cur.sha, unquoteGitPath(raw.slice("filename ".length)));
    } else if (raw.startsWith("author-time ")) {
      const secs = Number(raw.slice("author-time ".length));
      if (Number.isFinite(secs)) dates.set(cur.sha, new Date(secs * 1000).toISOString());
    }
  }
  return result;
}

/**
 * Blame a file (repo-relative path), optionally one line only. Without `rev` the working tree is
 * blamed (so unsaved lines show as uncommitted); with `rev` (e.g. HEAD) only committed content is.
 * Throws InputError when the file is not tracked or the line is out of range.
 */
export async function blame(root: string, file: string, line?: number, rev?: string): Promise<BlameLine[]> {
  const args = ["blame", "--porcelain"];
  if (line !== undefined) args.push("-L", `${line},${line}`);
  if (rev !== undefined) args.push(rev);
  args.push("--", file);
  const r = await git(root, args, { allowFailure: true });
  if (r.code !== 0) {
    throw new InputError(
      line !== undefined
        ? `Cannot blame ${file}:${line} (untracked file or line out of range)`
        : `Cannot blame ${file} (untracked file or no commits yet)`,
    );
  }
  return parseBlamePorcelain(r.stdout);
}

/** Tracked files at HEAD, repo-relative. */
export async function listTrackedFiles(root: string): Promise<string[]> {
  const { stdout } = await git(root, ["ls-files", "-z"]);
  return stdout.split("\0").filter(Boolean);
}

// ---------------------------------------------------------------- notes

/** Read and validate the provenance note on `sha`. Missing or corrupt notes yield null. */
export async function readNote(root: string, sha: string): Promise<CommitNote | null> {
  const r = await git(root, ["notes", `--ref=${NOTES_REF}`, "show", sha], { allowFailure: true });
  if (r.code !== 0) return null;
  try {
    const parsed = CommitNoteSchema.safeParse(JSON.parse(r.stdout));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

async function identityArgs(root: string): Promise<string[]> {
  const r = await git(root, ["var", "GIT_COMMITTER_IDENT"], { allowFailure: true });
  return r.code === 0 ? [] : ["-c", "user.name=Provenance", "-c", "user.email=provenance@localhost"];
}

/** Write (replace) the provenance note on `sha`. */
export async function writeNote(root: string, sha: string, note: CommitNote): Promise<void> {
  const body = JSON.stringify(CommitNoteSchema.parse(note), null, 2) + "\n";
  await git(root, [...(await identityArgs(root)), "notes", `--ref=${NOTES_REF}`, "add", "-f", "-F", "-", sha], {
    input: body,
  });
}

/** SHAs of every commit that has a provenance note. */
export async function listNotedCommits(root: string): Promise<string[]> {
  const r = await git(root, ["notes", `--ref=${NOTES_REF}`, "list"], { allowFailure: true });
  if (r.code !== 0) return [];
  return r.stdout
    .split("\n")
    .map((l) => l.trim().split(" ")[1])
    .filter((s): s is string => !!s);
}

// ---------------------------------------------------------------- trailers

/** Session ids from `Provenance-Session:` trailers of a commit message. */
export async function sessionTrailers(root: string, sha: string): Promise<string[]> {
  const log = await git(root, ["log", "-1", "--format=%B", sha]);
  const parsed = await git(root, ["interpret-trailers", "--parse"], { input: log.stdout });
  const ids: string[] = [];
  for (const l of parsed.stdout.split("\n")) {
    const idx = l.indexOf(":");
    if (idx < 0 || l.slice(0, idx).trim().toLowerCase() !== TRAILER_KEY.toLowerCase()) continue;
    const id = SessionIdSchema.safeParse(l.slice(idx + 1).trim().toUpperCase());
    if (id.success && !ids.includes(id.data)) ids.push(id.data);
  }
  return ids;
}

// ---------------------------------------------------------------- config / hooks

/** Add `value` to a multi-valued config key unless it is already present. */
export async function configAddUnique(root: string, key: string, value: string): Promise<void> {
  const r = await git(root, ["config", "--local", "--get-all", key], { allowFailure: true });
  if (r.stdout.split("\n").includes(value)) return;
  await git(root, ["config", "--local", "--add", key, value]);
}

export async function configSet(root: string, key: string, value: string): Promise<void> {
  await git(root, ["config", "--local", key, value]);
}

/** Absolute path of the hooks directory (honours core.hooksPath). */
export async function hooksDir(root: string): Promise<string> {
  const { stdout } = await git(root, ["rev-parse", "--git-path", "hooks"]);
  return path.resolve(root, stdout.trim());
}

/** Make git copy provenance notes onto amended and rebased commits. */
export async function configureNotesRewrite(root: string): Promise<void> {
  await configSet(root, "notes.rewriteRef", NOTES_REF);
  await configSet(root, "notes.rewrite.amend", "true");
  await configSet(root, "notes.rewrite.rebase", "true");
}

/** Line counts of all text files at `rev`, from one call. Binary and empty files are omitted. */
export async function lineCountsAt(root: string, rev: string): Promise<Map<string, number>> {
  const { stdout } = await git(root, ["grep", "-I", "-c", "-z", "", rev]);
  const counts = new Map<string, number>();
  const prefix = `${rev}:`;
  // Output is "<rev>:<path>\0<count>\n" repeated.
  for (const rec of stdout.split("\n")) {
    const nul = rec.indexOf("\0");
    if (nul < 0) continue;
    const name = rec.slice(0, nul);
    counts.set(name.startsWith(prefix) ? name.slice(prefix.length) : name, Number(rec.slice(nul + 1)));
  }
  return counts;
}

/**
 * Map from every file name that was ever renamed away to its name at HEAD, following rename chains.
 * Lets the report find a file that a note recorded under an older name.
 */
export async function renameMap(root: string): Promise<Map<string, string>> {
  const r = await git(root, ["log", "--format=", "--name-status", "-M", "--diff-filter=R", "-z", "HEAD"], { allowFailure: true });
  // With only renames selected, -z output is "R<score>\0<old>\0<new>\0" repeated, newest first.
  const parts = r.stdout.split("\0");
  const step = new Map<string, string>(); // old -> new
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const from = parts[i + 1] as string;
    if (!step.has(from)) step.set(from, parts[i + 2] as string);
  }
  const resolved = new Map<string, string>();
  for (const from of step.keys()) {
    let cur = from;
    const seen = new Set<string>();
    while (step.has(cur) && !seen.has(cur)) {
      seen.add(cur);
      cur = step.get(cur) as string;
    }
    resolved.set(from, cur);
  }
  return resolved;
}
