// Monetization events — client layer. See docs/ANALYTICS.md §3.5.
//
// Everything here measures *intent and experience*, never money. Revenue and
// entitlement truth come from the server events in §3.6, because the client is
// lossy exactly when it matters most: the user force-quits between paying Apple
// and the app confirming it.

import { z } from 'zod';

import { defineEvent } from './defineEvent';
import {
  paywallEntryPoint,
  paywallResultType,
  placement,
  planInterval,
  productId,
  purchaseConfirmationFailureReason,
  purchaseConfirmationSource,
  purchaseFailureReason,
  purchaseVerificationFailureReason,
  restoreFailureReason,
  sourceScreen,
  transactionSource,
} from './enums';

/** Superwall experiment arm, bridged so variants are analyzable against retention. */
const variant = {
  paywall_variant_id: z.string().optional(),
  paywall_experiment_id: z.string().optional(),
};

export const paywallViewed = defineEvent(
  'paywall_viewed',
  z
    .object({
      placement,
      entry_point: paywallEntryPoint,
      is_superwall_available: z.boolean(),
    })
    .strict(),
);

/**
 * The gap between `paywall_viewed` and this is Superwall failing to render —
 * currently invisible, and the most expensive kind of invisible.
 */
export const paywallPresented = defineEvent(
  'paywall_presented',
  z.object({ placement, paywall_name: z.string().optional(), ...variant }).strict(),
);

export const paywallDismissed = defineEvent(
  'paywall_dismissed',
  z
    .object({
      placement,
      result_type: paywallResultType,
      paywall_variant_id: z.string().optional(),
    })
    .strict(),
);

export const purchaseStarted = defineEvent(
  'purchase_started',
  z
    .object({
      product_id: productId,
      placement,
      paywall_variant_id: z.string().optional(),
    })
    .strict(),
);

/** Client-side intent only — never used for revenue. */
export const purchaseFlowCompleted = defineEvent(
  'purchase_flow_completed',
  z
    .object({
      product_id: productId,
      plan_interval: planInterval,
      is_authenticated: z.boolean(),
      transaction_source: transactionSource,
      paywall_variant_id: z.string().optional(),
    })
    .strict(),
);

export const purchaseFailed = defineEvent(
  'purchase_failed',
  z
    .object({ reason: purchaseFailureReason, product_id: productId.optional() })
    .strict(),
);

/** The user paid and we lost the receipt — the most expensive failure in the app. */
export const purchaseConfirmationFailed = defineEvent(
  'purchase_confirmation_failed',
  z
    .object({
      reason: purchaseConfirmationFailureReason,
      source: purchaseConfirmationSource,
    })
    .strict(),
);

export const purchaseVerificationFailed = defineEvent(
  'purchase_verification_failed',
  z
    .object({
      reason: purchaseVerificationFailureReason,
      attempt: z.number().int().positive(),
    })
    .strict(),
);

export const restoreStarted = defineEvent(
  'restore_started',
  z.object({ source_screen: sourceScreen, is_authenticated: z.boolean() }).strict(),
);

export const restoreSucceeded = defineEvent(
  'restore_succeeded',
  z.object({ source_screen: sourceScreen, product_id: productId.optional() }).strict(),
);

export const restoreFailed = defineEvent(
  'restore_failed',
  z.object({ source_screen: sourceScreen, reason: restoreFailureReason }).strict(),
);