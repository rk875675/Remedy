import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Animated,
  Easing,
  ActivityIndicator,
  type StyleProp,
  type TextStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { colors, serifFont } from '../constants/colors';
import { radius } from '../constants/spacing';
import { shadows } from '../constants/shadows';
import { hapticPrimaryAction, hapticCelebration, hapticSelection } from '../lib/haptics';
import { useAfterTransition } from '../lib/useAfterTransition';
import { nextProgramChosen, programCompleted } from '../lib/analytics/events/program';
import {
  painDropWorthShowing,
  summarizeProgram,
  TOP_PROGRESSION_LEVEL,
  type ProgramSummary,
  type SummaryCheckin,
} from '../lib/programSummary';
import { loadCheckinDraft } from '../lib/nextProgram';
import type { NextProgramChoice } from '../lib/schemas';
import { fetchPetState } from '../lib/petApi';
import type { PetState } from '../lib/pet';
import { PetBadge } from '../components/pet/PetBadge';
import { PET_PROGRAM_COMPLETE_LINE, petLine } from '../constants/petLines';

type Loaded = {
  planId: string;
  programName: string;
  programNumber: number;
  atTopLevel: boolean;
  summary: ProgramSummary;
};

function CountUp({ value, run, style }: { value: number; run: boolean; style: StyleProp<TextStyle> }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (!run) return;
    const id = anim.addListener(({ value: v }) => setShown(Math.round(v)));
    Animated.timing(anim, {
      toValue: value,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      // The value is read in JS to render digits.
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(id);
  }, [anim, run, value]);

  return (
    <Text style={style} accessibilityLabel={String(value)}>
      {shown}
    </Text>
  );
}

function ChoiceCard({
  title,
  body,
  hint,
  primary,
  onPress,
}: {
  title: string;
  body: string;
  hint?: string;
  primary?: boolean;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number, speed: number, bounciness: number) =>
    Animated.spring(scale, { toValue: to, speed, bounciness, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        style={[styles.choice, primary ? styles.choicePrimary : styles.choiceSecondary]}
        onPress={onPress}
        onPressIn={() => press(0.97, 50, 0)}
        onPressOut={() => press(1, 30, 8)}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${body}`}
      >
        <View style={styles.choiceText}>
          <Text style={[styles.choiceTitle, primary && styles.choiceTitlePrimary]}>{title}</Text>
          <Text style={[styles.choiceBody, primary && styles.choiceBodyPrimary]}>{body}</Text>
          {hint ? (
            <View style={styles.choiceHint}>
              <Text style={styles.choiceHintText}>{hint}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.choiceArrow, primary && styles.choiceArrowPrimary]}>→</Text>
      </Pressable>
    </Animated.View>
  );
}

export default function ProgramCompleteScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [phase, setPhase] = useState<'loading' | 'ready' | 'error'>('loading');
  const [data, setData] = useState<Loaded | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [pet, setPet] = useState<PetState | null>(null);
  const tracked = useRef(false);
  const leaving = useRef(false);

  const iconScale = useRef(new Animated.Value(0)).current;
  const revealAnims = useRef([0, 1, 2, 3].map(() => new Animated.Value(0))).current;
  const ready = useAfterTransition();

  useEffect(() => {
    if (!ready) return;
    // Three-beat celebration: light → medium → success.
    hapticCelebration();
    Animated.spring(iconScale, {
      toValue: 1,
      friction: 4,
      tension: 60,
      useNativeDriver: true,
    }).start();
  }, [iconScale, ready]);

  useEffect(() => {
    if (phase !== 'ready' || !ready) return;
    Animated.sequence([
      Animated.delay(200),
      Animated.stagger(
        90,
        revealAnims.map((anim) =>
          Animated.timing(anim, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
        ),
      ),
    ]).start();
  }, [phase, ready, revealAnims]);

  // Best-effort and independent of `phase`: without a pet the glyph stays.
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
    if (!user) return;
    let cancelled = false;
    setPhase('loading');

    (async () => {
      const { data: up, error: upError } = await supabase
        .from('user_programs')
        .select('active_plan_id, current_week, progression_level, programs_completed, program_started_at')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      if (upError) {
        setPhase('error');
        return;
      }
      const { data: plan, error: planError } = up?.active_plan_id
        ? await supabase
            .from('user_program_plans')
            .select('id, program_name, duration_weeks')
            .eq('id', up.active_plan_id)
            .eq('status', 'active')
            .maybeSingle()
        : { data: null, error: null };
      if (cancelled) return;
      if (planError) {
        setPhase('error');
        return;
      }
      // Stale route (the next program already started, or this one is not finished).
      if (!up || !plan || up.current_week <= plan.duration_weeks) {
        router.dismissTo('/(tabs)');
        return;
      }

      let completionsQuery = supabase
        .from('session_completions')
        .select('id, completed_at, duration_seconds')
        .eq('user_id', user.id);
      if (up.program_started_at) {
        completionsQuery = completionsQuery.gte('completed_at', up.program_started_at);
      }
      const { data: completions, error: completionsError } = await completionsQuery;
      if (cancelled) return;
      if (completionsError) {
        setPhase('error');
        return;
      }

      let checkins: SummaryCheckin[] = [];
      const ids = (completions ?? []).map((c) => c.id);
      if (ids.length > 0) {
        const { data: rows } = await supabase
          .from('pain_checkins')
          .select('score, recorded_at, session_completion_id')
          .eq('user_id', user.id)
          .eq('type', 'before')
          .in('session_completion_id', ids);
        if (cancelled) return;
        checkins = rows ?? [];
      }

      const summary = summarizeProgram(completions ?? [], checkins);
      const programNumber = up.programs_completed + 1;
      setData({
        planId: plan.id,
        programName: plan.program_name,
        programNumber,
        atTopLevel: up.progression_level >= TOP_PROGRESSION_LEVEL,
        summary,
      });
      setPhase('ready');
      if (!tracked.current) {
        tracked.current = true;
        // Finishing the program — the single strongest retention outcome the app has.
        programCompleted({
          sessions_completed_count: summary.sessions,
          days_active_count: summary.daysActive,
          program_number: programNumber,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, retryCount]);

  // Re-read on every focus: backing out of the check-in mid-way leaves a draft.
  useFocusEffect(
    useCallback(() => {
      leaving.current = false;
      if (!user || !data) return;
      let live = true;
      void loadCheckinDraft(user.id, data.planId).then((draft) => {
        if (live) setHasDraft(!!draft && (draft.step > 0 || draft.pain_change !== null));
      });
      return () => {
        live = false;
      };
    }, [user, data]),
  );

  function choose(choice: NextProgramChoice) {
    if (leaving.current || !data) return;
    leaving.current = true;
    hapticPrimaryAction();
    nextProgramChosen({ choice, has_draft: choice === 'rebuild' && hasDraft });
    router.push(`/next-program?choice=${choice}`);
  }

  function handleNotNow() {
    if (leaving.current) return;
    leaving.current = true;
    hapticSelection();
    router.dismissTo('/(tabs)');
  }

  function revealStyle(index: number) {
    return {
      opacity: revealAnims[index],
      transform: [
        {
          translateY: revealAnims[index].interpolate({
            inputRange: [0, 1],
            outputRange: [12, 0],
          }),
        },
      ],
    };
  }

  const summary = data?.summary;
  const showPainDrop = summary ? painDropWorthShowing(summary) : false;

  return (
    <ScrollView
      style={[styles.container, { paddingTop: insets.top + 32 }]}
      contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom + 32, 48) }]}
      showsVerticalScrollIndicator={false}
    >
      <Animated.View
        style={[styles.iconWrap, pet && styles.petIconWrap, { transform: [{ scale: iconScale }] }]}
      >
        {pet ? (
          <PetBadge stage={pet.stage} mood="proud" size={150} />
        ) : (
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>❋</Text>
          </View>
        )}
      </Animated.View>

      {data && data.programNumber > 1 ? (
        <Text style={styles.eyebrow}>PROGRAM {data.programNumber}</Text>
      ) : null}
      <Text style={styles.heading}>Program Complete</Text>
      <Text style={[styles.subheading, pet && styles.subheadingWithPet]}>
        {data ? `You finished your ${data.programName}.` : 'You finished your program.'}
      </Text>
      {pet ? (
        <Text style={styles.subheading}>{petLine(PET_PROGRAM_COMPLETE_LINE, pet.name)}</Text>
      ) : null}

      {phase === 'loading' ? (
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      ) : phase === 'error' ? (
        <View style={styles.errorWrap}>
          <Text style={styles.errorText}>Could not load your summary.</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              hapticPrimaryAction();
              setRetryCount((n) => n + 1);
            }}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : summary && data ? (
        <>
          <Animated.View style={[styles.statsCard, revealStyle(0)]}>
            <View style={styles.statBox}>
              <CountUp value={summary.sessions} run={ready} style={styles.statValue} />
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <CountUp value={summary.daysActive} run={ready} style={styles.statValue} />
              <Text style={styles.statLabel}>Days{'\n'}Active</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <CountUp value={summary.minutes} run={ready} style={styles.statValue} />
              <Text style={styles.statLabel}>Minutes</Text>
            </View>
          </Animated.View>

          <Animated.View style={[styles.messageWrap, revealStyle(1)]}>
            {showPainDrop ? (
              <View style={styles.painPill}>
                <Text style={styles.painPillText}>
                  Pain before sessions: {summary.painStart} → {summary.painEnd}
                </Text>
              </View>
            ) : null}
            <Text style={styles.congrats}>
              That&apos;s real work. Consistent movement is what changes things. You showed up.
            </Text>
          </Animated.View>

          <Animated.View style={[styles.choices, revealStyle(2)]}>
            <Text style={styles.sectionLabel}>What&apos;s next</Text>
            <ChoiceCard
              primary
              title="Build my next program"
              body="6 quick questions about how this one went. Your next program is built from your answers."
              hint={hasDraft ? 'Pick up where you left off' : undefined}
              onPress={() => choose('rebuild')}
            />
            <ChoiceCard
              title="Level up my current plan"
              body={
                data.atTopLevel
                  ? 'Same setup at our top progression level. Starts right away.'
                  : 'Same setup, harder progressions. Starts right away.'
              }
              onPress={() => choose('continue')}
            />
          </Animated.View>

          <Animated.View style={revealStyle(3)}>
            <Pressable
              onPress={handleNotNow}
              style={styles.notNow}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Not now, go to Home"
            >
              <Text style={styles.notNowText}>Not now</Text>
            </Pressable>
          </Animated.View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  content: {
    alignItems: 'center',
  },
  iconWrap: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  petIconWrap: {
    width: 150,
    height: 150,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: radius.circle,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.high,
    shadowColor: colors.secondary,
    shadowOpacity: 0.35,
  },
  iconText: {
    fontSize: 42,
    color: '#FFFFFF',
    lineHeight: 50,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.secondary,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  heading: {
    fontSize: 32,
    fontFamily: serifFont,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  subheading: {
    fontSize: 17,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 26,
    marginBottom: 28,
    paddingHorizontal: 8,
  },
  subheadingWithPet: {
    marginBottom: 6,
  },
  loader: {
    marginTop: 24,
  },
  errorWrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  errorText: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  retryButton: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  retryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: 24,
    paddingHorizontal: 8,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
    marginBottom: 20,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 6,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    textAlign: 'center',
    lineHeight: 18,
    minHeight: 36,
  },
  statDivider: {
    width: 1,
    height: 48,
    backgroundColor: colors.borderLight,
  },
  messageWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 28,
  },
  painPill: {
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.chip,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 12,
  },
  painPillText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primaryDeep,
    fontVariant: ['tabular-nums'],
  },
  congrats: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    fontStyle: 'italic',
    paddingHorizontal: 8,
  },
  choices: {
    width: '100%',
    gap: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.card,
    paddingVertical: 20,
    paddingLeft: 20,
    paddingRight: 18,
    gap: 12,
  },
  choicePrimary: {
    backgroundColor: colors.primary,
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.28,
  },
  choiceSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  choiceText: {
    flex: 1,
  },
  choiceTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
    letterSpacing: -0.1,
  },
  choiceTitlePrimary: {
    color: '#FFFFFF',
  },
  choiceBody: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  choiceBodyPrimary: {
    color: 'rgba(255,255,255,0.86)',
  },
  choiceHint: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  choiceHintText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  choiceArrow: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.primary,
  },
  choiceArrowPrimary: {
    color: '#FFFFFF',
  },
  notNow: {
    marginTop: 18,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  notNowText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.textSecondary,
  },
});
