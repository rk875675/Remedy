import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PromoCodeType } from './promoCodes';

// Bridges a promo code validated on the paywall (where the user is still anonymous)
// to the account they create immediately after. Mirrors lib/pendingPurchase.ts:
// the code is stashed pre-signup, then redeemed server-side once the user is
// authenticated (building-plan). AsyncStorage so it survives the email-confirmation
// round trip. Only `code` is required — the server re-validates everything on redeem.

const KEY = 'remedy.pendingPromo';

const PROMO_TYPES: readonly PromoCodeType[] = [
  'months_free',
  'weeks_free',
  'minutes_free',
  'lifetime',
];

function isPromoCodeType(value: unknown): value is PromoCodeType {
  return typeof value === 'string' && (PROMO_TYPES as readonly string[]).includes(value);
}

export type PendingPromo = {
  code: string;
  type: PromoCodeType | null;
  months: number | null;
  weeks: number | null;
  minutes: number | null;
  creatorName: string | null;
  creatorSlug: string | null;
  validatedAt: string;
};

export async function setPendingPromo(promo: PendingPromo): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(promo));
  } catch {
    // Best-effort: the nav-param fallback re-saves the stash on the signup screen.
  }
}

export async function getPendingPromo(): Promise<PendingPromo | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.code === 'string' &&
      parsed.code.length > 0
    ) {
      return {
        code: parsed.code,
        type: isPromoCodeType(parsed.type) ? parsed.type : null,
        months: typeof parsed.months === 'number' ? parsed.months : null,
        weeks: typeof parsed.weeks === 'number' ? parsed.weeks : null,
        minutes: typeof parsed.minutes === 'number' ? parsed.minutes : null,
        creatorName: typeof parsed.creatorName === 'string' ? parsed.creatorName : null,
        creatorSlug: typeof parsed.creatorSlug === 'string' ? parsed.creatorSlug : null,
        validatedAt: typeof parsed.validatedAt === 'string' ? parsed.validatedAt : '',
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearPendingPromo(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Ignore — redeem is idempotent, so a stale entry is harmless.
  }
}
