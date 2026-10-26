export interface TemporalNodeData {
  id: string;
  type: 'incident' | 'catalyst' | 'decision' | 'alternative' | 'assumption' | 'evidence';
  title: string;
  description: string;
  timestamp: string; // ISO-8601
  status?: 'selected' | 'rejected' | 'valid' | 'invalidated' | 'drifting';
  confidence: number;
  stakeholders?: string[];
  financialExposure?: number;
  invalidatedBy?: string;
  citationUri?: string;
  rawQuote?: string;
  [key: string]: unknown;
}

export interface DecisionDriftPayload {
  id: string;
  decisionId: string;
  decisionTitle: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  annualSavingsPotential: number;
  invalidatedAssumptionId: string;
  invalidatedAssumptionText: string;
  originalContext: {
    statedBy: string;
    sourceDoc: string;
    date: string;
  };
  contradictingEvidence: {
    bulletinTitle: string;
    bulletinDate: string;
    contradictionScore: number;
    quote: string;
  };
  recommendation: {
    action: string;
    jiraSummary: string;
    arbProposalText: string;
  };
}

export interface HistoricalMilestone {
  date: string; // "YYYY-MM-DD"
  label: string;
  type: 'incident' | 'decision' | 'drift';
  nodeId: string;
}
