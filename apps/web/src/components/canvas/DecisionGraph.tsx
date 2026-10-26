'use client';

import React, { useMemo } from 'react';
import { ReactFlow, Background, Controls, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { CustomTemporalNode } from './CustomTemporalNode';
import { RAW_DEMO_EDGES } from '@/data/demoData';

const nodeTypes = {
  temporalNode: CustomTemporalNode,
};

export const DecisionGraph = () => {
  const { currentEpoch, nodes, selectNode, selectedNode, isHistoricalReplay } = useTimeMachineStore();

  // Filter nodes strictly by temporal boundary: node.timestamp <= currentEpoch
  const visibleNodes: Node[] = useMemo(() => {
    return nodes
      .filter((n) => n.timestamp <= `${currentEpoch}T23:59:59Z`)
      .map((n) => ({
        id: n.id,
        type: 'temporalNode',
        position: n.position,
        data: n,
        selected: selectedNode?.id === n.id,
      }));
  }, [nodes, currentEpoch, selectedNode]);

  // Filter edges so both source & target exist in visibleNodes
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);

  const visibleEdges: Edge[] = useMemo(() => {
    return RAW_DEMO_EDGES.filter(
      (e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    ).map((e) => ({
      ...e,
      style: e.style || { stroke: isHistoricalReplay ? '#F59E0B' : '#3B82F6', strokeWidth: 2 },
    }));
  }, [visibleNodeIds, isHistoricalReplay]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        backgroundColor: '#06080F',
        borderRadius: '16px',
        border: '1px solid #1E293B',
        overflow: 'hidden',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
      }}
    >
      <ReactFlow
        nodes={visibleNodes}
        edges={visibleEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => selectNode(node.data as any)}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.4}
        maxZoom={1.5}
      >
        <Background color="#1E293B" gap={24} size={1.2} />
        <Controls style={{ backgroundColor: '#0F172A', borderColor: '#334155', fill: '#FFFFFF' }} />
      </ReactFlow>

      {/* Floating Status Pill */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          backgroundColor: 'rgba(15, 23, 42, 0.9)',
          padding: '6px 14px',
          borderRadius: '9999px',
          border: '1px solid #334155',
          fontSize: '11px',
          fontFamily: 'monospace',
          color: '#E2E8F0',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
        }}
      >
        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981' }} />
        <span>Causal DAG: {visibleNodes.length} Primitives Active</span>
        <span style={{ color: '#64748B' }}>|</span>
        <span style={{ color: isHistoricalReplay ? '#FBBF24' : '#60A5FA', fontWeight: 'bold' }}>
          Locked to {currentEpoch}
        </span>
      </div>
    </div>
  );
};
