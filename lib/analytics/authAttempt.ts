// Auth attempt tracking.
//
// Supabase's onAuthStateChange cannot tell a new signup from a returning
// sign-in — both arrive as the same SIGNED_IN event with no marker. Only the
// screen that started the flow knows the intent, so it is recorded here at flow
// start and consumed after identify() fires.
//
// Consuming it post-identify matters: firing the completion event from the auth
// screen would race the identify() call, and a signup that lands on the
// anonymous person instead of the identified one silently breaks the entire
// acquisition funnel.

import { useEffect, useState } from 'react';
import type { z } from 'zod';

import { getPendingPurchase } from '../pendingPurchase';
import {
  signinCompleted,
  signinFailed,
  signinStarted,
  signupCompleted,
  signupFailed,
  signupStarted,
} from './events/auth';
import type { authFailureReason, authMethod, sourceScreen } from './events/enums';
import { setPersonProperties } from './facade';

type AuthMethod = z.infer<typeof authMethod>;
type SourceScreen = z.infer<typeof sourceScreen>;
type FailureReason = z.infer<typeof authFailureReason>;

type Attempt = { isSignUp: boolean; method: AuthMethod; startedAt: number };

let pending: Attempt | null = null;

export function beginAuthAttempt(params: {
  isSignUp: boolean;
  method: AuthMethod;
  sourceScreen: SourceScreen;
  hasPendingPurchase: boolean;
}): void {
  pending = { isSignUp: params.isSignUp, method: params.method, startedAt: Date.now() };

  const properties = {
    method: params.method,
    source_screen: params.sourceScreen,
    has_pending_purchase: params.hasPendingPurchase,
  };
  if (params.isSignUp) signupStarted(properties);
  else signinStarted(properties);
}

export function failAuthAttempt(reason: FailureReason): void {
  const attempt = pending;
  pending = null;
  if (attempt === null) return;

  const properties = { method: attempt.method, reason };
  if (attempt.isSignUp) signupFailed(properties);
  else signinFailed(properties);
}

/** Discards the attempt without emitting. */
export function abandonAuthAttempt(): void {
  pending = null;
}

/**
 * Maps a provider or Supabase error onto the closed reason set.
 *
 * The message is inspected only to classify it and is never sent — Supabase auth
 * messages are free text and can echo back a user-supplied email. Only the
 * resulting enum value leaves this function. See docs/ANALYTICS.md §6.1.
 */
export function classifyAuthError(error: unknown): FailureReason {
  const err = error as { code?: string; message?: string } | null;
  if (err === null || typeof err !== 'object') return 'unknown';

  switch (err.code) {
    case 'ERR_REQUEST_CANCELED':
    case 'ERR_CANCELED':
    case 'SIGN_IN_CANCELLED':
      return 'cancelled';
    case 'invalid_credentials':
      return 'invalid_credentials';
    case 'user_already_exists':
    case 'email_exists':
      return 'email_in_use';
    case 'weak_password':
      return 'weak_password';
    case 'over_request_rate_limit':
    case 'request_timeout':
      return 'network';
    default:
      break;
  }

  const message = (err.message ?? '').toLowerCase();
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'email_in_use';
  }
  if (message.includes('invalid login') || message.includes('invalid credentials')) {
    return 'invalid_credentials';
  }
  if (message.includes('password') && (message.includes('at least') || message.includes('weak'))) {
    return 'weak_password';
  }
  if (message.includes('network') || message.includes('timeout') || message.includes('fetch')) {
    return 'network';
  }
  if (message.includes('unavailable') || message.includes('not available')) {
    return 'unavailable';
  }
  return 'unknown';
}

/** Signup method on the in-flight attempt, if any. Used so identify() can $set it. */
export function pendingSignupMethod(): AuthMethod | null {
  return pending?.isSignUp === true ? pending.method : null;
}

/** Called by the identity sync immediately after identify(). */
export function completeAuthAttempt(): void {
  const attempt = pending;
  pending = null;
  if (attempt === null) return;

  const properties = {
    method: attempt.method,
    duration_ms: Math.max(0, Date.now() - attempt.startedAt),
  };
  if (attempt.isSignUp) {
    // Belt-and-suspenders with identify(..., { signup_method }). The identify()
    // $set is the one that actually lands; this covers a later client bind.
    setPersonProperties({ signup_method: attempt.method });
    signupCompleted(properties);
  } else {
    signinCompleted(properties);
  }
}

/**
 * Whether a paywall purchase is waiting to be attached to an account. Lives here
 * so the two auth screens need one line each rather than their own effect.
 */
export function useHasPendingPurchase(): boolean {
  const [hasPending, setHasPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPendingPurchase().then((purchase) => {
      if (!cancelled) setHasPending(purchase !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return hasPending;
}
