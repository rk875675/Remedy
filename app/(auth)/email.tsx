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
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticPrimaryAction, hapticError, hapticSelection } from '../../lib/haptics';

export default function EmailAuthScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSignUp, setIsSignUp] = useState(mode === 'signup');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setError(null);
    setSuccess(null);

    if (!email.trim() || !password.trim()) {
      hapticError();
      setError('Please enter both email and password.');
      return;
    }

    hapticPrimaryAction();
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;

        if (data.user && !data.session) {
          setSuccess('Check your email for a confirmation link, then sign in.');
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
      const err = e as { message?: string };
      hapticError();
      setError(err.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setSuccess(null);
    if (!email.trim()) {
      hapticError();
      setError('Enter your email first, then tap reset.');
      return;
    }
    hapticPrimaryAction();
    setLoading(true);
    try {
      // redirectTo becomes {{ .RedirectTo }} in the recovery email template, which links
      // through the auth-bridge function and lands on remedy://auth-callback.
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'remedy://auth-callback',
      });
      if (resetError) throw resetError;
      setSuccess('Check your email for a password reset link.');
    } catch (e: unknown) {
      const err = e as { message?: string };
      hapticError();
      setError(err.message ?? 'Could not send reset email');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.content}>
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
          textContentType={isSignUp ? 'newPassword' : 'password'}
          autoComplete={isSignUp ? 'new-password' : 'current-password'}
        />

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

        <TouchableOpacity
          onPress={() => {
            hapticSelection();
            setIsSignUp(!isSignUp);
            setError(null);
            setSuccess(null);
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

        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.6}>
          <Text style={styles.backText}>Back</Text>
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
    gap: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  errorContainer: {
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
  backButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  backText: {
    fontSize: 15,
    color: colors.textSecondary,
  },
});
