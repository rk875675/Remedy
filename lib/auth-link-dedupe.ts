/**
 * Persistent deduplication for auth deep links.
 *
 * Pitfall 4: Linking.getInitialURL() returns the URL that originally launched the app
 * on every relaunch — even after the token is already consumed. Without persistence,
 * the app re-navigates to confirm/recovery on every reload and shows "link expired".
 *
 * We store a SHA-256 hash of each credential (never the plaintext) in AsyncStorage.
 * On startup, any URL whose credential hash is already stored is silently skipped.
 *
 * Pitfall 13: Only mark credentials handled on definitive failure, not transient errors.
 * isAuthRetryableFetchError from @supabase/supabase-js distinguishes the two.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { parseAuthParamsFromUrl } from './auth-redirects';

const STORAGE_KEY = 'remedy:handled-auth-creds-v1';

async function sha256(input: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input);
}

async function loadHandled(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set<string>();
    return new Set<string>(JSON.parse(raw) as string[]);
  } catch {
    return new Set<string>();
  }
}

async function saveHandled(set: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Storage failure is non-fatal; worst case the user sees "link expired" on retry.
  }
}

function extractCredential(url: string): string | null {
  const p = parseAuthParamsFromUrl(url);
  // token_hash is the primary credential; code (PKCE) and access_token are fallbacks.
  return p.token_hash ?? p.code ?? p.access_token ?? null;
}

export async function isCredentialHandled(cred: string): Promise<boolean> {
  const hash = await sha256(cred);
  const handled = await loadHandled();
  return handled.has(hash);
}

export async function markCredentialHandled(cred: string): Promise<void> {
  const hash = await sha256(cred);
  const handled = await loadHandled();
  handled.add(hash);
  await saveHandled(handled);
}

export async function isAuthLinkAlreadyHandled(url: string): Promise<boolean> {
  const cred = extractCredential(url);
  if (!cred) return false;
  return isCredentialHandled(cred);
}

export async function markAuthLinkHandled(url: string): Promise<void> {
  const cred = extractCredential(url);
  if (!cred) return;
  await markCredentialHandled(cred);
}
