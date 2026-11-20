import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Pet } from '../../components/pet/Pet';
import { AttributionPopup, type HearValue } from '../../components/onboarding/plan/AttributionPopup';
import { ObScreen, ProgressRow, RevealText, ob, obType } from '../../components/onboarding/kit';
import { useOnboarding } from '../../context/OnboardingContext';
import { setPersonProperties } from '../../lib/analytics';
import {
  durationDetailLabel,
  equipmentLabel,
  locationLabel,
  profileSummary,
  completeIntake,
} from '../../lib/intakeSummary';
import { deriveProfile } from '../../lib/intake';
import { trackDecision, trackOption, useObStep } from '../../lib/onboardingFlow';
import { parseCompleteAnswers, prefetchPlanPreview } from '../../lib/planPreview';
import { useOnboardingPet } from '../../lib/useOnboardingPet';
import { useAfterTransition } from '../../lib/useAfterTransition';
import { useReduceMotion } from '../../lib/useReduceMotion';

const HOLD_MS = 500;
const FAST_ROW_MS = 180;

const ROW_LABELS = [
  'Reading your answers',
  'Mapping your pain pattern',
  'Choosing your exercises',
  'Setting your starting dose',
] as const;

/** Percent beats inside one row. The flat spots are the "this is work" pauses. */
const BEATS: Array<{ at: number; percent: number }> = [
  { at: 160, percent: 18 },
  { at: 380, percent: 34 },
  { at: 560, percent: 38 },
  { at: 820, percent: 63 },
  { at: 1020, percent: 69 },
  { at: 1240, percent: 88 },
  { at: 1500, percent: 100 },
];

const TRUST =
  'Built on back-pain guidelines from the American College of Physicians, NICE and the WHO';

function isSessionMinutes(value: number | null | undefined): value is 15 | 20 | 30 {
  return value === 15 || value === 20 || value === 30;
}

export default function FinalizingScreen() {
  useObStep('finalizing');
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const { height, width } = useWindowDimensions();
  const { answers, intake, progress, setLocalAnswer, hydrated } = useOnboarding();
  const { stage } = useOnboardingPet();
  const reduce = useReduceMotion();
  const ready = useAfterTransition();
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const resumeRef = useRef<(() => void) | null>(null);
  const [completed, setCompleted] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [percent, setPercent] = useState(0);
  const [popup, setPopup] = useState(false);
  const bob = useRef(new Animated.Value(0)).current;

  const parsed = useMemo(() => parseCompleteAnswers(answers), [answers]);
  const intakeFull = useMemo(() => completeIntake(answers, intake), [answers, intake]);
  const summary = useMemo(() => {
    if (!parsed || !intakeFull) return null;
    return profileSummary(parsed, intakeFull, deriveProfile(parsed, intakeFull));
  }, [parsed, intakeFull]);

  const subs = [
    answers.pain_location && intake.duration_detail
      ? `${locationLabel(answers.pain_location)} · ${durationDetailLabel(intake.duration_detail)}`
      : 'Your answers',
    summary?.patternTitle ?? 'Your answers',
    answers.equipment && isSessionMinutes(intake.minutes ?? progress?.minutes)
      ? `${equipmentLabel(answers.equipment)} · ${intake.minutes ?? progress?.minutes} min sessions`
      : 'Your answers',
    summary?.startTitle ?? 'Your starting point',
  ];

  useEffect(() => {
    prefetchPlanPreview(answers, intake);
  }, [answers, intake]);

  useEffect(() => {
    if (!ready || reduce !== false) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(bob, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob, ready, reduce]);

  useEffect(() => {
    if (!hydrated || reduce === null) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const skipAttribution = Boolean(progressRef.current?.hear_about);

    function delay(ms: number): Promise<void> {
      return new Promise((resolve) => {
        const id = setTimeout(resolve, ms);
        timers.push(id);
      });
    }

    async function runRow(index: number) {
      if (reduce) {
        await delay(FAST_ROW_MS);
        if (cancelled) return;
        setCompleted(index + 1);
        return;
      }
      setActive(index);
      setPercent(0);
      const started = Date.now();
      for (const beat of BEATS) {
        const waitMs = Math.max(0, beat.at - (Date.now() - started));
        await delay(waitMs);
        if (cancelled) return;
        setPercent(beat.percent);
      }
      if (cancelled) return;
      setActive(null);
      setCompleted(index + 1);
    }

    async function run() {
      setCompleted(0);
      setActive(null);
      setPercent(0);
      setPopup(false);
      for (let index = 0; index < ROW_LABELS.length; index++) {
        await runRow(index);
        if (cancelled) return;
        if (index === 1 && !skipAttribution) {
          await new Promise<void>((resolve) => {
            resumeRef.current = () => {
              resumeRef.current = null;
              resolve();
            };
            setPopup(true);
          });
          if (cancelled) return;
          setPopup(false);
        }
      }
      await delay(HOLD_MS);
      if (cancelled) return;
      routerRef.current.replace('/(onboarding)/match');
    }

    void run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      resumeRef.current?.();
      resumeRef.current = null;
    };
    // hear_about is read once, when the sequence starts. Saving it must not restart the rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, reduce]);

  function answer(value: HearValue) {
    setLocalAnswer('hear_about', value);
    trackOption('finalizing', value);
    setPersonProperties({ acquisition_source: value });
    setPopup(false);
    resumeRef.current?.();
  }

  function skip() {
    trackDecision('acquisition_source', 'skipped');
    setPopup(false);
    resumeRef.current?.();
  }

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });
  const short = height < 720;
  // 568pt (first-gen SE, and Display Zoom). The open column otherwise meets the pet.
  const tight = height < 600;
  const narrow = width < 380;
  const paddingTop = tight ? 24 : short ? 40 : 48;
  const afterTitle = tight ? 20 : 36;
  const rowGap = tight ? 16 : 24;

  return (
    <>
      <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />
      <ObScreen
        chapter={null}
        onBack={null}
        scroll={false}
        background="plain"
        testID="finalizing"
        contentStyle={styles.stage}
      >
        <View style={[styles.flow, { paddingTop, paddingBottom: tight ? 176 : 220 }]}>
          <RevealText style={[styles.title, narrow ? styles.titleNarrow : null]}>
            {'Personalizing\nyour plan'}
          </RevealText>
          <View style={{ marginTop: afterTitle, gap: rowGap }}>
            {ROW_LABELS.map((label, index) => (
              <ProgressRow
                key={label}
                label={label}
                sub={subs[index]}
                state={index < completed ? 'done' : index === active ? 'active' : 'pending'}
                percent={index === active ? percent : 0}
              />
            ))}
          </View>
          <View style={[styles.trust, { marginTop: tight ? 28 : 40 }]}>
            <View style={styles.rule} />
            <Text style={styles.trustText}>{TRUST}</Text>
          </View>
        </View>
        <View pointerEvents="none" style={styles.petAnchor}>
          <Animated.View style={{ transform: [{ translateY }] }}>
            <Pet
              stage={stage}
              mood="peeking"
              size={320}
              shadow={false}
              accessibilityLabel="Your armadillo peeking over the page"
            />
          </Animated.View>
        </View>
      </ObScreen>
      {popup ? <AttributionPopup onAnswer={answer} onSkip={skip} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    paddingBottom: 0,
  },
  flow: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  title: {
    ...obType.display,
    fontSize: 40,
    lineHeight: 48,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  titleNarrow: {
    fontSize: 34,
    lineHeight: 40,
  },
  trust: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  rule: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: ob.color.accent,
  },
  trustText: {
    ...obType.caption,
    lineHeight: 20,
    fontWeight: '400',
    color: ob.color.inkSoft,
    textAlign: 'center',
  },
  petAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -36,
    alignItems: 'center',
  },
});
