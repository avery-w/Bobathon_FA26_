'use client';

import { useMemo } from 'react';
import type { AnalyticsData } from '@/types/analytics';
import { Card, Empty, Kpi, type Tone } from '@/components/ui/Card';
import {
  ComponentBar, CycleChart, Donut, HBar, Heatmap, OUTCOME_COLORS, PALETTE, QUALITY_COLORS, StackedColumns,
} from '@/components/charts/Charts';
import { fmt, OUTCOME_LABELS, pct, short } from '@/lib/format';
import { shortDate } from '@/lib/dates';

/* ------------------------------------------------------------------ KPIs */
export function UsageKpis({ d }: { d: AnalyticsData }) {
  const c = d.cycle, e = d.efficiency, m = e.metrics, cmp = d.comparison;
  const tone: Tone = c.status === 'exceeded' || c.status === 'over_pace' ? 'bad' : c.status === 'on_track' ? 'good' : '';
  const projSub = c.budget
    ? c.status === 'exceeded'
      ? 'Budget used'
      : `${c.status === 'over_pace' ? 'Over' : 'Under'} budget of ${fmt(c.budget, 0)}${c.run_out_date ? ` - runs out ~${shortDate(c.run_out_date)}` : ''}`
    : 'Set a budget in settings';
  const effTone: Tone = e.score == null ? '' : e.score >= 75 ? 'good' : e.score >= 50 ? '' : 'bad';
  const cmpTone: Tone = cmp.delta_pct == null ? '' : cmp.delta_pct > 0.25 ? 'bad' : cmp.delta_pct < 0 ? 'good' : '';
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
      <Kpi label="Spent this cycle" value={fmt(c.spent)} sub={c.remaining != null ? `${fmt(Math.max(c.remaining, 0))} remaining` : d.unit} />
      <Kpi label="Projected by reset" value={fmt(c.projected)} sub={projSub} tone={tone} />
      <Kpi label="Days until reset" value={String(c.days_left)} sub={`Resets ${shortDate(c.end)}`} />
      <Kpi label="Efficiency score" value={e.score == null ? '-' : `${e.score}/100`} sub={e.score == null ? 'Not enough data' : 'See breakdown below'} tone={effTone} />
      <Kpi label="Avg per conversation" value={fmt(m.avg_cost_per_conversation)} sub={`${m.conversations_with_prompts} conversations`} />
      <Kpi label="One-shot rate" value={pct(m.one_shot_rate)} sub={`${pct(m.follow_up_rate)} follow-ups (cost signal, not a flaw)`} />
      <Kpi
        label="Vs last cycle"
        value={cmp.delta_pct == null ? '-' : `${cmp.delta_pct > 0 ? '+' : ''}${pct(cmp.delta_pct)}`}
        sub={cmp.delta_pct == null ? `No spend at this point in ${cmp.prev_label}` : `${fmt(cmp.same_point)} at this point in ${cmp.prev_label}`}
        tone={cmpTone}
      />
      <Kpi label="Usage streak" value={`${d.habits.current_streak} day${d.habits.current_streak === 1 ? '' : 's'}`} sub={`Longest ${d.habits.longest_streak}; ${d.habits.active_days} active days`} />
    </section>
  );
}

/* ------------------------------------------------------------------ cycle + folders */
export function CycleCard({ d }: { d: AnalyticsData }) {
  const c = d.cycle;
  return (
    <Card
      title="Credit cycle: spend before reset"
      note={`Cycle ${shortDate(c.start)} to ${shortDate(c.end)}. Day ${c.days_elapsed} of ${c.days_total}; average ${fmt(c.avg_daily)} per day.`}
    >
      <CycleChart cyc={c} />
    </Card>
  );
}

function useFolderPalette(d: AnalyticsData) {
  return useMemo(() => {
    const top = d.folders.filter((f) => f.cost > 0).slice(0, 6).map((f) => f.folder);
    const colors: Record<string, string> = {};
    top.forEach((f, i) => { colors[f] = PALETTE[i]; });
    colors.Other = PALETTE[6];
    const key = (f: string) => (top.includes(f) ? f : 'Other');
    const keys = [...top, ...(d.folders.some((f) => f.cost > 0 && !top.includes(f.folder)) ? ['Other'] : [])];
    return { colors, key, keys };
  }, [d.folders]);
}

export function FolderCharts({ d }: { d: AnalyticsData }) {
  const fp = useFolderPalette(d);
  const fold = (by: Record<string, number>) => {
    const values: Record<string, number> = {};
    for (const [f, v] of Object.entries(by)) values[fp.key(f)] = (values[fp.key(f)] || 0) + v;
    return values;
  };
  const daily = d.cycle.daily.map((x) => ({ label: shortDate(x.date).replace(/ /g, '\u00a0'), values: fold(x.by_folder) }));
  const cycles = d.cycles.map((cy) => ({ label: cy.label, values: fold(cy.by_folder) }));
  const colorOf = (k: string) => fp.colors[k];
  const labelOf = (k: string) => short(k, 30);
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Daily spend this cycle, by folder">
          <StackedColumns cats={daily} keys={fp.keys} colorOf={colorOf} labelOf={labelOf} yLabel={`${d.unit} per day`} />
        </Card>
        <Card title="Usage by folder (all time)">
          <HBar
            color="#3b82d4"
            unitLabel={`${d.unit} by working folder`}
            items={d.folders.filter((f) => f.cost > 0).slice(0, 10).map((f) => ({
              label: f.folder,
              value: f.cost,
              valueLabel: fmt(f.cost),
              title: `${f.folder}: ${fmt(f.cost)} across ${f.conversations} conversations, ${f.prompts} prompts`,
            }))}
          />
        </Card>
      </div>
      <Card title="Spend per credit cycle, by folder">
        <StackedColumns cats={cycles} keys={fp.keys} colorOf={colorOf} labelOf={labelOf} yLabel={`${d.unit} per credit cycle (resets on day ${d.settings.reset_day})`} />
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------ quality / outcomes / tools */
export function QualityCharts({ d }: { d: AnalyticsData }) {
  const pq = d.prompt_quality;
  const total = pq.buckets.reduce((a, b) => a + b.count, 0);
  const o = d.outcomes.totals;
  const outcomeSlices = (['one_shot', 'multi_turn', 'cancelled'] as const).map((k) => ({ label: OUTCOME_LABELS[k], value: o[k], color: OUTCOME_COLORS[k] }));
  const outcomeTotal = outcomeSlices.reduce((a, x) => a + x.value, 0);
  const keys = ['one_shot', 'multi_turn', 'cancelled'];
  return (
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Prompt quality">
          <Donut
            slices={pq.buckets.map((b, i) => ({ label: b.label, value: b.count, color: QUALITY_COLORS[i] }))}
            centerTop={pq.average == null ? '-' : pct(pq.average)}
            centerBottom={total ? 'avg quality' : ''}
          />
        </Card>
        <Card title="One-shot vs multi-turn">
          <Donut slices={outcomeSlices} centerTop={outcomeTotal ? pct(o.one_shot / outcomeTotal) : '-'} centerBottom={outcomeTotal ? 'one-shot' : ''} />
        </Card>
        <Card title="Most used tools">
          <HBar
            color="#7c5cd8"
            unitLabel="Tool calls"
            items={d.tools.slice(0, 8).map((t) => ({ label: t.tool, value: t.calls, valueLabel: `${t.calls}${t.errors ? ` (${t.errors} failed)` : ''}` }))}
          />
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Conversation outcomes by week">
          <StackedColumns
            cats={d.outcomes.weekly.map((w) => ({ label: shortDate(w.week).replace(/ /g, '\u00a0'), values: { one_shot: w.one_shot, multi_turn: w.multi_turn, cancelled: w.cancelled } }))}
            keys={keys}
            colorOf={(k) => OUTCOME_COLORS[k]}
            labelOf={(k) => OUTCOME_LABELS[k]}
            yLabel="Conversations per week (week starting)"
          />
        </Card>
        <Card title="Spend by mode">
          <HBar
            color="#2a9d8f"
            unitLabel={`${d.unit} by Bob mode`}
            items={d.modes.filter((x) => x.cost > 0 || x.prompts > 0).map((x) => ({ label: x.mode, value: x.cost, valueLabel: `${fmt(x.cost)} (${x.prompts} prompts)` }))}
          />
        </Card>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ efficiency, recommendations */
export function EfficiencyCard({ d }: { d: AnalyticsData }) {
  const e = d.efficiency;
  return (
    <Card title="Efficiency score">
      {e.score == null ? (
        <Empty msg="Not enough conversations yet." />
      ) : (
        <div className="flex flex-wrap items-start gap-6">
          <div className="min-w-[110px] text-center">
            <div className="text-5xl font-semibold leading-tight text-blue-400">{e.score}</div>
            <div className="text-xs text-slate-400">out of 100</div>
          </div>
          <div className="grid min-w-[260px] flex-1 gap-3">
            {e.components.map((c) => <ComponentBar key={c.key} c={c} />)}
          </div>
        </div>
      )}
    </Card>
  );
}

const REC_LABEL = { warn: 'Act on this', tip: 'Tip', good: 'Looking good' } as const;
const REC_BORDER = { warn: 'border-l-amber-500', tip: 'border-l-blue-500', good: 'border-l-emerald-500' } as const;

export function Recommendations({ d }: { d: AnalyticsData }) {
  return (
    <Card title="Recommendations for you">
      {d.recommendations.map((r) => (
        <article key={r.id} className={`mb-2.5 rounded-md border border-slate-800 border-l-4 bg-obsidian-950 px-3.5 py-2.5 ${REC_BORDER[r.level]}`}>
          <div className="text-[11px] uppercase tracking-wide text-slate-400">{REC_LABEL[r.level] ?? 'Tip'}</div>
          <h3 className="text-sm font-semibold">{r.title}</h3>
          <p className="text-sm text-slate-300">{r.evidence}</p>
          <p className="text-sm"><strong>Try: </strong>{r.action}</p>
        </article>
      ))}
    </Card>
  );
}

/* ------------------------------------------------------------------ habits, hygiene */
export function HabitsCard({ d }: { d: AnalyticsData }) {
  const hb = d.habits, hy = d.hygiene;
  const bits = [`${hb.active_days} active day${hb.active_days === 1 ? '' : 's'}`, `longest streak ${hb.longest_streak}`, `current streak ${hb.current_streak}`];
  if (hb.top20_share != null) bits.push(`top 20% of conversations = ${pct(hb.top20_share)} of spend`);
  if (hb.fixed_overhead_share != null) bits.push(`${pct(hb.fixed_overhead_share)} of context is fixed overhead (rules, tools, system)`);
  if (hy.prompts_with_secrets) bits.push(`${hy.prompts_with_secrets} prompt(s) may contain secrets`);
  const extra = [
    hb.resumed_after_gap ? `${hb.resumed_after_gap} conversation(s) resumed after a 24h+ gap` : null,
    hy.large_pastes ? `${hy.large_pastes} very long paste(s)` : null,
    ...hy.repeated.map((r) => `a request repeated ${r.count} times (#${r.id})`),
  ].filter((x): x is string => x !== null);
  return (
    <Card title="When you use Bob" note={`${bits.join(' | ')}. Hours are in your local time.`}>
      <Heatmap grid={hb.heatmap} />
      {extra.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold text-slate-200">Prompt hygiene and habits</h3>
          <ul className="mt-1 list-disc pl-5 text-sm text-slate-300">
            {extra.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ tables + practices */
export function TopConversations({ d }: { d: AnalyticsData }) {
  const rows = d.top_conversations;
  const snip = rows.some((c) => c.snippet);
  const head = ['Date', 'Folder', 'Mode', 'Prompts', 'Cost', 'Context tokens', 'Outcome', ...(snip ? ['Opening prompt'] : [])];
  return (
    <Card title="Costliest conversations">
      {!rows.length ? (
        <Empty msg="No conversations yet." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>{head.map((h) => <th key={h} scope="col" className="whitespace-nowrap border-b border-slate-800 px-2.5 py-1.5 text-left font-semibold text-slate-400">{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr key={`${c.date}-${i}`}>
                  <td className="whitespace-nowrap border-b border-slate-800 px-2.5 py-1.5">{shortDate(c.date)}</td>
                  <td className="whitespace-nowrap border-b border-slate-800 px-2.5 py-1.5" title={c.folder}>{short(c.folder, 34)}</td>
                  <td className="whitespace-nowrap border-b border-slate-800 px-2.5 py-1.5">{c.mode}</td>
                  <td className="whitespace-nowrap border-b border-slate-800 px-2.5 py-1.5">{c.prompts}</td>
                  <td className="whitespace-nowrap border-b border-slate-800 px-2.5 py-1.5">{fmt(c.cost)}</td>
                  <td className="whitespace-nowrap border-b border-slate-800 px-2.5 py-1.5">{c.context_tokens.toLocaleString('en-US')}</td>
                  <td className="whitespace-nowrap border-b border-slate-800 px-2.5 py-1.5">{OUTCOME_LABELS[c.outcome] ?? c.outcome}</td>
                  {snip && <td className="whitespace-nowrap border-b border-slate-800 px-2.5 py-1.5">{c.snippet ?? ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function BestPractices({ d }: { d: AnalyticsData }) {
  return (
    <Card title="Best practices for efficient Bob use">
      <ul className="list-disc pl-5 text-sm">
        {d.best_practices.map((p) => (
          <li key={p.title} className="mb-1.5"><strong>{p.title}</strong><span className="text-slate-400">{` - ${p.detail}`}</span></li>
        ))}
      </ul>
    </Card>
  );
}

export function Footnote({ d }: { d: AnalyticsData }) {
  return (
    <p className="text-xs leading-relaxed text-slate-400">
      {`Costs come from Bob's local database and are shown in ${d.unit}. If they differ from Bobalytics or the budget gauge, adjust the cost multiplier in settings. Prompt-quality and efficiency scores are heuristics, not measurements of outcomes. Each prompt check is tagged with its source: Bob docs, the IBM prompt engineering article, or a heuristic of this project. Numeric cut-offs and the efficiency weights are adjustable defaults, not documented values. Several follow-up turns can be deliberate (prompt chaining), so multi-turn is a cost signal, not a failure.`}
    </p>
  );
}

