import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { PetSays } from '../../components/pet/PetSays';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { recordLegalAcceptances } from '../../lib/legalAcceptance';
import { legalDocumentViewed } from '../../lib/analytics/events/engagement';
import { onboardingOptionSelected } from '../../lib/analytics/events/onboarding';
import { MEDICAL_DISCLAIMER_LINE } from '../../constants/legalTerms';
import { colors, serifFont } from '../../constants/colors';
import { PET_PRESENTS } from '../../constants/petOnboardingLines';
import { useOnboardingPet } from '../../lib/useOnboardingPet';

// Every claim here must stay literally true of the product and the cited guidelines.
// No clinician-authorship claims: the program is rules-based and the demo videos are
// AI-generated (see legalTerms). Wellness language only — never "treat" or "cure".
const REASONS: { title: string; body: string }[] = [
  {
    title: 'Backed by guidelines',
    body: 'Exercise is what leading medical guidelines recommend first for lasting back pain.',
  },
  {
    title: 'Made for your back',
    body: 'Your answers set the focus, starting level, and length.',
  },
  {
    title: 'Adjusts every week',
    body: "It only steps up when your pain says you're ready.",
  },
];

export default function ProofScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { stage } = useOnboardingPet();
  const { setLocalAnswer } = useOnboarding();
  useTrackOnboardingStep('proof');

  function openLegal(document: 'terms' | 'privacy') {
    try {
      legalDocumentViewed({ document, source_screen: 'onboarding' });
    } catch {
      // Analytics must never block opening the document.
    }
    router.push(`/(legal)/${document}` as never);
  }

  // Tapping the button is the affirmative act for Terms/Privacy assent and explicit
  // consent to process health-related answers (GDPR Art. 9, WA MHMDA, CPRA). It must
  // stay before q9, the first screen that collects health information, and the
  // fine print must stay adjacent to the button.
  function handleAgree() {
    void recordLegalAcceptances(['disclaimer', 'age', 'health_consent', 'terms', 'privacy']).catch(
      () => {},
    );
    try {
      onboardingOptionSelected({
        step_key: 'proof',
        option_value: 'legal_assent',
        is_multi_select: false,
        is_deselect: false,
      });
    } catch {
      // Analytics must never block Continue.
    }
    setLocalAnswer('agreed_legal', true);
    setLocalAnswer('safety_accepted_at', new Date().toISOString());
    router.push('/(onboarding)/q0');
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <WarmBackground />
        <View style={styles.petSays}>
          <PetSays
            line={PET_PRESENTS.proof.line}
            mood={PET_PRESENTS.proof.mood}
            stage={stage}
            asleep
            entrance="none"
          />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Why Remedy works</Text>

          {REASONS.map((r, i) => (
            <View key={r.title} style={[styles.row, i > 0 && styles.rowDivider]}>
              <Text style={styles.number}>{i + 1}</Text>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{r.title}</Text>
                <Text style={styles.rowBody}>{r.body}</Text>
              </View>
            </View>
          ))}

          <Text style={styles.source}>
            Sources: American College of Physicians (2017); NICE guideline NG59.
          </Text>
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.consent}>
            By tapping Agree & continue, I confirm I'm 17+, agree to the{' '}
            <Text style={styles.link} onPress={() => openLegal('terms')}>
              Terms
            </Text>{' '}
            and{' '}
            <Text style={styles.link} onPress={() => openLegal('privacy')}>
              Privacy Policy
            </Text>
            , and consent to Remedy using my answers about my back to build my plan.{' '}
            {MEDICAL_DISCLAIMER_LINE}
          </Text>
          <ContinueButton label="Agree & continue" onPress={handleAgree} />
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 28,
    overflow: 'hidden',
  },
  petSays: {
    marginBottom: 20,
  },
  scroll: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 16,
  },
  title: {
    fontSize: 36,
    lineHeight: 42,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.primaryDeep,
    letterSpacing: -0.8,
    marginBottom: 28,
  },
  row: {
    flexDirection: 'row',
    gap: 18,
    paddingVertical: 18,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  number: {
    width: 22,
    fontSize: 26,
    lineHeight: 28,
    fontFamily: serifFont,
    color: colors.secondary,
  },
  rowText: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.2,
  },
  rowBody: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.textSecondary,
  },
  source: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.textTertiary,
    marginTop: 16,
  },
  footer: {
    gap: 12,
    paddingTop: 8,
  },
  consent: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
  },
  link: {
    color: colors.primary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
