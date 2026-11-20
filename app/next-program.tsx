import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  Animated,
  Easing,
  BackHandler,
  AppState,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { z } from 'zod';

import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { OptionCard } from '../components/onboarding/OptionCard';
import { ContinueButton } from '../components/onboarding/ContinueButton';
import { ProgressBar } from '../components/onboarding/ProgressBar';
import { PetSays } from '../components/pet/PetSays';
import { colors, serifFont } from '../constants/colors';
import { radius, spacing } from '../constants/spacing';
import { shadows } from '../constants/shadows';
import { type as typography } from '../constants/typography';
import {
  EQUIPMENT_OPTIONS,
  MAIN_GOAL_OPTIONS,
  PAIN_LOCATION_OPTIONS,
  SESSIONS_PER_WEEK_VALUES,
} from '../constants/onboardingQuestions';
import { PET_NEXT_PROGRAM_BUILDING, PET_NEXT_PROGRAM_READY } from '../constants/petLines';
import { GOAL_ILLUSTRATIONS, LOCATION_IMAGES } from '../constants/onboardingImages';
import {
  CHECKIN_COPY,
  CHECKIN_STEP_KEYS,
  DIFFICULTY_OPTIONS,
  PAIN_CHANGE_OPTIONS,
  WORSE_PAIN_NOTE,
  type CheckinStepKey,
} from '../constants/nextProgramQuestions';
import {
  checkinFromDraft,
  clearCheckinDraft,
  loadCheckinDraft,
  newCheckinDraft,
  newIdempotencyKey,
  saveCheckinDraft,
  startNextProgram,
  type CheckinDefaults,
  type CheckinDraft,
  type StartNextProgramError,
} from '../lib/nextProgram';
import { nextProgramHighlights, type PlanShape, type ProgramHighlight } from '../lib/programSummary';
import { nextProgramFailed, nextProgramStarted } from '../lib/analytics/events/program';
import { hapticCelebration, hapticError, hapticSelection } from '../lib/haptics';
import { fetchPetState } from '../lib/petApi';
import type { PetState } from '../lib/pet';
import { invalidateTabRefresh } from '../lib/tabRefresh';
import {
  equipmentSchema,
  mainGoalSchema,
  NEXT_PROGRAM_FEEDBACK_MAX,
  nextProgramChoiceSchema,
  painLocationSchema,
  sessionsPerWeekSchema,
  type NextProgramChoice,
  type StartNextProgramResult,
} from '../lib/schemas';
import type { MainGoal } from '../types/database';

type Phase = 'loading' | 'questions' | 'building' | 'ready' | 'error';
type Failure = { kind: 'load' } | { kind: 'submit'; reason: StartNextProgramError };

const LAST_STEP = CHECKIN_STEP_KEYS.length - 1;
// The build reads as a moment, not a flash; the request runs underneath it.
const MIN_BUILD_MS = 2400;

const BUILD_STEPS: Record<NextProgramChoice, string[]> = {
  continue: [
    'Reviewing your last program',
    'Leveling up your progressions',
    'Building your weekly schedule',
  ],
  rebuild: [
    'Reading your check-in',
    'Tuning exercises to your answers',
    'Building your weekly schedule',
  ],
};

const FAILURE_COPY: Record<StartNextProgramError, { title: string; body: string }> = {
  already_started: {
    title: 'You\u2019re all set',
    body: 'Your next program is already set up and waiting on Home.',
  },
  not_finished: {
    title: 'This program is still going',
    body: 'Finish the sessions you have left, then the next program can start.',
  },
  not_entitled: {
    title: 'Subscription needed',
    body: 'Your subscription isn\u2019t active right now, so we can\u2019t build a new program yet.',
  },
  rate_limited: {
    title: 'One moment',
    body: 'That was a lot of tries in a row. Give it a minute, then try again.',
  },
  network: {
    title: 'Can\u2019t reach Remedy',
    body: 'Check your connection and try again.',
  },
  failed: {
    title: 'Something went wrong',
    body: 'We couldn\u2019t build your program. Try again in a moment.',
  },
};

function stepIndex(key: CheckinStepKey): number {
  return CHECKIN_STEP_KEYS.indexOf(key);
}

function stepComplete(key: CheckinStepKey, draft: CheckinDraft): boolean {
  switch (key) {
    case 'pain_change':
      return draft.pain_change !== null;
    case 'difficulty':
      return draft.difficulty !== null;
    case 'main_goal':
      return draft.main_goal.length > 0;
    case 'pain_location':
      return draft.pain_location !== null;
    case 'sessions_per_week':
      return draft.sessions_per_week !== null;
    case 'equipment':
      return draft.equipment !== null;
    case 'feedback':
      return true;
  }
}

function firstIncompleteStep(draft: CheckinDraft): number {
  const missing = CHECKIN_STEP_KEYS.findIndex((key) => !stepComplete(key, draft));
  return missing === -1 ? LAST_STEP : missing;
}

function parseDefaults(
  row: {
    main_goal: unknown;
    pain_location: unknown;
    sessions_per_week_preference: unknown;
    equipment: unknown;
  } | null,
  finishedSessionsPerWeek: number,
): CheckinDefaults {
  const goals = z.array(mainGoalSchema.element).safeParse(row?.main_goal);
  const location = painLocationSchema.safeParse(row?.pain_location);
  const days = sessionsPerWeekSchema.safeParse(row?.sessions_per_week_preference ?? finishedSessionsPerWeek);
  const equipment = equipmentSchema.safeParse(row?.equipment);
  return {
    main_goal: goals.success ? goals.data.slice(0, 4) : [],
    pain_location: location.success ? location.data : null,
    sessions_per_week: days.success ? days.data : null,
    equipment: equipment.success ? equipment.data : null,
  };
}

function asPlanShape(values: CheckinDefaults): PlanShape | null {
  if (
    values.main_goal.length === 0 ||
    values.pain_location === null ||
    values.sessions_per_week === null ||
    values.equipment === null
  ) {
    return null;
  }
  return {
    main_goal: values.main_goal,
    pain_location: values.pain_location,
    sessions_per_week: values.sessions_per_week,
    equipment: values.equipment,
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Building + reveal
// ---------------------------------------------------------------------------

function BuildingView({ steps, pet }: { steps: string[]; pet: PetState | null }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1.06,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    Animated.timing(fill, {
      toValue: 0.94,
      duration: MIN_BUILD_MS,
      easing: Easing.out(Easing.quad),
      // Width interpolation cannot use the native driver.
      useNativeDriver: false,
    }).start();
    const timers = steps.slice(1).map((_, i) =>
      setTimeout(() => {
        hapticSelection();
        setCurrent(i + 1);
      }, ((i + 1) * MIN_BUILD_MS) / steps.length),
    );
    return () => {
      loop.stop();
      timers.forEach(clearTimeout);
    };
  }, [fill, pulse, steps]);

  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={styles.centerBlock}>
      {pet ? (
        <View style={styles.phasePet}>
          <PetSays stage={pet.stage} mood="ready" line={PET_NEXT_PROGRAM_BUILDING} size={72} />
        </View>
      ) : null}
      <Animated.View style={[styles.buildIconWrap, { transform: [{ scale: pulse }] }]}>
        <View style={styles.buildHalo} />
        <View style={styles.buildIcon}>
          <Text style={styles.buildGlyph}>◎</Text>
        </View>
      </Animated.View>
      <Text style={styles.buildTitle}>Building your next program</Text>
      <View style={styles.buildTrack}>
        <Animated.View style={[styles.buildFill, { width }]} />
      </View>
      <View style={styles.buildSteps}>
        {steps.map((step, i) => (
          <View key={step} style={styles.buildStepRow}>
            <Text style={[styles.buildCheck, i < current && styles.buildCheckDone]}>
              {i < current ? '✓' : '·'}
            </Text>
            <Text
              style={[
                styles.buildStepText,
                i <= current && styles.buildStepTextActive,
                i === current && styles.buildStepTextCurrent,
              ]}
            >
              {step}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function RevealView({
  result,
  highlights,
  worsePain,
  onDone,
  bottomInset,
  pet,
}: {
  result: StartNextProgramResult;
  highlights: ProgramHighlight[];
  worsePain: boolean;
  onDone: () => void;
  bottomInset: number;
  pet: PetState | null;
}) {
  const pop = useRef(new Animated.Value(0)).current;
  const rows = useRef(highlights.map(() => new Animated.Value(0))).current;
  const cta = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    hapticCelebration();
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 70, useNativeDriver: true }).start();
    Animated.sequence([
      Animated.delay(260),
      Animated.stagger(
        90,
        [...rows, cta].map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 280,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ),
      ),
    ]).start();
  }, [cta, pop, rows]);

  const rise = (anim: Animated.Value) => ({
    opacity: anim,
    transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
  });

  return (
    <View style={[styles.revealRoot, { paddingBottom: Math.max(bottomInset, 16) + 8 }]}>
      <ScrollView contentContainerStyle={styles.revealScroll} showsVerticalScrollIndicator={false}>
        {pet ? (
          <View style={styles.phasePet}>
            <PetSays stage={pet.stage} mood="celebrating" line={PET_NEXT_PROGRAM_READY} size={72} />
          </View>
        ) : null}
        <Animated.View style={[styles.revealBadge, { transform: [{ scale: pop }] }]}>
          <Text style={styles.revealBadgeGlyph}>✓</Text>
        </Animated.View>
        <Text style={styles.revealEyebrow}>PROGRAM {result.program_number}</Text>
        <Text style={styles.revealTitle}>Your next program is ready</Text>
        <Text style={styles.revealName}>{result.program_name}</Text>
        <Text style={styles.revealMeta}>
          {result.duration_weeks} weeks · {result.sessions_per_week} days a week
        </Text>

        <View style={styles.revealCard}>
          <Text style={styles.revealCardLabel}>What&apos;s new</Text>
          {highlights.map((h, i) => (
            <Animated.View key={h.key} style={[styles.revealRow, rise(rows[i])]}>
              <View style={styles.revealGlyphWrap}>
                <Text style={styles.revealGlyph}>{h.glyph}</Text>
              </View>
              <Text style={styles.revealRowText}>{h.text}</Text>
            </Animated.View>
          ))}
        </View>

        {worsePain ? <Text style={styles.revealNote}>{WORSE_PAIN_NOTE}</Text> : null}
      </ScrollView>
      <Animated.View style={rise(cta)}>
        <ContinueButton label={'Let\u2019s go'} onPress={onDone} />
      </Animated.View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function NextProgramScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ choice?: string }>();
  const choice: NextProgramChoice = nextProgramChoiceSchema.catch('rebuild').parse(params.choice);

  const [phase, setPhase] = useState<Phase>('loading');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [planId, setPlanId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CheckinDraft | null>(null);
  const [current, setCurrent] = useState<CheckinDefaults | null>(null);
  const [result, setResult] = useState<StartNextProgramResult | null>(null);
  const [highlights, setHighlights] = useState<ProgramHighlight[]>([]);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [pet, setPet] = useState<PetState | null>(null);

  const draftRef = useRef<CheckinDraft | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const continueKey = useRef(newIdempotencyKey());
  const stepAnim = useRef(new Animated.Value(1)).current;
  const stepDirection = useRef(1);

  function cancelPendingSave() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
  }

  function flushSave() {
    cancelPendingSave();
    if (!done.current && draftRef.current) void saveCheckinDraft(draftRef.current);
  }

  function updateDraft(patch: Partial<CheckinDraft>, immediate = false) {
    if (!draft) return;
    const next = { ...draft, ...patch };
    setDraft(next);
    draftRef.current = next;
    if (immediate) {
      flushSave();
      return;
    }
    cancelPendingSave();
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      if (!done.current) void saveCheckinDraft(next);
    }, 300);
  }

  useEffect(() => {
    mounted.current = true;
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') flushSave();
    });
    return () => {
      mounted.current = false;
      sub.remove();
      flushSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setPhase('loading');
    setFailure(null);

    (async () => {
      const { data: up, error: upError } = await supabase
        .from('user_programs')
        .select('active_plan_id, current_week')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      const { data: plan, error: planError } = up?.active_plan_id
        ? await supabase
            .from('user_program_plans')
            .select('id, duration_weeks, sessions_per_week')
            .eq('id', up.active_plan_id)
            .eq('status', 'active')
            .maybeSingle()
        : { data: null, error: null };
      if (cancelled) return;
      if (upError || planError) {
        setFailure({ kind: 'load' });
        setPhase('error');
        return;
      }
      // Stale route: only a finished program has a "next".
      if (!up || !plan || up.current_week <= plan.duration_weeks) {
        router.dismissTo('/(tabs)');
        return;
      }
      setPlanId(plan.id);

      if (choice === 'continue') {
        void submit({ choice: 'continue', planId: plan.id });
        return;
      }

      const { data: saved, error: savedError } = await supabase
        .from('onboarding_answers')
        .select('main_goal, pain_location, sessions_per_week_preference, equipment')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (savedError) {
        setFailure({ kind: 'load' });
        setPhase('error');
        return;
      }
      const defaults = parseDefaults(saved, plan.sessions_per_week);
      const existing = await loadCheckinDraft(user.id, plan.id);
      if (cancelled) return;
      const next = existing ?? newCheckinDraft(user.id, plan.id, defaults);
      if (!existing) void saveCheckinDraft(next);
      draftRef.current = next;
      setCurrent(defaults);
      setDraft(next);
      setPhase('questions');
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loadAttempt]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      goBack();
      return true;
    });
    return () => sub.remove();
  });

  useEffect(() => {
    let cancelled = false;
    void fetchPetState().then((state) => {
      if (!cancelled && state) setPet(state);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  function animateStep(direction: 1 | -1) {
    stepDirection.current = direction;
    stepAnim.setValue(0);
    Animated.timing(stepAnim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }

  function leave() {
    flushSave();
    if (router.canGoBack()) router.back();
    else router.replace('/program-complete');
  }

  function finish() {
    router.dismissTo('/(tabs)');
  }

  function goBack() {
    if (phase === 'building' || phase === 'loading') return;
    if (phase === 'ready') {
      finish();
      return;
    }
    if (phase === 'error') {
      if (
        failure?.kind === 'submit' &&
        (failure.reason === 'already_started' || failure.reason === 'not_entitled')
      ) {
        finish();
        return;
      }
      if (failure?.kind === 'submit' && choice === 'rebuild' && draft) {
        setFailure(null);
        setPhase('questions');
        return;
      }
      leave();
      return;
    }
    if (draft && draft.step > 0) {
      Keyboard.dismiss();
      animateStep(-1);
      updateDraft({ step: draft.step - 1 }, true);
      return;
    }
    leave();
  }

  function goNext() {
    if (!draft) return;
    if (draft.step < LAST_STEP) {
      Keyboard.dismiss();
      animateStep(1);
      updateDraft({ step: draft.step + 1 }, true);
      return;
    }
    if (planId) void submit({ choice: 'rebuild', planId, draft });
  }

  async function submit(
    input: { choice: 'continue'; planId: string } | { choice: 'rebuild'; planId: string; draft: CheckinDraft },
  ) {
    if (submitting.current) return;
    const checkin = input.choice === 'rebuild' ? checkinFromDraft(input.draft) : null;
    if (input.choice === 'rebuild' && !checkin) {
      const step = firstIncompleteStep(input.draft);
      animateStep(-1);
      updateDraft({ step }, true);
      return;
    }
    submitting.current = true;
    Keyboard.dismiss();
    flushSave();
    setFailure(null);
    setPhase('building');
    const startedAt = Date.now();

    const request =
      input.choice === 'rebuild' && checkin
        ? startNextProgram({
            choice: 'rebuild',
            expectedPlanId: input.planId,
            idempotencyKey: input.draft.idempotency_key,
            checkin,
          })
        : startNextProgram({
            choice: 'continue',
            expectedPlanId: input.planId,
            idempotencyKey: continueKey.current,
          });
    const [outcome] = await Promise.all([request, wait(MIN_BUILD_MS)]);
    submitting.current = false;
    if (!mounted.current) return;

    if (!outcome.ok) {
      if (outcome.error === 'already_started') {
        done.current = true;
        cancelPendingSave();
        void clearCheckinDraft();
        invalidateTabRefresh('home');
        invalidateTabRefresh('progress');
      } else {
        hapticError();
      }
      nextProgramFailed({ choice: input.choice, reason: outcome.error });
      setFailure({ kind: 'submit', reason: outcome.error });
      setPhase('error');
      return;
    }

    done.current = true;
    cancelPendingSave();
    await clearCheckinDraft();
    invalidateTabRefresh('home');
    invalidateTabRefresh('progress');

    const data = outcome.data;
    const before = current ? asPlanShape(current) : null;
    const after = checkin
      ? {
          main_goal: checkin.main_goal,
          pain_location: checkin.pain_location,
          sessions_per_week: checkin.sessions_per_week,
          equipment: checkin.equipment,
        }
      : null;
    nextProgramStarted({
      choice: input.choice,
      from_level: data.from_level,
      to_level: data.progression_level,
      program_number: data.program_number,
      duration_weeks: data.duration_weeks,
      sessions_per_week: data.sessions_per_week,
      equipment_tier: data.equipment_tier,
      replayed: data.replayed,
      duration_ms: Math.max(0, Date.now() - startedAt),
      ...(checkin
        ? {
            pain_change: checkin.pain_change,
            difficulty: checkin.difficulty,
            primary_goal: checkin.main_goal[0],
            feedback_length: checkin.feedback?.length ?? 0,
          }
        : {}),
    });
    if (!mounted.current) return;
    setHighlights(
      nextProgramHighlights({
        fromLevel: data.from_level,
        toLevel: data.progression_level,
        before: after ? before : null,
        after,
      }),
    );
    setResult(data);
    setPhase('ready');
  }

  function retry() {
    if (failure?.kind === 'load' || !planId) {
      setLoadAttempt((n) => n + 1);
      return;
    }
    if (choice === 'continue') {
      void submit({ choice: 'continue', planId });
      return;
    }
    if (draft) void submit({ choice: 'rebuild', planId, draft });
  }

  // --- Render ------------------------------------------------------------------

  if (phase === 'loading') {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (phase === 'building') {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 40 }]}>
        <BuildingView steps={BUILD_STEPS[choice]} pet={pet} />
      </View>
    );
  }

  if (phase === 'ready' && result) {
    return (
      <View style={[styles.container, { paddingTop: insets.top + 32 }]}>
        <RevealView
          result={result}
          highlights={highlights}
          worsePain={draft?.pain_change === 'worse'}
          onDone={finish}
          bottomInset={insets.bottom}
          pet={pet}
        />
      </View>
    );
  }

  if (phase === 'error') {
    const reason = failure?.kind === 'submit' ? failure.reason : 'network';
    const copy =
      failure?.kind === 'load'
        ? { title: 'Couldn\u2019t load your check-in', body: 'Check your connection and try again.' }
        : FAILURE_COPY[reason];
    const settled = reason === 'already_started' || reason === 'not_entitled';
    const answersSaved = choice === 'rebuild' && failure?.kind === 'submit' && !settled;
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
        <View style={[styles.failureIcon, reason === 'already_started' && styles.failureIconOk]}>
          <Text style={styles.failureGlyph}>{reason === 'already_started' ? '✓' : '!'}</Text>
        </View>
        <Text style={styles.failureTitle}>{copy.title}</Text>
        <Text style={styles.failureBody}>
          {copy.body}
          {answersSaved ? ' Your answers are saved.' : ''}
        </Text>
        <View style={styles.failureActions}>
          {settled ? (
            <ContinueButton label="Go to Home" onPress={finish} />
          ) : (
            <>
              <ContinueButton label="Try again" onPress={retry} />
              <Pressable onPress={goBack} style={styles.textButton} accessibilityRole="button">
                <Text style={styles.textButtonText}>
                  {answersSaved ? 'Back to my answers' : 'Back'}
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </View>
    );
  }

  if (!draft) return <View style={styles.container} />;

  const key = CHECKIN_STEP_KEYS[draft.step];
  const copy = CHECKIN_COPY[key];
  const isLast = draft.step === LAST_STEP;
  const typingNote = isLast && keyboardOpen;
  const badge = (isCurrent: boolean) => (isCurrent ? 'Current' : undefined);
  const contentStyle = {
    opacity: stepAnim,
    transform: [
      {
        translateX: stepAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [stepDirection.current * 18, 0],
        }),
      },
    ],
  };

  function selectSingle<K extends 'pain_change' | 'difficulty' | 'pain_location' | 'sessions_per_week' | 'equipment'>(
    field: K,
    value: NonNullable<CheckinDraft[K]>,
  ) {
    if (!draft) return;
    updateDraft({ [field]: draft[field] === value ? null : value } as Partial<CheckinDraft>);
  }

  function toggleGoal(value: MainGoal) {
    if (!draft) return;
    const next = draft.main_goal.includes(value)
      ? draft.main_goal.filter((g) => g !== value)
      : [...draft.main_goal, value];
    updateDraft({ main_goal: next });
  }

  function renderOptions() {
    if (!draft) return null;
    switch (key) {
      case 'pain_change':
        return (
          <>
            {PAIN_CHANGE_OPTIONS.map((opt) => (
              <OptionCard
                key={opt.value}
                label={opt.label}
                selected={draft.pain_change === opt.value}
                onPress={() => selectSingle('pain_change', opt.value)}
              />
            ))}
            {draft.pain_change === 'worse' ? (
              <View style={styles.note}>
                <Text style={styles.noteText}>{WORSE_PAIN_NOTE}</Text>
              </View>
            ) : null}
          </>
        );
      case 'difficulty':
        return DIFFICULTY_OPTIONS.map((opt) => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            subtitle={opt.subtitle}
            selected={draft.difficulty === opt.value}
            onPress={() => selectSingle('difficulty', opt.value)}
          />
        ));
      case 'main_goal':
        return MAIN_GOAL_OPTIONS.map((opt) => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            illustration={GOAL_ILLUSTRATIONS[opt.value]}
            photoSize={72}
            badge={badge(current?.main_goal.includes(opt.value) ?? false)}
            selected={draft.main_goal.includes(opt.value)}
            onPress={() => toggleGoal(opt.value)}
          />
        ));
      case 'pain_location':
        return PAIN_LOCATION_OPTIONS.map((opt) => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            image={LOCATION_IMAGES[opt.value]}
            photoSize={80}
            badge={badge(current?.pain_location === opt.value)}
            selected={draft.pain_location === opt.value}
            onPress={() => selectSingle('pain_location', opt.value)}
          />
        ));
      case 'sessions_per_week':
        return SESSIONS_PER_WEEK_VALUES.map((n) => (
          <OptionCard
            key={n}
            label={`${n} days a week`}
            badge={badge(current?.sessions_per_week === n)}
            selected={draft.sessions_per_week === n}
            onPress={() => selectSingle('sessions_per_week', n)}
          />
        ));
      case 'equipment':
        return EQUIPMENT_OPTIONS.map((opt) => (
          <OptionCard
            key={opt.value}
            label={opt.label}
            subtitle={opt.subtitle}
            badge={badge(current?.equipment === opt.value)}
            selected={draft.equipment === opt.value}
            onPress={() => selectSingle('equipment', opt.value)}
          />
        ));
      case 'feedback': {
        const recap = [
          draft.sessions_per_week !== null ? `${draft.sessions_per_week} days a week` : null,
          EQUIPMENT_OPTIONS.find((o) => o.value === draft.equipment)?.label ?? null,
          MAIN_GOAL_OPTIONS.find((o) => o.value === draft.main_goal[0])?.label ?? null,
          PAIN_LOCATION_OPTIONS.find((o) => o.value === draft.pain_location)?.label ?? null,
        ].filter((x): x is string => x !== null);
        return (
          <>
            <View style={styles.recap}>
              <Text style={styles.recapLabel}>Your next program</Text>
              <View style={styles.recapChips}>
                {recap.map((item) => (
                  <View key={item} style={styles.recapChip}>
                    <Text style={styles.recapChipText}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
            <TextInput
              style={styles.textarea}
              value={draft.feedback}
              onChangeText={(value) => updateDraft({ feedback: value.slice(0, NEXT_PROGRAM_FEEDBACK_MAX) })}
              placeholder="What worked, what didn’t, anything you’d change…"
              placeholderTextColor={colors.textTertiary}
              multiline
              textAlignVertical="top"
              maxLength={NEXT_PROGRAM_FEEDBACK_MAX}
              autoCorrect
              returnKeyType="done"
              submitBehavior="blurAndSubmit"
              accessibilityLabel="Feedback about your program"
            />
            <Text style={styles.counter}>
              {draft.feedback.length} / {NEXT_PROGRAM_FEEDBACK_MAX}
            </Text>
          </>
        );
      }
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={draft.step === 0 ? 'Back to your summary' : 'Previous question'}
        >
          <Text style={styles.backText}>‹</Text>
        </Pressable>
        <View style={styles.progressWrap}>
          <ProgressBar current={draft.step + 1} total={CHECKIN_STEP_KEYS.length} />
        </View>
        <Text style={styles.stepCount}>
          {draft.step + 1}/{CHECKIN_STEP_KEYS.length}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={contentStyle}>
          <Text style={styles.heading}>{copy.title}</Text>
          {copy.subtitle ? <Text style={styles.subheading}>{copy.subtitle}</Text> : null}
          <View style={styles.options}>{renderOptions()}</View>
        </Animated.View>
      </ScrollView>

      {typingNote ? null : (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <ContinueButton
            label={isLast ? 'Build my program' : 'Continue'}
            onPress={goNext}
            disabled={!stepComplete(key, draft)}
          />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 12,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 30,
    lineHeight: 32,
    color: colors.primary,
    fontWeight: '500',
  },
  progressWrap: {
    flex: 1,
  },
  stepCount: {
    width: 32,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    fontVariant: ['tabular-nums'],
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
  },
  heading: {
    ...typography.question,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  subheading: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  options: {
    gap: 10,
    marginTop: 16,
  },
  note: {
    marginTop: 4,
    borderRadius: radius.chip,
    backgroundColor: colors.secondaryMuted,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  noteText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  recap: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 16,
    ...shadows.low,
  },
  recapLabel: {
    ...typography.label,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  recapChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recapChip: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  recapChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primaryDeep,
  },
  textarea: {
    minHeight: 132,
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
    marginTop: -4,
    fontVariant: ['tabular-nums'],
  },
  footer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    backgroundColor: colors.background,
  },
  phasePet: {
    alignSelf: 'stretch',
    marginBottom: 20,
  },
  centerBlock: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  buildIconWrap: {
    width: 104,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  buildHalo: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: radius.circle,
    backgroundColor: colors.primaryMuted,
  },
  buildIcon: {
    width: 80,
    height: 80,
    borderRadius: radius.circle,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.high,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.3,
  },
  buildGlyph: {
    fontSize: 36,
    color: '#FFFFFF',
  },
  buildTitle: {
    fontSize: 26,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 28,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  buildTrack: {
    width: '100%',
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 32,
  },
  buildFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 3,
  },
  buildSteps: {
    width: '100%',
    gap: 14,
  },
  buildStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  buildCheck: {
    width: 16,
    fontSize: 15,
    fontWeight: '700',
    color: colors.textTertiary,
    textAlign: 'center',
  },
  buildCheckDone: {
    color: colors.primary,
  },
  buildStepText: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.textTertiary,
  },
  buildStepTextActive: {
    color: colors.textSecondary,
  },
  buildStepTextCurrent: {
    color: colors.textPrimary,
    fontWeight: '600',
  },
  revealRoot: {
    flex: 1,
    paddingHorizontal: 24,
  },
  revealScroll: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
  },
  revealBadge: {
    width: 88,
    height: 88,
    borderRadius: radius.circle,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...shadows.high,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.3,
  },
  revealBadgeGlyph: {
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  revealEyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  revealTitle: {
    fontSize: 30,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
    textAlign: 'center',
    marginBottom: 12,
  },
  revealName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4,
  },
  revealMeta: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    fontVariant: ['tabular-nums'],
  },
  revealCard: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 14,
    ...shadows.medium,
  },
  revealCardLabel: {
    ...typography.label,
    color: colors.textSecondary,
  },
  revealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  revealGlyphWrap: {
    width: 28,
    height: 28,
    borderRadius: radius.circle,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealGlyph: {
    fontSize: 11,
    color: '#FFFFFF',
  },
  revealRowText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '500',
    color: colors.textPrimary,
  },
  revealNote: {
    marginTop: 16,
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  failureIcon: {
    width: 72,
    height: 72,
    borderRadius: radius.circle,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...shadows.high,
    shadowColor: colors.secondary,
    shadowOpacity: 0.3,
  },
  failureIconOk: {
    backgroundColor: colors.primary,
    shadowColor: colors.primaryDeep,
  },
  failureGlyph: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  failureTitle: {
    fontSize: 24,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  failureBody: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
  },
  failureActions: {
    width: '100%',
    alignItems: 'center',
  },
  textButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  textButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
