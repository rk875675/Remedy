import {
  SignJWT,
  importPKCS8,
  decodeProtectedHeader,
  importX509,
  compactVerify,
} from 'https://esm.sh/jose@5';
import { X509Certificate, cryptoProvider } from 'https://esm.sh/@peculiar/x509@1';

// @peculiar/x509 needs a WebCrypto engine; Deno's global crypto implements SubtleCrypto.
cryptoProvider.set(crypto as unknown as Crypto);

const BUNDLE_ID = 'com.remedyappco.ios';
// Must cover every product the Superwall paywall can sell — the live paywall uses the
// `.no.trial` variants; rejecting them here fails verification after a real purchase.
const ALLOWED_PRODUCT_IDS = new Set([
  'com.remedyapp.weekly',
  'com.remedyapp.monthly',
  'com.remedyapp.annual',
  'com.remedyapp.weekly.no.trial',
  'com.remedyapp.monthly.no.trial',
  'com.remedyapp.annual.no.trial',
]);
const APPLE_AUD = 'appstoreconnect-v1';
const APPLE_PROD_BASE = 'https://api.storekit.itunes.apple.com';
const APPLE_SANDBOX_BASE = 'https://api.storekit-sandbox.itunes.apple.com';

// SHA-256 fingerprint of the Apple Root CA - G3 certificate (public, fetched from
// https://www.apple.com/certificateauthority/AppleRootCA-G3.cer). The signed JWS x5c
// chain MUST terminate at this exact root, or we reject it.
const APPLE_ROOT_G3_SHA256 =
  '63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179';

export interface AppleVerifyResult {
  valid: boolean;
  error?: string;
  productId?: string;
  expiresDate?: number;
  inTrialPeriod?: boolean;
  // Apple's stable per-subscription identifier. Used to bind one subscription to one
  // account (anti-fraud) — never the client-supplied transactionId.
  originalTransactionId?: string;
  // Informational only (from the transaction's `environment` claim). Recorded on the
  // entitlement row for visibility; NEVER a reason to reject a grant.
  isSandbox?: boolean;
  // Apple's verified price in **milliunits** of `currency` (12.99 USD → 12990), plus the
  // ISO 4217 code. Analytics-only: preferred over a hardcoded price table so a change in
  // App Store Connect can't silently rot our revenue numbers. Absent on older transactions.
  priceMilliunits?: number;
  currency?: string;
}

async function buildAppleAuthJwt(
  issuerId: string,
  keyId: string,
  privateKeyPem: string,
): Promise<string> {
  const privateKey = await importPKCS8(privateKeyPem, 'ES256');
  // Custom claims belong in the SignJWT constructor payload (jose has no .claim()).
  return new SignJWT({ bid: BUNDLE_ID })
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuerId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .setAudience(APPLE_AUD)
    .sign(privateKey);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function validateTransactionClaims(tx: Record<string, unknown>): AppleVerifyResult {
  if (tx['bundleId'] !== BUNDLE_ID) {
    return { valid: false, error: 'bundle_id_mismatch' };
  }

  const productId = tx['productId'] as string | undefined;
  if (!productId || !ALLOWED_PRODUCT_IDS.has(productId)) {
    return { valid: false, error: 'product_id_mismatch' };
  }

  if (tx['revocationDate']) {
    return { valid: false, error: 'transaction_revoked' };
  }

  const expiresDate = tx['expiresDate'] as number | undefined;
  if (expiresDate !== undefined && expiresDate < Date.now()) {
    return { valid: false, error: 'transaction_expired' };
  }

  // offerType 1 = introductory offer; offerDiscountType FREE_TRIAL distinguishes
  // free trials from paid intro-price periods.
  const inTrialPeriod =
    tx['offerType'] === 1 && tx['offerDiscountType'] === 'FREE_TRIAL';

  const originalTransactionId = tx['originalTransactionId'] as string | undefined;
  const isSandbox = tx['environment'] === 'Sandbox';

  const priceMilliunits = typeof tx['price'] === 'number' ? (tx['price'] as number) : undefined;
  const currency = typeof tx['currency'] === 'string' ? (tx['currency'] as string) : undefined;

  return {
    valid: true,
    productId,
    expiresDate,
    inTrialPeriod,
    originalTransactionId,
    isSandbox,
    priceMilliunits,
    currency,
  };
}

export interface AppleJwsDecodeResult {
  valid: boolean;
  error?: string;
  payload?: Record<string, unknown>;
}

// Cryptographic verification only (no transaction claim checks). Used by the grant path
// (which then runs validateTransactionClaims) and by ASSN (which must accept revoked /
// expired transactions so refunds and expiries can be applied).
export async function decodeAppleSignedJws(jws: string): Promise<AppleJwsDecodeResult> {
  let x5c: string[] | undefined;
  try {
    x5c = decodeProtectedHeader(jws).x5c as string[] | undefined;
  } catch {
    return { valid: false, error: 'jws_header_invalid' };
  }
  if (!x5c || x5c.length < 3) {
    return { valid: false, error: 'missing_x5c_chain' };
  }

  // 1. Pin the trust anchor.
  const rootDer = base64ToBytes(x5c[2]);
  if ((await sha256Hex(rootDer)) !== APPLE_ROOT_G3_SHA256) {
    return { valid: false, error: 'root_not_apple_g3' };
  }

  // 2. Verify the chain.
  try {
    const leaf = new X509Certificate(base64ToBytes(x5c[0]));
    const intermediate = new X509Certificate(base64ToBytes(x5c[1]));
    const root = new X509Certificate(rootDer);
    const date = new Date();

    const leafOk = await leaf.verify({ publicKey: await intermediate.publicKey.export(), date });
    const intermediateOk = await intermediate.verify({ publicKey: await root.publicKey.export(), date });
    const rootOk = await root.verify({ publicKey: await root.publicKey.export(), date });

    if (!leafOk || !intermediateOk || !rootOk) {
      return { valid: false, error: 'cert_chain_invalid' };
    }
  } catch {
    return { valid: false, error: 'cert_chain_verify_failed' };
  }

  // 3. Verify the JWS signature with the trusted leaf certificate.
  let payload: Uint8Array;
  try {
    const leafPem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`;
    const publicKey = await importX509(leafPem, 'ES256');
    ({ payload } = await compactVerify(jws, publicKey));
  } catch {
    return { valid: false, error: 'jws_signature_invalid' };
  }

  try {
    const parsed = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    return { valid: true, payload: parsed };
  } catch {
    return { valid: false, error: 'jws_payload_invalid' };
  }
}

// Full verification of an Apple-signed transaction JWS (App Store Server API response
// and client-supplied fallback token): crypto verify, then grant-time claim checks.
async function verifyAppleSignedJws(jws: string): Promise<AppleVerifyResult> {
  const decoded = await decodeAppleSignedJws(jws);
  if (!decoded.valid || !decoded.payload) {
    return { valid: false, error: decoded.error ?? 'jws_payload_invalid' };
  }
  return validateTransactionClaims(decoded.payload);
}

export interface AssnParseResult {
  valid: boolean;
  error?: string;
  notificationType?: string;
  subtype?: string | null;
  notificationUUID?: string;
  environment?: 'Sandbox' | 'Production';
  signedDate?: number;
  transaction?: {
    originalTransactionId: string;
    transactionId?: string;
    productId?: string;
    expiresDate?: number;
    revocationDate?: number;
    priceMilliunits?: number;
    currency?: string;
    inTrialPeriod?: boolean;
  };
  autoRenewStatus?: number;
}

/**
 * Verify and decode an App Store Server Notifications V2 `signedPayload`.
 * Outer notification JWS + nested `signedTransactionInfo` (and optional renewal info)
 * are all chain-pinned to Apple Root CA G3. Does NOT reject revoked/expired
 * transactions — those are the signals the webhook exists to apply.
 */
export async function parseAssnSignedPayload(signedPayload: string): Promise<AssnParseResult> {
  const outer = await decodeAppleSignedJws(signedPayload);
  if (!outer.valid || !outer.payload) {
    return { valid: false, error: outer.error ?? 'assn_payload_invalid' };
  }

  const notificationType = outer.payload['notificationType'];
  const notificationUUID = outer.payload['notificationUUID'];
  if (typeof notificationType !== 'string' || typeof notificationUUID !== 'string') {
    return { valid: false, error: 'assn_missing_type_or_uuid' };
  }

  const subtypeRaw = outer.payload['subtype'];
  const subtype = typeof subtypeRaw === 'string' ? subtypeRaw : null;
  const signedDate =
    typeof outer.payload['signedDate'] === 'number' ? outer.payload['signedDate'] : undefined;

  const data = outer.payload['data'] as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') {
    // TEST notifications (and a few others) may omit transaction data.
    return {
      valid: true,
      notificationType,
      subtype,
      notificationUUID,
      signedDate,
    };
  }

  const bundleId = data['bundleId'];
  if (bundleId !== undefined && bundleId !== BUNDLE_ID) {
    return { valid: false, error: 'bundle_id_mismatch' };
  }

  const environment =
    data['environment'] === 'Sandbox'
      ? 'Sandbox'
      : data['environment'] === 'Production'
        ? 'Production'
        : undefined;

  let transaction: AssnParseResult['transaction'];
  const signedTx = data['signedTransactionInfo'];
  if (typeof signedTx === 'string' && signedTx.length > 0) {
    const txDecoded = await decodeAppleSignedJws(signedTx);
    if (!txDecoded.valid || !txDecoded.payload) {
      return { valid: false, error: txDecoded.error ?? 'assn_tx_invalid' };
    }
    const tx = txDecoded.payload;
    if (tx['bundleId'] !== undefined && tx['bundleId'] !== BUNDLE_ID) {
      return { valid: false, error: 'bundle_id_mismatch' };
    }
    const originalTransactionId = tx['originalTransactionId'];
    if (typeof originalTransactionId !== 'string' || !originalTransactionId) {
      return { valid: false, error: 'missing_original_transaction_id' };
    }
    const productId = typeof tx['productId'] === 'string' ? tx['productId'] : undefined;
    if (productId && !ALLOWED_PRODUCT_IDS.has(productId)) {
      return { valid: false, error: 'product_id_mismatch' };
    }
    transaction = {
      originalTransactionId,
      transactionId: typeof tx['transactionId'] === 'string' ? tx['transactionId'] : undefined,
      productId,
      expiresDate: typeof tx['expiresDate'] === 'number' ? tx['expiresDate'] : undefined,
      revocationDate: typeof tx['revocationDate'] === 'number' ? tx['revocationDate'] : undefined,
      priceMilliunits: typeof tx['price'] === 'number' ? tx['price'] : undefined,
      currency: typeof tx['currency'] === 'string' ? tx['currency'] : undefined,
      inTrialPeriod: tx['offerType'] === 1 && tx['offerDiscountType'] === 'FREE_TRIAL',
    };
  }

  let autoRenewStatus: number | undefined;
  const signedRenewal = data['signedRenewalInfo'];
  if (typeof signedRenewal === 'string' && signedRenewal.length > 0) {
    const renewalDecoded = await decodeAppleSignedJws(signedRenewal);
    if (renewalDecoded.valid && renewalDecoded.payload) {
      const status = renewalDecoded.payload['autoRenewStatus'];
      if (typeof status === 'number') autoRenewStatus = status;
    }
  }

  return {
    valid: true,
    notificationType,
    subtype,
    notificationUUID,
    environment,
    signedDate,
    transaction,
    autoRenewStatus,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// "Wrong environment / not indexed yet" signal: the App Store Server API returns 404
// (TransactionIdNotFound) when the transaction lives in the other environment — the
// modern equivalent of legacy verifyReceipt's 21007 — and also, transiently, for brand
// new sandbox transactions it hasn't indexed yet.
function shouldTryOtherEnvironment(result: AppleVerifyResult): boolean {
  return result.error === 'transaction_not_found';
}

async function callAppleTransactionApi(
  transactionId: string,
  authJwt: string,
  sandbox: boolean,
): Promise<AppleVerifyResult> {
  const base = sandbox ? APPLE_SANDBOX_BASE : APPLE_PROD_BASE;
  let resp: Response;
  try {
    resp = await fetch(`${base}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${authJwt}` },
    });
  } catch {
    return { valid: false, error: 'apple_network_error' };
  }

  if (!resp.ok) {
    if (resp.status === 401) return { valid: false, error: 'apple_auth_failed' };
    if (resp.status === 404) return { valid: false, error: 'transaction_not_found' };
    return { valid: false, error: `apple_api_error_${resp.status}` };
  }

  const body = await resp.json() as { signedTransactionInfo?: string };
  if (!body.signedTransactionInfo) {
    return { valid: false, error: 'missing_signed_transaction' };
  }

  return verifyAppleSignedJws(body.signedTransactionInfo);
}

// Subscription statuses endpoint — Apple's recommended primary lookup for auto-renewable
// subscriptions. Returns every subscription group with its latest signed transactions;
// we verify each candidate JWS (newest first) and accept the first that validates.
async function callAppleSubscriptionsApi(
  transactionId: string,
  authJwt: string,
  sandbox: boolean,
): Promise<AppleVerifyResult> {
  const base = sandbox ? APPLE_SANDBOX_BASE : APPLE_PROD_BASE;
  let resp: Response;
  try {
    resp = await fetch(`${base}/inApps/v1/subscriptions/${encodeURIComponent(transactionId)}`, {
      headers: { Authorization: `Bearer ${authJwt}` },
    });
  } catch {
    return { valid: false, error: 'apple_network_error' };
  }

  if (!resp.ok) {
    if (resp.status === 401) return { valid: false, error: 'apple_auth_failed' };
    if (resp.status === 404) return { valid: false, error: 'transaction_not_found' };
    return { valid: false, error: `apple_api_error_${resp.status}` };
  }

  const body = await resp.json() as {
    data?: { lastTransactions?: { signedTransactionInfo?: string }[] }[];
  };
  const candidates = (body.data ?? [])
    .flatMap((group) => group.lastTransactions ?? [])
    .map((t) => t.signedTransactionInfo)
    .filter((jws): jws is string => typeof jws === 'string' && jws.length > 0);
  if (candidates.length === 0) {
    return { valid: false, error: 'missing_signed_transaction' };
  }

  let lastFailure: AppleVerifyResult = { valid: false, error: 'missing_signed_transaction' };
  for (const jws of candidates) {
    const verified = await verifyAppleSignedJws(jws);
    if (verified.valid) return verified;
    lastFailure = verified;
  }
  return lastFailure;
}

// Production first, then sandbox on a wrong-environment signal. Sandbox indexes brand
// new transactions slowly, so retry it up to `sandboxRetries` extra times with a 3s
// delay before giving up on this endpoint.
async function withEnvironmentFallback(
  call: (sandbox: boolean) => Promise<AppleVerifyResult>,
  sandboxRetries = 2,
): Promise<AppleVerifyResult> {
  const prod = await call(false);
  if (prod.valid || !shouldTryOtherEnvironment(prod)) return prod;

  let sandbox = await call(true);
  for (let i = 0; i < sandboxRetries && !sandbox.valid && shouldTryOtherEnvironment(sandbox); i++) {
    await sleep(3000);
    sandbox = await call(true);
  }
  return sandbox;
}

/**
 * Verify a StoreKit 2 transaction against Apple, per Apple's guidance: production
 * first, sandbox fallback, environment never a reason to reject. Chain:
 *   1. Subscription statuses endpoint: production → sandbox (with 2 extra sandbox
 *      retries at 3s — sandbox indexes new transactions slowly).
 *   2. Transaction lookup endpoint: production → sandbox (same retry policy).
 *   3. Client-supplied Apple-signed JWS (`signedTransactionFallback`, the expo-iap
 *      purchaseToken), cryptographically verified — chain pinned to Apple Root CA G3,
 *      signature checked, bundleId/product/revocation/expiry claims enforced. Covers
 *      sandbox's API 404ing transactions it hasn't indexed yet.
 *
 * The winning transaction's `environment` claim is surfaced as `isSandbox`
 * (informational only — recorded on the entitlement, never blocks the grant).
 *
 * Reads three Supabase secrets: APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY.
 */
export async function verifyAppleTransaction(
  transactionId: string,
  signedTransactionFallback?: string | null,
): Promise<AppleVerifyResult> {
  const issuerId = Deno.env.get('APPLE_ISSUER_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const rawPem = Deno.env.get('APPLE_PRIVATE_KEY');

  const tryFallback = async (apiResult: AppleVerifyResult): Promise<AppleVerifyResult> => {
    if (signedTransactionFallback) {
      return verifyAppleSignedJws(signedTransactionFallback);
    }
    return apiResult;
  };

  if (!issuerId || !keyId || !rawPem) {
    // No API credentials configured — rely on the verified client JWS if present.
    return tryFallback({ valid: false, error: 'apple_credentials_missing' });
  }

  // Supabase secrets may encode newlines as literal \n — normalise to real newlines.
  const privateKeyPem = rawPem.replace(/\\n/g, '\n');

  let authJwt: string;
  try {
    authJwt = await buildAppleAuthJwt(issuerId, keyId, privateKeyPem);
  } catch {
    return tryFallback({ valid: false, error: 'apple_jwt_sign_failed' });
  }

  if (!transactionId) {
    // No transaction id (e.g. restore with only a JWS) — verify the JWS directly.
    return tryFallback({ valid: false, error: 'no_transaction_id' });
  }

  // 1. Subscription statuses (Apple's recommended lookup for auto-renewables).
  const viaSubscriptions = await withEnvironmentFallback((sandbox) =>
    callAppleSubscriptionsApi(transactionId, authJwt, sandbox),
  );
  if (viaSubscriptions.valid) return viaSubscriptions;

  // 2. Transaction lookup (plain production → sandbox; retries already spent above,
  //    and more would push past the client's 30s watchdog).
  const viaTransaction = await withEnvironmentFallback(
    (sandbox) => callAppleTransactionApi(transactionId, authJwt, sandbox),
    0,
  );
  if (viaTransaction.valid) return viaTransaction;

  // 3. Client-provided signed JWS.
  return tryFallback(viaTransaction);
}
