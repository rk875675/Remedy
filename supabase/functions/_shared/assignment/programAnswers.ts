/**
 * Mirror of lib/programAnswers.ts — keep the rules in sync.
 * Deno edge functions cannot import from the app client tree.
 */

export const CHEAP_ANSWER_KEYS = ['equipment', 'sessions_per_week_preference'] as const;
export const EXPENSIVE_ANSWER_KEYS = [
  'pain_location',
  'pain_duration',
  'pain_type',
  'activity_level',
  'pain_trigger',
  'main_goal',
] as const;

export type CheapAnswerKey = (typeof CHEAP_ANSWER_KEYS)[number];
export type ExpensiveAnswerKey = (typeof EXPENSIVE_ANSWER_KEYS)[number];

export type AnswerSnapshot = {
  pain_location: 'upper' | 'lower' | 'all';
  pain_duration: 'acute' | 'subacute' | 'chronic';
  pain_type: Array<'stiffness' | 'ache' | 'sharp' | 'nerve'>;
  activity_level: 'sedentary' | 'light' | 'active' | 'athlete';
  pain_trigger: Array<'sitting' | 'bending' | 'standing' | 'morning' | 'exercise' | 'other'>;
  equipment: 'open_space' | 'bands_dumbbells' | 'gym';
  main_goal: Array<'reduce_pain' | 'return_to_exercise' | 'sleep' | 'mobility'>;
  sessions_per_week_preference: number | null;
};

export type AnswerDiff = {
  cheap: CheapAnswerKey[];
  expensive: ExpensiveAnswerKey[];
  unchanged: boolean;
};

export type PendingApplyDecision = {
  pending_apply_week: number | null;
  apply_now: boolean;
};

export type PatchExercise = {
  id: string;
  equipment_tier: AnswerSnapshot['equipment'];
  movement_pattern: string;
};

export type ReplacementRung = {
  movement_pattern: string;
  exercise_id: string;
  priority: number;
};

const DEFAULT_TIER_RANK: Record<AnswerSnapshot['equipment'], number> = {
  open_space: 0,
  bands_dumbbells: 1,
  gym: 2,
};

function sortedCopy<T extends string>(values: T[]): T[] {
  return [...values].sort();
}

export function normalizeAnswers(answers: AnswerSnapshot): AnswerSnapshot {
  return {
    ...answers,
    pain_type: sortedCopy(answers.pain_type),
    pain_trigger: sortedCopy(answers.pain_trigger),
    main_goal: sortedCopy(answers.main_goal),
  };
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export function answersEqual(a: AnswerSnapshot, b: AnswerSnapshot): boolean {
  const left = normalizeAnswers(a);
  const right = normalizeAnswers(b);
  return JSON.stringify(left) === JSON.stringify(right);
}

export function classifyAnswerDiff(applied: AnswerSnapshot, next: AnswerSnapshot): AnswerDiff {
  const left = normalizeAnswers(applied);
  const right = normalizeAnswers(next);
  const cheap = CHEAP_ANSWER_KEYS.filter((key) => !valuesEqual(left[key], right[key]));
  const expensive = EXPENSIVE_ANSWER_KEYS.filter((key) => !valuesEqual(left[key], right[key]));
  return { cheap, expensive, unchanged: cheap.length === 0 && expensive.length === 0 };
}

/**
 * Expensive changes apply at the next program week when one exists.
 * Last week of an in-progress plan applies remaining sessions now.
 * A finished program just saves — there is nothing left to rebuild.
 */
export function pendingApplyDecision(
  currentWeek: number,
  durationWeeks: number,
  hasExpensive: boolean,
): PendingApplyDecision {
  if (!hasExpensive) {
    return { pending_apply_week: null, apply_now: false };
  }
  if (currentWeek > durationWeeks) {
    return { pending_apply_week: null, apply_now: false };
  }
  if (currentWeek >= durationWeeks) {
    return { pending_apply_week: currentWeek, apply_now: true };
  }
  return { pending_apply_week: currentWeek + 1, apply_now: false };
}

export function isPendingApplyDue(
  pendingApplyWeek: number | null,
  currentWeek: number,
): boolean {
  return pendingApplyWeek !== null && currentWeek >= pendingApplyWeek;
}

export function tierRankFor(
  tier: string,
  ranks: Record<string, number> = DEFAULT_TIER_RANK,
): number {
  return ranks[tier] ?? 0;
}

/**
 * Pick a replacement when equipment changed. Returns null to keep the current exercise.
 * Downgrade must leave the user's tier. Upgrade only swaps when a higher-tier
 * variant on the same movement ladder exists.
 */
export function pickEquipmentSwap(
  current: PatchExercise,
  pool: PatchExercise[],
  replacements: ReplacementRung[],
  userTierRank: number,
  ranks: Record<string, number> = DEFAULT_TIER_RANK,
  usedIds: Set<string> = new Set(),
): string | null {
  const currentRank = tierRankFor(current.equipment_tier, ranks);
  const byId = new Map(pool.map((ex) => [ex.id, ex]));
  const ladder = replacements
    .filter((r) => r.movement_pattern === current.movement_pattern)
    .sort((a, b) => a.priority - b.priority)
    .map((r) => byId.get(r.exercise_id))
    .filter((ex): ex is PatchExercise => !!ex);

  const patternPool = pool.filter((ex) => ex.movement_pattern === current.movement_pattern);
  const source = ladder.length > 0 ? ladder : patternPool;
  const candidates = source.filter(
    (ex) => tierRankFor(ex.equipment_tier, ranks) <= userTierRank && !usedIds.has(ex.id),
  );

  if (currentRank > userTierRank) {
    const keepIfLegal =
      tierRankFor(current.equipment_tier, ranks) <= userTierRank && !usedIds.has(current.id)
        ? current.id
        : null;
    return candidates[0]?.id ?? keepIfLegal;
  }

  if (currentRank < userTierRank) {
    let best: PatchExercise | null = null;
    for (const ex of candidates) {
      const rank = tierRankFor(ex.equipment_tier, ranks);
      if (rank <= currentRank) continue;
      if (!best || rank > tierRankFor(best.equipment_tier, ranks)) best = ex;
    }
    return best && best.id !== current.id ? best.id : null;
  }

  return null;
}

export function sessionsToDrop(
  sessions: Array<{ week_number: number; session_number: number }>,
  currentWeek: number,
  currentSession: number,
  newSpw: number,
): Array<{ week_number: number; session_number: number }> {
  return sessions.filter((s) => {
    if (s.session_number <= newSpw) return false;
    if (s.week_number > currentWeek) return true;
    if (s.week_number === currentWeek && s.session_number >= currentSession) return true;
    return false;
  });
}

export function sessionSlotsToAdd(
  weeks: number[],
  oldSpw: number,
  newSpw: number,
  currentWeek: number,
  currentSession: number,
): Array<{ week_number: number; session_number: number }> {
  if (newSpw <= oldSpw) return [];
  const slots: Array<{ week_number: number; session_number: number }> = [];
  for (const week of weeks) {
    for (let session = oldSpw + 1; session <= newSpw; session += 1) {
      const remaining =
        week > currentWeek || (week === currentWeek && session >= currentSession);
      if (remaining) slots.push({ week_number: week, session_number: session });
    }
  }
  return slots;
}

export function shouldAdvanceAfterSpwDecrease(currentSession: number, newSpw: number): boolean {
  return currentSession > newSpw;
}
