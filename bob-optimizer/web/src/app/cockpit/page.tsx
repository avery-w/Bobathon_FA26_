'use client';

import { AppShell } from '@/components/navigation/AppShell';
import { ExecutiveKPIBar } from '@/components/dashboard/ExecutiveKPIBar';
import { TimeSlider } from '@/components/timeline/TimeSlider';
import { DecisionGraph } from '@/components/canvas/DecisionGraph';
import { DriftPanel } from '@/components/drift/DriftPanel';

/** Decision Time Machine, with Bob usage woven into the graph, KPIs and drift alerts. */
export default function CockpitPage() {
  return (
    <AppShell>
      <ExecutiveKPIBar />
      <TimeSlider />
      <div className="grid min-h-[620px] flex-1 grid-cols-1 gap-4 lg:grid-cols-[7fr_5fr]">
        <div className="min-h-[520px]"><DecisionGraph /></div>
        <div className="min-h-[520px]"><DriftPanel /></div>
      </div>
    </AppShell>
  );
}
