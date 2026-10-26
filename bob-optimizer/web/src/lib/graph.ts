import type { AnalyticsData, ConversationNode } from '../types/analytics.ts';
import type { GraphEdge, GraphNode, UsageDriftAlert } from '../types/decision.ts';
import { RAW_DEMO_EDGES, RAW_DEMO_NODES } from '../data/demoData.ts';
import { BULLETIN_EPOCH } from './dates.ts';
import { fmt, OUTCOME_LABELS, short } from './format.ts';
import { buildUsageDrift } from './usageDrift.ts';

export const MAX_FOLDERS = 3;
export const MAX_CONVERSATIONS_PER_FOLDER = 3;
const USAGE_TOP = 640; // below the decision cluster
const COLUMNS = [380, 710, 1040];
const ALERT_X = 1400;
const ROW_HEIGHT = 170;

export interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  usageAlerts: UsageDriftAlert[];
}

/** True once the 2026 bulletin that breaks the ADR-104 assumption is part of what is known. */
export function demoDriftActive(epoch: string): boolean {
  return epoch >= BULLETIN_EPOCH;
}

const stamp = (date: string) => `${date}T00:00:00Z`;

function conversationNode(c: ConversationNode, unit: string): GraphNode {
  const quality = c.quality;
  return {
    id: `usage-conv-${c.id}`,
    type: 'conversation',
    source: 'usage',
    title: `${short(c.folder, 26)} - ${c.mode}`,
    description: `${c.prompts} prompt${c.prompts === 1 ? '' : 's'}, ${fmt(c.cost)} ${unit}, ${OUTCOME_LABELS[c.outcome] ?? c.outcome}` +
      (c.subagents ? `, ${c.subagents} subagent${c.subagents === 1 ? '' : 's'}` : ''),
    timestamp: stamp(c.date),
    status: quality != null && quality < 0.5 ? 'drifting' : 'valid',
    confidence: quality ?? 0.5,
    quality,
    bobcoins: c.cost,
    position: { x: 0, y: 0 },
  };
}

function buildUsage(analytics: AnalyticsData, epoch: string, alerts: UsageDriftAlert[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const unit = analytics.unit;

  const byFolder = new Map<string, ConversationNode[]>();
  for (const c of analytics.conversations) {
    if (c.date > epoch) continue; // defensive: the service already replays as of the epoch
    byFolder.set(c.folder, [...(byFolder.get(c.folder) ?? []), c]);
  }
  const folders = [...byFolder.entries()]
    .map(([folder, list]) => ({ folder, list, total: list.reduce((a, x) => a + x.cost, 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_FOLDERS);

  const shown: ConversationNode[] = [];
  folders.forEach((g, gi) => {
    const picked = [...g.list]
      .sort((a, b) => b.cost - a.cost)
      .slice(0, MAX_CONVERSATIONS_PER_FOLDER)
      .sort((a, b) => a.date.localeCompare(b.date));
    const y = USAGE_TOP + gi * ROW_HEIGHT;
    const stat = analytics.folders.find((f) => f.folder === g.folder);
    const folderId = `usage-folder-${gi}`;
    nodes.push({
      id: folderId,
      type: 'folder',
      source: 'usage',
      title: short(g.folder, 34),
      description: `${stat?.conversations ?? g.list.length} conversations, ${fmt(stat?.cost ?? g.total)} ${unit} so far`,
      timestamp: stamp(picked[0].date),
      status: 'valid',
      confidence: 1,
      bobcoins: stat?.cost ?? g.total,
      position: { x: 50, y },
    });
    picked.forEach((c, ci) => {
      const node = conversationNode(c, unit);
      node.position = { x: COLUMNS[ci], y };
      nodes.push(node);
      edges.push({ id: `e-${folderId}-${c.id}`, source: folderId, target: node.id, style: { stroke: '#2A9D8F', strokeWidth: 2 } });
      shown.push(c);
    });
  });

  const costliest = [...shown].sort((a, b) => b.cost - a.cost)[0];
  const lowestQuality = [...shown]
    .filter((c) => c.quality != null)
    .sort((a, b) => (a.quality as number) - (b.quality as number))[0];
  const evidenceFor: Record<UsageDriftAlert['kind'], ConversationNode | undefined> = {
    budget: costliest,
    trend: costliest,
    efficiency: lowestQuality,
    secrets: undefined,
  };

  alerts.forEach((a, i) => {
    const evidence = evidenceFor[a.kind];
    const id = `usage-alert-${a.id}`;
    nodes.push({
      id,
      type: 'assumption',
      source: 'usage',
      title: `${a.id}: ${a.title}`,
      description: a.assumption,
      timestamp: stamp(epoch),
      status: 'invalidated',
      confidence: 1,
      severity: a.severity,
      invalidatedBy: evidence ? `usage-conv-${evidence.id}` : undefined,
      rawQuote: a.evidence,
      position: { x: ALERT_X, y: USAGE_TOP + i * ROW_HEIGHT },
    });
    if (evidence) {
      edges.push({
        id: `e-evidence-${a.id}`,
        source: `usage-conv-${evidence.id}`,
        target: id,
        animated: true,
        style: { stroke: '#EF4444', strokeWidth: 3 },
      });
    }
  });

  return { nodes, edges };
}

/**
 * Builds the combined causal graph for one point in time: the sample ADR-104 decision
 * history plus live Bob usage, using only what was known on `epoch` (no hindsight).
 */
export function buildGraph(epoch: string, today: string, analytics: AnalyticsData | null): GraphResult {
  const cutoff = `${epoch}T23:59:59Z`;
  const demo = RAW_DEMO_NODES.filter((n) => n.timestamp <= cutoff);
  const visible = new Set(demo.map((n) => n.id));

  const nodes: GraphNode[] = demo.map((n) => ({
    ...n,
    source: 'demo' as const,
    isInvalidated: n.status === 'invalidated' && (n.invalidatedBy ? visible.has(n.invalidatedBy) : true),
  }));
  const demoStroke = epoch < today ? '#F59E0B' : '#3B82F6';
  const edges: GraphEdge[] = RAW_DEMO_EDGES.filter((e) => visible.has(e.source) && visible.has(e.target)).map((e) => ({
    ...e,
    style: e.style ?? { stroke: demoStroke, strokeWidth: 2 },
  }));

  let usageAlerts: UsageDriftAlert[] = [];
  if (analytics) {
    usageAlerts = buildUsageDrift(analytics);
    const usage = buildUsage(analytics, epoch, usageAlerts);
    const shownIds = new Set(usage.nodes.map((n) => n.id));
    nodes.push(...usage.nodes.map((n) => ({ ...n, isInvalidated: n.status === 'invalidated' && (!n.invalidatedBy || shownIds.has(n.invalidatedBy)) })));
    edges.push(...usage.edges);
  }

  return { nodes, edges, usageAlerts };
}
