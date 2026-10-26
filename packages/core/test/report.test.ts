import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addPending,
  buildReportData,
  createSession,
  ensureStore,
  escapeHtml,
  excerpt,
  generateReport,
  linkCommit,
  renderHtml,
  renderMarkdown,
  setReview,
  toRanges,
  type ReportData,
  type Session,
} from "@provenance/core";
import { lines, makeRepo, type TestRepo } from "./helpers.js";

const agent = { name: "IBM Bob" };
const ID_A = "01JB8Z6Q4X2M7K9N3P5R8T0V1A";
const ID_B = "01JB8Z6Q4X2M7K9N3P5R8T0V1B";
const ID_C = "01JB8Z6Q4X2M7K9N3P5R8T0V1C";
const ID_D = "01JB8Z6Q4X2M7K9N3P5R8T0V1D";
const NOW = new Date("2026-10-27T09:00:00Z");

describe("pure helpers", () => {
  it("toRanges collapses sorted, de-duplicated line numbers", () => {
    expect(toRanges("f", [5, 1, 2, 3, 3, 9])).toEqual([
      { file: "f", start: 1, end: 3 },
      { file: "f", start: 5, end: 5 },
      { file: "f", start: 9, end: 9 },
    ]);
    expect(toRanges("f", [])).toEqual([]);
  });
  it("excerpt flattens whitespace and truncates with an ellipsis", () => {
    expect(excerpt("a\n  b\t c")).toBe("a b c");
    expect(excerpt("x".repeat(500), 10)).toBe("xxxxxxxxx…");
  });
  it("escapeHtml escapes markup characters", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;");
  });

  const session = (id: string, status: "unreviewed" | "approved" | "rejected", prompt = "p"): Session => ({
    version: 1,
    id,
    createdAt: "2026-01-01T00:00:00.000Z",
    agent,
    model: "m",
    prompt,
    contextFiles: [],
    toolCalls: [],
    summary: "",
    review: { status, reviewer: status === "unreviewed" ? null : "dana", at: null, comment: null },
  });

  it("buildReportData computes summary, ranges, file ordering and surviving lines", () => {
    const data = buildReportData({
      files: [
        { file: "a.ts", lines: 10 },
        { file: "b.ts", lines: 10 },
        { file: "c.ts", lines: 80 },
      ],
      aiLinesByFile: new Map([
        ["a.ts", [{ line: 1, sessionId: ID_A }, { line: 2, sessionId: ID_A }, { line: 5, sessionId: ID_B }]],
        ["b.ts", [{ line: 3, sessionId: ID_C }, { line: 4, sessionId: ID_B }]],
      ]),
      sessions: [session(ID_A, "approved"), session(ID_B, "unreviewed", "validate"), session(ID_C, "rejected", "log cards")],
      generatedAt: "t",
      head: null,
      since: null,
    });
    expect(data.summary).toMatchObject({
      totalLines: 100,
      aiLines: 5,
      aiPercent: 5,
      unreviewedAiLines: 3,
      unreviewedAiPercent: 3,
      sessionCount: 3,
      sessionsByStatus: { approved: 1, unreviewed: 1, rejected: 1 },
    });
    expect(data.unreviewed.map((r) => `${r.file}:${r.start}-${r.end}:${r.sessionId}`)).toEqual([`a.ts:5-5:${ID_B}`, `b.ts:4-4:${ID_B}`]);
    expect(data.rejected.map((r) => `${r.file}:${r.start}-${r.end}`)).toEqual(["b.ts:3-3"]);
    expect(data.files.map((f) => f.file)).toEqual(["b.ts", "a.ts", "c.ts"]); // by unreviewed desc, then AI lines
    expect(Object.fromEntries(data.sessions.map((s) => [s.id, s.survivingLines]))).toEqual({ [ID_A]: 2, [ID_B]: 2, [ID_C]: 1 });
  });

  it("buildReportData treats a missing session file as unreviewed and handles empty repos", () => {
    const data = buildReportData({
      files: [{ file: "a.ts", lines: 4 }],
      aiLinesByFile: new Map([["a.ts", [{ line: 1, sessionId: ID_A }]]]),
      sessions: [],
      generatedAt: "t",
      head: null,
      since: null,
    });
    expect(data.unreviewed[0]?.promptExcerpt).toBe("(session file not available)");
    const empty = buildReportData({ files: [], aiLinesByFile: new Map(), sessions: [], generatedAt: "t", head: null, since: null });
    expect(empty.summary).toMatchObject({ totalLines: 0, aiPercent: 0, unreviewedAiPercent: 0 });
    expect(renderMarkdown(empty)).toContain("None. Every AI-written line");
  });
});

describe("report on a fixture repo (the demo history)", () => {
  let repo: TestRepo;
  let head: string;

  async function ai(id: string, prompt: string, files: string[], at: string): Promise<void> {
    await createSession(repo.root, { id, agent, model: "granite-test", prompt, summary: `did: ${prompt}`, filesChanged: files, createdAt: new Date(at) });
    await addPending(repo.root, id);
  }

  beforeEach(async () => {
    repo = makeRepo();
    await ensureStore(repo.root);
    // 1. human commit
    repo.write("src/client.ts", lines(6, "c"));
    repo.write("src/refund.ts", lines(6, "r"));
    repo.write("docs/readme with space.md", lines(3, "d"));
    repo.write("assets/logo.bin", "\0\0binary\0");
    repo.commit("human base");
    // 2. session A: approved
    await ai(ID_A, "Add retry with exponential backoff to the payment client.", ["src/client.ts"], "2026-10-26T10:00:00Z");
    repo.write("src/client.ts", lines(6, "c") + "retry1\nretry2\n");
    repo.commit("ai: retry");
    await linkCommit(repo.root);
    await setReview(repo.root, ID_A, { status: "approved", reviewer: "dana", at: new Date("2026-10-26T12:00:00Z") });
    // 3. sessions B and C in one commit
    await ai(ID_B, "Add input validation to the refund endpoint", ["src/refund.ts"], "2026-10-26T13:00:00Z");
    await ai(ID_C, "Write unit tests for refunds", ["test/refund.test.ts"], "2026-10-26T13:05:00Z");
    repo.write("src/refund.ts", lines(6, "r") + "val1\nval2\nval3\nval4\n");
    repo.write("test/refund.test.ts", "t1\nt2\nt3\n");
    repo.commit("ai: validation + tests");
    await linkCommit(repo.root);
    // 4. human rewrites val2 (so it becomes human)
    repo.write("src/refund.ts", lines(6, "r") + "val1\nHUMAN\nval3\nval4\n");
    repo.commit("human fix");
    // 5. session D rejected, and the file is renamed afterwards
    await ai(ID_D, "Log card numbers for debugging <b>& \"quotes\"</b>", ["src/client.ts"], "2026-10-26T15:00:00Z");
    repo.write("src/client.ts", lines(6, "c") + "retry1\nretry2\nlog(card)\n");
    repo.commit("ai: logging");
    await linkCommit(repo.root);
    await setReview(repo.root, ID_D, { status: "rejected", reviewer: "dana", comment: "PII — must not log card data.", at: new Date("2026-10-26T16:00:00Z") });
    repo.git("mv", "src/client.ts", "src/payment-client.ts");
    head = repo.commit("rename");
  });
  afterEach(() => repo.cleanup());

  it("computes the numbers, follows the rename, and lists unreviewed + rejected ranges", async () => {
    const d = await generateReport(repo.root, { now: NOW });
    expect(d.head).toBe(head);
    // Lines: client 9 + refund 10 + readme 3 + test 3 = 25 (binary file and .provenance excluded)
    expect(d.summary.totalLines).toBe(25);
    // AI at HEAD: A 2 (client 7-8), D 1 (client 9), B 3 (val1, val3, val4), C 3 (tests)
    expect(d.summary.aiLines).toBe(9);
    expect(d.summary.unreviewedAiLines).toBe(7); // all but A's two
    expect(d.summary.sessionsByStatus).toEqual({ unreviewed: 2, approved: 1, rejected: 1 });
    expect(d.unreviewed.map((r) => `${r.file}:${r.start}-${r.end}:${r.sessionId.slice(-1)}`)).toEqual([
      "src/refund.ts:7-7:B",
      "src/refund.ts:9-10:B",
      "test/refund.test.ts:1-3:C",
    ]);
    expect(d.rejected.map((r) => `${r.file}:${r.start}-${r.end}:${r.sessionId.slice(-1)}`)).toEqual(["src/payment-client.ts:9-9:D"]);
    const surviving = Object.fromEntries(d.sessions.map((s) => [s.id.slice(-1), s.survivingLines]));
    expect(surviving).toEqual({ A: 2, B: 3, C: 3, D: 1 });
    const rows = Object.fromEntries(d.files.map((f) => [f.file, f]));
    expect(rows["docs/readme with space.md"]).toMatchObject({ lines: 3, aiLines: 0, unreviewedAiLines: 0 });
    expect(rows["assets/logo.bin"]).toBeUndefined();
    expect(d.files[0]?.file).toBe("src/refund.ts"); // most unreviewed first (3 vs 3 ties broken by ai lines, then name)
  });

  it("ignores working-tree edits: the report is about HEAD", async () => {
    repo.write("src/refund.ts", "totally different\n");
    const d = await generateReport(repo.root, { now: NOW });
    expect(d.summary.aiLines).toBe(9);
  });

  it("--since keeps only sessions on or after the date", async () => {
    const d = await generateReport(repo.root, { now: NOW, since: "2026-10-26T14:00:00Z" });
    expect(d.sessions.map((s) => s.id.slice(-1))).toEqual(["D"]);
    expect(d.summary.aiLines).toBe(1);
  });

  it("an empty repository yields an empty report", async () => {
    const empty = makeRepo();
    try {
      const d = await generateReport(empty.root, { now: NOW });
      expect(d.summary).toMatchObject({ totalLines: 0, aiLines: 0, sessionCount: 0 });
      expect(d.head).toBeNull();
    } finally {
      empty.cleanup();
    }
  });

  /** HEAD sha differs per run; mask it so snapshots are stable. */
  const mask = (text: string, d: ReportData): string => text.replaceAll(d.head ? d.head.slice(0, 7) : "∅", "HEAD7");

  it("markdown report matches the snapshot and puts the unreviewed list before By file", async () => {
    const d = await generateReport(repo.root, { now: NOW });
    const md = renderMarkdown(d);
    expect(md.indexOf("## Unreviewed AI code")).toBeGreaterThan(-1);
    expect(md.indexOf("## Unreviewed AI code")).toBeLessThan(md.indexOf("## By file"));
    expect(md).toContain("`src/refund.ts:9-10`");
    expect(md).toContain("PII — must not log card data.");
    expect(mask(md, d)).toMatchSnapshot();
  });

  it("html report matches the snapshot, is self-contained, and escapes untrusted text", async () => {
    const d = await generateReport(repo.root, { now: NOW });
    const html = renderHtml(d);
    expect(html).toContain("src/refund.ts:9-10");
    expect(html.indexOf("Unreviewed AI code")).toBeLessThan(html.indexOf("<h2>By file</h2>"));
    // no network requests of any kind: no URLs, scripts, links, images, imports, frames
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toMatch(/<script|<link|<img|<iframe|<object|<embed|@import|url\(|src=|href=/i);
    // prompt text is escaped, so it cannot inject markup
    expect(html).not.toContain("<b>&");
    expect(html).toContain("&lt;b&gt;&amp; &quot;quotes&quot;&lt;/b&gt;");
    expect(html).toContain("rejected");
    expect(mask(html, d)).toMatchSnapshot();
  });
});
