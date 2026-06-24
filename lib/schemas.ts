import { z } from 'zod';

// ---------------------------------------------------------------------------
// Central Zod schemas (client side).
//
// Single source of truth for runtime validation at boundaries: onboarding answer
// persistence and edge-function payloads. Mirrors the TypeScript types in
// `types/database.ts` and the Deno schemas in
// `supabase/functions/_shared/assignment/schema.ts`.
//
// FUTURE: when you add a new onboarding question, add its enum + field here and to the
// Deno schema; nothing else in the validation layer needs to change.
// ---------------------------------------------------------------------------

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
export const sessionsPerWeekSchema = z.number().int().min(3).max(5);

// Complete onboarding answers required to save + assign a program. Strict: extra keys
// are rejected so a stale field can never silently slip into the row.
export const onboardingAnswersInputSchema = z
  .object({
    pain_location: painLocationSchema,
    pain_duration: painDurationSchema,
    pain_type: painTypeSchema,
    activity_level: activityLevelSchema,
    pain_trigger: painTriggerSchema,
    equipment: equipmentSchema,
    main_goal: mainGoalSchema,
    sessions_per_week_preference: sessionsPerWeekSchema,
  })
  .strict();
export type OnboardingAnswersInput = z.infer<typeof onboardingAnswersInputSchema>;

// ---------------------------------------------------------------------------
// assign-program edge function payloads
// ---------------------------------------------------------------------------

export const planExerciseSchema = z.object({
  exercise_id: z.string(),
  order_index: z.number(),
  sets: z.number().nullable(),
  reps: z.number().nullable(),
  duration_seconds: z.number().nullable(),
  rest_seconds: z.number(),
  load_tier: z.number(),
  name: z.string().optional(),
});

export const planSessionSchema = z.object({
  week_number: z.number(),
  session_number: z.number(),
  title: z.string(),
  phase: z.string(),
  estimated_minutes: z.number(),
  intensity_tier: z.number(),
  exercises: z.array(planExerciseSchema),
});

// preview_only=true response (match screen).
export const planPreviewSchema = z.object({
  preview: z.literal(true).optional(),
  program_name: z.string(),
  subtitle: z.string().nullable(),
  tagline: z.string().nullable(),
  duration_weeks: z.number(),
  sessions_per_week: z.number(),
  primary_focus: z.string().optional(),
  secondary_focus: z.string().optional(),
  week_one: z.array(planSessionSchema),
  equipment_tier: equipmentSchema.optional(),
  pain_trigger: painTriggerSchema.optional(),
});
export type PlanPreview = z.infer<typeof planPreviewSchema>;

// Real assignment response (building screen).
export const assignResultSchema = z.object({
  plan_id: z.string(),
  program_name: z.string(),
  subtitle: z.string().nullable(),
  tagline: z.string().nullable(),
  duration_weeks: z.number(),
  sessions_per_week: z.number(),
  equipment_tier: equipmentSchema,
  week_one: z.array(planSessionSchema),
});
export type AssignResult = z.infer<typeof assignResultSchema>;
