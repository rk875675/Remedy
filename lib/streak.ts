import { localDateKey } from './progress';

function startOfLocalDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

/** Planned days earlier this calendar week with no completion. Today is not counted. */
export function countMissedThisWeek(
  completions: { completed_at: string }[],
  workoutDays: number[],
  now: Date = new Date(),
): number {
  if (workoutDays.length === 0) return 0;

  const dates = new Set(completions.map((c) => localDateKey(new Date(c.completed_at))));
  const today = startOfLocalDay(now);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  let missed = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    if (d.getTime() >= today.getTime()) break;
    if (workoutDays.includes(i) && !dates.has(localDateKey(d))) missed += 1;
  }
  return missed;
}

export function showingUpCopy(opts: {
  sessionsThisWeek: number;
  sessionsPerWeek: number;
  missedThisWeek: number;
  hasAnyCompletion: boolean;
}): string {
  if (!opts.hasAnyCompletion) {
    return 'Finish a session to start this week.';
  }
  if (opts.missedThisWeek > 0) {
    return 'Missed a day? That is okay. Nothing is lost. Pick up on your next workout day.';
  }
  if (opts.sessionsPerWeek > 0 && opts.sessionsThisWeek >= opts.sessionsPerWeek) {
    return "That's this week's sessions done.";
  }
  if (opts.sessionsThisWeek > 0) {
    const left = opts.sessionsPerWeek - opts.sessionsThisWeek;
    if (left === 1) return '1 session left this week.';
    if (left > 1) return `${left} sessions left this week.`;
  }
  return 'Nothing logged this week yet. Your next session is waiting.';
}
