/**
 * Email-confirmation landing screen.
 *
 * Handles three credential shapes that Supabase can deliver:
 *   1. token_hash  — standard OTP (current default, survives email prefetchers)
 *   2. code        — PKCE code exchange
 *   3. access_token + refresh_token — legacy implicit flow
 *
 * Param sources (checked in this order, guarded by resolvedRef to prevent parallel
 * processing — Pitfall 16):
 *   a. expo-router useLocalSearchParams (route params Expo Router parsed from the URL)
 *   b. Linking.getInitialURL() cold-start URL
 *   c. peekPendingConfirmUrl() stashed by the root layout warm-start handler
 *   d. Linking.addEventListener('url') warm-start delivery
 *
 * After success: sets confirmed=true; does NOT call router.replace — lets RouteGuard
 * react to the new session and route naturally (Pitfall 10). Safety-net router.replace('/')
 * fires after 10 s in case RouteGuard stalls.
 *
 * Uses the SHARED main supabase client (not isolated) so the session persists (Pitfall 8).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EmailOtpType } from '@supabase/supabase-js';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { parseAuthParamsFromUrl } from '../../lib/auth-redirects';
import { peekPendingConfirmUrl, clearPendingConfirmUrl } from '../../lib/confirm-link-store';
import { isCredentialHandled, markCredentialHandled } from '../../lib/auth-link-dedupe';
import { friendlyAuthError } from '../../lib/passwordValidation';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';

type ConfirmState = 'waiting' | 'processing' | 'confirmed' | 'error' | 'timeout';

const CONFIRMATION_TYPES: EmailOtpType[] = ['signup', 'email', 'email_change', 'magiclink', 'invite'];

function normalizeType(raw: string | undefined): EmailOtpType {
  if (raw && (CONFIRMATION_TYPES as string[]).includes(raw)) return raw as EmailOtpType;
  return 'signup';
}

export default function ConfirmScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const routeParams = useLocalSearchParams<{
    token_hash?: string;
    type?: string;
    code?: string;
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
    error_code?: string;
  }>();

  const [state, setState] = useState<ConfirmState>('waiting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Pitfall 16: guard against parallel processing from multiple delivery paths.
  const resolvedRef = useRef(false);
  // Pitfall 15: 8 s timeout if no link arrives.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Safety net after confirmed (Pitfall 10).
  const safetyNetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimeouts() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  async function resolveWithParams(params: Record<string, string>) {
    if (resolvedRef.current) return;

    // Pitfall 18: link-level errors should be shown immediately.
    if (params.error) {
      resolvedRef.current = true;
      clearTimeouts();
      // Mark the credential handled so the stale link doesn't re-trigger.
      const cred = params.token_hash ?? params.code ?? params.access_token;
      if (cred) await markCredentialHandled(cred);
      setErrorMsg(
        friendlyAuthError(
          params.error_description ?? params.error,
          'This confirmation link is invalid. Request a new one and try again.',
        ),
      );
      setState('error');
      return;
    }

    const tokenHash = params.token_hash;
    const code = params.code;
    const accessToken = params.access_token;
    const refreshToken = params.refresh_token;
    const type = normalizeType(params.type);

    const credential = tokenHash ?? code ?? accessToken;
    if (!credential) return; // No usable credential — keep waiting.

    // Pitfall 4: skip already-handled credentials (stale relaunch).
    if (await isCredentialHandled(credential)) {
      router.replace('/');
      return;
    }

    resolvedRef.current = true;
    clearTimeouts();
    setState('processing');

    try {
      if (tokenHash) {
        // Standard token_hash path (Pitfall 11: survives email prefetchers).
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
        if (error) throw error;
      } else if (code) {
        // PKCE code exchange.
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
      } else if (accessToken && refreshToken) {
        // Legacy implicit: set session directly.
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) throw error;
      }

      // Pitfall 4: mark handled after definitive success.
      await markCredentialHandled(credential);
      clearPendingConfirmUrl();

      setState('confirmed');

      // Pitfall 10: do NOT navigate here — let RouteGuard react to the session.
      // Safety net: if RouteGuard stalls for >10 s, force-navigate to root.
      safetyNetRef.current = setTimeout(() => {
        router.replace('/');
      }, 10_000);
    } catch (err: unknown) {
      resolvedRef.current = false; // Allow retry on transient failure.

      // Pitfall 13: only mark handled on definitive failure, not network errors.
      if (!isAuthRetryableFetchError(err)) {
        await markCredentialHandled(credential);
      }

      clearPendingConfirmUrl();
      setErrorMsg(
        friendlyAuthError(err, 'This confirmation link has expired. Request a new one and try again.'),
      );
      setState('error');
    }
  }

  useEffect(() => {
    // --- a. Route params (Expo Router may have parsed them from the initial URL) ---
    const routeParamMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(routeParams)) {
      if (typeof v === 'string') routeParamMap[k] = v;
    }
    if (routeParamMap.token_hash || routeParamMap.code || routeParamMap.access_token || routeParamMap.error) {
      void resolveWithParams(routeParamMap);
    }

    // --- b. Cold start: Linking.getInitialURL() ---
    void (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        const p = parseAuthParamsFromUrl(initialUrl);
        if (p.token_hash || p.code || p.access_token || p.error) {
          await resolveWithParams(p);
        }
      }
    })();

    // --- c. Warm start: URL stashed by root layout handler before navigate ---
    const stashedUrl = peekPendingConfirmUrl();
    if (stashedUrl) {
      const p = parseAuthParamsFromUrl(stashedUrl);
      void resolveWithParams(p);
    }

    // --- d. Warm start: URL event fires after this screen mounts ---
    const sub = Linking.addEventListener('url', (e) => {
      if (!e.url.includes('auth-confirm')) return;
      const p = parseAuthParamsFromUrl(e.url);
      void resolveWithParams(p);
    });

    // Pitfall 15: show helpful message if no link arrives within 8 s.
    timeoutRef.current = setTimeout(() => {
      if (!resolvedRef.current) {
        setState('timeout');
      }
    }, 8_000);

    return () => {
      sub.remove();
      clearTimeouts();
      if (safetyNetRef.current) clearTimeout(safetyNetRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---

  if (state === 'confirmed') {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.icon}>✓</Text>
          <Text style={styles.title}>Email confirmed!</Text>
          <Text style={styles.subtitle}>Setting up your account…</Text>
        </View>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.center}>
          <Text style={styles.errorIcon}>✕</Text>
          <Text style={styles.title}>Couldn't confirm email</Text>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMsg}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/(auth)/sign-in')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'timeout') {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.center}>
          <Text style={styles.title}>Waiting for confirmation link</Text>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              Open the confirmation link from your email on this device, or request a new one.
            </Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.button}
          onPress={() => router.replace('/(auth)/sign-in')}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // waiting / processing
  return (
    <View style={styles.container}>
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.title}>
          {state === 'processing' ? 'Confirming your email…' : 'Waiting for confirmation…'}
        </Text>
        <Text style={styles.subtitle}>
          {state === 'processing'
            ? 'This will just take a moment.'
            : 'Tap the link in your confirmation email.'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingTop: 80,
    paddingBottom: 48,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  icon: {
    fontSize: 48,
    color: colors.primary,
  },
  errorIcon: {
    fontSize: 48,
    color: colors.warning,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  errorBox: {
    backgroundColor: '#FFF3E0',
    borderRadius: radius.chip,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.warning,
    width: '100%',
  },
  errorText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.warning,
    textAlign: 'center',
  },
  button: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
