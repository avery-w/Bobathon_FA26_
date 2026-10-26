import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HOOK_BEGIN,
  HOOK_BLOCK,
  HOOK_END,
  InputError,
  addPending,
  configAddUnique,
  createSession,
  getStatus,
  git,
  hooksDir,
  initRepo,
  mergeGitignore,
  mergeHookContent,
  setReview,
  syncNotes,
} from "@provenance/core";
import { makeRepo, type TestRepo } from "./helpers.js";

describe("mergeHookContent", () => {
  it("creates a new script when no hook exists", () => {
    const r = mergeHookContent(null);
    expect(r.action).toBe("created");
    expect(r.content.startsWith("#!/bin/sh\n")).toBe(true);
    expect(r.content).toContain("prov hook post-commit || true");
    expect(mergeHookContent("  \n").action).toBe("created");
  });
  it("appends between markers and keeps the existing script intact", () => {
    const existing = "#!/bin/sh\necho hi\n";
    const r = mergeHookContent(existing);
    expect(r.action).toBe("appended");
    expect(r.content.startsWith(existing)).toBe(true);
    expect(r.content).toContain(`${HOOK_BEGIN}\nprov hook post-commit || true\n${HOOK_END}`);
  });
  it("appends safely when the file has no trailing newline", () => {
    expect(mergeHookContent("#!/bin/sh\necho hi").content).toContain("echo hi\n\n" + HOOK_BEGIN);
  });
  it("is idempotent, and refreshes a stale block in place", () => {
    const once = mergeHookContent("#!/bin/sh\necho a\n").content;
    expect(mergeHookContent(once)).toEqual({ content: once, action: "unchanged" });
    const stale = `#!/bin/sh\necho a\n${HOOK_BEGIN}\nold command\n${HOOK_END}\necho after\n`;
    const r = mergeHookContent(stale);
    expect(r.action).toBe("updated");
    expect(r.content).toBe(`#!/bin/sh\necho a\n${HOOK_BLOCK}echo after\n`);
  });
});

describe("mergeGitignore", () => {
  it("creates, appends and detects an existing entry", () => {
    expect(mergeGitignore(null)).toBe(".provenance/pending.json\n");
    expect(mergeGitignore("node_modules/")).toBe("node_modules/\n.provenance/pending.json\n");
    expect(mergeGitignore("a\n")).toBe("a\n.provenance/pending.json\n");
    expect(mergeGitignore("a\n.provenance/pending.json\n")).toBeNull();
    expect(mergeGitignore("/.provenance/pending.json")).toBeNull();
  });
});

describe("initRepo / status / config / sync", () => {
  let repo: TestRepo;
  beforeEach(() => {
    repo = makeRepo();
  });
  afterEach(() => repo.cleanup());

  it("initRepo sets up folders, gitignore, executable hook and notes config", async () => {
    const r = await initRepo(repo.root);
    expect(r).toMatchObject({ hook: "created", gitignore: "created" });
    expect(existsSync(path.join(repo.root, ".provenance", "sessions"))).toBe(true);
    expect(statSync(r.hookPath).mode & 0o111).not.toBe(0);
    expect(r.hookPath).toBe(path.join(await hooksDir(repo.root), "post-commit"));
    expect(repo.git("config", "notes.rewriteRef").trim()).toBe("refs/notes/provenance");
    expect(await initRepo(repo.root)).toMatchObject({ hook: "unchanged", gitignore: "unchanged" });
  });

  it("initRepo appends to an existing hook and keeps it executable", async () => {
    const hook = path.join(repo.root, ".git", "hooks", "post-commit");
    mkdirSync(path.dirname(hook), { recursive: true });
    writeFileSync(hook, "#!/bin/sh\necho mine\n");
    chmodSync(hook, 0o644);
    expect((await initRepo(repo.root)).hook).toBe("appended");
    expect(readFileSync(hook, "utf8")).toContain("echo mine");
    expect(statSync(hook).mode & 0o111).not.toBe(0);
  });

  it("the installed hook never fails a commit, even when prov is missing", async () => {
    await initRepo(repo.root);
    repo.write("a.txt", "x\n");
    repo.git("add", "-A");
    // PATH without a `prov` binary: the hook must still exit 0 so the commit succeeds.
    expect(() => repo.git("commit", "-q", "-m", "c")).not.toThrow();
  });

  it("getStatus counts sessions by review state and lists pending ids", async () => {
    await initRepo(repo.root);
    const agent = { name: "Bob" };
    const a = await createSession(repo.root, { agent, model: "m", prompt: "a" });
    const b = await createSession(repo.root, { agent, model: "m", prompt: "b" });
    await createSession(repo.root, { agent, model: "m", prompt: "c" });
    await setReview(repo.root, a.id, { status: "approved", reviewer: "dana" });
    await setReview(repo.root, b.id, { status: "rejected", reviewer: "dana" });
    await addPending(repo.root, a.id);
    expect(await getStatus(repo.root)).toEqual({ pending: [a.id], sessions: 3, unreviewed: 1, approved: 1, rejected: 1 });
  });

  it("configAddUnique adds a multi-value config entry once", async () => {
    await configAddUnique(repo.root, "notes.displayRef", "refs/notes/provenance");
    await configAddUnique(repo.root, "notes.displayRef", "refs/notes/provenance");
    const all = (await git(repo.root, ["config", "--local", "--get-all", "notes.displayRef"])).stdout.trim().split("\n");
    expect(all).toEqual(["refs/notes/provenance"]);
  });

  it("syncNotes errors on a missing remote", async () => {
    await expect(syncNotes(repo.root)).rejects.toThrow(InputError);
  });
});
