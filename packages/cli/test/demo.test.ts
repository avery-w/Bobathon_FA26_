import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const SCRIPT = path.join(ROOT, "examples", "demo-repo.sh");
const BIN = path.join(ROOT, "packages", "cli", "dist", "bin.js");

let tmp: string;
let demo: string;
const env = (): NodeJS.ProcessEnv => ({
  ...process.env,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
});
const prov = (...args: string[]): string => execFileSync(process.execPath, [BIN, ...args], { cwd: demo, env: env(), encoding: "utf8" });

beforeAll(() => {
  expect(existsSync(BIN), "run `pnpm build` before `pnpm test`").toBe(true);
  tmp = realpathSync(mkdtempSync(path.join(tmpdir(), "prov-demo-")));
  // Run with a PATH that has no `prov`, so the script's own fallback to the built CLI is exercised.
  execFileSync("bash", [SCRIPT, "demo-repo"], { cwd: tmp, env: env(), stdio: "pipe" });
  demo = path.join(tmp, "demo-repo");
});
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

interface Blame {
  lines: { line: number; kind: string; sessionId?: string }[];
  sessions: Record<string, { prompt: string; review: { status: string; reviewer: string | null; comment: string | null } }>;
}
const blame = (file: string): Blame => JSON.parse(prov("blame", file, "--json")) as Blame;
const statusOfLine = (b: Blame, n: number): string | undefined => {
  const id = b.lines[n - 1]?.sessionId;
  return id ? b.sessions[id]?.review.status : undefined;
};

describe("examples/demo-repo.sh", () => {
  it("builds the five-step history (plus the review commit)", () => {
    const log = execFileSync("git", ["log", "--format=%s", "--reverse"], { cwd: demo, env: env(), encoding: "utf8" }).trim().split("\n");
    expect(log).toEqual([
      "feat: payments service skeleton",
      "feat: retry charges with exponential backoff",
      "feat: validate refunds and add tests",
      "fix: clearer refundable balance check",
      "chore: debug logging for charges",
      "chore: record review decisions",
    ]);
    const sources = execFileSync("git", ["ls-files", "src"], { cwd: demo, env: env(), encoding: "utf8" }).trim().split("\n");
    expect(sources).toHaveLength(5);
  });

  it("session A is approved by dana; B and C are unreviewed; D is rejected with the PII comment", () => {
    const sessions = Object.values(blame("src/paymentClient.ts").sessions).concat(Object.values(blame("src/refund.ts").sessions), Object.values(blame("test/refund.test.ts").sessions));
    const by = (re: RegExp) => sessions.find((s) => re.test(s.prompt));
    expect(by(/retry with exponential backoff/)?.review).toMatchObject({ status: "approved", reviewer: "dana" });
    expect(by(/input validation to the refund endpoint/)?.review.status).toBe("unreviewed");
    expect(by(/unit tests for refunds/)?.review.status).toBe("unreviewed");
    expect(by(/Log card numbers/)?.review).toMatchObject({ status: "rejected", reviewer: "dana", comment: "PII — must not log card data." });
  });

  it("splits sessions B and C by filesChanged, and the human rewrite makes three lines human", () => {
    const refund = blame("src/refund.ts");
    const lineText = readFileSync(path.join(demo, "src", "refund.ts"), "utf8").split("\n");
    const at = (needle: string): number => lineText.findIndex((l) => l.includes(needle)) + 1;
    expect(refund.lines[at("amount <= 0") - 1]?.kind).toBe("ai"); // session B's check survives
    for (const needle of ["// reviewed by a human", "const remaining", "if (req.amount > remaining)"]) {
      expect(refund.lines[at(needle) - 1]?.kind, needle).toBe("human");
    }
    expect(statusOfLine(refund, at("amount <= 0"))).toBe("unreviewed");
    const tests = blame("test/refund.test.ts");
    expect(tests.lines.every((l) => l.kind === "ai")).toBe(true);
    const bId = refund.lines[at("amount <= 0") - 1]?.sessionId;
    const cId = tests.lines[0]?.sessionId;
    expect(bId).toBeDefined();
    expect(cId).toBeDefined();
    expect(bId).not.toBe(cId);
  });

  it("the HTML report flags the rejected PII session and lists unreviewed ranges", () => {
    const out = path.join(tmp, "report.html");
    prov("report", "--format", "html", "--out", out);
    const html = readFileSync(out, "utf8");
    expect(html).toContain("rejected sessions still present");
    expect(html).toContain("Log card numbers for debugging.");
    expect(html).toContain("src/refund.ts:5-11");
    expect(html).toContain("PII — must not log card data.");
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("refuses to overwrite an existing folder", () => {
    const r = spawnSync("bash", [SCRIPT, "demo-repo"], { cwd: tmp, env: env(), encoding: "utf8" });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("already exists");
  });
});
