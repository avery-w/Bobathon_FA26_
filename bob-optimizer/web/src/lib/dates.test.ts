import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, clampEpoch, daysBetween, isISODate, shortDate, toISO, parseISO } from './dates.ts';
import { buildMarkers } from './timeline.ts';
import { niceMax, short } from './format.ts';

test('date helpers round-trip and validate', () => {
  assert.equal(toISO(parseISO('2026-03-03')), '2026-03-03');
  assert.equal(addDays('2026-02-27', 3), '2026-03-02');
  assert.equal(daysBetween('2026-03-01', '2026-03-31'), 30);
  assert.equal(isISODate('2026-03-03'), true);
  for (const bad of ['2026-13-01', '2026-02-30', 'nope', '', null, 20260303]) assert.equal(isISODate(bad), false, String(bad));
  assert.equal(shortDate('2026-03-03'), 'Mar 3');
});

test('clampEpoch keeps the epoch between the first milestone and today', () => {
  assert.equal(clampEpoch('2000-01-01', '2026-10-26'), '2024-11-28');
  assert.equal(clampEpoch('2030-01-01', '2026-10-26'), '2026-10-26');
  assert.equal(clampEpoch('2025-05-05', '2026-10-26'), '2025-05-05');
});

test('slider markers are ordered, in range, and include the first usage day', () => {
  const markers = buildMarkers('2026-08-01', '2026-10-26');
  const dates = markers.map((m) => m.date);
  assert.deepEqual(dates, [...dates].sort());
  assert.ok(markers.every((m) => m.percent >= 0 && m.percent <= 100));
  assert.ok(markers.some((m) => m.type === 'usage' && m.date === '2026-08-01'));
  assert.ok(buildMarkers(null, '2026-10-26').every((m) => m.type !== 'usage'));
});

test('format helpers', () => {
  assert.equal(niceMax(0), 1);
  assert.equal(niceMax(3.2), 5);
  assert.equal(short('abc', 10), 'abc');
  assert.ok(short('x'.repeat(60), 28).length < 30);
});
