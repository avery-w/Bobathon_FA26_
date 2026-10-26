import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const BIN = fileURLToPath(new URL("../dist/bin.js", import.meta.url));
const NOTES_REF = "refs/notes/provenance";

let tmp: string;
let work: string;
let remote: string;
let env: NodeJS.ProcessEnv;

const git = (cwd: string, ...args: string[]): string => execFileSync("git", args, { cwd, env, encoding: "utf8" }).trim();
const prov = (...args: string[]): { code: number; stdout: string; stderr: string } => {
  const r = spawnSync(process.execPath, [BIN, ...args], { cwd: work, env, encoding: "utf8" });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
};
const remoteRefs = (): string => git(remote, "for-each-ref", "--format=%(refname)", "refs/");

beforeAll(() => {
  tmp = realpathSync(mkdtempSync(path.join(tmpdir(), "prov-sync-")));
  const shimDir = path.join(tmp, "bin");
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
  // A local bare repository stands in for GitHub. Nothing here touches a real remote.
  remote = path.join(tmp, "origin.git");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", remote], { env });
  work = path.join(tmp, "work");
  mkdirSync(work);
  git(work, "init", "-q", "-b", "main");
  git(work, "remote", "add", "origin", remote);
});

afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe("prov sync against a local bare origin", () => {
  it("a plain git push leaves the notes behind; prov sync delivers refs/notes/provenance", () => {
    expect(prov("init").code).toBe(0);
    writeFileSync(path.join(work, "a.ts"), "one\ntwo\nthree\n");
    git(work, "add", "-A");
    git(work, "commit", "-q", "-m", "human base");

    const rec = prov("record", "--prompt", "Add a line", "--model", "granite-test", "--files", "a.ts", "--json");
    expect(rec.code, rec.stderr).toBe(0);
    writeFileSync(path.join(work, "a.ts"), "one\ntwo\nthree\nfour\n");
    git(work, "add", "-A");
    git(work, "commit", "-q", "-m", "ai: add a line"); // the post-commit hook links the pending session

    // the note exists locally ...
    expect(git(work, "for-each-ref", "--format=%(refname)", NOTES_REF)).toBe(NOTES_REF);

    // ... but an ordinary push does not carry it
    git(work, "push", "-q", "origin", "main");
    expect(remoteRefs()).toContain("refs/heads/main");
    expect(remoteRefs()).not.toContain(NOTES_REF);

    const sync = prov("sync", "--json");
    expect(sync.code, sync.stderr).toBe(0);
    expect(JSON.parse(sync.stdout)).toMatchObject({ remote: "origin", pushed: true });

    expect(remoteRefs()).toContain(NOTES_REF);
    expect(git(remote, "rev-parse", NOTES_REF)).toBe(git(work, "rev-parse", NOTES_REF));
  });
});
