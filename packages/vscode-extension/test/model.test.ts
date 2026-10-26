import { describe, expect, it } from "vitest";
import {
  COMMANDS,
  PROMPT_LIMIT,
  commandLink,
  escapeMarkdown,
  fileStats,
  gutterBuckets,
  hoverMarkdown,
  statusBarText,
  statusOf,
  toRanges,
  type BlameJson,
  type SessionJson,
} from "../src/model.js";

const session = (id: string, status: "unreviewed" | "approved" | "rejected", over: Partial<SessionJson> = {}): SessionJson => ({
  id,
  createdAt: "2026-10-26T13:00:00.000Z",
  agent: { name: "IBM Bob" },
  model: "granite-test",
  prompt: "Add input validation to the refund endpoint",
  contextFiles: ["src/refund.ts"],
  summary: "Reject negative amounts",
  review: { status, reviewer: status === "unreviewed" ? null : "dana", at: null, comment: null },
  ...over,
});

const blame: BlameJson = {
  file: "src/refund.ts",
  head: "h",
  lines: [
    { line: 1, kind: "human", commit: { sha: "a".repeat(40), date: "2026-10-26T10:00:00.000Z" } },
    { line: 2, kind: "ai", sessionId: "B", commit: { sha: "b".repeat(40), date: "2026-10-26T13:30:00.000Z" } },
    { line: 3, kind: "ai", sessionId: "B", commit: { sha: "b".repeat(40), date: "2026-10-26T13:30:00.000Z" } },
    { line: 4, kind: "ai", sessionId: "A", commit: { sha: "c".repeat(40), date: null } },
    { line: 5, kind: "ai", sessionId: "D" },
    { line: 6, kind: "ai", sessionId: "GONE" },
    { line: 7, kind: "uncommitted" },
  ],
  sessions: { A: session("A", "approved"), B: session("B", "unreviewed"), D: session("D", "rejected", { review: { status: "rejected", reviewer: "dana", at: null, comment: "PII — must not log card data." } }) },
};

describe("model", () => {
  it("statusOf treats a missing session as unreviewed", () => {
    expect(statusOf(blame, blame.lines[1]!)).toBe("unreviewed");
    expect(statusOf(blame, blame.lines[3]!)).toBe("approved");
    expect(statusOf(blame, blame.lines[4]!)).toBe("rejected");
    expect(statusOf(blame, blame.lines[5]!)).toBe("unreviewed");
  });

  it("gutterBuckets groups AI lines by review colour", () => {
    expect(gutterBuckets(blame)).toEqual({ approved: [4], unreviewed: [2, 3, 6], rejected: [5] });
  });

  it("fileStats and statusBarText follow the spec wording", () => {
    expect(fileStats(blame)).toEqual({ totalLines: 7, aiLines: 5, aiPercent: 71, unreviewedLines: 4 });
    expect(statusBarText(blame)).toBe("AI: 71% of this file · 4 lines unreviewed");
    expect(statusBarText({ ...blame, lines: [{ line: 1, kind: "ai", sessionId: "B" }] })).toBe("AI: 100% of this file · 1 line unreviewed");
    expect(statusBarText({ ...blame, lines: [] })).toBe("AI: 0% of this file · 0 lines unreviewed");
    expect(statusBarText(null)).toBe("AI: n/a");
  });

  it("toRanges collapses and de-duplicates", () => {
    expect(toRanges([5, 2, 3, 3, 9, 4])).toEqual([[2, 5], [9, 9]]);
    expect(toRanges([])).toEqual([]);
  });

  it("commandLink encodes arguments as the command URI expects", () => {
    expect(commandLink("Approve", "x.y", "ID 1")).toBe("[Approve](command:x.y?%5B%22ID%201%22%5D)");
  });

  it("escapeMarkdown neutralises markdown and link syntax", () => {
    expect(escapeMarkdown("[x](command:evil) `y` *z* <b>")).toBe("\\[x\\]\\(command\\:evil\\) \\`y\\` \\*z\\* \\<b\\>");
  });

  describe("hoverMarkdown", () => {
    it("returns null for human, uncommitted and unknown lines", () => {
      expect(hoverMarkdown(blame, 1)).toBeNull();
      expect(hoverMarkdown(blame, 7)).toBeNull();
      expect(hoverMarkdown(blame, 99)).toBeNull();
    });

    it("shows prompt, agent/model, badge, summary, context files, commit and the three links", () => {
      const md = hoverMarkdown(blame, 2) as string;
      expect(md).toContain("Add input validation to the refund endpoint");
      expect(md).toContain("IBM Bob");
      expect(md).toContain("granite\\-test");
      expect(md).toContain("Unreviewed");
      expect(md).toContain("Reject negative amounts");
      expect(md).toContain("`src/refund.ts`");
      expect(md).toContain("`bbbbbbb` · 2026-10-26");
      expect(md.trimEnd().split("\n").pop()).toBe(
        [
          commandLink("Approve", COMMANDS.approve, "B"),
          commandLink("Reject", COMMANDS.reject, "B"),
          commandLink("Show full session", COMMANDS.show, "B"),
        ].join(" | "),
      );
    });

    it("shows approved reviewer and rejected comment", () => {
      expect(hoverMarkdown(blame, 4)).toMatch(/Approved\*\* by dana/);
      const rejected = hoverMarkdown(blame, 5) as string;
      expect(rejected).toContain("Rejected");
      expect(rejected).toContain("PII");
    });

    it("limits the prompt to 300 characters", () => {
      const long = "word ".repeat(200);
      const b: BlameJson = { ...blame, sessions: { ...blame.sessions, B: session("B", "unreviewed", { prompt: long }) } };
      const md = hoverMarkdown(b, 2) as string;
      const quote = md.split("\n").find((l) => l.startsWith("> ")) as string;
      expect(quote.replace(/\\/g, "").length).toBeLessThanOrEqual(2 + PROMPT_LIMIT + 1);
      expect(quote.endsWith("…")).toBe(true);
    });

    it("cannot be hijacked by markdown in the prompt", () => {
      const evil = "[click](command:workbench.action.terminal.sendSequence) <img src=x> `rm`";
      const b: BlameJson = { ...blame, sessions: { ...blame.sessions, B: session("B", "unreviewed", { prompt: evil, summary: evil, model: evil }) } };
      const md = hoverMarkdown(b, 2) as string;
      const links = md.match(/\]\(command:[^)]*\)/g) ?? [];
      expect(links).toHaveLength(3); // only our own three links
      expect(md).not.toMatch(/(?<!\\)</); // every "<" from untrusted text is backslash-escaped
    });

    it("explains a missing session file instead of showing nothing", () => {
      const md = hoverMarkdown(blame, 6) as string;
      expect(md).toContain("not available");
      expect(md).toContain("Show full session");
      expect(md).not.toContain("Approve");
    });
  });
});
