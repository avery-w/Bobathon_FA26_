'use client';

import { useEffect, useMemo } from 'react';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';
import { buildGraph } from '@/lib/graph';
import { buildUsageDrift } from '@/lib/usageDrift';

/** Loads usage whenever the locked epoch changes (debounced so dragging the slider is cheap). */
export function UsageBootstrap() {
  const epoch = useTimeMachineStore((s) => s.currentEpoch);
  const loadUsage = useTimeMachineStore((s) => s.loadUsage);
  useEffect(() => {
    const t = setTimeout(() => void loadUsage(), 200);
    return () => clearTimeout(t);
  }, [epoch, loadUsage]);
  return null;
}

/** The combined decision + usage graph for the locked epoch. */
export function useGraph() {
  const epoch = useTimeMachineStore((s) => s.currentEpoch);
  const today = useTimeMachineStore((s) => s.today);
  const usage = useTimeMachineStore((s) => s.usage);
  return useMemo(() => buildGraph(epoch, today, usage), [epoch, today, usage]);
}

export function useUsageAlerts() {
  const usage = useTimeMachineStore((s) => s.usage);
  return useMemo(() => (usage ? buildUsageDrift(usage) : []), [usage]);
}
