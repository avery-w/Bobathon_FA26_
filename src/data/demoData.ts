import { TemporalNodeData, DecisionDriftPayload, HistoricalMilestone } from '@/types/decision';

export const HISTORICAL_MILESTONES: HistoricalMilestone[] = [
  { date: '2024-11-28', label: 'Black Friday Outage ($4.2M)', type: 'incident', nodeId: 'node-incident-1' },
  { date: '2024-12-02', label: 'CISO FedRAMP Veto', type: 'incident', nodeId: 'node-catalyst-1' },
  { date: '2024-12-12', label: 'ADR-104 Ratified by ARB', type: 'decision', nodeId: 'node-decision-1' },
  { date: '2026-03-03', label: 'AWS FedRAMP Bulletin (Today)', type: 'drift', nodeId: 'node-evidence-2026' },
];

export const RAW_DEMO_NODES: (TemporalNodeData & { position: { x: number; y: number } })[] = [
  {
    id: 'node-incident-1',
    type: 'incident',
    title: 'RCA-2024-88: Black Friday Outage',
    description: 'Payment gateway crashed under 10x traffic spike. Revenue loss: $4.2M across 42 minutes.',
    timestamp: '2024-11-28T00:00:00Z',
    confidence: 0.98,
    stakeholders: ['Dave Miller (VP Eng)', 'SRE Core Team'],
    citationUri: 'https://github.com/enterprise/gateway/issues/882',
    rawQuote: 'Monolithic connection pooling choked at 12,000 TPS on legacy VM infrastructure.',
    position: { x: 50, y: 60 }
  },
  {
    id: 'node-catalyst-1',
    type: 'catalyst',
    title: 'CISO Security Mandate',
    description: 'Federal RFP requires strict zero-trust FedRAMP High runtime isolation.',
    timestamp: '2024-12-02T00:00:00Z',
    confidence: 0.95,
    stakeholders: ['Dr. Aris Thorne (CISO)'],
    citationUri: 'slack://channel/p1733152000',
    rawQuote: 'Any platform without FedRAMP High certification is an immediate security veto.',
    position: { x: 50, y: 240 }
  },
  {
    id: 'node-decision-1',
    type: 'decision',
    title: 'ADR-104: Payment Platform Strategy',
    description: 'Architecture Review Board selects target container orchestration platform.',
    timestamp: '2024-12-12T00:00:00Z',
    status: 'selected',
    confidence: 1.0,
    financialExposure: 1800000,
    stakeholders: ['Architecture Review Board', 'Lead Architects'],
    citationUri: 'https://wiki.enterprise.internal/arch/adr-104',
    rawQuote: 'Unanimous ratification of Red Hat OpenShift across hybrid clusters.',
    position: { x: 420, y: 150 }
  },
  {
    id: 'node-alt-openshift',
    type: 'alternative',
    title: 'Red Hat OpenShift (Selected)',
    description: 'Compliant with Federal security profiles, built-in SCC and operator lifecycle.',
    timestamp: '2024-12-12T00:00:00Z',
    status: 'selected',
    confidence: 0.96,
    stakeholders: ['Dr. Aris Thorne (Champion)'],
    position: { x: 800, y: 50 }
  },
  {
    id: 'node-alt-eks',
    type: 'alternative',
    title: 'Amazon AWS EKS (Rejected)',
    description: 'Rejected due to absence of native FedRAMP High boundary authorization in 2024.',
    timestamp: '2024-12-12T00:00:00Z',
    status: 'rejected',
    confidence: 0.94,
    stakeholders: ['Dave Miller (VP Eng - Opposed)'],
    position: { x: 800, y: 260 }
  },
  {
    id: 'node-assumption-eks',
    type: 'assumption',
    title: 'ASM-104-03: EKS Lacks FedRAMP High',
    description: 'Foundational Premise: AWS EKS cannot be used for Federal workloads due to missing certs.',
    timestamp: '2024-12-12T00:00:00Z',
    status: 'invalidated',
    confidence: 0.99,
    invalidatedBy: 'node-evidence-2026',
    citationUri: 'https://wiki.enterprise.internal/arch/adr-104#sec-4.2',
    rawQuote: 'AWS EKS does not have FedRAMP High zero-trust network authorization as of Q4 2024.',
    position: { x: 1180, y: 260 }
  },
  {
    id: 'node-evidence-2026',
    type: 'evidence',
    title: 'AWS FedRAMP Bulletin (Mar 3, 2026)',
    description: 'New Evidence: Amazon EKS achieves native FedRAMP High authorization across all US regions.',
    timestamp: '2026-03-03T00:00:00Z',
    status: 'drifting',
    confidence: 0.964,
    citationUri: 'file://AWS-FedRAMP-High-Bulletin-2026.pdf',
    rawQuote: 'Amazon EKS achieves FedRAMP High Authorization, satisfying DoD Impact Level 5.',
    position: { x: 1180, y: 460 }
  }
];

export const RAW_DEMO_EDGES = [
  { id: 'e-inc-cat', source: 'node-incident-1', target: 'node-catalyst-1', animated: true },
  { id: 'e-cat-dec', source: 'node-catalyst-1', target: 'node-decision-1', animated: true },
  { id: 'e-dec-ocp', source: 'node-decision-1', target: 'node-alt-openshift', animated: false },
  { id: 'e-dec-eks', source: 'node-decision-1', target: 'node-alt-eks', animated: false },
  { id: 'e-eks-asm', source: 'node-alt-eks', target: 'node-assumption-eks', animated: true },
  { id: 'e-evi-asm', source: 'node-evidence-2026', target: 'node-assumption-eks', animated: true, style: { stroke: '#EF4444', strokeWidth: 3 } }
];

export const DEMO_DRIFT_ALERT: DecisionDriftPayload = {
  id: 'DRIFT-2026-01',
  decisionId: 'ADR-104',
  decisionTitle: 'Payment Gateway Container Platform Strategy',
  severity: 'CRITICAL',
  annualSavingsPotential: 1400000,
  invalidatedAssumptionId: 'ASM-104-03',
  invalidatedAssumptionText: 'AWS EKS does not satisfy FedRAMP High zero-trust network isolation.',
  originalContext: {
    statedBy: 'Dr. Aris Thorne (CISO)',
    sourceDoc: 'ADR-104 Signed Dec 12, 2024',
    date: 'Dec 12, 2024'
  },
  contradictingEvidence: {
    bulletinTitle: 'AWS-FedRAMP-High-Bulletin-2026.pdf',
    bulletinDate: 'Mar 3, 2026',
    contradictionScore: 0.964,
    quote: 'Amazon EKS is now certified FedRAMP High across all US commercial regions.'
  },
  recommendation: {
    action: 'Reopen Architecture Review Board (ARB) Hearing',
    jiraSummary: 'ARCH-992: Re-evaluate Managed EKS Migration for Payment Gateway',
    arbProposalText: 'Authorize 4-week spike to benchmark AWS Managed EKS vs OpenShift licensing.'
  }
};
