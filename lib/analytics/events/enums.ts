// Closed value sets for every enumerated event property.
//
// Domain enums are derived from lib/schemas.ts rather than retyped, so the
// analytics contract cannot drift from what the app actually persists. Only
// analytics-specific vocabulary (exit types, failure reasons, placements) is
// declared here.
//
// Adding a value means adding it to docs/ANALYTICS.md §3.3.1 in the same commit.

import { z } from 'zod';

import {
  activityLevelSchema,
  equipmentSchema,
  feedbackCategorySchema,
  mainGoalSchema,
  painDurationSchema,
  painLocationSchema,
  painTriggerSchema,
  painTypeSchema,
  sessionsPerWeekSchema,
} from '../../schemas';
import { KNOWN_SCREENS, UNKNOWN_SCREEN } from '../routes';

// --- Derived from the persisted answer schemas -------------------------------

export const painLocation = painLocationSchema;
export const painDuration = painDurationSchema;
export const activityLevel = activityLevelSchema;
export const equipmentTier = equipmentSchema;

/** Single element of the multi-select arrays — we send one value, never the array. */
export const painType = painTypeSchema.element;
export const painTrigger = painTriggerSchema.element;
export const primaryGoal = mainGoalSchema.element;

/**
 * Derived, so it stays a ranged int rather than a literal union — the app
 * persists a number and a union here would force a cast at every call site that
 * asserts something the persisted type doesn't guarantee.
 */
export const sessionsPerWeek = sessionsPerWeekSchema;

// --- Onboarding --------------------------------------------------------------

/**
 * The members of ONBOARDING_FLOW plus the two post-quiz screens. Declared
 * literally rather than imported, because context/OnboardingContext.tsx imports
 * the onboarding events module and a value import here would be a runtime cycle.
 * A type-level assertion in ./onboarding.ts keeps the two in step.
 */
export const onboardingStepKey = z.enum([
  'welcome',
  'founder',
  'education',
  'q0',
  'safety',
  'q9',
  'recognize',
  'seen',
  'q6',
  'q1',
  'q2',
  'q3',
  'q4',
  'q5',
  'q7',
  'q8',
  'finalizing',
  'match',
]);
export type OnboardingStepKey = z.infer<typeof onboardingStepKey>;

/** q0 — the attribution question. Values from the option list in app/(onboarding)/q0.tsx. */
export const acquisitionSource = z.enum([
  'instagram',
  'facebook',
  'tiktok',
  'youtube',
  'google',
  'friend_family',
  'other',
]);

/** q9 — has the user tried to fix this before. */
export const priorAttempts = z.enum(['yes', 'no']);

/** recognize — which stuck-pain patterns feel true. */
export const recognizePattern = z.enum(['effort', 'return_loop', 'flinch', 'permanence']);

/**
 * How a funnel step was left. The whole point of this property is separating a
 * hard step from a user who got a phone call — without it, both look like churn.
 */
export const stepExitType = z.enum(['forward', 'backward', 'backgrounded', 'abandoned']);

/**
 * q8 — daily time commitment. Named rather than bare numbers because q8 has two
 * option groups and `"15"` next to `"3"` would be unreadable in a breakdown.
 */
export const sessionLength = z.enum(['minutes_15', 'minutes_20', 'minutes_30']);

/**
 * q8 — training frequency. Named rather than bare numbers so a days pick
 * (`days_4`) is distinct from session length (`minutes_15`) in breakdowns.
 * Legacy `every_day` / `every_other_day` stay valid for events already sent.
 */
export const trainingCadence = z.enum([
  'every_day',
  'every_other_day',
  'days_3',
  'days_4',
  'days_5',
  'days_6',
  'days_7',
]);

/**
 * Safety-gate legal checkbox. Not an OptionCard value — tracked through the
 * same option_selected event so assent and the yes/no red-flag answer stay
 * one breakdown (`step_key` + `option_value`).
 */
export const legalAssent = z.literal('legal_assent');

/** Every value an OptionCard (or the safety checkbox) can carry. */
export const optionValue = z.union([
  painLocation,
  painDuration,
  painType,
  activityLevel,
  painTrigger,
  equipmentTier,
  primaryGoal,
  acquisitionSource,
  priorAttempts,
  recognizePattern,
  sessionLength,
  trainingCadence,
  legalAssent,
]);

export const previewSource = z.enum(['server', 'fallback']);

export const onboardingValidationReason = z.enum(['incomplete_answers', 'session_expired']);

// --- Auth --------------------------------------------------------------------

export const authMethod = z.enum(['apple', 'google', 'email']);

/** Mapped from raw errors at the call site. The raw string is never sent. */
export const authFailureReason = z.enum([
  'cancelled',
  'invalid_credentials',
  'email_in_use',
  'weak_password',
  'network',
  'unavailable',
  'unknown',
]);

/** Mirrors the DeleteAccountError union in context/AuthContext.tsx. */
export const accountDeletionFailureReason = z.enum([
  'missing_auth',
  'invalid_auth',
  'rate_limited',
  'delete_failed',
  'request_failed',
]);

// --- Monetization ------------------------------------------------------------

export const paywallEntryPoint = z.enum(['onboarding', 'reconvert']);

export const paywallResultType = z.enum(['purchased', 'restored', 'declined', 'no_paywall']);

/**
 * `unknown` exists because product identifiers arrive from the StoreKit/Superwall
 * SDKs as plain strings. Mapping an unrecognised one to `unknown` keeps the
 * breakdown closed and makes a new product visible as a spike rather than as a
 * silently-added dimension.
 */
export const productId = z.enum([
  'com.remedyapp.weekly',
  'com.remedyapp.monthly',
  'com.remedyapp.annual',
  'com.remedyapp.weekly.no.trial',
  'com.remedyapp.monthly.no.trial',
  'com.remedyapp.annual.no.trial',
  'unknown',
]);
export type ProductId = z.infer<typeof productId>;

/** The single Superwall placement configured in the app. */
export const placement = z.enum(['onboarding_paywall']);

/** Server-side verification failures, collapsed from the edge function's error strings. */
export const purchaseVerificationFailureReason = z.enum([
  'transaction_not_found',
  'transaction_expired',
  'transaction_revoked',
  'transaction_already_linked',
  'invalid_receipt',
  'apple_unavailable',
  'rate_limited',
  'invalid_auth',
  'internal_error',
  'network',
  'other',
]);

export const programAssignmentFailureReason = z.enum([
  'assign_failed',
  'verify_purchase_failed',
  'incomplete_answers',
  'timeout',
  'unexpected_error',
]);

export const planInterval = z.enum(['weekly', 'monthly', 'annual', 'none']);

export const transactionSource = z.enum(['storekit', 'superwall_event', 'feature_gate']);

export const purchaseFailureReason = z.enum(['cancelled', 'declined', 'pending', 'unknown']);

export const purchaseConfirmationFailureReason = z.enum(['no_transaction', 'stash_failed']);

export const purchaseConfirmationSource = z.enum(['purchase', 'feature_gate']);

export const restoreFailureReason = z.enum([
  'no_transaction',
  'transaction_already_linked',
  'network',
  'unknown',
]);

// --- Core loop ---------------------------------------------------------------

/** Mirrors the Phase type in app/session/[id].tsx. */
export const sessionPhase = z.enum([
  'preview',
  'checkin_before',
  'exercise',
  'rest',
  'checkin_after',
  'complete',
]);

export const checkinType = z.enum(['before', 'after']);

/** The four `exercises.phase` values (migration 013). */
export const exercisePhase = z.enum(['mobility', 'activation', 'strength', 'recovery']);

/**
 * The `exercises.movement_pattern` values present in the catalog. The column is
 * `text`, so this set is measured rather than constrained by the database —
 * seeding a new pattern trips dev validation, which is the reminder to add it
 * here and to docs/ANALYTICS.md §3.8 together.
 */
export const movementPattern = z.enum([
  'core_activation',
  'glute_activation',
  'hip_hinge',
  'hip_mobility',
  'lower_body_strength',
  'lumbar_extension',
  'lumbar_mobility',
  'mobility_general',
  'posterior_chain_strength',
  'spinal_stability',
  'stretch_recovery',
  'thoracic_mobility',
]);

/** Catalog difficulty, 1–4. */
export const intensityTier = z.number().int().min(1).max(4);

export const videoFailureReason = z.enum(['url_fetch_failed', 'playback_error']);

/**
 * `not_current_session` is the pointer guard refusing a replay or deep link;
 * the other two mean the workout was done and the write genuinely failed.
 */
export const sessionCompletionFailureReason = z.enum([
  'not_current_session',
  'network',
  'rpc_error',
]);

/** Pain is recorded on a 1–10 scale. See docs/ANALYTICS.md §6.2. */
export const painScore = z.number().int().min(1).max(10);

export const sessionExitType = z.enum(['user_exit', 'backgrounded']);

export const sessionLoadFailureReason = z.enum(['not_found', 'no_exercises', 'network', 'unknown']);

export const restKind = z.enum(['set', 'exercise']);

// --- Engagement --------------------------------------------------------------

export const legalDocument = z.enum(['terms', 'privacy']);

/** One nudge exists today; the property keeps a second one from needing a new event. */
export const homeNudgeKey = z.enum(['notification_setup']);

/**
 * Why home has no session to start. `rest_day` and `session_done_today` are by
 * design; the other three are states we would want to see rise.
 */
export const homeEmptyStateReason = z.enum([
  'program_complete',
  'no_active_plan',
  'rest_day',
  'session_done_today',
  'no_session_available',
]);

export const notificationPurpose = z.enum(['daily_reminder', 'stretch_break', 'workout_reminder']);

/**
 * Why the native App Store review sheet was not requested.
 *
 * Apple gives no callback for whether the sheet appeared or whether the user
 * rated, so this breakdown is the only observability the rollout has. A spike in
 * `native_module_missing` or `build_gate_off` means the rollout is misconfigured
 * — users will never report that a popup failed to appear.
 */
/** In-app feedback category. Derived from lib/schemas.ts. */
export const feedbackCategory = feedbackCategorySchema;

export const feedbackSubmitFailureReason = z.enum([
  'rate_limited',
  'duplicate',
  'invalid_body',
  'request_failed',
]);

export const reviewPromptSkipReason = z.enum([
  'pain_not_improved',
  'dev',
  'build_gate_off',
  'not_ios',
  'flag_off',
  'threshold',
  'already_requested_for_trigger',
  'cooldown',
  'native_module_missing',
  'unavailable',
]);

export const progressChart = z.enum(['pain', 'activity']);

export const weekNavigationDirection = z.enum(['previous', 'next']);

export const rampSuggestion = z.enum(['progress', 'hold']);

/**
 * Route-pattern screen names. Derived from KNOWN_SCREENS so a new route cannot
 * be emitted as $screen and missed here. `unknown` is the clamp for anything
 * not on that list — see lib/analytics/routes.ts.
 */
export const screenName = z.enum([UNKNOWN_SCREEN, ...KNOWN_SCREENS]);
export type ScreenName = z.infer<typeof screenName>;

/** How a screen visit ended. `inactive` (app switcher glance) is not an exit. */
export const screenExitType = z.enum(['navigate', 'backgrounded']);

/** An app session is one foreground period. Only a real background ends it. */
export const appSessionEndReason = z.enum(['backgrounded']);

/**
 * Where an action was initiated from. Every interaction event carries this so the
 * same action fired from two surfaces stays distinguishable.
 */
export const sourceScreen = z.enum([
  'home',
  'progress',
  'profile',
  'match',
  'onboarding',
  'sign_in',
  'email',
  'onboarding_answers',
  'program_complete',
  'session',
  'building_plan',
  'weekly_ramp',
  'orientation',
  'feedback',
  // The legal screens themselves — legal_document_viewed fires on screen open so
  // views are counted even when the screen is reached by deep link or back-stack.
  'legal_screen',
]);

// --- Shared ------------------------------------------------------------------

export const uuid = z.string().uuid();

/** Non-negative elapsed time. Guards against a negative clock skew being sent. */
export const durationMs = z.number().int().nonnegative();
