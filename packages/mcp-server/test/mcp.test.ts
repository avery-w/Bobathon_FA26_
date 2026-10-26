import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));

let tmp: string;
let repo: string;
let client: Client;
const gitEnv = {
  GIT_AUTHOR_NAME: "Dev",
  GIT_AUTHOR_EMAIL: "dev@example.com",
  GIT_COMMITTER_NAME: "Dev",
  GIT_COMMITTER_EMAIL: "dev@example.com",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
};
const git = (...args: string[]): string =>
  execFileSync("git", args, { cwd: repo, env: { ...process.env, ...gitEnv }, encoding: "utf8" });
const lines = (n: number): string => Array.from({ length: n }, (_, i) => `L${i + 1}`).join("\n") + "\n";

interface CallResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}
async function call<T = any>(name: string, args: Record<string, unknown>): Promise<{ isError: boolean; data: T; text: string }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = (await client.callTool({ name, arguments: args })) as CallResult;
  const text = r.content[0]?.text ?? "";
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* error text */
  }
  return { isError: r.isError === true, data: data as T, text };
}

beforeAll(async () => {
  expect(existsSync(BIN), "run `pnpm build` before `pnpm test`").toBe(true);
  tmp = realpathSync(mkdtempSync(path.join(tmpdir(), "prov-mcp-")));
  repo = path.join(tmp, "repo");
  mkdirSync(path.join(repo, "src"), { recursive: true });
  git("init", "-q", "-b", "main");
  writeFileSync(path.join(repo, "src", "refund.ts"), lines(5));
  git("add", "-A");
  git("commit", "-q", "-m", "human base");

  client = new Client({ name: "test-client", version: "0.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [BIN, "--repo", repo],
      env: { ...(process.env as Record<string, string>), ...gitEnv },
      stderr: "pipe",
    }),
  );
});

afterAll(async () => {
  await client?.close();
  rmSync(tmp, { recursive: true, force: true });
});

describe("prov-mcp over stdio", () => {
  let sessionId = "";

  it("lists exactly the five tools, each with guidance on when to call it", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["explain_line", "find_sessions_touching", "get_session", "record_session", "set_review_status"],
    );
    const rec = tools.find((t) => t.name === "record_session");
    expect(rec?.description).toContain("Call this once when you finish a coding task and before you commit");
    expect(rec?.description).toContain("`prompt`");
    expect(rec?.description).toContain("`contextFiles`");
    expect(rec?.description).toContain("`filesChanged`");
    for (const t of tools) expect(t.description).toMatch(/^Call this/);
  });

  it("record_session returns a session id and the trailer", async () => {
    const r = await call<{ sessionId: string; trailer: string }>("record_session", {
      agent: "IBM Bob",
      model: "granite-test",
      prompt: "Add input validation to the refund endpoint",
      summary: "Reject negative amounts",
      contextFiles: ["src/refund.ts"],
      filesChanged: ["src/refund.ts"],
      toolCalls: [{ name: "read_file", summary: "read refund.ts" }],
    });
    expect(r.isError).toBe(false);
    expect(r.data.sessionId).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(r.data.trailer).toBe(`Provenance-Session: ${r.data.sessionId}`);
    sessionId = r.data.sessionId;

    // Agent flow: edit, commit with the trailer. No hook is installed, so link by trailer via the CLI core.
    writeFileSync(path.join(repo, "src", "refund.ts"), lines(5).replace("L2\n", "L2\nV1\nV2\n"));
    git("add", "-A");
    git("commit", "-q", "-m", `ai: validation\n\n${r.data.trailer}`);
    const cli = fileURLToPath(new URL("../../cli/dist/bin.js", import.meta.url));
    execFileSync(process.execPath, [cli, "hook", "post-commit", "--repo", repo], { env: { ...process.env, ...gitEnv } });
  });

  it("explain_line returns ai with the session, human, and errors for bad input", async () => {
    const ai = await call<{ kind: string; sessionId: string; session: { prompt: string; summary: string } }>("explain_line", {
      file: "src/refund.ts",
      line: 3,
    });
    expect(ai.isError).toBe(false);
    expect(ai.data).toMatchObject({ kind: "ai", sessionId, file: "src/refund.ts" });
    expect(ai.data.session.prompt).toBe("Add input validation to the refund endpoint");
    expect(ai.data.session.summary).toBe("Reject negative amounts");

    expect((await call<{ kind: string }>("explain_line", { file: "src/refund.ts", line: 1 })).data.kind).toBe("human");

    writeFileSync(path.join(repo, "src", "refund.ts"), lines(5).replace("L2\n", "L2\nV1\nV2\nUNSAVED\n"));
    expect((await call<{ kind: string }>("explain_line", { file: "src/refund.ts", line: 5 })).data.kind).toBe("uncommitted");
    git("checkout", "--", "src/refund.ts");

    const missingLine = await call("explain_line", { file: "src/refund.ts", line: 999 });
    expect(missingLine.isError).toBe(true);
  });

  it("rejects paths that resolve outside the repo", async () => {
    for (const tool of ["explain_line", "find_sessions_touching"]) {
      const r = await call(tool, { file: "../../etc/passwd", line: 1 });
      expect(r.isError, tool).toBe(true);
      expect(r.text).toMatch(/outside the repository/);
      expect(r.text).not.toContain("root:"); // never leaks file content
    }
    expect((await call("explain_line", { file: "/etc/passwd", line: 1 })).isError).toBe(true);
    const rec = await call("record_session", {
      agent: "a", model: "m", prompt: "p", summary: "s", filesChanged: ["../../etc/passwd"],
    });
    expect(rec.isError).toBe(true);
    expect(rec.text).toMatch(/outside the repository/);
  });

  it("find_sessions_touching returns distinct sessions with line counts", async () => {
    const whole = await call<{ sessions: { sessionId: string; lines: number }[] }>("find_sessions_touching", { file: "src/refund.ts" });
    expect(whole.data.sessions.map((s) => [s.sessionId, s.lines])).toEqual([[sessionId, 2]]);
    const inRange = await call<{ sessions: { lines: number }[] }>("find_sessions_touching", { file: "src/refund.ts", startLine: 3, endLine: 3 });
    expect(inRange.data.sessions.map((s) => s.lines)).toEqual([1]);
    const none = await call<{ sessions: unknown[] }>("find_sessions_touching", { file: "src/refund.ts", startLine: 1, endLine: 2 });
    expect(none.data.sessions).toEqual([]);
  });

  it("get_session returns the full record; unknown ids are errors", async () => {
    const r = await call<{ id: string; contextFiles: string[]; toolCalls: { name: string }[]; review: { status: string } }>("get_session", { sessionId });
    expect(r.data).toMatchObject({ id: sessionId, contextFiles: ["src/refund.ts"], review: { status: "unreviewed" } });
    expect(r.data.toolCalls[0]?.name).toBe("read_file");
    expect((await call("get_session", { sessionId: "01JB8Z6Q4X2M7K9N3P5R8T0V1W" })).isError).toBe(true);
    expect((await call("get_session", { sessionId: "../../etc/passwd" })).isError).toBe(true);
  });

  it("set_review_status updates the session", async () => {
    const r = await call<{ review: { status: string; reviewer: string; comment: string } }>("set_review_status", {
      sessionId, status: "approved", reviewer: "dana", comment: "ok",
    });
    expect(r.isError).toBe(false);
    expect(r.data.review).toMatchObject({ status: "approved", reviewer: "dana", comment: "ok" });
    const again = await call<{ review: { status: string } }>("get_session", { sessionId });
    expect(again.data.review.status).toBe("approved");
    expect((await call("set_review_status", { sessionId, status: "maybe", reviewer: "dana" })).isError).toBe(true);
  });
});

describe("prov-mcp startup", () => {
  it("exits non-zero when --repo is not a git repository", () => {
    const notRepo = mkdtempSync(path.join(tmpdir(), "prov-mcp-norepo-"));
    try {
      expect(() => execFileSync(process.execPath, [BIN, "--repo", notRepo], { stdio: "pipe" })).toThrow();
    } finally {
      rmSync(notRepo, { recursive: true, force: true });
    }
  });
});
