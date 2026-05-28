import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import { TabFadeWrapper } from '../../components/ui/TabFadeWrapper';
import type { UserProgram } from '../../types/database';

type ChartPoint = { value: number; label?: string };
type BarPoint = { value: number; label: string; frontColor: string };
type RawCheckin = { score: number; type: string; recorded_at: string };
type RawCompletion = { completed_at: string };

const SCREEN_WIDTH = Dimensions.get('window').width;
// card uses padding:20, container uses paddingHorizontal:24 → 88px total eaten horizontally
const CARD_INNER_W = SCREEN_WIDTH - 88;
const PAIN_Y_AXIS_W = 36;
const PAIN_CHART_DATA_W = CARD_INNER_W - PAIN_Y_AXIS_W;

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [beforeData, setBeforeData] = useState<ChartPoint[]>([]);
  const [afterData, setAfterData] = useState<ChartPoint[]>([]);
  const [totalSessions, setTotalSessions] = useState(0);
  const [weeklyBarData, setWeeklyBarData] = useState<BarPoint[]>([]);
  const [userProgram, setUserProgram] = useState<UserProgram | null>(null);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(4);
  const [durationWeeks, setDurationWeeks] = useState(5);
  const [loaded, setLoaded] = useState(false);

  // Raw data for range filtering
  const [allPainCheckins, setAllPainCheckins] = useState<RawCheckin[]>([]);
  const [allActivityCompletions, setAllActivityCompletions] = useState<RawCompletion[]>([]);
  const [painRange, setPainRange] = useState<'2w' | '1m' | '3m'>('2w');
  const [activityRange, setActivityRange] = useState<'1m' | '3m' | '6m'>('1m');

  // This Week navigation: 0 = current week, -1 = last week, etc.
  const [weekOffset, setWeekOffset] = useState(0);

  // ScrollView ref for activity chart (manual horizontal scroll; no auto-scroll to keep y-axis visible)
  const activityScrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchAll();
    }, [user]),
  );

  // Recompute pain chart when raw data or range changes
  useEffect(() => {
    if (allPainCheckins.length === 0) return;
    const accountStart = userProgram?.started_at ? new Date(userProgram.started_at) : undefined;
    const { bData, aData } = computePainChart(allPainCheckins, painRange, accountStart);
    setBeforeData(bData);
    setAfterData(aData);
  }, [allPainCheckins, painRange, userProgram]);

  // Recompute activity chart when raw data or range changes
  useEffect(() => {
    const bd = computeActivityChart(allActivityCompletions, activityRange);
    setWeeklyBarData(bd);
  }, [allActivityCompletions, activityRange]);

  async function fetchAll() {
    if (!user) return;

    const resetPending = await AsyncStorage.getItem('remedy_reset_pending');
    if (resetPending) {
      await AsyncStorage.removeItem('remedy_reset_pending');
      setBeforeData([]);
      setAfterData([]);
      setTotalSessions(0);
      setWeeklyBarData([]);
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

    const up = upRes.data;
    setUserProgram(up);

    // Fetch program metadata (needs program_id from user_programs)
    if (up) {
      const { data: prog } = await supabase
        .from('programs')
        .select('sessions_per_week, duration_weeks')
        .eq('id', up.program_id)
        .single();

      if (prog) {
        setSessionsPerWeek(prog.sessions_per_week);
        setDurationWeeks(prog.duration_weeks);
      }
    }

    setBeforeData([]);
    setAfterData([]);

    // Store raw data — useEffects will recompute charts from these
    setAllPainCheckins(painRes.data ?? []);
    setAllActivityCompletions(activityRes.data ?? []);

    // --- Total sessions ---
    setTotalSessions(totalRes.count ?? 0);

    setLoaded(true);
  }

  const hasEnoughData =
    allPainCheckins.filter((c) => c.type === 'before').length >= 3;

  // Derive week day completions for the selected week offset from raw data
  const displayWeekDays = useMemo(
    () => computeWeekDays(allActivityCompletions, weekOffset),
    [allActivityCompletions, weekOffset],
  );
  const displayWeekCount = displayWeekDays.filter(Boolean).length;

  // Allow navigating up to 52 weeks back regardless of program start date
  const minWeekOffset = -52;

  // Program Progress: derive current week from elapsed calendar days since start.
  // This reflects where the user *should* be in time, independently of DB current_week.
  const computedWeek = userProgram?.started_at
    ? Math.max(
        1,
        Math.min(
          Math.floor(
            (Date.now() - new Date(userProgram.started_at).getTime()) /
              (7 * 24 * 60 * 60 * 1000),
          ) + 1,
          durationWeeks,
        ),
      )
    : (userProgram?.current_week ?? 1);

  const estimatedEnd = userProgram
    ? getEstimatedCompletion(computedWeek, durationWeeks)
    : null;

  if (!loaded) {
    return (
      <TabFadeWrapper>
        <View style={[styles.container, { paddingTop: insets.top + 16 }]}>
          <View style={styles.skeletonBlock} />
          <View style={styles.skeletonSmall} />
          <View style={styles.skeletonBlock} />
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
                onPress={() => setPainRange(r)}
              >
                <Text style={[styles.rangePillText, painRange === r && styles.rangePillTextActive]}>
                  {r === '2w' ? '14D' : r === '1m' ? '1M' : '3M'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {hasEnoughData ? (
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
              yAxisTextStyle={{ fontSize: 10, color: colors.textSecondary }}
              xAxisLabelTextStyle={{ fontSize: 9, color: colors.textSecondary }}
              maxValue={10}
              noOfSections={5}
              rulesColor="#E8E0DC"
              yAxisColor="transparent"
              xAxisColor="#E8E0DC"
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
            Complete more sessions to see your pain trend.
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
                onPress={() => setActivityRange(r)}
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
          <ScrollView ref={activityScrollRef} horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            <BarChart
              data={weeklyBarData}
              width={Math.max(CARD_INNER_W - PAIN_Y_AXIS_W - 24, weeklyBarData.length * 34)}
              height={120}
              barWidth={20}
              spacing={14}
              initialSpacing={4}
              roundedTop
              noOfSections={3}
              frontColor={colors.primary}
              yAxisTextStyle={{ fontSize: 10, color: colors.textSecondary }}
              xAxisLabelTextStyle={{ fontSize: 8, color: colors.textSecondary }}
              rulesColor="#E8E0DC"
              yAxisColor="transparent"
              xAxisColor="#E8E0DC"
              hideRules={false}
              yAxisLabelWidth={PAIN_Y_AXIS_W}
            />
          </ScrollView>
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
        <Text style={styles.weekSummary}>
          {displayWeekCount}/{sessionsPerWeek} sessions completed
        </Text>
      </View>

      {/* Program Progress */}
      {userProgram && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Program Progress</Text>
          <Text style={styles.progressLabel}>
            Week {computedWeek} of {durationWeeks}
          </Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.min((computedWeek / durationWeeks) * 100, 100)}%` },
              ]}
            />
          </View>
          {estimatedEnd && (
            <Text style={styles.estimatedEnd}>
              Estimated completion: {estimatedEnd}
            </Text>
          )}
        </View>
      )}
    </ScrollView>
    </TabFadeWrapper>
  );
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function computePainChart(
  checkins: RawCheckin[],
  range: '2w' | '1m' | '3m',
  accountStart?: Date,
): { bData: ChartPoint[]; aData: ChartPoint[] } {
  const daysBack = range === '2w' ? 14 : range === '1m' ? 30 : 90;

  const now = new Date();
  const rawStart = new Date(now);
  rawStart.setDate(now.getDate() - daysBack);

  // Never show data before the account start date
  const startDate = accountStart && accountStart > rawStart ? accountStart : rawStart;

  const actualDays = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / 86400000));

  // Bucket granularity per range — keeps the chart to a sensible number of points
  // 14D → 1 bucket/day → up to 14 pts; label every 3rd day
  // 1M  → 5-day buckets → ~6 pts; label every bucket  
  // 3M  → 14-day (bi-weekly) buckets → ~6-7 pts; label every bucket
  const groupDays = range === '2w' ? 1 : range === '1m' ? 5 : 14;
  const labelEvery = range === '2w' ? 3 : 1;

  const relevant = checkins.filter((c) => new Date(c.recorded_at) >= startDate);
  const numBuckets = Math.max(1, Math.ceil(actualDays / groupDays));

  const bData: ChartPoint[] = [];
  const aData: ChartPoint[] = [];

  for (let i = 0; i < numBuckets; i++) {
    const bucketStart = new Date(startDate);
    bucketStart.setDate(startDate.getDate() + i * groupDays);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketStart.getDate() + groupDays);

    const inBucket = relevant.filter((c) => {
      const d = new Date(c.recorded_at);
      return d >= bucketStart && d < bucketEnd;
    });

    const bScores = inBucket.filter((c) => c.type === 'before').map((c) => c.score);
    const aScores = inBucket.filter((c) => c.type === 'after').map((c) => c.score);

    const showLabel = i % labelEvery === 0;
    const parts = bucketStart.toISOString().slice(0, 10).split('-');
    // For 3M range use short month name for clarity, otherwise M/D
    const label = showLabel
      ? range === '3m'
        ? `${bucketStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
        : `${parseInt(parts[1])}/${parseInt(parts[2])}`
      : '';

    bData.push({ value: bScores.length > 0 ? avg(bScores) : 0, label });
    aData.push({ value: aScores.length > 0 ? avg(aScores) : 0, label });
  }

  return { bData, aData };
}

function computeActivityChart(
  completions: RawCompletion[],
  range: '1m' | '3m' | '6m',
): BarPoint[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  thisMonday.setHours(0, 0, 0, 0);

  // 1m ≈ 4 weeks, 3m ≈ 13 weeks, 6m ≈ 26 weeks
  const totalWeeks = range === '1m' ? 4 : range === '3m' ? 13 : 26;

  const bars: BarPoint[] = [];
  for (let i = totalWeeks - 1; i >= 0; i--) {
    const weekStart = new Date(thisMonday);
    weekStart.setDate(thisMonday.getDate() - i * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    const count = completions.filter((c) => {
      const d = new Date(c.completed_at);
      return d >= weekStart && d < weekEnd;
    }).length;

    // 1M (4 bars): label every bar; 3M (13 bars): every 2; 6M (26 bars): every 4
    const labelEvery = range === '1m' ? 1 : range === '3m' ? 2 : 4;
    const barIndex = totalWeeks - 1 - i;
    const showLabel = barIndex % labelEvery === 0;
    const parts = weekStart.toISOString().slice(0, 10).split('-');
    const label = showLabel ? `${parseInt(parts[1])}/${parseInt(parts[2])}` : '';

    bars.push({ value: count, label, frontColor: colors.primary });
  }

  return bars;
}

function avg(arr: number[]): number {
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
}

function computeWeekDays(completions: RawCompletion[], offset: number): boolean[] {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  thisMonday.setHours(0, 0, 0, 0);

  const targetMonday = new Date(thisMonday);
  targetMonday.setDate(thisMonday.getDate() + offset * 7);

  const completionDates = new Set(completions.map((c) => c.completed_at.slice(0, 10)));

  const days: boolean[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(targetMonday);
    d.setDate(targetMonday.getDate() + i);
    days.push(completionDates.has(d.toISOString().slice(0, 10)));
  }
  return days;
}

function getWeekLabel(offset: number): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
  thisMonday.setHours(0, 0, 0, 0);

  const targetMonday = new Date(thisMonday);
  targetMonday.setDate(thisMonday.getDate() + offset * 7);
  const targetSunday = new Date(targetMonday);
  targetSunday.setDate(targetMonday.getDate() + 6);

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(targetMonday)} – ${fmt(targetSunday)}`;
}

function getEstimatedCompletion(currentWeek: number, durationWeeks: number): string {
  const weeksLeft = durationWeeks - currentWeek;
  if (weeksLeft <= 0) return 'Program complete';
  const d = new Date();
  d.setDate(d.getDate() + weeksLeft * 7);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

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
  },
  card: {
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
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E8E0DC',
  },
  rangePillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rangePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  rangePillTextActive: {
    color: '#FFFFFF',
  },
  totalSessionsBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 4,
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
    marginBottom: 12,
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
    color: '#D0C8C3',
  },
  weekNavCenter: {
    flex: 1,
    alignItems: 'center',
  },
  weekNavLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },  dayCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#E8E0DC',
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
  weekSummary: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  progressLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  progressTrack: {
    height: 8,
    backgroundColor: '#E8E0DC',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.secondary,
    borderRadius: 4,
  },
  estimatedEnd: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  skeletonBlock: {
    height: 180,
    backgroundColor: '#E8E0DC',
    borderRadius: 16,
    marginBottom: 16,
  },
  skeletonSmall: {
    height: 100,
    backgroundColor: '#E8E0DC',
    borderRadius: 16,
    marginBottom: 16,
  },
});
