// Engagement, settings and notifications. See docs/ANALYTICS.md §3.10.
//
// Notification permission is the highest-signal event in this file: denial
// correlates strongly with churn in a habit product, and it is the one thing
// here that the app cannot re-ask for.

import { z } from 'zod';

import { defineEvent, defineEventWithoutProperties } from './defineEvent';
import {
  appSessionEndReason,
  durationMs,
  feedbackCategory,
  feedbackSubmitFailureReason,
  homeEmptyStateReason,
  homeNudgeKey,
  legalDocument,
  notificationPurpose,
  progressChart,
  reviewPromptSkipReason,
  screenExitType,
  screenName,
  sourceScreen,
  uuid,
  weekNavigationDirection,
} from './enums';

const weekNumber = z.number().int().positive();
const count = z.number().int().nonnegative();

/**
 * One visit to one screen has ended. $screen is the enter; this is the leave,
 * and the only place dwell is known. Mirrors onboarding_step_exited, for every
 * route including onboarding — so product-usage charts have one table.
 */
export const screenExited = defineEvent(
  'screen_exited',
  z
    .object({
      screen_name: screenName,
      time_on_screen_ms: durationMs,
      exit_type: screenExitType,
      is_authenticated: z.boolean(),
      is_onboarded: z.boolean(),
      is_premium: z.boolean(),
      has_active_plan: z.boolean(),
      is_retaking: z.boolean(),
    })
    .strict(),
);

/**
 * One foreground period ended. Application Opened/Backgrounded can approximate
 * this, but unpaired lifecycle events and the SDK's own session clock are not
 * a dwell measurement. This is.
 */
export const appSessionEnded = defineEvent(
  'app_session_ended',
  z
    .object({
      duration_ms: durationMs,
      screen_count: count,
      ended_reason: appSessionEndReason,
      is_authenticated: z.boolean(),
      is_premium: z.boolean(),
    })
    .strict(),
);

/** Charts expose ranges as labels (14D/1M/3M); days make them comparable. */
export const progressRangeChanged = defineEvent(
  'progress_range_changed',
  z.object({ chart: progressChart, range_days: z.number().int().positive() }).strict(),
);

export const progressWeekNavigated = defineEvent(
  'progress_week_navigated',
  z.object({ direction: weekNavigationDirection, week_offset: z.number().int() }).strict(),
);

export const homeNudgeShown = defineEvent(
  'home_nudge_shown',
  z.object({ nudge_key: homeNudgeKey }).strict(),
);

export const homeNudgeTapped = defineEvent(
  'home_nudge_tapped',
  z.object({ nudge_key: homeNudgeKey }).strict(),
);

/** A dead end: the user opened the app to train and there is nothing to start. */
export const homeEmptyStateShown = defineEvent(
  'home_empty_state_shown',
  z.object({ reason: homeEmptyStateReason }).strict(),
);

/** Finished the three-slide mindset orientation before the first session. */
export const orientationCompleted = defineEvent(
  'orientation_completed',
  z.object({ slide_count: z.number().int().positive() }).strict(),
);

export const notificationPermissionRequested = defineEvent(
  'notification_permission_requested',
  z.object({ purpose: notificationPurpose }).strict(),
);

export const notificationPermissionGranted = defineEvent(
  'notification_permission_granted',
  z.object({ purpose: notificationPurpose }).strict(),
);

export const notificationPermissionDenied = defineEvent(
  'notification_permission_denied',
  z.object({ purpose: notificationPurpose }).strict(),
);

/** Time-of-day is a schedule preference, not PII. */
export const dailyReminderEnabled = defineEvent(
  'daily_reminder_enabled',
  z
    .object({
      hour: z.number().int().min(0).max(23),
      minute: z.number().int().min(0).max(59),
      purpose: notificationPurpose,
    })
    .strict(),
);

export const dailyReminderDisabled = defineEventWithoutProperties('daily_reminder_disabled');

export const stretchRemindersEnabled = defineEvent(
  'stretch_reminders_enabled',
  z
    .object({
      interval_minutes: z.number().int().positive(),
      start_hour: z.number().int().min(0).max(23),
      end_hour: z.number().int().min(0).max(23),
    })
    .strict(),
);

export const stretchRemindersDisabled = defineEventWithoutProperties('stretch_reminders_disabled');

/** The display name itself is never sent — only whether one now exists. */
export const displayNameUpdated = defineEvent(
  'display_name_updated',
  z.object({ has_name: z.boolean() }).strict(),
);

export const answersViewed = defineEvent(
  'answers_viewed',
  z.object({ source_screen: sourceScreen }).strict(),
);

/** Evidence that the documents were reachable, for App Store review. */
export const legalDocumentViewed = defineEvent(
  'legal_document_viewed',
  z.object({ document: legalDocument, source_screen: sourceScreen }).strict(),
);

/** Dev-only tool. Fires on internal accounts, which `is_internal` filters out. */
export const progressReset = defineEventWithoutProperties('progress_reset');

// --- App Store review prompt -------------------------------------------------
//
// Apple exposes no callback for whether the sheet rendered or whether a rating
// was submitted, and it silently discards requests past its 3-per-365-days cap.
// These three events are the entire funnel: `requested` is "we asked iOS",
// never "the user saw something".

/** `requestReview()` is about to be called. Says nothing about what iOS then did. */
export const reviewPromptRequested = defineEvent(
  'review_prompt_requested',
  z
    .object({
      source_screen: sourceScreen,
      /** Absent on the weekly ramp, which is keyed to a week rather than a session. */
      plan_session_id: uuid.optional(),
      week_number: weekNumber.optional(),
    })
    .strict(),
);

/** Every early return out of the prompt. `reason` is the debugging tool. */
export const reviewPromptSkipped = defineEvent(
  'review_prompt_skipped',
  z.object({ source_screen: sourceScreen, reason: reviewPromptSkipReason }).strict(),
);

/**
 * The settings row, which deep-links to the App Store write-review page. This is
 * deliberately not `requestReview()` — Apple disallows driving that API from a
 * button, and the automatic sheet is throttled and invisible.
 */
export const reviewManualTapped = defineEvent(
  'review_manual_tapped',
  z.object({ source_screen: sourceScreen }).strict(),
);

/**
 * In-app feedback submitted. The body is never sent — only category, optional
 * 1–5 rating, and character length. See docs/ANALYTICS.md §6.1.
 */
export const feedbackSubmitted = defineEvent(
  'feedback_submitted',
  z
    .object({
      category: feedbackCategory,
      rating: z.number().int().min(1).max(5).optional(),
      feedback_length: z.number().int().min(10).max(2000),
    })
    .strict(),
);

export const feedbackSubmitFailed = defineEvent(
  'feedback_submit_failed',
  z.object({ reason: feedbackSubmitFailureReason }).strict(),
);

/** Happy-path ask after a 4–5 rating. The write-review tap is `review_manual_tapped`. */
export const reviewAskShown = defineEvent(
  'review_ask_shown',
  z.object({ source_screen: sourceScreen, rating: z.number().int().min(4).max(5) }).strict(),
);
