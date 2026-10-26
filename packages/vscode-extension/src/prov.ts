import { execFile } from "node:child_process";

export class ProvError extends Error {
  override readonly name = "ProvError";
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

/** Run `prov <args>` in `cwd` with an argument array (never a shell). */
export function runProv(cliPath: string, args: readonly string[], cwd: string, timeoutMs = 60_000): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(cliPath, [...args], { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (!err) return resolve({ stdout, stderr });
      let message = "prov failed";
      try {
        const parsed = JSON.parse(stderr) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        const line = stderr.split("\n").find((l) => l.startsWith("error:"));
        if (line) message = line.slice("error:".length).trim();
        else if ((err as NodeJS.ErrnoException).code === "ENOENT") message = `Cannot run '${cliPath}'. Set provenance.cliPath.`;
      }
      reject(new ProvError(message));
    });
  });
}

/** Run `prov <args> --json` and parse the result. */
export async function runProvJson<T>(cliPath: string, args: readonly string[], cwd: string): Promise<T> {
  const { stdout } = await runProv(cliPath, [...args, "--json"], cwd);
  return JSON.parse(stdout) as T;
}
