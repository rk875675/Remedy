import { supabase } from './supabase';
import { extractInvokeError } from './functionsError';

// Client half of the creator promo system. Both calls hit the promo-codes edge
// function; the server is the source of truth (uniform { valid: false } for every
// bad code, idempotent redeem via the redeem_promo_code RPC).

export type PromoCodeType = 'months_free' | 'weeks_free' | 'minutes_free' | 'lifetime';

export type PromoValidation =
  | {
      valid: true;
      code: string;
      type: PromoCodeType;
      months: number | null;
      weeks: number | null;
      minutes: number | null;
      creator: { name: string; slug: string };
    }
  | { valid: false; alreadyUsed?: boolean }
  // Network / server failure — distinct from "not a backend code": the caller must
  // show the network copy and must NOT fall through to the Apple offer-code pane.
  | { valid: null };

export async function validatePromoCode(code: string): Promise<PromoValidation> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      valid?: boolean;
      already_used?: boolean;
      code?: string;
      type?: PromoCodeType;
      months?: number | null;
      weeks?: number | null;
      minutes?: number | null;
      creator?: { name: string; slug: string };
    }>('promo-codes/validate', { body: { code: code.trim() } });
    if (error) return { valid: null };
    if (data?.valid === true && data.code && data.type && data.creator) {
      return {
        valid: true,
        code: data.code,
        type: data.type,
        months: data.months ?? null,
        weeks: data.weeks ?? null,
        minutes: data.minutes ?? null,
        creator: data.creator,
      };
    }
    if (data?.valid === false) {
      return { valid: false, alreadyUsed: data.already_used === true };
    }
    return { valid: null };
  } catch {
    return { valid: null };
  }
}

export type PromoRedeemResult =
  | {
      redeemed: true;
      alreadyRedeemed: boolean;
      expiresAt: string | null;
    }
  | {
      redeemed: false;
      // ALREADY_ENTITLED counts as access for the caller; the rest are failures.
      error:
        | 'INVALID_CODE'
        | 'CODE_FULLY_REDEEMED'
        | 'ALREADY_ENTITLED'
        | 'network'
        | 'unknown';
    };

export async function redeemPromoCode(code: string): Promise<PromoRedeemResult> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      redeemed?: boolean;
      already_redeemed?: boolean;
      expires_at?: string | null;
      error?: string;
    }>('promo-codes/redeem', { body: { code: code.trim() } });
    if (data?.redeemed === true) {
      return {
        redeemed: true,
        alreadyRedeemed: data.already_redeemed === true,
        expiresAt: data.expires_at ?? null,
      };
    }
    const reason = await extractInvokeError(data ?? null, error);
    if (
      reason === 'INVALID_CODE' ||
      reason === 'CODE_FULLY_REDEEMED' ||
      reason === 'ALREADY_ENTITLED'
    ) {
      return { redeemed: false, error: reason };
    }
    if (error && reason === 'unknown_error') return { redeemed: false, error: 'network' };
    return { redeemed: false, error: 'unknown' };
  } catch {
    return { redeemed: false, error: 'network' };
  }
}
