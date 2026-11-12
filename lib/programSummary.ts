import { EQUIPMENT_OPTIONS } from '../constants/onboardingQuestions';
import { GOAL_FOCUS, LOCATION_FOCUS } from '../constants/nextProgramQuestions';
import { localDateKey } from './progress';
import type { EquipmentTier, MainGoal, OnboardingAnswers } from '../types/database';

// Pure helpers for the program-complete summary and the next-program reveal.
// No React Native imports so scripts/verify_next_program.ts can test them.

/** Keep in sync with MAX_PROGRESSION_LEVEL in supabase/functions/_shared/assignment/engine.ts. */
export const TOP_PROGRESSION_LEVEL = 3;

export type SummaryCompletion = {
  id: string;
  completed_at: string;
  duration_seconds: number | null;
};

export type SummaryCheckin = {
  score: number;
  recorded_at: string;
  session_completion_id: string | null;
};

export type ProgramSummary = {
  sessions: number;
  daysActive: number;
  minutes: number;
  /**
   * Average pre-session pain over the first and the last few sessions of the program.
   * Null when fewer than four sessions carry a check-in.
   */
  painStart: number | null;
  painEnd: number | null;
};

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function oneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}

export function summarizeProgram(
  completions: SummaryCompletion[],
  beforeCheckins: SummaryCheckin[],
): ProgramSummary {
  const ids = new Set(completions.map((c) => c.id));
  const days = new Set(completions.map((c) => localDateKey(new Date(c.completed_at))));
  const seconds = completions.reduce((sum, c) => sum + Math.max(0, c.duration_seconds ?? 0), 0);

  const scores = beforeCheckins
    .filter((c) => c.session_completion_id !== null && ids.has(c.session_completion_id))
    .sort((a, b) => Date.parse(a.recorded_at) - Date.parse(b.recorded_at))
    .map((c) => c.score);
  const window = Math.min(3, Math.floor(scores.length / 2));
  const hasPain = scores.length >= 4;

  return {
    sessions: completions.length,
    daysActive: days.size,
    minutes: Math.round(seconds / 60),
    painStart: hasPain ? oneDecimal(average(scores.slice(0, window))) : null,
    painEnd: hasPain ? oneDecimal(average(scores.slice(-window))) : null,
  };
}

/** Only a clear drop is worth calling out; a flat or worse trend shows nothing. */
export function painDropWorthShowing(summary: ProgramSummary): boolean {
  return (
    summary.painStart !== null &&
    summary.painEnd !== null &&
    summary.painStart - summary.painEnd >= 1
  );
}

export type PlanShape = {
  main_goal: MainGoal[];
  pain_location: OnboardingAnswers['pain_location'];
  sessions_per_week: number;
  equipment: EquipmentTier;
};

export type ProgramHighlight = {
  key: 'level' | 'reps' | 'equipment' | 'days' | 'goal' | 'area';
  glyph: string;
  text: string;
};

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

/**
 * What changed versus the finished program, for the reveal card. Level lines describe
 * exactly what the engine does per level (weekly intensity target and work reps).
 * `before`/`after` are the saved answers and the check-in answers (rebuild only).
 */
export function nextProgramHighlights(args: {
  fromLevel: number;
  toLevel: number;
  before: PlanShape | null;
  after: PlanShape | null;
}): ProgramHighlight[] {
  const { fromLevel, toLevel, before, after } = args;
  const step = toLevel - fromLevel;
  const out: ProgramHighlight[] = [];

  if (step > 0) {
    out.push({
      key: 'level',
      glyph: '▲',
      text: step > 1 ? 'Two steps harder than your last program' : 'Harder progressions from week one',
    });
    out.push({ key: 'reps', glyph: '▲', text: 'More reps on your strength moves' });
  } else if (step < 0) {
    out.push({ key: 'level', glyph: '▼', text: 'Eased back a step so you can build steadily' });
    out.push({ key: 'reps', glyph: '▼', text: 'Fewer reps on your strength moves' });
  } else {
    out.push({
      key: 'level',
      glyph: '●',
      text:
        toLevel >= TOP_PROGRESSION_LEVEL
          ? 'Top progression level, same high challenge'
          : 'Same intensity as your last program',
    });
  }

  if (before && after) {
    if (after.equipment !== before.equipment) {
      const label = EQUIPMENT_OPTIONS.find((o) => o.value === after.equipment)?.label;
      if (label) out.push({ key: 'equipment', glyph: '◆', text: `Built for ${lowerFirst(label)}` });
    }
    if (after.sessions_per_week !== before.sessions_per_week) {
      out.push({ key: 'days', glyph: '◆', text: `${after.sessions_per_week} days a week` });
    }
    const goal = after.main_goal[0];
    if (goal && goal !== before.main_goal[0]) {
      out.push({ key: 'goal', glyph: '◆', text: `Focused on ${GOAL_FOCUS[goal]}` });
    }
    if (after.pain_location !== before.pain_location) {
      out.push({ key: 'area', glyph: '◆', text: LOCATION_FOCUS[after.pain_location] });
    }
  }

  return out.slice(0, 4);
}
