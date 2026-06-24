import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

// Bridges StoreKit (via expo-iap) to our server-side verification. Superwall presents
// the paywall and runs the StoreKit purchase; afterwards we read the resulting
// transaction here to get the real original transaction id + signed JWS, which are what
// verify-purchase / restore-purchases need. Guarded like lib/superwall so Expo Go (no
// native module) degrades gracefully instead of crashing.

const REMEDY_PRODUCT_IDS = ['com.remedyapp.monthly', 'com.remedyapp.annual'];

export type IosTransaction = {
  originalTransactionId: string;
  productId: string;
  jws: string | null;
};

const hasIapNative = !!requireOptionalNativeModule('ExpoIap');

let iap: typeof import('expo-iap') | null = null;
if (hasIapNative) {
  try {
    iap = require('expo-iap');
  } catch {
    iap = null;
  }
}

export const IAP_AVAILABLE = hasIapNative && iap !== null;

let connected = false;
async function ensureConnection(): Promise<boolean> {
  if (!iap) return false;
  if (connected) return true;
  try {
    await iap.initConnection();
    connected = true;
  } catch {
    connected = false;
  }
  return connected;
}

function toIosTransaction(p: unknown): IosTransaction | null {
  const purchase = p as {
    productId?: string;
    originalTransactionIdentifierIOS?: string | null;
    purchaseToken?: string | null;
  };
  if (!purchase.productId || !REMEDY_PRODUCT_IDS.includes(purchase.productId)) return null;
  // Rule: only trust a field whose name contains "original" for the original
  // transaction id. Other ids can be JWS blobs on some SDK paths and 404 against
  // Apple's App Store Server API.
  const original = purchase.originalTransactionIdentifierIOS;
  if (!original) return null;
  return {
    originalTransactionId: String(original),
    productId: purchase.productId,
    jws: typeof purchase.purchaseToken === 'string' ? purchase.purchaseToken : null,
  };
}

// Most recent Remedy subscription transaction (original id + signed JWS) held by
// StoreKit, or null (Expo Go / non-iOS / nothing purchased).
export async function getLatestRemedyTransaction(): Promise<IosTransaction | null> {
  if (Platform.OS !== 'ios' || !iap) return null;
  if (!(await ensureConnection())) return null;
  try {
    const purchases = await iap.getAvailablePurchases();
    const remedy = purchases
      .map(toIosTransaction)
      .filter((t): t is IosTransaction => t !== null);
    return remedy.length > 0 ? remedy[remedy.length - 1] : null;
  } catch {
    return null;
  }
}

// Triggers a StoreKit restore sync, then returns the restored transaction (if any).
export async function restoreRemedyTransaction(): Promise<IosTransaction | null> {
  if (Platform.OS !== 'ios' || !iap) return null;
  if (!(await ensureConnection())) return null;
  try {
    await iap.restorePurchases();
  } catch {
    // Best-effort sync; the query below still surfaces existing entitlements.
  }
  return getLatestRemedyTransaction();
}
