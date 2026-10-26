import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  InputError,
  addPending,
  attributeFile,
  attributeLine,
  configureNotesRewrite,
  createSession,
  ensureStore,
  findLinkedSession,
  linkCommit,
  readNote,
  resolveBlameLine,
  sessionsTouching,
  type BlameLine,
  type CommitNote,
  type Session,
} from "@provenance/core";
import { lines, makeRepo, type TestRepo } from "./helpers.js";

const agent = { name: "IBM Bob" };
const ID = "01JB8Z6Q4X2M7K9N3P5R8T0V1W";

describe("findLinkedSession / resolveBlameLine (pure)", () => {
  const note: CommitNote = {
    version: 1,
    links: [{ sessionId: ID, hunks: [{ file: "a.ts", start: 3, end: 5 }] }],
  };
  const blamed = (over: Partial<BlameLine>): BlameLine => ({
    line: 1,
    sha: "a".repeat(40),
    origLine: 3,
    origFile: "a.ts",
    date: "2026-01-01T00:00:00.000Z",
    ...over,
  });

  it("matches inclusive range boundaries and the right file only", () => {
    expect(findLinkedSession(note, "a.ts", 3)).toBe(ID);
    expect(findLinkedSession(note, "a.ts", 5)).toBe(ID);
    expect(findLinkedSession(note, "a.ts", 2)).toBeNull();
    expect(findLinkedSession(note, "a.ts", 6)).toBeNull();
    expect(findLinkedSession(note, "b.ts", 4)).toBeNull();
    expect(findLinkedSession(null, "a.ts", 4)).toBeNull();
  });

  it("zero sha => uncommitted without consulting sources", async () => {
    const boom = async (): Promise<never> => {
      throw new Error("must not be called");
    };
    const r = await resolveBlameLine(blamed({ sha: "0".repeat(40) }), { note: boom, session: boom });
    expect(r).toEqual({ kind: "uncommitted" });
  });

  it("note match => ai, with the session (or null if its file is missing)", async () => {
    const session = { id: ID } as Session;
    const withSession = await resolveBlameLine(blamed({}), { note: async () => note, session: async () => session });
    expect(withSession).toMatchObject({ kind: "ai", sessionId: ID, session });
    const missing = await resolveBlameLine(blamed({}), { note: async () => note, session: async () => null });
    expect(missing).toMatchObject({ kind: "ai", sessionId: ID, session: null });
  });

  it("no note or no matching hunk => human with commit info", async () => {
    const none = await resolveBlameLine(blamed({}), { note: async () => null, session: async () => null });
    expect(none).toEqual({
      kind: "human",
      commit: { sha: "a".repeat(40), date: "2026-01-01T00:00:00.000Z", file: "a.ts", line: 3 },
    });
    const miss = await resolveBlameLine(blamed({ origLine: 9 }), { note: async () => note, session: async () => null });
    expect(miss.kind).toBe("human");
  });
});

describe("attribution against a real repo", () => {
  let repo: TestRepo;
  let sessionId: string;
  let aiCommit: string;

  /** base: 10 human lines. AI commit inserts AI1..AI3 after L4 (file lines 5-7). */
  beforeEach(async () => {
    repo = makeRepo();
    await ensureStore(repo.root);
    repo.write("src/a.ts", lines(10));
    repo.commit("human base");
    const s = await createSession(repo.root, { agent, model: "m", prompt: "add three lines", summary: "added" });
    sessionId = s.id;
    await addPending(repo.root, s.id);
    repo.write("src/a.ts", lines(10).replace("L4\n", "L4\nAI1\nAI2\nAI3\n"));
    aiCommit = repo.commit("ai commit");
    await linkCommit(repo.root);
  });
  afterEach(() => repo.cleanup());

  it("an AI line returns its session; human lines return human", async () => {
    const ai = await attributeLine(repo.root, "src/a.ts", 6);
    expect(ai).toMatchObject({ kind: "ai", line: 6, sessionId, commit: { sha: aiCommit, line: 6, file: "src/a.ts" } });
    if (ai.kind === "ai") expect(ai.session?.prompt).toBe("add three lines");
    const human = await attributeLine(repo.root, "src/a.ts", 2);
    expect(human.kind).toBe("human");
    expect((await attributeLine(repo.root, "src/a.ts", 8)).kind).toBe("human");
  });

  it("a later human edit to an AI line returns human", async () => {
    repo.write("src/a.ts", lines(10).replace("L4\n", "L4\nAI1\nHUMAN-EDIT\nAI3\n"));
    const humanCommit = repo.commit("human edits one AI line");
    const edited = await attributeLine(repo.root, "src/a.ts", 6);
    expect(edited).toMatchObject({ kind: "human", commit: { sha: humanCommit } });
    expect((await attributeLine(repo.root, "src/a.ts", 5)).kind).toBe("ai");
    expect((await attributeLine(repo.root, "src/a.ts", 7)).kind).toBe("ai");
  });

  it("an untouched AI line still returns the session after later commits shift it down", async () => {
    repo.write("src/a.ts", "HEADER1\nHEADER2\nHEADER3\n" + lines(10).replace("L4\n", "L4\nAI1\nAI2\nAI3\n"));
    repo.commit("human prepends header");
    const shifted = await attributeLine(repo.root, "src/a.ts", 5 + 3);
    expect(shifted).toMatchObject({ kind: "ai", sessionId, commit: { sha: aiCommit, line: 5 } });
    expect((await attributeLine(repo.root, "src/a.ts", 5)).kind).toBe("human");
  });

  it("an uncommitted line returns uncommitted", async () => {
    repo.write("src/a.ts", lines(10).replace("L4\n", "L4\nAI1\nAI2\nAI3\nUNSAVED\n"));
    const r = await attributeLine(repo.root, "src/a.ts", 8);
    expect(r).toEqual({ kind: "uncommitted", line: 8 });
    expect((await attributeLine(repo.root, "src/a.ts", 6)).kind).toBe("ai");
  });

  it("an amended commit keeps its note when notes rewrite is configured", async () => {
    await configureNotesRewrite(repo.root);
    repo.write("src/a.ts", lines(10).replace("L4\n", "L4\nAI1\nAI2\nAI3\n") + "L11\n");
    repo.git("add", "-A");
    repo.git("commit", "-q", "--amend", "-m", "ai commit (amended)");
    const amended = repo.git("rev-parse", "HEAD").trim();
    expect(amended).not.toBe(aiCommit);
    expect(await readNote(repo.root, amended)).not.toBeNull();
    const r = await attributeLine(repo.root, "src/a.ts", 6);
    expect(r).toMatchObject({ kind: "ai", sessionId, commit: { sha: amended } });
  });

  it("attributeFile covers every line from one blame call", async () => {
    const all = await attributeFile(repo.root, "src/a.ts");
    expect(all).toHaveLength(13);
    expect(all.map((a) => a.line)).toEqual(Array.from({ length: 13 }, (_, i) => i + 1));
    expect(all.filter((a) => a.kind === "ai").map((a) => a.line)).toEqual([5, 6, 7]);
  });

  it("sessionsTouching counts lines per distinct session within a range", async () => {
    const s2 = await createSession(repo.root, { agent, model: "m2", prompt: "second" });
    await addPending(repo.root, s2.id);
    repo.write("src/a.ts", lines(10).replace("L4\n", "L4\nAI1\nAI2\nAI3\n") + "S2-1\nS2-2\n");
    repo.commit("second ai");
    await linkCommit(repo.root);

    const whole = await sessionsTouching(repo.root, "src/a.ts");
    expect(whole.map((x) => [x.sessionId, x.lines])).toEqual([
      [sessionId, 3],
      [s2.id, 2],
    ]);
    expect(whole[0]?.session?.prompt).toBe("add three lines");
    const range = await sessionsTouching(repo.root, "src/a.ts", 6, 6);
    expect(range.map((x) => [x.sessionId, x.lines])).toEqual([[sessionId, 1]]);
    expect(await sessionsTouching(repo.root, "src/a.ts", 1, 3)).toEqual([]);
  });

  it("surfaces bad input as InputError", async () => {
    await expect(attributeLine(repo.root, "src/a.ts", 999)).rejects.toThrow(InputError);
    await expect(attributeFile(repo.root, "nope.ts")).rejects.toThrow(InputError);
  });

  it("follows a rename: blame reports the original file name used in the note", async () => {
    repo.git("mv", "src/a.ts", "src/renamed.ts");
    repo.commit("rename");
    const r = await attributeLine(repo.root, "src/renamed.ts", 6);
    expect(r).toMatchObject({ kind: "ai", sessionId, commit: { sha: aiCommit, file: "src/a.ts" } });
  });
});
