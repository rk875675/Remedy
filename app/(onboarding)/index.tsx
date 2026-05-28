import React, { useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useAuth } from '../../context/AuthContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { resetAnswers } = useOnboarding();

  useEffect(() => {
    resetAnswers();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoText}>R</Text>
        </View>
        <Text style={styles.appName}>Remedy</Text>
        <Text style={styles.subtitle}>Your back pain, finally fixed.</Text>
      </View>

      <View style={styles.footer}>
        <ContinueButton label="Get Started" onPress={() => router.push('/(onboarding)/education')} />
        <TouchableOpacity style={styles.signOutButton} onPress={signOut} activeOpacity={0.7}>
          <Text style={styles.signOutText}>
            {user?.email ? `${user.email} · ` : ''}Sign Out
          </Text>
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
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    marginBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: {
    fontSize: 38,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  appName: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  footer: {
    paddingBottom: 8,
    gap: 16,
  },
  signOutButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  signOutText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
