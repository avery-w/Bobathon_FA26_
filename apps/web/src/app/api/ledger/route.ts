// STUB (Lane A Foundation). Lane C replaces the unset-BTM_MOCK branch with live data.
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const root = process.env.BTM_ROOT ?? path.resolve(process.cwd(), "..", "..");
  const mock = process.env.BTM_MOCK;
  let filename: string;
  if (mock === "nospend") {
    filename = "ledger-no-spend.json";
  } else if (mock === "unavailable") {
    filename = "ledger-unavailable.json";
  } else {
    filename = "ledger-response.json";
  }
  const filePath = path.join(root, "contracts", filename);
  const data = JSON.parse(await fs.promises.readFile(filePath, "utf-8")) as unknown;
  return NextResponse.json(data);
}
