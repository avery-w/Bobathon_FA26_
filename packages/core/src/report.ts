import { blame, headSha, lineCountsAt, listNotedCommits, readNote, renameMap } from "./git.js";
import { findLinkedSession } from "./attribute.js";
import { isProvenancePath } from "./link.js";
import { listSessions } from "./store.js";
import type { CommitNote, ReviewStatus, Session } from "./schema.js";

const EXCERPT_LEN = 140;

export interface LineRange {
  file: string;
  start: number;
  end: number;
}

export interface ReportSummary {
  totalLines: number;
  aiLines: number;
  aiPercent: number;
  unreviewedAiLines: number;
  unreviewedAiPercent: number;
  sessionsByStatus: Record<ReviewStatus, number>;
  sessionCount: number;
}

export interface UnreviewedRange extends LineRange {
  sessionId: string;
  promptExcerpt: string;
  /** Present when the session is rejected, so auditors can see the worst items first. */
  status: ReviewStatus;
}

export interface FileRow {
  file: string;
  lines: number;
  aiLines: number;
  unreviewedAiLines: number;
}

export interface SessionRow {
  id: string;
  createdAt: string;
  agent: string;
  model: string;
  promptExcerpt: string;
  status: ReviewStatus;
  reviewer: string | null;
  comment: string | null;
  /** Lines written by this session that still exist at HEAD. */
  survivingLines: number;
}

export interface ReportData {
  generatedAt: string;
  head: string | null;
  since: string | null;
  summary: ReportSummary;
  unreviewed: UnreviewedRange[];
  rejected: UnreviewedRange[];
  files: FileRow[];
  sessions: SessionRow[];
}

export interface ReportInput {
  /** Tracked, non-bookkeeping files with their line counts at HEAD. */
  files: { file: string; lines: number }[];
  /** For every file that appears in a note: its per-line attribution (session id or null for human). */
  aiLinesByFile: Map<string, { line: number; sessionId: string }[]>;
  sessions: Session[];
  generatedAt: string;
  head: string | null;
  since: string | null;
}

export function excerpt(text: string, max = EXCERPT_LEN): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
}

const pct = (part: number, whole: number): number => (whole === 0 ? 0 : Math.round((part / whole) * 1000) / 10);

/** Collapse sorted line numbers into contiguous ranges. */
export function toRanges(file: string, lines: readonly number[]): LineRange[] {
  const sorted = [...new Set(lines)].sort((a, b) => a - b);
  const out: LineRange[] = [];
  for (const n of sorted) {
    const last = out[out.length - 1];
    if (last && n === last.end + 1) last.end = n;
    else out.push({ file, start: n, end: n });
  }
  return out;
}

/** Pure: turn gathered facts into the report model. */
export function buildReportData(input: ReportInput): ReportData {
  const byId = new Map(input.sessions.map((s) => [s.id, s]));
  const status = (id: string): ReviewStatus => byId.get(id)?.review.status ?? "unreviewed";
  const prompt = (id: string): string => excerpt(byId.get(id)?.prompt ?? "(session file not available)");

  const surviving = new Map<string, number>();
  const unreviewed: UnreviewedRange[] = [];
  const rejected: UnreviewedRange[] = [];
  const files: FileRow[] = [];
  let totalLines = 0;
  let aiLines = 0;
  let unreviewedAiLines = 0;

  for (const f of input.files) {
    const ai = input.aiLinesByFile.get(f.file) ?? [];
    let unrev = 0;
    const open = new Map<string, number[]>();
    const bad = new Map<string, number[]>();
    for (const { line, sessionId } of ai) {
      surviving.set(sessionId, (surviving.get(sessionId) ?? 0) + 1);
      const st = status(sessionId);
      if (st === "approved") continue;
      unrev++;
      const bucket = st === "rejected" ? bad : open;
      const arr = bucket.get(sessionId) ?? [];
      arr.push(line);
      bucket.set(sessionId, arr);
    }
    for (const [bucket, target] of [[open, unreviewed], [bad, rejected]] as const) {
      for (const [sessionId, lines] of bucket) {
        for (const r of toRanges(f.file, lines)) {
          target.push({ ...r, sessionId, promptExcerpt: prompt(sessionId), status: status(sessionId) });
        }
      }
    }
    totalLines += f.lines;
    aiLines += ai.length;
    unreviewedAiLines += unrev;
    files.push({ file: f.file, lines: f.lines, aiLines: ai.length, unreviewedAiLines: unrev });
  }

  const sortRanges = (a: LineRange, b: LineRange): number => a.file.localeCompare(b.file) || a.start - b.start;
  unreviewed.sort(sortRanges);
  rejected.sort(sortRanges);
  files.sort((a, b) => b.unreviewedAiLines - a.unreviewedAiLines || b.aiLines - a.aiLines || a.file.localeCompare(b.file));

  const sessionsByStatus: Record<ReviewStatus, number> = { unreviewed: 0, approved: 0, rejected: 0 };
  for (const s of input.sessions) sessionsByStatus[s.review.status]++;

  return {
    generatedAt: input.generatedAt,
    head: input.head,
    since: input.since,
    summary: {
      totalLines,
      aiLines,
      aiPercent: pct(aiLines, totalLines),
      unreviewedAiLines,
      unreviewedAiPercent: pct(unreviewedAiLines, totalLines),
      sessionsByStatus,
      sessionCount: input.sessions.length,
    },
    unreviewed,
    rejected,
    files,
    sessions: input.sessions.map((s) => ({
      id: s.id,
      createdAt: s.createdAt,
      agent: s.agent.name,
      model: s.model,
      promptExcerpt: excerpt(s.prompt),
      status: s.review.status,
      reviewer: s.review.reviewer,
      comment: s.review.comment,
      survivingLines: surviving.get(s.id) ?? 0,
    })),
  };
}

export interface ReportOptions {
  /** Date (ISO or anything `Date` parses); only sessions created at or after it are reported. */
  since?: string | undefined;
  now?: Date | undefined;
}

/**
 * Gather facts from git and build the report for the lines at HEAD.
 * Performance: only files that appear in at least one note (followed through renames) are blamed;
 * every other tracked text file counts as fully human-written, with its size taken from one `git grep -c`.
 */
export async function generateReport(root: string, opts: ReportOptions = {}): Promise<ReportData> {
  const head = await headSha(root);
  const sinceIso = opts.since ? new Date(opts.since).toISOString() : null;
  const sessions = (await listSessions(root)).filter((s) => !sinceIso || s.createdAt >= sinceIso);
  const included = new Set(sessions.map((s) => s.id));
  const generatedAt = (opts.now ?? new Date()).toISOString();
  if (!head) return buildReportData({ files: [], aiLinesByFile: new Map(), sessions, generatedAt, head, since: sinceIso });

  const counts = await lineCountsAt(root, "HEAD");
  for (const f of [...counts.keys()]) if (isProvenancePath(f)) counts.delete(f);

  const notes = new Map<string, CommitNote>();
  const renames = await renameMap(root);
  const toBlame = new Set<string>();
  for (const sha of await listNotedCommits(root)) {
    const note = await readNote(root, sha);
    if (!note) continue;
    notes.set(sha, note);
    for (const link of note.links) {
      for (const h of link.hunks) {
        const current = renames.get(h.file) ?? h.file;
        if (counts.has(current)) toBlame.add(current);
      }
    }
  }

  const aiLinesByFile = new Map<string, { line: number; sessionId: string }[]>();
  for (const file of toBlame) {
    const ai: { line: number; sessionId: string }[] = [];
    for (const b of await blame(root, file, undefined, "HEAD")) {
      const id = findLinkedSession(notes.get(b.sha) ?? null, b.origFile, b.origLine);
      if (id && included.has(id)) ai.push({ line: b.line, sessionId: id });
    }
    if (ai.length > 0) aiLinesByFile.set(file, ai);
  }

  return buildReportData({
    files: [...counts].map(([file, lines]) => ({ file, lines })),
    aiLinesByFile,
    sessions,
    generatedAt,
    head,
    since: sinceIso,
  });
}

// ---------------------------------------------------------------- rendering

const shortId = (id: string): string => id.slice(-8);
const day = (iso: string): string => iso.slice(0, 10);
const range = (r: LineRange): string => `${r.file}:${r.start}-${r.end}`;

/** Escape for HTML text and attribute contexts. All session-derived text goes through this. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Escape for a Markdown table cell. */
function mdCell(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ").replace(/</g, "&lt;");
}

export function renderMarkdown(d: ReportData): string {
  const s = d.summary;
  const out: string[] = [];
  out.push("# Provenance compliance report", "");
  out.push(`Generated ${d.generatedAt} · HEAD ${d.head ? d.head.slice(0, 7) : "(no commits)"}${d.since ? ` · sessions since ${day(d.since)}` : ""}`, "");

  out.push("## Summary", "");
  out.push("| Metric | Value |", "| --- | --- |");
  out.push(`| Total tracked lines | ${s.totalLines} |`);
  out.push(`| AI-written lines | ${s.aiLines} (${s.aiPercent}%) |`);
  out.push(`| Unreviewed AI lines | ${s.unreviewedAiLines} (${s.unreviewedAiPercent}%) |`);
  out.push(`| Sessions | ${s.sessionCount} |`);
  out.push(`| Sessions unreviewed | ${s.sessionsByStatus.unreviewed} |`);
  out.push(`| Sessions approved | ${s.sessionsByStatus.approved} |`);
  out.push(`| Sessions rejected | ${s.sessionsByStatus.rejected} |`, "");

  out.push("## Unreviewed AI code", "");
  if (d.unreviewed.length === 0 && d.rejected.length === 0) out.push("None. Every AI-written line at HEAD has been approved.", "");
  if (d.rejected.length > 0) {
    out.push("### Rejected sessions still present at HEAD", "");
    out.push("| Range | Session | Prompt |", "| --- | --- | --- |");
    for (const r of d.rejected) out.push(`| \`${range(r)}\` | ${shortId(r.sessionId)} | ${mdCell(r.promptExcerpt)} |`);
    out.push("");
  }
  if (d.unreviewed.length > 0) {
    out.push("### Awaiting review", "");
    out.push("| Range | Session | Prompt |", "| --- | --- | --- |");
    for (const r of d.unreviewed) out.push(`| \`${range(r)}\` | ${shortId(r.sessionId)} | ${mdCell(r.promptExcerpt)} |`);
    out.push("");
  }

  out.push("## By file", "");
  out.push("| File | Lines | AI lines | Unreviewed AI lines |", "| --- | ---: | ---: | ---: |");
  for (const f of d.files) out.push(`| ${mdCell(f.file)} | ${f.lines} | ${f.aiLines} | ${f.unreviewedAiLines} |`);
  out.push("");

  out.push("## Sessions", "");
  out.push("| ID | Date | Agent | Model | Prompt | Status | Reviewer | Lines at HEAD |", "| --- | --- | --- | --- | --- | --- | --- | ---: |");
  for (const x of d.sessions) {
    out.push(
      `| ${shortId(x.id)} | ${day(x.createdAt)} | ${mdCell(x.agent)} | ${mdCell(x.model)} | ${mdCell(x.promptExcerpt)} | ${x.status}${x.comment ? ` (${mdCell(x.comment)})` : ""} | ${mdCell(x.reviewer ?? "")} | ${x.survivingLines} |`,
    );
  }
  out.push("");
  return out.join("\n");
}

const CSS = `
body{font:14px/1.6 -apple-system,"Segoe UI",system-ui,sans-serif;color:#1f2328;background:#fff;margin:0}
main{max-width:980px;margin:0 auto;padding:32px 24px}
h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 8px;border-bottom:1px solid #e5e7eb;padding-bottom:4px}h3{font-size:14px;margin:16px 0 6px}
.muted{color:#57606a}.meta{color:#57606a;margin:0 0 16px}
table{border-collapse:collapse;width:100%;margin:8px 0}th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;vertical-align:top}
th{background:#f7f8fa;font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
code{font:12px ui-monospace,Menlo,Consolas,monospace;background:#f7f8fa;padding:1px 4px;border-radius:3px}
.cards{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.card{flex:1 1 150px;background:#f7f8fa;border:1px solid #e5e7eb;border-radius:4px;padding:8px 12px}
.card b{display:block;font-size:20px}
.badge{display:inline-block;padding:0 6px;border-radius:3px;font-size:12px;border:1px solid #e5e7eb}
.approved{background:#e6f4ea;color:#1a7f37;border-color:#b7dfc1}.unreviewed{background:#fff4d6;color:#8a5a00;border-color:#ecd48c}.rejected{background:#fde8e8;color:#b42318;border-color:#f3b7b2}
.alert{border:1px solid #f3b7b2;background:#fde8e8;border-radius:4px;padding:8px 12px;margin:8px 0}
footer{margin-top:40px;padding-top:12px;border-top:1px solid #e5e7eb;color:#57606a;font-size:12px;text-align:center}
`;

const badge = (st: ReviewStatus): string => `<span class="badge ${st}">${st}</span>`;

/** One self-contained HTML document: inline CSS, no scripts, no external requests. */
export function renderHtml(d: ReportData): string {
  const s = d.summary;
  const e = escapeHtml;
  const rangeRows = (rows: UnreviewedRange[]): string =>
    rows
      .map((r) => `<tr><td><code>${e(range(r))}</code></td><td><code>${e(shortId(r.sessionId))}</code></td><td>${badge(r.status)}</td><td>${e(r.promptExcerpt)}</td></tr>`)
      .join("");
  const head = `<tr><th>Range</th><th>Session</th><th>Status</th><th>Prompt</th></tr>`;

  const unreviewedSection =
    d.unreviewed.length === 0 && d.rejected.length === 0
      ? `<p>None. Every AI-written line at HEAD has been approved.</p>`
      : `${
          d.rejected.length > 0
            ? `<div class="alert"><b>${d.rejected.length} range${d.rejected.length === 1 ? "" : "s"} from rejected sessions still present at HEAD.</b></div><table>${head}${rangeRows(d.rejected)}</table>`
            : ""
        }${d.unreviewed.length > 0 ? `<h3>Awaiting review</h3><table>${head}${rangeRows(d.unreviewed)}</table>` : ""}`;

  const fileRows = d.files
    .map((f) => `<tr><td>${e(f.file)}</td><td class="n">${f.lines}</td><td class="n">${f.aiLines}</td><td class="n">${f.unreviewedAiLines}</td></tr>`)
    .join("");
  const sessionRows = d.sessions
    .map(
      (x) =>
        `<tr><td><code>${e(shortId(x.id))}</code></td><td>${e(day(x.createdAt))}</td><td>${e(x.agent)}</td><td>${e(x.model)}</td><td>${e(x.promptExcerpt)}</td><td>${badge(x.status)}${x.comment ? `<div class="muted">${e(x.comment)}</div>` : ""}</td><td>${e(x.reviewer ?? "")}</td><td class="n">${x.survivingLines}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Provenance compliance report</title><style>${CSS}</style></head>
<body><main>
<h1>Provenance compliance report</h1>
<p class="meta">Generated ${e(d.generatedAt)} · HEAD ${e(d.head ? d.head.slice(0, 7) : "(no commits)")}${d.since ? ` · sessions since ${e(day(d.since))}` : ""}</p>
<h2>Summary</h2>
<div class="cards">
<div class="card"><b>${s.totalLines}</b>tracked lines</div>
<div class="card"><b>${s.aiLines} (${s.aiPercent}%)</b>AI-written lines</div>
<div class="card"><b>${s.unreviewedAiLines} (${s.unreviewedAiPercent}%)</b>unreviewed AI lines</div>
<div class="card"><b>${s.sessionCount}</b>sessions: ${s.sessionsByStatus.approved} approved, ${s.sessionsByStatus.unreviewed} unreviewed, ${s.sessionsByStatus.rejected} rejected</div>
</div>
<h2>Unreviewed AI code</h2>
${unreviewedSection}
<h2>By file</h2>
<table><tr><th>File</th><th class="n">Lines</th><th class="n">AI lines</th><th class="n">Unreviewed AI lines</th></tr>${fileRows}</table>
<h2>Sessions</h2>
<table><tr><th>ID</th><th>Date</th><th>Agent</th><th>Model</th><th>Prompt</th><th>Status</th><th>Reviewer</th><th class="n">Lines at HEAD</th></tr>${sessionRows}</table>
<footer>Generated by Provenance</footer>
</main></body></html>
`;
}
