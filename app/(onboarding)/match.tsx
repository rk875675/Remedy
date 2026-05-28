import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import type { OnboardingAnswers } from '../../types/database';

function getTagline(level: OnboardingAnswers['activity_level'] | undefined): string {
  switch (level) {
    case 'athlete':
      return 'Built for active people returning to training';
    case 'active':
      return 'Structured recovery for regular gym-goers';
    case 'light':
      return 'Balanced movement for lightly active lifestyles';
    case 'sedentary':
    default:
      return 'Gentle, progressive relief for daily pain';
  }
}

export default function MatchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers } = useOnboarding();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    if (!user) {
      setError('You need to sign in first.');
      router.replace('/(auth)/sign-in');
      return;
    }

    const { pain_location, pain_duration, pain_type, activity_level, pain_trigger, main_goal } = answers;
    if (!pain_location || !pain_duration || !pain_type || !activity_level || !pain_trigger || !main_goal) {
      setError('Please complete all onboarding questions.');
      return;
    }

    setLoading(true);
    setError(null);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setError('Your session expired. Please sign in again.');
      setLoading(false);
      await supabase.auth.signOut();
      return;
    }

    const { error: insertError } = await supabase.from('onboarding_answers').insert({
      user_id: user.id,
      pain_location,
      pain_duration,
      pain_type,
      activity_level,
      pain_trigger,
      main_goal,
    });

    if (insertError) {
      if (insertError.message.includes('violates foreign key') || insertError.code === '23503') {
        setError('Account error. Please sign out and sign in again.');
      } else {
        setError(insertError.message);
      }
      setLoading(false);
      return;
    }

    router.replace('/(tabs)');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>YOUR PROGRAM</Text>

        <Text style={styles.programName}>Back Pain{'\n'}Relief Program</Text>

        <Text style={styles.tagline}>{getTagline(answers.activity_level)}</Text>

        <View style={styles.card}>
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>5</Text>
              <Text style={styles.statLabel}>weeks</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>4x</Text>
              <Text style={styles.statLabel}>per week</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>20</Text>
              <Text style={styles.statLabel}>min each</Text>
            </View>
          </View>
        </View>

        <View style={styles.featureList}>
          <FeatureItem text="Progressive exercises designed by a licensed PT" />
          <FeatureItem text="Track pain before and after every session" />
          <FeatureItem text="Personalized to your activity level and goals" />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <ContinueButton
        label="Start My Free Trial"
        onPress={handleStart}
        disabled={loading}
      />
    </View>
  );
}

function FeatureItem({ text }: { text: string }) {
  return (
    <View style={styles.featureRow}>
      <View style={styles.featureDot} />
      <Text style={styles.featureText}>{text}</Text>
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
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  programName: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.textPrimary,
    lineHeight: 40,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 16,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: 28,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 22,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E8E0DC',
  },
  featureList: {
    gap: 14,
    marginBottom: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
    marginTop: 7,
  },
  featureText: {
    flex: 1,
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 21,
  },
  error: {
    marginTop: 12,
    fontSize: 14,
    color: colors.warning,
    textAlign: 'center',
  },
});
