import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticPrimaryAction } from '../../lib/haptics';
import { TabFadeWrapper } from '../../components/ui/TabFadeWrapper';
import { Skeleton } from '../../components/ui/Skeleton';
import { MiniRing } from '../../components/ui/MiniRing';
import type { UserPlanSession, UserProgram } from '../../types/database';

type SessionWithExerciseCount = UserPlanSession & { exercise_count: number };

function InsightDot({ active }: { active: boolean }) {
  const anim = useRef(new Animated.Value(active ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: active ? 1 : 0,
      duration: 250,
      easing: Easing.inOut(Easing.cubic),
      // Width + color interpolation cannot use the native driver.
      useNativeDriver: false,
    }).start();
  }, [active]);

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: [5, 16] });
  const backgroundColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.border, colors.secondary],
  });

  return <Animated.View style={[styles.insightDot, { width, backgroundColor }]} />;
}

const INSIGHTS: readonly string[] = [
  'Studies show that consistent structured exercise reduces back pain by up to 60% within 4 weeks.',
  '80% of adults experience back pain at some point — most recover fully with the right movement plan.',
  'Recovery isn\'t linear. Every session you show up for is building a stronger, more resilient spine.',
  'Movement is medicine. Your spine craves gentle, consistent motion to reduce stiffness and inflammation.',
  'People who follow structured rehab programs report 30% better quality of life within 6 weeks.',
  'Rest alone rarely fixes back pain. Targeted exercise retrains the muscles that protect your spine.',
  'Most chronic back pain improves significantly within 4–6 weeks of consistent, focused movement.',
];

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [userProgram, setUserProgram] = useState<UserProgram | null>(null);
  const [todaySession, setTodaySession] = useState<SessionWithExerciseCount | null>(null);
  const [nextSessionId, setNextSessionId] = useState<string | null>(null);
  const [isRestDay, setIsRestDay] = useState(false);
  const [sessionsThisWeek, setSessionsThisWeek] = useState(0);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(4);
  const [durationWeeks, setDurationWeeks] = useState(5);
  const [painAvg, setPainAvg] = useState<number | null>(null);
  const [painReduction, setPainReduction] = useState<number | null>(null);
  const [totalSessions, setTotalSessions] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Rotating insight card
  const [insightIndex, setInsightIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        setInsightIndex((i) => (i + 1) % INSIGHTS.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }).start();
      });
    }, 8000);

    return () => clearInterval(interval);
  }, [fadeAnim]);

  const fetchData = useCallback(async () => {
    if (!user) return;

    const resetPending = await AsyncStorage.getItem('remedy_reset_pending');
    if (resetPending) {
      await AsyncStorage.removeItem('remedy_reset_pending');
      setUserProgram(null);
      setTodaySession(null);
      setNextSessionId(null);
      setSessionsThisWeek(0);
      setPainAvg(null);
      setLoaded(false);
    }

    const [upRes, profileRes] = await Promise.all([
      supabase
        .from('user_programs')
        .select('*')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('profiles')
        .select('is_dev')
        .eq('id', user.id)
        .single(),
    ]);

    const up = upRes.data;
    if (!up) {
      setLoaded(true);
      return;
    }
    setUserProgram(up);

    // The app reads ONLY the resolved plan snapshot for playback. Without an active
    // plan (e.g. before paywall assignment) there is nothing to show yet.
    const planId = up.active_plan_id;
    if (!planId) {
      setLoaded(true);
      return;
    }

    // Plan meta (duration / cadence) comes from the snapshot header, not the legacy
    // programs table.
    const { data: planMeta } = await supabase
      .from('user_program_plans')
      .select('duration_weeks, sessions_per_week')
      .eq('id', planId)
      .single();

    const planSessionsPerWeek = planMeta?.sessions_per_week ?? 4;
    const planDurationWeeks = planMeta?.duration_weeks ?? 5;

    // -----------------------------------------------------------------------
    // Determine which week/session to display.
    // Non-dev: always use DB values. Dev with offset: derive from simulated date.
    // -----------------------------------------------------------------------
    let displayWeek = up.current_week;
    let displaySession = up.current_session;

    const isDev = profileRes.data?.is_dev === true;
    if (isDev && up.started_at) {
      const offsetStr = await AsyncStorage.getItem('dev_day_offset');
      const offset = offsetStr ? parseInt(offsetStr, 10) : 0;

      if (offset !== 0) {
        const startMs = new Date(up.started_at).getTime();
        const rawDays = Math.floor((Date.now() - startMs) / 86400000) + offset;
        const daysSinceStart = Math.max(0, rawDays);
        displayWeek = Math.min(Math.floor(daysSinceStart / 7) + 1, planDurationWeeks);
        const dayInWeek = daysSinceStart % 7;
        displaySession = dayInWeek < planSessionsPerWeek
          ? dayInWeek + 1
          : planSessionsPerWeek + 1;
      }
    }

    // -----------------------------------------------------------------------
    // Parallel fetch: today's resolved session + this week completions
    // + pain (last 7 days).
    // -----------------------------------------------------------------------
    const weekMondayISO = thisWeekMondayISO();
    const sevenDaysAgoISO = nDaysAgoISO(7);

    const [sessionRes, weekCompRes, painRes, totalCompRes] = await Promise.all([
      supabase
        .from('user_plan_sessions')
        .select('*')
        .eq('plan_id', planId)
        .eq('week_number', displayWeek)
        .eq('session_number', displaySession)
        .single(),
      supabase
        .from('session_completions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('completed_at', weekMondayISO),
      supabase
        .from('pain_checkins')
        .select('score, type')
        .eq('user_id', user.id)
        .gte('recorded_at', sevenDaysAgoISO)
        .order('recorded_at', { ascending: false }),
      supabase
        .from('session_completions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
    ]);

    setSessionsPerWeek(planSessionsPerWeek);
    setDurationWeeks(planDurationWeeks);

    setSessionsThisWeek(weekCompRes.count ?? 0);
    setTotalSessions(totalCompRes.count ?? 0);

    const sessionData = sessionRes.data;
    if (sessionData) {
      const { count } = await supabase
        .from('user_plan_session_exercises')
        .select('*', { count: 'exact', head: true })
        .eq('plan_session_id', sessionData.id);

      setTodaySession({ ...sessionData, exercise_count: count ?? 0 });
      setNextSessionId(null);
      setIsRestDay(false);
    } else {
      // A missing session is a genuine rest day only when we've run past the week's
      // scheduled sessions. Any other miss means the session just isn't loaded — don't
      // mislabel it as "Recovery Day".
      setTodaySession(null);
      setIsRestDay(displaySession > planSessionsPerWeek);
      const { data: nextSess } = await supabase
        .from('user_plan_sessions')
        .select('id')
        .eq('plan_id', planId)
        .gt('week_number', displayWeek)
        .order('week_number', { ascending: true })
        .order('session_number', { ascending: true })
        .limit(1);

      if (nextSess && nextSess.length > 0) {
        setNextSessionId(nextSess[0].id);
      }
    }

    const painData = painRes.data ?? [];
    const beforeScores = painData.filter((p) => p.type === 'before').map((p) => p.score);
    const afterScores = painData.filter((p) => p.type === 'after').map((p) => p.score);

    if (beforeScores.length > 0) {
      setPainAvg(Math.round((beforeScores.reduce((s, v) => s + v, 0) / beforeScores.length) * 10) / 10);
    } else {
      setPainAvg(null);
    }

    if (beforeScores.length > 0 && afterScores.length > 0) {
      const ab = beforeScores.reduce((s, v) => s + v, 0) / beforeScores.length;
      const aa = afterScores.reduce((s, v) => s + v, 0) / afterScores.length;
      const red = ab - aa;
      setPainReduction(red > 0 ? Math.round(red * 10) / 10 : null);
    } else {
      setPainReduction(null);
    }

    setLoaded(true);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  const greeting = getGreeting();
  const firstName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.user_metadata?.name?.split(' ')[0]
    ?? null;

  if (!loaded) {
    return (
      <TabFadeWrapper>
        <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
          <Skeleton height={32} width={200} borderRadius={8} style={styles.skeletonHeader} />
          <Skeleton height={180} borderRadius={radius.card} style={styles.skeletonCard} />
          <Skeleton height={180} borderRadius={radius.card} style={styles.skeletonCard} />
        </View>
      </TabFadeWrapper>
    );
  }

  return (
    <TabFadeWrapper>
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + 16 }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      <Text style={styles.greeting}>
        {greeting}{firstName ? `, ${firstName}` : ''}
      </Text>

      {/* Today's session, rest day, or program completion */}
      {userProgram && userProgram.current_week > durationWeeks ? (
        <View style={styles.sessionCard}>
          <Text style={styles.sessionLabel}>Program Complete</Text>
          <Text style={styles.sessionTitle}>You finished your program!</Text>
          <Text style={styles.restTip}>
            You completed your full program. View your summary or restart for another round.
          </Text>
          <TouchableOpacity
            style={styles.startButton}
            onPress={() => {
              hapticPrimaryAction();
              router.push('/program-complete');
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.startButtonText}>View Summary</Text>
          </TouchableOpacity>
        </View>
      ) : userProgram && !userProgram.active_plan_id ? (
        <View style={styles.sessionCard}>
          <Text style={styles.sessionLabel}>Almost there</Text>
          <Text style={styles.sessionTitle}>Your program needs to be built</Text>
          <Text style={styles.restTip}>
            Tap below to generate your personalized sessions from your quiz answers.
          </Text>
          <TouchableOpacity
            style={styles.startButton}
            onPress={() => {
              hapticPrimaryAction();
              router.replace('/building-plan');
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.startButtonText}>Build My Program</Text>
          </TouchableOpacity>
        </View>
      ) : todaySession ? (
        <View style={styles.sessionCard}>
          <View style={styles.sessionCardHeader}>
            <Text style={styles.sessionLabel}>Today's Session</Text>
            <View style={styles.sessionWeekBadge}>
              <Text style={styles.sessionWeekBadgeText}>
                W{todaySession.week_number} · S{todaySession.session_number}
              </Text>
            </View>
          </View>

          <Text style={styles.sessionTitle}>{todaySession.title}</Text>

          <View style={styles.sessionWeekProgressBlock}>
            <View style={styles.sessionWeekDotsRow}>
              {Array.from({ length: sessionsPerWeek }, (_, i) => (
                <View
                  key={i}
                  style={[
                    styles.sessionWeekDot,
                    i < sessionsThisWeek && styles.sessionWeekDotFilled,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.sessionWeekDotsLabel}>
              {sessionsThisWeek} of {sessionsPerWeek} sessions this week
            </Text>
          </View>

          <Text style={styles.sessionMetaLine}>
            {todaySession.estimated_minutes} min · {todaySession.exercise_count} exercise{todaySession.exercise_count !== 1 ? 's' : ''}
          </Text>

          <TouchableOpacity
            style={styles.startButton}
            onPress={() => {
              hapticPrimaryAction();
              router.push(`/session/${todaySession.id}`);
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.startButtonText}>Start Session</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.sessionCard}>
          <Text style={styles.sessionLabel}>{isRestDay ? 'Rest Day' : 'Up Next'}</Text>
          <Text style={styles.sessionTitle}>{isRestDay ? 'Recovery Day' : 'Your next session'}</Text>
          <Text style={styles.restTip}>
            {isRestDay
              ? 'Recovery is part of the program. Try a short walk or gentle stretching today.'
              : 'Your next session is ready whenever you are.'}
          </Text>
          {nextSessionId && (
            <TouchableOpacity
              onPress={() => router.push(`/session/${nextSessionId}`)}
              activeOpacity={0.7}
              style={styles.nextSessionButton}
            >
              <Text style={styles.nextSessionLink}>
                {isRestDay ? 'View next session →' : 'Start session →'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Rotating insight card */}
      <Animated.View style={[styles.insightCard, { opacity: fadeAnim }]}>
        <Text style={styles.insightTag}>Did you know</Text>
        <Text style={styles.insightText}>{INSIGHTS[insightIndex]}</Text>
        <View style={styles.insightDots}>
          {INSIGHTS.map((_, i) => (
            <InsightDot key={i} active={i === insightIndex} />
          ))}
        </View>
      </Animated.View>

      {/* Stacked stat cards */}
      {userProgram && (
        <>
          <View style={[styles.statCard, styles.programProgressCard]}>
            <Text style={[styles.statLabel, styles.programProgressLabel]}>Program Progress</Text>
            <View style={styles.programProgressWeekRow}>
              <Text style={[styles.statValue, styles.programProgressWeek]}>
                Week {userProgram.current_week}
                <Text style={styles.statValueDim}> of {durationWeeks}</Text>
              </Text>
              <MiniRing value={userProgram.current_week} total={durationWeeks} size={80} />
            </View>
            <Text style={[styles.statHint, styles.programProgressHint]}>
              {durationWeeks - userProgram.current_week > 0
                ? `${durationWeeks - userProgram.current_week} week${durationWeeks - userProgram.current_week !== 1 ? 's' : ''} to go`
                : 'Program complete!'}
            </Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Avg Pain (Last 7 Days)</Text>
            {painAvg !== null ? (
              <>
                <Text style={styles.statValue}>
                  {painAvg}
                  <Text style={styles.statValueDim}>/10</Text>
                </Text>
                {painReduction !== null && (
                  <Text style={styles.statReduction}>↓ {painReduction} pts avg per session</Text>
                )}
                <Text style={styles.statHint}>
                  {painAvg <= 3
                    ? 'Pain is low — keep it up'
                    : painAvg <= 6
                    ? 'Consistent movement will help'
                    : 'Keep showing up — it gets better'}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.statValue}>—</Text>
                <Text style={styles.statHint}>No data yet</Text>
              </>
            )}
          </View>
        </>
      )}
    </ScrollView>
    </TabFadeWrapper>
  );
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function thisWeekMondayISO(): string {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

function nDaysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingBottom: 48,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 24,
    letterSpacing: -0.3,
  },

  // Session / rest day card — the hero; highest elevation on screen
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
    ...shadows.high,
    marginBottom: 16,
  },
  sessionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sessionWeekBadge: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.chip,
  },
  sessionWeekBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDeep,
    letterSpacing: 0.4,
  },
  sessionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
    lineHeight: 30,
  },
  sessionWeekProgressBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sessionWeekDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sessionWeekDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.border,
  },
  sessionWeekDotFilled: {
    backgroundColor: colors.primary,
  },
  sessionWeekDotsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  sessionMetaLine: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    lineHeight: 21,
    marginBottom: 20,
  },
  startButton: {
    height: 56,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  startButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  restTip: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 23,
    marginBottom: 20,
  },
  nextSessionButton: {
    alignSelf: 'flex-start',
  },
  nextSessionLink: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
  },

  // Rotating insight card — supporting tier, low elevation
  insightCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 20,
    marginBottom: 16,
    ...shadows.low,
  },
  insightTag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 10,
  },
  insightText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 23,
    marginBottom: 14,
  },
  insightDots: {
    flexDirection: 'row',
    gap: 5,
  },
  insightDot: {
    height: 5,
    borderRadius: radius.circle,
  },

  // Stacked full-width stat cards — supporting tier, low elevation
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 20,
    marginBottom: 12,
    ...shadows.low,
  },
  programProgressCard: {
    paddingBottom: 32,
  },
  programProgressWeekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    marginTop: -2,
  },
  programProgressLabel: {
    marginBottom: 0,
  },
  programProgressWeek: {
    flex: 1,
    marginBottom: 0,
  },
  programProgressHint: {
    marginTop: -22,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  statValueDim: {
    fontSize: 20,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  statHint: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.primary,
  },
  statReduction: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 4,
  },

  // Skeletons
  skeletonHeader: {
    marginBottom: 24,
  },
  skeletonCard: {
    marginBottom: 16,
  },
});
