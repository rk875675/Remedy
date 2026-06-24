/**
 * Computes the current consecutive-day streak from a list of session completions.
 * Counts backwards from today; a day counts if it has at least one completion.
 */
export function computeStreak(completions: { completed_at: string }[]): number {
  if (completions.length === 0) return 0;

  const dates = new Set(completions.map((c) => c.completed_at.slice(0, 10)));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  const cursor = new Date(today);

  while (true) {
    const dateStr = cursor.toISOString().slice(0, 10);
    if (dates.has(dateStr)) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}
