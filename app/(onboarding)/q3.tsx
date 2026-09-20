import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PersonalizingLayout } from '../../components/onboarding/PersonalizingLayout';
import { PersonalizationHint } from '../../components/onboarding/PersonalizationHint';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { type } from '../../constants/typography';
import { onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import { PAIN_TYPE_OPTIONS } from '../../constants/onboardingQuestions';
import { PAIN_TYPE_IMAGES } from '../../constants/onboardingImages';
import type { PainType } from '../../types/database';

const NERVE_NOTE =
  'Shooting or tingling into a leg can take months to settle, so early weeks stay calm on purpose.';

export default function Q3Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer } = useOnboarding();
  useTrackOnboardingStep('q3');
  const completeStep = useOnboardingStepCompletion();
  const [nerveNoteOpen, setNerveNoteOpen] = useState(false);
  const [nerveNoteSeen, setNerveNoteSeen] = useState(
    () => (answers.pain_type ?? []).includes('nerve'),
  );

  const selected = answers.pain_type ?? [];
  const showAcuteNote =
    (selected.includes('sharp') || selected.includes('nerve')) &&
    answers.pain_duration === 'acute';

  function toggle(val: PainType) {
    const isDeselect = selected.includes(val);
    const next = isDeselect ? selected.filter((v) => v !== val) : [...selected, val];
    setAnswer('pain_type', next);
    onboardingOptionSelected({
      step_key: 'q3',
      option_value: val,
      is_multi_select: true,
      is_deselect: isDeselect,
      selection_count: next.length,
    });
    if (val === 'nerve' && !isDeselect && !nerveNoteSeen) {
      setNerveNoteSeen(true);
      setNerveNoteOpen(true);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <PersonalizingLayout currentStep="q3" compact>
        <View style={styles.content}>
          <Text style={styles.heading}>What does it feel like?</Text>
          <Text style={styles.subheading}>Select all that apply</Text>
          <View style={styles.options}>
            {PAIN_TYPE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                image={PAIN_TYPE_IMAGES[opt.value]}
                photoSize={80}
                hintLift={opt.value === 'nerve' ? 14 : 6}
                selected={selected.includes(opt.value)}
                onPress={() => toggle(opt.value)}
                hint={
                  opt.value === 'nerve' && selected.includes('nerve') && nerveNoteSeen ? (
                    <PersonalizationHint
                      field="pain_type"
                      value="nerve"
                      copy={NERVE_NOTE}
                      numberOfLines={3}
                      color={colors.secondary}
                    />
                  ) : null
                }
              />
            ))}
          </View>

          {showAcuteNote ? (
            <Text style={styles.acuteNote}>
              If this started in the last two weeks, check with a doctor if it gets worse. You can keep going.
            </Text>
          ) : null}
        </View>
      </PersonalizingLayout>

      <ContinueButton
        onPress={() => {
          completeStep(selected.length);
          router.push('/(onboarding)/q4');
        }}
        disabled={selected.length === 0}
      />

      <Modal
        visible={nerveNoteOpen}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setNerveNoteOpen(false)}
      >
        <View style={styles.noteRoot}>
          <Pressable style={styles.noteDim} onPress={() => setNerveNoteOpen(false)} />
          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>If pain travels or tingles</Text>
            <Text style={styles.noteBody}>{NERVE_NOTE}</Text>
            <Pressable
              style={styles.noteButton}
              onPress={() => setNerveNoteOpen(false)}
              accessibilityRole="button"
            >
              <Text style={styles.noteButtonText}>Got it</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  heading: {
    ...type.question,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 20,
  },
  options: {
    gap: 10,
  },
  acuteNote: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textTertiary,
  },
  noteRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  noteDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 28, 30, 0.36)',
  },
  noteCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    ...shadows.low,
  },
  noteTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
    textAlign: 'center',
    marginBottom: 8,
  },
  noteBody: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 20,
  },
  noteButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.button,
    paddingVertical: 14,
    alignItems: 'center',
  },
  noteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
