'use client';

import { Handle, Position } from '@xyflow/react';
import { AlertTriangle, CheckCircle2, ShieldAlert, FileText, Scale, Flame, Folder, MessageSquare } from 'lucide-react';
import type { TemporalNodeData } from '@/types/decision';
import { fmt } from '@/lib/format';

const ICON = 'h-4 w-4';

function icon(data: TemporalNodeData, invalidated: boolean) {
  switch (data.type) {
    case 'incident': return <Flame className={ICON} style={{ color: '#FB923C' }} />;
    case 'catalyst': return <ShieldAlert className={ICON} style={{ color: '#60A5FA' }} />;
    case 'decision': return <Scale className={ICON} style={{ color: '#C084FC' }} />;
    case 'assumption': return <AlertTriangle className={ICON} style={{ color: invalidated ? '#F87171' : '#FBBF24' }} />;
    case 'evidence': return <AlertTriangle className={ICON} style={{ color: '#F87171' }} />;
    case 'folder': return <Folder className={ICON} style={{ color: '#2DD4BF' }} />;
    case 'conversation': return <MessageSquare className={ICON} style={{ color: data.status === 'drifting' ? '#FBBF24' : '#2DD4BF' }} />;
    default: return <FileText className={ICON} style={{ color: '#94A3B8' }} />;
  }
}

export const CustomTemporalNode = ({ data, selected }: { data: TemporalNodeData; selected: boolean }) => {
  const invalidated = data.isInvalidated === true;
  const isDriftEvidence = data.type === 'evidence';
  const isSelectedChoice = data.status === 'selected';
  const isRejectedChoice = data.status === 'rejected';
  const isUsage = data.source === 'usage';
  const lowQuality = data.type === 'conversation' && data.status === 'drifting';

  const border = invalidated ? '#EF4444'
    : isDriftEvidence || lowQuality ? '#F59E0B'
    : isSelectedChoice ? '#10B981'
    : isRejectedChoice ? '#475569'
    : isUsage ? '#115E59'
    : '#334155';
  const bg = invalidated ? 'rgba(69, 10, 10, 0.85)'
    : isDriftEvidence ? 'rgba(69, 26, 3, 0.85)'
    : isSelectedChoice ? 'rgba(6, 78, 59, 0.85)'
    : isRejectedChoice ? 'rgba(15, 23, 42, 0.85)'
    : isUsage ? 'rgba(4, 47, 46, 0.7)'
    : '#0F172A';

  const quality = data.type === 'conversation' && typeof data.quality === 'number' ? Math.round(data.quality * 100) : null;

  return (
    <div
      className="min-w-[260px] max-w-[300px] rounded-xl px-4 py-3 text-white transition-all"
      style={{
        border: `2px solid ${border}`,
        backgroundColor: bg,
        boxShadow: invalidated ? '0 0 25px rgba(239, 68, 68, 0.5)' : '0 10px 20px rgba(0,0,0,0.6)',
        transform: selected ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: '#94A3B8' }} />

      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-300">
          {icon(data, invalidated)}
          <span>{data.type}</span>
          {isUsage && <span className="rounded bg-teal-900/60 px-1 text-[9px] text-teal-300">BOB USAGE</span>}
        </div>
        <span className="font-mono text-[10px] text-slate-400">{data.timestamp.slice(0, 10)}</span>
      </div>

      <div className="mb-1 text-[13px] font-bold leading-tight">{data.title}</div>
      <div className="mb-2 text-[11px] leading-snug text-slate-400">{data.description}</div>

      <div className="flex items-center justify-between border-t border-white/10 pt-1.5 font-mono text-[10px]">
        <span className="text-slate-500">
          {isUsage ? (
            data.type === 'conversation' ? (
              <>Prompt quality: <strong className="text-slate-200">{quality == null ? '-' : `${quality}%`}</strong></>
            ) : (
              <>Spend: <strong className="text-slate-200">{fmt(data.bobcoins ?? null)}</strong></>
            )
          ) : (
            <>Conf: <strong className="text-slate-200">{(data.confidence * 100).toFixed(0)}%</strong></>
          )}
        </span>
        {invalidated && (
          <span className="flex items-center gap-1 font-bold text-red-400">
            <AlertTriangle className="h-3 w-3 text-red-500" /> {isUsage ? 'DRIFTED' : 'INVALIDATED'}
          </span>
        )}
        {isSelectedChoice && (
          <span className="flex items-center gap-1 font-bold text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> SELECTED
          </span>
        )}
        {lowQuality && !invalidated && <span className="font-bold text-amber-400">WEAK PROMPT</span>}
      </div>

      <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: '#3B82F6' }} />
    </div>
  );
};
