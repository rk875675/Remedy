import Constants from 'expo-constants';

// Read the scheme registered in app.json → expo.scheme (or fall back to 'remedy').
// expo-auth-session is not in the dependency tree, so we build the URI manually.
const scheme = (Constants.expoConfig?.scheme as string | undefined) ?? 'remedy';

export function getEmailConfirmRedirectUrl(): string {
  return `${scheme}://auth-confirm`;
}

export function getPasswordRecoveryRedirectUrl(): string {
  return `${scheme}://password-recovery`;
}

/**
 * Extracts auth params from a deep-link URL.
 * Checks both the query string and the #fragment (Pitfall 3: iOS drops fragments across
 * custom-scheme handoff, but we still handle them defensively for edge cases).
 * Query-string values take precedence over fragment values for a given key.
 */
export function parseAuthParamsFromUrl(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  // Parse hash fragment first (lower priority)
  const afterHash = url.includes('#') ? url.split('#').slice(1).join('#') : '';
  // Parse query string (higher priority — overwrites any duplicate fragment keys)
  const afterQ = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  for (const part of [afterHash, afterQ].filter(Boolean)) {
    new URLSearchParams(part).forEach((v, k) => {
      if (v) out[k] = v;
    });
  }
  return out;
}
