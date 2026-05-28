import React, { useEffect, useRef, useState } from 'react';
import { View, Animated } from 'react-native';
import { Slot, useRouter, useSegments } from 'expo-router';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { OnboardingProvider } from '../context/OnboardingContext';
import { PremiumProvider, usePremium } from '../context/PremiumContext';
import { SuperwallWrapper } from '../lib/superwall';
import { supabase } from '../lib/supabase';
import { colors } from '../constants/colors';

function RootNavigator() {
  const { session, loading } = useAuth();
  const { premium } = usePremium();
  const segments = useSegments();
  const router = useRouter();
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null);
  const hasRedirected = useRef(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [ready, setReady] = useState(false);
  // Latches true once the initial load (auth + supplementary data) completes.
  // Prevents the blank-screen from re-appearing after a fresh sign-in while
  // onboardingDone/premium queries are still in-flight, which would unmount the
  // email form and clear the user's input.
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  useEffect(() => {
    if (loading) return;

    if (!session) {
      setOnboardingDone(null);
      hasRedirected.current = false;
      return;
    }

    supabase
      .from('onboarding_answers')
      .select('id')
      .eq('user_id', session.user.id)
      .single()
      .then(({ data }) => {
        setOnboardingDone(!!data);
      });
  }, [session, loading]);

  useEffect(() => {
    if (loading) return;
    if (onboardingDone === null || premium === null) return;

    const inAuth = segments[0] === '(auth)';
    const inOnboarding = segments[0] === '(onboarding)';
    const inPaywall = segments[0] === '(paywall)';

    if (!session) {
      if (!inAuth) {
        router.replace('/(auth)/sign-in');
      }
      return;
    }

    if (!onboardingDone) {
      if (!inOnboarding) {
        router.replace('/(onboarding)');
        hasRedirected.current = true;
      }
      return;
    }

    if (!premium) {
      if (!inPaywall) {
        router.replace('/(paywall)');
        hasRedirected.current = true;
      }
      return;
    }

    if (inAuth || inOnboarding || inPaywall) {
      router.replace('/(tabs)');
      hasRedirected.current = true;
    }
  }, [session, loading, onboardingDone, premium]);

  const supplementaryReady = !loading && !(session && (onboardingDone === null || premium === null));

  useEffect(() => {
    if (supplementaryReady && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [supplementaryReady, initialLoadComplete]);

  const isReady = initialLoadComplete || supplementaryReady;

  useEffect(() => {
    if (isReady && !ready) {
      setReady(true);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isReady]);

  if (!isReady) {
    return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  }

  return (
    <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
      <Slot />
    </Animated.View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <OnboardingProvider>
        <PremiumProvider>
          <SuperwallWrapper>
            <RootNavigator />
          </SuperwallWrapper>
        </PremiumProvider>
      </OnboardingProvider>
    </AuthProvider>
  );
}
