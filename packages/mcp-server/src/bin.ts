#!/usr/bin/env node
import path from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { NotAGitRepoError, findRepoRoot } from "@provenance/core";
import { createServer } from "./server.js";

/** `--repo <path>` or `--repo=<path>`; defaults to the working directory. */
function repoArg(argv: readonly string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === "--repo") {
      const v = argv[i + 1];
      if (!v) throw new Error("--repo needs a path");
      return v;
    }
    if (a.startsWith("--repo=")) return a.slice("--repo=".length);
  }
  return ".";
}

async function main(): Promise<void> {
  const root = await findRepoRoot(path.resolve(process.cwd(), repoArg(process.argv.slice(2))));
  await createServer(root).connect(new StdioServerTransport());
  console.error(`prov-mcp running on stdio for ${root}`); // stderr: stdout is the protocol channel
}

main().catch((e: unknown) => {
  console.error(e instanceof NotAGitRepoError || e instanceof Error ? `prov-mcp: ${e.message}` : "prov-mcp: failed to start");
  process.exit(e instanceof NotAGitRepoError ? 2 : 1);
});
