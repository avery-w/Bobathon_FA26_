'use client';

import { Database, AlertTriangle, Scale, Clock, Wallet, Gauge, Target, TrendingUp } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { ADR_EPOCH, daysBetween } from '@/lib/dates';
import { demoDriftActive } from '@/lib/graph';
import { useUsageAlerts } from '@/lib/hooks';
import { fmt, pct } from '@/lib/format';

function Tile({
  label, value, extra, icon, labelClass = 'text-slate-400', box, iconBox, alert = false,
}: {
  label: string;
  value: string;
  extra?: ReactNode;
  icon: ReactNode;
  labelClass?: string;
  box?: string;
  iconBox: string;
  alert?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between rounded-xl px-[18px] py-3.5 transition-all ${
        box ?? 'border border-slate-800 bg-slate-900'
      } ${alert ? 'border-2 border-red-500/80 bg-red-950/40' : ''}`}
    >
      <div>
        <span className={`block font-mono text-[10px] uppercase ${labelClass}`}>{label}</span>
        <span className="flex items-center gap-1.5 font-mono text-xl font-bold text-white">
          {value}
          {extra}
        </span>
      </div>
      <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconBox}`}>{icon}</div>
    </div>
  );
}

/** Decision KPIs and Bob usage KPIs side by side, both for the locked epoch. */
export const ExecutiveKPIBar = () => {
  const currentEpoch = useTimeMachineStore((s) => s.currentEpoch);
  const usage = useTimeMachineStore((s) => s.usage);
  const usageAlerts = useUsageAlerts();

  const decisionDrift = demoDriftActive(currentEpoch);
  const driftCount = (decisionDrift ? 1 : 0) + usageAlerts.length;
  const critical = decisionDrift || usageAlerts.some((a) => a.severity === 'CRITICAL');
  const oldest = currentEpoch >= ADR_EPOCH ? `${daysBetween(ADR_EPOCH, currentEpoch)} Days` : '-';

  const c = usage?.cycle;
  const e = usage?.efficiency;

  return (
    <div className="mb-4 space-y-3.5">
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Tile
          label="Decisions Tracked"
          value="1,428"
          icon={<Database className="h-4 w-4" />}
          iconBox="border border-blue-700 bg-blue-900/40 text-blue-400"
        />
        <Tile
          label="Drift Alerts"
          labelClass="text-red-400"
          value={driftCount === 0 ? '0' : `${driftCount}${critical ? ' CRITICAL' : ''}`}
          extra={decisionDrift ? <span className="text-xs font-bold text-red-400">($1.4M)</span> : null}
          alert={driftCount > 0}
          icon={<AlertTriangle className="h-4 w-4" />}
          iconBox={driftCount > 0 ? 'bg-red-900 text-red-300' : 'bg-slate-800 text-slate-500'}
        />
        <Tile
          label="Active Reviews"
          value={decisionDrift ? '1 Scheduled' : '0 Scheduled'}
          icon={<Scale className="h-4 w-4" />}
          iconBox="border border-purple-700 bg-purple-900/40 text-purple-400"
        />
        <Tile
          label="Oldest Unreviewed"
          value={oldest}
          icon={<Clock className="h-4 w-4" />}
          iconBox="border border-amber-700 bg-amber-900/40 text-amber-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Tile
          label="Bob spend this cycle"
          value={c ? fmt(c.spent) : '-'}
          extra={c && usage ? <span className="text-xs font-normal text-slate-400">{usage.unit}</span> : null}
          icon={<Wallet className="h-4 w-4" />}
          iconBox="border border-teal-700 bg-teal-900/40 text-teal-300"
        />
        <Tile
          label="Projected by reset"
          value={c ? fmt(c.projected) : '-'}
          extra={c?.budget ? <span className="text-xs font-normal text-slate-400">of {fmt(c.budget, 0)}</span> : null}
          icon={<TrendingUp className="h-4 w-4" />}
          iconBox="border border-teal-700 bg-teal-900/40 text-teal-300"
        />
        <Tile
          label="Efficiency score"
          value={e?.score == null ? '-' : `${e.score}/100`}
          icon={<Gauge className="h-4 w-4" />}
          iconBox="border border-teal-700 bg-teal-900/40 text-teal-300"
        />
        <Tile
          label="One-shot rate"
          value={e ? pct(e.metrics.one_shot_rate) : '-'}
          icon={<Target className="h-4 w-4" />}
          iconBox="border border-teal-700 bg-teal-900/40 text-teal-300"
        />
      </div>
    </div>
  );
};
