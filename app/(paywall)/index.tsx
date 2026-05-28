import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { usePremium } from '../../context/PremiumContext';
import { usePlacement, useUser, SUPERWALL_AVAILABLE } from '../../lib/superwall';
import { supabase } from '../../lib/supabase';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { colors } from '../../constants/colors';

export default function PaywallScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { refreshPremium } = usePremium();
  const { identify } = useUser();
  const [loading, setLoading] = useState(false);

  const { registerPlacement } = usePlacement({
    onDismiss: async () => {
      if (!user) return;
      await refreshPremium();
    },
    onError: (err) => {
      Alert.alert('Error', err);
    },
  });

  useEffect(() => {
    if (user && SUPERWALL_AVAILABLE) {
      identify(user.id);
    }
  }, [user]);

  async function handleShowPaywall() {
    if (!SUPERWALL_AVAILABLE) {
      if (!user) return;
      setLoading(true);

      try {
        const { data, error } = await supabase.functions.invoke('grant-dev-trial');

        if (error || !data?.success) {
          Alert.alert(
            'Dev Trial',
            'Could not grant dev trial. Make sure your profile has is_dev = true.',
          );
          return;
        }

        await refreshPremium();
      } catch {
        Alert.alert('Dev Trial', 'Something went wrong. Try again.');
      } finally {
        setLoading(false);
      }
      return;
    }

    await registerPlacement({
      placement: 'onboarding_paywall',
      feature() {
        router.replace('/(tabs)');
      },
    });
  }

  async function handleRestore() {
    if (!user) return;
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('restore-purchases', {
        body: {
          userId: user.id,
          originalTransactionId: 'restore_check',
        },
      });

      if (data?.success) {
        await refreshPremium();
      } else {
        Alert.alert('Restore', 'No active subscription found.');
      }
    } catch {
      Alert.alert('Restore', 'Could not restore purchases. Try again later.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.content}>
        <Text style={styles.title}>Start Your Free Trial</Text>
        <Text style={styles.subtitle}>
          7 days free, then $12.99/month or $79.99/year
        </Text>

        <View style={styles.features}>
          <Text style={styles.feature}>Personalized back pain program</Text>
          <Text style={styles.feature}>Video-guided exercise sessions</Text>
          <Text style={styles.feature}>Pain tracking and progress insights</Text>
          <Text style={styles.feature}>Cancel anytime</Text>
        </View>

        {!SUPERWALL_AVAILABLE && (
          <View style={styles.devBanner}>
            <Text style={styles.devText}>
              Expo Go: Superwall unavailable. Tap below to skip with a dev trial.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <ContinueButton
          label={SUPERWALL_AVAILABLE ? 'Start Free Trial' : 'Start Dev Trial'}
          onPress={handleShowPaywall}
          disabled={loading}
        />
        <Text style={styles.restore} onPress={handleRestore}>
          Restore Purchases
        </Text>
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
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 40,
  },
  features: {
    gap: 14,
  },
  feature: {
    fontSize: 17,
    color: colors.textPrimary,
    paddingLeft: 8,
  },
  devBanner: {
    marginTop: 24,
    padding: 12,
    borderRadius: 10,
    backgroundColor: '#FFF3E0',
    borderWidth: 1,
    borderColor: colors.warning,
  },
  devText: {
    fontSize: 13,
    color: colors.warning,
    textAlign: 'center',
  },
  footer: {
    gap: 16,
    alignItems: 'center',
  },
  restore: {
    fontSize: 15,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
