import crypto from "node:crypto";

// Studio password gate — shared password, long-lived HMAC session cookie.
// Token format matches the cloud Pages function: ok.exp.hmac("ok|exp")

export const SESSION_COOKIE = "studio_session";
export const SESSION_TTL_SECONDS = 180 * 24 * 60 * 60; // ~180 days

export function signSessionToken(secret: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sig = crypto.createHmac("sha256", secret).update(`ok|${exp}`).digest("base64url");
  return `ok.${exp}.${sig}`;
}

export function verifySessionToken(token: string, secret: string): boolean {
  const [mark, expStr, sigB64] = token.split(".");
  if (mark !== "ok" || !expStr || !sigB64) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  let got: Buffer;
  try {
    got = Buffer.from(sigB64, "base64url");
  } catch {
    return false;
  }
  const expected = crypto.createHmac("sha256", secret).update(`ok|${exp}`).digest();
  return got.length === expected.length && crypto.timingSafeEqual(expected, got);
}

/** Constant-time password compare via SHA-256 digests. */
export function passwordMatches(candidate: string, secret: string): boolean {
  const a = crypto.createHash("sha256").update(candidate, "utf8").digest();
  const b = crypto.createHash("sha256").update(secret, "utf8").digest();
  return crypto.timingSafeEqual(a, b);
}
