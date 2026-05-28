import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Keyboard,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as StoreReview from 'expo-store-review';
import { ContinueButton } from '../../components/onboarding/ContinueButton';
import { colors } from '../../constants/colors';

const STARS = [1, 2, 3, 4, 5];

export default function ReviewScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const inputRef = useRef<TextInput>(null);

  async function handleSubmit() {
    Keyboard.dismiss();

    if (rating >= 4) {
      try {
        const available = await StoreReview.isAvailableAsync();
        if (available) {
          await StoreReview.requestReview();
        }
      } catch {
        // Native review not available (Expo Go / not published yet)
      }
    }

    router.push('/(onboarding)/finalizing');
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + 40 }]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <Text style={styles.heading}>How's the experience so far?</Text>
          <Text style={styles.subheading}>
            Your feedback helps us build a better app for everyone.
          </Text>

          <View style={styles.stars}>
            {STARS.map((star) => (
              <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                <Text style={[styles.star, star <= rating && styles.starActive]}>
                  ★
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {rating > 0 && (
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder="Tell us more (optional)"
              placeholderTextColor={colors.textSecondary}
              value={feedback}
              onChangeText={setFeedback}
              multiline
              textAlignVertical="top"
              returnKeyType="done"
              blurOnSubmit
              onSubmitEditing={() => Keyboard.dismiss()}
            />
          )}
        </View>

        <View style={styles.footer}>
          <ContinueButton
            label={rating > 0 ? 'Submit & Continue' : 'Skip'}
            onPress={handleSubmit}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  heading: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  subheading: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  stars: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  star: {
    fontSize: 40,
    color: '#E8E0DC',
  },
  starActive: {
    color: colors.primary,
  },
  input: {
    width: '100%',
    height: 100,
    borderRadius: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingTop: 14,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: '#E8E0DC',
  },
  footer: {
    paddingTop: 20,
    paddingBottom: 8,
  },
});
