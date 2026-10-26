export function fmt(n: number | null | undefined, d = 2): string {
  if (n == null || !Number.isFinite(n)) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

export function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function short(t: string, n = 28): string {
  return t.length <= n ? t : t.slice(0, 11) + '...' + t.slice(-(n - 14));
}

export function niceMax(v: number): number {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export const OUTCOME_LABELS: Record<string, string> = {
  one_shot: 'One-shot',
  multi_turn: 'Multi-turn',
  cancelled: 'Cancelled',
  empty: 'Empty',
};
