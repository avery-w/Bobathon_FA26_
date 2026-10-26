/** Calendar-date helpers. Dates are plain `YYYY-MM-DD` strings in local time. */

export const MIN_EPOCH = '2024-11-28';
export const ADR_EPOCH = '2024-12-12';
export const BULLETIN_EPOCH = '2026-03-03';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now);
}

export function parseISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isISODate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISO(parseISO(s)) === s;
}

export function addDays(s: string, n: number): string {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

export function clampEpoch(s: string, today: string): string {
  if (s < MIN_EPOCH) return MIN_EPOCH;
  if (s > today) return today;
  return s;
}

export function shortDate(s: string): string {
  const [, m, d] = s.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}`;
}

export function longDate(s: string): string {
  const [y, m, d] = s.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
