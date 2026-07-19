import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { AppLogo } from '../../components/brand/AppLogo';
import {
  useOnboarding,
  getResumeStep,
  ONBOARDING_FLOW,
  ONBOARDING_STEP_PATHS,
} from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { useUser } from '../../lib/superwall';
import { hapticWarning } from '../../lib/haptics';
import { colors, serifFont } from '../../constants/colors';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resetAnswers, answers, progress } = useOnboarding();
  // A stale session (signed in during a previous test/session) is otherwise invisible
  // here: tapping "Sign in" would silently bounce to the tabs (root guard treats an
  // already-authed, fully-onboarded user on an auth route as misplaced) with no
  // explanation. Surface it and offer a real way out instead.
  const { user, signOut } = useAuth();
  const { signOut: superwallSignOut } = useUser();

  async function handleSignOut() {
    hapticWarning();
    void superwallSignOut();
    await signOut();
  }
  // Saved progress means an unauthenticated user backed out to welcome mid-funnel; the
  // root guard normally resumes them before this screen shows. Keep their answers and
  // offer to continue rather than wiping (the old mount-reset silently lost everything).
  // Resume target is clamped to the first step whose data is missing — jumping to the
  // furthest-reached screen with earlier answers gone strands the user on match's
  // "complete all questions" error.
  const resumeStep = getResumeStep(progress, answers);
  const canResume = resumeStep !== 'welcome';

  function handleStart() {
    if (canResume) {
      // Push every step up to the resume target so swipe-back works through the quiz
      // instead of dead-ending on a single orphaned screen.
      const targetIndex = ONBOARDING_FLOW.indexOf(resumeStep);
      for (let i = 1; i <= targetIndex; i++) {
        router.push(ONBOARDING_STEP_PATHS[ONBOARDING_FLOW[i]]);
      }
      return;
    }
    // Fresh run: clear any orphaned answers/progress before beginning.
    resetAnswers();
    router.push('/(onboarding)/founder');
  }

  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const nameTranslate = useRef(new Animated.Value(10)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslate = useRef(new Animated.Value(10)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fadeUp = (opacity: Animated.Value, translate: Animated.Value) =>
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translate, {
          toValue: 0,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);

    Animated.sequence([
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 12,
          bounciness: 8,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 350,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.stagger(90, [
        fadeUp(nameOpacity, nameTranslate),
        fadeUp(subtitleOpacity, subtitleTranslate),
        Animated.timing(footerOpacity, {
          toValue: 1,
          duration: 320,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, []);

  return (
    <View style={[styles.container, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Animated.View
          style={[{ marginBottom: 24 }, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
        >
          <AppLogo size="md" />
        </Animated.View>
        <Animated.Text
          style={[styles.appName, { opacity: nameOpacity, transform: [{ translateY: nameTranslate }] }]}
        >
          Remedy
        </Animated.Text>
        <Animated.Text
          style={[
            styles.subtitle,
            { opacity: subtitleOpacity, transform: [{ translateY: subtitleTranslate }] },
          ]}
        >
          Your back pain, finally fixed.
        </Animated.Text>
      </View>

      <Animated.View style={[styles.footer, { opacity: footerOpacity }]}>
        <ContinueButton label={canResume ? 'Continue' : 'Get Started'} onPress={handleStart} />
        {user ? (
          <TouchableOpacity style={styles.signInLink} onPress={handleSignOut} activeOpacity={0.6}>
            <Text style={styles.signInText}>
              Signed in as {user.email ?? 'an account'} on this device.{' '}
              <Text style={styles.signInBold}>Sign out</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.signInLink}
            onPress={() => router.navigate('/(auth)/sign-in')}
            activeOpacity={0.6}
          >
            <Text style={styles.signInText}>
              Already have an account? <Text style={styles.signInBold}>Sign in</Text>
            </Text>
          </TouchableOpacity>
        )}
      </Animated.View>
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
  appName: {
    fontSize: 42,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 27,
    color: colors.textSecondary,
  },
  footer: {
    paddingBottom: 8,
    gap: 16,
  },
  signInLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  signInText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  signInBold: {
    color: colors.primary,
    fontWeight: '600',
  },
});
