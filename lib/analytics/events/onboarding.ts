// Onboarding funnel events. See docs/ANALYTICS.md §3.3.

import { z } from 'zod';

import type { OnboardingStep } from '../../../context/OnboardingContext';
import { defineEvent } from './defineEvent';
import {
  activityLevel,
  durationMs,
  equipmentTier,
  onboardingStepKey,
  onboardingValidationReason,
  optionValue,
  painDuration,
  painLocation,
  previewSource,
  primaryGoal,
  sessionsPerWeek,
  sourceScreen,
  stepExitType,
} from './enums';
import type { OnboardingStepKey } from './enums';

/**
 * Compile-time proof that every step in ONBOARDING_FLOW is a declared analytics
 * step key. Adding a step to the flow without adding it to `onboardingStepKey`
 * fails the build here rather than silently emitting an unknown value.
 */
type AssertAssignable<Actual extends Expected, Expected> = Actual;
export type OnboardingStepIsAnalyticsStep = AssertAssignable<OnboardingStep, OnboardingStepKey>;

const stepIndex = z.number().int().nonnegative();

/** Properties shared by every per-step event. */
const stepBase = {
  step_key: onboardingStepKey,
  step_index: stepIndex,
};

export const onboardingStarted = defineEvent(
  'onboarding_started',
  z
    .object({
      is_resume: z.boolean(),
      resume_step_key: onboardingStepKey.optional(),
      resume_step_index: stepIndex.optional(),
    })
    .strict(),
);

export const onboardingStepViewed = defineEvent(
  'onboarding_step_viewed',
  z.object({ ...stepBase, is_retake: z.boolean() }).strict(),
);

export const onboardingStepCompleted = defineEvent(
  'onboarding_step_completed',
  z
    .object({
      ...stepBase,
      time_on_step_ms: durationMs,
      is_retake: z.boolean(),
      answer_count: z.number().int().nonnegative().optional(),
    })
    .strict(),
);

export const onboardingStepExited = defineEvent(
  'onboarding_step_exited',
  z.object({ ...stepBase, time_on_step_ms: durationMs, exit_type: stepExitType }).strict(),
);

export const onboardingOptionSelected = defineEvent(
  'onboarding_option_selected',
  z
    .object({
      step_key: onboardingStepKey,
      option_value: optionValue,
      is_multi_select: z.boolean(),
      is_deselect: z.boolean(),
      selection_count: z.number().int().nonnegative().optional(),
    })
    .strict(),
);

export const onboardingHintShown = defineEvent(
  'onboarding_hint_shown',
  z.object({ step_key: onboardingStepKey, hint_key: z.string() }).strict(),
);

export const onboardingDisclaimerViewed = defineEvent(
  'onboarding_disclaimer_viewed',
  z.object({ equipment_tier: equipmentTier }).strict(),
);

export const onboardingDisclaimerConfirmed = defineEvent(
  'onboarding_disclaimer_confirmed',
  z.object({ equipment_tier: equipmentTier, time_on_step_ms: durationMs }).strict(),
);

export const onboardingPlanPreviewed = defineEvent(
  'onboarding_plan_previewed',
  z
    .object({
      preview_source: previewSource,
      duration_weeks: z.number().int().positive(),
      sessions_per_week: z.number().int().positive(),
      primary_focus: z.string().optional(),
      equipment_tier: equipmentTier.optional(),
    })
    .strict(),
);

/**
 * Sends the *primary* goal plus counts rather than the raw answer arrays. Keeps
 * cardinality flat and means a future free-text question cannot leak through this
 * event by being spread into it.
 */
export const onboardingCompleted = defineEvent(
  'onboarding_completed',
  z
    .object({
      pain_location: painLocation,
      pain_duration: painDuration,
      activity_level: activityLevel,
      equipment_tier: equipmentTier,
      primary_goal: primaryGoal,
      pain_type_count: z.number().int().positive(),
      pain_trigger_count: z.number().int().positive(),
      goal_count: z.number().int().positive(),
      sessions_per_week_preference: sessionsPerWeek,
      is_retake: z.boolean(),
      time_in_funnel_ms: durationMs.optional(),
    })
    .strict(),
);

export const onboardingValidationFailed = defineEvent(
  'onboarding_validation_failed',
  z
    .object({
      reason: onboardingValidationReason,
      missing_field_count: z.number().int().nonnegative(),
    })
    .strict(),
);

export const onboardingRetakeConfirmed = defineEvent(
  'onboarding_retake_confirmed',
  z.object({ source_screen: sourceScreen }).strict(),
);