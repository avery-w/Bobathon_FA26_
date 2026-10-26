#!/usr/bin/env node
import { run } from "./cli.js";

const code = await run(process.argv.slice(2), {
  out: (t) => void process.stdout.write(t),
  err: (t) => void process.stderr.write(t),
  cwd: process.cwd(),
});
process.exitCode = code;
