'use client';

import type { ReactNode } from 'react';
import { TopBar } from '@/components/navigation/TopBar';
import { UsageBootstrap } from '@/lib/hooks';

/** Shared frame for every signed-in page: nav bar, and usage loading tied to the global time slider. */
export function AppShell({ children, fixedHeight = false }: { children: ReactNode; fixedHeight?: boolean }) {
  return (
    <div className={`flex flex-col ${fixedHeight ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      <UsageBootstrap />
      <TopBar />
      <main className={`flex flex-1 flex-col gap-4 p-6 ${fixedHeight ? 'min-h-0' : ''}`}>{children}</main>
    </div>
  );
}
