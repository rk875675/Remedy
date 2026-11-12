import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
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
import { PET_NAMING, PET_NAME_SUGGESTIONS, fillPetLine } from '../../constants/petOnboardingLines';
import {
  PET_NAME_LABEL,
  PET_NAME_MAX_LENGTH,
  PET_NAME_PLACEHOLDER,
} from '../../constants/petLines';
import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { type } from '../../constants/typography';

export default function PetScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { progress, setLocalAnswer, retaking } = useOnboarding();
  useTrackOnboardingStep('pet');
  const completeStep = useOnboardingStepCompletion();
  const { user } = useAuth();
  const { name: petName } = useOnboardingPet();
  const [name, setName] = useState(progress?.pet_name ?? '');
  const suggestIndex = useRef<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const trimmed = name.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= PET_NAME_MAX_LENGTH;

  // The input is the last thing in the scroll content; keep it above the keyboard.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, []);

  // Someone who already has a pet on the server (or is retaking) is never asked again.
  const hasPet = retaking || (!!user && !!petName && !progress?.pet_name);
  useFocusEffect(
    useCallback(() => {
      if (hasPet) router.replace('/(onboarding)/founder');
    }, [hasPet, router]),
  );

  function handleSuggest() {
    hapticSelection();
    const current = trimmed.toLowerCase();
    const pool = PET_NAME_SUGGESTIONS.filter((s) => s.toLowerCase() !== current);
    const start = suggestIndex.current ?? Math.floor(Math.random() * pool.length);
    const next = pool[start % pool.length];
    suggestIndex.current = (start + 1) % pool.length;
    setName(next);
  }

  function handleContinue() {
    if (!valid) return;
    Keyboard.dismiss();
    setLocalAnswer('pet_name', trimmed);
    completeStep();
    router.push('/(onboarding)/grow');
  }

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: true, headerShown: false }} />
      <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <WarmBackground />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={spacing.sm}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.badgeWrap}>
              <PetBadge
                stage={1}
                mood={valid ? 'celebrating' : 'idle'}
                size={height < 720 ? 150 : 220}
              />
            </View>
            <View style={styles.bubbleWrap}>
              <PetBubble
                line={valid ? fillPetLine(PET_NAMING.named.line, { name: trimmed }) : PET_NAMING.asleep.line}
              />
            </View>
            <Text style={styles.title}>{PET_NAMING.title}</Text>
            <Text style={styles.body}>{PET_NAMING.body}</Text>

            <View style={styles.field}>
              <Text style={styles.label}>{PET_NAME_LABEL}</Text>
              <TextInput
                style={styles.input}
                value={name}
                accessibilityLabel={PET_NAME_LABEL}
                onChangeText={setName}
                placeholder={PET_NAME_PLACEHOLDER}
                placeholderTextColor={colors.textTertiary}
                maxLength={PET_NAME_MAX_LENGTH}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
              <TouchableOpacity
                style={styles.suggest}
                onPress={handleSuggest}
                activeOpacity={0.6}
                accessibilityRole="button"
              >
                <Text style={styles.suggestText}>{PET_NAMING.suggest}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <ContinueButton label="Continue" onPress={handleContinue} disabled={!valid} />
          </View>
        </KeyboardAvoidingView>
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
    paddingVertical: spacing.md,
  },
  badgeWrap: {
    marginBottom: spacing.sm,
  },
  bubbleWrap: {
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  suggest: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  suggestText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  title: {
    ...type.display,
    lineHeight: 38,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm + 4,
  },
  body: {
    ...type.body,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
    marginBottom: spacing.xl,
  },
  field: {
    alignSelf: 'stretch',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  input: {
    width: '100%',
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    fontSize: 17,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  footer: {
    paddingTop: spacing.md,
  },
});
