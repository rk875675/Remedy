import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useOnboarding } from '../context/OnboardingContext';
import { supabase } from '../lib/supabase';
import { trackEvent } from '../lib/analytics';
import { colors } from '../constants/colors';
import { radius } from '../constants/spacing';
import { shadows } from '../constants/shadows';
import { hapticWarning } from '../lib/haptics';
import type { OnboardingAnswers } from '../types/database';

const PAIN_LOCATION_LABELS: Record<OnboardingAnswers['pain_location'], string> = {
  upper: 'Upper back',
  lower: 'Lower back',
  all: 'Full back',
};

const PAIN_DURATION_LABELS: Record<OnboardingAnswers['pain_duration'], string> = {
  acute: 'Less than 4 weeks',
  subacute: '4–12 weeks',
  chronic: 'More than 3 months',
};

const PAIN_TYPE_LABELS: Record<'stiffness' | 'ache' | 'sharp', string> = {
  stiffness: 'Stiffness',
  ache: 'Aching',
  sharp: 'Sharp pain',
};

const ACTIVITY_LEVEL_LABELS: Record<OnboardingAnswers['activity_level'], string> = {
  sedentary: 'Sedentary',
  light: 'Lightly active',
  active: 'Active',
  athlete: 'Athlete',
};

const PAIN_TRIGGER_LABELS: Record<'sitting' | 'bending' | 'standing' | 'morning' | 'exercise' | 'other', string> = {
  sitting: 'Sitting',
  bending: 'Bending',
  standing: 'Standing',
  morning: 'Morning stiffness',
  exercise: 'Exercise',
  other: 'Other',
};

const EQUIPMENT_LABELS: Record<NonNullable<OnboardingAnswers['equipment']>, string> = {
  gym: 'Full gym access',
  bands_dumbbells: 'Bands & light dumbbells',
  open_space: 'Open floor space',
};

const MAIN_GOAL_LABELS: Record<'reduce_pain' | 'return_to_exercise' | 'sleep' | 'mobility', string> = {
  reduce_pain: 'Reduce daily pain',
  return_to_exercise: 'Return to exercise',
  sleep: 'Sleep better',
  mobility: 'Improve mobility',
};

const ANSWER_ROWS: Array<{
  label: string;
  key: keyof Pick<
    OnboardingAnswers,
    'pain_location' | 'pain_duration' | 'pain_type' | 'activity_level' | 'pain_trigger' | 'equipment' | 'main_goal'
  >;
  labelMap: Record<string, string>;
}> = [
  { label: 'Pain location', key: 'pain_location', labelMap: PAIN_LOCATION_LABELS },
  { label: 'How long', key: 'pain_duration', labelMap: PAIN_DURATION_LABELS },
  { label: 'Pain type', key: 'pain_type', labelMap: PAIN_TYPE_LABELS },
  { label: 'Activity level', key: 'activity_level', labelMap: ACTIVITY_LEVEL_LABELS },
  { label: 'Main trigger', key: 'pain_trigger', labelMap: PAIN_TRIGGER_LABELS },
  { label: 'Equipment', key: 'equipment', labelMap: EQUIPMENT_LABELS },
  { label: 'Main goal', key: 'main_goal', labelMap: MAIN_GOAL_LABELS },
];

export default function OnboardingAnswersScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { startRetake } = useOnboarding();
  const router = useRouter();

  const [answers, setAnswers] = useState<OnboardingAnswers | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('onboarding_answers')
      .select('*')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        setAnswers(data);
        setLoading(false);
      });
  }, [user]);

  function handleRetake() {
    hapticWarning();
    Alert.alert(
      'Retake questionnaire',
      'This will create a new program for your remaining weeks. Completed sessions stay in your history.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            trackEvent('onboarding_retake_confirmed');
            // Enter retake mode (keeps the user in the onboarding flow despite being
            // onboarded + premium), reset answers, and jump to the first question.
            startRetake();
            router.replace('/(onboarding)/q6');
          },
        },
      ],
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>Your Answers</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : !answers ? (
          <Text style={styles.empty}>No answers found.</Text>
        ) : (
          <>
            <View style={styles.card}>
              {ANSWER_ROWS.map((row, idx) => (
                <React.Fragment key={row.key}>
                  {idx > 0 && <View style={styles.divider} />}
                  <View style={styles.row}>
                    <Text style={styles.rowLabel}>{row.label}</Text>
                    <Text style={styles.rowValue}>
                      {(() => {
                        const val = answers[row.key];
                        if (val == null) return '—';
                        if (Array.isArray(val)) {
                          return val.map((v: string) => row.labelMap[v] ?? v).join(', ');
                        }
                        return row.labelMap[val as string] ?? (val as string);
                      })()}
                    </Text>
                  </View>
                </React.Fragment>
              ))}
            </View>

            <TouchableOpacity
              style={styles.retakeButton}
              onPress={handleRetake}
              activeOpacity={0.7}
            >
              <Text style={styles.retakeText}>Retake questionnaire</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  backButton: {
    width: 64,
  },
  backText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '500',
  },
  navTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 40,
    fontSize: 15,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    marginBottom: 28,
    ...shadows.low,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  rowLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  rowValue: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'right',
    flexShrink: 1,
    marginLeft: 12,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: 20,
  },
  retakeButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  retakeText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.secondary,
  },
});
