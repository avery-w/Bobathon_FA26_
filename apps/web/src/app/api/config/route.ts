import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const analyticsUrl = process.env.BTM_ANALYTICS_URL ?? "http://localhost:8765/";
  return NextResponse.json({ analyticsUrl });
}
