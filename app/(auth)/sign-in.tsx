import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticPrimaryAction, hapticError } from '../../lib/haptics';
import { AppLogo } from '../../components/brand/AppLogo';

let GoogleSignin: typeof import('@react-native-google-signin/google-signin').GoogleSignin | null = null;
try {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
  GoogleSignin?.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
} catch {
  // Native module unavailable (e.g. Expo Go) — handled in handleGoogleSignIn
}

// AuthContext's ensureProfile() creates the `profiles` row asynchronously (deferred
// via setTimeout in the onAuthStateChange handler), so it may not exist yet when this
// runs. Briefly retry instead of racing it, and only fill in display_name if it's
// still unset so we never clobber a name the user already has.
async function persistAppleDisplayName(userId: string, fullName: string) {
  try {
    await supabase.auth.updateUser({ data: { full_name: fullName } });
  } catch {
    // Best effort — the profiles table write below is the source of truth for the UI.
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();

    if (profile) {
      if (!profile.display_name) {
        await supabase.from('profiles').update({ display_name: fullName }).eq('id', userId);
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

export default function SignInScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isSignUp = mode === 'signup';
  const [loading, setLoading] = useState(false);

  // Reached via push (from the onboarding "Sign in" links) — go back to the previous
  // screen. If there's no history (e.g. arrived here via replace), fall back to the
  // onboarding flow rather than dead-ending.
  function handleBack() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(onboarding)');
    }
  }

  async function handleAppleSignIn() {
    // AppleAuthenticationButton has no disabled prop, so the loading guard lives here
    // instead (mirrors the disabled={loading} on the Google/Email buttons).
    if (loading) return;
    hapticPrimaryAction();
    try {
      setLoading(true);

      // Nonce binding: Apple hashes the nonce into the identity token; Supabase
      // re-hashes the raw nonce we pass and compares. A mismatch (or no nonce) lets a
      // stolen token be replayed, so we generate a raw nonce, send its SHA-256 to Apple,
      // and the raw value to Supabase.
      const rawNonce = Crypto.randomUUID();
      const hashedNonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        rawNonce,
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });

      if (!credential.identityToken) {
        throw new Error('No identity token returned from Apple');
      }

      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) throw error;

      // Apple only ever returns fullName on the FIRST authorization for this app —
      // if we don't capture it now it's gone for good, since Apple ID tokens carry
      // no name claim on subsequent sign-ins.
      const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
        .filter((part): part is string => !!part && part.trim().length > 0)
        .join(' ')
        .trim();
      if (fullName && data.user) {
        await persistAppleDisplayName(data.user.id, fullName);
      }
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      // Backing out of the Apple sheet is a cancel, not an error — stay silent.
      // (expo-apple-authentication has used both codes across versions.)
      if (err.code !== 'ERR_REQUEST_CANCELED' && err.code !== 'ERR_CANCELED') {
        hapticError();
        Alert.alert(isSignUp ? 'Sign Up Error' : 'Sign In Error', err.message ?? 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignIn() {
    hapticPrimaryAction();
    if (!GoogleSignin) {
      Alert.alert(
        'Not Available',
        'Google Sign In requires a development build. Use email sign in for Expo Go testing.',
      );
      return;
    }

    try {
      setLoading(true);
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      // v16 resolves with { type: 'cancelled', data: null } when the user dismisses
      // the sheet (it no longer throws). A dismissal — or any response without an ID
      // token — is a cancel, not an error: return silently, never alert.
      if (response.type !== 'success' || !response.data.idToken) {
        return;
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: response.data.idToken,
      });

      if (error) throw error;
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code !== 'SIGN_IN_CANCELLED') {
        hapticError();
        Alert.alert(isSignUp ? 'Sign Up Error' : 'Sign In Error', err.message ?? 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + 8 }]}
        onPress={handleBack}
        activeOpacity={0.6}
        hitSlop={12}
      >
        <Text style={styles.backChevron}>‹</Text>
      </TouchableOpacity>

      <View style={styles.header}>
        <AppLogo size="sm" style={styles.logo} />
        <Text style={styles.appName}>Remedy</Text>
        <Text style={styles.tagline}>
          {isSignUp ? 'Create your account to save your plan.' : 'Your back pain, finally fixed.'}
        </Text>
      </View>

      <View style={styles.buttons}>
        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Ionicons name="logo-google" size={20} color={colors.textPrimary} style={styles.googleIcon} />
          <Text style={styles.googleButtonText}>
            {isSignUp ? 'Sign up with Google' : 'Continue with Google'}
          </Text>
        </TouchableOpacity>

        {Platform.OS === 'ios' && (
          <View style={styles.appleButton} pointerEvents={loading ? 'none' : 'auto'}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={
                isSignUp
                  ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
                  : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE
              }
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={14}
              style={styles.appleButtonInner}
              onPress={handleAppleSignIn}
            />
          </View>
        )}

        <TouchableOpacity
          style={styles.emailButton}
          onPress={() => {
            hapticPrimaryAction();
            router.push(isSignUp ? '/(auth)/email?mode=signup' : '/(auth)/email');
          }}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.emailButtonText}>
            {isSignUp ? 'Sign up with Email' : 'Continue with Email'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.legalRow}>
        <Text style={styles.legal}>By continuing, you agree to our </Text>
        <TouchableOpacity onPress={() => router.push('/(legal)/terms' as any)} activeOpacity={0.6}>
          <Text style={[styles.legal, styles.legalLink]}>Terms of Service</Text>
        </TouchableOpacity>
        <Text style={styles.legal}> and </Text>
        <TouchableOpacity onPress={() => router.push('/(legal)/privacy' as any)} activeOpacity={0.6}>
          <Text style={[styles.legal, styles.legalLink]}>Privacy Policy</Text>
        </TouchableOpacity>
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
    paddingTop: 120,
    paddingBottom: 48,
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
  header: {
    alignItems: 'center',
  },
  logo: {
    marginBottom: 20,
  },
  appName: {
    fontSize: 36,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 18,
    lineHeight: 27,
    color: colors.textSecondary,
  },
  buttons: {
    gap: 14,
  },
  appleButton: {
    height: 52,
    width: '100%',
  },
  appleButtonInner: {
    height: 52,
    width: '100%',
  },
  googleButton: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.low,
  },
  googleIcon: {
    marginRight: 10,
  },
  googleButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emailButton: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  emailButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  legal: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  legalLink: {
    color: colors.primary,
  },
});
