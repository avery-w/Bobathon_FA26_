import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AnalyticsData } from '../types/analytics.ts';
import { buildUsageDrift } from './usageDrift.ts';
import { buildGraph, demoDriftActive } from './graph.ts';

function sample(over: Partial<AnalyticsData> = {}): AnalyticsData {
  const base = {
    generated_at: '2026-10-26T10:00:00',
    unit: 'Bobcoins',
    data_range: { first: '2026-08-01', last: '2026-10-25' },
    settings: { reset_day: 1, monthly_budget: null, cost_multiplier: 1 },
    totals: { cost: 40, conversations: 6, prompts: 12, folders: 2 },
    cycle: {
      start: '2026-10-01', end: '2026-11-01', days_total: 31, days_elapsed: 26, days_left: 5,
      spent: 30, budget: null, remaining: null, avg_daily: 1.15, projected: 35.8,
      run_out_date: null, status: 'no_budget', daily: [],
    },
    cycles: [],
    folders: [
      { folder: '~/alpha', cost: 25, conversations: 3, prompts: 6, last_used: '2026-10-25', cost_per_conversation: 8.3 },
      { folder: '~/beta', cost: 15, conversations: 3, prompts: 6, last_used: '2026-10-20', cost_per_conversation: 5 },
    ],
    modes: [],
    tools: [],
    outcomes: { totals: { one_shot: 3, multi_turn: 3, cancelled: 0, empty: 0 }, weekly: [] },
    prompt_quality: { average: 0.6, buckets: [] },
    efficiency: {
      score: 80,
      components: [{ key: 'prompt_quality', label: 'Opening prompt quality', value: 60, weight: 0.35, detail: '' }],
      metrics: {} as AnalyticsData['efficiency']['metrics'],
    },
    top_conversations: [],
    conversations: [
      { id: 'a1', date: '2026-08-02', folder: '~/alpha', mode: 'agent', prompts: 2, cost: 10, outcome: 'multi_turn', quality: 0.25, context_tokens: 1, subagents: 1 },
      { id: 'a2', date: '2026-10-10', folder: '~/alpha', mode: 'agent', prompts: 1, cost: 15, outcome: 'one_shot', quality: 0.75, context_tokens: 1, subagents: 0 },
      { id: 'b1', date: '2026-10-20', folder: '~/beta', mode: 'plan', prompts: 1, cost: 15, outcome: 'one_shot', quality: 1, context_tokens: 1, subagents: 0 },
    ],
    recommendations: [],
    habits: { heatmap: [], active_days: 5, longest_streak: 2, current_streak: 1, resumed_after_gap: 0, top20_share: null, fixed_overhead_share: null },
    comparison: { spent: 30, same_point: 28, prev_label: 'Sep 2026', delta_pct: 0.07 },
    hygiene: { prompts_with_secrets: 0, repeated: [], large_pastes: 0 },
    prompt_review: { enabled: false, items: [] },
    best_practices: [],
  } as AnalyticsData;
  return { ...base, ...over };
}

test('healthy usage raises no drift alerts', () => {
  assert.deepEqual(buildUsageDrift(sample()), []);
});

test('an exceeded budget is critical and quantifies the overshoot', () => {
  const d = sample();
  d.cycle = { ...d.cycle, budget: 25, status: 'exceeded', remaining: -5 };
  const [a] = buildUsageDrift(d);
  assert.equal(a.kind, 'budget');
  assert.equal(a.severity, 'CRITICAL');
  assert.equal(a.exposureBobcoins, 5);
});

test('projected overspend is high severity', () => {
  const d = sample();
  d.cycle = { ...d.cycle, budget: 30, status: 'over_pace', projected: 36, run_out_date: '2026-10-30' };
  const [a] = buildUsageDrift(d);
  assert.equal(a.severity, 'HIGH');
  assert.equal(a.exposureBobcoins, 6);
  assert.match(a.evidence, /Oct 30/);
});

test('low efficiency, spend growth and secrets each raise their own alert, most severe first', () => {
  const d = sample();
  d.efficiency = { ...d.efficiency, score: 30 };
  d.comparison = { ...d.comparison, delta_pct: 0.6 };
  d.hygiene = { ...d.hygiene, prompts_with_secrets: 2 };
  d.cycle = { ...d.cycle, budget: 25, status: 'exceeded' };
  const kinds = buildUsageDrift(d).map((a) => a.kind);
  assert.deepEqual(kinds[0], 'budget');
  assert.deepEqual([...kinds].sort(), ['budget', 'efficiency', 'secrets', 'trend']);
});

test('trend severity depends on how far above last cycle spend is', () => {
  const d = sample();
  d.comparison = { ...d.comparison, delta_pct: 0.3 };
  assert.equal(buildUsageDrift(d)[0].severity, 'MEDIUM');
  d.comparison = { ...d.comparison, delta_pct: 0.9 };
  assert.equal(buildUsageDrift(d)[0].severity, 'HIGH');
});

test('the graph without usage data is exactly the decision history', () => {
  const g = buildGraph('2026-10-26', '2026-10-26', null);
  assert.equal(g.nodes.length, 7);
  assert.equal(g.edges.length, 6);
  assert.equal(g.usageAlerts.length, 0);
});

test('replaying a past epoch hides later decisions (no hindsight)', () => {
  const g = buildGraph('2024-12-12', '2026-10-26', null);
  assert.equal(g.nodes.some((n) => n.id === 'node-evidence-2026'), false);
  assert.equal(g.nodes.some((n) => n.id === 'node-decision-1'), true);
  assert.equal(demoDriftActive('2024-12-12'), false);
  assert.equal(demoDriftActive('2026-03-03'), true);
});

test('usage nodes join the decision graph and link folder to conversation', () => {
  const g = buildGraph('2026-10-26', '2026-10-26', sample());
  const ids = new Set(g.nodes.map((n) => n.id));
  assert.ok(g.nodes.some((n) => n.type === 'folder'));
  assert.ok(g.nodes.some((n) => n.type === 'conversation'));
  assert.ok(g.nodes.some((n) => n.id === 'node-decision-1'), 'decision history is kept');
  for (const e of g.edges) assert.ok(ids.has(e.source) && ids.has(e.target), `dangling edge ${e.id}`);
  assert.equal(new Set(g.nodes.map((n) => n.id)).size, g.nodes.length, 'node ids are unique');
});

test('usage conversations after the epoch are not shown', () => {
  const g = buildGraph('2026-09-01', '2026-10-26', sample());
  const convs = g.nodes.filter((n) => n.type === 'conversation');
  assert.equal(convs.length, 1);
  assert.ok(convs.every((n) => n.timestamp <= '2026-09-01T23:59:59Z'));
});

test('a usage alert links its evidence conversation to the broken assumption', () => {
  const d = sample();
  d.cycle = { ...d.cycle, budget: 25, status: 'exceeded' };
  const g = buildGraph('2026-10-26', '2026-10-26', d);
  const alert = g.nodes.find((n) => n.id === 'usage-alert-USE-BUDGET');
  assert.ok(alert);
  assert.equal(alert.status, 'invalidated');
  assert.ok(g.edges.some((e) => e.target === alert.id && e.style?.stroke === '#EF4444'));
});

test('graph size stays bounded however much history exists', () => {
  const d = sample();
  d.conversations = Array.from({ length: 40 }, (_, i) => ({
    id: `c${i}`, date: '2026-10-01', folder: `~/f${i % 9}`, mode: 'agent', prompts: 1, cost: i + 1,
    outcome: 'one_shot' as const, quality: 0.5, context_tokens: 1, subagents: 0,
  }));
  d.folders = Array.from({ length: 9 }, (_, i) => ({ folder: `~/f${i}`, cost: i, conversations: 4, prompts: 4, last_used: null, cost_per_conversation: 1 }));
  const g = buildGraph('2026-10-26', '2026-10-26', d);
  assert.ok(g.nodes.length <= 7 + 3 * 4 + 4);
});
