import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  InputError,
  NotAGitRepoError,
  TRAILER_KEY,
  addPending,
  attributeLine,
  createSession,
  requireSession,
  resolveInsideRepo,
  sessionsTouching,
  setReview,
} from "@provenance/core";

export const SERVER_NAME = "prov-mcp";
export const SERVER_VERSION = "0.1.0";

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const ok = (data: unknown): ToolResult => ({ content: [{ type: "text", text: JSON.stringify(data, null, 2) }] });

/** Expected failures go back to the agent as readable errors; anything else is logged and kept generic. */
function fail(e: unknown): ToolResult {
  const known = e instanceof InputError || e instanceof NotAGitRepoError;
  if (!known) console.error("prov-mcp: unexpected error", e); // stderr only; stdout is the protocol channel
  const text = known ? e.message : "Unexpected error while handling the request";
  return { content: [{ type: "text", text }], isError: true };
}

async function guarded(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return fail(e);
  }
}

/** Create the MCP server for a repository root. Tools only parse input, call core, and format output. */
export function createServer(root: string): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    "record_session",
    {
      title: "Record AI session",
      description:
        "Call this once when you finish a coding task and before you commit. Record the user's request as `prompt`, " +
        "the files you read as `contextFiles`, and the files you edited as `filesChanged`. " +
        `Returns a sessionId and a \`${TRAILER_KEY}:\` trailer line: add that trailer to your commit message so the commit is linked to this session.`,
      inputSchema: {
        agent: z.string().min(1).describe("Your agent name, for example 'IBM Bob'"),
        model: z.string().min(1).describe("The model name as you report it"),
        prompt: z.string().min(1).describe("The user's request that started this task"),
        summary: z.string().describe("One or two sentences on what you changed and why"),
        contextFiles: z.array(z.string()).optional().describe("Repo-relative files you read for context"),
        filesChanged: z.array(z.string()).optional().describe("Repo-relative files you edited or created"),
        toolCalls: z
          .array(z.object({ name: z.string(), summary: z.string().optional() }))
          .optional()
          .describe("Notable tool calls you made"),
      },
    },
    (a) =>
      guarded(async () => {
        const s = await createSession(root, {
          agent: { name: a.agent },
          model: a.model,
          prompt: a.prompt,
          summary: a.summary,
          contextFiles: a.contextFiles,
          filesChanged: a.filesChanged,
          toolCalls: a.toolCalls,
        });
        await addPending(root, s.id);
        return { sessionId: s.id, trailer: `${TRAILER_KEY}: ${s.id}` };
      }),
  );

  server.registerTool(
    "explain_line",
    {
      title: "Explain a line",
      description:
        "Call this when the user asks why a line of code exists, who or what wrote it, or what it was meant to do. " +
        "Returns whether the line is AI-written (with the session's prompt, summary and review status), human-written, or uncommitted.",
      inputSchema: {
        file: z.string().min(1).describe("Repo-relative path of the file"),
        line: z.number().int().min(1).describe("1-based line number"),
      },
    },
    ({ file, line }) =>
      guarded(async () => {
        const rel = resolveInsideRepo(root, file);
        return { file: rel, ...(await attributeLine(root, rel, line)) };
      }),
  );

  server.registerTool(
    "find_sessions_touching",
    {
      title: "Find sessions touching a file or range",
      description:
        "Call this before editing existing code to see which AI sessions wrote lines in a file or line range, " +
        "so you can respect their intent. Returns each distinct session with how many lines it wrote.",
      inputSchema: {
        file: z.string().min(1).describe("Repo-relative path of the file"),
        startLine: z.number().int().min(1).optional().describe("First line of the range (default: 1)"),
        endLine: z.number().int().min(1).optional().describe("Last line of the range (default: end of file)"),
      },
    },
    ({ file, startLine, endLine }) =>
      guarded(async () => {
        const rel = resolveInsideRepo(root, file);
        const found = await sessionsTouching(root, rel, startLine, endLine);
        return { file: rel, sessions: found.map((f) => ({ sessionId: f.sessionId, lines: f.lines, session: f.session })) };
      }),
  );

  server.registerTool(
    "get_session",
    {
      title: "Get a session",
      description: "Call this to read the full record of a session by id: prompt, context files, tool calls, summary and review status.",
      inputSchema: { sessionId: z.string().min(1).describe("Session id (ULID)") },
    },
    ({ sessionId }) => guarded(() => requireSession(root, sessionId)),
  );

  server.registerTool(
    "set_review_status",
    {
      title: "Set review status",
      description:
        "Call this only when a human reviewer has told you to approve or reject a session. " +
        "Do not approve your own sessions. Returns the updated session.",
      inputSchema: {
        sessionId: z.string().min(1).describe("Session id (ULID)"),
        status: z.enum(["unreviewed", "approved", "rejected"]).describe("New review status"),
        reviewer: z.string().min(1).describe("Name of the human reviewer"),
        comment: z.string().optional().describe("Optional reviewer comment"),
      },
    },
    ({ sessionId, status, reviewer, comment }) =>
      guarded(() => setReview(root, sessionId, { status, reviewer, comment })),
  );

  return server;
}
