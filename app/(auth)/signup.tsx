/**
 * Dedicated email sign-up screen.
 *
 * Client-side validation runs before calling signUp so Supabase never sees a weak
 * password (avoids round-trips and raw server error messages — Pitfall 14).
 *
 * On success (email confirmation enabled): shows a "Check your email" message.
 * Calls supabase.auth.signUp with emailRedirectTo pointing at the auth-redirect edge
 * function URL (registered on Supabase Redirect URLs allowlist — Pitfall 12).
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { getEmailConfirmRedirectUrl } from '../../lib/auth-redirects';
import {
  friendlyAuthError,
  passwordMeetsComplexity,
  passwordRequirementHint,
} from '../../lib/passwordValidation';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticPrimaryAction, hapticError } from '../../lib/haptics';

export default function SignUpScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSignUp() {
    setError(null);

    if (!email.trim()) {
      hapticError();
      setError('Please enter your email address.');
      return;
    }
    if (password.length < 8) {
      hapticError();
      setError('Password must be at least 8 characters.');
      return;
    }
    if (!passwordMeetsComplexity(password)) {
      hapticError();
      setError('Password must include uppercase, lowercase, and a number.');
      return;
    }
    if (password !== confirmPw) {
      hapticError();
      setError('Passwords do not match.');
      return;
    }

    hapticPrimaryAction();
    setLoading(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // This value must be on Supabase's Redirect URLs allowlist (Pitfall 12).
          // The email template uses {{ .SiteURL }}/functions/v1/auth-redirect with the
          // token_hash, so emailRedirectTo is the fallback/allowlist entry.
          emailRedirectTo: getEmailConfirmRedirectUrl(),
        },
      });
      if (signUpError) throw signUpError;

      if (data.user && !data.session) {
        // No session = email confirmation is enabled. The user must tap the link.
        setSuccess(true);
      }
      // If a session was returned (confirmation disabled), RouteGuard will route forward.
    } catch (err: unknown) {
      hapticError();
      setError(friendlyAuthError(err, 'Could not create your account. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
        <TouchableOpacity
          style={[styles.backButton, { top: insets.top + 8 }]}
          onPress={() => router.back()}
          activeOpacity={0.6}
          hitSlop={12}
        >
          <Text style={styles.backChevron}>‹</Text>
        </TouchableOpacity>
        <View style={styles.center}>
          <Text style={styles.successIcon}>✉</Text>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.subtitle}>
            We sent a confirmation link to{'\n'}
            <Text style={styles.emailHighlight}>{email.trim()}</Text>
            {'\n\n'}Tap the link in that email, then sign in.
          </Text>
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

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + 8 }]}
        onPress={() => router.back()}
        activeOpacity={0.6}
        hitSlop={12}
      >
        <Text style={styles.backChevron}>‹</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.form}>
          <Text style={styles.title}>Create Account</Text>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.textSecondary}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.textSecondary}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
          />
          <TextInput
            style={styles.input}
            placeholder="Confirm password"
            placeholderTextColor={colors.textSecondary}
            value={confirmPw}
            onChangeText={setConfirmPw}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="new-password"
          />
          <Text style={styles.hint}>{passwordRequirementHint()}</Text>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => void handleSignUp()}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Creating account…' : 'Create Account'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.replace('/(auth)/sign-in')}
            style={styles.toggleButton}
            activeOpacity={0.6}
          >
            <Text style={styles.toggleText}>Already have an account? Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  backButton: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  backChevron: {
    fontSize: 34,
    lineHeight: 34,
    color: colors.textPrimary,
    marginTop: -4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  form: {
    width: '100%',
    maxWidth: 400,
    gap: 14,
    alignItems: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.3,
    width: '100%',
  },
  successIcon: {
    fontSize: 48,
    color: colors.primary,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  emailHighlight: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  errorBox: {
    width: '100%',
    backgroundColor: '#FFF3E0',
    borderRadius: radius.chip,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  errorText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.warning,
    textAlign: 'center',
  },
  input: {
    width: '100%',
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
    alignSelf: 'flex-start',
  },
  button: {
    width: '100%',
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
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
  toggleButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  toggleText: {
    fontSize: 15,
    color: colors.primary,
  },
});
