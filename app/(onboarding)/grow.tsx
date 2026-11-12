import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { useRouter, Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PetBadge } from '../../components/pet/PetBadge';
import { PetBubble } from '../../components/pet/PetSays';
import { useOnboarding, useTrackOnboardingStep } from '../../context/OnboardingContext';
import { useAuth } from '../../context/AuthContext';
import { useOnboardingPet } from '../../lib/useOnboardingPet';
import { useOnboardingStepCompletion } from '../../lib/analytics/onboardingSteps';
import { hapticSelection } from '../../lib/haptics';
import { PET_GROW_PREVIEW, fillPetLine } from '../../constants/petOnboardingLines';
import type { PetStage } from '../../constants/petImages';
import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { type } from '../../constants/typography';

const STAGES: readonly PetStage[] = [1, 2, 3, 4, 5];

export default function GrowScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { progress, retaking } = useOnboarding();
  useTrackOnboardingStep('grow');
  const completeStep = useOnboardingStepCompletion();
  const { user } = useAuth();
  const { name } = useOnboardingPet();
  const [selected, setSelected] = useState(0);
  const [seenGrowth, setSeenGrowth] = useState(false);

  // Someone who already has a pet on the server (or is retaking) skips this screen.
  const hasPet = retaking || (!!user && !!name && !progress?.pet_name);
  useFocusEffect(
    useCallback(() => {
      if (hasPet) router.replace('/(onboarding)/founder');
    }, [hasPet, router]),
  );

  function handleSelect(index: number) {
    hapticSelection();
    setSelected(index);
    if (index > 0) setSeenGrowth(true);
  }

  function handleContinue() {
    if (!seenGrowth) return;
    completeStep();
    router.push('/(onboarding)/founder');
  }

  const stage = PET_GROW_PREVIEW.stages[selected];

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <WarmBackground />
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <Text style={styles.title}>{fillPetLine(PET_GROW_PREVIEW.title, { name })}</Text>
          <View style={styles.badgeWrap}>
            <PetBadge stage={STAGES[selected]} mood={stage.mood} size={height < 720 ? 180 : 220} />
          </View>
          <View style={styles.bubbleWrap}>
            <PetBubble line={stage.line} />
          </View>
          <View style={styles.chips}>
            {PET_GROW_PREVIEW.chips.map((label, i) => {
              const active = i === selected;
              return (
                <TouchableOpacity
                  key={label}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => handleSelect(i)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={/^\d+$/.test(label) ? `${label} sessions` : label}
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={styles.note}>{fillPetLine(PET_GROW_PREVIEW.note, { name })}</Text>
        </ScrollView>

        <View style={styles.footer}>
          <ContinueButton
            label={seenGrowth ? 'Continue' : `Tap to see ${fillPetLine('{name}', { name })} grow`}
            onPress={handleContinue}
            disabled={!seenGrowth}
          />
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
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...type.display,
    lineHeight: 38,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  badgeWrap: {
    marginBottom: spacing.sm,
  },
  bubbleWrap: {
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  chips: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    marginBottom: spacing.lg,
  },
  chip: {
    height: 40,
    minWidth: 44,
    paddingHorizontal: 12,
    borderRadius: radius.circle,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  chipTextActive: {
    color: colors.surface,
  },
  note: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  footer: {
    paddingTop: spacing.md,
  },
});
