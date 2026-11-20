import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { FunctionsFetchError } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabase } from './supabase';
import { extractInvokeError } from './functionsError';
import {
  difficultySchema,
  equipmentSchema,
  mainGoalSchema,
  NEXT_PROGRAM_FEEDBACK_MAX,
  painChangeSchema,
  painLocationSchema,
  programCheckinInputSchema,
  sessionsPerWeekSchema,
  startNextProgramResultSchema,
  type ProgramCheckinInput,
  type StartNextProgramResult,
} from './schemas';
import { CHECKIN_STEP_KEYS } from '../constants/nextProgramQuestions';

// ---------------------------------------------------------------------------
// Check-in draft
// ---------------------------------------------------------------------------
// One per device, scoped inside to the user and the finished plan it is about, so a
// closed app resumes at the same step with the same answers. The idempotency key
// lives here too: a resubmit after a lost response replays instead of rebuilding.

const DRAFT_KEY = 'remedy_next_program_draft';

const draftSchema = z
  .object({
    user_id: z.string().uuid(),
    plan_id: z.string().uuid(),
    idempotency_key: z.string().uuid(),
    step: z.number().int().min(0).max(CHECKIN_STEP_KEYS.length - 1),
    pain_change: painChangeSchema.nullable(),
    difficulty: difficultySchema.nullable(),
    main_goal: z.array(mainGoalSchema.element).max(4),
    pain_location: painLocationSchema.nullable(),
    sessions_per_week: sessionsPerWeekSchema.nullable(),
    equipment: equipmentSchema.nullable(),
    feedback: z.string().max(NEXT_PROGRAM_FEEDBACK_MAX),
  })
  .strict();
export type CheckinDraft = z.infer<typeof draftSchema>;

export type CheckinDefaults = Pick<
  CheckinDraft,
  'main_goal' | 'pain_location' | 'sessions_per_week' | 'equipment'
>;

export function newIdempotencyKey(): string {
  return Crypto.randomUUID();
}

export function newCheckinDraft(
  userId: string,
  planId: string,
  defaults: CheckinDefaults,
): CheckinDraft {
  return {
    user_id: userId,
    plan_id: planId,
    idempotency_key: newIdempotencyKey(),
    step: 0,
    pain_change: null,
    difficulty: null,
    ...defaults,
    feedback: '',
  };
}

export async function loadCheckinDraft(userId: string, planId: string): Promise<CheckinDraft | null> {
  try {
    const raw = await AsyncStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = draftSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    if (parsed.data.user_id !== userId || parsed.data.plan_id !== planId) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function saveCheckinDraft(draft: CheckinDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Losing a draft only costs the user a few taps.
  }
}

export async function clearCheckinDraft(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DRAFT_KEY);
  } catch {
    // Scoped to user + plan on read, so a leftover is never shown to anyone else.
  }
}

/** Null until every question has a valid answer. */
export function checkinFromDraft(draft: CheckinDraft): ProgramCheckinInput | null {
  const feedback = draft.feedback.trim();
  const parsed = programCheckinInputSchema.safeParse({
    pain_change: draft.pain_change,
    difficulty: draft.difficulty,
    main_goal: draft.main_goal,
    pain_location: draft.pain_location,
    sessions_per_week: draft.sessions_per_week,
    equipment: draft.equipment,
    ...(feedback ? { feedback } : {}),
  });
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------
// start-next-program
// ---------------------------------------------------------------------------

/**
 * `already_started` — the finished program was already replaced (another device, or a
 * resubmit with a new key); the user's next program exists, so the app just goes home.
 */
export type StartNextProgramError =
  | 'already_started'
  | 'not_finished'
  | 'not_entitled'
  | 'rate_limited'
  | 'network'
  | 'failed';

export type StartNextProgramInput =
  | { choice: 'continue'; expectedPlanId: string; idempotencyKey: string }
  | {
      choice: 'rebuild';
      expectedPlanId: string;
      idempotencyKey: string;
      checkin: ProgramCheckinInput;
    };

function mapError(reason: string): StartNextProgramError {
  if (reason === 'plan_changed') return 'already_started';
  if (reason === 'program_not_complete') return 'not_finished';
  if (reason === 'not_entitled') return 'not_entitled';
  if (reason === 'rate_limited') return 'rate_limited';
  if (/network|fetch|timed? ?out|abort/i.test(reason)) return 'network';
  return 'failed';
}

export async function startNextProgram(
  input: StartNextProgramInput,
): Promise<{ ok: true; data: StartNextProgramResult } | { ok: false; error: StartNextProgramError }> {
  const body =
    input.choice === 'continue'
      ? {
          choice: input.choice,
          expected_plan_id: input.expectedPlanId,
          idempotency_key: input.idempotencyKey,
        }
      : {
          choice: input.choice,
          expected_plan_id: input.expectedPlanId,
          idempotency_key: input.idempotencyKey,
          checkin: input.checkin,
        };
  try {
    const { data, error } = await supabase.functions.invoke('start-next-program', {
      body,
      timeout: 20000,
    });
    if (error) {
      if (error instanceof FunctionsFetchError) return { ok: false, error: 'network' };
      return { ok: false, error: mapError(await extractInvokeError(null, error)) };
    }
    const parsed = startNextProgramResultSchema.safeParse(data);
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'network' };
  }
}
