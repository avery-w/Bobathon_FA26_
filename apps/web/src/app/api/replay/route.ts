import { NextRequest, NextResponse } from 'next/server';
import { RAW_DEMO_NODES, RAW_DEMO_EDGES } from '@/data/demoData';

/**
 * Bi-temporal Graph Replay Query Endpoint
 * Query params:
 *  - cutoffDate: ISO Date string (e.g. "2024-12-12")
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const cutoffDate = searchParams.get('cutoffDate') || '2026-03-31';

  // Filter nodes strictly where node.timestamp <= cutoffDate
  const validNodes = RAW_DEMO_NODES.filter(
    (n) => n.timestamp <= `${cutoffDate}T23:59:59Z`
  );

  const validNodeIds = new Set(validNodes.map((n) => n.id));

  // Filter edges where both source & target exist in the valid subgraph
  const validEdges = RAW_DEMO_EDGES.filter(
    (e) => validNodeIds.has(e.source) && validNodeIds.has(e.target)
  );

  return NextResponse.json({
    status: 'success',
    cutoffEpoch: cutoffDate,
    nodesCount: validNodes.length,
    edgesCount: validEdges.length,
    isHistoricalReplay: cutoffDate < '2026-01-01',
    data: {
      nodes: validNodes,
      edges: validEdges,
    },
  });
}
