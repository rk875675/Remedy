import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
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
import { TabFadeWrapper } from '../../components/ui/TabFadeWrapper';
import type { ProgramSession, UserProgram } from '../../types/database';

type SessionWithExerciseCount = ProgramSession & { exercise_count: number };

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
        duration: 400,
        useNativeDriver: true,
      }).start(() => {
        setInsightIndex((i) => (i + 1) % INSIGHTS.length);
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 400,
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
        const { data: devProg } = await supabase
          .from('programs')
          .select('sessions_per_week, duration_weeks')
          .eq('id', up.program_id)
          .single();

        if (devProg) {
          const startMs = new Date(up.started_at).getTime();
          const rawDays = Math.floor((Date.now() - startMs) / 86400000) + offset;
          const daysSinceStart = Math.max(0, rawDays);
          displayWeek = Math.min(
            Math.floor(daysSinceStart / 7) + 1,
            devProg.duration_weeks,
          );
          const dayInWeek = daysSinceStart % 7;
          displaySession = dayInWeek < devProg.sessions_per_week
            ? dayInWeek + 1
            : devProg.sessions_per_week + 1;
        }
      }
    }

    // -----------------------------------------------------------------------
    // Parallel fetch: today's session + program meta + this week completions
    // + pain (last 7 days).
    // -----------------------------------------------------------------------
    const weekMondayISO = thisWeekMondayISO();
    const sevenDaysAgoISO = nDaysAgoISO(7);

    const [sessionRes, progRes, weekCompRes, painRes, totalCompRes] = await Promise.all([
      supabase
        .from('program_sessions')
        .select('*')
        .eq('program_id', up.program_id)
        .eq('week_number', displayWeek)
        .eq('session_number', displaySession)
        .single(),
      supabase
        .from('programs')
        .select('sessions_per_week, duration_weeks')
        .eq('id', up.program_id)
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

    if (progRes.data) {
      setSessionsPerWeek(progRes.data.sessions_per_week);
      setDurationWeeks(progRes.data.duration_weeks);
    }

    setSessionsThisWeek(weekCompRes.count ?? 0);
    setTotalSessions(totalCompRes.count ?? 0);

    const sessionData = sessionRes.data;
    if (sessionData) {
      const { count } = await supabase
        .from('session_exercises')
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionData.id);

      setTodaySession({ ...sessionData, exercise_count: count ?? 0 });
    } else {
      const { data: nextSess } = await supabase
        .from('program_sessions')
        .select('id')
        .eq('program_id', up.program_id)
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
          <View style={styles.skeletonHeader} />
          <View style={styles.skeletonCard} />
          <View style={styles.skeletonCard} />
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
            You completed the full Back Pain Relief Program. View your summary or restart for another round.
          </Text>
          <TouchableOpacity
            style={styles.startButton}
            onPress={() => router.push('/program-complete')}
            activeOpacity={0.8}
          >
            <Text style={styles.startButtonText}>View Summary</Text>
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

          <Text style={styles.sessionMeta}>
            {todaySession.duration_minutes} min · {todaySession.exercise_count} exercises
          </Text>

          <TouchableOpacity
            style={styles.startButton}
            onPress={() => router.push(`/session/${todaySession.id}`)}
            activeOpacity={0.8}
          >
            <Text style={styles.startButtonText}>Start Session</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.sessionCard}>
          <Text style={styles.sessionLabel}>Rest Day</Text>
          <Text style={styles.sessionTitle}>Recovery Day</Text>
          <Text style={styles.restTip}>
            Recovery is part of the program. Try a short walk or gentle stretching today.
          </Text>
          {nextSessionId && (
            <TouchableOpacity
              onPress={() => router.push(`/session/${nextSessionId}`)}
              activeOpacity={0.7}
              style={styles.nextSessionButton}
            >
              <Text style={styles.nextSessionLink}>View next session →</Text>
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
            <View
              key={i}
              style={[
                styles.insightDot,
                i === insightIndex && styles.insightDotActive,
              ]}
            />
          ))}
        </View>
      </Animated.View>

      {/* Stacked stat cards */}
      {userProgram && (
        <>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Program Progress</Text>
            <Text style={styles.statValue}>
              Week {userProgram.current_week}
              <Text style={styles.statValueDim}> of {durationWeeks}</Text>
            </Text>
            <Text style={styles.statHint}>
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
  },

  // Session / rest day card — same container, more vertical room
  sessionCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 36,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 4,
    marginBottom: 16,
  },
  sessionCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sessionWeekBadge: {
    backgroundColor: colors.primary + '18',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  sessionWeekBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  sessionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 24,
    lineHeight: 30,
  },
  sessionMeta: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.textSecondary,
    marginBottom: 20,
  },
  startButton: {
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  startButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  restTip: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
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

  // Rotating insight card
  insightCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  insightTag: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.secondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  insightText: {
    fontSize: 15,
    color: colors.textPrimary,
    lineHeight: 22,
    marginBottom: 14,
  },
  insightDots: {
    flexDirection: 'row',
    gap: 5,
  },
  insightDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E0D8D4',
  },
  insightDotActive: {
    backgroundColor: colors.secondary,
    width: 14,
  },

  // Stacked full-width stat cards
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  statValueDim: {
    fontSize: 20,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  statHint: {
    fontSize: 14,
    color: colors.secondary,
  },
  statReduction: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.secondary,
    marginBottom: 4,
  },

  // Skeletons
  skeletonHeader: {
    height: 32,
    width: 200,
    backgroundColor: '#E8E0DC',
    borderRadius: 8,
    marginBottom: 24,
  },
  skeletonCard: {
    height: 180,
    backgroundColor: '#E8E0DC',
    borderRadius: 16,
    marginBottom: 16,
  },
});
