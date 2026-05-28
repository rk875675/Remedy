import { supabase } from './supabase';

export async function calculateStreak(userId: string): Promise<number> {
  const { data } = await supabase
    .from('session_completions')
    .select('completed_at')
    .eq('user_id', userId)
    .order('completed_at', { ascending: false });

  if (!data || data.length === 0) return 0;

  const completionDates = new Set(
    data.map((row) => row.completed_at.slice(0, 10)),
  );

  const today = new Date();
  const todayStr = toDateString(today);
  const yesterdayStr = toDateString(addDays(today, -1));

  if (!completionDates.has(todayStr) && !completionDates.has(yesterdayStr)) {
    return 0;
  }

  let streak = 0;
  const startDate = completionDates.has(todayStr) ? today : addDays(today, -1);

  for (let i = 0; i < 365; i++) {
    const checkDate = toDateString(addDays(startDate, -i));
    if (completionDates.has(checkDate)) {
      streak++;
    } else {
      break;
    }
  }

  return streak;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}
