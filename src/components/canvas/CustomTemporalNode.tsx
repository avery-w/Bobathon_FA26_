'use client';

import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { AlertTriangle, CheckCircle2, ShieldAlert, FileText, Scale, Flame } from 'lucide-react';
import { TemporalNodeData } from '@/types/decision';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';

export const CustomTemporalNode = ({ data, selected }: { data: TemporalNodeData; selected: boolean }) => {
  const { isHistoricalReplay } = useTimeMachineStore();
  const isInvalidated = data.status === 'invalidated' && !isHistoricalReplay;
  const isDriftEvidence = data.type === 'evidence';
  const isSelectedChoice = data.status === 'selected';
  const isRejectedChoice = data.status === 'rejected';

  const getNodeIcon = () => {
    switch (data.type) {
      case 'incident': return <Flame style={{ width: '16px', height: '16px', color: '#FB923C' }} />;
      case 'catalyst': return <ShieldAlert style={{ width: '16px', height: '16px', color: '#60A5FA' }} />;
      case 'decision': return <Scale style={{ width: '16px', height: '16px', color: '#C084FC' }} />;
      case 'assumption': return <AlertTriangle style={{ width: '16px', height: '16px', color: isInvalidated ? '#F87171' : '#FBBF24' }} />;
      case 'evidence': return <AlertTriangle style={{ width: '16px', height: '16px', color: '#F87171' }} />;
      default: return <FileText style={{ width: '16px', height: '16px', color: '#94A3B8' }} />;
    }
  };

  const getBorderColor = () => {
    if (isInvalidated) return '#EF4444';
    if (isDriftEvidence) return '#F59E0B';
    if (isSelectedChoice) return '#10B981';
    if (isRejectedChoice) return '#475569';
    return '#334155';
  };

  const getBgColor = () => {
    if (isInvalidated) return 'rgba(69, 10, 10, 0.85)';
    if (isDriftEvidence) return 'rgba(69, 26, 3, 0.85)';
    if (isSelectedChoice) return 'rgba(6, 78, 59, 0.85)';
    if (isRejectedChoice) return 'rgba(15, 23, 42, 0.85)';
    return '#0F172A';
  };

  return (
    <div
      style={{
        padding: '12px 16px',
        borderRadius: '12px',
        border: `2px solid ${getBorderColor()}`,
        backgroundColor: getBgColor(),
        minWidth: '260px',
        maxWidth: '300px',
        boxShadow: isInvalidated ? '0 0 25px rgba(239, 68, 68, 0.5)' : '0 10px 20px rgba(0,0,0,0.6)',
        color: '#FFFFFF',
        transition: 'all 0.3s ease',
        transform: selected ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ width: '10px', height: '10px', background: '#94A3B8' }} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#CBD5E1' }}>
          {getNodeIcon()}
          <span>{data.type}</span>
        </div>
        <span style={{ fontSize: '10px', fontFamily: 'monospace', color: '#94A3B8' }}>
          {new Date(data.timestamp).toISOString().split('T')[0]}
        </span>
      </div>

      {/* Title */}
      <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#FFFFFF', marginBottom: '4px', lineHeight: 1.3 }}>
        {data.title}
      </div>

      {/* Description */}
      <div style={{ fontSize: '11px', color: '#94A3B8', lineHeight: 1.4, marginBottom: '8px' }}>
        {data.description}
      </div>

      {/* Footer Tag */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'monospace' }}>
        <span style={{ color: '#64748B' }}>
          Conf: <strong style={{ color: '#E2E8F0' }}>{(data.confidence * 100).toFixed(0)}%</strong>
        </span>
        {isInvalidated && (
          <span style={{ color: '#F87171', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <AlertTriangle style={{ width: '12px', height: '12px', color: '#EF4444' }} /> INVALIDATED
          </span>
        )}
        {isSelectedChoice && (
          <span style={{ color: '#34D399', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <CheckCircle2 style={{ width: '12px', height: '12px' }} /> SELECTED
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} style={{ width: '10px', height: '10px', background: '#3B82F6' }} />
    </div>
  );
};
