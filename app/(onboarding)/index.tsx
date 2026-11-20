import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { WelcomeStage } from '../../components/onboarding/coldopen/WelcomeStage';
import { ObFooter, ObScreen, PrimaryButton, RevealText, TextLink, ob, obType } from '../../components/onboarding/kit';
import { getResumeStep, rebuildOnboardingStack } from '../../constants/onboardingFlow';
import { useAuth } from '../../context/AuthContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { usePremium } from '../../context/PremiumContext';
import { signedOut } from '../../lib/analytics/events/auth';
import { legalDocumentViewed } from '../../lib/analytics/events/engagement';
import { onboardingStarted } from '../../lib/analytics/events/onboarding';
import { markOnboardingFunnelStart, ONBOARDING_STEP_KEYS } from '../../lib/analytics/onboardingSteps';
import { hapticWarning } from '../../lib/haptics';
import { recordLegalAcceptances } from '../../lib/legalAcceptance';
import { trackOption, useHasPet, useObStep } from '../../lib/onboardingFlow';
import { useAfterTransition } from '../../lib/useAfterTransition';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { useUser } from '../../lib/superwall';

const COPY = {
  headline: 'Stop thinking\nabout your back.',
  start: 'Get started',
  resume: 'Continue',
  account: 'I already have an account',
  terms: 'Terms',
  privacy: 'Privacy Policy',
} as const;

const RISE = 14;

function useRise(delay: number) {
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const anim = useRef(new Animated.Value(reduce === true ? 1 : 0)).current;

  useEffect(() => {
    if (!ready || reduce === null) return;
    if (reduce) {
      anim.setValue(1);
      return;
    }
    anim.setValue(0);
    const motion = Animated.timing(anim, {
      toValue: 1,
      duration: ob.motion.base,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    motion.start();
    return () => motion.stop();
  }, [ready, reduce, delay, anim]);

  return {
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [RISE, 0],
        }),
      },
    ],
  };
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const { goNext } = useObStep('welcome');
  const { resetAnswers, answers, intake, progress, setLocalAnswer, getSnapshot, hydrated } = useOnboarding();
  const hasPet = useHasPet();
  const { user, signOut } = useAuth();
  const { signOut: superwallSignOut } = useUser();
  const { premium, onboardingDone } = usePremium();
  const isLapsed = !!user && onboardingDone === true && premium === false;
  const started = useRef(false);

  useFocusEffect(
    useCallback(() => {
      started.current = false;
    }, []),
  );

  const flow = { answers, intake, progress, hasPet };
  const resumeStep = getResumeStep(flow);
  const canResume = resumeStep !== 'welcome';
  const cta = canResume || isLapsed ? COPY.resume : COPY.start;

  const headlineStyle = useRise(0);
  const footerStyle = useRise(120);

  async function handleSignOut() {
    hapticWarning();
    signedOut({ source_screen: 'onboarding' });
    void superwallSignOut();
    await signOut();
  }

  function openLegal(document: 'terms' | 'privacy') {
    legalDocumentViewed({ document, source_screen: 'onboarding' });
    router.push(document === 'terms' ? '/(legal)/terms' : '/(legal)/privacy');
  }

  function agree() {
    setLocalAnswer('agreed_legal', true);
    void recordLegalAcceptances(['age', 'health_consent', 'terms', 'privacy']).catch(() => {});
    trackOption('welcome', 'legal_assent');
  }

  function handleStart() {
    if (!hydrated || started.current) return;
    if (isLapsed) {
      started.current = true;
      router.push('/(onboarding)/match?lapsed=1');
      return;
    }
    started.current = true;
    markOnboardingFunnelStart();
    onboardingStarted({
      is_resume: canResume,
      ...(canResume
        ? {
            resume_step_key: resumeStep,
            resume_step_index: ONBOARDING_STEP_KEYS.indexOf(resumeStep),
          }
        : {}),
    });
    if (canResume) {
      agree();
      const snap = getSnapshot();
      rebuildOnboardingStack(
        {
          replace: (href) => {
            router.replace(href as never);
          },
          push: (href) => {
            router.push(href as never);
          },
        },
        resumeStep,
        { answers: snap.answers, intake: snap.intake, progress: snap.progress, hasPet },
      );
      return;
    }
    resetAnswers();
    agree();
    goNext();
  }

  return (
    <ObScreen
      testID="welcome"
      chapter={null}
      onBack={null}
      background="plain"
      fade={false}
      footerColor="transparent"
      scroll={false}
      contentStyle={styles.frame}
      footer={
        <ObFooter>
          <Animated.View style={footerStyle}>
            <PrimaryButton testID="start" label={cta} variant="ink" disabled={!hydrated} onPress={handleStart} />
            {user ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Signed in as ${user.email ?? 'an account'}. Sign out`}
                onPress={() => {
                  void handleSignOut();
                }}
                style={styles.signIn}
              >
                <Text style={[styles.signInText, styles.onHill]}>
                  Signed in as {user.email ?? 'an account'} on this device.{' '}
                  <Text style={styles.signOut}>Sign out</Text>
                </Text>
              </Pressable>
            ) : (
              <TextLink
                label={COPY.account}
                tone="light"
                onPress={() => {
                  router.navigate('/(auth)/sign-in');
                }}
              />
            )}
            <Text style={[styles.consent, styles.onHill]}>
              By tapping Get started, I confirm I'm 17+, agree to the{' '}
              <Text
                style={[styles.consentLink, styles.onHill]}
                onPress={() => openLegal('terms')}
                accessibilityRole="link"
                accessibilityLabel={COPY.terms}
                testID="legal-terms"
              >
                {COPY.terms}
              </Text>{' '}
              and{' '}
              <Text
                style={[styles.consentLink, styles.onHill]}
                onPress={() => openLegal('privacy')}
                accessibilityRole="link"
                accessibilityLabel={COPY.privacy}
                testID="legal-privacy"
              >
                {COPY.privacy}
              </Text>
              , and consent to Remedy using my answers about my back and health to build my plan.
            </Text>
          </Animated.View>
        </ObFooter>
      }
    >
      <WelcomeStage />
      <View pointerEvents="none" style={styles.middle}>
        <Animated.View style={headlineStyle}>
          <RevealText style={[styles.headline, height < 740 && styles.headlineShort]}>{COPY.headline}</RevealText>
        </Animated.View>
      </View>
    </ObScreen>
  );
}

const styles = StyleSheet.create({
  frame: {
    flex: 1,
    paddingHorizontal: 0,
    paddingBottom: 0,
  },
  middle: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 36,
  },
  headline: {
    fontSize: 66,
    lineHeight: 70,
    fontWeight: '800',
    letterSpacing: -1.8,
    color: '#000000',
    textAlign: 'center',
  },
  headlineShort: {
    fontSize: 54,
    lineHeight: 58,
  },
  signIn: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  signInText: {
    ...obType.caption,
    textAlign: 'center',
  },
  signOut: {
    color: ob.color.accent,
    fontWeight: '700',
  },
  consent: {
    fontSize: 12.5,
    lineHeight: 18,
    color: ob.color.inkSoft,
    textAlign: 'center',
  },
  consentLink: {
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  onHill: {
    color: '#F6EDE0',
  },
});
