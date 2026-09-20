/**
 * Dedupes tab-focus refetches. Home and Progress both reload on every
 * useFocusEffect, including tab switches a second apart. A short TTL plus an
 * in-flight lock keeps the UI from slamming PostgREST without hiding a real
 * update (a session is minutes long, well past the TTL).
 */

const inFlight = new Map<string, boolean>();
const lastOkAt = new Map<string, number>();

export const TAB_REFRESH_TTL_MS = 12_000;

export function shouldSkipTabRefresh(
  key: string,
  ttlMs: number = TAB_REFRESH_TTL_MS,
): boolean {
  if (inFlight.get(key) === true) return true;
  const last = lastOkAt.get(key) ?? 0;
  return last > 0 && Date.now() - last < ttlMs;
}

export function beginTabRefresh(key: string): void {
  inFlight.set(key, true);
}

export function finishTabRefresh(key: string): void {
  inFlight.set(key, false);
  lastOkAt.set(key, Date.now());
}

export function invalidateTabRefresh(key: string): void {
  lastOkAt.delete(key);
}
