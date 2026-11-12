import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WarmBackground } from '../../components/onboarding/WarmBackground';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { PetBadge } from '../../components/pet/PetBadge';
import { useOnboarding } from '../../context/OnboardingContext';
import {
  PET_MEET_BODY,
  PET_MEET_TITLE,
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
  const { progress, setLocalAnswer } = useOnboarding();
  const [name, setName] = useState(progress?.pet_name ?? '');
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

  function handleContinue() {
    if (!valid) return;
    Keyboard.dismiss();
    setLocalAnswer('pet_name', trimmed);
    router.push('/(onboarding)/commit');
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
              <PetBadge stage={1} mood={valid ? 'ready' : 'idle'} size={height < 720 ? 180 : 220} />
            </View>
            <Text style={styles.title}>{PET_MEET_TITLE}</Text>
            <Text style={styles.body}>{PET_MEET_BODY}</Text>

            <View style={styles.field}>
              <Text style={styles.label}>{PET_NAME_LABEL}</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={PET_NAME_PLACEHOLDER}
                placeholderTextColor={colors.textTertiary}
                maxLength={PET_NAME_MAX_LENGTH}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleContinue}
              />
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
    marginBottom: spacing.lg,
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
