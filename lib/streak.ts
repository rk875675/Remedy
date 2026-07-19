import { localDateKey } from './progress';

/**
 * Computes the current consecutive-day streak from a list of session completions.
 * Counts backwards from today; a day counts if it has at least one completion.
 */
export function computeStreak(completions: { completed_at: string }[]): number {
  if (completions.length === 0) return 0;

  // completed_at is a UTC timestamp; keying by its raw UTC date slice (or comparing
  // against a toISOString() cursor) shifts evening completions onto the wrong local
  // calendar day for non-UTC users. Compare local date keys on both sides instead
  // (same fix as lib/progress.ts computeWeekDays).
  const dates = new Set(completions.map((c) => localDateKey(new Date(c.completed_at))));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  const cursor = new Date(today);

  while (true) {
    if (dates.has(localDateKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
