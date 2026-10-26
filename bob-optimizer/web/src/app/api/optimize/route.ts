import { NextResponse, type NextRequest } from 'next/server';
import { callService, failure } from '@/lib/service';
import type { PromptAnalysis } from '@/types/analytics';

const MAX_BODY = 65536; // fits an 8000-character prompt even when JSON-escaped

/** Scores a prompt on this computer only. The text is analysed in memory and never stored or logged. */
export async function POST(request: NextRequest) {
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 415 });
  }
  if (Number(request.headers.get('content-length') ?? '0') > MAX_BODY) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  let text: unknown;
  try {
    text = ((await request.json()) as { text?: unknown })?.text;
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
  if (typeof text !== 'string') return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  const r = await callService<PromptAnalysis>('/api/optimize', { method: 'POST', body: { text } });
  return r.ok ? NextResponse.json(r.body) : failure(r);
}
