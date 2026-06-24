import AsyncStorage from '@react-native-async-storage/async-storage';

// Bridges a purchase made on the paywall (where the user is still anonymous) to the
// account they create immediately after. The transaction is captured pre-signup,
// persisted here, then verified server-side once the user is authenticated. AsyncStorage
// (not in-memory) so it survives the app leaving for the email-confirmation round trip.

const KEY = 'remedy.pendingPurchase';

export type PendingPurchase = {
  originalTransactionId: string;
  productId: string;
  // Signed StoreKit JWS (purchaseToken). Lets the server fall back to cryptographic
  // verification when Apple's App Store Server API can't yet find the transaction
  // (common in sandbox). null when unavailable (e.g. captured via Superwall only).
  jws: string | null;
};

export async function setPendingPurchase(purchase: PendingPurchase): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(purchase));
  } catch {
    // Best-effort: a missed pending purchase is recoverable via restore-purchases.
  }
}

export async function getPendingPurchase(): Promise<PendingPurchase | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof parsed.originalTransactionId === 'string' &&
      typeof parsed.productId === 'string'
    ) {
      return {
        originalTransactionId: parsed.originalTransactionId,
        productId: parsed.productId,
        jws: typeof parsed.jws === 'string' ? parsed.jws : null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearPendingPurchase(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Ignore — verify-purchase is idempotent, so a stale entry is harmless.
  }
}
