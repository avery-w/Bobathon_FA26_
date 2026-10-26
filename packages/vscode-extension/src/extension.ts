import * as vscode from "vscode";
import { execFile } from "node:child_process";
import path from "node:path";
import {
  COMMANDS,
  gutterBuckets,
  hoverMarkdown,
  statusBarText,
  toRanges,
  type BlameJson,
  type ReviewStatus,
} from "./model.js";
import { ProvError, runProv, runProvJson } from "./prov.js";

const COLORS: Record<ReviewStatus, string> = { approved: "#2da44e", unreviewed: "#d4a72c", rejected: "#cf222e" };

interface CacheEntry {
  head: string | null;
  data: BlameJson;
}

const cliPath = (): string => vscode.workspace.getConfiguration("provenance").get<string>("cliPath") || "prov";

function folderOf(uri: vscode.Uri): vscode.WorkspaceFolder | undefined {
  return vscode.workspace.getWorkspaceFolder(uri);
}

/** Current HEAD sha, used as the cache key. Null for repos without commits. */
function headOf(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", ["rev-parse", "--verify", "--quiet", "HEAD"], { cwd, encoding: "utf8" }, (err, stdout) =>
      resolve(err ? null : stdout.trim() || null),
    );
  });
}

function gitUserName(cwd: string): Promise<string> {
  return new Promise((resolve) => {
    execFile("git", ["config", "user.name"], { cwd, encoding: "utf8" }, (err, stdout) => resolve(err ? "" : stdout.trim()));
  });
}

export interface ProvenanceApi {
  /** Hover provider, exposed so the test harness can call it directly. */
  hoverProvider: vscode.HoverProvider;
  blameFor(doc: vscode.TextDocument): Promise<BlameJson | null>;
}

export async function activate(context: vscode.ExtensionContext): Promise<ProvenanceApi> {
  const cache = new Map<string, CacheEntry>();
  const inflight = new Map<string, Promise<BlameJson | null>>();
  const output = vscode.window.createOutputChannel("Provenance");

  const decorations: Record<ReviewStatus, vscode.TextEditorDecorationType> = {
    approved: vscode.window.createTextEditorDecorationType({ isWholeLine: true, borderWidth: "0 0 0 3px", borderStyle: "solid", borderColor: COLORS.approved }),
    unreviewed: vscode.window.createTextEditorDecorationType({ isWholeLine: true, borderWidth: "0 0 0 3px", borderStyle: "solid", borderColor: COLORS.unreviewed }),
    rejected: vscode.window.createTextEditorDecorationType({ isWholeLine: true, borderWidth: "0 0 0 3px", borderStyle: "solid", borderColor: COLORS.rejected }),
  };
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
  status.command = COMMANDS.report;
  status.tooltip = "Provenance: open the compliance report";

  async function blameFor(doc: vscode.TextDocument, force = false): Promise<BlameJson | null> {
    if (doc.uri.scheme !== "file") return null;
    const folder = folderOf(doc.uri);
    if (!folder) return null;
    const cwd = folder.uri.fsPath;
    const key = doc.uri.fsPath;
    const head = await headOf(cwd);
    const hit = cache.get(key);
    // Cached per file and HEAD; refreshed on save (force) and when HEAD moves.
    if (!force && hit && hit.head === head) return hit.data;
    const pending = inflight.get(key);
    if (pending) return pending;
    const p = runProvJson<BlameJson>(cliPath(), ["blame", path.relative(cwd, key)], cwd)
      .then((data) => {
        cache.set(key, { head, data });
        return data;
      })
      .catch((e: unknown) => {
        output.appendLine(`blame failed for ${key}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      })
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
    return p;
  }

  async function refresh(editor: vscode.TextEditor | undefined, force = false): Promise<void> {
    if (!editor) {
      status.hide();
      return;
    }
    const data = await blameFor(editor.document, force);
    for (const st of Object.keys(decorations) as ReviewStatus[]) {
      const ranges = data
        ? toRanges(gutterBuckets(data)[st]).map(([a, b]) => new vscode.Range(a - 1, 0, b - 1, 0))
        : [];
      editor.setDecorations(decorations[st], ranges);
    }
    if (data) {
      status.text = `$(shield) ${statusBarText(data)}`;
      status.show();
    } else status.hide();
  }

  const hoverProvider: vscode.HoverProvider = {
    async provideHover(doc, position) {
      const data = await blameFor(doc);
      if (!data) return null;
      const md = hoverMarkdown(data, position.line + 1);
      if (!md) return null;
      const content = new vscode.MarkdownString(md, true);
      content.isTrusted = { enabledCommands: [COMMANDS.show, COMMANDS.approve, COMMANDS.reject] };
      return new vscode.Hover(content, doc.lineAt(position.line).range);
    },
  };

  /** Resolve a session id from a command argument, or from the line under the cursor. */
  async function sessionIdFromArgs(arg: unknown): Promise<string | null> {
    if (typeof arg === "string") return arg;
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    const data = await blameFor(editor.document);
    const l = data?.lines.find((x) => x.line === editor.selection.active.line + 1);
    return l?.sessionId ?? null;
  }

  function cwdForActive(): string | null {
    const f = vscode.window.activeTextEditor ? folderOf(vscode.window.activeTextEditor.document.uri) : vscode.workspace.workspaceFolders?.[0];
    return f?.uri.fsPath ?? null;
  }

  async function review(arg: unknown, verdict: "approve" | "reject"): Promise<void> {
    const cwd = cwdForActive();
    const id = await sessionIdFromArgs(arg);
    if (!cwd || !id) {
      void vscode.window.showWarningMessage("Provenance: put the cursor on an AI-written line first.");
      return;
    }
    const reviewer = (await gitUserName(cwd)) || (await vscode.window.showInputBox({ prompt: "Reviewer name" })) || "";
    if (!reviewer) return;
    const comment = verdict === "reject" ? await vscode.window.showInputBox({ prompt: "Why is this session rejected? (optional)" }) : undefined;
    try {
      await runProv(cliPath(), ["review", id, `--${verdict}`, "--reviewer", reviewer, ...(comment ? ["--comment", comment] : [])], cwd);
      await refresh(vscode.window.activeTextEditor, true);
    } catch (e) {
      void vscode.window.showErrorMessage(`Provenance: ${e instanceof ProvError ? e.message : "review failed"}`);
    }
  }

  context.subscriptions.push(
    output,
    status,
    ...Object.values(decorations),
    vscode.languages.registerHoverProvider({ scheme: "file" }, hoverProvider),
    vscode.window.onDidChangeActiveTextEditor((e) => void refresh(e)),
    vscode.workspace.onDidSaveTextDocument((d) => {
      cache.delete(d.uri.fsPath);
      if (vscode.window.activeTextEditor?.document === d) void refresh(vscode.window.activeTextEditor, true);
    }),
    vscode.commands.registerCommand(COMMANDS.show, async (arg?: unknown) => {
      const cwd = cwdForActive();
      const id = await sessionIdFromArgs(arg);
      if (!cwd || !id) return void vscode.window.showWarningMessage("Provenance: put the cursor on an AI-written line first.");
      try {
        const { stdout } = await runProv(cliPath(), ["show", id], cwd);
        const doc = await vscode.workspace.openTextDocument({ content: stdout, language: "json" });
        await vscode.window.showTextDocument(doc, { preview: true });
      } catch (e) {
        void vscode.window.showErrorMessage(`Provenance: ${e instanceof ProvError ? e.message : "could not show session"}`);
      }
    }),
    vscode.commands.registerCommand(COMMANDS.approve, (arg?: unknown) => review(arg, "approve")),
    vscode.commands.registerCommand(COMMANDS.reject, (arg?: unknown) => review(arg, "reject")),
    vscode.commands.registerCommand(COMMANDS.report, async () => {
      const cwd = cwdForActive();
      if (!cwd) return void vscode.window.showWarningMessage("Provenance: open a folder first.");
      try {
        const out = path.join(context.globalStorageUri.fsPath, "provenance-report.html");
        await vscode.workspace.fs.createDirectory(context.globalStorageUri);
        await runProv(cliPath(), ["report", "--format", "html", "--out", out], cwd);
        await vscode.env.openExternal(vscode.Uri.file(out));
      } catch (e) {
        void vscode.window.showErrorMessage(`Provenance: ${e instanceof ProvError ? e.message : "report failed"}`);
      }
    }),
  );

  // HEAD changes (commit, checkout, pull): watch .git/HEAD and refs, then refresh the visible editor.
  const watcher = vscode.workspace.createFileSystemWatcher("**/.git/{HEAD,refs/heads/**,refs/notes/**}");
  const onGitChange = (): void => {
    cache.clear();
    void refresh(vscode.window.activeTextEditor, true);
  };
  watcher.onDidChange(onGitChange);
  watcher.onDidCreate(onGitChange);
  context.subscriptions.push(watcher);

  await refresh(vscode.window.activeTextEditor);
  return { hoverProvider, blameFor };
}

export function deactivate(): void {}
