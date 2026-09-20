/**
 * Module-level pending URL store for the email-confirmation flow.
 *
 * Pitfall 9: On a warm start the deep link arrives via Linking.addEventListener('url')
 * BEFORE the confirm screen mounts, so the screen would miss it. The root layout's
 * global url handler stashes the URL here before calling router.replace('/(auth)/confirm').
 * The confirm screen reads from this store on mount.
 *
 * No persistence: if the app is fully killed the URL will be re-delivered via
 * Linking.getInitialURL() on the next launch; the store is only for warm-start delivery.
 */

let pendingUrl: string | null = null;

export function setPendingConfirmUrl(url: string): void {
  pendingUrl = url;
}

export function peekPendingConfirmUrl(): string | null {
  return pendingUrl;
}

export function clearPendingConfirmUrl(): void {
  pendingUrl = null;
}
