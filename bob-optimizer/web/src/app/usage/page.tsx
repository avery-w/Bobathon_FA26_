'use client';

import { useState } from 'react';
import { Settings as Cog } from 'lucide-react';
import { AppShell } from '@/components/navigation/AppShell';
import { TimeSlider } from '@/components/timeline/TimeSlider';
import { SettingsPanel } from '@/components/usage/SettingsPanel';
import { PromptOptimizer, PromptReview } from '@/components/usage/PromptLab';
import {
  BestPractices, CycleCard, EfficiencyCard, FolderCharts, Footnote, HabitsCard,
  QualityCharts, Recommendations, TopConversations, UsageKpis,
} from '@/components/usage/UsageSections';
import { Card, Empty } from '@/components/ui/Card';
import { UsageAlertList } from '@/components/drift/UsageAlertList';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { longDate } from '@/lib/dates';

/** Bob Analytics, scrubbed by the same time slider as the Decision Cockpit. */
export default function UsagePage() {
  const usage = useTimeMachineStore((s) => s.usage);
  const status = useTimeMachineStore((s) => s.usageStatus);
  const error = useTimeMachineStore((s) => s.usageError);
  const epoch = useTimeMachineStore((s) => s.currentEpoch);
  const isReplay = useTimeMachineStore((s) => s.isHistoricalReplay);
  const loadUsage = useTimeMachineStore((s) => s.loadUsage);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <AppShell>
      <TimeSlider />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Usage Lab</h1>
        <button
          type="button"
          aria-expanded={settingsOpen}
          onClick={() => setSettingsOpen((v) => !v)}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
        >
          <Cog className="h-4 w-4" /> Settings
        </button>
      </div>

      <SettingsPanel open={settingsOpen} onSaved={() => void loadUsage()} />

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {!usage && !error && <Empty msg={status === 'loading' || status === 'idle' ? 'Reading Bob usage...' : 'No usage loaded.'} />}

      {usage && (
        <>
          {isReplay && (
            <p className="rounded-lg border border-amber-500/40 bg-amber-950/20 p-3 text-sm text-amber-300">
              Showing Bob usage exactly as it was known on {longDate(epoch)}. Later conversations are hidden, and a
              task&apos;s final cost is only counted from its last update.
            </p>
          )}
          <UsageKpis d={usage} />
          <PromptOptimizer />
          <CycleCard d={usage} />
          <FolderCharts d={usage} />
          <QualityCharts d={usage} />
          <div className="grid gap-4 lg:grid-cols-2">
            <EfficiencyCard d={usage} />
            <Recommendations d={usage} />
          </div>
          <Card title="Usage drift: assumptions that no longer hold" note="The same drift engine as the Decision Cockpit, applied to how you use Bob.">
            <UsageAlertList />
          </Card>
          <PromptReview enabled={usage.prompt_review.enabled} items={usage.prompt_review.items} unit={usage.unit} />
          <HabitsCard d={usage} />
          <TopConversations d={usage} />
          <BestPractices d={usage} />
          <Footnote d={usage} />
        </>
      )}
    </AppShell>
  );
}
