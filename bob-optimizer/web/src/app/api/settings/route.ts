import { NextResponse, type NextRequest } from 'next/server';
import { callService, failure } from '@/lib/service';

const MAX_BODY = 4096;
const KEYS = ['reset_day', 'monthly_budget', 'cost_multiplier', 'show_prompt_snippets', 'show_prompts'] as const;

export async function GET() {
  const r = await callService<Record<string, unknown>>('/api/settings');
  return r.ok ? NextResponse.json(r.body) : failure(r);
}

export async function POST(request: NextRequest) {
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 415 });
  }
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return NextResponse.json({ error: 'Invalid settings' }, { status: 400 });
  }
  // Only the five user-facing settings can be changed; the service validates the values.
  const body: Record<string, unknown> = {};
  for (const k of KEYS) if (k in data) body[k] = (data as Record<string, unknown>)[k];
  const r = await callService<{ ok: boolean }>('/api/settings', { method: 'POST', body });
  return r.ok ? NextResponse.json(r.body) : failure(r);
}
