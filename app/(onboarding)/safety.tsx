import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { OptionCard } from '../../components/onboarding/OptionCard';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { recordLegalAcceptances } from '../../lib/legalAcceptance';
import { legalDocumentViewed } from '../../lib/analytics/events/engagement';
import { onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import { hapticSelection } from '../../lib/haptics';
import { colors } from '../../constants/colors';
import { type } from '../../constants/typography';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';

// The safety and consent gate (PRD §8, DECISIONS §1). Sits after q0 (marketing
// attribution — no health data) and before q9, the first question that reveals
// health information. Everything health-related stays behind this screen:
// medical disclaimer, red-flag contraindication check, and one combined
// attestation (16+, Terms/Privacy assent, explicit consent to process
// health-related answers per GDPR Art. 9 / CPRA sensitive personal information).
// 16 is at or above the GDPR digital-consent age in every EU member state.
// Do not move it later in the flow or drop the checkbox: Apple only requires
// paywall links, which do not create enforceable assent to our arbitration or
// assumption-of-risk terms, and paywall links alone are not GDPR consent.

const CONTRAINDICATIONS = [
  'Back pain after a fall, accident, or other trauma that has not been checked by a clinician',
  'Numbness in the groin or inner thighs, or new loss of bladder or bowel control',
  'Progressive weakness or numbness in a leg',
  'Fever, chills, or unexplained weight loss along with back pain',
  'Night pain that always wakes you from sleep',
  'Spine surgery in the last 12 months without clearance to exercise',
  'Pregnancy, osteoporosis, cancer, or another condition where a clinician has advised against exercise',
];

function CheckRow({
  checked,
  onToggle,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <Pressable
      style={styles.checkRow}
      onPress={() => {
        hapticSelection();
        onToggle();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <View style={styles.checkLabelWrap}>{children}</View>
    </Pressable>
  );
}

export default function SafetyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { progress, setLocalAnswer } = useOnboarding();
  useTrackOnboardingStep('safety');
  const completeStep = useOnboardingStepCompletion();

  // null = not answered, false = none apply, true = one or more applies.
  // Initialized from persisted progress so back-navigation and funnel resume
  // restore the selections instead of forcing a re-answer.
  const [hasRedFlag, setHasRedFlag] = useState<boolean | null>(
    () => progress?.has_red_flag ?? null,
  );
  const [agreedLegal, setAgreedLegal] = useState(() => progress?.agreed_legal ?? false);

  function handleRedFlag(value: boolean) {
    const isDeselect = hasRedFlag === value;
    onboardingOptionSelected({
      step_key: 'safety',
      option_value: value ? 'yes' : 'no',
      is_multi_select: false,
      is_deselect: isDeselect,
    });
    const next = isDeselect ? null : value;
    setHasRedFlag(next);
    setLocalAnswer('has_red_flag', next);
  }

  function handleToggleLegal() {
    const next = !agreedLegal;
    setAgreedLegal(next);
    setLocalAnswer('agreed_legal', next);
  }

  // A "yes" answer shows the warning panel; continuing past it is the documented
  // acknowledgment (the panel copy states what continuing means).
  const canContinue = hasRedFlag !== null && agreedLegal;

  function openTerms() {
    try {
      legalDocumentViewed({ document: 'terms', source_screen: 'onboarding' });
    } catch {
      // Analytics must never block opening the document.
    }
    router.push('/(legal)/terms' as never);
  }

  function openPrivacy() {
    try {
      legalDocumentViewed({ document: 'privacy', source_screen: 'onboarding' });
    } catch {
      // Analytics must never block opening the document.
    }
    router.push('/(legal)/privacy' as never);
  }

  function handleContinue() {
    if (!canContinue) return;
    void recordLegalAcceptances(['disclaimer', 'age', 'health_consent', 'terms', 'privacy']).catch(
      () => {},
    );
    setLocalAnswer('safety_accepted_at', new Date().toISOString());
    try {
      completeStep();
    } catch {
      // Analytics step-close must never block Continue.
    }
    router.push('/(onboarding)/q9');
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.heading}>Do any of these apply to you?</Text>
      <Text style={styles.lede}>
        Remedy is a fitness program, not medical care. See a clinician first if
        any of these apply.
      </Text>

      <View style={styles.listCard}>
        <ScrollView
          style={styles.listScroll}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator
          nestedScrollEnabled
        >
          {CONTRAINDICATIONS.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.options}>
        <OptionCard
          label="No"
          selected={hasRedFlag === false}
          onPress={() => handleRedFlag(false)}
        />
        <OptionCard
          label="Yes"
          selected={hasRedFlag === true}
          onPress={() => handleRedFlag(true)}
        />
      </View>

      {hasRedFlag === true && (
        <View style={styles.warningPanel}>
          <Text style={styles.warningText}>
            Please see a doctor or physical therapist before using Remedy. These
            symptoms need a clinician's evaluation, and some need urgent care. If
            you continue, you confirm a licensed clinician has cleared you to
            exercise, or you choose to continue at your own risk.
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <CheckRow checked={agreedLegal} onToggle={handleToggleLegal}>
          <Text style={styles.checkLabel}>
            I'm 16 or older, I agree to the{' '}
            <Text style={styles.link} onPress={openTerms}>
              Terms of Service
            </Text>{' '}
            and{' '}
            <Text style={styles.link} onPress={openPrivacy}>
              Privacy Policy
            </Text>
            , and I consent to Remedy using my answers about my back and pain levels
            (health-related data) to build my program, never for advertising. I can withdraw
            consent anytime by deleting my account.
          </Text>
        </CheckRow>

        <ContinueButton
          label={hasRedFlag === true ? 'I understand, continue' : 'Continue'}
          onPress={handleContinue}
          disabled={!canContinue}
        />
        {hasRedFlag === true && (
          <TouchableOpacity
            style={styles.exitLink}
            onPress={() => router.back()}
            activeOpacity={0.6}
          >
            <Text style={styles.exitText}>I'll check with a clinician first</Text>
          </TouchableOpacity>
        )}
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
  heading: {
    ...type.question,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  lede: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  listCard: {
    flex: 1,
    minHeight: 88,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    ...shadows.low,
    marginBottom: 14,
  },
  listScroll: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 4,
  },
  bulletDot: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textTertiary,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  options: {
    gap: 10,
    flexShrink: 0,
  },
  actions: {
    paddingTop: 12,
    gap: 12,
    flexShrink: 0,
  },
  warningPanel: {
    borderRadius: radius.card,
    backgroundColor: '#FBEFEA',
    padding: 10,
    marginTop: 12,
    flexShrink: 0,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#8A3B2B',
    fontWeight: '500',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  checkLabelWrap: {
    flex: 1,
  },
  checkLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },
  link: {
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  exitLink: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  exitText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
