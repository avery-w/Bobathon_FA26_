import { NextResponse, type NextRequest } from 'next/server';
import { COOKIE_NAME, accessCode, allowedHosts, bearerMatches, verifySession } from '@/lib/auth';

function contentSecurityPolicy(nonce: string): string {
  const dev = process.env.NODE_ENV === 'development';
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    // Stylesheets need the nonce. React Flow and the charts position elements with style
    // attributes, which are allowed separately and cannot execute script.
    `style-src 'self' ${dev ? "'unsafe-inline'" : `'nonce-${nonce}'`}`,
    "style-src-attr 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

function harden(res: NextResponse, csp: string): NextResponse {
  res.headers.set('Content-Security-Policy', csp);
  res.headers.set('Cache-Control', 'no-store');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'same-origin');
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  return res;
}

export async function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = contentSecurityPolicy(nonce);
  const reject = (status: number, error: string) =>
    harden(NextResponse.json({ error }, { status }), csp);

  const hosts = allowedHosts();
  if (!hosts.has(request.headers.get('host') ?? '')) return reject(403, 'Forbidden');

  const code = accessCode();
  if (!code) return reject(503, 'Server is not configured');

  // Cross-site request protection for anything that changes state.
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.get('origin');
    if (origin !== null && ![...hosts].some((h) => origin === `http://${h}`)) return reject(403, 'Forbidden');
  }

  const { pathname, search } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');
  const isPublic = pathname === '/login' || pathname === '/api/login';

  if (!isPublic) {
    const session = request.cookies.get(COOKIE_NAME)?.value;
    const signedIn =
      (await verifySession(session, code)) ||
      (isApi && (await bearerMatches(request.headers.get('authorization'), code)));
    if (!signedIn) {
      if (isApi) return reject(401, 'Not signed in');
      const url = new URL('/login', request.url);
      if (pathname !== '/') url.searchParams.set('next', pathname + search);
      return harden(NextResponse.redirect(url), csp);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  return harden(NextResponse.next({ request: { headers: requestHeaders } }), csp);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
