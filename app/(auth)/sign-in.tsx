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
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { supabase } from '../../lib/supabase';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticPrimaryAction, hapticError } from '../../lib/haptics';

let GoogleSignin: typeof import('@react-native-google-signin/google-signin').GoogleSignin | null = null;
try {
  GoogleSignin = require('@react-native-google-signin/google-signin').GoogleSignin;
  GoogleSignin?.configure({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  });
} catch {
  // Native module unavailable (e.g. Expo Go) — handled in handleGoogleSignIn
}

export default function SignInScreen() {
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const isSignUp = mode === 'signup';
  const [loading, setLoading] = useState(false);

  async function handleAppleSignIn() {
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

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
        nonce: rawNonce,
      });

      if (error) throw error;
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        hapticError();
        Alert.alert('Sign In Error', err.message ?? 'Something went wrong');
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

      if (!response.data?.idToken) {
        throw new Error('No ID token returned from Google');
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
        Alert.alert('Sign In Error', err.message ?? 'Something went wrong');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.logoWrap}>
          <View style={styles.logoHalo} />
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>R</Text>
          </View>
        </View>
        <Text style={styles.appName}>Remedy</Text>
        <Text style={styles.tagline}>
          {isSignUp ? 'Create your account to save your plan.' : 'Your back pain, finally fixed.'}
        </Text>
      </View>

      <View style={styles.buttons}>
        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={14}
            style={styles.appleButton}
            onPress={handleAppleSignIn}
          />
        )}

        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.googleButtonText}>Continue with Google</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.emailButton}
          onPress={() => {
            hapticPrimaryAction();
            router.push(isSignUp ? '/(auth)/email?mode=signup' : '/(auth)/email');
          }}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.emailButtonText}>Continue with Email</Text>
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
  header: {
    alignItems: 'center',
  },
  logoWrap: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoHalo: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: radius.circle,
    backgroundColor: colors.primaryMuted,
  },
  logoCircle: {
    width: 66,
    height: 66,
    borderRadius: radius.circle,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.high,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.3,
  },
  logoText: {
    fontSize: 32,
    fontFamily: serifFont,
    fontWeight: '700',
    color: '#FFFFFF',
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
  googleButton: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    ...shadows.low,
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
