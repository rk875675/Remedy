// Program lifecycle: assignment (§3.7), the weekly ramp, and completion (§3.9).
//
// Stays client-side: none of this is revenue or an entitlement, so it does not
// meet the bar for the server truth layer, and only the client can measure the
// latency the user actually waited through.

import { z } from 'zod';

import { defineEvent } from './defineEvent';
import {
  durationMs,
  equipmentTier,
  programAssignmentFailureReason,
  rampSuggestion,
  uuid,
} from './enums';

export const programAssignmentStarted = defineEvent(
  'program_assignment_started',
  z.object({ is_retake: z.boolean() }).strict(),
);

export const programAssigned = defineEvent(
  'program_assigned',
  z
    .object({
      plan_id: uuid,
      duration_weeks: z.number().int().positive(),
      sessions_per_week: z.number().int().positive(),
      equipment_tier: equipmentTier,
      is_retake: z.boolean(),
      duration_ms: durationMs,
      primary_focus: z.string().optional(),
    })
    .strict(),
);

export const programAssignmentFailed = defineEvent(
  'program_assignment_failed',
  z.object({ reason: programAssignmentFailureReason, is_retake: z.boolean() }).strict(),
);

// --- Weekly ramp and completion (§3.9) ---------------------------------------

const weekNumber = z.number().int().positive();
/**
 * Average pain improvement across the week. Null when the week has too few
 * paired check-ins to compute one — a real state, distinct from zero change.
 */
const painDelta = z.number().nullable();

export const weeklyRampSuggested = defineEvent(
  'weekly_ramp_suggested',
  z
    .object({ week_number: weekNumber, suggestion: rampSuggestion, pain_delta: painDelta })
    .strict(),
);

/** `followed_suggestion` is the question: do users trust the ramp advice? */
export const weeklyRampDecided = defineEvent(
  'weekly_ramp_decided',
  z
    .object({
      week_number: weekNumber,
      suggestion: rampSuggestion,
      decision: rampSuggestion,
      followed_suggestion: z.boolean(),
      pain_delta: painDelta,
    })
    .strict(),
);

/**
 * No `duration_weeks`: the completion screen never loads the program length, and
 * inventing it from a default would put a wrong number in the taxonomy.
 */
export const programCompleted = defineEvent(
  'program_completed',
  z
    .object({
      sessions_completed_count: z.number().int().nonnegative(),
      days_active_count: z.number().int().nonnegative(),
    })
    .strict(),
);

export const programRestarted = defineEvent(
  'program_restarted',
  z.object({ source_screen: z.literal('program_complete') }).strict(),
);
