import type { AnalyticsData } from '../types/analytics.ts';
import type { UsageDriftAlert } from '../types/decision.ts';
import { fmt, pct } from './format.ts';
import { shortDate } from './dates.ts';

/**
 * Turns live Bob usage into "decision drift" alerts: a standing assumption about how Bob is
 * used, the evidence that it no longer holds, and the recommended action.
 *
 * The thresholds below are this project's own defaults (they mirror the dashboard's tone
 * cut-offs), not documented Bob values.
 */
export const EFFICIENCY_ALERT_BELOW = 50;
export const TREND_MEDIUM_ABOVE = 0.25;
export const TREND_HIGH_ABOVE = 0.5;

const ORDER: Record<UsageDriftAlert['severity'], number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };

function action(d: AnalyticsData, id: string, fallback: string): string {
  return d.recommendations.find((r) => r.id === id)?.action ?? fallback;
}

export function buildUsageDrift(d: AnalyticsData): UsageDriftAlert[] {
  const alerts: UsageDriftAlert[] = [];
  const c = d.cycle;

  if (c.budget && c.status === 'exceeded') {
    alerts.push({
      id: 'USE-BUDGET',
      kind: 'budget',
      severity: 'CRITICAL',
      title: 'Monthly budget exhausted',
      assumption: `Spend stays within the ${fmt(c.budget, 0)} ${d.unit} monthly budget until credits reset.`,
      evidence: `${fmt(c.spent)} ${d.unit} spent with ${c.days_left} day${c.days_left === 1 ? '' : 's'} left in the cycle.`,
      action: action(d, 'budget_exceeded', 'Stop non-essential work until the cycle resets, or raise the budget.'),
      exposureBobcoins: Math.max(c.spent - c.budget, 0),
    });
  } else if (c.budget && c.status === 'over_pace') {
    const runOut = c.run_out_date ? `; credits run out around ${shortDate(c.run_out_date)}` : '';
    alerts.push({
      id: 'USE-BUDGET',
      kind: 'budget',
      severity: 'HIGH',
      title: 'On pace to exceed the budget',
      assumption: `Spend stays within the ${fmt(c.budget, 0)} ${d.unit} monthly budget until credits reset.`,
      evidence: `Projected ${fmt(c.projected)} ${d.unit} by reset against a budget of ${fmt(c.budget, 0)}${runOut}.`,
      action: action(d, 'over_pace', 'Slow down or split work across cheaper sessions.'),
      exposureBobcoins: Math.max(c.projected - c.budget, 0),
    });
  }

  const score = d.efficiency.score;
  if (score != null && score < EFFICIENCY_ALERT_BELOW) {
    const weakest = [...d.efficiency.components].sort((a, b) => a.value - b.value)[0];
    alerts.push({
      id: 'USE-EFFICIENCY',
      kind: 'efficiency',
      severity: 'HIGH',
      title: 'Efficiency score is low',
      assumption: 'Prompts are well-formed and conversations stay focused.',
      evidence: `Efficiency ${score}/100${weakest ? `; weakest area is "${weakest.label}" at ${weakest.value}%` : ''}.`,
      action:
        d.recommendations.find((r) => r.level === 'warn')?.action ??
        'Name the file or error, state the goal, and start a new task when the goal changes.',
      exposureBobcoins: null,
    });
  }

  const delta = d.comparison.delta_pct;
  if (delta != null && delta > TREND_MEDIUM_ABOVE) {
    alerts.push({
      id: 'USE-TREND',
      kind: 'trend',
      severity: delta > TREND_HIGH_ABOVE ? 'HIGH' : 'MEDIUM',
      title: 'Spend is well above last cycle',
      assumption: 'Spending stays steady from one credit cycle to the next.',
      evidence: `${pct(delta)} above ${d.comparison.prev_label} at the same point (${fmt(d.comparison.spent)} vs ${fmt(d.comparison.same_point)} ${d.unit}).`,
      action: action(d, 'up_vs_last_cycle', 'Check the costliest conversations for a runaway task.'),
      exposureBobcoins: Math.max(d.comparison.spent - d.comparison.same_point, 0),
    });
  }

  if (d.hygiene.prompts_with_secrets > 0) {
    const n = d.hygiene.prompts_with_secrets;
    alerts.push({
      id: 'USE-SECRETS',
      kind: 'secrets',
      severity: 'HIGH',
      title: 'Prompts may contain credentials',
      assumption: 'Prompts sent to Bob never contain passwords, keys or tokens.',
      evidence: `${n} prompt${n === 1 ? '' : 's'} matched a credential pattern. Detection is pattern-based and can miss some.`,
      action: action(d, 'secrets_in_prompts', 'Rotate anything that was pasted and refer to secrets by name.'),
      exposureBobcoins: null,
    });
  }

  return alerts.sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
