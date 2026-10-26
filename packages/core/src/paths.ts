import { realpathSync } from "node:fs";
import path from "node:path";
import { InputError } from "./errors.js";

/**
 * Resolve `p` (relative to `base`, default the repo root) and return it as a
 * repo-relative POSIX path. Throws InputError if it resolves outside `root`,
 * including via `..` segments or symlinks.
 */
export function resolveInsideRepo(root: string, p: string, base: string = root): string {
  if (typeof p !== "string" || p.length === 0 || p.includes("\0")) {
    throw new InputError("Invalid file path");
  }
  const realRoot = realpathSync(root);
  const abs = path.resolve(base, p);
  const real = realpathDeepest(abs);
  const rel = path.relative(realRoot, real);
  if (rel === "" || rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new InputError(`Path is outside the repository: ${p}`);
  }
  return rel.split(path.sep).join("/");
}

/** realpath of the deepest existing ancestor, with the non-existent remainder appended. */
function realpathDeepest(abs: string): string {
  let current = abs;
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(realpathSync(current), ...rest.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return abs;
      rest.push(path.basename(current));
      current = parent;
    }
  }
}
