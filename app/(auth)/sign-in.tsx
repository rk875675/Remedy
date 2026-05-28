import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
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
  const [loading, setLoading] = useState(false);

  async function handleAppleSignIn() {
    hapticPrimaryAction();
    try {
      setLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) {
        throw new Error('No identity token returned from Apple');
      }

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
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
        <Text style={styles.appName}>Remedy</Text>
        <Text style={styles.tagline}>Your back pain, finally fixed.</Text>
      </View>

      <View style={styles.buttons}>
        {Platform.OS === 'ios' && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
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
            router.push('/(auth)/email');
          }}
          disabled={loading}
          activeOpacity={0.8}
        >
          <Text style={styles.emailButtonText}>Continue with Email</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.legal}>
        By continuing, you agree to our Terms of Service and Privacy Policy
      </Text>
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
  appName: {
    fontSize: 36,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  tagline: {
    fontSize: 18,
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
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.textSecondary,
  },
  googleButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  emailButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emailButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  legal: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
});
