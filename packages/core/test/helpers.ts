import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TestRepo {
  root: string;
  git(...args: string[]): string;
  write(file: string, content: string): void;
  /** Stage everything and commit; returns the new HEAD sha. */
  commit(message: string): string;
  cleanup(): void;
}

/** Create a throwaway git repo in a temp directory with a fixed identity. */
export function makeRepo(prefix = "prov-test-"): TestRepo {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), prefix)));
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: "Test Human",
    GIT_AUTHOR_EMAIL: "human@example.com",
    GIT_COMMITTER_NAME: "Test Human",
    GIT_COMMITTER_EMAIL: "human@example.com",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
  };
  const run = (...args: string[]): string =>
    execFileSync("git", args, { cwd: root, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

  run("init", "-q", "-b", "main");
  run("config", "commit.gpgsign", "false");
  run("config", "core.hooksPath", ".git/hooks");

  return {
    root,
    git: run,
    write(file, content) {
      const abs = path.join(root, file);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content, "utf8");
    },
    commit(message) {
      run("add", "-A");
      run("commit", "-q", "-m", message);
      return run("rev-parse", "HEAD").trim();
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

/** Numbered lines "L1\nL2\n..." for readable diffs. */
export const lines = (n: number, prefix = "L"): string =>
  Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`).join("\n") + "\n";
