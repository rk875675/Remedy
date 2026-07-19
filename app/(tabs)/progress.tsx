import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticSelection } from '../../lib/haptics';
import { TabFadeWrapper } from '../../components/ui/TabFadeWrapper';
import { Skeleton } from '../../components/ui/Skeleton';
import type { UserProgram } from '../../types/database';
import {
  computePainChart,
  computeActivityChart,
  computeWeekDays,
  getWeekLabel,
  getEstimatedCompletion,
  type RawCheckin,
  type RawCompletion,
  type PainRange,
  type ActivityRange,
} from '../../lib/progress';

const SCREEN_WIDTH = Dimensions.get('window').width;
// card uses padding:20, container uses paddingHorizontal:24 → 88px total eaten horizontally
const CARD_INNER_W = SCREEN_WIDTH - 88;
const PAIN_Y_AXIS_W = 36;
const PAIN_CHART_DATA_W = CARD_INNER_W - PAIN_Y_AXIS_W;

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [totalSessions, setTotalSessions] = useState(0);
  const [userProgram, setUserProgram] = useState<UserProgram | null>(null);
  const [durationWeeks, setDurationWeeks] = useState(5);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(4);
  const [loaded, setLoaded] = useState(false);

  // Raw data for range filtering
  const [allPainCheckins, setAllPainCheckins] = useState<RawCheckin[]>([]);
  const [allActivityCompletions, setAllActivityCompletions] = useState<RawCompletion[]>([]);
  const [painRange, setPainRange] = useState<PainRange>('2w');
  const [activityRange, setActivityRange] = useState<ActivityRange>('1m');

  // This Week navigation: 0 = current week, -1 = last week, etc.
  const [weekOffset, setWeekOffset] = useState(0);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchAll();
    }, [user]),
  );

  // Charts are derived from raw data — no chart state to fall out of sync
  const { beforeData, afterData, painRangeHasData } = useMemo(() => {
    const accountStart = userProgram?.started_at ? new Date(userProgram.started_at) : undefined;
    const { bData, aData, rangeHasData } = computePainChart(allPainCheckins, painRange, accountStart);
    return { beforeData: bData, afterData: aData, painRangeHasData: rangeHasData };
  }, [allPainCheckins, painRange, userProgram]);

  const weeklyBarData = useMemo(
    () => computeActivityChart(allActivityCompletions, activityRange, colors.primary),
    [allActivityCompletions, activityRange],
  );

  async function fetchAll() {
    if (!user) return;

    const resetPending = await AsyncStorage.getItem('remedy_reset_pending');
    if (resetPending) {
      await AsyncStorage.removeItem('remedy_reset_pending');
      setTotalSessions(0);
      setAllPainCheckins([]);
      setAllActivityCompletions([]);
      setUserProgram(null);
      setLoaded(false);
    }

    // Fetch this week's session_completions, pain checkins, user program, and activity history in parallel
    const [painRes, upRes, totalRes, activityRes] = await Promise.all([
      supabase
        .from('pain_checkins')
        .select('score, type, recorded_at')
        .eq('user_id', user.id)
        .order('recorded_at', { ascending: true }),
      supabase
        .from('user_programs')
        .select('*')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('session_completions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
      supabase
        .from('session_completions')
        .select('completed_at')
        .eq('user_id', user.id)
        .order('completed_at', { ascending: true }),
    ]);

    // Only overwrite state from responses that succeeded — a failed focus-refetch
    // (e.g. offline) must not wipe previously loaded charts. PGRST116 ("no rows")
    // from .single() is a legitimate no-program state, not a failure.
    if (!upRes.error || upRes.error.code === 'PGRST116') {
      const up = upRes.data;
      setUserProgram(up);

      // Read duration/cadence from the active plan snapshot — matches Home and
      // session player.
      if (up?.active_plan_id) {
        const { data: plan } = await supabase
          .from('user_program_plans')
          .select('duration_weeks, sessions_per_week')
          .eq('id', up.active_plan_id)
          .single();

        if (plan) {
          setDurationWeeks(plan.duration_weeks);
          setSessionsPerWeek(plan.sessions_per_week);
        }
      }
    }

    if (!painRes.error) setAllPainCheckins(painRes.data ?? []);
    if (!activityRes.error) setAllActivityCompletions(activityRes.data ?? []);
    if (!totalRes.error) setTotalSessions(totalRes.count ?? 0);

    setLoaded(true);
  }

  const hasEnoughData =
    allPainCheckins.filter((c) => c.type === 'before').length >= 3;
  // The chart itself is range-filtered — with enough all-time data but nothing in the
  // selected range, show a range-specific empty state instead of an empty chart.
  const showPainChart = hasEnoughData && painRangeHasData;

  // Derive week day completions for the selected week offset from raw data
  const displayWeekDays = useMemo(
    () => computeWeekDays(allActivityCompletions, weekOffset),
    [allActivityCompletions, weekOffset],
  );

  // Allow navigating up to 52 weeks back regardless of program start date
  const minWeekOffset = -52;

  // Program progress follows DB current_week (advances on session completion), same as Home.
  const programWeek = userProgram
    ? Math.min(userProgram.current_week, durationWeeks)
    : 1;
  const isProgramComplete = userProgram
    ? userProgram.current_week > durationWeeks
    : false;

  const estimatedEnd = userProgram && !isProgramComplete
    ? getEstimatedCompletion(
        userProgram.current_week,
        userProgram.current_session,
        durationWeeks,
        sessionsPerWeek,
      )
    : null;

  if (!loaded) {
    return (
      <TabFadeWrapper>
        <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
          <Skeleton height={180} borderRadius={radius.card} style={styles.skeletonBlock} />
          <Skeleton height={100} borderRadius={radius.card} style={styles.skeletonBlock} />
          <Skeleton height={180} borderRadius={radius.card} style={styles.skeletonBlock} />
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
      <Text style={styles.title}>Progress</Text>

      {/* Pain Trend */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Pain Trend</Text>
          <View style={styles.rangeRow}>
            {(['2w', '1m', '3m'] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.rangePill, painRange === r && styles.rangePillActive]}
                onPress={() => {
                  hapticSelection();
                  setPainRange(r);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.rangePillText, painRange === r && styles.rangePillTextActive]}>
                  {r === '2w' ? '14D' : r === '1m' ? '1M' : '3M'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {showPainChart ? (
          <View style={{ marginTop: 12 }}>
            <LineChart
              data={beforeData}
              data2={afterData}
              height={150}
              width={PAIN_CHART_DATA_W}
              spacing={
                beforeData.length > 1
                  ? Math.max(16, Math.floor((PAIN_CHART_DATA_W - 8) / (beforeData.length - 1)))
                  : PAIN_CHART_DATA_W - 8
              }
              color1={colors.textSecondary}
              color2={colors.primary}
              thickness={2}
              hideDataPoints={false}
              dataPointsColor1={colors.textSecondary}
              dataPointsColor2={colors.primary}
              dataPointsRadius={3}
              // Empty buckets have no value: interpolate between real points (dots
              // hidden there) and never extrapolate a line beyond the real data.
              extrapolateMissingValues={false}
              yAxisTextStyle={{ fontSize: 10, color: colors.textSecondary }}
              xAxisLabelTextStyle={{ fontSize: 9, color: colors.textSecondary }}
              maxValue={10}
              noOfSections={5}
              rulesColor={colors.border}
              yAxisColor="transparent"
              xAxisColor={colors.border}
              hideRules={false}
              yAxisLabelWidth={PAIN_Y_AXIS_W}
            />
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.textSecondary }]} />
                <Text style={styles.legendText}>Before</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={styles.legendText}>After</Text>
              </View>
            </View>
          </View>
        ) : (
          <Text style={styles.placeholder}>
            {hasEnoughData
              ? 'No check-ins in this range yet.'
              : 'Complete more sessions to see your pain trend.'}
          </Text>
        )}
      </View>

      {/* Activity — weekly sessions bar chart */}
      <View style={styles.card}>
        <View style={styles.cardHeaderRow}>
          <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Activity</Text>
          <View style={styles.rangeRow}>
            {(['1m', '3m', '6m'] as const).map((r) => (
              <TouchableOpacity
                key={r}
                style={[styles.rangePill, activityRange === r && styles.rangePillActive]}
                onPress={() => {
                  hapticSelection();
                  setActivityRange(r);
                }}
                activeOpacity={0.7}
              >
                <Text style={[styles.rangePillText, activityRange === r && styles.rangePillTextActive]}>
                  {r === '1m' ? '1M' : r === '3m' ? '3M' : '6M'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <Text style={styles.totalSessionsBadge}>{totalSessions} sessions total</Text>
        {weeklyBarData.some((d) => d.value > 0) ? (
          <View style={{ marginTop: 8 }}>
            {/* BarChart scrolls internally with a pinned y-axis; start at the most
                recent weeks. An external ScrollView showed the OLDEST weeks first and
                scrolled the y-axis off-screen. */}
            <BarChart
              data={weeklyBarData}
              width={CARD_INNER_W - PAIN_Y_AXIS_W - 12}
              height={120}
              barWidth={20}
              spacing={14}
              initialSpacing={4}
              roundedTop
              noOfSections={3}
              frontColor={colors.primary}
              scrollToEnd
              scrollAnimation={false}
              showScrollIndicator={false}
              yAxisTextStyle={{ fontSize: 10, color: colors.textSecondary }}
              xAxisLabelTextStyle={{ fontSize: 8, color: colors.textSecondary }}
              rulesColor={colors.border}
              yAxisColor="transparent"
              xAxisColor={colors.border}
              hideRules={false}
              yAxisLabelWidth={PAIN_Y_AXIS_W}
            />
          </View>
        ) : (
          <Text style={styles.placeholder}>
            Complete sessions to see your activity history.
          </Text>
        )}
      </View>

      {/* This Week */}
      <View style={styles.card}>
        <View style={styles.weekNavRow}>
          <TouchableOpacity
            style={styles.weekNavArrow}
            onPress={() => setWeekOffset((o) => Math.max(minWeekOffset, o - 1))}
            disabled={weekOffset <= minWeekOffset}
          >
            <Text
              style={[
                styles.weekNavArrowText,
                weekOffset <= minWeekOffset && styles.weekNavArrowDisabled,
              ]}
            >
              ‹
            </Text>
          </TouchableOpacity>

          <View style={styles.weekNavCenter}>
            <Text style={styles.cardTitle}>
              {weekOffset === 0 ? 'This Week' : 'Week of'}
            </Text>
            <Text style={styles.weekNavLabel}>{getWeekLabel(weekOffset)}</Text>
          </View>

          <TouchableOpacity
            style={styles.weekNavArrow}
            onPress={() => setWeekOffset((o) => Math.min(0, o + 1))}
            disabled={weekOffset >= 0}
          >
            <Text
              style={[
                styles.weekNavArrowText,
                weekOffset >= 0 && styles.weekNavArrowDisabled,
              ]}
            >
              ›
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {DAY_LABELS.map((label, i) => (
            <View
              key={i}
              style={[styles.dayCircle, displayWeekDays[i] && styles.dayCircleFilled]}
            >
              <Text
                style={[
                  styles.dayInsideLabel,
                  displayWeekDays[i] && styles.dayInsideLabelFilled,
                ]}
              >
                {label.charAt(0)}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Program Progress */}
      {userProgram && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Program Progress</Text>
          <Text style={styles.progressLabel}>
            {isProgramComplete
              ? 'Program complete'
              : `Week ${programWeek} of ${durationWeeks}`}
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min((programWeek / durationWeeks) * 100, 100)}%` },
              ]}
            />
          </View>
          {estimatedEnd && (
            <Text style={styles.estimatedEnd}>
              Estimated completion: {estimatedEnd}
            </Text>
          )}
          {isProgramComplete && (
            <Text style={styles.estimatedEnd}>You finished your program!</Text>
          )}
        </View>
      )}
    </ScrollView>
    </TabFadeWrapper>
  );
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
    letterSpacing: -0.3,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 20,
    marginBottom: 16,
    ...shadows.low,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  rangePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  rangePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rangePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.4,
  },
  rangePillTextActive: {
    color: '#FFFFFF',
  },
  totalSessionsBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  placeholder: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: 20,
  },
  legendRow: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 12,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  weekRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  weekNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  weekNavArrow: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekNavArrowText: {
    fontSize: 24,
    fontWeight: '300',
    color: colors.textPrimary,
    lineHeight: 28,
  },
  weekNavArrowDisabled: {
    color: colors.textTertiary,
  },
  weekNavCenter: {
    flex: 1,
    alignItems: 'center',
  },
  weekNavLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: radius.circle,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dayInsideLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  dayInsideLabelFilled: {
    color: '#FFFFFF',
  },
  progressLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  progressTrack: {
    height: 8,
    backgroundColor: colors.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  estimatedEnd: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
  },
  skeletonBlock: {
    marginBottom: 16,
  },
});
