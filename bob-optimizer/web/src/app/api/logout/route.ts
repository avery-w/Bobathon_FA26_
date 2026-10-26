import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const host = request.headers.get('host') ?? '127.0.0.1';
  const res = NextResponse.redirect(new URL('/login', `http://${host}`), 303);
  res.cookies.set({ name: COOKIE_NAME, value: '', httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
  return res;
}
