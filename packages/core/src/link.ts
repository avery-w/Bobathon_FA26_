import { diffHunks, readNote, resolveCommit, sessionTrailers, writeNote } from "./git.js";
import {
  CommitNoteSchema,
  SessionIdSchema,
  type CommitNote,
  type Hunk,
  type Link,
  type Session,
} from "./schema.js";
import { PROVENANCE_DIR, clearPending, readPending, readSession } from "./store.js";

export interface SessionClaim {
  id: string;
  /** From the session file; undefined if the session lists none or its file is missing. */
  filesChanged?: readonly string[] | undefined;
}

/**
 * Assign hunks to sessions (linking rules 3 and 4).
 * - One session: every hunk, unless it lists `filesChanged`, then only hunks in those files.
 * - Several sessions: each gets only hunks in its own `filesChanged`; unclaimed hunks stay unlinked.
 */
export function assignHunks(claims: readonly SessionClaim[], hunks: readonly Hunk[]): Link[] {
  if (claims.length === 0) return [];
  const only = claims.length === 1 ? claims[0] : undefined;
  return claims.map((c) => {
    const files = c.filesChanged && c.filesChanged.length > 0 ? new Set(c.filesChanged) : null;
    let mine: Hunk[];
    if (only) mine = files ? hunks.filter((h) => files.has(h.file)) : [...hunks];
    else mine = files ? hunks.filter((h) => files.has(h.file)) : [];
    return { sessionId: c.id, hunks: mine.map((h) => ({ ...h })) };
  });
}

/** Merge new links into an existing note: same session => union of hunks; never drops existing data. */
export function mergeNotes(existing: CommitNote | null, incoming: readonly Link[]): CommitNote {
  const byId = new Map<string, Link>();
  for (const l of existing?.links ?? []) byId.set(l.sessionId, { sessionId: l.sessionId, hunks: [...l.hunks] });
  for (const l of incoming) {
    const cur = byId.get(l.sessionId);
    if (!cur) {
      byId.set(l.sessionId, { sessionId: l.sessionId, hunks: [...l.hunks] });
      continue;
    }
    for (const h of l.hunks) {
      if (!cur.hunks.some((x) => x.file === h.file && x.start === h.start && x.end === h.end)) cur.hunks.push(h);
    }
  }
  return CommitNoteSchema.parse({ version: 1, links: [...byId.values()] });
}

export interface LinkResult {
  commit: string;
  sessionIds: string[];
  note: CommitNote | null;
}

async function claimFor(root: string, id: string): Promise<SessionClaim> {
  let session: Session | null = null;
  try {
    session = await readSession(root, id);
  } catch {
    session = null; // corrupt file: link without file filtering
  }
  return { id, filesChanged: session?.filesChanged };
}

/** Provenance's own bookkeeping (session files) is not code and is never attributed. */
export const isProvenancePath = (file: string): boolean => file === PROVENANCE_DIR || file.startsWith(`${PROVENANCE_DIR}/`);

async function applyLink(root: string, sha: string, ids: string[]): Promise<LinkResult> {
  if (ids.length === 0) return { commit: sha, sessionIds: [], note: null };
  const claims = await Promise.all(ids.map((id) => claimFor(root, id)));
  const hunks = (await diffHunks(root, sha)).filter((h) => !isProvenancePath(h.file));
  const links = assignHunks(claims, hunks);
  const note = mergeNotes(await readNote(root, sha), links);
  await writeNote(root, sha, note);
  return { commit: sha, sessionIds: ids, note };
}

/**
 * Link the pending sessions plus any `Provenance-Session:` trailers of `commit` (default HEAD)
 * to that commit, then clear the pending list. No-op when there is nothing to link.
 */
export async function linkCommit(root: string, commit = "HEAD"): Promise<LinkResult> {
  const sha = await resolveCommit(root, commit);
  const pending = (await readPending(root)).sessionIds;
  const trailers = await sessionTrailers(root, sha);
  const ids = [...new Set([...pending, ...trailers])];
  const result = await applyLink(root, sha, ids);
  if (pending.length > 0) await clearPending(root);
  return result;
}

/** Manually link one session to an existing commit (`prov link`). Removes it from pending. */
export async function linkSession(root: string, sessionId: string, commit: string): Promise<LinkResult> {
  const id = SessionIdSchema.parse(sessionId.toUpperCase());
  const sha = await resolveCommit(root, commit);
  const result = await applyLink(root, sha, [id]);
  await clearPending(root, [id]);
  return result;
}
