'use client';

import { useEffect, useState } from 'react';
import type { Settings } from '@/types/analytics';
import { Card } from '@/components/ui/Card';

const FIELD = 'mt-1 block w-full rounded-md border border-slate-700 bg-obsidian-950 px-2.5 py-1.5 text-sm';

export function SettingsPanel({ onSaved, open }: { onSaved: () => void; open: boolean }) {
  const [reset, setReset] = useState('1');
  const [budget, setBudget] = useState('');
  const [mult, setMult] = useState('1');
  const [snip, setSnip] = useState(false);
  const [prompts, setPrompts] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let live = true;
    (async () => {
      const res = await fetch('/api/settings', { credentials: 'same-origin' });
      if (!res.ok || !live) return;
      const c = (await res.json()) as Settings;
      setReset(String(c.reset_day));
      setBudget(c.monthly_budget == null ? '' : String(c.monthly_budget));
      setMult(String(c.cost_multiplier));
      setSnip(!!c.show_prompt_snippets);
      setPrompts(!!c.show_prompts);
    })();
    return () => { live = false; };
  }, []);

  if (!open) return null;

  return (
    <Card
      title="Cycle & budget settings"
      note={<>Your Bob credits reset on a fixed day each month. Set it here so the charts line up with your real cycle. Stored only in <code className="rounded bg-slate-800 px-1">~/.bob-dashboard/config.json</code>.</>}
    >
      <form
        className="grid items-end gap-3 md:grid-cols-3"
        onSubmit={async (ev) => {
          ev.preventDefault();
          const b = budget.trim();
          const res = await fetch('/api/settings', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              reset_day: parseInt(reset, 10),
              monthly_budget: b === '' ? null : Number(b),
              cost_multiplier: Number(mult),
              show_prompt_snippets: snip,
              show_prompts: prompts,
            }),
          });
          setMsg(res.ok ? 'Saved.' : 'Those values are not valid.');
          if (res.ok) onSaved();
        }}
      >
        <label className="text-sm">Reset day of month
          <input className={FIELD} type="number" min={1} max={31} step={1} required value={reset} onChange={(e) => setReset(e.target.value)} />
        </label>
        <label className="text-sm">Monthly Bobcoin budget (optional)
          <input className={FIELD} type="number" min={0} step="any" placeholder="e.g. 40" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>
        <label className="text-sm">Cost multiplier
          <input className={FIELD} type="number" min={0} step="any" required value={mult} onChange={(e) => setMult(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-3">
          <input type="checkbox" checked={snip} onChange={(e) => setSnip(e.target.checked)} /> Show prompt snippets in the table
        </label>
        <label className="flex items-center gap-2 text-sm md:col-span-3">
          <input type="checkbox" checked={prompts} onChange={(e) => setPrompts(e.target.checked)} /> Show my past prompts (redacted) with suggested improvements
        </label>
        <div className="flex items-center gap-3 md:col-span-3">
          <button type="submit" className="cursor-pointer rounded-md bg-blue-600 px-4 py-2 text-sm font-bold hover:bg-blue-500">Save</button>
          <span role="status" className="text-sm text-slate-400">{msg}</span>
        </div>
      </form>
    </Card>
  );
}
