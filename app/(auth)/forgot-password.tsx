/**
 * Forgot-password screen.
 *
 * Sends a Supabase password-reset email. The redirectTo value must be on Supabase's
 * Redirect URLs allowlist (Pitfall 12). The email template points to the auth-redirect
 * edge function with {{ .TokenHash }} — NOT to this redirectTo value — so this is
 * only for allowlist compliance and Supabase's built-in fallback.
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
import { getPasswordRecoveryRedirectUrl } from '../../lib/auth-redirects';
import { friendlyAuthError } from '../../lib/passwordValidation';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticPrimaryAction, hapticError } from '../../lib/haptics';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    setError(null);
    if (!email.trim()) {
      hapticError();
      setError('Please enter your email address.');
      return;
    }

    hapticPrimaryAction();
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        // Must be on Supabase Redirect URLs allowlist (Pitfall 12).
        redirectTo: getPasswordRecoveryRedirectUrl(),
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (err: unknown) {
      hapticError();
      setError(friendlyAuthError(err, 'Could not send a reset email. Please try again.'));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
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
            We sent a password reset link to{'\n'}
            <Text style={styles.emailHighlight}>{email.trim()}</Text>
            {'\n\n'}Tap the link in that email to set a new password.
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
          <Text style={styles.title}>Reset password</Text>
          <Text style={styles.subtitle}>
            Enter the email you signed up with and we'll send you a reset link.
          </Text>

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

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={() => void handleSend()}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Sending…' : 'Send reset link'}
            </Text>
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
    width: '100%',
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
});
