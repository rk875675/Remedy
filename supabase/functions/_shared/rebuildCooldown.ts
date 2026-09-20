/**
 * Mirror of lib/programRebuild.ts — keep the numbers and rules in sync.
 * Deno edge functions cannot import from the app client tree.
 */
export const REBUILD_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const REBUILD_GRACE_MS = 24 * 60 * 60 * 1000;

export type RebuildEligibility = {
  allowed: boolean;
  inGrace: boolean;
  nextEligibleAt: Date | null;
};

export function getRebuildEligibility(
  lastRebuildAt: string | null,
  graceUsed: boolean,
  now = Date.now(),
): RebuildEligibility {
  if (!lastRebuildAt) {
    return { allowed: true, inGrace: false, nextEligibleAt: null };
  }
  const last = new Date(lastRebuildAt).getTime();
  if (Number.isNaN(last)) {
    return { allowed: true, inGrace: false, nextEligibleAt: null };
  }
  const elapsed = now - last;
  if (elapsed >= REBUILD_COOLDOWN_MS) {
    return { allowed: true, inGrace: false, nextEligibleAt: null };
  }
  if (elapsed < REBUILD_GRACE_MS && !graceUsed) {
    return { allowed: true, inGrace: true, nextEligibleAt: null };
  }
  return {
    allowed: false,
    inGrace: false,
    nextEligibleAt: new Date(last + REBUILD_COOLDOWN_MS),
  };
}

export function nextRebuildStamp(
  lastRebuildAt: string | null,
  graceUsed: boolean,
  now = new Date(),
): { last_program_rebuild_at: string; last_program_rebuild_grace_used: boolean } {
  const eligibility = getRebuildEligibility(lastRebuildAt, graceUsed, now.getTime());
  return {
    last_program_rebuild_at: now.toISOString(),
    last_program_rebuild_grace_used: eligibility.inGrace,
  };
}
