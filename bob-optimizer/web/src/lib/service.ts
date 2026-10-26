import { NextResponse } from 'next/server';
import { accessCode } from '@/lib/auth';

const TIMEOUT_MS = 15_000;

function base(): string {
  const port = Number(process.env.BOB_SERVICE_PORT || '8765');
  return `http://127.0.0.1:${Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : 8765}`;
}

export type ServiceResult<T> = { ok: true; status: number; body: T } | { ok: false; status: number; error: string };

/** Calls the local Python analytics service. Failures are reduced to generic messages. */
export async function callService<T>(path: string, init?: { method?: string; body?: unknown }): Promise<ServiceResult<T>> {
  const code = accessCode();
  if (!code) return { ok: false, status: 503, error: 'Server is not configured' };
  try {
    const res = await fetch(`${base()}${path}`, {
      method: init?.method ?? 'GET',
      headers: { 'X-Bob-Service-Token': code, 'Content-Type': 'application/json' },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
    const body = (await res.json()) as T & { error?: unknown };
    if (!res.ok) {
      return { ok: false, status: res.status, error: typeof body.error === 'string' ? body.error : 'Request failed' };
    }
    return { ok: true, status: res.status, body };
  } catch {
    return { ok: false, status: 502, error: 'The analytics service is not reachable' };
  }
}

export function failure(r: { status: number; error: string }): NextResponse {
  return NextResponse.json({ error: r.error }, { status: r.status });
}
