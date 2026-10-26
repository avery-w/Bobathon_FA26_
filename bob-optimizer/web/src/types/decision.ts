export type NodeType =
  | 'incident'
  | 'catalyst'
  | 'decision'
  | 'alternative'
  | 'assumption'
  | 'evidence'
  | 'conversation'
  | 'folder';

export interface TemporalNodeData {
  id: string;
  type: NodeType;
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
  /** Where the node came from: the original decision demo or the live Bob usage database. */
  source?: 'demo' | 'usage';
  /** Bobcoins spent (usage nodes only). */
  bobcoins?: number;
  /** Opening-prompt quality, 0 to 1 (conversation nodes only). */
  quality?: number | null;
  [key: string]: unknown;
}

export type GraphNode = TemporalNodeData & { position: { x: number; y: number } };

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  animated?: boolean;
  style?: { stroke: string; strokeWidth: number };
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

/** A drift alert raised from live Bob usage rather than from an ingested document. */
export interface UsageDriftAlert {
  id: string;
  kind: 'budget' | 'efficiency' | 'trend' | 'secrets';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  title: string;
  assumption: string;
  evidence: string;
  action: string;
  exposureBobcoins: number | null;
}

export interface HistoricalMilestone {
  date: string; // "YYYY-MM-DD"
  label: string;
  type: 'incident' | 'decision' | 'drift' | 'usage';
  nodeId: string;
}
