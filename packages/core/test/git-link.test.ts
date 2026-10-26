import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_TREE,
  InputError,
  NotAGitRepoError,
  assignHunks,
  blame,
  createSession,
  diffHunks,
  ensureStore,
  findRepoRoot,
  git,
  headSha,
  linkCommit,
  linkSession,
  listNotedCommits,
  listTrackedFiles,
  mergeNotes,
  addPending,
  parentOf,
  parseBlamePorcelain,
  parseDiffHunks,
  readNote,
  readPending,
  resolveCommit,
  sessionTrailers,
  unquoteGitPath,
  writeNote,
  type Hunk,
} from "@provenance/core";
import { lines, makeRepo, type TestRepo } from "./helpers.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const agent = { name: "IBM Bob" };

describe("pure parsers", () => {
  it("parseDiffHunks reads new-side ranges and skips pure deletions", () => {
    const diff = [
      "diff --git a/a.ts b/a.ts",
      "index 111..222 100644",
      "--- a/a.ts",
      "+++ b/a.ts",
      "@@ -3,0 +4,2 @@ ctx",
      "+x",
      "+y",
      "@@ -10,2 +11 @@",
      "-a",
      "-b",
      "+c",
      "@@ -20,3 +20,0 @@",
      "-gone",
      "diff --git a/old.ts b/old.ts",
      "deleted file mode 100644",
      "--- a/old.ts",
      "+++ /dev/null",
      "@@ -1,2 +0,0 @@",
      "-q",
    ].join("\n");
    expect(parseDiffHunks(diff)).toEqual([
      { file: "a.ts", start: 4, end: 5 },
      { file: "a.ts", start: 11, end: 11 },
    ]);
  });

  it("parseDiffHunks handles new files and quoted / spaced names", () => {
    const diff = [
      "diff --git a/my file.ts b/my file.ts",
      "new file mode 100644",
      "--- /dev/null",
      "+++ b/my file.ts\t",
      "@@ -0,0 +1,3 @@",
      "+1",
      "diff --git a/t\\\"q.ts b/t\\\"q.ts",
      "--- /dev/null",
      '+++ "b/t\\"q.ts"',
      "@@ -0,0 +1 @@",
      "+1",
    ].join("\n");
    expect(parseDiffHunks(diff)).toEqual([
      { file: "my file.ts", start: 1, end: 3 },
      { file: 't"q.ts', start: 1, end: 1 },
    ]);
  });

  it("unquoteGitPath decodes escapes and octal utf-8", () => {
    expect(unquoteGitPath("plain.ts")).toBe("plain.ts");
    expect(unquoteGitPath('"a\\tb"')).toBe("a\tb");
    expect(unquoteGitPath('"caf\\303\\251.ts"')).toBe("café.ts");
    expect(unquoteGitPath('"back\\\\slash"')).toBe("back\\slash");
  });

  it("parseBlamePorcelain maps repeated shas to cached metadata", () => {
    const sha1 = "a".repeat(40);
    const sha2 = "b".repeat(40);
    const zero = "0".repeat(40);
    const out = [
      `${sha1} 1 1 2`,
      "author-time 1700000000",
      "filename src/a.ts",
      "\tfirst",
      `${sha1} 2 2`,
      "\tsecond",
      `${sha2} 7 3 1`,
      "author-time 1700000100",
      "filename old name.ts",
      "\tthird",
      `${zero} 4 4 1`,
      "author-time 1700000200",
      "filename src/a.ts",
      "\tfourth",
      "",
    ].join("\n");
    const res = parseBlamePorcelain(out);
    expect(res).toHaveLength(4);
    expect(res[1]).toMatchObject({ line: 2, sha: sha1, origLine: 2, origFile: "src/a.ts", date: "2023-11-14T22:13:20.000Z" });
    expect(res[2]).toMatchObject({ line: 3, sha: sha2, origLine: 7, origFile: "old name.ts" });
    expect(res[3]).toMatchObject({ line: 4, sha: zero, date: null });
  });

  it("parseBlamePorcelain returns [] for empty output", () => {
    expect(parseBlamePorcelain("")).toEqual([]);
  });
});

describe("assignHunks / mergeNotes", () => {
  const hunks: Hunk[] = [
    { file: "a.ts", start: 1, end: 3 },
    { file: "b.ts", start: 1, end: 2 },
  ];
  it("no sessions => no links", () => {
    expect(assignHunks([], hunks)).toEqual([]);
  });
  it("one session without filesChanged gets every hunk", () => {
    expect(assignHunks([{ id: "S1" }], hunks)).toEqual([{ sessionId: "S1", hunks }]);
  });
  it("one session with filesChanged only gets those files", () => {
    expect(assignHunks([{ id: "S1", filesChanged: ["b.ts"] }], hunks)[0]?.hunks).toEqual([hunks[1]]);
  });
  it("several sessions split by filesChanged; unclaimed hunks stay unlinked", () => {
    const links = assignHunks(
      [
        { id: "S1", filesChanged: ["a.ts"] },
        { id: "S2", filesChanged: [] },
        { id: "S3" },
      ],
      hunks,
    );
    expect(links[0]?.hunks).toEqual([hunks[0]]);
    expect(links[1]?.hunks).toEqual([]);
    expect(links[2]?.hunks).toEqual([]);
  });
  it("mergeNotes unions hunks per session and keeps other sessions", () => {
    const id1 = "01JB8Z6Q4X2M7K9N3P5R8T0V1W";
    const id2 = "01JB8Z6Q4X2M7K9N3P5R8T0V1X";
    const existing = { version: 1 as const, links: [{ sessionId: id1, hunks: [{ file: "a", start: 1, end: 2 }] }] };
    const merged = mergeNotes(existing, [
      { sessionId: id1, hunks: [{ file: "a", start: 1, end: 2 }, { file: "a", start: 5, end: 6 }] },
      { sessionId: id2, hunks: [{ file: "b", start: 1, end: 1 }] },
    ]);
    expect(merged.links).toHaveLength(2);
    expect(merged.links[0]?.hunks).toHaveLength(2);
    expect(mergeNotes(null, []).links).toEqual([]);
  });
});

describe("git helpers", () => {
  let repo: TestRepo;
  beforeEach(() => {
    repo = makeRepo();
  });
  afterEach(() => repo.cleanup());

  it("findRepoRoot works from a subdirectory and fails outside a repo", async () => {
    repo.write("sub/dir/f.txt", "x\n");
    expect(await findRepoRoot(path.join(repo.root, "sub", "dir"))).toBe(repo.root);
    const outside = mkdtempSync(path.join(tmpdir(), "prov-outside-"));
    try {
      await expect(findRepoRoot(outside)).rejects.toThrow(NotAGitRepoError);
      await expect(findRepoRoot(path.join(outside, "missing"))).rejects.toThrow(NotAGitRepoError);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("headSha is null before the first commit, then resolves; parentOf is null for a root commit", async () => {
    expect(await headSha(repo.root)).toBeNull();
    repo.write("a.txt", "1\n");
    const first = repo.commit("one");
    expect(await headSha(repo.root)).toBe(first);
    expect(await parentOf(repo.root, first)).toBeNull();
    repo.write("a.txt", "1\n2\n");
    const second = repo.commit("two");
    expect(await parentOf(repo.root, second)).toBe(first);
  });

  it("resolveCommit rejects unknown and option-like refs", async () => {
    repo.write("a.txt", "1\n");
    const sha = repo.commit("one");
    expect(await resolveCommit(repo.root, "HEAD")).toBe(sha);
    await expect(resolveCommit(repo.root, "nope")).rejects.toThrow(InputError);
    await expect(resolveCommit(repo.root, "--output=/tmp/x")).rejects.toThrow(InputError);
  });

  it("diffHunks for a root commit diffs against the empty tree", async () => {
    repo.write("a.ts", lines(4));
    const sha = repo.commit("root");
    expect(EMPTY_TREE).toBe("4b825dc642cb6eb9a060e54bf8d69288fbee4904");
    expect(await diffHunks(repo.root, sha)).toEqual([{ file: "a.ts", start: 1, end: 4 }]);
  });

  it("diffHunks reports only added/changed new-side lines for later commits", async () => {
    repo.write("a.ts", lines(10));
    repo.commit("root");
    repo.write("a.ts", lines(10).replace("L3\n", "L3x\nL3y\n").replace("L9\n", ""));
    const sha = repo.commit("edit");
    expect(await diffHunks(repo.root, sha)).toEqual([{ file: "a.ts", start: 3, end: 4 }]);
  });

  it("blame and listTrackedFiles handle file names with spaces and quotes", async () => {
    repo.write("my dir/it's a \"file\".ts", lines(3));
    const sha = repo.commit("weird");
    const files = await listTrackedFiles(repo.root);
    expect(files).toEqual(["my dir/it's a \"file\".ts"]);
    const b = await blame(repo.root, files[0] as string);
    expect(b).toHaveLength(3);
    expect(b[0]).toMatchObject({ sha, origLine: 1, origFile: "my dir/it's a \"file\".ts" });
    expect(await diffHunks(repo.root, sha)).toEqual([{ file: "my dir/it's a \"file\".ts", start: 1, end: 3 }]);
  });

  it("blame of a single line, and errors for untracked files / bad lines", async () => {
    repo.write("a.ts", lines(3));
    repo.commit("one");
    expect(await blame(repo.root, "a.ts", 2)).toHaveLength(1);
    await expect(blame(repo.root, "a.ts", 99)).rejects.toThrow(InputError);
    await expect(blame(repo.root, "missing.ts")).rejects.toThrow(InputError);
  });

  it("read/write notes round-trip; absent or corrupt note reads as null", async () => {
    repo.write("a.ts", lines(2));
    const sha = repo.commit("one");
    expect(await readNote(repo.root, sha)).toBeNull();
    expect(await listNotedCommits(repo.root)).toEqual([]);
    const note = { version: 1 as const, links: [{ sessionId: "01JB8Z6Q4X2M7K9N3P5R8T0V1W", hunks: [{ file: "a.ts", start: 1, end: 2 }] }] };
    await writeNote(repo.root, sha, note);
    expect(await readNote(repo.root, sha)).toEqual(note);
    expect(await listNotedCommits(repo.root)).toEqual([sha]);
    await git(repo.root, ["notes", "--ref=refs/notes/provenance", "add", "-f", "-m", "not json", sha]);
    expect(await readNote(repo.root, sha)).toBeNull();
  });

  it("writeNote works without a configured git identity", async () => {
    repo.write("a.ts", lines(1));
    const sha = repo.commit("one");
    const savedEnv = { ...process.env };
    // helpers pin identity via env on the test side only; the core call below sees none of it
    for (const k of ["GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL"]) delete process.env[k];
    process.env["GIT_CONFIG_GLOBAL"] = "/dev/null";
    process.env["GIT_CONFIG_SYSTEM"] = "/dev/null";
    process.env["HOME"] = repo.root;
    try {
      await writeNote(repo.root, sha, { version: 1, links: [] });
      expect(await readNote(repo.root, sha)).toEqual({ version: 1, links: [] });
    } finally {
      process.env = savedEnv;
    }
  });

  it("sessionTrailers parses Provenance-Session trailers only", async () => {
    repo.write("a.ts", "x\n");
    const msg = "feat: x\n\nBody text.\n\nProvenance-Session: 01JB8Z6Q4X2M7K9N3P5R8T0V1W\nProvenance-Session: 01jb8z6q4x2m7k9n3p5r8t0v1x\nProvenance-Session: not-an-id\nSigned-off-by: A <a@b.c>";
    const sha = repo.commit(msg);
    expect(await sessionTrailers(repo.root, sha)).toEqual(["01JB8Z6Q4X2M7K9N3P5R8T0V1W", "01JB8Z6Q4X2M7K9N3P5R8T0V1X"]);
    repo.write("b.ts", "x\n");
    const plain = repo.commit("Mentions Provenance-Session: 01JB8Z6Q4X2M7K9N3P5R8T0V1Y inline");
    expect(await sessionTrailers(repo.root, plain)).toEqual([]);
  });
});

describe("linking", () => {
  let repo: TestRepo;
  beforeEach(async () => {
    repo = makeRepo();
    await ensureStore(repo.root);
  });
  afterEach(() => repo.cleanup());

  it("a session written then committed produces the right note and clears pending", async () => {
    repo.write("src/a.ts", lines(5));
    repo.commit("human base");
    const s = await createSession(repo.root, { agent, model: "m", prompt: "p" });
    await addPending(repo.root, s.id);
    repo.write("src/a.ts", lines(5).replace("L2\n", "L2\nNEW1\nNEW2\n"));
    const sha = repo.commit("ai change");
    const res = await linkCommit(repo.root);
    expect(res.sessionIds).toEqual([s.id]);
    expect(await readNote(repo.root, sha)).toEqual({
      version: 1,
      links: [{ sessionId: s.id, hunks: [{ file: "src/a.ts", start: 3, end: 4 }] }],
    });
    expect((await readPending(repo.root)).sessionIds).toEqual([]);
  });

  it("root commits link against the empty tree", async () => {
    const s = await createSession(repo.root, { agent, model: "m", prompt: "p" });
    await addPending(repo.root, s.id);
    repo.write("a.ts", lines(3));
    repo.write("b.ts", lines(2));
    const sha = repo.commit("root");
    await linkCommit(repo.root);
    const note = await readNote(repo.root, sha);
    expect(note?.links[0]?.hunks).toEqual([
      { file: "a.ts", start: 1, end: 3 },
      { file: "b.ts", start: 1, end: 2 },
    ]);
  });

  it("two sessions with filesChanged split hunks by file", async () => {
    repo.write("src/refund.ts", lines(3));
    repo.write("test/refund.test.ts", lines(1));
    repo.commit("base");
    const b = await createSession(repo.root, { agent, model: "m", prompt: "validate", filesChanged: ["src/refund.ts"] });
    const c = await createSession(repo.root, { agent, model: "m", prompt: "tests", filesChanged: ["test/refund.test.ts"] });
    await addPending(repo.root, b.id);
    await addPending(repo.root, c.id);
    repo.write("src/refund.ts", lines(3) + "V1\nV2\n");
    repo.write("test/refund.test.ts", lines(1) + "T1\n");
    repo.write("README.md", "human docs\n");
    const sha = repo.commit("ai two sessions");
    await linkCommit(repo.root);
    const note = await readNote(repo.root, sha);
    const byId = Object.fromEntries((note?.links ?? []).map((l) => [l.sessionId, l.hunks]));
    expect(byId[b.id]).toEqual([{ file: "src/refund.ts", start: 4, end: 5 }]);
    expect(byId[c.id]).toEqual([{ file: "test/refund.test.ts", start: 2, end: 2 }]);
    // README.md claimed by nobody: stays unlinked
    const all = (note?.links ?? []).flatMap((l) => l.hunks.map((h) => h.file));
    expect(all).not.toContain("README.md");
  });

  it("trailers link without any pending file", async () => {
    repo.write("a.ts", lines(2));
    const s = await createSession(repo.root, { agent, model: "m", prompt: "p" });
    const sha = repo.commit(`feat\n\nProvenance-Session: ${s.id}`);
    await linkCommit(repo.root);
    expect((await readNote(repo.root, sha))?.links.map((l) => l.sessionId)).toEqual([s.id]);
  });

  it("pending and trailer ids are unioned without duplicates", async () => {
    repo.write("a.ts", lines(2));
    const s1 = await createSession(repo.root, { agent, model: "m", prompt: "1" });
    const s2 = await createSession(repo.root, { agent, model: "m", prompt: "2" });
    await addPending(repo.root, s1.id);
    await addPending(repo.root, s2.id);
    const sha = repo.commit(`feat\n\nProvenance-Session: ${s2.id}`);
    const res = await linkCommit(repo.root);
    expect([...res.sessionIds].sort()).toEqual([s1.id, s2.id].sort());
    expect((await readNote(repo.root, sha))?.links).toHaveLength(2);
  });

  it("is a no-op when nothing is pending and no trailers exist", async () => {
    repo.write("a.ts", lines(2));
    const sha = repo.commit("human");
    const res = await linkCommit(repo.root);
    expect(res.sessionIds).toEqual([]);
    expect(await readNote(repo.root, sha)).toBeNull();
  });

  it("re-linking merges instead of overwriting", async () => {
    repo.write("a.ts", lines(2));
    repo.write("b.ts", lines(2));
    const s1 = await createSession(repo.root, { agent, model: "m", prompt: "1", filesChanged: ["a.ts"] });
    const s2 = await createSession(repo.root, { agent, model: "m", prompt: "2", filesChanged: ["b.ts"] });
    const sha = repo.commit("both");
    await linkSession(repo.root, s1.id, sha);
    await linkSession(repo.root, s2.id, sha);
    await linkSession(repo.root, s1.id, sha); // idempotent
    const note = await readNote(repo.root, sha);
    expect(note?.links).toHaveLength(2);
    expect(note?.links.find((l) => l.sessionId === s1.id)?.hunks).toEqual([{ file: "a.ts", start: 1, end: 2 }]);
    expect(note?.links.find((l) => l.sessionId === s2.id)?.hunks).toEqual([{ file: "b.ts", start: 1, end: 2 }]);
  });

  it("linkSession removes the session from pending and rejects bad input", async () => {
    repo.write("a.ts", lines(1));
    const s = await createSession(repo.root, { agent, model: "m", prompt: "p" });
    await addPending(repo.root, s.id);
    const sha = repo.commit("x");
    await linkSession(repo.root, s.id.toLowerCase(), "HEAD");
    expect((await readPending(repo.root)).sessionIds).toEqual([]);
    expect(await readNote(repo.root, sha)).not.toBeNull();
    await expect(linkSession(repo.root, s.id, "does-not-exist")).rejects.toThrow(InputError);
    await expect(linkSession(repo.root, "bad id", "HEAD")).rejects.toThrow();
  });

  it("file names with spaces link correctly", async () => {
    repo.write("my dir/pay ment.ts", lines(3));
    const s = await createSession(repo.root, { agent, model: "m", prompt: "p", filesChanged: ["my dir/pay ment.ts"] });
    await addPending(repo.root, s.id);
    const sha = repo.commit("spaces");
    await linkCommit(repo.root);
    expect((await readNote(repo.root, sha))?.links[0]?.hunks).toEqual([{ file: "my dir/pay ment.ts", start: 1, end: 3 }]);
  });

  it("links a session whose file is missing (e.g. not yet pulled) without file filtering", async () => {
    repo.write("a.ts", lines(2));
    const sha = repo.commit(`feat\n\nProvenance-Session: 01JB8Z6Q4X2M7K9N3P5R8T0V1W`);
    await linkCommit(repo.root);
    expect((await readNote(repo.root, sha))?.links[0]?.hunks).toEqual([{ file: "a.ts", start: 1, end: 2 }]);
  });
});
