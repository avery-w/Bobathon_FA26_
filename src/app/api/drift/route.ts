import { NextRequest, NextResponse } from 'next/server';
import { DEMO_DRIFT_ALERT } from '@/data/demoData';

/**
 * Live Decision Drift Evaluation Endpoint
 */
export async function GET() {
  return NextResponse.json({
    status: 'success',
    activeAlertsCount: 1,
    totalExposureAnnual: 1400000,
    alerts: [DEMO_DRIFT_ALERT],
  });
}

/**
 * Ingest new document and trigger real-time drift evaluation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { documentName, documentContent } = body;

    // Simulate NLI Contradiction Analysis over historical assumptions
    const isContradiction =
      documentContent?.toLowerCase().includes('fedramp high') ||
      documentName?.toLowerCase().includes('fedramp');

    if (isContradiction) {
      return NextResponse.json({
        status: 'DRIFT_DETECTED',
        severity: 'CRITICAL',
        targetDecisionId: 'ADR-104',
        invalidatedAssumptionId: 'ASM-104-03',
        contradictionConfidence: 0.964,
        annualExposure: 1400000,
        recommendedAction: 'Reopen Architecture Review Board (ARB)',
        alert: DEMO_DRIFT_ALERT,
      });
    }

    return NextResponse.json({
      status: 'STABLE',
      message: 'Document ingested successfully. No assumption drift detected.',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }
}
