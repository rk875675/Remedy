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

const BUNDLE_ID = 'com.remedyapp.ios';
const ALLOWED_PRODUCT_IDS = new Set(['com.remedyapp.monthly', 'com.remedyapp.annual']);
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

  return { valid: true, productId, expiresDate, inTrialPeriod };
}

// Full verification of an Apple-signed JWS (used for both the App Store Server API
// response and the client-supplied fallback token):
//   1. Pin x5c[2] to Apple Root CA G3 by SHA-256.
//   2. Verify the cert chain (leaf <- intermediate <- root) incl. validity dates.
//   3. Verify the JWS ES256 signature with the (now-trusted) leaf key.
//   4. Validate the transaction claims (bundle, product, revocation, expiry).
async function verifyAppleSignedJws(jws: string): Promise<AppleVerifyResult> {
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

  // 4. Validate the claims.
  let tx: Record<string, unknown>;
  try {
    tx = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
  } catch {
    return { valid: false, error: 'jws_payload_invalid' };
  }
  return validateTransactionClaims(tx);
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

/**
 * Verify a StoreKit 2 transaction against Apple. Strategy (per Apple's guidance + the
 * unreliable-sandbox reality):
 *   1. App Store Server API: production, then sandbox on a 404.
 *   2. Fallback: cryptographically verify the client-supplied signed JWS
 *      (`signedTransactionFallback`, the expo-iap purchaseToken) against Apple's root.
 *
 * The fallback is fully verified (chain-pinned to Apple Root CA G3 + signature + claims),
 * so it is safe to grant on — an unverified JWS is attacker-forgeable and never trusted.
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
      const fb = await verifyAppleSignedJws(signedTransactionFallback);
      if (fb.valid) return fb;
      return fb;
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

  if (transactionId) {
    const prod = await callAppleTransactionApi(transactionId, authJwt, false);
    if (prod.valid) return prod;
    if (prod.error === 'transaction_not_found') {
      const sandbox = await callAppleTransactionApi(transactionId, authJwt, true);
      if (sandbox.valid) return sandbox;
      return tryFallback(sandbox);
    }
    return tryFallback(prod);
  }

  // No transaction id (e.g. restore with only a JWS) — verify the JWS directly.
  return tryFallback({ valid: false, error: 'no_transaction_id' });
}
