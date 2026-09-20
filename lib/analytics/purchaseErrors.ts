// Collapses edge-function and StoreKit error strings onto the closed reason sets.
//
// verify-purchase and restore-purchases return an open, growing set of error
// strings, several of which embed a status code (`apple_api_error_503`). Sending
// them raw would make `reason` an unbounded breakdown dimension that grows every
// time Apple invents a failure. These mappers keep the dimension closed; anything
// unrecognised lands on `other` / `unknown`, which is a visible bucket rather than
// a silent new one.

import type { z } from 'zod';

import type {
  productId,
  purchaseVerificationFailureReason,
  restoreFailureReason,
} from './events/enums';

type VerificationReason = z.infer<typeof purchaseVerificationFailureReason>;
type RestoreReason = z.infer<typeof restoreFailureReason>;
type ProductId = z.infer<typeof productId>;

const VERIFICATION_REASONS: Readonly<Record<string, VerificationReason>> = {
  transaction_not_found: 'transaction_not_found',
  transaction_expired: 'transaction_expired',
  transaction_revoked: 'transaction_revoked',
  transaction_already_linked: 'transaction_already_linked',
  invalid_receipt: 'invalid_receipt',
  no_transaction_id: 'invalid_receipt',
  bundle_id_mismatch: 'invalid_receipt',
  product_id_mismatch: 'invalid_receipt',
  apple_credentials_missing: 'apple_unavailable',
  apple_auth_failed: 'apple_unavailable',
  apple_network_error: 'apple_unavailable',
  rate_limited: 'rate_limited',
  missing_auth: 'invalid_auth',
  invalid_auth: 'invalid_auth',
  idempotency_key_required: 'internal_error',
  invalid_json: 'internal_error',
  invalid_body: 'internal_error',
  internal_error: 'internal_error',
  unknown_error: 'other',
};

export function toVerificationReason(raw: string | null | undefined): VerificationReason {
  if (!raw) return 'other';
  const known = VERIFICATION_REASONS[raw];
  if (known !== undefined) return known;
  // apple_api_error_429, apple_api_error_503, jws_* — bucket rather than enumerate.
  if (raw.startsWith('apple_api_error_') || raw.startsWith('jws_')) return 'apple_unavailable';
  if (raw.includes('network') || raw.includes('timeout') || raw.includes('fetch')) return 'network';
  return 'other';
}

export function toRestoreReason(raw: string | null | undefined): RestoreReason {
  if (!raw) return 'unknown';
  if (raw === 'transaction_already_linked') return 'transaction_already_linked';
  if (raw === 'no_active_subscription' || raw === 'transaction_not_found') return 'no_transaction';
  if (raw.includes('network') || raw.includes('timeout') || raw.startsWith('apple_')) {
    return 'network';
  }
  return 'unknown';
}

const KNOWN_PRODUCTS: ReadonlySet<string> = new Set([
  'com.remedyapp.weekly',
  'com.remedyapp.monthly',
  'com.remedyapp.annual',
  'com.remedyapp.weekly.no.trial',
  'com.remedyapp.monthly.no.trial',
  'com.remedyapp.annual.no.trial',
]);

export function toProductId(raw: string | null | undefined): ProductId {
  if (raw && KNOWN_PRODUCTS.has(raw)) return raw as ProductId;
  return 'unknown';
}

export function toPlanInterval(
  raw: string | null | undefined,
): 'weekly' | 'monthly' | 'annual' | 'none' {
  if (!raw) return 'none';
  if (raw.includes('annual')) return 'annual';
  if (raw.includes('weekly')) return 'weekly';
  if (raw.includes('monthly')) return 'monthly';
  return 'none';
}
