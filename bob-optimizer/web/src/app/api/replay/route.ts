import { NextResponse, type NextRequest } from 'next/server';
import { callService } from '@/lib/service';
import { buildGraph } from '@/lib/graph';
import { isISODate, todayISO } from '@/lib/dates';
import type { AnalyticsData } from '@/types/analytics';

/**
 * Bi-temporal replay: the causal graph exactly as it was known on `cutoffDate`, with no
 * hindsight. It now contains both the decision history and the Bob usage known on that day.
 *
 * Query params:
 *  - cutoffDate: ISO date (e.g. "2024-12-12"), defaults to today
 */
export async function GET(request: NextRequest) {
  const today = todayISO();
  const requested = request.nextUrl.searchParams.get('cutoffDate');
  if (requested !== null && !isISODate(requested)) {
    return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  }
  const cutoffDate = requested && requested < today ? requested : today;

  // Usage is optional: if the analytics service is down, the decision graph still replays.
  const usage = await callService<AnalyticsData>(cutoffDate < today ? `/api/data?as_of=${cutoffDate}` : '/api/data');
  const { nodes, edges, usageAlerts } = buildGraph(cutoffDate, today, usage.ok ? usage.body : null);

  return NextResponse.json({
    status: 'success',
    cutoffEpoch: cutoffDate,
    nodesCount: nodes.length,
    edgesCount: edges.length,
    isHistoricalReplay: cutoffDate < today,
    usageIncluded: usage.ok,
    usageAlerts,
    data: { nodes, edges },
  });
}
