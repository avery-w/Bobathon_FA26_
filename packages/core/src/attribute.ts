import { blame, readNote, ZERO_SHA_RE, type BlameLine } from "./git.js";
import { readSession } from "./store.js";
import type { Attribution, CommitInfo, CommitNote, LineAttribution, Session } from "./schema.js";

/** Lookups injected into the pure resolver so it can be unit-tested without git. */
export interface AttributionSources {
  note(sha: string): Promise<CommitNote | null>;
  session(id: string): Promise<Session | null>;
}

function commitInfo(b: BlameLine): CommitInfo {
  return { sha: b.sha, date: b.date, file: b.origFile, line: b.origLine };
}

/** Does the note have a link whose hunk covers `file:origLine`? Returns the first matching session id. */
export function findLinkedSession(note: CommitNote | null, file: string, origLine: number): string | null {
  if (!note) return null;
  for (const link of note.links) {
    if (link.hunks.some((h) => h.file === file && h.start <= origLine && origLine <= h.end)) return link.sessionId;
  }
  return null;
}

/** Attribution rules 2-4 for one blamed line. */
export async function resolveBlameLine(b: BlameLine, src: AttributionSources): Promise<Attribution> {
  if (ZERO_SHA_RE.test(b.sha)) return { kind: "uncommitted" };
  const commit = commitInfo(b);
  const sessionId = findLinkedSession(await src.note(b.sha), b.origFile, b.origLine);
  if (sessionId === null) return { kind: "human", commit };
  return { kind: "ai", sessionId, session: await src.session(sessionId), commit };
}

/** Memoising sources backed by the repo; one instance per request so each commit/session is read once. */
export function repoSources(root: string): AttributionSources {
  const notes = new Map<string, Promise<CommitNote | null>>();
  const sessions = new Map<string, Promise<Session | null>>();
  return {
    note(sha) {
      let p = notes.get(sha);
      if (!p) notes.set(sha, (p = readNote(root, sha)));
      return p;
    },
    session(id) {
      let p = sessions.get(id);
      if (!p) sessions.set(id, (p = readSession(root, id).catch(() => null)));
      return p;
    },
  };
}

/** Attribution of one line: file (repo-relative) and 1-based line number. */
export async function attributeLine(
  root: string,
  file: string,
  line: number,
  src: AttributionSources = repoSources(root),
): Promise<LineAttribution> {
  const [b] = await blame(root, file, line);
  if (!b) throw new Error("blame returned no line"); // blame() already throws InputError for bad input
  return { ...(await resolveBlameLine(b, src)), line };
}

/** Attribution of every line in a file, from a single `git blame --porcelain` call. */
export async function attributeFile(
  root: string,
  file: string,
  src: AttributionSources = repoSources(root),
): Promise<LineAttribution[]> {
  const blamed = await blame(root, file);
  const out: LineAttribution[] = [];
  for (const b of blamed) out.push({ ...(await resolveBlameLine(b, src)), line: b.line });
  return out;
}

export interface SessionLineCount {
  sessionId: string;
  session: Session | null;
  lines: number;
}

/** Distinct sessions that wrote lines in `[startLine, endLine]` (default: whole file), with line counts. */
export async function sessionsTouching(
  root: string,
  file: string,
  startLine = 1,
  endLine = Number.MAX_SAFE_INTEGER,
  src: AttributionSources = repoSources(root),
): Promise<SessionLineCount[]> {
  const counts = new Map<string, SessionLineCount>();
  for (const a of await attributeFile(root, file, src)) {
    if (a.line < startLine || a.line > endLine || a.kind !== "ai") continue;
    const cur = counts.get(a.sessionId);
    if (cur) cur.lines++;
    else counts.set(a.sessionId, { sessionId: a.sessionId, session: a.session, lines: 1 });
  }
  return [...counts.values()].sort((x, y) => y.lines - x.lines || x.sessionId.localeCompare(y.sessionId));
}
