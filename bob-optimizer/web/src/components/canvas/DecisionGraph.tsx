'use client';

import { useMemo } from 'react';
import { ReactFlow, Background, Controls, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { CustomTemporalNode } from './CustomTemporalNode';
import { useGraph } from '@/lib/hooks';
import type { TemporalNodeData } from '@/types/decision';

const nodeTypes = { temporalNode: CustomTemporalNode };

export const DecisionGraph = () => {
  const currentEpoch = useTimeMachineStore((s) => s.currentEpoch);
  const isHistoricalReplay = useTimeMachineStore((s) => s.isHistoricalReplay);
  const selectedNode = useTimeMachineStore((s) => s.selectedNode);
  const selectNode = useTimeMachineStore((s) => s.selectNode);
  const usageStatus = useTimeMachineStore((s) => s.usageStatus);
  const { nodes, edges } = useGraph();

  const rfNodes: Node[] = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.id,
        type: 'temporalNode',
        position: n.position,
        data: n as unknown as Record<string, unknown>,
        selected: selectedNode?.id === n.id,
      })),
    [nodes, selectedNode],
  );
  const rfEdges: Edge[] = useMemo(() => edges.map((e) => ({ ...e })), [edges]);
  const usageCount = nodes.filter((n) => n.source === 'usage').length;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-slate-800 bg-obsidian-950 shadow-2xl">
      <ReactFlow
        key={`${currentEpoch}-${usageCount}`}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => selectNode(node.data as unknown as TemporalNodeData)}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.3}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1E293B" gap={24} size={1.2} />
        <Controls />
      </ReactFlow>

      <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/90 px-3.5 py-1.5 font-mono text-[11px] text-slate-200 shadow-lg">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span>Causal DAG: {nodes.length} primitives ({usageCount} from Bob usage)</span>
        <span className="text-slate-500">|</span>
        <span className="font-bold" style={{ color: isHistoricalReplay ? '#FBBF24' : '#60A5FA' }}>
          Locked to {currentEpoch}
        </span>
        {usageStatus === 'loading' && <span className="text-slate-400">updating...</span>}
      </div>
    </div>
  );
};
