'use client';

import React from 'react';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { AlertOctagon, TrendingDown, CheckCircle, ArrowRight, ShieldAlert, FileText, Calendar, DollarSign, Clock } from 'lucide-react';

export const DriftPanel = () => {
  const { activeDriftAlert, isHistoricalReplay, triggerLiveDropSimulation, isSimulatingDrop, isDemoMode } = useTimeMachineStore();

  if (isHistoricalReplay) {
    return (
      <div className="w-full h-full p-6 bg-obsidian-900/95 rounded-2xl border border-amber-500/50 backdrop-blur-xl flex flex-col justify-between shadow-2xl transition-all duration-300">
        <div>
          {/* Prominent Historical Banner */}
          <div className="px-3.5 py-2 bg-amber-500/20 border border-amber-500/50 rounded-xl flex items-center gap-2.5 text-amber-300 mb-5 font-mono text-xs uppercase tracking-wider font-bold">
            <Clock className="w-4 h-4 animate-spin text-amber-400" />
            <span>Viewing Knowledge Available on Dec 12, 2024</span>
          </div>

          <h3 className={`font-bold text-white mb-2 tracking-tight ${isDemoMode ? 'text-2xl' : 'text-xl'}`}>
            ADR-104: Payment Platform Strategy
          </h3>
          <p className="text-xs text-zinc-300 mb-6 leading-relaxed">
            Historical isolation active. All subsequent 2025 CVEs, outage metrics, and 2026 security certifications are purged from memory to eliminate hindsight bias.
          </p>

          <div className="space-y-3.5">
            <div className="p-4 bg-obsidian-950/90 rounded-xl border border-obsidian-800">
              <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">Foundational Constraint (2024)</span>
              <p className="text-xs text-zinc-200 leading-relaxed font-medium">
                AWS EKS rejected because it lacked FedRAMP High zero-trust certification required for the Federal Banking RFP.
              </p>
            </div>
            <div className="p-4 bg-emerald-950/30 rounded-xl border border-emerald-500/40">
              <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider block mb-1">Ratified Selection</span>
              <p className="text-sm text-emerald-300 font-bold font-mono">
                Red Hat OpenShift ($1.8M / Year)
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={triggerLiveDropSimulation}
          disabled={isSimulatingDrop}
          className="w-full py-4 px-4 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold font-mono rounded-xl transition-all shadow-xl shadow-blue-900/30 flex items-center justify-center gap-2 border border-blue-400/30 active:scale-[0.98]"
        >
          {isSimulatingDrop ? (
            <span className="animate-pulse flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              Ingesting Mar 3, 2026 AWS Security Bulletin...
            </span>
          ) : (
            <>
              <span>Simulate Live 2026 Bulletin Ingestion</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    );
  }

  if (!activeDriftAlert) return null;

  return (
    <div className="w-full h-full p-6 bg-obsidian-900/95 rounded-2xl border-2 border-red-500/70 backdrop-blur-xl flex flex-col justify-between shadow-2xl relative overflow-hidden transition-all duration-300">
      {/* Laser Glow top border */}
      <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-amber-500 to-red-600 animate-pulse" />

      <div>
        {/* Header Alert Card - Hero Message */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-red-400 tracking-wider">
            <AlertOctagon className="w-5 h-5 text-red-500 animate-bounce" />
            <span>CRITICAL DECISION DRIFT</span>
          </div>
          <span className="px-2.5 py-1 bg-red-950 text-red-300 border border-red-700 rounded-md text-[11px] font-mono font-black">
            STATUS: REVIEW REQUIRED
          </span>
        </div>

        {/* The Hero Statement */}
        <div className="mb-4 p-3.5 bg-red-950/40 border border-red-500/40 rounded-xl">
          <h2 className={`font-black text-white tracking-tight ${isDemoMode ? 'text-xl' : 'text-base'}`}>
            &quot;This decision is costing IBM $1.4M annually.&quot;
          </h2>
          <p className="text-[11px] font-mono text-red-300 mt-1">
            Target: {activeDriftAlert.decisionId} — {activeDriftAlert.decisionTitle}
          </p>
        </div>

        {/* 2-Second Executive Summary Grid */}
        <div className="grid grid-cols-2 gap-2 mb-4 text-xs font-mono">
          <div className="p-2.5 bg-obsidian-950 rounded-lg border border-obsidian-800">
            <span className="text-[10px] text-zinc-400 block flex items-center gap-1">
              <Calendar className="w-3 h-3 text-zinc-500" /> Decision Date
            </span>
            <strong className="text-zinc-200">Dec 12, 2024</strong>
          </div>
          <div className="p-2.5 bg-obsidian-950 rounded-lg border border-obsidian-800">
            <span className="text-[10px] text-red-400 block flex items-center gap-1">
              <Clock className="w-3 h-3 text-red-500" /> Invalidated Date
            </span>
            <strong className="text-red-300 font-bold">Mar 3, 2026</strong>
          </div>
        </div>

        {/* Invalidation Breakdown */}
        <div className="space-y-2.5 mb-4">
          <div className="p-3 bg-obsidian-950/90 rounded-xl border border-obsidian-800">
            <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider block mb-1">
              Broken 2024 Assumption (ASM-104-03)
            </span>
            <p className="text-xs text-zinc-300 font-medium leading-relaxed">
              &quot;{activeDriftAlert.invalidatedAssumptionText}&quot;
            </p>
          </div>

          <div className="p-3 bg-red-950/30 rounded-xl border border-red-500/50">
            <span className="text-[10px] font-mono text-red-400 uppercase tracking-wider block mb-1">
              New 2026 Contradicting Evidence
            </span>
            <p className="text-xs text-red-200 font-semibold leading-relaxed">
              &quot;{activeDriftAlert.contradictingEvidence.quote}&quot;
            </p>
            <div className="mt-1.5 flex items-center justify-between text-[10px] font-mono text-zinc-400">
              <span className="flex items-center gap-1"><FileText className="w-3 h-3 text-red-400" /> {activeDriftAlert.contradictingEvidence.bulletinTitle}</span>
              <span className="text-red-400 font-bold">Contradiction: 96.4%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Recommended Action Button */}
      <div className="pt-2 border-t border-white/10">
        <button
          onClick={() => alert(`ARB Hearing Scheduled: ${activeDriftAlert.recommendation.jiraSummary}`)}
          className="w-full py-3.5 px-4 bg-red-600 hover:bg-red-500 text-white text-xs font-bold font-mono rounded-xl transition-all shadow-xl shadow-red-900/50 flex items-center justify-center gap-2 border border-red-400/40 active:scale-[0.98]"
        >
          <CheckCircle className="w-4 h-4" />
          <span>REOPEN ARCHITECTURE REVIEW BOARD</span>
        </button>
      </div>
    </div>
  );
};
