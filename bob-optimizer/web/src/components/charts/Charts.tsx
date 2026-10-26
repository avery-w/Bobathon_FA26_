import type { ReactNode } from 'react';
import type { Cycle, EfficiencyComponent } from '@/types/analytics';
import { fmt, niceMax, pct, short } from '@/lib/format';
import { addDays, shortDate } from '@/lib/dates';
import { Empty } from '@/components/ui/Card';

export const PALETTE = ['#3b82d4', '#7c5cd8', '#2a9d8f', '#e9a23b', '#d1495b', '#5c7a99', '#8a8f98'];
export const OUTCOME_COLORS: Record<string, string> = { one_shot: '#2a9d8f', multi_turn: '#3b82d4', cancelled: '#d1495b' };
export const QUALITY_COLORS = ['#2a9d8f', '#3b82d4', '#e9a23b', '#d1495b'];
const AXIS = '#94a3b8';
const GRID = '#1e293b';
const LABEL = '#e2e8f0';

function Svg({ w, h, label, children }: { w: number; h: number; label: string; children: ReactNode }) {
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="block h-auto w-full">
      {children}
    </svg>
  );
}

export function Legend({ items }: { items: [string, string][] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1 text-xs text-slate-400">
      {items.map(([label, color]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs text-slate-400">{children}</p>;
}

export interface BarItem {
  label: string;
  value: number;
  valueLabel: string;
  title?: string;
}

export function HBar({ items, color, unitLabel }: { items: BarItem[]; color: string; unitLabel?: string }) {
  if (!items.length) return <Empty msg="No data yet." />;
  const rowH = 30, left = 150, right = 90, w = 560;
  const max = Math.max(...items.map((i) => i.value), 1e-9);
  return (
    <>
      <Svg w={w} h={items.length * rowH + 8} label="Bar chart">
        {items.map((it, i) => {
          const y = i * rowH + 4;
          const bw = Math.max(2, ((w - left - right) * it.value) / max);
          return (
            <g key={`${it.label}-${i}`}>
              <text x={left - 8} y={y + 17} textAnchor="end" fontSize={12} fill={LABEL}>
                {short(it.label, 22)}
                <title>{it.label}</title>
              </text>
              <rect x={left} y={y + 3} width={bw} height={rowH - 10} rx={3} fill={color}>
                <title>{it.title ?? `${it.label}: ${it.valueLabel}`}</title>
              </rect>
              <text x={left + bw + 6} y={y + 17} fontSize={12} fill={AXIS}>
                {it.valueLabel}
              </text>
            </g>
          );
        })}
      </Svg>
      {unitLabel && <Note>{unitLabel}</Note>}
    </>
  );
}

export interface StackCategory {
  label: string;
  values: Record<string, number>;
}

export function StackedColumns({
  cats,
  keys,
  colorOf,
  labelOf,
  yLabel,
}: {
  cats: StackCategory[];
  keys: string[];
  colorOf: (k: string) => string;
  labelOf: (k: string) => string;
  yLabel?: string;
}) {
  const totals = cats.map((c) => keys.reduce((a, k) => a + (c.values[k] || 0), 0));
  if (!cats.length || !totals.some((t) => t > 0)) return <Empty msg="No data yet." />;
  const w = 560, hgt = 260, l = 46, r = 10, t = 10, b = 36;
  const ymax = niceMax(Math.max(...totals));
  const plotH = hgt - t - b, plotW = w - l - r;
  const slot = plotW / cats.length;
  const bw = Math.min(46, slot * 0.7);
  const every = Math.ceil(cats.length / 12);
  const live = keys.filter((k) => cats.some((c) => (c.values[k] || 0) > 0));
  return (
    <>
      <Svg w={w} h={hgt} label="Stacked column chart">
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (ymax * i) / 4, y = t + plotH - (plotH * i) / 4;
          return (
            <g key={i}>
              <line x1={l} x2={w - r} y1={y} y2={y} stroke={GRID} />
              <text x={l - 6} y={y + 4} textAnchor="end" fontSize={11} fill={AXIS}>
                {fmt(v, v < 10 ? 1 : 0)}
              </text>
            </g>
          );
        })}
        {cats.map((c, i) => {
          const x = l + slot * i + (slot - bw) / 2;
          let acc = 0;
          return (
            <g key={`${c.label}-${i}`}>
              {keys.map((k) => {
                const v = c.values[k] || 0;
                if (!(v > 0)) return null;
                const hh = (plotH * v) / ymax;
                const y = t + plotH - (plotH * (acc + v)) / ymax;
                acc += v;
                return (
                  <rect key={k} x={x} y={y} width={bw} height={Math.max(hh, 0.5)} fill={colorOf(k)}>
                    <title>{`${c.label} - ${labelOf(k)}: ${fmt(v, 2)}`}</title>
                  </rect>
                );
              })}
              {i % every === 0 && (
                <text x={x + bw / 2} y={hgt - 16} textAnchor="middle" fontSize={11} fill={AXIS}>
                  {c.label}
                </text>
              )}
            </g>
          );
        })}
      </Svg>
      <Legend items={live.map((k) => [labelOf(k), colorOf(k)])} />
      {yLabel && <Note>{yLabel}</Note>}
    </>
  );
}

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function Donut({ slices, centerTop, centerBottom }: { slices: Slice[]; centerTop: string; centerBottom: string }) {
  const total = slices.reduce((a, x) => a + x.value, 0);
  if (!(total > 0)) return <Empty msg="No data yet." />;
  const cx = 100, cy = 100, R = 80, r = 52;
  const live = slices.filter((x) => x.value > 0);
  let ang = -Math.PI / 2;
  const paths = live.map((sl) => {
    const frac = sl.value / total;
    const a2 = ang + (live.length === 1 ? Math.PI * 2 - 0.0001 : frac * Math.PI * 2);
    const p = (a: number, rad: number): [number, number] => [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
    const [x1, y1] = p(ang, R), [x2, y2] = p(a2, R), [x3, y3] = p(a2, r), [x4, y4] = p(ang, r);
    const large = a2 - ang > Math.PI ? 1 : 0;
    const d = `M${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
    ang = a2;
    return (
      <path key={sl.label} d={d} fill={sl.color}>
        <title>{`${sl.label}: ${sl.value} (${pct(frac)})`}</title>
      </path>
    );
  });
  return (
    <>
      <div className="mx-auto max-w-[210px]">
        <Svg w={200} h={200} label="Donut chart">
          {paths}
          <text x={cx} y={cy + 2} textAnchor="middle" fontSize={24} fontWeight={600} fill="#f8fafc">
            {centerTop}
          </text>
          <text x={cx} y={cy + 20} textAnchor="middle" fontSize={11} fill={AXIS}>
            {centerBottom}
          </text>
        </Svg>
      </div>
      <Legend items={slices.map((x) => [`${x.label} (${x.value})`, x.color])} />
    </>
  );
}

export function CycleChart({ cyc }: { cyc: Cycle }) {
  const w = 760, hgt = 300, l = 52, r = 16, t = 14, b = 34;
  const n = cyc.days_total;
  const ymax = niceMax(Math.max(cyc.spent, cyc.projected, cyc.budget || 0) * 1.05);
  const plotW = w - l - r, plotH = hgt - t - b;
  const X = (day: number) => l + (plotW * day) / n;
  const Y = (v: number) => t + plotH - (plotH * v) / ymax;
  const pts: [number, number][] = [[0, 0], ...cyc.daily.map((d, i): [number, number] => [i + 1, d.cumulative])];
  const [ld, lv] = pts[pts.length - 1];
  const area = `M${X(0)} ${Y(0)} ` + pts.map(([d, v]) => `L${X(d)} ${Y(v)}`).join(' ') + ` L${X(ld)} ${Y(0)} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * n));
  const legend: [string, string][] = [['Spent so far', '#3b82d4'], ['Projected to reset', '#7c5cd8']];
  if (cyc.budget) legend.push(['Budget', '#d1495b'], ['Even pace', '#8a8f98']);
  return (
    <>
      <Svg w={w} h={hgt} label="Cumulative spend across the credit cycle">
        {[0, 1, 2, 3, 4].map((i) => {
          const v = (ymax * i) / 4;
          return (
            <g key={i}>
              <line x1={l} x2={w - r} y1={Y(v)} y2={Y(v)} stroke={GRID} />
              <text x={l - 6} y={Y(v) + 4} textAnchor="end" fontSize={11} fill={AXIS}>
                {fmt(v, v < 10 ? 1 : 0)}
              </text>
            </g>
          );
        })}
        {ticks.map((d) => (
          <text key={d} x={X(d)} y={hgt - 12} textAnchor={d === 0 ? 'start' : d === n ? 'end' : 'middle'} fontSize={11} fill={AXIS}>
            {d === n ? 'Reset' : shortDate(addDays(cyc.start, d))}
          </text>
        ))}
        {cyc.budget ? (
          <>
            <line x1={l} x2={w - r} y1={Y(cyc.budget)} y2={Y(cyc.budget)} stroke="#d1495b" strokeDasharray="6 4" />
            <text x={w - r} y={Y(cyc.budget) - 5} textAnchor="end" fontSize={11} fill="#d1495b">
              {`Budget ${fmt(cyc.budget, 0)}`}
            </text>
            <line x1={X(0)} y1={Y(0)} x2={X(n)} y2={Y(cyc.budget)} stroke="#8a8f98" strokeDasharray="2 4" />
          </>
        ) : null}
        <path d={area} fill="#3b82d4" fillOpacity={0.15} />
        <polyline points={pts.map(([d, v]) => `${X(d)},${Y(v)}`).join(' ')} fill="none" stroke="#3b82d4" strokeWidth={2.5} />
        {ld < n && <line x1={X(ld)} y1={Y(lv)} x2={X(n)} y2={Y(cyc.projected)} stroke="#7c5cd8" strokeWidth={2} strokeDasharray="6 4" />}
        {cyc.daily.map((d, i) => (
          <circle key={d.date} cx={X(i + 1)} cy={Y(d.cumulative)} r={3} fill="#3b82d4">
            <title>{`${shortDate(d.date)}: ${fmt(d.cumulative)} cumulative (+${fmt(d.cost)} that day)`}</title>
          </circle>
        ))}
        <circle cx={X(ld)} cy={Y(lv)} r={5} fill="#3b82d4" />
      </Svg>
      <Legend items={legend} />
    </>
  );
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(...grid.flat(), 0);
  if (!(max > 0)) return <Empty msg="No prompts yet." />;
  const cell = 22, left = 40, top = 6, w = left + 24 * cell + 4, hgt = top + 7 * cell + 22;
  return (
    <Svg w={w} h={hgt} label="Prompts by weekday and hour">
      {grid.map((row, d) => (
        <g key={DAYS[d]}>
          <text x={left - 6} y={top + d * cell + 15} textAnchor="end" fontSize={11} fill={AXIS}>
            {DAYS[d]}
          </text>
          {row.map((v, hr) => (
            <rect
              key={hr}
              x={left + hr * cell}
              y={top + d * cell}
              width={cell - 2}
              height={cell - 2}
              rx={3}
              fill={v ? '#3b82d4' : GRID}
              fillOpacity={v ? 0.2 + 0.8 * (v / max) : 1}
            >
              <title>{`${DAYS[d]} ${String(hr).padStart(2, '0')}:00 - ${v} prompt${v === 1 ? '' : 's'}`}</title>
            </rect>
          ))}
        </g>
      ))}
      {[0, 6, 12, 18].map((hr) => (
        <text key={hr} x={left + hr * cell} y={hgt - 6} fontSize={11} fill={AXIS}>
          {`${String(hr).padStart(2, '0')}:00`}
        </text>
      ))}
    </Svg>
  );
}

export function ComponentBar({ c }: { c: EfficiencyComponent }) {
  const color = c.value >= 75 ? '#2a9d8f' : c.value >= 50 ? '#e9a23b' : '#d1495b';
  return (
    <div>
      <div className="flex justify-between text-[13px]">
        <strong>{c.label}</strong>
        <span>{`${c.value}% (weight ${Math.round(c.weight * 100)}%)`}</span>
      </div>
      <svg viewBox="0 0 300 14" role="img" aria-label={`${c.label} ${c.value}%`} className="block h-3.5 w-full max-w-[420px]">
        <rect x={0} y={2} width={300} height={10} rx={5} fill={GRID} />
        <rect x={0} y={2} width={Math.max(3, 3 * c.value)} height={10} rx={5} fill={color} />
      </svg>
      <div className="text-xs text-slate-400">{c.detail}</div>
    </div>
  );
}

