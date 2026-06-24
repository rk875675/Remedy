import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { useOnboarding } from '../../context/OnboardingContext';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';

export default function WelcomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resetAnswers } = useOnboarding();

  const logoScale = useRef(new Animated.Value(0.7)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const nameTranslate = useRef(new Animated.Value(10)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const subtitleTranslate = useRef(new Animated.Value(10)).current;
  const footerOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    resetAnswers();
  }, []);

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
          style={[styles.logoWrap, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
        >
          <View style={styles.logoHalo} />
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>R</Text>
          </View>
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
        <ContinueButton label="Get Started" onPress={() => router.push('/(onboarding)/education')} />
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
  logoWrap: {
    width: 112,
    height: 112,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  logoHalo: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: radius.circle,
    backgroundColor: colors.primaryMuted,
  },
  logoCircle: {
    width: 84,
    height: 84,
    borderRadius: radius.circle,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.high,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.3,
  },
  logoText: {
    fontSize: 40,
    fontFamily: serifFont,
    fontWeight: '700',
    color: '#FFFFFF',
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
});
