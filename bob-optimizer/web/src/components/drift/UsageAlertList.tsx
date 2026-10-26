'use client';

import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { useUsageAlerts } from '@/lib/hooks';
import { fmt } from '@/lib/format';
import { SeverityBadge } from '@/components/ui/Card';

/** Bob usage drift alerts for the locked epoch. Shared by the Cockpit drift panel and the Usage Lab. */
export function UsageAlertList() {
  const alerts = useUsageAlerts();
  const usage = useTimeMachineStore((s) => s.usage);
  const status = useTimeMachineStore((s) => s.usageStatus);
  const error = useTimeMachineStore((s) => s.usageError);
  const unit = usage?.unit ?? 'Bobcoins';
  const loading = status === 'loading' || status === 'idle';

  if (error) {
    return (
      <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/30 p-2.5 text-xs text-red-300">
        Bob usage unavailable: {error}
      </p>
    );
  }
  if (alerts.length === 0) {
    return (
      <p className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-2.5 text-xs text-emerald-300">
        {loading ? 'Reading Bob usage...' : 'Every standing assumption about how Bob is used still holds.'}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {alerts.map((a) => (
        <li key={a.id} className="rounded-lg border border-slate-800 bg-obsidian-950 p-2.5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-white">{a.title}</span>
            <SeverityBadge severity={a.severity} />
          </div>
          <p className="text-[11px] text-slate-400">Assumption: {a.assumption}</p>
          <p className="mt-0.5 text-[11px] text-red-300">{a.evidence}</p>
          <p className="mt-0.5 text-[11px] text-slate-200"><strong>Try: </strong>{a.action}</p>
          {a.exposureBobcoins != null && a.exposureBobcoins > 0 && (
            <p className="mt-0.5 font-mono text-[10px] text-amber-400">Exposure: {fmt(a.exposureBobcoins)} {unit}</p>
          )}
        </li>
      ))}
    </ul>
  );
}
