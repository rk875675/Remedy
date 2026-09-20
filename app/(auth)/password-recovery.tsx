/**
 * Password-recovery landing and new-password screen.
 *
 * Flow:
 *   1. App opens with remedy://password-recovery?token_hash=...&type=recovery
 *   2. Root layout stashes URL in recovery-link-store and navigates here.
 *   3. This screen reads the URL from three sources (recoveryRef guards against parallel
 *      processing — Pitfall 16) and calls verifyOtp on an ISOLATED in-memory client
 *      (Pitfall 7: never on the shared client).
 *   4. Before showing the new-password form, signs out the SHARED client to clear any
 *      existing session, so after reset the user must sign in fresh.
 *   5. On success: recoveryClient.auth.signOut() drops the in-memory session; shows a
 *      "Password updated" screen with a "Sign in" button.
 *
 * Password complexity (Pitfall 14): raw Supabase error messages are sanitized.
 * Timeout (Pitfall 15): 8 s with a helpful message.
 * Deduplication (Pitfall 4): persistent AsyncStorage hash prevents stale-relaunch reuse.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { createRecoveryClient } from '../../lib/recovery-client';
import { parseAuthParamsFromUrl } from '../../lib/auth-redirects';
import { peekPendingRecoveryUrl, clearPendingRecoveryUrl } from '../../lib/recovery-link-store';
import { isCredentialHandled, markCredentialHandled } from '../../lib/auth-link-dedupe';
import {
  friendlyAuthError,
  passwordMeetsComplexity,
  passwordRequirementHint,
} from '../../lib/passwordValidation';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticPrimaryAction, hapticError } from '../../lib/haptics';

type RecoveryState = 'waiting' | 'processing' | 'form' | 'success' | 'error' | 'timeout';

export default function PasswordRecoveryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const routeParams = useLocalSearchParams<{
    token_hash?: string;
    type?: string;
    code?: string;
    error?: string;
    error_description?: string;
  }>();

  const [state, setState] = useState<RecoveryState>('waiting');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pitfall 16: guard against parallel processing.
  const recoveryRef = useRef(false);
  // Holds the isolated client for the duration of this screen.
  const clientRef = useRef<SupabaseClient | null>(null);
  // Pitfall 15: 8 s timeout.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearTimeouts() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }

  async function resolveWithParams(params: Record<string, string>) {
    if (recoveryRef.current) return;

    // Wrong type — show error and mark handled so the stale link is ignored.
    if (params.type && params.type !== 'recovery') {
      recoveryRef.current = true;
      clearTimeouts();
      setErrorMsg('This link is not a password-reset link.');
      setState('error');
      const cred = params.token_hash ?? params.code;
      if (cred) await markCredentialHandled(cred);
      return;
    }

    // Link-level error from Supabase.
    if (params.error) {
      recoveryRef.current = true;
      clearTimeouts();
      const cred = params.token_hash ?? params.code;
      if (cred) await markCredentialHandled(cred);
      setErrorMsg(
        friendlyAuthError(
          params.error_description ?? params.error,
          'This reset link is invalid. Request a new one and try again.',
        ),
      );
      setState('error');
      return;
    }

    const tokenHash = params.token_hash;
    const code = params.code;
    const credential = tokenHash ?? code;
    if (!credential) return;

    // Pitfall 4: skip already-handled credentials (stale relaunch → go to login quietly).
    if (await isCredentialHandled(credential)) {
      router.replace('/(auth)/sign-in');
      return;
    }

    recoveryRef.current = true;
    clearTimeouts();
    setState('processing');

    // Pitfall 7: use the ISOLATED recovery client, never the shared one.
    const recovery = createRecoveryClient();
    clientRef.current = recovery;

    try {
      if (tokenHash) {
        const { error } = await recovery.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (error) throw error;
      } else if (code) {
        const { error } = await recovery.auth.exchangeCodeForSession(code);
        if (error) throw error;
      }

      // Clear any existing shared-client session so the user must re-authenticate
      // after setting the new password.
      await supabase.auth.signOut({ scope: 'local' });

      setState('form');
    } catch (err: unknown) {
      recoveryRef.current = false;

      // Pitfall 13: only mark on definitive failure.
      if (!isAuthRetryableFetchError(err)) {
        await markCredentialHandled(credential);
      }

      clearPendingRecoveryUrl();
      setErrorMsg(
        friendlyAuthError(err, 'This reset link has expired. Request a new one and try again.'),
      );
      setState('error');
    }
  }

  useEffect(() => {
    // --- a. Route params ---
    const routeParamMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(routeParams)) {
      if (typeof v === 'string') routeParamMap[k] = v;
    }
    if (routeParamMap.token_hash || routeParamMap.code || routeParamMap.error || routeParamMap.type) {
      void resolveWithParams(routeParamMap);
    }

    // --- b. Cold start ---
    void (async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        const p = parseAuthParamsFromUrl(initialUrl);
        if (p.token_hash || p.code || p.error || p.type === 'recovery') {
          await resolveWithParams(p);
        }
      }
    })();

    // --- c. Warm start stash ---
    const stashedUrl = peekPendingRecoveryUrl();
    if (stashedUrl) {
      const p = parseAuthParamsFromUrl(stashedUrl);
      void resolveWithParams(p);
    }

    // --- d. Warm start event ---
    const sub = Linking.addEventListener('url', (e) => {
      if (!e.url.includes('password-recovery')) return;
      const p = parseAuthParamsFromUrl(e.url);
      void resolveWithParams(p);
    });

    // Pitfall 15: 8 s timeout.
    timeoutRef.current = setTimeout(() => {
      if (!recoveryRef.current) {
        setState('timeout');
      }
    }, 8_000);

    return () => {
      sub.remove();
      clearTimeouts();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSetPassword() {
    setFormError(null);

    if (password.length < 8) {
      hapticError();
      setFormError('Password must be at least 8 characters.');
      return;
    }
    // Pitfall 14: client-side complexity check must match Supabase setting.
    if (!passwordMeetsComplexity(password)) {
      hapticError();
      setFormError('Password must include uppercase, lowercase, and a number.');
      return;
    }
    if (password !== confirmPw) {
      hapticError();
      setFormError('Passwords do not match.');
      return;
    }

    hapticPrimaryAction();
    setSubmitting(true);
    try {
      const recovery = clientRef.current!;
      const { error } = await recovery.auth.updateUser({ password });
      if (error) throw error;

      // Discard the in-memory recovery session.
      await recovery.auth.signOut();
      clientRef.current = null;

      setState('success');
    } catch (err: unknown) {
      hapticError();
      // Pitfall 14: sanitize raw Supabase password complexity messages.
      setFormError(friendlyAuthError(err, 'Could not update your password. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  }

  // --- Credential extracted from initial params for deduplication on success ---
  async function handleMarkAndNavigate() {
    // Mark the credential handled when the user taps "Sign in" on the success screen.
    // (We don't mark it on verifyOtp success because updateUser must still be called.)
    const stashed = peekPendingRecoveryUrl();
    if (stashed) {
      const p = parseAuthParamsFromUrl(stashed);
      const cred = p.token_hash ?? p.code;
      if (cred) await markCredentialHandled(cred);
      clearPendingRecoveryUrl();
    }
    router.replace('/(auth)/sign-in');
  }

  // --- Render ---

  if (state === 'success') {
    return (
      <View style={styles.container}>
        <View style={styles.center}>
          <Text style={styles.icon}>✓</Text>
          <Text style={styles.title}>Password updated</Text>
          <Text style={styles.subtitle}>
            Your password has been changed. Sign in with your new password.
          </Text>
        </View>
        <TouchableOpacity
          style={styles.button}
          onPress={() => void handleMarkAndNavigate()}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>Sign in</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (state === 'form') {
    return (
      <KeyboardAvoidingView
        style={[styles.container, { paddingBottom: insets.bottom + 24 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.formHeader}>
          <Text style={styles.title}>Set a new password</Text>
        </View>

        <View style={styles.formBody}>
          {formError && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{formError}</Text>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm new password"
            placeholderTextColor={colors.textSecondary}
            value={confirmPw}
            onChangeText={setConfirmPw}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
          />
          <Text style={styles.hint}>{passwordRequirementHint()}</Text>
        </View>

        <TouchableOpacity
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={() => void handleSetPassword()}
          disabled={submitting}
          activeOpacity={0.8}
        >
          <Text style={styles.buttonText}>
            {submitting ? 'Updating…' : 'Update password'}
          </Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    );
  }

  if (state === 'error') {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.center}>
          <Text style={styles.errorIcon}>✕</Text>
          <Text style={styles.title}>Couldn't open link</Text>
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
          <Text style={styles.title}>Waiting for reset link</Text>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>
              Open the password-reset link from your email on this device, or request a new one.
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
          {state === 'processing' ? 'Verifying reset link…' : 'Waiting for reset link…'}
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
    paddingTop: 80,
    paddingBottom: 48,
    justifyContent: 'space-between',
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
  formHeader: {
    marginBottom: 24,
  },
  formBody: {
    flex: 1,
    gap: 14,
  },
  input: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    paddingHorizontal: 4,
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
  buttonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
