import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_DRIFT_ALERT } from '@/data/demoData';
import { callService } from '@/lib/service';
import { buildUsageDrift } from '@/lib/usageDrift';
import { demoDriftActive } from '@/lib/graph';
import { isISODate, todayISO } from '@/lib/dates';
import type { AnalyticsData } from '@/types/analytics';

const MAX_BODY = 262_144;

/**
 * Live drift evaluation. `alerts` holds decision drift (assumptions broken by new documents);
 * `usageAlerts` holds drift in how Bob is being used (budget, efficiency, spend trend, secrets).
 * Optional `asOf` evaluates both as they stood on a past day.
 */
export async function GET(request: NextRequest) {
  const today = todayISO();
  const asOf = request.nextUrl.searchParams.get('asOf');
  if (asOf !== null && !isISODate(asOf)) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
  const epoch = asOf && asOf < today ? asOf : today;

  const usage = await callService<AnalyticsData>(epoch < today ? `/api/data?as_of=${epoch}` : '/api/data');
  const usageAlerts = usage.ok ? buildUsageDrift(usage.body) : [];
  const alerts = demoDriftActive(epoch) ? [DEMO_DRIFT_ALERT] : [];

  return NextResponse.json({
    status: 'success',
    activeAlertsCount: alerts.length + usageAlerts.length,
    decisionAlertsCount: alerts.length,
    usageAlertsCount: usageAlerts.length,
    totalExposureAnnual: alerts.length ? 1_400_000 : 0,
    usageIncluded: usage.ok,
    alerts,
    usageAlerts,
  });
}

/**
 * Ingest a new document and evaluate it against historical assumptions.
 * Body: { documentName: string, documentContent: string }
 */
export async function POST(request: NextRequest) {
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
  try {
    const body: unknown = await request.json();
    const { documentName, documentContent } = (body ?? {}) as { documentName?: unknown; documentContent?: unknown };
    const name = typeof documentName === 'string' ? documentName : '';
    const content = typeof documentContent === 'string' ? documentContent : '';

    // Simulated NLI contradiction analysis over historical assumptions.
    const isContradiction = content.toLowerCase().includes('fedramp high') || name.toLowerCase().includes('fedramp');

    if (isContradiction) {
      return NextResponse.json({
        status: 'DRIFT_DETECTED',
        severity: 'CRITICAL',
        targetDecisionId: 'ADR-104',
        invalidatedAssumptionId: 'ASM-104-03',
        contradictionConfidence: 0.964,
        annualExposure: 1_400_000,
        recommendedAction: 'Reopen Architecture Review Board (ARB)',
        alert: DEMO_DRIFT_ALERT,
      });
    }

    return NextResponse.json({
      status: 'STABLE',
      message: 'Document ingested successfully. No assumption drift detected.',
    });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
}
