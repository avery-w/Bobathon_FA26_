/**
 * Pure logic for the extension: no `vscode` import, so it is unit-tested with vitest.
 * Input is the JSON printed by `prov blame <file> --json`.
 */

export type ReviewStatus = "unreviewed" | "approved" | "rejected";

export interface SessionJson {
  id: string;
  createdAt: string;
  agent: { name: string; version?: string };
  model: string;
  prompt: string;
  contextFiles: string[];
  summary: string;
  review: { status: ReviewStatus; reviewer: string | null; at: string | null; comment: string | null };
}

export interface BlameLineJson {
  line: number;
  kind: "ai" | "human" | "uncommitted";
  sessionId?: string;
  commit?: { sha: string; date: string | null };
}

export interface BlameJson {
  file: string;
  head: string | null;
  lines: BlameLineJson[];
  sessions: Record<string, SessionJson>;
}

export const PROMPT_LIMIT = 300;

export const COMMANDS = {
  show: "provenance.showSession",
  approve: "provenance.approveSession",
  reject: "provenance.rejectSession",
  report: "provenance.generateReport",
} as const;

/** Review status of an AI line's session. A session whose file is missing counts as unreviewed. */
export function statusOf(b: BlameJson, l: BlameLineJson): ReviewStatus {
  return (l.sessionId && b.sessions[l.sessionId]?.review.status) || "unreviewed";
}

/** Backslash-escape Markdown so untrusted prompt text cannot create links, commands or formatting. */
export function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~&:@$]/g, "\\$&");
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max).trimEnd()}…`;
}

/** 1-based line numbers of AI-written lines, grouped by review status (for the gutter colours). */
export function gutterBuckets(b: BlameJson): Record<ReviewStatus, number[]> {
  const out: Record<ReviewStatus, number[]> = { approved: [], unreviewed: [], rejected: [] };
  for (const l of b.lines) if (l.kind === "ai") out[statusOf(b, l)].push(l.line);
  return out;
}

export interface FileStats {
  totalLines: number;
  aiLines: number;
  aiPercent: number;
  unreviewedLines: number;
}

export function fileStats(b: BlameJson): FileStats {
  const total = b.lines.length;
  const ai = b.lines.filter((l) => l.kind === "ai");
  const unreviewed = ai.filter((l) => statusOf(b, l) !== "approved").length;
  return { totalLines: total, aiLines: ai.length, aiPercent: total === 0 ? 0 : Math.round((ai.length / total) * 100), unreviewedLines: unreviewed };
}

/** "AI: 42% of this file · 12 lines unreviewed" */
export function statusBarText(b: BlameJson | null): string {
  if (!b) return "AI: n/a";
  const s = fileStats(b);
  return `AI: ${s.aiPercent}% of this file · ${s.unreviewedLines} ${s.unreviewedLines === 1 ? "line" : "lines"} unreviewed`;
}

const BADGE: Record<ReviewStatus, string> = {
  approved: "$(check) Approved",
  unreviewed: "$(question) Unreviewed",
  rejected: "$(error) Rejected",
};

export function commandLink(label: string, command: string, ...args: unknown[]): string {
  return `[${label}](command:${command}?${encodeURIComponent(JSON.stringify(args))})`;
}

/**
 * Markdown for the hover card on an AI-written line, or null for human / uncommitted / unknown lines.
 * Must be rendered with `isTrusted: { enabledCommands: [approve, reject, show] }` and theme icons enabled.
 */
export function hoverMarkdown(b: BlameJson, line: number): string | null {
  const l = b.lines.find((x) => x.line === line);
  if (!l || l.kind !== "ai" || !l.sessionId) return null;
  const s = b.sessions[l.sessionId];
  const id = l.sessionId;
  const parts: string[] = [];

  if (!s) {
    parts.push(`**AI-written** · session \`${id}\``, "", "The session file is not available in this checkout (pull it, or run `prov sync`).");
    parts.push("", commandLink("Show full session", COMMANDS.show, id));
    return parts.join("\n");
  }

  const status = s.review.status;
  const who = s.review.reviewer ? ` by ${escapeMarkdown(s.review.reviewer)}` : "";
  parts.push(`**AI-written** · ${escapeMarkdown(s.agent.name)} · ${escapeMarkdown(s.model)}  `);
  parts.push(`**${BADGE[status]}**${status === "unreviewed" ? "" : who}${s.review.comment ? ` — ${escapeMarkdown(clip(s.review.comment, 200))}` : ""}`);
  parts.push("", `> ${escapeMarkdown(clip(s.prompt, PROMPT_LIMIT))}`);
  if (s.summary) parts.push("", `**Summary:** ${escapeMarkdown(clip(s.summary, 400))}`);
  if (s.contextFiles.length > 0) {
    parts.push("", "**Context files:** " + s.contextFiles.slice(0, 8).map((f) => `\`${f.replace(/`/g, "")}\``).join(", ") + (s.contextFiles.length > 8 ? ", …" : ""));
  }
  if (l.commit) {
    const date = l.commit.date ? ` · ${l.commit.date.slice(0, 10)}` : "";
    parts.push("", `Commit \`${l.commit.sha.slice(0, 7)}\`${date}`);
  }
  parts.push(
    "",
    [commandLink("Approve", COMMANDS.approve, id), commandLink("Reject", COMMANDS.reject, id), commandLink("Show full session", COMMANDS.show, id)].join(" | "),
  );
  return parts.join("\n");
}

/** Collapse sorted 1-based line numbers into inclusive [start, end] ranges. */
export function toRanges(lines: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const n of [...lines].sort((a, b) => a - b)) {
    const last = out[out.length - 1];
    if (last && n === last[1] + 1) last[1] = n;
    else if (!last || n > last[1]) out.push([n, n]);
  }
  return out;
}
