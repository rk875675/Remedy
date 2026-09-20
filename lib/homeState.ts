import { z } from 'zod';

import { supabase } from './supabase';
import type { UserPlanSession, UserProgram } from '../types/database';

const userProgramSchema = z
  .object({
    id: z.string(),
    user_id: z.string(),
    program_id: z.string(),
    started_at: z.string().nullable(),
    current_week: z.number().int(),
    current_session: z.number().int(),
    active_plan_id: z.string().nullable(),
    pending_apply_week: z.number().int().nullable().optional(),
  })
  .passthrough();

const planSessionSchema = z
  .object({
    id: z.string(),
    plan_id: z.string(),
    week_number: z.number().int(),
    session_number: z.number().int(),
    title: z.string(),
    phase: z.string(),
    estimated_minutes: z.number(),
    intensity_tier: z.number(),
  })
  .passthrough();

const weekSessionSchema = z
  .object({
    session_number: z.number().int(),
    title: z.string(),
    phase: z.string(),
    estimated_minutes: z.number(),
  })
  .strict();

const peekSchema = z
  .object({
    id: z.string(),
    week_number: z.number().int(),
    session_number: z.number().int(),
  })
  .strict();

export const homeStateSchema = z
  .object({
    is_dev: z.boolean(),
    display_name: z.string().nullable(),
    user_program: userProgramSchema.nullable(),
    plan: z
      .object({
        duration_weeks: z.number().int(),
        sessions_per_week: z.number().int(),
        start_week: z.number().int(),
      })
      .strict()
      .nullable(),
    pending_ramp_week: z.number().int().nullable(),
    display_week: z.number().int().nullable(),
    display_session: z.number().int().nullable(),
    display_plan_session: planSessionSchema.nullable(),
    display_exercise_count: z.number().int(),
    pointer_plan_session: planSessionSchema.nullable(),
    pointer_exercise_count: z.number().int(),
    week_completions: z.array(z.object({ completed_at: z.string() }).strict()),
    week_sessions: z.array(weekSessionSchema),
    equipment: z.string().nullable(),
    next_week_peek: peekSchema.nullable(),
  })
  .strict();

export type HomeState = z.infer<typeof homeStateSchema>;

export function asUserProgram(row: HomeState['user_program']): UserProgram | null {
  return row as UserProgram | null;
}

export function asPlanSession(row: HomeState['display_plan_session']): UserPlanSession | null {
  return row as UserPlanSession | null;
}

export async function fetchHomeState(devDayOffset: number): Promise<HomeState | null> {
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  const { data, error } = await supabase.rpc('get_home_state', {
    p_week_monday: monday.toISOString(),
    p_dev_day_offset: Number.isFinite(devDayOffset) ? Math.trunc(devDayOffset) : 0,
  });

  if (error || data == null) return null;
  const parsed = homeStateSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}
