import * as vscode from "vscode";
import path from "node:path";
import assert from "node:assert/strict";

/** The part of the extension's exported API that these tests use. */
interface ProvenanceApi {
  hoverProvider: vscode.HoverProvider;
}

type TestFn = () => Promise<void>;
const tests: [string, TestFn][] = [];
const test = (name: string, fn: TestFn): void => void tests.push([name, fn]);

async function activate(): Promise<ProvenanceApi> {
  const ext = vscode.extensions.all.find((e) => e.packageJSON?.name === "provenance-vscode");
  assert.ok(ext, "extension is loaded");
  return (await ext.activate()) as ProvenanceApi;
}

async function open(rel: string): Promise<vscode.TextDocument> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  assert.ok(root, "demo repo is the open workspace");
  const doc = await vscode.workspace.openTextDocument(path.join(root, rel));
  await vscode.window.showTextDocument(doc);
  return doc;
}

const textOf = (h: vscode.Hover): string =>
  h.contents.map((c) => (typeof c === "string" ? c : "value" in c ? c.value : "")).join("\n");

/** Find the first 1-based line whose text contains `needle`. */
const lineOf = (doc: vscode.TextDocument, needle: string): number => {
  for (let i = 0; i < doc.lineCount; i++) if (doc.lineAt(i).text.includes(needle)) return i;
  throw new Error(`line containing '${needle}' not found`);
};

test("hover on an AI line returns the session prompt, unreviewed badge and review links", async () => {
  const api = await activate();
  const doc = await open("src/refund.ts");
  const line = lineOf(doc, "amount <= 0"); // written by session B (input validation)
  const hover = await api.hoverProvider.provideHover(doc, new vscode.Position(line, 0), new vscode.CancellationTokenSource().token);
  assert.ok(hover, "hover is returned for an AI-written line");
  const text = textOf(hover as vscode.Hover);
  assert.match(text, /Add input validation to the refund endpoint/);
  assert.match(text, /Unreviewed/);
  assert.match(text, /command:provenance\.approveSession/);
  assert.match(text, /command:provenance\.rejectSession/);
  assert.match(text, /command:provenance\.showSession/);
});

test("hover on a human-rewritten line has no AI card", async () => {
  const api = await activate();
  const doc = await open("src/refund.ts");
  const line = lineOf(doc, "// reviewed by a human");
  const hover = await api.hoverProvider.provideHover(doc, new vscode.Position(line, 0), new vscode.CancellationTokenSource().token);
  assert.equal(hover, null);
});

test("hover on a line from the approved session shows the approved badge and reviewer", async () => {
  const api = await activate();
  const doc = await open("src/paymentClient.ts");
  const line = lineOf(doc, "backoff");
  const hover = await api.hoverProvider.provideHover(doc, new vscode.Position(line, 0), new vscode.CancellationTokenSource().token);
  assert.ok(hover);
  assert.match(textOf(hover as vscode.Hover), /Approved.*dana/s);
});

test("the four commands are registered", async () => {
  await activate();
  const all = await vscode.commands.getCommands(true);
  for (const c of ["provenance.showSession", "provenance.approveSession", "provenance.rejectSession", "provenance.generateReport"]) {
    assert.ok(all.includes(c), `${c} registered`);
  }
});

/** Entry point called by @vscode/test-electron. No mocha: a minimal runner keeps dependencies down. */
export async function run(): Promise<void> {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`  ok   ${name}`);
    } catch (e) {
      failed++;
      console.error(`  FAIL ${name}\n       ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failed > 0) throw new Error(`${failed} extension test(s) failed`);
}
