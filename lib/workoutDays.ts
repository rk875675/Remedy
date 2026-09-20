import { localDateKey } from './progress';

/** Short and full day names: index 0 = Monday … 6 = Sunday */
export const DAY_NAMES_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
export const DAY_NAMES_FULL = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
] as const;

/** Today's day index: 0 = Monday … 6 = Sunday */
export function todayDayIndex(now: Date = new Date()): number {
  return (now.getDay() + 6) % 7;
}

/** "Tomorrow" when the next workout is the following calendar day, else the weekday name. */
export function formatNextWorkoutLabel(
  dayIndex: number | null,
  now: Date = new Date(),
): string | null {
  if (dayIndex == null) return null;
  const today = todayDayIndex(now);
  if ((today + 1) % 7 === dayIndex) return 'Tomorrow';
  return DAY_NAMES_FULL[dayIndex];
}

/**
 * Pick `sessionsPerWeek` days with as much rest as possible between them.
 * Always includes today so the signup / day-count-change day is a workout.
 */
export function computeDefaultWorkoutDays(sessionsPerWeek: number): number[] {
  const n = Math.min(Math.max(sessionsPerWeek, 1), 7);
  const start = todayDayIndex();
  const days: number[] = [];
  for (let i = 0; i < n; i++) {
    days.push((start + Math.floor((i * 7) / n)) % 7);
  }
  return days.sort((a, b) => a - b);
}

/**
 * This week's workout days, skipping any day before `sinceDate` (YYYY-MM-DD).
 * Stops Mon/Tue looking missed when someone starts mid-week.
 */
export function activeWorkoutDaysThisWeek(
  workoutDays: number[],
  sinceDate: string | null,
  now: Date = new Date(),
): number[] {
  if (!sinceDate) return workoutDays;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - todayDayIndex(today));
  return workoutDays.filter((i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return localDateKey(d) >= sinceDate;
  });
}

/** Whether today is in the given list of workout day indices (0 = Mon … 6 = Sun). */
export function isTodayWorkoutDay(workoutDays: number[]): boolean {
  return workoutDays.includes(todayDayIndex());
}

/**
 * Returns the next workout day index after today (0 = Mon … 6 = Sun),
 * looking forward up to 7 days. Returns null if workoutDays is empty.
 */
export function getNextWorkoutDay(workoutDays: number[]): number | null {
  if (workoutDays.length === 0) return null;
  const today = todayDayIndex();
  for (let offset = 1; offset <= 7; offset++) {
    const day = (today + offset) % 7;
    if (workoutDays.includes(day)) return day;
  }
  return null;
}
