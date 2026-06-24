import { z } from 'https://esm.sh/zod@3.23.8';

// Zod schemas for the assign-program edge function (Deno runtime).
//
// Mirrors the client schemas in `lib/schemas.ts`. Centralized here so future edge
// functions can reuse the same domain validators.

export const painLocationSchema = z.enum(['upper', 'lower', 'all']);
export const painDurationSchema = z.enum(['acute', 'subacute', 'chronic']);
// Multi-select: >=1 pain types. 'multiple' removed — multi-select replaces it.
export const painTypeSchema = z.array(z.enum(['stiffness', 'ache', 'sharp'])).min(1);
export const activityLevelSchema = z.enum(['sedentary', 'light', 'active', 'athlete']);
// Multi-select: >=1 pain triggers.
export const painTriggerSchema = z.array(
  z.enum(['sitting', 'bending', 'standing', 'morning', 'exercise', 'other']),
).min(1);
export const equipmentSchema = z.enum(['open_space', 'bands_dumbbells', 'gym']);
// Multi-select: >=1 goals.
export const mainGoalSchema = z.array(
  z.enum(['reduce_pain', 'return_to_exercise', 'sleep', 'mobility']),
).min(1);

export const answersSchema = z
  .object({
    pain_location: painLocationSchema,
    pain_duration: painDurationSchema,
    pain_type: painTypeSchema,
    activity_level: activityLevelSchema,
    pain_trigger: painTriggerSchema,
    equipment: equipmentSchema,
    main_goal: mainGoalSchema,
    sessions_per_week_preference: z.number().int().min(3).max(5).nullable(),
  })
  .strict();

export const requestSchema = z
  .object({
    user_id: z.string().uuid().optional(),
    start_week: z.number().int().min(1).max(52).optional(),
    preview_only: z.boolean().optional(),
    answers: answersSchema.optional(),
  })
  .strict();

// Output guard — validate the engine's resolved plan before persisting/returning.
export const resolvedExerciseSchema = z.object({
  exercise_id: z.string(),
  order_index: z.number(),
  sets: z.number().nullable(),
  reps: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  rest_seconds: z.number(),
  load_tier: z.number(),
});

export const resolvedSessionSchema = z.object({
  week_number: z.number(),
  session_number: z.number(),
  title: z.string(),
  phase: z.string(),
  estimated_minutes: z.number(),
  intensity_tier: z.number(),
  exercises: z.array(resolvedExerciseSchema),
});

export const resolvedPlanSchema = z.object({
  program_name: z.string(),
  subtitle: z.string().nullable(),
  tagline: z.string().nullable(),
  duration_weeks: z.number(),
  sessions_per_week: z.number(),
  start_week: z.number(),
  rules_version: z.number(),
  primary_focus: z.string(),
  secondary_focus: z.string(),
  sessions: z.array(resolvedSessionSchema),
});
