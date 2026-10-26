/**
 * Session handling shared by the proxy and the login route.
 *
 * One access code (BOB_ACCESS_CODE, set by the launcher and shared with the Python service)
 * gates everything. Sessions are stateless signed cookies: `<expiry>.<random>.<HMAC-SHA256>`.
 * Only Web Crypto is used, and every secret comparison goes through `subtle.verify`,
 * which is constant time.
 */

export const COOKIE_NAME = 'bobweb';
export const SESSION_SECONDS = 8 * 3600;
export const MIN_CODE_LENGTH = 16;

const enc = new TextEncoder();

export function accessCode(): string | null {
  const code = process.env.BOB_ACCESS_CODE;
  return code && code.length >= MIN_CODE_LENGTH ? code : null;
}

export function webPort(): string {
  return process.env.BOB_WEB_PORT || '3000';
}

export function allowedHosts(): Set<string> {
  const port = webPort();
  return new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
}

const b64url = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes as ArrayBuffer).toString('base64url');

function hmacKey(secret: string, usage: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage);
}

/** True when `supplied` equals the access code, without leaking timing information. */
export async function codeMatches(supplied: string, code: string): Promise<boolean> {
  const key = await hmacKey(code, ['sign', 'verify']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(supplied));
  return crypto.subtle.verify('HMAC', key, mac, enc.encode(code));
}

export async function createSession(code: string, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const exp = nowSeconds + SESSION_SECONDS;
  const rand = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const payload = `${exp}.${rand}`;
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(code, ['sign']), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(
  token: string | undefined,
  code: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  if (!token || token.length > 256) return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [exp, rand, sig] = parts;
  if (!/^\d{1,12}$/.test(exp) || Number(exp) < nowSeconds) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(rand) || !/^[A-Za-z0-9_-]+$/.test(sig)) return false;
  const sigBytes = new Uint8Array(Buffer.from(sig, 'base64url'));
  return crypto.subtle.verify('HMAC', await hmacKey(code, ['verify']), sigBytes, enc.encode(`${exp}.${rand}`));
}

/** Server-to-server callers (CI runners, agentic tools) may send `Authorization: Bearer <access code>`. */
export async function bearerMatches(header: string | null, code: string): Promise<boolean> {
  if (!header || header.length > 512) return false;
  const m = /^Bearer (.+)$/.exec(header);
  return m ? codeMatches(m[1], code) : false;
}

/** Only same-site relative paths are allowed as a post-login destination. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/';
  if (next.startsWith('/login') || next.startsWith('/api/')) return '/';
  return next;
}
