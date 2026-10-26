import type { HistoricalMilestone } from '../types/decision.ts';
import { HISTORICAL_MILESTONES } from '../data/demoData.ts';
import { MIN_EPOCH, daysBetween } from './dates.ts';

export interface Marker extends HistoricalMilestone {
  /** Position on the slider track, 0 to 100. */
  percent: number;
}

/** Decision milestones plus the day Bob usage history begins, placed on the slider track. */
export function buildMarkers(firstUsage: string | null, today: string): Marker[] {
  const span = Math.max(daysBetween(MIN_EPOCH, today), 1);
  const list: HistoricalMilestone[] = [...HISTORICAL_MILESTONES];
  if (firstUsage) list.push({ date: firstUsage, label: 'Bob usage history begins', type: 'usage', nodeId: '' });
  return list
    .filter((m) => m.date >= MIN_EPOCH && m.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((m) => ({ ...m, percent: Math.min(100, Math.max(0, (daysBetween(MIN_EPOCH, m.date) / span) * 100)) }));
}
