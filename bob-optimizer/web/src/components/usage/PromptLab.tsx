'use client';

import { useEffect, useRef, useState } from 'react';
import type { PromptAnalysis, ReviewItem } from '@/types/analytics';
import { Card, Empty } from '@/components/ui/Card';
import { fmt } from '@/lib/format';
import { shortDate } from '@/lib/dates';

const MAX_CHARS = 8000;

function CopyButton({ text }: { text: string }) {
  const [label, setLabel] = useState('Copy suggestion');
  return (
    <button
      type="button"
      className="mt-1.5 cursor-pointer rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm hover:bg-slate-700"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setLabel('Copied');
        } catch {
          setLabel('Copy not available');
        }
        setTimeout(() => setLabel('Copy suggestion'), 1500);
      }}
    >
      {label}
    </button>
  );
}

const TONE = (score: number) => (score >= 75 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400');

/** Shared by the live optimizer and the past-prompt review. */
export function AnalysisView({ a, original }: { a: PromptAnalysis; original?: boolean }) {
  const checks: [string, boolean][] = [
    ['Enough detail', a.checks.length],
    ['File or error named', a.checks.context],
    ['Goal or format', a.checks.goal_or_format],
    ['One task', a.checks.single_objective],
  ];
  return (
    <div>
      <div className="mb-2 flex items-center gap-3.5">
        <div className={`text-4xl font-semibold leading-none ${TONE(a.score)}`}>{a.score}</div>
        <div>
          <strong>{a.bucket}</strong>
          <div className="text-xs text-slate-400">prompt quality, out of 100</div>
        </div>
      </div>
      <ul className="mb-2.5 flex flex-wrap gap-1.5">
        {checks.map(([label, ok]) => (
          <li key={label} className={`rounded-full border px-2.5 py-0.5 text-xs ${ok ? 'border-emerald-600 text-emerald-400' : 'border-red-700 text-red-400'}`}>
            {`${ok ? 'Yes' : 'Missing'}: ${label}`}
          </li>
        ))}
      </ul>
      {a.issues.length ? (
        <ul className="mb-2.5 list-disc pl-5">
          {a.issues.map((i) => (
            <li key={i.id} className={`mb-1 ${i.level === 'warn' ? 'text-amber-300' : 'text-slate-200'}`}>
              <span>{i.message} </span>
              <span title={i.why} className="inline-block whitespace-nowrap rounded-full border border-slate-700 bg-obsidian-950 px-2 text-[11px] text-slate-400">
                {i.source_label}
              </span>
              <div className="text-xs text-slate-400">{i.why}</div>
            </li>
          ))}
        </ul>
      ) : (
        <p>This prompt looks clear. No changes suggested.</p>
      )}
      {a.stepwise && <p className="text-xs text-slate-400">Numbered steps toward one goal are treated as a single task.</p>}
      {a.truncated && <p className="text-xs text-slate-400">Only the first 8000 characters were analysed.</p>}
      {original && (
        <>
          <div className="mt-2 text-xs uppercase tracking-wide text-slate-400">Your prompt (redacted)</div>
          <pre className="whitespace-pre-wrap break-words rounded-md border border-slate-800 bg-obsidian-950 p-2.5 font-mono text-[13px]">{a.redacted}</pre>
        </>
      )}
      {a.suggested && (
        <>
          <div className="mt-2 text-xs uppercase tracking-wide text-slate-400">Suggested version</div>
          <pre className="whitespace-pre-wrap break-words rounded-md border border-blue-500 bg-obsidian-950 p-2.5 font-mono text-[13px]">{a.suggested}</pre>
          <CopyButton text={a.suggested} />
        </>
      )}
    </div>
  );
}

/** Live optimizer: debounced, one request in flight, stale replies ignored. */
export function PromptOptimizer({ initialText = '' }: { initialText?: string }) {
  const [text, setText] = useState(initialText);
  const [result, setResult] = useState<PromptAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const mine = ++seq.current;
    if (!text.trim()) {
      setResult(null);
      setError(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/optimize', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (res.status === 401) {
          window.location.assign('/login');
          return;
        }
        if (mine !== seq.current) return;
        if (!res.ok) {
          setError('Could not analyse that prompt.');
          return;
        }
        setResult((await res.json()) as PromptAnalysis);
        setError(null);
      } catch {
        if (mine === seq.current) setError('Could not reach the local server.');
      }
    }, 300);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <Card
      id="optimizer"
      title="Prompt optimizer"
      note="Type or paste a prompt before you send it to Bob. Feedback updates as you type. The text is analysed on this computer only and is never saved or logged."
    >
      <label htmlFor="opt-input" className="sr-only">Prompt to check</label>
      <textarea
        id="opt-input"
        rows={6}
        maxLength={MAX_CHARS}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="e.g. fix the login bug"
        className="block w-full resize-y rounded-md border border-slate-700 bg-obsidian-950 p-2.5 font-mono text-sm"
      />
      <div className="my-1 text-right text-xs text-slate-400">{`${text.length} / ${MAX_CHARS}`}</div>
      <div aria-live="polite">
        {error ? <Empty msg={error} /> : result ? <AnalysisView a={result} /> : null}
      </div>
    </Card>
  );
}

export function PromptReview({ enabled, items, unit }: { enabled: boolean; items: ReviewItem[]; unit: string }) {
  if (!enabled) return null;
  return (
    <Card
      title="Your opening prompts, with suggested improvements"
      note="Lowest-scoring first. Secrets are replaced with [REDACTED]. Suggestions are templates: fill in the [bracketed] parts."
    >
      {!items.length ? (
        <Empty msg="No prompts to review yet." />
      ) : (
        items.map((it, i) => (
          <article key={`${it.date}-${i}`} className="mb-3 rounded-md border border-slate-800 bg-obsidian-950 p-3.5">
            <div className="mb-1.5 flex flex-wrap justify-between gap-1.5 text-xs text-slate-400">
              <span>{`${shortDate(it.date)} | ${it.folder}`}</span>
              <span>{`${it.prompts} prompt${it.prompts === 1 ? '' : 's'} | ${fmt(it.cost)} ${unit}`}</span>
            </div>
            <AnalysisView a={it} original />
          </article>
        ))
      )}
    </Card>
  );
}
