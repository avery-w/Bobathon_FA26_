import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { Command, CommanderError } from "commander";
import {
  InputError,
  NotAGitRepoError,
  TRAILER_KEY,
  addPending,
  attributeFile,
  attributeLine,
  createSession,
  findRepoRoot,
  generateReport,
  getStatus,
  headSha,
  importSession,
  initRepo,
  linkCommit,
  linkSession,
  renderHtml,
  renderMarkdown,
  requireSession,
  resolveInsideRepo,
  setReview,
  syncNotes,
  type LineAttribution,
  type Session,
} from "@provenance/core";

export interface Io {
  out(text: string): void;
  err(text: string): void;
  cwd: string;
}

interface CommonOpts {
  json?: boolean;
  repo?: string;
}

const csv = (v: string): string[] => v.split(",").map((s) => s.trim()).filter(Boolean);

function parseFileLine(spec: string): { file: string; line: number } {
  const idx = spec.lastIndexOf(":");
  const file = idx > 0 ? spec.slice(0, idx) : "";
  const line = Number(spec.slice(idx + 1));
  if (!file || !Number.isInteger(line) || line < 1) {
    throw new InputError("Expected <file>:<line>, for example src/app.ts:42");
  }
  return { file, line };
}

/** One-line session label used in text output. */
function sessionLabel(s: Session | null, id: string): string {
  return s ? `${id} (${s.review.status}) ${s.agent.name}/${s.model}` : `${id} (session file missing)`;
}

function describe(a: LineAttribution): string {
  if (a.kind === "uncommitted") return `${a.line}: uncommitted`;
  const sha = a.commit.sha.slice(0, 7);
  if (a.kind === "human") return `${a.line}: human  ${sha}`;
  return `${a.line}: ai  ${sessionLabel(a.session, a.sessionId)}  ${sha}`;
}

/** Build the program. Exported so tests can drive it without spawning a process. */
export function buildProgram(io: Io): Command {
  const program = new Command("prov")
    .description("Provenance: git blame for AI-written code")
    .exitOverride()
    .configureOutput({ writeOut: (s) => io.out(s), writeErr: (s) => io.err(s) });

  const cmd = (name: string): Command =>
    program
      .command(name)
      .option("--json", "print machine-readable JSON")
      .option("--repo <path>", "repository path (default: current directory)")
      .exitOverride()
      .configureOutput({ writeOut: (s) => io.out(s), writeErr: (s) => io.err(s) });

  const base = (o: CommonOpts): string => path.resolve(io.cwd, o.repo ?? ".");
  const repoRoot = (o: CommonOpts): Promise<string> => findRepoRoot(base(o));
  const emit = (o: CommonOpts, data: unknown, text: string): void => {
    io.out((o.json ? JSON.stringify(data, null, 2) : text) + "\n");
  };

  cmd("init")
    .description("Create .provenance/, install the post-commit hook, configure git notes")
    .action(async (o: CommonOpts) => {
      const r = await initRepo(await repoRoot(o));
      emit(o, r, `Initialised Provenance in ${r.root}\n  hook: ${r.hook} (${r.hookPath})\n  .gitignore: ${r.gitignore}`);
    });

  cmd("record")
    .description("Record an AI session and add it to the pending list")
    .option("--prompt <text>", "the user's request")
    .option("--model <name>", "model name as reported by the agent")
    .option("--agent <name>", "agent name", "unknown")
    .option("--context <files>", "comma-separated files the agent read", csv)
    .option("--files <files>", "comma-separated files the agent changed", csv)
    .option("--summary <text>", "what the agent did")
    .option("--from-json <file>", "read a full session object from a JSON file")
    .action(
      async (
        o: CommonOpts & {
          prompt?: string;
          model?: string;
          agent: string;
          context?: string[];
          files?: string[];
          summary?: string;
          fromJson?: string;
        },
      ) => {
        const root = await repoRoot(o);
        let session: Session;
        if (o.fromJson) {
          let raw: unknown;
          try {
            raw = JSON.parse(await readFile(path.resolve(base(o), o.fromJson), "utf8"));
          } catch {
            throw new InputError(`Cannot read session JSON from ${o.fromJson}`);
          }
          session = await importSession(root, raw);
        } else {
          if (!o.prompt || !o.model) throw new InputError("--prompt and --model are required (or use --from-json)");
          const rel = (files: string[] | undefined): string[] | undefined =>
            files?.map((f) => resolveInsideRepo(root, f, base(o)));
          session = await createSession(root, {
            agent: { name: o.agent },
            model: o.model,
            prompt: o.prompt,
            summary: o.summary,
            contextFiles: rel(o.context),
            filesChanged: rel(o.files),
          });
        }
        await addPending(root, session.id);
        const trailer = `${TRAILER_KEY}: ${session.id}`;
        emit(o, { sessionId: session.id, trailer, session }, `${session.id}\n${trailer}`);
      },
    );

  program
    .command("hook")
    .description("Internal: run by git hooks")
    .argument("<name>", "hook name (post-commit)")
    .option("--json", "print machine-readable JSON")
    .option("--repo <path>", "repository path (default: current directory)")
    .exitOverride()
    .action(async (name: string, o: CommonOpts) => {
      if (name !== "post-commit") throw new InputError(`Unknown hook: ${name}`);
      const r = await linkCommit(await repoRoot(o), "HEAD");
      if (o.json) emit(o, r, "");
    });

  cmd("link")
    .description("Link a session to an existing commit")
    .argument("<sessionId>")
    .argument("<commit>")
    .action(async (sessionId: string, commit: string, o: CommonOpts) => {
      const r = await linkSession(await repoRoot(o), sessionId, commit);
      emit(o, r, `Linked ${r.sessionIds.join(", ")} to ${r.commit.slice(0, 7)}`);
    });

  cmd("explain")
    .description("Show which session wrote one line")
    .argument("<file:line>")
    .action(async (spec: string, o: CommonOpts) => {
      const root = await repoRoot(o);
      const { file, line } = parseFileLine(spec);
      const rel = resolveInsideRepo(root, file, base(o));
      const a = await attributeLine(root, rel, line);
      const data = { file: rel, ...a };
      let text = `${rel}:${describe(a)}`;
      if (a.kind === "ai" && a.session) text += `\n  prompt: ${a.session.prompt}\n  summary: ${a.session.summary}`;
      emit(o, data, text);
    });

  cmd("blame")
    .description("Attribution for every line of a file")
    .argument("<file>")
    .action(async (file: string, o: CommonOpts) => {
      const root = await repoRoot(o);
      const rel = resolveInsideRepo(root, file, base(o));
      const attributions = await attributeFile(root, rel);
      const sessions: Record<string, Session> = {};
      const lines = attributions.map((a) => {
        if (a.kind === "uncommitted") return { line: a.line, kind: a.kind };
        if (a.kind === "human") return { line: a.line, kind: a.kind, commit: a.commit };
        if (a.session) sessions[a.sessionId] = a.session;
        return { line: a.line, kind: a.kind, sessionId: a.sessionId, commit: a.commit };
      });
      emit(
        o,
        { file: rel, head: await headSha(root), lines, sessions },
        attributions.map(describe).join("\n"),
      );
    });

  cmd("show")
    .description("Show a full session record")
    .argument("<sessionId>")
    .action(async (id: string, o: CommonOpts) => {
      const s = await requireSession(await repoRoot(o), id);
      emit(o, s, JSON.stringify(s, null, 2));
    });

  cmd("review")
    .description("Approve or reject a session")
    .argument("<sessionId>")
    .option("--approve", "mark the session approved")
    .option("--reject", "mark the session rejected")
    .option("--reviewer <name>", "who is reviewing")
    .option("--comment <text>", "optional comment")
    .action(
      async (
        id: string,
        o: CommonOpts & { approve?: boolean; reject?: boolean; reviewer?: string; comment?: string },
      ) => {
        if (Boolean(o.approve) === Boolean(o.reject)) throw new InputError("Pass exactly one of --approve or --reject");
        if (!o.reviewer) throw new InputError("--reviewer is required");
        const s = await setReview(await repoRoot(o), id, {
          status: o.approve ? "approved" : "rejected",
          reviewer: o.reviewer,
          comment: o.comment,
        });
        emit(o, s, `${s.id} ${s.review.status} by ${s.review.reviewer}`);
      },
    );

  cmd("status")
    .description("Pending sessions, session count, unreviewed count")
    .action(async (o: CommonOpts) => {
      const s = await getStatus(await repoRoot(o));
      emit(
        o,
        s,
        `pending: ${s.pending.length}${s.pending.length ? ` (${s.pending.join(", ")})` : ""}\nsessions: ${s.sessions}\nunreviewed: ${s.unreviewed}\napproved: ${s.approved}\nrejected: ${s.rejected}`,
      );
    });

  cmd("report")
    .description("Compliance report of AI-written code at HEAD")
    .option("--since <date>", "only sessions created on or after this date")
    .option("--format <fmt>", "md or html", "md")
    .option("--out <path>", "write the report to a file instead of stdout")
    .action(async (o: CommonOpts & { since?: string; format: string; out?: string }) => {
      if (o.format !== "md" && o.format !== "html") throw new InputError("--format must be md or html");
      if (o.since && Number.isNaN(new Date(o.since).getTime())) throw new InputError("--since must be a date such as 2026-01-31");
      const root = await repoRoot(o);
      const data = await generateReport(root, { since: o.since });
      const body = o.format === "html" ? renderHtml(data) : renderMarkdown(data);
      let outPath: string | null = null;
      if (o.out) {
        outPath = path.resolve(io.cwd, o.out);
        await writeFile(outPath, body, "utf8");
      }
      if (o.json) emit(o, { format: o.format, out: outPath, report: data }, "");
      else if (outPath) io.out(`Wrote ${o.format} report to ${outPath}\n`);
      else io.out(body);
    });

  cmd("sync")
    .description("Fetch, merge and push refs/notes/provenance against origin")
    .action(async (o: CommonOpts) => {
      const r = await syncNotes(await repoRoot(o), "origin");
      emit(o, r, `synced with ${r.remote}: fetched=${r.fetched} pushed=${r.pushed}`);
    });

  return program;
}

/** Run the CLI and return the process exit code (0 ok, 1 bad input, 2 not a git repo). */
export async function run(argv: readonly string[], io: Io): Promise<number> {
  const program = buildProgram(io);
  const json = argv.includes("--json");
  try {
    await program.parseAsync([...argv], { from: "user" });
    return 0;
  } catch (e) {
    if (e instanceof CommanderError) {
      return e.exitCode === 0 ? 0 : 1; // --help / --version exit 0; usage errors are bad input
    }
    const code = e instanceof NotAGitRepoError ? 2 : 1;
    const message =
      e instanceof InputError || e instanceof NotAGitRepoError ? e.message : "Unexpected error (see git output or re-run with a valid repository)";
    io.err((json ? JSON.stringify({ error: message }) : `error: ${message}`) + "\n");
    return code;
  }
}
