'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles, Activity } from 'lucide-react';
import { useTimeMachineStore } from '@/stores/useTimeMachineStore';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/cockpit', label: 'Decision Cockpit' },
  { href: '/usage', label: 'Usage Lab' },
];

export const TopBar = () => {
  const toggleDemoMode = useTimeMachineStore((s) => s.toggleDemoMode);
  const isDemoMode = useTimeMachineStore((s) => s.isDemoMode);
  const pathname = usePathname();

  return (
    <header className="flex h-16 w-full items-center justify-between gap-4 border-b border-slate-800 bg-slate-900 px-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-gradient-to-br from-blue-600 to-indigo-600 shadow-lg shadow-blue-600/40">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold tracking-tight">BOB OPTIMIZER</span>
            <span className="rounded border border-blue-700 bg-blue-900/40 px-1.5 py-0.5 font-mono text-[10px] text-blue-400">
              DECISIONS + USAGE
            </span>
          </div>
          <p className="font-mono text-[11px] text-slate-400">Time Machine and Analytics, woven together</p>
        </div>
      </div>

      <nav aria-label="Main" className="flex items-center gap-1">
        {LINKS.map((l) => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? 'page' : undefined}
              className={`rounded-lg px-3 py-2 text-sm font-medium ${active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleDemoMode}
          className={`flex cursor-pointer items-center gap-1.5 rounded-[10px] border px-3 py-1.5 font-mono text-[11px] font-bold ${
            isDemoMode ? 'border-red-500 bg-red-600 text-white' : 'border-slate-700 bg-obsidian-950 text-slate-300'
          }`}
        >
          <Activity className="h-3.5 w-3.5" />
          <span>{isDemoMode ? 'STAGE DEMO MODE: ACTIVE' : 'DEMO MODE'}</span>
        </button>
        <form method="post" action="/api/logout">
          <button type="submit" className="cursor-pointer rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
};
