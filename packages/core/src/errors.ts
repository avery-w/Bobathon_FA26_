/** Bad user input (CLI exit code 1). */
export class InputError extends Error {
  override readonly name = "InputError";
}

/** The given directory is not inside a git work tree (CLI exit code 2). */
export class NotAGitRepoError extends Error {
  override readonly name = "NotAGitRepoError";
  constructor(dir: string) {
    super(`Not inside a git repository: ${dir}`);
  }
}

/** A git invocation failed. Details stay server-side; `message` is generic. */
export class GitError extends Error {
  override readonly name = "GitError";
  constructor(
    message: string,
    readonly args: readonly string[],
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
  }
}
