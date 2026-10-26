import { NextResponse, type NextRequest } from 'next/server';
import { callService, failure } from '@/lib/service';
import { isISODate } from '@/lib/dates';
import type { AnalyticsData } from '@/types/analytics';

/** Live Bob usage analytics, optionally replayed `as_of` a past date (no hindsight). */
export async function GET(request: NextRequest) {
  const asOf = request.nextUrl.searchParams.get('as_of');
  if (asOf !== null && !isISODate(asOf)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  const r = await callService<AnalyticsData>(asOf ? `/api/data?as_of=${asOf}` : '/api/data');
  return r.ok ? NextResponse.json(r.body) : failure(r);
}
