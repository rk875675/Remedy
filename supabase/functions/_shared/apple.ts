import {
  SignJWT,
  importPKCS8,
  decodeProtectedHeader,
  importX509,
  compactVerify,
} from 'https://esm.sh/jose@5';

const BUNDLE_ID = 'com.remedyapp.ios';
const ALLOWED_PRODUCT_IDS = new Set(['com.remedyapp.monthly', 'com.remedyapp.annual']);
const APPLE_AUD = 'appstoreconnect-v1';
const APPLE_PROD_BASE = 'https://api.storekit.itunes.apple.com';
const APPLE_SANDBOX_BASE = 'https://api.storekit-sandbox.itunes.apple.com';

export interface AppleVerifyResult {
  valid: boolean;
  error?: string;
  productId?: string;
  expiresDate?: number;
  inTrialPeriod?: boolean;
}

async function buildAppleAuthJwt(
  issuerId: string,
  keyId: string,
  privateKeyPem: string,
): Promise<string> {
  const privateKey = await importPKCS8(privateKeyPem, 'ES256');
  return new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuerId)
    .setIssuedAt()
    .setExpirationTime('1h')
    .setAudience(APPLE_AUD)
    .claim('bid', BUNDLE_ID)
    .sign(privateKey);
}

async function decodeAndVerifyJws(jws: string): Promise<AppleVerifyResult> {
  const header = decodeProtectedHeader(jws);
  const x5c = header.x5c as string[] | undefined;

  if (!x5c || x5c.length === 0) {
    return { valid: false, error: 'missing_x5c' };
  }

  // Verify JWS signature using the leaf certificate's public key (x5c[0]).
  // HUMAN INPUT NEEDED: This verifies the payload signature against the embedded leaf
  // certificate only. Full trust-chain validation — confirming x5c[0] was signed by
  // Apple's intermediate CA (x5c[1]) which was signed by Apple Root CA G3 — requires
  // X.509 chain verification that the Web Crypto API alone does not support.
  // Before launch, consider adding @peculiar/x509 (esm.sh) for full chain pinning.
  let publicKey: CryptoKey;
  try {
    const leafPem = `-----BEGIN CERTIFICATE-----\n${x5c[0]}\n-----END CERTIFICATE-----`;
    publicKey = await importX509(leafPem, 'ES256');
  } catch {
    return { valid: false, error: 'x5c_import_failed' };
  }

  let payload: Uint8Array;
  try {
    ({ payload } = await compactVerify(jws, publicKey));
  } catch {
    return { valid: false, error: 'jws_signature_invalid' };
  }

  const tx = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;

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
  // free trials from paid intro-price periods. inTrialPeriod does not exist in the
  // App Store Server API — it was a legacy verifyReceipt field only.
  const inTrialPeriod =
    tx['offerType'] === 1 && tx['offerDiscountType'] === 'FREE_TRIAL';

  return { valid: true, productId, expiresDate, inTrialPeriod };
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

  return decodeAndVerifyJws(body.signedTransactionInfo);
}

/**
 * Verify a StoreKit 2 transactionId against Apple's App Store Server API.
 *
 * Reads three Supabase secrets:
 *   APPLE_ISSUER_ID   — Issuer ID from App Store Connect → Users & Access → Keys
 *   APPLE_KEY_ID      — Key ID for the .p8 API key file
 *   APPLE_PRIVATE_KEY — Contents of the .p8 file (PKCS#8 PEM, newlines as \n or literal)
 *
 * Per Apple's recommended fallback: tries production first, then sandbox if Apple
 * returns 404 (transaction_not_found) for that environment.
 */
export async function verifyAppleTransaction(transactionId: string): Promise<AppleVerifyResult> {
  const issuerId = Deno.env.get('APPLE_ISSUER_ID');
  const keyId = Deno.env.get('APPLE_KEY_ID');
  const rawPem = Deno.env.get('APPLE_PRIVATE_KEY');

  if (!issuerId || !keyId || !rawPem) {
    return { valid: false, error: 'apple_credentials_missing' };
  }

  // Supabase secrets may encode newlines as literal \n — normalise to real newlines.
  const privateKeyPem = rawPem.replace(/\\n/g, '\n');

  let authJwt: string;
  try {
    authJwt = await buildAppleAuthJwt(issuerId, keyId, privateKeyPem);
  } catch {
    return { valid: false, error: 'apple_jwt_sign_failed' };
  }

  const prodResult = await callAppleTransactionApi(transactionId, authJwt, false);
  if (prodResult.error === 'transaction_not_found') {
    return callAppleTransactionApi(transactionId, authJwt, true);
  }
  return prodResult;
}
