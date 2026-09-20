import { errorResponse } from "./response.ts";

export type RateLimitClass =
  | "authenticated-read"
  | "authenticated-write"
  | "billing";

export type RateLimitResult =
  | { ok: true }
  | { ok: false; response: Response };

const WINDOW_SECONDS = 60;

const DEFAULT_LIMITS: Record<RateLimitClass, number> = {
  "authenticated-read": 120,
  "authenticated-write": 30,
  "billing": 10,
};

const ENV_KEYS: Record<RateLimitClass, string> = {
  "authenticated-read": "RATELIMIT_READ_RPM",
  "authenticated-write": "RATELIMIT_WRITE_RPM",
  "billing": "RATELIMIT_BILLING_RPM",
};

function getLimit(limitClass: RateLimitClass): number {
  const envVal = Deno.env.get(ENV_KEYS[limitClass]);
  if (envVal) {
    const n = parseInt(envVal, 10);
    if (!isNaN(n) && n > 0) return n;
  }
  return DEFAULT_LIMITS[limitClass];
}

export type FixedWindowResult = { allowed: boolean; retryAfter?: number };

/**
 * Fixed-window limiter with an explicit per-endpoint limit.
 *
 * Kept alongside the class-based checkRateLimit() because several endpoints need limits
 * far tighter than any shared class: delete-account is 3/hour, restore-purchases 3 per 5
 * minutes, and promo-admin allows only 10 failed password attempts per 5 minutes. Folding
 * those into "authenticated-write" (30/minute) would quietly turn a brute-force guard
 * into an open door, so the limit stays at the call site where it was chosen.
 *
 * Fails OPEN (allowed: true) when Upstash is unconfigured or unreachable: a limiter
 * outage must not take down purchases, account deletion or program assignment. The
 * tradeoff is deliberate — the surfaces that depend on this for abuse protection also
 * require a verified JWT or a constant-time password compare.
 */
export async function checkRateLimitFixedWindow(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<FixedWindowResult> {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) return { allowed: true };

  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const windowKey = `${key}:${window}`;
  const retryAfter = Math.max(
    1,
    ((window + 1) * windowSeconds) - Math.floor(Date.now() / 1000),
  );

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify([
        ["INCR", windowKey],
        ["EXPIRE", windowKey, windowSeconds],
      ]),
    });
    if (!res.ok) return { allowed: true };

    const results = await res.json() as { result: number }[];
    const count = results[0]?.result ?? 0;
    if (count > limit) return { allowed: false, retryAfter };
  } catch {
    return { allowed: true };
  }

  return { allowed: true };
}

export async function checkRateLimit(
  userId: string,
  requestId: string,
  limitClass: RateLimitClass,
): Promise<RateLimitResult> {
  const url = Deno.env.get("UPSTASH_REDIS_REST_URL");
  const token = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");

  if (!url || !token) {
    return { ok: true };
  }

  const limit = getLimit(limitClass);
  const window = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  const key = `relentless:rl:${limitClass}:${userId}:${window}`;

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, WINDOW_SECONDS],
      ]),
    });

    if (!res.ok) {
      return { ok: true };
    }

    const results = await res.json() as { result: number }[];
    const count = results[0]?.result ?? 0;

    if (count > limit) {
      const resetSeconds = ((window + 1) * WINDOW_SECONDS) - Math.floor(Date.now() / 1000);
      return {
        ok: false,
        response: errorResponse(
          429,
          "RATE_LIMITED",
          "Too many requests. Try again later.",
          requestId,
          { "Retry-After": String(Math.max(1, resetSeconds)) },
        ),
      };
    }
  } catch {
    return { ok: true };
  }

  return { ok: true };
}
