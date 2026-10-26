import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const HOOK_BEGIN = "# >>> provenance";

let tmp: string;
let shimDir: string;
let repo: string;
let env: NodeJS.ProcessEnv;

function prov(args: string[], cwd = repo): { code: number; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd, env, encoding: "utf8" });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}
const provJson = <T = any>(args: string[], cwd = repo): T => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const r = prov([...args, "--json"], cwd);
  expect(r.code, r.stderr).toBe(0);
  return JSON.parse(r.stdout) as T;
};
const git = (...args: string[]): string => execFileSync("git", args, { cwd: repo, env, encoding: "utf8" });
const write = (file: string, content: string): void => {
  const abs = path.join(repo, file);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, content);
};
const lines = (n: number): string => Array.from({ length: n }, (_, i) => `L${i + 1}`).join("\n") + "\n";

beforeAll(() => {
  expect(existsSync(BIN), "run `pnpm build` before `pnpm test`").toBe(true);
  tmp = realpathSync(mkdtempSync(path.join(tmpdir(), "prov-e2e-")));
  // The git hook runs `prov ...`, so put a `prov` shim on PATH.
  shimDir = path.join(tmp, "bin");
  mkdirSync(shimDir);
  const shim = path.join(shimDir, "prov");
  writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${BIN}" "$@"\n`);
  chmodSync(shim, 0o755);
  env = {
    ...process.env,
    PATH: `${shimDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
    GIT_AUTHOR_NAME: "Dev",
    GIT_AUTHOR_EMAIL: "dev@example.com",
    GIT_COMMITTER_NAME: "Dev",
    GIT_COMMITTER_EMAIL: "dev@example.com",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
  };
  repo = path.join(tmp, "repo");
  mkdirSync(repo);
  git("init", "-q", "-b", "main");
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("prov end-to-end", () => {
  it("exits 2 outside a git repo and 1 on bad input", () => {
    const outside = path.join(tmp, "not-a-repo");
    mkdirSync(outside);
    expect(prov(["status"], outside).code).toBe(2);
    expect(prov(["status", "--repo", outside, "--json"]).stderr).toContain('"error"');
    expect(prov(["explain", "nonsense"]).code).toBe(1);
    expect(prov(["record", "--prompt", "x"]).code).toBe(1); // missing --model
    expect(prov(["bogus-command"]).code).toBe(1);
  });

  it("init preserves an existing hook and is idempotent", () => {
    mkdirSync(path.join(repo, ".git", "hooks"), { recursive: true });
    const hook = path.join(repo, ".git", "hooks", "post-commit");
    writeFileSync(hook, "#!/bin/sh\necho existing-hook-ran >> .git/hook.log\n");
    chmodSync(hook, 0o755);

    const first = provJson<{ hook: string; gitignore: string }>(["init"]);
    expect(first.hook).toBe("appended");
    expect(first.gitignore).toBe("created");
    const body = readFileSync(hook, "utf8");
    expect(body).toContain("echo existing-hook-ran");
    expect(body).toContain(HOOK_BEGIN);
    expect(body).toContain("prov hook post-commit || true");
    expect(body).toContain("# <<< provenance");

    const second = provJson<{ hook: string; gitignore: string }>(["init"]);
    expect(second.hook).toBe("unchanged");
    expect(second.gitignore).toBe("unchanged");
    expect(readFileSync(hook, "utf8").split(HOOK_BEGIN).length).toBe(2); // block present once

    expect(readFileSync(path.join(repo, ".gitignore"), "utf8")).toContain(".provenance/pending.json");
    expect(existsSync(path.join(repo, ".provenance", "sessions"))).toBe(true);
    expect(git("config", "notes.rewriteRef").trim()).toBe("refs/notes/provenance");
    expect(git("config", "notes.rewrite.amend").trim()).toBe("true");
    expect(git("config", "notes.rewrite.rebase").trim()).toBe("true");
  });

  it("record -> commit -> explain -> review --approve", () => {
    write("src/pay ment.ts", lines(5));
    git("add", "-A");
    git("commit", "-q", "-m", "human base");

    const rec = provJson<{ sessionId: string; trailer: string }>([
      "record",
      "--prompt", "Add retry with exponential backoff to the payment client.",
      "--model", "granite-test",
      "--agent", "IBM Bob",
      "--context", "src/pay ment.ts",
      "--files", "src/pay ment.ts",
      "--summary", "Wrapped charge() in backoff",
    ]);
    expect(rec.trailer).toBe(`Provenance-Session: ${rec.sessionId}`);
    expect(provJson<{ pending: string[] }>(["status"]).pending).toEqual([rec.sessionId]);

    write("src/pay ment.ts", lines(5).replace("L2\n", "L2\nR1\nR2\n"));
    git("add", "-A");
    git("commit", "-q", "-m", "ai: retry"); // post-commit hook links automatically

    expect(provJson<{ pending: string[] }>(["status"]).pending).toEqual([]);
    expect(readFileSync(path.join(repo, ".git", "hook.log"), "utf8")).toContain("existing-hook-ran");

    const ai = provJson<{ kind: string; sessionId: string; session: { prompt: string; review: { status: string } } }>(
      ["explain", "src/pay ment.ts:3"],
    );
    expect(ai.kind).toBe("ai");
    expect(ai.sessionId).toBe(rec.sessionId);
    expect(ai.session.prompt).toContain("exponential backoff");
    expect(ai.session.review.status).toBe("unreviewed");
    expect(provJson<{ kind: string }>(["explain", "src/pay ment.ts:1"]).kind).toBe("human");
    expect(prov(["explain", "src/pay ment.ts:3"]).stdout).toContain("prompt: Add retry");

    const bad = prov(["review", rec.sessionId, "--approve", "--reject", "--reviewer", "dana"]);
    expect(bad.code).toBe(1);
    expect(prov(["review", rec.sessionId, "--approve"]).code).toBe(1); // reviewer required

    const reviewed = provJson<{ review: { status: string; reviewer: string; comment: string } }>(
      ["review", rec.sessionId, "--approve", "--reviewer", "dana", "--comment", "looks fine"],
    );
    expect(reviewed.review).toMatchObject({ status: "approved", reviewer: "dana", comment: "looks fine" });
    expect(provJson<{ review: { status: string } }>(["show", rec.sessionId]).review.status).toBe("approved");
    const status = provJson<{ sessions: number; approved: number; unreviewed: number }>(["status"]);
    expect(status).toMatchObject({ sessions: 1, approved: 1, unreviewed: 0 });
  });

  it("blame returns every line plus the sessions map, keyed on HEAD", () => {
    const b = provJson<{
      file: string;
      head: string;
      lines: { line: number; kind: string; sessionId?: string }[];
      sessions: Record<string, { review: { status: string } }>;
    }>(["blame", "src/pay ment.ts"]);
    expect(b.head).toBe(git("rev-parse", "HEAD").trim());
    expect(b.lines.map((l) => l.kind)).toEqual(["human", "human", "ai", "ai", "human", "human", "human"]);
    const id = b.lines[2]?.sessionId as string;
    expect(b.sessions[id]?.review.status).toBe("approved");
  });

  it("trailer-only commits link, and prov link attaches a session manually", () => {
    // Record without going through pending (--from-json is also covered), then reference by trailer.
    const rec = provJson<{ sessionId: string }>(["record", "--prompt", "second", "--model", "m", "--agent", "Bob"]);
    // Drop it from the pending list by linking it manually to HEAD, which must also clear pending.
    write("notes.md", "a\nb\n");
    git("add", "-A");
    git("commit", "-q", "-m", `docs\n\nProvenance-Session: ${rec.sessionId}`);
    expect(provJson<{ kind: string }>(["explain", "notes.md:1"]).kind).toBe("ai");

    write("other.md", "x\n");
    git("add", "-A");
    git("commit", "-q", "-m", "human only");
    expect(provJson<{ kind: string }>(["explain", "other.md:1"]).kind).toBe("human");
    const linked = provJson<{ sessionIds: string[] }>(["link", rec.sessionId, "HEAD"]);
    expect(linked.sessionIds).toEqual([rec.sessionId]);
    expect(provJson<{ kind: string }>(["explain", "other.md:1"]).kind).toBe("ai");
    expect(prov(["link", rec.sessionId, "no-such-commit"]).code).toBe(1);
  });

  it("record --from-json imports a full session object", () => {
    const file = path.join(tmp, "session.json");
    writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        id: "01JB8Z6Q4X2M7K9N3P5R8T0V1W",
        createdAt: "2026-10-26T17:02:11Z",
        agent: { name: "IBM Bob" },
        model: "m",
        prompt: "imported prompt",
      }),
    );
    const r = provJson<{ sessionId: string }>(["record", "--from-json", file]);
    expect(r.sessionId).toBe("01JB8Z6Q4X2M7K9N3P5R8T0V1W");
    expect(provJson<{ prompt: string }>(["show", r.sessionId]).prompt).toBe("imported prompt");
    expect(prov(["record", "--from-json", path.join(tmp, "missing.json")]).code).toBe(1);
  });

  it("rejects paths outside the repo", () => {
    expect(prov(["explain", "../../etc/passwd:1"]).code).toBe(1);
    expect(prov(["record", "--prompt", "p", "--model", "m", "--files", "../../etc/passwd"]).code).toBe(1);
  });

  it("works from a subdirectory and with --repo", () => {
    const sub = path.join(repo, "src");
    expect(provJson<{ kind: string }>(["explain", "pay ment.ts:3"], sub).kind).toBe("ai");
    const elsewhere = provJson<{ kind: string }>(["explain", "src/pay ment.ts:3", "--repo", repo], tmp);
    expect(elsewhere.kind).toBe("ai");
  });

  it("report writes md and html, and rejects bad flags", () => {
    const html = path.join(tmp, "report.html");
    const r = prov(["report", "--format", "html", "--out", html]);
    expect(r.code, r.stderr).toBe(0);
    const body = readFileSync(html, "utf8");
    expect(body).toContain("Provenance compliance report");
    expect(body).not.toMatch(/https?:\/\//);
    const md = prov(["report"]);
    expect(md.code).toBe(0);
    expect(md.stdout).toContain("## Unreviewed AI code");
    const j = provJson<{ report: { summary: { aiLines: number } } }>(["report"]);
    expect(j.report.summary.aiLines).toBeGreaterThan(0);
    expect(prov(["report", "--format", "pdf"]).code).toBe(1);
    expect(prov(["report", "--since", "not-a-date"]).code).toBe(1);
  });

  it("sync pushes and fetches notes against origin", () => {
    expect(prov(["sync"]).code).toBe(1); // no remote yet
    const remote = path.join(tmp, "remote.git");
    execFileSync("git", ["init", "-q", "--bare", remote], { env });
    git("remote", "add", "origin", remote);
    git("push", "-q", "origin", "main");
    const r = provJson<{ pushed: boolean }>(["sync"]);
    expect(r.pushed).toBe(true);
    const refs = execFileSync("git", ["--git-dir", remote, "for-each-ref", "refs/notes/provenance"], { encoding: "utf8" });
    expect(refs).toContain("refs/notes/provenance");
    // second sync (now with a remote ref to fetch and merge) is also fine
    expect(provJson<{ fetched: boolean; merged: boolean }>(["sync"])).toMatchObject({ fetched: true, merged: true });
  });
});
