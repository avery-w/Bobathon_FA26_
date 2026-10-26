import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CommitNoteSchema,
  InputError,
  MAX_TEXT,
  SessionSchema,
  TRUNCATED_MARKER,
  addPending,
  clearPending,
  createSession,
  ensureStore,
  importSession,
  listSessions,
  pendingPath,
  readPending,
  readSession,
  requireSession,
  resolveInsideRepo,
  sessionPath,
  setReview,
  truncateText,
} from "@provenance/core";
import { makeRepo, type TestRepo } from "./helpers.js";

const agent = { name: "IBM Bob" };

describe("schema", () => {
  it("accepts the spec's example session", () => {
    const parsed = SessionSchema.parse({
      version: 1,
      id: "01JB8Z6Q4X2M7K9N3P5R8T0V1W",
      createdAt: "2026-10-26T17:02:11Z",
      agent: { name: "IBM Bob", version: "optional" },
      model: "m",
      prompt: "p",
      contextFiles: ["a"],
      filesChanged: ["a"],
      toolCalls: [{ name: "read_file", summary: "read client.ts" }],
      summary: "s",
      review: { status: "unreviewed", reviewer: null, at: null, comment: null },
    });
    expect(parsed.id).toBe("01JB8Z6Q4X2M7K9N3P5R8T0V1W");
  });

  it("rejects ids that are not ULIDs (path traversal safety)", () => {
    const base = { version: 1, createdAt: "2026-01-01T00:00:00Z", agent, model: "m", prompt: "p" };
    expect(SessionSchema.safeParse({ ...base, id: "../../etc/passwd" }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...base, id: "short" }).success).toBe(false);
  });

  it("rejects unknown review status and prompts over the cap", () => {
    const base = {
      version: 1,
      id: "01JB8Z6Q4X2M7K9N3P5R8T0V1W",
      createdAt: "2026-01-01T00:00:00Z",
      agent,
      model: "m",
      prompt: "p",
    };
    expect(SessionSchema.safeParse({ ...base, review: { status: "maybe", reviewer: null, at: null, comment: null } }).success).toBe(false);
    expect(SessionSchema.safeParse({ ...base, prompt: "x".repeat(MAX_TEXT + 1) }).success).toBe(false);
  });

  it("validates commit notes", () => {
    expect(CommitNoteSchema.safeParse({ version: 1, links: [] }).success).toBe(true);
    expect(CommitNoteSchema.safeParse({ version: 2, links: [] }).success).toBe(false);
    const bad = { version: 1, links: [{ sessionId: "01JB8Z6Q4X2M7K9N3P5R8T0V1W", hunks: [{ file: "a", start: 5, end: 2 }] }] };
    expect(CommitNoteSchema.safeParse(bad).success).toBe(false);
  });
});

describe("truncateText", () => {
  it("leaves short text alone", () => {
    expect(truncateText("hello")).toBe("hello");
  });
  it("caps at the limit and ends with the marker", () => {
    const out = truncateText("x".repeat(MAX_TEXT * 2));
    expect(out.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(out.endsWith(TRUNCATED_MARKER)).toBe(true);
  });
});

describe("resolveInsideRepo", () => {
  let repo: TestRepo;
  beforeEach(() => {
    repo = makeRepo();
    repo.write("src/a.ts", "x\n");
  });
  afterEach(() => repo.cleanup());

  it("returns repo-relative posix paths", () => {
    expect(resolveInsideRepo(repo.root, "src/a.ts")).toBe("src/a.ts");
    expect(resolveInsideRepo(repo.root, path.join(repo.root, "src", "a.ts"))).toBe("src/a.ts");
    expect(resolveInsideRepo(repo.root, "src/../src/a.ts")).toBe("src/a.ts");
  });
  it("allows paths that do not exist yet", () => {
    expect(resolveInsideRepo(repo.root, "new/dir/file.ts")).toBe("new/dir/file.ts");
  });
  it("rejects traversal, absolute paths elsewhere, empty input and the root itself", () => {
    expect(() => resolveInsideRepo(repo.root, "../../etc/passwd")).toThrow(InputError);
    expect(() => resolveInsideRepo(repo.root, "/etc/passwd")).toThrow(InputError);
    expect(() => resolveInsideRepo(repo.root, "")).toThrow(InputError);
    expect(() => resolveInsideRepo(repo.root, ".")).toThrow(InputError);
    expect(() => resolveInsideRepo(repo.root, "a\0b")).toThrow(InputError);
  });
  it("rejects symlinks that escape the repo", () => {
    symlinkSync("/etc", path.join(repo.root, "escape"));
    expect(() => resolveInsideRepo(repo.root, "escape/passwd")).toThrow(InputError);
  });
});

describe("store", () => {
  let repo: TestRepo;
  beforeEach(async () => {
    repo = makeRepo();
    await ensureStore(repo.root);
  });
  afterEach(() => repo.cleanup());

  it("creates and reads back a session with defaults and a ULID id", async () => {
    const s = await createSession(repo.root, { agent, model: "granite", prompt: "do it", summary: "did it" });
    expect(s.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(s.review).toEqual({ status: "unreviewed", reviewer: null, at: null, comment: null });
    expect(s.filesChanged).toBeUndefined();
    expect(await readSession(repo.root, s.id)).toEqual(s);
    expect(JSON.parse(readFileSync(sessionPath(repo.root, s.id), "utf8")).version).toBe(1);
  });

  it("normalises file lists to repo-relative paths and rejects outside paths", async () => {
    const s = await createSession(repo.root, {
      agent,
      model: "m",
      prompt: "p",
      contextFiles: [path.join(repo.root, "docs", "a.md")],
      filesChanged: ["./src/x.ts", "src/x.ts"],
    });
    expect(s.contextFiles).toEqual(["docs/a.md"]);
    expect(s.filesChanged).toEqual(["src/x.ts"]);
    await expect(createSession(repo.root, { agent, model: "m", prompt: "p", filesChanged: ["../../etc/passwd"] })).rejects.toThrow(InputError);
  });

  it("truncates oversize prompt and summary with a marker", async () => {
    const s = await createSession(repo.root, { agent, model: "m", prompt: "p".repeat(50_000), summary: "s".repeat(50_000) });
    expect(s.prompt.length).toBeLessThanOrEqual(MAX_TEXT);
    expect(s.prompt.endsWith(TRUNCATED_MARKER)).toBe(true);
    expect(s.summary.endsWith(TRUNCATED_MARKER)).toBe(true);
  });

  it("rejects an empty model or prompt type errors as InputError", async () => {
    await expect(createSession(repo.root, { agent, model: "", prompt: "p" })).rejects.toThrow(InputError);
  });

  it("imports a full session object, keeping id and date", async () => {
    const raw = {
      version: 1,
      id: "01JB8Z6Q4X2M7K9N3P5R8T0V1W",
      createdAt: "2026-10-26T17:02:11Z",
      agent: { name: "IBM Bob" },
      model: "m",
      prompt: "p",
      filesChanged: ["src/a.ts"],
    };
    const s = await importSession(repo.root, raw);
    expect(s.id).toBe(raw.id);
    expect(s.createdAt).toBe(raw.createdAt);
    expect((await readSession(repo.root, raw.id))?.filesChanged).toEqual(["src/a.ts"]);
    await expect(importSession(repo.root, { nope: true })).rejects.toThrow(InputError);
  });

  it("returns null for a missing session, throws for bad ids and corrupt files", async () => {
    expect(await readSession(repo.root, "01JB8Z6Q4X2M7K9N3P5R8T0V1W")).toBeNull();
    await expect(readSession(repo.root, "../../x")).rejects.toThrow(InputError);
    await expect(requireSession(repo.root, "01JB8Z6Q4X2M7K9N3P5R8T0V1W")).rejects.toThrow(InputError);
    mkdirSync(path.dirname(sessionPath(repo.root, "01JB8Z6Q4X2M7K9N3P5R8T0V1X")), { recursive: true });
    writeFileSync(sessionPath(repo.root, "01JB8Z6Q4X2M7K9N3P5R8T0V1X"), "{not json");
    await expect(readSession(repo.root, "01JB8Z6Q4X2M7K9N3P5R8T0V1X")).rejects.toThrow(InputError);
  });

  it("lists sessions oldest first and skips corrupt files", async () => {
    const b = await createSession(repo.root, { agent, model: "m", prompt: "b", createdAt: new Date("2026-02-01T00:00:00Z") });
    const a = await createSession(repo.root, { agent, model: "m", prompt: "a", createdAt: new Date("2026-01-01T00:00:00Z") });
    writeFileSync(path.join(repo.root, ".provenance", "sessions", "garbage.json"), "nope");
    expect((await listSessions(repo.root)).map((s) => s.id)).toEqual([a.id, b.id]);
  });

  it("listSessions is empty when the store does not exist", async () => {
    const other = makeRepo();
    try {
      expect(await listSessions(other.root)).toEqual([]);
    } finally {
      other.cleanup();
    }
  });

  it("sets review status, requires a reviewer, and can reset", async () => {
    const s = await createSession(repo.root, { agent, model: "m", prompt: "p" });
    const approved = await setReview(repo.root, s.id, { status: "approved", reviewer: " dana ", comment: "lgtm", at: new Date("2026-03-01T00:00:00Z") });
    expect(approved.review).toEqual({ status: "approved", reviewer: "dana", at: "2026-03-01T00:00:00.000Z", comment: "lgtm" });
    expect((await readSession(repo.root, s.id))?.review.status).toBe("approved");
    await expect(setReview(repo.root, s.id, { status: "rejected", reviewer: "  " })).rejects.toThrow(InputError);
    const reset = await setReview(repo.root, s.id, { status: "unreviewed", reviewer: "" });
    expect(reset.review.status).toBe("unreviewed");
    await expect(setReview(repo.root, "01JB8Z6Q4X2M7K9N3P5R8T0V1W", { status: "approved", reviewer: "x" })).rejects.toThrow(InputError);
  });

  it("manages the pending list without duplicates", async () => {
    expect(await readPending(repo.root)).toEqual({ sessionIds: [] });
    await addPending(repo.root, "01JB8Z6Q4X2M7K9N3P5R8T0V1W");
    await addPending(repo.root, "01JB8Z6Q4X2M7K9N3P5R8T0V1W");
    await addPending(repo.root, "01JB8Z6Q4X2M7K9N3P5R8T0V1X");
    expect((await readPending(repo.root)).sessionIds).toHaveLength(2);
    await clearPending(repo.root, ["01JB8Z6Q4X2M7K9N3P5R8T0V1W"]);
    expect((await readPending(repo.root)).sessionIds).toEqual(["01JB8Z6Q4X2M7K9N3P5R8T0V1X"]);
    await clearPending(repo.root);
    expect((await readPending(repo.root)).sessionIds).toEqual([]);
  });

  it("treats a corrupt pending file as empty", async () => {
    writeFileSync(pendingPath(repo.root), "garbage");
    expect(await readPending(repo.root)).toEqual({ sessionIds: [] });
  });
});
