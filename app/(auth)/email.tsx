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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { getEmailConfirmRedirectUrl, getPasswordRecoveryRedirectUrl } from '../../lib/auth-redirects';
import {
  friendlyAuthError,
  passwordMeetsComplexity,
  passwordRequirementHint,
} from '../../lib/passwordValidation';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticPrimaryAction, hapticError, hapticSelection } from '../../lib/haptics';
import {
  abandonAuthAttempt,
  beginAuthAttempt,
  classifyAuthError,
  failAuthAttempt,
  useHasPendingPurchase,
} from '../../lib/analytics/authAttempt';
import { passwordResetRequested } from '../../lib/analytics/events/auth';

export default function EmailAuthScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [isSignUp, setIsSignUp] = useState(mode === 'signup');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hasPendingPurchase = useHasPendingPurchase();

  function clearFeedback() {
    setError(null);
    setSuccess(null);
  }

  async function handleSubmit() {
    clearFeedback();

    if (!email.trim() || !password.trim()) {
      hapticError();
      setError('Please enter both email and password.');
      return;
    }

    if (isSignUp) {
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
    }

    hapticPrimaryAction();
    beginAuthAttempt({ isSignUp, method: 'email', sourceScreen: 'email', hasPendingPurchase });
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: getEmailConfirmRedirectUrl() },
        });
        if (signUpError) throw signUpError;

        if (data.user && !data.session) {
          // No session means identify() never fires, so the attempt would sit
          // pending and wrongly attach to whichever auth completes next.
          abandonAuthAttempt();
          setSuccess('Check your email to confirm your account, then sign in.');
          return;
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (e: unknown) {
      failAuthAttempt(classifyAuthError(e));
      hapticError();
      setError(
        friendlyAuthError(
          e,
          isSignUp ? 'Could not create your account. Please try again.' : 'Could not sign in. Please try again.',
        ),
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    clearFeedback();
    if (!email.trim()) {
      hapticError();
      setError('Enter your email first, then tap reset.');
      return;
    }
    hapticPrimaryAction();
    setLoading(true);
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getPasswordRecoveryRedirectUrl(),
      });
      if (resetError) throw resetError;
      passwordResetRequested({ source_screen: 'email' });
      setSuccess('Check your email for a password reset link.');
    } catch (e: unknown) {
      hapticError();
      setError(friendlyAuthError(e, 'Could not send a reset email. Please try again.'));
    } finally {
      setLoading(false);
    }
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
          <Text style={styles.title}>
            {isSignUp ? 'Create Account' : 'Sign In'}
          </Text>

          {error && (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {success && (
            <View style={styles.successContainer}>
              <Text style={styles.successText}>{success}</Text>
            </View>
          )}

          <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor={colors.textSecondary}
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            clearFeedback();
          }}
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
          onChangeText={(value) => {
            setPassword(value);
            clearFeedback();
          }}
          secureTextEntry
          textContentType={isSignUp ? 'newPassword' : 'password'}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
        />

        {isSignUp && (
          <>
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor={colors.textSecondary}
              value={confirmPw}
              onChangeText={(value) => {
                setConfirmPw(value);
                clearFeedback();
              }}
              secureTextEntry
              textContentType="newPassword"
              autoComplete="new-password"
            />
            <Text style={styles.hint}>{passwordRequirementHint()}</Text>
          </>
        )}

        <TouchableOpacity
          style={[styles.submitButton, loading && styles.submitButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.submitButtonText}>
            {loading
              ? 'Please wait...'
              : isSignUp
                ? 'Create Account'
                : 'Sign In'}
          </Text>
        </TouchableOpacity>

        {!isSignUp && (
          <TouchableOpacity
            onPress={handleForgotPassword}
            style={styles.toggleButton}
            disabled={loading}
            activeOpacity={0.6}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        )}
        </View>
      </View>

      {/* Legal assent already collected: explicit checkbox on the onboarding safety
          gate, plus the browsewrap line on sign-in.tsx which every user passes
          through to reach this form — a third copy here was redundant. */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          onPress={() => {
            hapticSelection();
            setIsSignUp(!isSignUp);
            setConfirmPw('');
            clearFeedback();
          }}
          style={styles.toggleButton}
          activeOpacity={0.6}
        >
          <Text style={styles.toggleText}>
            {isSignUp
              ? 'Already have an account? Sign In'
              : "Don't have an account? Create Account"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  form: {
    width: '100%',
    maxWidth: 400,
    gap: 14,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
    letterSpacing: -0.3,
    width: '100%',
  },
  errorContainer: {
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
  successContainer: {
    width: '100%',
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.chip,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  successText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.primaryDeep,
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
  submitButton: {
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
  submitButtonDisabled: {
    opacity: 0.6,
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
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
  forgotText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    alignSelf: 'flex-start',
    paddingHorizontal: 4,
  },
  footer: {
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 4,
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
});
