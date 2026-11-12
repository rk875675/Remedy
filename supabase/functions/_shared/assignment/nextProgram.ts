// Pure rules for what comes after a finished program (start-next-program).
//
//   continue — same answers, one progression level up.
//   rebuild  — a short check-in: how the program went sets the level, and the
//              "what to change" answers replace their saved counterparts.
//
// No IO here so scripts/verify_next_program.ts can test it directly.

import {
  clampProgressionLevel,
  type Answers,
  type EquipmentTier,
  type MainGoal,
  type PainLocation,
} from './engine.ts';

export type PainChange = 'much_better' | 'better' | 'same' | 'worse';
export type Difficulty = 'too_easy' | 'just_right' | 'too_hard';

export interface ProgramCheckin {
  pain_change: PainChange;
  difficulty: Difficulty;
  main_goal: MainGoal[];
  pain_location: PainLocation;
  sessions_per_week: number;
  equipment: EquipmentTier;
}

export type NextProgramRequest =
  | { choice: 'continue' }
  | { choice: 'rebuild'; checkin: ProgramCheckin };

/** onboarding_answers as stored: equipment is nullable on rows from a half-finished funnel. */
export type SavedAnswers = Omit<Answers, 'equipment'> & { equipment: EquipmentTier | null };

const DIFFICULTY_STEP: Record<Difficulty, number> = {
  too_easy: 2,
  just_right: 1,
  too_hard: -1,
};

/** A "worse" pain report never makes the next program harder. */
export function nextProgressionLevel(current: number, request: NextProgramRequest): number {
  const from = clampProgressionLevel(current);
  if (request.choice === 'continue') return clampProgressionLevel(from + 1);
  let step = DIFFICULTY_STEP[request.checkin.difficulty];
  if (request.checkin.pain_change === 'worse') step = Math.min(step, 0);
  return clampProgressionLevel(from + step);
}

/**
 * Continue keeps the saved answers, falling back to the finished plan's days/week
 * when no preference was ever stored so the cadence does not silently change.
 * Rebuild overrides only what the check-in asked. The caller validates the result.
 */
export function answersForNextProgram(
  saved: SavedAnswers,
  finishedSessionsPerWeek: number,
  request: NextProgramRequest,
): SavedAnswers {
  if (request.choice === 'continue') {
    return {
      ...saved,
      sessions_per_week_preference: saved.sessions_per_week_preference ?? finishedSessionsPerWeek,
    };
  }
  const { checkin } = request;
  return {
    ...saved,
    pain_location: checkin.pain_location,
    equipment: checkin.equipment,
    main_goal: [...new Set(checkin.main_goal)],
    sessions_per_week_preference: checkin.sessions_per_week,
  };
}
