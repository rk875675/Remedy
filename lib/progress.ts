// Pure chart/date math for the Progress tab. No React/React Native imports so the
// logic can be exercised deterministically by scripts/verify_progress.ts.
//
// All functions accept an injectable `now` (defaulting to the real clock) and work in
// LOCAL calendar days — pain scores and session completions belong to the day the user
// experienced them, not the UTC date of the timestamp.

export type ChartPoint = { value?: number; label?: string };
export type BarPoint = {
  value: number;
  label: string;
  frontColor: string;
  isFuture?: boolean;
  isCurrent?: boolean;
};
export type RawCheckin = { score: number; type: string; recorded_at: string };
export type RawCompletion = { completed_at: string };
export type PainRange = '2w' | '1m' | '3m';
export type ActivityRange = '1m' | '3m' | '6m';

export function avg(arr: number[]): number {
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
}

// Local-calendar date key (YYYY-MM-DD). Using toISOString() here would key by the UTC
// date, which shifts evening completions — and the local-midnight week boundaries
// themselves — onto the wrong calendar day for any non-UTC timezone.
export function localDateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Widest Progress chart is 6 months (~26 weeks). +slack covers TZ edges. */
export const PROGRESS_HISTORY_DAYS = 190;

/** Inclusive local-midnight start of an N-day lookback, as an ISO timestamp. */
export function historyWindowStartISO(days: number, now: Date = new Date()): string {
  const start = startOfLocalDay(now);
  start.setDate(start.getDate() - (days - 1));
  return start.toISOString();
}

function mondayOfWeek(now: Date): Date {
  const monday = startOfLocalDay(now);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

export function computePainChart(
  checkins: RawCheckin[],
  range: PainRange,
  accountStart?: Date,
  now: Date = new Date(),
): { bData: ChartPoint[]; aData: ChartPoint[]; rangeHasData: boolean } {
  const daysBack = range === '2w' ? 14 : range === '1m' ? 30 : 90;

  // Buckets are aligned to local midnight so a check-in always lands in the bucket
  // labeled with its own calendar date. The window ends today and spans `daysBack`
  // calendar days inclusive.
  const today = startOfLocalDay(now);
  const rawStart = new Date(today);
  rawStart.setDate(today.getDate() - (daysBack - 1));

  // Never show data before the account start date
  const startDate =
    accountStart && accountStart > rawStart ? startOfLocalDay(accountStart) : rawStart;

  const totalDays =
    Math.round((today.getTime() - startDate.getTime()) / 86400000) + 1;

  // Bucket granularity per range — keeps the chart to a sensible number of points
  // 14D → 1 bucket/day → up to 14 pts; label every 3rd day
  // 1M  → 5-day buckets → ~6 pts; label every bucket
  // 3M  → 14-day (bi-weekly) buckets → ~6-7 pts; label every bucket
  const groupDays = range === '2w' ? 1 : range === '1m' ? 5 : 14;
  const labelEvery = range === '2w' ? 3 : 1;

  const relevant = checkins.filter((c) => new Date(c.recorded_at) >= startDate);
  const numBuckets = Math.max(1, Math.ceil(totalDays / groupDays));

  const bData: ChartPoint[] = [];
  const aData: ChartPoint[] = [];

  for (let i = 0; i < numBuckets; i++) {
    const bucketStart = new Date(startDate);
    bucketStart.setDate(startDate.getDate() + i * groupDays);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketStart.getDate() + groupDays);

    const inBucket = relevant.filter((c) => {
      const d = new Date(c.recorded_at);
      return d >= bucketStart && d < bucketEnd;
    });

    const bScores = inBucket.filter((c) => c.type === 'before').map((c) => c.score);
    const aScores = inBucket.filter((c) => c.type === 'after').map((c) => c.score);

    const showLabel = i % labelEvery === 0;
    const parts = localDateKey(bucketStart).split('-');
    // For 3M range use short month name for clarity, otherwise M/D
    const label = showLabel
      ? range === '2w'
        ? `${parseInt(parts[1])}/${parseInt(parts[2])}`
        : bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '';

    // Empty buckets carry NO value: pain scores are 1–10 by DB constraint, so a
    // fabricated 0 would render as an impossible pain crash on every rest day. The
    // chart interpolates across value-less points and hides their dots.
    bData.push({ value: bScores.length > 0 ? avg(bScores) : undefined, label });
    aData.push({ value: aScores.length > 0 ? avg(aScores) : undefined, label });
  }

  return { bData, aData, rangeHasData: relevant.length > 0 };
}

/** Never invent more than a month of empty upcoming weeks. */
const ACTIVITY_MAX_FUTURE_WEEKS = 4;

function formatActivityWeekLabel(
  weekStart: Date,
  barCount: number,
  prevLabeled: Date | null,
): string {
  if (barCount <= 8) {
    return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (barCount > 13) {
    const newMonth = !prevLabeled || prevLabeled.getMonth() !== weekStart.getMonth();
    return newMonth
      ? weekStart.toLocaleDateString('en-US', { month: 'short' })
      : `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
  }
  return `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
}

export function computeActivityChart(
  completions: RawCompletion[],
  range: ActivityRange,
  barColor: string,
  accountStart?: Date,
  now: Date = new Date(),
): BarPoint[] {
  const thisMonday = mondayOfWeek(now);

  // 1m ≈ 4 weeks, 3m ≈ 13 weeks, 6m ≈ 26 weeks
  const totalWeeks = range === '1m' ? 4 : range === '3m' ? 13 : 26;

  const rangeStartMonday = new Date(thisMonday);
  rangeStartMonday.setDate(thisMonday.getDate() - (totalWeeks - 1) * 7);

  // Never start before the account existed — shift leftover range into the future.
  // If a completion already sits earlier in the selected range (demo data, or a
  // stale client created_at), keep that week so bars the user actually earned stay visible.
  let firstMonday = rangeStartMonday;
  if (accountStart) {
    const accountMonday = mondayOfWeek(accountStart);
    if (accountMonday > firstMonday) {
      firstMonday = accountMonday;
    }
  }
  for (const c of completions) {
    const completed = new Date(c.completed_at);
    if (completed < rangeStartMonday || completed >= thisMonday) continue;
    const completedMonday = mondayOfWeek(completed);
    if (completedMonday < firstMonday) firstMonday = completedMonday;
  }

  const pastWeeks = Math.max(
    1,
    Math.round((thisMonday.getTime() - firstMonday.getTime()) / 604800000) + 1,
  );
  const futureWeeks = Math.min(
    ACTIVITY_MAX_FUTURE_WEEKS,
    Math.max(0, totalWeeks - pastWeeks),
  );
  const barCount = pastWeeks + futureWeeks;

  // Denser labels on short charts so every tick stays readable.
  const labelEvery = barCount <= 5 ? 1 : barCount <= 13 ? 2 : 4;

  const bars: BarPoint[] = [];
  let lastLabeledStart: Date | null = null;
  for (let i = 0; i < barCount; i++) {
    const weekStart = new Date(firstMonday);
    weekStart.setDate(firstMonday.getDate() + i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const count = completions.filter((c) => {
      const d = new Date(c.completed_at);
      return d >= weekStart && d < weekEnd;
    }).length;

    const isCurrent = weekStart.getTime() === thisMonday.getTime();
    const onCadence = i % labelEvery === 0;
    const isLast = i === barCount - 1;
    const lastCollides = isLast && (barCount - 1) % labelEvery === 1;
    const showLabel = onCadence || isCurrent || (isLast && !lastCollides);
    const label = showLabel
      ? formatActivityWeekLabel(weekStart, barCount, lastLabeledStart)
      : '';
    if (label) lastLabeledStart = weekStart;

    bars.push({
      value: count,
      label,
      frontColor: barColor,
      isFuture: weekStart.getTime() > thisMonday.getTime(),
      isCurrent,
    });
  }

  return bars;
}

export function computeWeekDays(
  completions: RawCompletion[],
  offset: number,
  now: Date = new Date(),
): boolean[] {
  const thisMonday = mondayOfWeek(now);
  const targetMonday = new Date(thisMonday);
  targetMonday.setDate(thisMonday.getDate() + offset * 7);

  // completed_at is a UTC timestamp; slicing it (or keying the week's days via
  // toISOString) compared UTC dates against local ones, marking evening completions on
  // the wrong calendar day for non-UTC users. Compare local date keys on both sides.
  const completionDates = new Set(
    completions.map((c) => localDateKey(new Date(c.completed_at))),
  );

  const days: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(targetMonday);
    d.setDate(targetMonday.getDate() + i);
    days.push(completionDates.has(localDateKey(d)));
  }
  return days;
}

export function getWeekLabel(offset: number, now: Date = new Date()): string {
  const thisMonday = mondayOfWeek(now);
  const targetMonday = new Date(thisMonday);
  targetMonday.setDate(thisMonday.getDate() + offset * 7);
  const targetSunday = new Date(targetMonday);
  targetSunday.setDate(targetMonday.getDate() + 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(targetMonday)} – ${fmt(targetSunday)}`;
}

// Estimate the completion date from the sessions actually remaining, at the plan's
// cadence. Counts the rest of the CURRENT week too (the old week-granularity math
// showed "Program complete" during the final week and undercounted by up to a week).
// Returns null once the program is finished (current_week > duration_weeks).
export function getEstimatedCompletion(
  currentWeek: number,
  currentSession: number,
  durationWeeks: number,
  sessionsPerWeek: number,
  now: Date = new Date(),
): string | null {
  if (currentWeek > durationWeeks) return null;
  const sessionsLeftThisWeek = Math.max(0, sessionsPerWeek - currentSession + 1);
  const fullWeeksAfter = durationWeeks - currentWeek;
  const sessionsLeft = sessionsLeftThisWeek + fullWeeksAfter * sessionsPerWeek;
  const daysLeft = Math.ceil((sessionsLeft * 7) / sessionsPerWeek);
  const d = new Date(now);
  d.setDate(d.getDate() + daysLeft);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
