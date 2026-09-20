// Authentication events. See docs/ANALYTICS.md §3.4.

import { z } from 'zod';

import { defineEvent, defineEventWithoutProperties } from './defineEvent';
import {
  accountDeletionFailureReason,
  authFailureReason,
  authMethod,
  durationMs,
  sourceScreen,
} from './enums';

const attemptBase = {
  method: authMethod,
  source_screen: sourceScreen,
  /**
   * Isolates the post-paywall signup — the user has already paid and an auth
   * failure here loses a paying customer, so it needs its own funnel.
   */
  has_pending_purchase: z.boolean(),
};

const attemptStarted = z.object(attemptBase).strict();
const attemptCompleted = z.object({ method: authMethod, duration_ms: durationMs.optional() }).strict();
const attemptFailed = z.object({ method: authMethod, reason: authFailureReason }).strict();

export const signupStarted = defineEvent('signup_started', attemptStarted);
export const signupCompleted = defineEvent('signup_completed', attemptCompleted);
export const signupFailed = defineEvent('signup_failed', attemptFailed);

export const signinStarted = defineEvent('signin_started', attemptStarted);
export const signinCompleted = defineEvent('signin_completed', attemptCompleted);
export const signinFailed = defineEvent('signin_failed', attemptFailed);

export const passwordResetRequested = defineEvent(
  'password_reset_requested',
  z.object({ source_screen: sourceScreen }).strict(),
);

export const passwordResetCompleted = defineEventWithoutProperties('password_reset_completed');

export const signedOut = defineEvent(
  'signed_out',
  z.object({ source_screen: sourceScreen }).strict(),
);

export const accountDeletionFailed = defineEvent(
  'account_deletion_failed',
  z.object({ reason: accountDeletionFailureReason }).strict(),
);
