import type { ReactNode } from 'react';

export function Card({
  title,
  note,
  children,
  className = '',
  id,
  action,
}: {
  title?: string;
  note?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  action?: ReactNode;
}) {
  return (
    <section id={id} className={`rounded-xl border border-slate-800 bg-slate-900 p-4 ${className}`}>
      {(title || action) && (
        <div className="mb-2 flex items-start justify-between gap-3">
          {title && <h2 className="text-sm font-semibold text-slate-100">{title}</h2>}
          {action}
        </div>
      )}
      {note && <p className="mb-3 text-xs leading-relaxed text-slate-400">{note}</p>}
      {children}
    </section>
  );
}

export type Tone = 'good' | 'bad' | 'warn' | '';

const TONE_TEXT: Record<Tone, string> = {
  good: 'text-emerald-400',
  bad: 'text-red-400',
  warn: 'text-amber-400',
  '': 'text-white',
};

export function Kpi({ label, value, sub, tone = '' }: { label: string; value: string; sub?: string; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`font-mono text-xl font-bold leading-snug ${TONE_TEXT[tone]}`}>{value}</div>
      {sub !== undefined && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

export function Empty({ msg }: { msg: string }) {
  return <p className="my-2 text-sm text-slate-400">{msg}</p>;
}

const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'border-red-700 bg-red-950 text-red-300',
  HIGH: 'border-amber-700 bg-amber-950 text-amber-300',
  MEDIUM: 'border-sky-700 bg-sky-950 text-sky-300',
};

export function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.MEDIUM}`}>
      {severity}
    </span>
  );
}
