'use client';

import { useState } from 'react';
import {
  AlertOctagon, ArrowRight, Calendar, CheckCircle, Clock, FileText, ShieldAlert, Gauge,
} from 'lucide-react';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { DEMO_DRIFT_ALERT } from '@/data/demoData';
import { ADR_EPOCH, longDate } from '@/lib/dates';
import { demoDriftActive } from '@/lib/graph';
import { useUsageAlerts } from '@/lib/hooks';
import { UsageAlertList } from './UsageAlertList';

function UsageAlerts({ count, loading }: { count: number; loading: boolean }) {
  return (
    <div className="mt-4 border-t border-white/10 pt-3">
      <div className="mb-2 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-wider text-teal-400">
        <Gauge className="h-4 w-4" />
        <span>Bob usage drift ({count})</span>
        {loading && <span className="text-slate-500">updating...</span>}
      </div>
      <UsageAlertList />
    </div>
  );
}

export const DriftPanel = () => {
  const currentEpoch = useTimeMachineStore((s) => s.currentEpoch);
  const triggerLiveDropSimulation = useTimeMachineStore((s) => s.triggerLiveDropSimulation);
  const isSimulatingDrop = useTimeMachineStore((s) => s.isSimulatingDrop);
  const isDemoMode = useTimeMachineStore((s) => s.isDemoMode);
  const isHistoricalReplay = useTimeMachineStore((s) => s.isHistoricalReplay);
  const usageStatus = useTimeMachineStore((s) => s.usageStatus);
  const selectedNode = useTimeMachineStore((s) => s.selectedNode);
  const usageAlerts = useUsageAlerts();
  const [scheduled, setScheduled] = useState(false);

  const alert = DEMO_DRIFT_ALERT;
  const drift = demoDriftActive(currentEpoch);
  const ratified = currentEpoch >= ADR_EPOCH;
  const usageBlock = <UsageAlerts count={usageAlerts.length} loading={usageStatus === 'loading' || usageStatus === 'idle'} />;

  const selected =
    selectedNode && selectedNode.source === 'usage' ? (
      <div className="mt-3 rounded-lg border border-slate-800 bg-obsidian-950 p-2.5 text-[11px]">
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Selected on graph</span>
        <p className="font-bold text-white">{selectedNode.title}</p>
        <p className="text-slate-400">{selectedNode.description}</p>
        {selectedNode.rawQuote && <p className="mt-0.5 text-slate-300">{selectedNode.rawQuote}</p>}
      </div>
    ) : null;

  if (!drift) {
    return (
      <div className="flex h-full w-full flex-col justify-between overflow-y-auto rounded-2xl border border-amber-500/50 bg-obsidian-900/95 p-6 shadow-2xl backdrop-blur-xl transition-all">
        <div>
          {isHistoricalReplay && (
            <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-amber-500/50 bg-amber-500/20 px-3.5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
              <Clock className="h-4 w-4 animate-spin text-amber-400" />
              <span>Viewing Knowledge Available on {longDate(currentEpoch)}</span>
            </div>
          )}

          <h3 className={`mb-2 font-bold tracking-tight text-white ${isDemoMode ? 'text-2xl' : 'text-xl'}`}>
            {ratified ? 'ADR-104: Payment Platform Strategy' : 'ADR-104 has not been decided yet'}
          </h3>
          <p className="mb-6 text-xs leading-relaxed text-zinc-300">
            Historical isolation active. All later CVEs, outage metrics, certifications and Bob usage are purged from memory to eliminate hindsight bias.
          </p>

          {ratified && (
            <div className="space-y-3.5">
              <div className="rounded-xl border border-obsidian-800 bg-obsidian-950/90 p-4">
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-zinc-400">Foundational Constraint (2024)</span>
                <p className="text-xs font-medium leading-relaxed text-zinc-200">
                  AWS EKS rejected because it lacked FedRAMP High zero-trust certification required for the Federal Banking RFP.
                </p>
              </div>
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4">
                <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-emerald-400">Ratified Selection</span>
                <p className="font-mono text-sm font-bold text-emerald-300">Red Hat OpenShift ($1.8M / Year)</p>
              </div>
            </div>
          )}

          {selected}
          {usageBlock}
        </div>

        <button
          type="button"
          onClick={triggerLiveDropSimulation}
          disabled={isSimulatingDrop}
          className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-blue-400/30 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 px-4 py-4 font-mono text-xs font-bold text-white shadow-xl shadow-blue-900/30 transition-all hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98] disabled:cursor-wait"
        >
          {isSimulatingDrop ? (
            <span className="flex animate-pulse items-center gap-2">
              <span className="h-2 w-2 animate-ping rounded-full bg-white" />
              Ingesting Mar 3, 2026 AWS Security Bulletin...
            </span>
          ) : (
            <>
              <span>Simulate Live 2026 Bulletin Ingestion</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full flex-col justify-between overflow-y-auto rounded-2xl border-2 border-red-500/70 bg-obsidian-900/95 p-6 shadow-2xl backdrop-blur-xl transition-all">
      <div className="absolute left-0 right-0 top-0 h-1.5 animate-pulse bg-gradient-to-r from-red-600 via-amber-500 to-red-600" />

      <div>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-wider text-red-400">
            <AlertOctagon className="h-5 w-5 animate-bounce text-red-500" />
            <span>CRITICAL DECISION DRIFT</span>
          </div>
          <span className="rounded-md border border-red-700 bg-red-950 px-2.5 py-1 font-mono text-[11px] font-black text-red-300">
            STATUS: REVIEW REQUIRED
          </span>
        </div>

        {isHistoricalReplay && (
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/20 px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider text-amber-300">
            <Clock className="h-3.5 w-3.5" />
            <span>Viewing Knowledge Available on {longDate(currentEpoch)}</span>
          </div>
        )}

        <div className="mb-4 rounded-xl border border-red-500/40 bg-red-950/40 p-3.5">
          <h2 className={`font-black tracking-tight text-white ${isDemoMode ? 'text-xl' : 'text-base'}`}>
            &quot;This decision is costing IBM $1.4M annually.&quot;
          </h2>
          <p className="mt-1 font-mono text-[11px] text-red-300">
            Target: {alert.decisionId} — {alert.decisionTitle}
          </p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-2 font-mono text-xs">
          <div className="rounded-lg border border-obsidian-800 bg-obsidian-950 p-2.5">
            <span className="mb-0.5 flex items-center gap-1 text-[10px] text-zinc-400"><Calendar className="h-3 w-3 text-zinc-500" /> Decision Date</span>
            <strong className="text-zinc-200">Dec 12, 2024</strong>
          </div>
          <div className="rounded-lg border border-obsidian-800 bg-obsidian-950 p-2.5">
            <span className="mb-0.5 flex items-center gap-1 text-[10px] text-red-400"><Clock className="h-3 w-3 text-red-500" /> Invalidated Date</span>
            <strong className="font-bold text-red-300">Mar 3, 2026</strong>
          </div>
        </div>

        <div className="mb-4 space-y-2.5">
          <div className="rounded-xl border border-obsidian-800 bg-obsidian-950/90 p-3">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-zinc-400">Broken 2024 Assumption (ASM-104-03)</span>
            <p className="text-xs font-medium leading-relaxed text-zinc-300">&quot;{alert.invalidatedAssumptionText}&quot;</p>
          </div>
          <div className="rounded-xl border border-red-500/50 bg-red-950/30 p-3">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-red-400">New 2026 Contradicting Evidence</span>
            <p className="text-xs font-semibold leading-relaxed text-red-200">&quot;{alert.contradictingEvidence.quote}&quot;</p>
            <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-zinc-400">
              <span className="flex items-center gap-1"><FileText className="h-3 w-3 text-red-400" /> {alert.contradictingEvidence.bulletinTitle}</span>
              <span className="font-bold text-red-400">Contradiction: 96.4%</span>
            </div>
          </div>
        </div>

        {selected}
        {usageBlock}
      </div>

      <div className="mt-4 border-t border-white/10 pt-2">
        <button
          type="button"
          onClick={() => setScheduled(true)}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-red-400/40 bg-red-600 px-4 py-3.5 font-mono text-xs font-bold text-white shadow-xl shadow-red-900/50 transition-all hover:bg-red-500 active:scale-[0.98]"
        >
          {scheduled ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
          <span>{scheduled ? 'ARB HEARING SCHEDULED' : 'REOPEN ARCHITECTURE REVIEW BOARD'}</span>
        </button>
        <p role="status" className="mt-2 min-h-4 font-mono text-[11px] text-emerald-300">
          {scheduled ? `ARB Hearing Scheduled: ${alert.recommendation.jiraSummary}` : ''}
        </p>
      </div>
    </div>
  );
};
