'use strict';
const assert = require('assert');
const { isoWeek, jobFiresOn, materialiseDays, dateStr } = require('../config/job-materialise');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (err) {
    console.error(`  FAIL: ${name}`);
    console.error(`        ${err.message}`);
    process.exit(1);
  }
}

// ── isoWeek tests ──────────────────────────────────────────────────────────────
// Jan 1 2026 is a Thursday — ISO week 1 of 2026
test('isoWeek: Jan 1 2026 is week 1', () => {
  assert.strictEqual(isoWeek(new Date(2026, 0, 1)), 1);
});

// ISO week boundary: Mon Jan 5 starts week 2
test('isoWeek: Jan 5 2026 (Mon) is week 2', () => {
  assert.strictEqual(isoWeek(new Date(2026, 0, 5)), 2);
});

// Jan 4 (Sun) is still week 1
test('isoWeek: Jan 4 2026 (Sun) is still week 1', () => {
  assert.strictEqual(isoWeek(new Date(2026, 0, 4)), 1);
});

// Jan 5 week 2 is even
test('isoWeek: Jan 5 2026 is week 2 (even)', () => {
  const w = isoWeek(new Date(2026, 0, 5));
  assert.strictEqual(w % 2, 0);
});

// Jan 12 2026 is week 3 (odd)
test('isoWeek: Jan 12 2026 is week 3 (odd)', () => {
  const w = isoWeek(new Date(2026, 0, 12));
  assert.strictEqual(w, 3);
  assert.notStrictEqual(w % 2, 0);
});

// ── jobFiresOn — weekly ────────────────────────────────────────────────────────
// Monday job, weekday=1
const weeklyMon = { weekday: 1, frequency: 'weekly' };

test('jobFiresOn weekly: fires on matching weekday (Mon Jan 5)', () => {
  // Jan 5 2026 is Monday
  assert.strictEqual(jobFiresOn(weeklyMon, new Date(2026, 0, 5)), true);
});

test('jobFiresOn weekly: does not fire on non-matching weekday (Tue Jan 6)', () => {
  // Jan 6 2026 is Tuesday
  assert.strictEqual(jobFiresOn(weeklyMon, new Date(2026, 0, 6)), false);
});

test('jobFiresOn weekly: fires every week on matching weekday', () => {
  // Jan 5, 12, 19, 26 are all Mondays
  assert.strictEqual(jobFiresOn(weeklyMon, new Date(2026, 0, 5)),  true);
  assert.strictEqual(jobFiresOn(weeklyMon, new Date(2026, 0, 12)), true);
  assert.strictEqual(jobFiresOn(weeklyMon, new Date(2026, 0, 19)), true);
  assert.strictEqual(jobFiresOn(weeklyMon, new Date(2026, 0, 26)), true);
});

// ── jobFiresOn — biweekly ──────────────────────────────────────────────────────
// Monday biweekly job
const biweeklyMon = { weekday: 1, frequency: 'biweekly' };

test('jobFiresOn biweekly: fires on even ISO week Monday (Jan 5 = week 2)', () => {
  // Jan 5 2026 is Monday week 2 (even) → fires
  assert.strictEqual(jobFiresOn(biweeklyMon, new Date(2026, 0, 5)), true);
});

test('jobFiresOn biweekly: does not fire on odd ISO week Monday (Jan 12 = week 3)', () => {
  // Jan 12 2026 is Monday week 3 (odd) → no fire
  assert.strictEqual(jobFiresOn(biweeklyMon, new Date(2026, 0, 12)), false);
});

test('jobFiresOn biweekly: alternates correctly — week4 fires, week3 skips', () => {
  // Jan 19 = week 4 (even) → fires; Jan 12 = week 3 (odd) → skip
  assert.strictEqual(jobFiresOn(biweeklyMon, new Date(2026, 0, 19)), true);
  assert.strictEqual(jobFiresOn(biweeklyMon, new Date(2026, 0, 12)), false);
});

test('jobFiresOn biweekly: does not fire on wrong weekday', () => {
  // Jan 6 2026 is Tuesday week 2 — wrong weekday
  assert.strictEqual(jobFiresOn(biweeklyMon, new Date(2026, 0, 6)), false);
});

// ── jobFiresOn — monthly ───────────────────────────────────────────────────────
// Thursday monthly job
const monthlyThu = { weekday: 4, frequency: 'monthly' };

test('jobFiresOn monthly: fires on first occurrence of weekday (day 1-7)', () => {
  // Jan 1 2026 is Thursday, date=1 → fires
  assert.strictEqual(jobFiresOn(monthlyThu, new Date(2026, 0, 1)), true);
});

test('jobFiresOn monthly: does not fire on second occurrence of weekday (day 8-14)', () => {
  // Jan 8 2026 is Thursday, date=8 → does not fire
  assert.strictEqual(jobFiresOn(monthlyThu, new Date(2026, 0, 8)), false);
});

test('jobFiresOn monthly: does not fire on third occurrence', () => {
  // Jan 15 2026 is Thursday, date=15 → does not fire
  assert.strictEqual(jobFiresOn(monthlyThu, new Date(2026, 0, 15)), false);
});

// Monday monthly — first Monday of Feb 2026 is Feb 2
const monthlyMon = { weekday: 1, frequency: 'monthly' };
test('jobFiresOn monthly: first Monday of Feb 2026 fires (Feb 2)', () => {
  assert.strictEqual(jobFiresOn(monthlyMon, new Date(2026, 1, 2)), true);
});
test('jobFiresOn monthly: second Monday of Feb 2026 does not fire (Feb 9)', () => {
  assert.strictEqual(jobFiresOn(monthlyMon, new Date(2026, 1, 9)), false);
});

// ── materialiseDays — basic ────────────────────────────────────────────────────
function makeSite(id, userId) {
  return { id, user_id: userId, archived_at: null };
}
function makeJob(id, siteId, weekday, frequency) {
  return { id, site_id: siteId, weekday, frequency, active: true, title: 'Test job', channel: 'SEO', job_type: 'article', est_minutes: 30 };
}

test('materialiseDays: generates instance for matching day', () => {
  const sites = [makeSite('site1', 'user1')];
  const jobs  = [makeJob('job1', 'site1', 1, 'weekly')]; // Monday weekly
  const existing = [];
  // Jan 5 2026 = Monday
  const result = materialiseDays('user1', [new Date(2026, 0, 5)], sites, jobs, existing);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].due_date, '2026-01-05');
  assert.strictEqual(result[0].recurring_job_id, 'job1');
  assert.strictEqual(result[0].site_id, 'site1');
  assert.strictEqual(result[0].user_id, 'user1');
  assert.strictEqual(result[0].status, 'pending');
});

test('materialiseDays: skips non-matching weekday', () => {
  const sites = [makeSite('site1', 'user1')];
  const jobs  = [makeJob('job1', 'site1', 1, 'weekly')]; // Monday
  // Jan 6 2026 = Tuesday
  const result = materialiseDays('user1', [new Date(2026, 0, 6)], sites, jobs, []);
  assert.strictEqual(result.length, 0);
});

test('materialiseDays: filters sites by userId', () => {
  const sites = [makeSite('site1', 'user2')]; // belongs to user2
  const jobs  = [makeJob('job1', 'site1', 1, 'weekly')];
  const result = materialiseDays('user1', [new Date(2026, 0, 5)], sites, jobs, []);
  assert.strictEqual(result.length, 0);
});

test('materialiseDays: skips archived sites', () => {
  const sites = [{ id: 'site1', user_id: 'user1', archived_at: '2026-01-01T00:00:00Z' }];
  const jobs  = [makeJob('job1', 'site1', 1, 'weekly')];
  const result = materialiseDays('user1', [new Date(2026, 0, 5)], sites, jobs, []);
  assert.strictEqual(result.length, 0);
});

// ── materialiseDays — idempotency ──────────────────────────────────────────────
test('materialiseDays: idempotency — second call returns no duplicates', () => {
  const sites = [makeSite('site1', 'user1')];
  const jobs  = [makeJob('job1', 'site1', 1, 'weekly')];
  const days  = [new Date(2026, 0, 5)];

  // First call
  const first = materialiseDays('user1', days, sites, jobs, []);
  assert.strictEqual(first.length, 1);

  // Second call — pass first results as existing instances
  const second = materialiseDays('user1', days, sites, jobs, first);
  assert.strictEqual(second.length, 0);
});

test('materialiseDays: idempotency — same day passed twice is deduplicated internally', () => {
  const sites = [makeSite('site1', 'user1')];
  const jobs  = [makeJob('job1', 'site1', 1, 'weekly')];
  // Pass the same day twice in the days array
  const days = [new Date(2026, 0, 5), new Date(2026, 0, 5)];
  const result = materialiseDays('user1', days, sites, jobs, []);
  assert.strictEqual(result.length, 1); // deduplicated internally
});

test('materialiseDays: generates correct id (24 hex chars)', () => {
  const sites = [makeSite('site1', 'user1')];
  const jobs  = [makeJob('job1', 'site1', 1, 'weekly')];
  const result = materialiseDays('user1', [new Date(2026, 0, 5)], sites, jobs, []);
  assert.ok(/^[0-9a-f]{24}$/.test(result[0].id), `id should be 24 hex chars, got: ${result[0].id}`);
});

test('materialiseDays: multiple jobs on different weekdays, multiple days', () => {
  const sites = [makeSite('site1', 'user1')];
  const jobs  = [
    makeJob('job1', 'site1', 1, 'weekly'),  // Monday
    makeJob('job2', 'site1', 2, 'weekly'),  // Tuesday
  ];
  const days = [new Date(2026, 0, 5), new Date(2026, 0, 6)]; // Mon + Tue
  const result = materialiseDays('user1', days, sites, jobs, []);
  assert.strictEqual(result.length, 2);
});

test('materialiseDays: inactive jobs are skipped', () => {
  const sites = [makeSite('site1', 'user1')];
  const jobs  = [{ ...makeJob('job1', 'site1', 1, 'weekly'), active: false }];
  const result = materialiseDays('user1', [new Date(2026, 0, 5)], sites, jobs, []);
  assert.strictEqual(result.length, 0);
});

// ── dateStr ────────────────────────────────────────────────────────────────────
test('dateStr: formats correctly', () => {
  assert.strictEqual(dateStr(new Date(2026, 0, 5)), '2026-01-05');
  assert.strictEqual(dateStr(new Date(2026, 11, 31)), '2026-12-31');
});

console.log(`\nAll ${passed} tests passed.`);
