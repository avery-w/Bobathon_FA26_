/** Sign-in throttling: 5 wrong codes lock sign-in for 60 seconds (same policy as the Python service). */

export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 60_000;

export interface LockoutState {
  failures: number;
  lockedUntil: number;
}

export type AttemptResult = 'ok' | 'bad' | 'locked';

export function createLockout(): LockoutState {
  return { failures: 0, lockedUntil: 0 };
}

/** Records one sign-in attempt. While locked, even a correct code is refused. */
export function recordAttempt(state: LockoutState, correct: boolean, now = Date.now()): AttemptResult {
  if (now < state.lockedUntil) return 'locked';
  if (correct) {
    state.failures = 0;
    return 'ok';
  }
  state.failures += 1;
  if (state.failures >= MAX_FAILURES) {
    state.failures = 0;
    state.lockedUntil = now + LOCKOUT_MS;
    return 'locked';
  }
  return 'bad';
}
