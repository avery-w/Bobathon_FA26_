'use client';

import Link from 'next/link';
import { ArrowRight, GitBranch, Gauge } from 'lucide-react';
import { AppShell } from '@/components/navigation/AppShell';
import { ExecutiveKPIBar } from '@/components/dashboard/ExecutiveKPIBar';
import { TimeSlider } from '@/components/timeline/TimeSlider';
import { Card } from '@/components/ui/Card';
import { UsageAlertList } from '@/components/drift/UsageAlertList';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { demoDriftActive } from '@/lib/graph';

/** One place to see the whole picture: decisions and Bob usage for the same day. */
export default function HomePage() {
  const usage = useTimeMachineStore((s) => s.usage);
  const epoch = useTimeMachineStore((s) => s.currentEpoch);
  const decisionDrift = demoDriftActive(epoch);
  const top = usage?.recommendations.filter((r) => r.level === 'warn').slice(0, 3) ?? [];

  return (
    <AppShell>
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
        <h1 className="text-2xl font-bold tracking-tight">Make better decisions, and spend Bob credits better</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
          Bob Optimizer joins the Decision Time Machine with Bob Analytics. One time slider replays both:
          what your team knew when it chose, and how Bob was being used on that day. Usage that breaks a
          standing assumption raises drift alerts, the same way a new security bulletin does.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/cockpit" className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold hover:bg-blue-500">
            <GitBranch className="h-4 w-4" /> Open Decision Cockpit <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/usage" className="flex items-center gap-2 rounded-lg border border-teal-600 px-4 py-2 text-sm font-bold text-teal-300 hover:bg-teal-950/40">
            <Gauge className="h-4 w-4" /> Open Usage Lab <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <ExecutiveKPIBar />
      <TimeSlider />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Drift on this day" note="Decision drift and Bob usage drift, both for the date on the slider.">
          {decisionDrift && (
            <p className="mb-2 rounded-lg border border-red-500/50 bg-red-950/30 p-2.5 text-xs text-red-200">
              ADR-104 (Payment Platform Strategy) rests on an assumption that a March 2026 bulletin contradicts.{' '}
              <Link href="/cockpit" className="font-bold underline">Review in the Cockpit</Link>
            </p>
          )}
          <UsageAlertList />
        </Card>
        <Card title="Top things to act on" note="From your own Bob usage on the slider date.">
          {top.length === 0 ? (
            <p className="text-sm text-slate-400">Nothing urgent. See the <Link href="/usage" className="underline">Usage Lab</Link> for tips.</p>
          ) : (
            top.map((r) => (
              <article key={r.id} className="mb-2.5 rounded-md border border-slate-800 border-l-4 border-l-amber-500 bg-obsidian-950 px-3.5 py-2.5">
                <h3 className="text-sm font-semibold">{r.title}</h3>
                <p className="text-sm text-slate-300">{r.evidence}</p>
                <p className="text-sm"><strong>Try: </strong>{r.action}</p>
              </article>
            ))
          )}
        </Card>
      </div>
    </AppShell>
  );
}
