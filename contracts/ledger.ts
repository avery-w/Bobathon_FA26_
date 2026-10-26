// CONTRACT FILE: owned by Lane A. Do not edit in a lane branch (see TEAM.md, "Changing a contract").
// Copied verbatim to apps/web/src/types/ledger.ts during Foundation.
// The JSON fixtures in contracts/ are concrete values of these types for the demo scenario.

export type ReviewStatus = 'unreviewed' | 'approved' | 'rejected';

/** One AI session, joined with its Bob cost. Order = order of `prov report --json` sessions (by id, which is by createdAt). */
export interface LedgerRow {
  sessionId: string;
  createdAt: string;
  agent: string;
  model: string;
  promptExcerpt: string;
  status: ReviewStatus;
  reviewer: string | null;
  comment: string | null;
  survivingLines: number;
  decisionRefs: string[];
  cost: number | null;
  taskId: string | null;
  match: 'time-window' | 'none';
}

export interface LedgerTotals {
  aiCost: number | null;
  approvedCost: number | null;
  unreviewedCost: number | null;
  rejectedCost: number | null;
  /** unreviewed + rejected */
  atRiskCost: number | null;
  /** aiCost / sum(survivingLines); null when spend is unavailable or there are 0 lines */
  costPerSurvivingLine: number | null;
  /** rows with match === 'none' (equals rows.length when spend is unavailable) */
  unmatchedSessions: number;
}

export interface ImpactRange {
  file: string;
  start: number;
  end: number;
  sessionId: string;
  status: ReviewStatus;
}

export interface DecisionImpactWithCost {
  ref: string;
  sessionIds: string[];
  totals: { sessions: number; survivingLines: number; unreviewedLines: number; rejectedLines: number };
  ranges: ImpactRange[];
  cost: number | null;
}

export interface LedgerSummary {
  totalLines: number;
  aiLines: number;
  aiPercent: number;
  unreviewedAiLines: number;
  unreviewedAiPercent: number;
}

export type LedgerResponse =
  | {
      status: 'ok';
      repoName: string;
      head: string | null;
      unit: 'Bobcoins';
      spendAvailable: boolean;
      summary: LedgerSummary;
      rows: LedgerRow[];
      totals: LedgerTotals;
      /** sorted by ref */
      impacts: DecisionImpactWithCost[];
    }
  | { status: 'unavailable'; reason: string };

/** GET /api/config */
export interface AppConfig {
  analyticsUrl: string;
}
