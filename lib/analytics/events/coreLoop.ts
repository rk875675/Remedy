// Core loop events — the session player. See docs/ANALYTICS.md §3.8.
//
// This is the churn-defining loop: a user who stops completing sessions has
// churned, so `session_completed` is the north-star numerator and every step
// before it is a funnel stage worth its own event.
//
// `plan_session_id` and `exercise_id` are sent for per-entity drill-down. Only
// `exercise_id` is a sanctioned *breakdown* dimension — the catalog is ~30 rows,
// while plan sessions are per-user and unbounded.

import { z } from 'zod';

import { defineEvent } from './defineEvent';
import {
  checkinType,
  durationMs,
  exercisePhase,
  intensityTier,
  movementPattern,
  painScore,
  restKind,
  sessionCompletionFailureReason,
  sessionExitType,
  sessionLoadFailureReason,
  sessionPhase,
  sourceScreen,
  uuid,
  videoFailureReason,
} from './enums';

const count = z.number().int().nonnegative();
const positionalIndex = z.number().int().nonnegative();
const weekNumber = z.number().int().positive();
const sessionNumber = z.number().int().positive();

export const sessionStartTapped = defineEvent(
  'session_start_tapped',
  z
    .object({
      source_screen: sourceScreen,
      week_number: weekNumber,
      session_number: sessionNumber,
    })
    .strict(),
);

export const sessionPreviewed = defineEvent(
  'session_previewed',
  z
    .object({
      plan_session_id: uuid,
      week_number: weekNumber,
      session_number: sessionNumber,
      exercise_count: count,
      estimated_minutes: count,
      phase: exercisePhase,
    })
    .strict(),
);

/** `is_first_session` is what makes activation measurable — see §1.3. */
export const sessionStarted = defineEvent(
  'session_started',
  z
    .object({
      plan_session_id: uuid,
      week_number: weekNumber,
      session_number: sessionNumber,
      exercise_count: count,
      pain_before: painScore,
      is_first_session: z.boolean(),
    })
    .strict(),
);

/**
 * The one health-adjacent field in the taxonomy, sent deliberately: PRD §10
 * measures success as "avg pain improvement > 1.5 points", which is
 * unanswerable without it. A 1–10 score with no free text and no body detail.
 * See docs/ANALYTICS.md §6.2 for the App Store disclosure this implies.
 */
export const painCheckinSubmitted = defineEvent(
  'pain_checkin_submitted',
  z
    .object({
      checkin_type: checkinType,
      score: painScore,
      plan_session_id: uuid,
      week_number: weekNumber,
    })
    .strict(),
);

export const exerciseStarted = defineEvent(
  'exercise_started',
  z
    .object({
      exercise_id: uuid,
      exercise_index: positionalIndex,
      exercise_count: count,
      plan_session_id: uuid,
      movement_pattern: movementPattern,
      phase: exercisePhase,
      intensity_tier: intensityTier,
      sets: count.optional(),
      reps: count.optional(),
      duration_seconds: count.optional(),
    })
    .strict(),
);

export const exerciseSetCompleted = defineEvent(
  'exercise_set_completed',
  z
    .object({
      exercise_id: uuid,
      set_index: z.number().int().positive(),
      set_count: z.number().int().positive(),
      time_on_set_ms: durationMs,
    })
    .strict(),
);

export const exerciseCompleted = defineEvent(
  'exercise_completed',
  z
    .object({
      exercise_id: uuid,
      exercise_index: positionalIndex,
      duration_ms: durationMs,
      sets_completed: count,
    })
    .strict(),
);

/** Which exercises get skipped is direct content feedback on the catalog. */
export const exerciseSkipped = defineEvent(
  'exercise_skipped',
  z
    .object({
      exercise_id: uuid,
      /** Catalog display name — the Monday-readable breakdown (~30 rows). */
      exercise_name: z.string().min(1).max(80),
      exercise_index: positionalIndex,
      set_index: z.number().int().positive(),
      time_on_exercise_ms: durationMs,
    })
    .strict(),
);

export const restSkipped = defineEvent(
  'rest_skipped',
  z.object({ rest_kind: restKind, remaining_seconds: count }).strict(),
);

export const sessionCompleted = defineEvent(
  'session_completed',
  z
    .object({
      plan_session_id: uuid,
      week_number: weekNumber,
      session_number: sessionNumber,
      duration_seconds: count,
      exercise_count: count,
      skipped_exercise_count: count,
      pain_before: painScore,
      pain_after: painScore,
      /** after − before. Negative means the pain improved. */
      pain_delta: z.number().int(),
      ended_week: z.boolean(),
      program_done: z.boolean(),
      is_first_session: z.boolean(),
    })
    .strict(),
);

/** Mid-session churn, which writes nothing anywhere today and is invisible. */
export const sessionAbandoned = defineEvent(
  'session_abandoned',
  z
    .object({
      plan_session_id: uuid,
      phase_key: sessionPhase,
      exercise_index: positionalIndex,
      elapsed_ms: durationMs,
      exit_type: sessionExitType,
      week_number: weekNumber.optional(),
    })
    .strict(),
);

export const sessionLoadFailed = defineEvent(
  'session_load_failed',
  z.object({ reason: sessionLoadFailureReason, plan_session_id: uuid.optional() }).strict(),
);

/** The user finished the workout and we lost it. */
export const sessionCompletionFailed = defineEvent(
  'session_completion_failed',
  z.object({ reason: sessionCompletionFailureReason, plan_session_id: uuid }).strict(),
);

/** Never carries the signed video URL — only which exercise and how it failed. */
export const exerciseVideoFailed = defineEvent(
  'exercise_video_failed',
  z.object({ exercise_id: uuid, reason: videoFailureReason }).strict(),
);
