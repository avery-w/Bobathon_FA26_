import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bearerMatches,
  codeMatches,
  createSession,
  safeNext,
  verifySession,
} from './auth.ts';
import { LOCKOUT_MS, MAX_FAILURES, createLockout, recordAttempt } from './lockout.ts';

const CODE = 'a-very-long-access-code-123';

test('a freshly created session verifies', async () => {
  const token = await createSession(CODE, 1000);
  assert.equal(await verifySession(token, CODE, 1001), true);
});

test('sessions expire', async () => {
  const token = await createSession(CODE, 1000);
  assert.equal(await verifySession(token, CODE, 1000 + 8 * 3600 + 1), false);
});

test('a session signed with another code is rejected', async () => {
  const token = await createSession('some-other-access-code-999', 1000);
  assert.equal(await verifySession(token, CODE, 1001), false);
});

test('tampered and malformed sessions are rejected', async () => {
  const token = await createSession(CODE, 1000);
  const [exp, rand, sig] = token.split('.');
  assert.equal(await verifySession(`${Number(exp) + 99999}.${rand}.${sig}`, CODE, 1001), false);
  assert.equal(await verifySession(`${exp}.${rand}.${sig.slice(0, -2)}AA`, CODE, 1001), false);
  for (const bad of [undefined, '', 'x', 'a.b', 'a.b.c.d', '1.2.!!!', 'x'.repeat(500)]) {
    assert.equal(await verifySession(bad, CODE, 1001), false, String(bad));
  }
});

test('codeMatches compares exactly', async () => {
  assert.equal(await codeMatches(CODE, CODE), true);
  assert.equal(await codeMatches(CODE + 'x', CODE), false);
  assert.equal(await codeMatches('', CODE), false);
});

test('bearer header must carry the access code', async () => {
  assert.equal(await bearerMatches(`Bearer ${CODE}`, CODE), true);
  assert.equal(await bearerMatches('Bearer nope', CODE), false);
  assert.equal(await bearerMatches(CODE, CODE), false);
  assert.equal(await bearerMatches(null, CODE), false);
});

test('safeNext only allows local paths', () => {
  assert.equal(safeNext('/cockpit'), '/cockpit');
  assert.equal(safeNext('/usage?x=1'), '/usage?x=1');
  for (const bad of ['//evil.example', 'https://evil.example', '/\\evil', 'javascript:alert(1)', '', null, undefined, '/login', '/api/data']) {
    assert.equal(safeNext(bad as string | null | undefined), '/', String(bad));
  }
});

test('five wrong codes lock sign-in, and the correct code is refused while locked', () => {
  const s = createLockout();
  for (let i = 0; i < MAX_FAILURES - 1; i++) assert.equal(recordAttempt(s, false, 0), 'bad');
  assert.equal(recordAttempt(s, false, 0), 'locked');
  assert.equal(recordAttempt(s, true, 1), 'locked');
  assert.equal(recordAttempt(s, true, LOCKOUT_MS + 1), 'ok');
});

test('a correct code resets the failure counter', () => {
  const s = createLockout();
  recordAttempt(s, false, 0);
  recordAttempt(s, true, 0);
  assert.equal(s.failures, 0);
});
