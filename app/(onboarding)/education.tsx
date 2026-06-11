import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter, Stack, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { colors } from '../../constants/colors';

const slides = [
  {
    icon: '◎',
    title: 'Structured rehab,\nin your pocket',
    body: 'Real PT-designed programs that guide you through every session — not random YouTube stretches.',
  },
  {
    icon: '✦',
    title: 'Designed by\nlicensed PTs',
    body: 'Every exercise is selected and sequenced by a licensed physical therapist for safe, progressive recovery.',
  },
  {
    icon: '◐',
    title: 'Track your\nprogress',
    body: 'See your pain trend and watch your mobility improve week over week.',
  },
];

export default function EducationScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);

  const slide = slides[page];
  const isLast = page === slides.length - 1;

  // Intercept swipe-back / hardware back when on slide 2+ so it steps back
  // through slides rather than jumping to disclaimer.
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e: { preventDefault: () => void }) => {
      if (page > 0) {
        e.preventDefault();
        setPage(p => p - 1);
      }
    });
    return unsubscribe;
  }, [navigation, page]);

  function handleNext() {
    if (isLast) {
      router.push('/(onboarding)/q6');
    } else {
      setPage(page + 1);
    }
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.content}>
          <View style={styles.iconArea}>
            <Text style={styles.icon}>{slide.icon}</Text>
          </View>

          <Text style={styles.title}>{slide.title}</Text>
          <Text style={styles.body}>{slide.body}</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.dotsRow}>
            {slides.map((_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>
          <ContinueButton label={isLast ? 'Continue' : 'Next'} onPress={handleNext} />
          <TouchableOpacity
            style={styles.signInLink}
            onPress={() => router.push('/(auth)/sign-in' as any)}
            activeOpacity={0.7}
          >
            <Text style={styles.signInText}>Already have an account? <Text style={styles.signInBold}>Sign in</Text></Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
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
    alignItems: 'center',
  },
  iconArea: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  icon: {
    fontSize: 40,
    color: '#FFFFFF',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 38,
  },
  body: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 12,
  },
  footer: {
    gap: 20,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E8E0DC',
  },
  dotActive: {
    backgroundColor: colors.textPrimary,
    width: 24,
  },
  signInLink: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  signInText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  signInBold: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
});
