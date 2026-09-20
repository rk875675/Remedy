/**
 * Module-level pending URL store for the password-recovery flow.
 *
 * Mirrors confirm-link-store.ts — see that file for full rationale (Pitfall 9).
 */

let pendingUrl: string | null = null;

export function setPendingRecoveryUrl(url: string): void {
  pendingUrl = url;
}

export function peekPendingRecoveryUrl(): string | null {
  return pendingUrl;
}

export function clearPendingRecoveryUrl(): void {
  pendingUrl = null;
}
