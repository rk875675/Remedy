interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
}

/**
 * Fixed-window rate limiter using Upstash Redis REST API.
 * Uses INCR + EXPIRE pattern — no SDK, pure fetch (Deno-compatible).
 * Fails open on any Redis error (availability > strict limiting).
 */
export async function checkRateLimit(
  redisUrl: string,
  redisToken: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  try {
    const pipelineRes = await fetch(`${redisUrl}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${redisToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([
        ['INCR', key],
        ['TTL', key],
      ]),
    });

    if (!pipelineRes.ok) {
      console.error(`[ratelimit] Redis pipeline HTTP ${pipelineRes.status}`);
      return { allowed: true, remaining: limit };
    }

    const pipelineData = await pipelineRes.json() as { result: number }[];
    const count = pipelineData[0].result;
    const ttl = pipelineData[1].result;

    // Key was just created (first request in window) — set expiry
    if (count === 1) {
      await fetch(`${redisUrl}/expire/${encodeURIComponent(key)}/${windowSeconds}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` },
      }).catch((err) => {
        console.error('[ratelimit] Failed to set EXPIRE:', err);
      });
    }

    if (count > limit) {
      const retryAfter = ttl > 0 ? ttl : windowSeconds;
      return { allowed: false, remaining: 0, retryAfter };
    }

    return { allowed: true, remaining: limit - count };
  } catch (err) {
    console.error('[ratelimit] Redis error — failing open:', err);
    return { allowed: true, remaining: limit };
  }
}

/**
 * Decode the `sub` (user ID) from a Supabase JWT without verification.
 * Used only for rate-limit key derivation; actual auth is handled by Supabase client.
 */
export function extractUserIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.replace('Bearer ', '');
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload));
    return decoded.sub ?? null;
  } catch {
    return null;
  }
}
