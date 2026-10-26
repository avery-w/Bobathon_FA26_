import { runTests } from "@vscode/test-electron";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Builds the demo repo in a temp dir, then launches VS Code with the extension and runs suite/index.
 * Needs network on first run (downloads a VS Code build into .vscode-test/).
 */
async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const cliBin = path.join(repoRoot, "packages", "cli", "dist", "bin.js");
  const work = mkdtempSync(path.join(tmpdir(), "prov-vscode-"));

  // A `prov` shim on PATH so the demo script, git hooks and the extension all find the CLI.
  const shimDir = path.join(work, "bin");
  mkdirSync(shimDir);
  const shim = path.join(shimDir, "prov");
  writeFileSync(shim, `#!/bin/sh\nexec "${process.execPath}" "${cliBin}" "$@"\n`, { mode: 0o755 });
  const env = { ...process.env, PATH: `${shimDir}${path.delimiter}${process.env["PATH"] ?? ""}` };

  execFileSync("bash", [path.join(repoRoot, "examples", "demo-repo.sh"), path.join(work, "demo-repo")], { env, stdio: "inherit" });

  // When this runs inside an Electron-based editor, ELECTRON_RUN_AS_NODE is inherited and makes the
  // downloaded VS Code start as plain Node (it would treat the demo-repo path as a script).
  delete process.env["ELECTRON_RUN_AS_NODE"];

  await runTests({
    extensionDevelopmentPath: path.resolve(__dirname, ".."),
    extensionTestsPath: path.resolve(__dirname, "suite", "index"),
    launchArgs: [path.join(work, "demo-repo"), "--disable-extensions", "--disable-workspace-trust"],
    extensionTestsEnv: { PATH: env.PATH ?? "", PROV_DEMO_REPO: path.join(work, "demo-repo") },
  });
}

main().catch((e: unknown) => {
  console.error("VS Code extension tests failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
