import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, serifFont } from '../constants/colors';
import { radius, spacing } from '../constants/spacing';
import { shadows } from '../constants/shadows';
import { type as typography } from '../constants/typography';
import { ContinueButton } from '../components/onboarding/ContinueButton';
import { hapticSelection, hapticSuccess, hapticError } from '../lib/haptics';
import { submitFeedback } from '../lib/submitFeedback';
import {
  feedbackSubmitFailed,
  feedbackSubmitted,
  reviewAskShown,
} from '../lib/analytics/events/engagement';
import { isManualWriteReviewAvailable, openWriteReviewPage } from '../lib/app-store-review';
import type { FeedbackCategory } from '../types/database';

const MIN_BODY = 10;
const MAX_BODY = 2000;

const CATEGORIES: { id: FeedbackCategory; label: string; hint: string }[] = [
  { id: 'bug', label: 'Bug', hint: 'Something broken' },
  { id: 'idea', label: 'Idea', hint: 'A change you want' },
  { id: 'question', label: 'Question', hint: 'Need a hand' },
  { id: 'other', label: 'Other', hint: 'Anything else' },
];

const RATINGS = [1, 2, 3, 4, 5] as const;

type Phase = 'form' | 'thanks' | 'review_ask';

export default function FeedbackScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const inputOffset = useRef(0);
  const [category, setCategory] = useState<FeedbackCategory | null>(null);
  const [rating, setRating] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [phase, setPhase] = useState<Phase>('form');
  const [askRating, setAskRating] = useState<4 | 5 | null>(null);
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const canSend = category !== null && trimmed.length >= MIN_BODY && !submitting;

  useEffect(() => {
    if (phase === 'review_ask' && askRating !== null) {
      reviewAskShown({ source_screen: 'feedback', rating: askRating });
    }
  }, [phase, askRating]);

  function handleCategory(next: FeedbackCategory) {
    hapticSelection();
    setCategory((current) => (current === next ? null : next));
    setError(null);
  }

  function handleRating(next: number) {
    hapticSelection();
    setRating((current) => (current === next ? null : next));
  }

  function scrollToComposer() {
    setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: Math.max(0, inputOffset.current - 16),
        animated: true,
      });
    }, 280);
  }

  async function handleSend() {
    if (!category || submitting) return;
    if (trimmed.length < MIN_BODY) {
      setError('A sentence or two is plenty — just enough that we can follow it.');
      return;
    }

    setSubmitting(true);
    setError(null);
    const result = await submitFeedback({
      category,
      rating,
      body: trimmed,
    });
    setSubmitting(false);

    if (!result.ok) {
      hapticError();
      feedbackSubmitFailed({ reason: result.error });
      if (result.error === 'rate_limited') {
        setError("You've sent a few notes already. Try again in a bit.");
        return;
      }
      if (result.error === 'duplicate') {
        setError('You already sent that note.');
        return;
      }
      if (result.error === 'invalid_body') {
        setError('Add a bit more detail so we can follow it.');
        return;
      }
      setError("Couldn't send that. Check your connection and try again.");
      return;
    }

    // Length and category only — never the body. See docs/ANALYTICS.md §6.1.
    feedbackSubmitted({
      category,
      rating: rating ?? undefined,
      feedback_length: trimmed.length,
    });
    hapticSuccess();

    const happy = rating === 4 || rating === 5;
    if (happy && Platform.OS === 'ios' && (await isManualWriteReviewAvailable())) {
      setAskRating(rating);
      setPhase('review_ask');
      return;
    }
    setPhase('thanks');
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          activeOpacity={0.7}
          style={styles.backButton}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
      </View>

      {phase === 'review_ask' ? (
        <View style={[styles.successWrap, { paddingBottom: insets.bottom + spacing.xl }]}>
          <Text style={styles.successTitle}>Thank you</Text>
          <Text style={styles.successBody}>
            Notes like yours are how Remedy gets better for the next person with back pain.
          </Text>
          <Text style={styles.askTitle}>Want to share that with others?</Text>
          <Text style={styles.successBody}>
            A public review helps someone else find a plan — and it takes about 15 seconds.
          </Text>
          <View style={styles.successCta}>
            <ContinueButton
              label="Leave a review"
              onPress={() => {
                openWriteReviewPage('feedback');
                router.back();
              }}
            />
            <TouchableOpacity
              onPress={() => router.back()}
              activeOpacity={0.7}
              style={styles.notNow}
              accessibilityRole="button"
              accessibilityLabel="Not now"
            >
              <Text style={styles.notNowText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : phase === 'thanks' ? (
        <View style={[styles.successWrap, { paddingBottom: insets.bottom + spacing.xl }]}>
          <View style={styles.successMark}>
            <Text style={styles.successMarkText}>✓</Text>
          </View>
          <Text style={styles.successTitle}>Thank you</Text>
          <Text style={styles.successBody}>
            We read every note. If we need more, we’ll email you.
          </Text>
          <View style={styles.successCta}>
            <ContinueButton label="Done" onPress={() => router.back()} />
          </View>
        </View>
      ) : (
        <>
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>What’s on your mind?</Text>
            <Text style={styles.subtitle}>
              A bug, an idea, or just something to say. We read every note.
            </Text>

            <Text style={styles.sectionLabel}>What is this?</Text>
            <View style={styles.categoryGrid}>
              {CATEGORIES.map((item) => {
                const selected = category === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => handleCategory(item.id)}
                    style={[styles.categoryCard, selected && styles.categoryCardSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${item.label}. ${item.hint}`}
                  >
                    <Text style={[styles.categoryLabel, selected && styles.categoryLabelSelected]}>
                      {item.label}
                    </Text>
                    <Text style={styles.categoryHint}>{item.hint}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionLabel}>How’s Remedy feeling?</Text>
            <Text style={styles.optionalHint}>Optional</Text>
            <View style={styles.ratingRow}>
              {RATINGS.map((value) => {
                const selected = rating === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => handleRating(value)}
                    style={[styles.ratingDot, selected && styles.ratingDotSelected]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`Rating ${value} of 5`}
                  >
                    <Text style={[styles.ratingNum, selected && styles.ratingNumSelected]}>
                      {value}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.ratingCaptions}>
              <Text style={styles.ratingCaption}>Rough</Text>
              <Text style={styles.ratingCaption}>Great</Text>
            </View>

            <View
              onLayout={(e) => {
                inputOffset.current = e.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.sectionLabel}>Tell us more</Text>
              <TextInput
                style={styles.textarea}
                value={body}
                onChangeText={(value) => {
                  if (value.length <= MAX_BODY) setBody(value);
                  if (error) setError(null);
                }}
                onFocus={scrollToComposer}
                placeholder="A sentence or two is plenty."
                placeholderTextColor={colors.textTertiary}
                multiline
                textAlignVertical="top"
                maxLength={MAX_BODY}
                autoCorrect
                accessibilityLabel="Feedback message"
              />
              <Text style={styles.counter}>
                {trimmed.length} / {MAX_BODY}
              </Text>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
          </ScrollView>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {submitting ? (
              <View style={styles.sending}>
                <ActivityIndicator color="#FFFFFF" />
                <Text style={styles.sendingText}>Sending…</Text>
              </View>
            ) : (
              <ContinueButton label="Send" onPress={() => void handleSend()} disabled={!canSend} />
            )}
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  backButton: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
  },
  backText: {
    fontSize: 17,
    color: colors.primary,
    fontWeight: '500',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  title: {
    ...typography.question,
    color: colors.textPrimary,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: spacing.xl,
  },
  sectionLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  optionalHint: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: -6,
    marginBottom: 10,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: spacing.xl,
  },
  categoryCard: {
    flexGrow: 1,
    flexBasis: '46%',
    maxWidth: '48.5%',
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 4,
  },
  categoryCardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
    ...shadows.low,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.12,
  },
  categoryLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  categoryLabelSelected: {
    color: colors.primaryDeep,
  },
  categoryHint: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  ratingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  ratingDot: {
    flex: 1,
    height: 48,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ratingDotSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primary,
  },
  ratingNum: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  ratingNumSelected: {
    color: '#FFFFFF',
  },
  ratingCaptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: spacing.xl,
  },
  ratingCaption: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  textarea: {
    minHeight: 140,
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  counter: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'right',
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  errorText: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: colors.secondary,
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    backgroundColor: colors.background,
  },
  sending: {
    height: 54,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  sendingText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  successWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 36,
  },
  successMark: {
    width: 64,
    height: 64,
    borderRadius: radius.circle,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  successMarkText: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 32,
  },
  successTitle: {
    fontFamily: serifFont,
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    marginBottom: 10,
    textAlign: 'center',
  },
  askTitle: {
    ...typography.heading,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  successBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  successCta: {
    width: '100%',
    marginTop: 8,
  },
  notNow: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  notNowText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
