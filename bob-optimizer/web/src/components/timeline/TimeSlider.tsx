'use client';

import { useMemo } from 'react';
import { History } from 'lucide-react';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { ADR_EPOCH, MIN_EPOCH, addDays, daysBetween, longDate } from '@/lib/dates';
import { buildMarkers } from '@/lib/timeline';
import { demoDriftActive } from '@/lib/graph';
import { useUsageAlerts } from '@/lib/hooks';
import { fmt } from '@/lib/format';

const MARKER_COLOR = { incident: '#FB923C', decision: '#C084FC', drift: '#F87171', usage: '#2A9D8F' } as const;

/**
 * One slider for the whole app. Moving it replays both the decision history and the Bob
 * usage known on that day (spend, efficiency, alerts), with later data hidden.
 */
export const TimeSlider = () => {
  const today = useTimeMachineStore((s) => s.today);
  const currentEpoch = useTimeMachineStore((s) => s.currentEpoch);
  const isHistoricalReplay = useTimeMachineStore((s) => s.isHistoricalReplay);
  const usage = useTimeMachineStore((s) => s.usage);
  const setEpoch = useTimeMachineStore((s) => s.setEpoch);
  const resetTo2024 = useTimeMachineStore((s) => s.resetTo2024);
  const resetToPresent = useTimeMachineStore((s) => s.resetToPresent);
  const usageAlerts = useUsageAlerts();

  const span = Math.max(daysBetween(MIN_EPOCH, today), 1);
  const value = daysBetween(MIN_EPOCH, currentEpoch);
  const first = usage?.data_range.first ?? null;
  const markers = useMemo(() => buildMarkers(first, today), [first, today]);

  const accent = isHistoricalReplay ? '#F59E0B' : '#3B82F6';
  const decisionDrift = demoDriftActive(currentEpoch);

  return (
    <div
      className="w-full rounded-2xl p-4 shadow-2xl transition-all"
      style={{
        border: isHistoricalReplay ? '2px solid rgba(245, 158, 11, 0.6)' : '1px solid #1E293B',
        backgroundColor: isHistoricalReplay ? 'rgba(69, 26, 3, 0.4)' : '#0F172A',
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5" style={{ color: accent }} />
          <span className="text-[13px] font-bold uppercase tracking-wider text-slate-200">
            {isHistoricalReplay ? 'Historical Replay Mode (Zero Hindsight)' : 'Present Day System State'}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={resetTo2024}
            className="cursor-pointer rounded-lg border px-3 py-1.5 font-mono text-[11px] font-bold"
            style={{
              borderColor: currentEpoch === ADR_EPOCH ? '#F59E0B' : '#334155',
              backgroundColor: currentEpoch === ADR_EPOCH ? '#F59E0B' : '#1E293B',
              color: currentEpoch === ADR_EPOCH ? '#000' : '#CBD5E1',
            }}
          >
            Dec 12, 2024 (ADR Vote)
          </button>
          <button
            type="button"
            onClick={resetToPresent}
            className="cursor-pointer rounded-lg border px-3 py-1.5 font-mono text-[11px] font-bold text-white"
            style={{
              borderColor: currentEpoch === today ? '#3B82F6' : '#334155',
              backgroundColor: currentEpoch === today ? '#2563EB' : '#1E293B',
            }}
          >
            Today ({longDate(today)})
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] text-slate-500">Nov 2024</span>
          <input
            type="range"
            aria-label="Scrub the app through time"
            aria-valuetext={longDate(currentEpoch)}
            min={0}
            max={span}
            step={1}
            value={value}
            onChange={(e) => setEpoch(addDays(MIN_EPOCH, Number(e.target.value)))}
            className="h-2 w-full cursor-pointer"
            style={{ accentColor: accent }}
          />
          <span className="whitespace-nowrap font-mono text-[11px] text-slate-500">Today</span>
        </div>
        {/* Milestone ticks, aligned to the slider track between the two end labels */}
        <div className="relative mx-[84px] mt-1 h-4" aria-hidden="true">
          {markers.map((m) => (
            <span
              key={`${m.date}-${m.label}`}
              title={`${longDate(m.date)}: ${m.label}`}
              className="absolute top-0 h-3 w-3 -translate-x-1/2 rotate-45 rounded-[2px]"
              style={{ left: `${m.percent}%`, backgroundColor: MARKER_COLOR[m.type] }}
            />
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-xs">
        <span className="text-slate-400">
          Scrubbed Epoch: <strong className="text-[13px] text-white">{currentEpoch}</strong>
          {usage && (
            <span className="ml-3 text-teal-400">
              Bob usage then: {fmt(usage.totals.cost)} {usage.unit} across {usage.totals.conversations} conversations
            </span>
          )}
        </span>
        {isHistoricalReplay ? (
          <span className="font-bold text-amber-400">Later decisions, bulletins and Bob usage are purged from context</span>
        ) : decisionDrift || usageAlerts.length ? (
          <span className="font-bold text-red-400">
            {decisionDrift ? 'Decision drift active ($1.4M exposure)' : ''}
            {decisionDrift && usageAlerts.length ? ' + ' : ''}
            {usageAlerts.length ? `${usageAlerts.length} usage alert${usageAlerts.length === 1 ? '' : 's'}` : ''}
          </span>
        ) : (
          <span className="font-bold text-emerald-400">No drift detected</span>
        )}
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        The Bob database starts {first ? longDate(first) : 'when you first used Bob'}; scrubbing earlier shows only the sample decision history.
      </p>
    </div>
  );
};
