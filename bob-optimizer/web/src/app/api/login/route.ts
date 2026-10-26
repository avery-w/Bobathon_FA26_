import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, SESSION_SECONDS, accessCode, codeMatches, createSession, safeNext } from '@/lib/auth';
import { createLockout, recordAttempt } from '@/lib/lockout';

const lockout = createLockout();

function back(request: NextRequest, path: string): NextResponse {
  const host = request.headers.get('host') ?? '127.0.0.1';
  return NextResponse.redirect(new URL(path, `http://${host}`), 303);
}

export async function POST(request: NextRequest) {
  const code = accessCode();
  if (!code) return NextResponse.json({ error: 'Server is not configured' }, { status: 503 });

  if (Number(request.headers.get('content-length') ?? '0') > 4096) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  let supplied = '';
  let next = '/';
  try {
    const form = await request.formData();
    const rawCode = form.get('code');
    const rawNext = form.get('next');
    supplied = typeof rawCode === 'string' ? rawCode.trim().slice(0, 128) : '';
    next = safeNext(typeof rawNext === 'string' ? rawNext : null);
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const correct = supplied.length > 0 && (await codeMatches(supplied, code));
  const result = recordAttempt(lockout, correct);
  const suffix = next === '/' ? '' : `&next=${encodeURIComponent(next)}`;

  if (result === 'locked') return back(request, `/login?error=locked${suffix}`);
  if (result === 'bad') return back(request, `/login?error=bad${suffix}`);

  const res = back(request, next);
  res.cookies.set({
    name: COOKIE_NAME,
    value: await createSession(code),
    httpOnly: true,
    sameSite: 'strict',
    secure: request.nextUrl.protocol === 'https:',
    path: '/',
    maxAge: SESSION_SECONDS,
  });
  return res;
}
