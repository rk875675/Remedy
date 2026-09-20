// Deterministic checks for the Progress tab chart math in lib/progress.ts.
// Usage: npx tsx scripts/verify_progress.ts
//
// Uses a fixed local `now` so results don't depend on when the script runs. Timestamps
// below are constructed in LOCAL time via new Date(y, m, d, ...) unless a UTC ISO
// string is the point of the test.
import {
  avg,
  localDateKey,
  computePainChart,
  computeActivityChart,
  computeWeekDays,
  getWeekLabel,
  getEstimatedCompletion,
  historyWindowStartISO,
  PROGRESS_HISTORY_DAYS,
  type RawCheckin,
  type RawCompletion,
} from '../lib/progress';

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

// Saturday Jul 4 2026, 5:23pm local — afternoon time-of-day on purpose, to catch
// bucketing that isn't aligned to local midnight.
const NOW = new Date(2026, 6, 4, 17, 23, 0);

function iso(y: number, mo: number, d: number, h = 12, mi = 0): string {
  return new Date(y, mo, d, h, mi, 0).toISOString();
}

// ---------------------------------------------------------------------------
console.log('avg');
check('rounds to 1 decimal', avg([3, 4]) === 3.5 && avg([1, 2, 2]) === 1.7);

// ---------------------------------------------------------------------------
console.log('computePainChart — no fabricated zeros (scores are 1–10 by DB constraint)');
{
  // Sessions every other day: Jul 4, Jul 2, Jun 30 — rest days in between.
  const checkins: RawCheckin[] = [
    { score: 6, type: 'before', recorded_at: iso(2026, 5, 30, 9) },
    { score: 4, type: 'after', recorded_at: iso(2026, 5, 30, 10) },
    { score: 5, type: 'before', recorded_at: iso(2026, 6, 2, 9) },
    { score: 3, type: 'after', recorded_at: iso(2026, 6, 2, 10) },
    { score: 4, type: 'before', recorded_at: iso(2026, 6, 4, 8) },
    { score: 2, type: 'after', recorded_at: iso(2026, 6, 4, 9) },
  ];
  const { bData, aData, rangeHasData } = computePainChart(checkins, '2w', undefined, NOW);

  check('14 daily buckets', bData.length === 14, `got ${bData.length}`);
  check('rangeHasData true', rangeHasData);
  const zeros = [...bData, ...aData].filter((p) => p.value === 0).length;
  check('no zero-valued points', zeros === 0, `${zeros} zero points`);
  const emptyBuckets = bData.filter((p) => p.value === undefined).length;
  check('rest days have NO value (11 empty before-buckets)', emptyBuckets === 11, `got ${emptyBuckets}`);

  // Buckets aligned to local midnight: window is Jun 21..Jul 4, so Jun 30 = index 9,
  // Jul 2 = index 11, Jul 4 (a morning check-in, BEFORE now's 5:23pm time-of-day) =
  // index 13. The old non-aligned code dropped same-day-morning data into the previous
  // day's bucket.
  check('Jun 30 before in bucket 9', bData[9].value === 6, `got ${bData[9].value}`);
  check('Jul 2 before in bucket 11', bData[11].value === 5, `got ${bData[11].value}`);
  check('Jul 4 morning before in TODAY bucket 13', bData[13].value === 4, `got ${bData[13].value}`);
  check('Jul 4 morning after in TODAY bucket 13', aData[13].value === 2, `got ${aData[13].value}`);

  // Multiple check-ins in one bucket average correctly
  const multi: RawCheckin[] = [
    { score: 3, type: 'before', recorded_at: iso(2026, 6, 4, 8) },
    { score: 4, type: 'before', recorded_at: iso(2026, 6, 4, 20) },
  ];
  const m = computePainChart(multi, '2w', undefined, NOW);
  check('same-day scores averaged', m.bData[13].value === 3.5, `got ${m.bData[13].value}`);
}

console.log('computePainChart — range gating and account start');
{
  // Mid-April: outside the 14-day window but inside the 90-day one (starts Apr 6).
  const old: RawCheckin[] = [
    { score: 5, type: 'before', recorded_at: iso(2026, 3, 15) },
    { score: 6, type: 'before', recorded_at: iso(2026, 3, 16) },
    { score: 7, type: 'before', recorded_at: iso(2026, 3, 17) },
  ];
  const r = computePainChart(old, '2w', undefined, NOW);
  check('old-only data → rangeHasData false on 14D', r.rangeHasData === false);
  const r3m = computePainChart(old, '3m', undefined, NOW);
  check('same data visible on 3M', r3m.rangeHasData === true);

  // accountStart clamps the window
  const accountStart = new Date(2026, 6, 1, 14, 0); // Jul 1, 2pm
  const c = computePainChart(
    [{ score: 5, type: 'before', recorded_at: iso(2026, 6, 2) }],
    '2w',
    accountStart,
    NOW,
  );
  check('window clamped to account start (Jul 1–4 = 4 buckets)', c.bData.length === 4, `got ${c.bData.length}`);
}

// ---------------------------------------------------------------------------
console.log('computeActivityChart');
{
  // Week of NOW: Mon Jun 29 – Sun Jul 5. Previous week: Jun 22–28.
  const completions: RawCompletion[] = [
    { completed_at: iso(2026, 5, 23) }, // prev week
    { completed_at: iso(2026, 5, 25) }, // prev week
    { completed_at: iso(2026, 5, 29) }, // this week (Mon)
    { completed_at: iso(2026, 6, 3) },  // this week (Fri)
    { completed_at: iso(2026, 6, 4, 8) }, // this week (Sat morning)
  ];
  const bars = computeActivityChart(completions, '1m', '#C4614A', undefined, NOW);
  check('1M → 4 weekly bars', bars.length === 4);
  check('this week counts 3', bars[3].value === 3, `got ${bars[3].value}`);
  check('previous week counts 2', bars[2].value === 2, `got ${bars[2].value}`);
  check('last bar labeled with this Monday Jun 29', bars[3].label === 'Jun 29', `got '${bars[3].label}'`);
  check('this week marked current', bars[3].isCurrent === true);
  check('no future bars when history fills the range', bars.every((b) => !b.isFuture));
  check('6M → 26 bars', computeActivityChart([], '6m', '#C4614A', undefined, NOW).length === 26);

  const bars3m = computeActivityChart(completions, '3m', '#C4614A', undefined, NOW);
  check('3M → 13 weekly bars', bars3m.length === 13, `got ${bars3m.length}`);
  check('3M last bar is current week', bars3m[12].isCurrent === true);
  check('3M current week stays labeled', bars3m[12].label !== '');
  check('3M this week still counts 3', bars3m[12].value === 3, `got ${bars3m[12].value}`);

  const bars6m = computeActivityChart(completions, '6m', '#C4614A', undefined, NOW);
  check('6M last bar is current week', bars6m[25].isCurrent === true);
  check('6M current week stays labeled', bars6m[25].label !== '');
  check('6M this week still counts 3', bars6m[25].value === 3, `got ${bars6m[25].value}`);
}

console.log('computeActivityChart — account start clamps past weeks and pads future');
{
  const completions: RawCompletion[] = [
    { completed_at: iso(2026, 6, 1) }, // Wed of this week
    { completed_at: iso(2026, 6, 3) },
  ];
  // Joined this week (Wed Jul 1) — do not invent June bars.
  const joinedThisWeek = computeActivityChart(
    completions,
    '1m',
    '#C4614A',
    new Date(2026, 6, 1, 14, 0),
    NOW,
  );
  check('new account 1M still has 4 bars', joinedThisWeek.length === 4, `got ${joinedThisWeek.length}`);
  check('first bar is this Monday (Jun 29)', joinedThisWeek[0].label === 'Jun 29', `got '${joinedThisWeek[0].label}'`);
  check('this week is current and has 2 sessions', joinedThisWeek[0].isCurrent === true && joinedThisWeek[0].value === 2);
  check('remaining 1M bars are future', joinedThisWeek.slice(1).every((b) => b.isFuture && b.value === 0));
  check('future week labeled Jul 6', joinedThisWeek[1].label === 'Jul 6', `got '${joinedThisWeek[1].label}'`);

  // Joined two weeks ago (Mon Jun 15). 1M = 2 past + current + 1 future.
  const joinedTwoWeeksAgo = computeActivityChart(
    [{ completed_at: iso(2026, 5, 17) }, { completed_at: iso(2026, 6, 4, 8) }],
    '1m',
    '#C4614A',
    new Date(2026, 5, 17, 10, 0),
    NOW,
  );
  check('two-week-old account 1M → 4 bars', joinedTwoWeeksAgo.length === 4);
  check('starts at Jun 15 week', joinedTwoWeeksAgo[0].label === 'Jun 15', `got '${joinedTwoWeeksAgo[0].label}'`);
  check('third bar is current week', joinedTwoWeeksAgo[2].isCurrent === true);
  check('one future week padded', joinedTwoWeeksAgo.filter((b) => b.isFuture).length === 1);

  // 3M for a brand-new account: at most 4 future weeks, not 12 empty ones.
  const newOn3m = computeActivityChart([], '3m', '#C4614A', new Date(2026, 6, 2), NOW);
  check('new account 3M does not invent a full quarter', newOn3m.length === 5, `got ${newOn3m.length}`);
  check('3M pads 4 future weeks', newOn3m.filter((b) => b.isFuture).length === 4);

  // Account older than the range: unchanged 4-week lookback, no future.
  const oldAccount = computeActivityChart(completions, '1m', '#C4614A', new Date(2025, 0, 1), NOW);
  check('long-lived account 1M stays a 4-week lookback', oldAccount.length === 4 && oldAccount.every((b) => !b.isFuture));

  // Completions inside the range but before accountStart still keep their week.
  const withEarlierSession = computeActivityChart(
    [{ completed_at: iso(2026, 5, 17) }, { completed_at: iso(2026, 6, 1) }],
    '1m',
    '#C4614A',
    new Date(2026, 6, 1, 14, 0),
    NOW,
  );
  check(
    'in-range completion before account start still shows that week',
    withEarlierSession[0].label === 'Jun 15',
    `got '${withEarlierSession[0].label}'`,
  );
}

// ---------------------------------------------------------------------------
console.log('computeWeekDays — local-day keying of UTC timestamps');
{
  const tzOffsetMin = NOW.getTimezoneOffset();
  if (tzOffsetMin > 0) {
    // Machine is behind UTC (e.g. UTC-5): 03:00Z on Jul 1 is the evening of Jun 30
    // local. It must fill Tuesday Jun 30, not Wednesday Jul 1.
    const completions: RawCompletion[] = [{ completed_at: '2026-07-01T03:00:00Z' }];
    const days = computeWeekDays(completions, 0, NOW);
    check('evening UTC-rollover completion lands on local Tue', days[1] === true && days[2] === false, JSON.stringify(days));
  } else {
    console.log('  SKIP  machine TZ is UTC or ahead; rollover case not reproducible here');
  }

  const days = computeWeekDays([{ completed_at: iso(2026, 6, 4, 8) }], 0, NOW);
  check('Sat completion fills index 5 only', days[5] === true && days.filter(Boolean).length === 1, JSON.stringify(days));
  const lastWeek = computeWeekDays([{ completed_at: iso(2026, 5, 24) }], -1, NOW);
  check('offset -1 sees last week (Wed Jun 24 → index 2)', lastWeek[2] === true, JSON.stringify(lastWeek));
}

console.log('getWeekLabel');
{
  check('current week label', getWeekLabel(0, NOW) === 'Jun 29 – Jul 5', `got '${getWeekLabel(0, NOW)}'`);
  check('offset -1 label', getWeekLabel(-1, NOW) === 'Jun 22 – Jun 28', `got '${getWeekLabel(-1, NOW)}'`);
}

// ---------------------------------------------------------------------------
console.log('getEstimatedCompletion');
{
  // Week 1 session 1 of a 5-week 4/week plan: 20 sessions left → 35 days.
  const start = getEstimatedCompletion(1, 1, 5, 4, NOW);
  check('fresh program → +35 days (Aug 8)', start === 'Aug 8', `got '${start}'`);

  // Mid-program: week 3, session 2 → 3 left this week + 8 after = 11 → ceil(77/4)=20 days.
  const mid = getEstimatedCompletion(3, 2, 5, 4, NOW);
  check('mid program → +20 days (Jul 24)', mid === 'Jul 24', `got '${mid}'`);

  // FINAL week, last session: 1 session left → 2 days. The old math returned the
  // string 'Program complete' here while the user was still mid-program.
  const final = getEstimatedCompletion(5, 4, 5, 4, NOW);
  check('final week still yields a real date (Jul 6)', final === 'Jul 6', `got '${final}'`);

  check('finished program → null', getEstimatedCompletion(6, 1, 5, 4, NOW) === null);
}

// ---------------------------------------------------------------------------
console.log('localDateKey');
check('formats local date', localDateKey(new Date(2026, 0, 5)) === '2026-01-05');

console.log('historyWindowStartISO');
const windowStart = new Date(historyWindowStartISO(PROGRESS_HISTORY_DAYS, NOW));
const expectedStart = new Date(2026, 6, 4);
expectedStart.setHours(0, 0, 0, 0);
expectedStart.setDate(expectedStart.getDate() - (PROGRESS_HISTORY_DAYS - 1));
check(
  '190-day lookback lands on local midnight 189 days before NOW',
  windowStart.getTime() === expectedStart.getTime(),
  `got ${windowStart.toISOString()} expected ${expectedStart.toISOString()}`,
);
check('covers the 6-month activity chart (26 weeks)', PROGRESS_HISTORY_DAYS >= 182);

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('All checks passed.');
