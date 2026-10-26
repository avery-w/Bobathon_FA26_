import { randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ulid } from "ulid";
import { InputError } from "./errors.js";
import { resolveInsideRepo } from "./paths.js";
import {
  MAX_TEXT,
  PendingSchema,
  SessionIdSchema,
  SessionSchema,
  TRUNCATED_MARKER,
  UNREVIEWED,
  type Pending,
  type ReviewStatus,
  type Session,
} from "./schema.js";

export const PROVENANCE_DIR = ".provenance";

export const sessionsDir = (root: string): string => path.join(root, PROVENANCE_DIR, "sessions");
export const sessionPath = (root: string, id: string): string => path.join(sessionsDir(root), `${id}.json`);
export const pendingPath = (root: string): string => path.join(root, PROVENANCE_DIR, "pending.json");

/** Cap text at MAX_TEXT characters, ending with a `[truncated]` marker when cut. */
export function truncateText(text: string, max: number = MAX_TEXT): string {
  if (text.length <= max) return text;
  const keep = Math.max(0, max - TRUNCATED_MARKER.length - 1);
  return `${text.slice(0, keep)}\n${TRUNCATED_MARKER}`;
}

async function writeJsonAtomic(file: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf8");
  await rename(tmp, file);
}

/** Create `.provenance/sessions/`. Safe to call repeatedly. */
export async function ensureStore(root: string): Promise<void> {
  await mkdir(sessionsDir(root), { recursive: true });
}

export interface NewSessionInput {
  agent: { name: string; version?: string | undefined };
  model: string;
  prompt: string;
  summary?: string | undefined;
  contextFiles?: readonly string[] | undefined;
  filesChanged?: readonly string[] | undefined;
  toolCalls?: ReadonlyArray<{ name: string; summary?: string | undefined }> | undefined;
  /** Test hook; defaults to now. */
  createdAt?: Date | undefined;
  /** Test hook; defaults to a fresh ULID. */
  id?: string | undefined;
}

function normalizeRepoPaths(root: string, files: readonly string[]): string[] {
  return [...new Set(files.map((f) => resolveInsideRepo(root, f)))];
}

/** Validate input, normalise paths, truncate long text, and persist a new session. */
export async function createSession(root: string, input: NewSessionInput): Promise<Session> {
  const candidate = {
    version: 1 as const,
    id: input.id ?? ulid(),
    createdAt: (input.createdAt ?? new Date()).toISOString(),
    agent: input.agent,
    model: input.model,
    prompt: truncateText(input.prompt),
    contextFiles: normalizeRepoPaths(root, input.contextFiles ?? []),
    ...(input.filesChanged ? { filesChanged: normalizeRepoPaths(root, input.filesChanged) } : {}),
    toolCalls: (input.toolCalls ?? []).map((t) => ({ name: t.name, summary: t.summary ?? "" })),
    summary: truncateText(input.summary ?? ""),
    review: UNREVIEWED,
  };
  const parsed = SessionSchema.safeParse(candidate);
  if (!parsed.success) throw new InputError(`Invalid session: ${parsed.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
  await writeSession(root, parsed.data);
  return parsed.data;
}

/** Import a complete session object (e.g. `prov record --from-json`). Text is truncated, id/date kept. */
export async function importSession(root: string, raw: unknown): Promise<Session> {
  const loose = SessionSchema.loose().safeParse(raw);
  if (!loose.success) throw new InputError(`Invalid session: ${loose.error.issues.map((i) => i.path.join(".") + " " + i.message).join("; ")}`);
  const s = loose.data;
  const session = SessionSchema.parse({
    ...s,
    prompt: truncateText(s.prompt),
    summary: truncateText(s.summary),
    contextFiles: normalizeRepoPaths(root, s.contextFiles),
    ...(s.filesChanged ? { filesChanged: normalizeRepoPaths(root, s.filesChanged) } : {}),
  });
  await writeSession(root, session);
  return session;
}

export async function writeSession(root: string, session: Session): Promise<void> {
  const valid = SessionSchema.parse(session);
  await writeJsonAtomic(sessionPath(root, valid.id), valid);
}

/** Read a session by id. Returns null when the file does not exist; throws InputError on bad id or corrupt file. */
export async function readSession(root: string, id: string): Promise<Session | null> {
  const parsedId = SessionIdSchema.safeParse(id.toUpperCase());
  if (!parsedId.success) throw new InputError(`Invalid session id: ${id}`);
  let text: string;
  try {
    text = await readFile(sessionPath(root, parsedId.data), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
  try {
    return SessionSchema.parse(JSON.parse(text));
  } catch {
    throw new InputError(`Session file is corrupt: ${parsedId.data}`);
  }
}

/** Like readSession, but throws InputError when the session does not exist. */
export async function requireSession(root: string, id: string): Promise<Session> {
  const s = await readSession(root, id);
  if (!s) throw new InputError(`Unknown session: ${id}`);
  return s;
}

/** All readable sessions, oldest first. Corrupt files are skipped. */
export async function listSessions(root: string): Promise<Session[]> {
  let names: string[];
  try {
    names = await readdir(sessionsDir(root));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: Session[] = [];
  for (const n of names) {
    if (!n.endsWith(".json")) continue;
    try {
      const s = await readSession(root, n.slice(0, -".json".length));
      if (s) out.push(s);
    } catch {
      /* skip unreadable session */
    }
  }
  return out.sort((a, b) => (a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : a.createdAt.localeCompare(b.createdAt)));
}

export interface ReviewInput {
  status: ReviewStatus;
  reviewer: string;
  comment?: string | undefined;
  /** Test hook; defaults to now. */
  at?: Date | undefined;
}

/** Update the review block of a session file and return the updated session. */
export async function setReview(root: string, id: string, input: ReviewInput): Promise<Session> {
  const session = await requireSession(root, id);
  if (input.status !== "unreviewed" && !input.reviewer.trim()) throw new InputError("A reviewer name is required");
  const updated: Session = {
    ...session,
    review:
      input.status === "unreviewed"
        ? UNREVIEWED
        : {
            status: input.status,
            reviewer: input.reviewer.trim(),
            at: (input.at ?? new Date()).toISOString(),
            comment: input.comment ?? null,
          },
  };
  await writeSession(root, updated);
  return updated;
}

// ---------------------------------------------------------------- pending

export async function readPending(root: string): Promise<Pending> {
  try {
    return PendingSchema.parse(JSON.parse(await readFile(pendingPath(root), "utf8")));
  } catch {
    return { sessionIds: [] }; // missing or corrupt pending list = nothing pending
  }
}

export async function addPending(root: string, id: string): Promise<Pending> {
  const pending = await readPending(root);
  if (!pending.sessionIds.includes(id)) pending.sessionIds.push(id);
  await writeJsonAtomic(pendingPath(root), pending);
  return pending;
}

/** Remove the given ids (or all, if none given) from the pending list. */
export async function clearPending(root: string, ids?: readonly string[]): Promise<Pending> {
  const pending = await readPending(root);
  const next: Pending = { sessionIds: ids ? pending.sessionIds.filter((i) => !ids.includes(i)) : [] };
  await writeJsonAtomic(pendingPath(root), next);
  return next;
}

// ---------------------------------------------------------------- status

export interface StoreStatus {
  pending: string[];
  sessions: number;
  unreviewed: number;
  approved: number;
  rejected: number;
}

/** Pending ids plus session counts by review status (`prov status`). */
export async function getStatus(root: string): Promise<StoreStatus> {
  const sessions = await listSessions(root);
  const count = (s: ReviewStatus): number => sessions.filter((x) => x.review.status === s).length;
  return {
    pending: (await readPending(root)).sessionIds,
    sessions: sessions.length,
    unreviewed: count("unreviewed"),
    approved: count("approved"),
    rejected: count("rejected"),
  };
}
