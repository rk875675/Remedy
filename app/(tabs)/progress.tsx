import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { hapticSelection } from '../../lib/haptics';
import { TabFadeWrapper } from '../../components/ui/TabFadeWrapper';
import { Skeleton } from '../../components/ui/Skeleton';
import { MiniRing } from '../../components/ui/MiniRing';
import { progressRangeChanged } from '../../lib/analytics/events/engagement';
import { PetStageStrip } from '../../components/pet/PetStageStrip';
import { petGrowthCopy, stageProgress, type PetState } from '../../lib/pet';
import { fetchPetState } from '../../lib/petApi';
import { PET_FALLBACK_NAME } from '../../constants/petLines';
import type { UserProgram } from '../../types/database';
import {
  computePainChart,
  computeActivityChart,
  getEstimatedCompletion,
  computeWeekDays,
  historyWindowStartISO,
  PROGRESS_HISTORY_DAYS,
  localDateKey,
  type RawCheckin,
  type RawCompletion,
  type PainRange,
  type ActivityRange,
} from '../../lib/progress';
import { countMissedThisWeek, showingUpCopy } from '../../lib/streak';
import { shouldSkipTabRefresh, beginTabRefresh, finishTabRefresh, invalidateTabRefresh } from '../../lib/tabRefresh';
import { computeDefaultWorkoutDays, activeWorkoutDaysThisWeek, todayDayIndex } from '../../lib/workoutDays';
import { STORAGE_WORKOUT_DAYS, STORAGE_WORKOUT_DAYS_SINCE, DAY_LABELS } from '../../components/progress/WorkoutDaysModal';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_INNER_W = SCREEN_WIDTH - 88;
const PAIN_Y_AXIS_W = 36;
const PAIN_CHART_DATA_W = CARD_INNER_W - PAIN_Y_AXIS_W;
const ACTIVITY_CHART_W = CARD_INNER_W - PAIN_Y_AXIS_W - 12;

function activityBarLayout(barCount: number, chartWidth: number): {
  barWidth: number;
  spacing: number;
  initialSpacing: number;
  fitsWithoutScroll: boolean;
} {
  const initialSpacing = 8;
  const minBar = 12;
  const minGap = 10;
  const maxBar = barCount <= 5 ? 36 : 28;
  const maxGap = barCount <= 5 ? 28 : 22;
  const minWidth = initialSpacing + barCount * minBar + Math.max(0, barCount - 1) * minGap;
  if (minWidth > chartWidth) {
    return { barWidth: 14, spacing: 10, initialSpacing, fitsWithoutScroll: false };
  }
  const extra = chartWidth - minWidth;
  const barRoom = (maxBar - minBar) * barCount;
  const gaps = Math.max(0, barCount - 1);
  if (extra <= barRoom) {
    return {
      barWidth: minBar + Math.floor(extra / barCount),
      spacing: minGap,
      initialSpacing,
      fitsWithoutScroll: true,
    };
  }
  return {
    barWidth: maxBar,
    spacing: gaps === 0 ? minGap : Math.min(maxGap, minGap + Math.floor((extra - barRoom) / gaps)),
    initialSpacing,
    fitsWithoutScroll: true,
  };
}

const PATH_H = 48;
const PATH_MID = 22;
const PATH_PAD = 16;

// The program as a route: one stop per week on a gently rolling line.
// Covered ground is solid, what's ahead is dashed, today is the warm stop.
function ProgramPath({
  weeks,
  currentWeek,
  complete,
  finishLabel,
}: {
  weeks: number;
  currentWeek: number;
  complete: boolean;
  finishLabel: string;
}) {
  const [width, setWidth] = useState(0);
  const span = width - PATH_PAD * 2;
  const stops = Array.from({ length: weeks }, (_, i) => {
    const t = weeks > 1 ? i / (weeks - 1) : 0.5;
    return {
      x: PATH_PAD + span * t,
      y: PATH_MID + Math.sin(t * Math.PI * 2) * 6,
      reached: complete || i + 1 <= currentWeek,
      current: !complete && i + 1 === currentWeek,
    };
  });
  const currentIdx = complete ? weeks - 1 : currentWeek - 1;
  const lastIdx = weeks - 1;

  return (
    <View
      style={styles.pathWrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={
        complete ? 'Program complete' : `Week ${currentWeek} of ${weeks}`
      }
    >
      {width > 0 ? (
        <>
          <Svg width={width} height={PATH_H}>
            {stops.slice(0, -1).map((a, i) => {
              const b = stops[i + 1]!;
              const dx = (b.x - a.x) / 2;
              const walked = b.reached;
              return (
                <Path
                  key={`seg-${i}`}
                  d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`}
                  fill="none"
                  strokeLinecap="round"
                  stroke={walked ? colors.primary : colors.border}
                  strokeWidth={walked ? 3 : 2}
                  strokeDasharray={walked ? undefined : '1 7'}
                />
              );
            })}
            {stops.map((s, i) => {
              if (s.current) {
                return (
                  <React.Fragment key={`stop-${i}`}>
                    <Circle cx={s.x} cy={s.y} r={15} fill={colors.secondary} fillOpacity={0.14} />
                    <Circle cx={s.x} cy={s.y} r={9} fill={colors.surface} stroke={colors.secondary} strokeWidth={2.5} />
                    <Circle cx={s.x} cy={s.y} r={3.5} fill={colors.secondary} />
                  </React.Fragment>
                );
              }
              if (s.reached) {
                const isEnd = complete && i === lastIdx;
                return (
                  <React.Fragment key={`stop-${i}`}>
                    {isEnd ? (
                      <Circle cx={s.x} cy={s.y} r={15} fill={colors.primary} fillOpacity={0.14} />
                    ) : null}
                    <Circle cx={s.x} cy={s.y} r={6.5} fill={colors.primary} />
                    <Circle cx={s.x} cy={s.y} r={2} fill={colors.surface} />
                  </React.Fragment>
                );
              }
              return (
                <Circle
                  key={`stop-${i}`}
                  cx={s.x}
                  cy={s.y}
                  r={5.5}
                  fill={colors.background}
                  stroke={colors.border}
                  strokeWidth={2}
                />
              );
            })}
          </Svg>
          <View style={styles.pathLabels}>
            {currentIdx !== 0 ? (
              <Text style={[styles.pathLabel, styles.pathLabelStart]}>Start</Text>
            ) : null}
            {currentIdx !== lastIdx ? (
              <Text style={[styles.pathLabel, styles.pathLabelEnd]}>{finishLabel}</Text>
            ) : null}
            <Text
              style={[
                styles.pathLabel,
                styles.pathLabelHere,
                complete && styles.pathLabelDone,
                currentIdx === 0
                  ? styles.pathLabelStart
                  : currentIdx === lastIdx
                  ? styles.pathLabelEnd
                  : { left: (stops[currentIdx]?.x ?? 0) - 45, width: 90, textAlign: 'center' as const },
              ]}
            >
              {complete ? 'Finished' : "You're here"}
            </Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

const RANGE_DAYS: Record<PainRange | ActivityRange, number> = {
  '2w': 14,
  '1m': 30,
  '3m': 90,
  '6m': 180,
};

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [totalSessions, setTotalSessions] = useState(0);
  const [userProgram, setUserProgram] = useState<UserProgram | null>(null);
  const [durationWeeks, setDurationWeeks] = useState(5);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(4);
  const [loaded, setLoaded] = useState(false);

  const [allPainCheckins, setAllPainCheckins] = useState<RawCheckin[]>([]);
  const [allActivityCompletions, setAllActivityCompletions] = useState<RawCompletion[]>([]);
  const [painRange, setPainRange] = useState<PainRange>('2w');
  const [activityRange, setActivityRange] = useState<ActivityRange>('1m');
  const [workoutDays, setWorkoutDays] = useState<number[]>([]);
  const [daysSince, setDaysSince] = useState<string | null>(null);
  const [pet, setPet] = useState<PetState | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      fetchAll();
    }, [user]),
  );

  const { beforeData, afterData, painRangeHasData } = useMemo(() => {
    const painStart = userProgram?.started_at ? new Date(userProgram.started_at) : undefined;
    const { bData, aData, rangeHasData } = computePainChart(allPainCheckins, painRange, painStart);
    return { beforeData: bData, afterData: aData, painRangeHasData: rangeHasData };
  }, [allPainCheckins, painRange, userProgram]);

  const activityAccountStart = useMemo(() => {
    const created = user?.created_at ? new Date(user.created_at) : undefined;
    const started = userProgram?.started_at ? new Date(userProgram.started_at) : undefined;
    if (created && started) return created < started ? created : started;
    return created ?? started;
  }, [user?.created_at, userProgram?.started_at]);

  const weeklyBarData = useMemo(
    () =>
      computeActivityChart(
        allActivityCompletions,
        activityRange,
        colors.primary,
        activityAccountStart,
      ),
    [allActivityCompletions, activityRange, activityAccountStart],
  );

  const activityLayout = useMemo(
    () => activityBarLayout(weeklyBarData.length, ACTIVITY_CHART_W),
    [weeklyBarData.length],
  );

  const activityChartData = useMemo(
    () =>
      weeklyBarData.map((bar) => ({
        value: bar.value,
        label: bar.label,
        frontColor: bar.isFuture ? colors.primaryMuted : colors.primary,
        labelWidth: bar.label
          ? Math.max(activityLayout.barWidth, 36)
          : activityLayout.barWidth,
        labelTextStyle: {
          fontSize: 10,
          fontWeight: bar.isCurrent ? ('700' as const) : ('500' as const),
          color: bar.isCurrent ? colors.textPrimary : colors.textSecondary,
        },
      })),
    [weeklyBarData, activityLayout.barWidth],
  );

  const activityMaxValue = Math.max(4, ...weeklyBarData.map((d) => d.value));
  const activityCurrentIndex = weeklyBarData.findIndex((d) => d.isCurrent);
  const activityHasFuture = weeklyBarData.some((d) => d.isFuture);

  async function fetchAll() {
    if (!user) return;

    const resetPending = await AsyncStorage.getItem('remedy_reset_pending');
    if (resetPending) {
      await AsyncStorage.removeItem('remedy_reset_pending');
      invalidateTabRefresh('progress');
      setTotalSessions(0);
      setAllPainCheckins([]);
      setAllActivityCompletions([]);
      setUserProgram(null);
      setLoaded(false);
    } else if (shouldSkipTabRefresh('progress')) {
      return;
    }

    beginTabRefresh('progress');
    void fetchPetState().then((p) => {
      if (p) setPet(p);
    });
    const since = historyWindowStartISO(PROGRESS_HISTORY_DAYS);
    try {

    const [
      painRes,
      upRes,
      totalRes,
      activityRes,
      storedDays,
      storedDaysSince,
    ] = await Promise.all([
      supabase
        .from('pain_checkins')
        .select('score, type, recorded_at')
        .eq('user_id', user.id)
        .gte('recorded_at', since)
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
        .gte('completed_at', since)
        .order('completed_at', { ascending: true }),
      AsyncStorage.getItem(STORAGE_WORKOUT_DAYS),
      AsyncStorage.getItem(STORAGE_WORKOUT_DAYS_SINCE),
    ]);

    let planSessionsPerWeek = sessionsPerWeek;
    if (!upRes.error || upRes.error.code === 'PGRST116') {
      const up = upRes.data;
      setUserProgram(up);

      if (up?.active_plan_id) {
        const { data: planRes } = await supabase
          .from('user_program_plans')
          .select('duration_weeks, sessions_per_week')
          .eq('id', up.active_plan_id)
          .eq('status', 'active')
          .single();

        if (planRes) {
          setDurationWeeks(planRes.duration_weeks);
          setSessionsPerWeek(planRes.sessions_per_week);
          planSessionsPerWeek = planRes.sessions_per_week;
        }
      }
    }

    if (!painRes.error) setAllPainCheckins(painRes.data ?? []);
    if (!activityRes.error) setAllActivityCompletions(activityRes.data ?? []);
    if (!totalRes.error) setTotalSessions(totalRes.count ?? 0);

    let days: number[] = [];
    try { if (storedDays) days = JSON.parse(storedDays) as number[]; } catch { /* ignore */ }
    let nextSince = storedDaysSince;
    if (days.length !== planSessionsPerWeek) {
      days = computeDefaultWorkoutDays(planSessionsPerWeek);
      nextSince = localDateKey(new Date());
      await AsyncStorage.multiSet([
        [STORAGE_WORKOUT_DAYS, JSON.stringify(days)],
        [STORAGE_WORKOUT_DAYS_SINCE, nextSince],
      ]);
    }
    setWorkoutDays(days);
    setDaysSince(nextSince);

    } finally {
      finishTabRefresh('progress');
      setLoaded(true);
    }
  }

  const hasEnoughData = allPainCheckins.filter((c) => c.type === 'before').length >= 3;
  const showPainChart = hasEnoughData && painRangeHasData;

  const programWeek = userProgram
    ? Math.min(userProgram.current_week, durationWeeks)
    : 1;
  const isProgramComplete = userProgram
    ? userProgram.current_week > durationWeeks
    : false;
  const weeksRemaining = durationWeeks - programWeek;

  const estimatedEnd = userProgram && !isProgramComplete
    ? getEstimatedCompletion(
        userProgram.current_week,
        userProgram.current_session,
        durationWeeks,
        sessionsPerWeek,
      )
    : null;

  const effectiveDays =
    workoutDays.length === sessionsPerWeek
      ? workoutDays
      : computeDefaultWorkoutDays(sessionsPerWeek);
  const weekSchedule = activeWorkoutDaysThisWeek(effectiveDays, daysSince);
  const weekTarget = weekSchedule.length > 0 ? weekSchedule.length : sessionsPerWeek;
  const weekDoneFlags = computeWeekDays(allActivityCompletions, 0);
  const sessionsThisWeek = weekDoneFlags.filter(Boolean).length;
  const missedThisWeek =
    workoutDays.length === sessionsPerWeek
      ? countMissedThisWeek(allActivityCompletions, weekSchedule)
      : 0;
  const showingUpBody = showingUpCopy({
    sessionsThisWeek,
    sessionsPerWeek: weekTarget,
    missedThisWeek,
    hasAnyCompletion: totalSessions > 0,
  });
  const todayIdx = todayDayIndex();

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

        {userProgram && (
          <View style={styles.programBlock}>
            <Text style={styles.kicker}>Program</Text>
            <Text style={styles.heroFigure}>
              {isProgramComplete ? 'Complete' : `Week ${programWeek}`}
              {!isProgramComplete && (
                <Text style={styles.progressWeekDim}> of {durationWeeks}</Text>
              )}
            </Text>
            <Text style={styles.weeksToGo}>
              {isProgramComplete
                ? 'You finished your program!'
                : weeksRemaining > 0
                ? `${weeksRemaining} week${weeksRemaining !== 1 ? 's' : ''} to go`
                : 'Final week'}
              {estimatedEnd ? (
                <Text style={styles.estimatedEnd}>{`  ·  Est. finish ${estimatedEnd}`}</Text>
              ) : null}
            </Text>
            <ProgramPath
              weeks={durationWeeks}
              currentWeek={programWeek}
              complete={isProgramComplete}
              finishLabel={`Week ${durationWeeks}`}
            />
          </View>
        )}

        {pet && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{pet.name ?? PET_FALLBACK_NAME}</Text>
            <PetStageStrip stage={pet.stage} size={52} />
            <Text style={styles.petGrowthText}>{petGrowthCopy(pet)}</Text>
            {pet.stage < 5 && (
              <View style={styles.petBarTrack}>
                <View style={[styles.petBarFill, { width: `${Math.round(stageProgress(pet) * 100)}%` }]} />
              </View>
            )}
          </View>
        )}

        {userProgram && !isProgramComplete && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>This week</Text>
            <View style={styles.programProgressWeekRow}>
              <View style={styles.programProgressCopy}>
                <Text
                  style={styles.progressWeek}
                  accessibilityLabel={`${sessionsThisWeek} of ${weekTarget} sessions this week`}
                >
                  {sessionsThisWeek}
                  <Text style={styles.progressWeekDim}> of {weekTarget} sessions</Text>
                </Text>
                <Text style={styles.showingUpBody}>{showingUpBody}</Text>
              </View>
              <MiniRing value={sessionsThisWeek} total={weekTarget} size={80} />
            </View>
            <View style={styles.showingUpDays}>
              {DAY_LABELS.map((label, i) => {
                const done = weekDoneFlags[i];
                const scheduled = weekSchedule.includes(i);
                const skipped = scheduled && !done && i < todayIdx;
                const planned = scheduled && !done && i >= todayIdx;
                return (
                  <View
                    key={i}
                    style={[
                      styles.showingUpDay,
                      planned && styles.showingUpDayPlanned,
                      skipped && styles.showingUpDaySkipped,
                      done && styles.showingUpDayDone,
                    ]}
                  >
                    <Text
                      style={[
                        styles.showingUpDayLabel,
                        planned && styles.showingUpDayLabelPlanned,
                        skipped && styles.showingUpDayLabelSkipped,
                        done && styles.showingUpDayLabelDone,
                      ]}
                    >
                      {label.charAt(0)}
                    </Text>
                  </View>
                );
              })}
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                <Text style={styles.legendText}>Done</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendDotPlanned]} />
                <Text style={styles.legendText}>Planned</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, styles.legendDotMissed]} />
                <Text style={styles.legendText}>Missed</Text>
              </View>
            </View>
          </View>
        )}

        {/* Pain Trend */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={[styles.cardTitle, { marginBottom: 0 }]}>Pain trend</Text>
            <View style={styles.rangeRow}>
              {(['2w', '1m', '3m'] as const).map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.rangePill, painRange === r && styles.rangePillActive]}
                  onPress={() => {
                    hapticSelection();
                    setPainRange(r);
                    progressRangeChanged({ chart: 'pain', range_days: RANGE_DAYS[r] });
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
                key={painRange}
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
                extrapolateMissingValues={false}
                yAxisTextStyle={{ fontSize: 10, color: colors.textSecondary }}
                xAxisLabelTextStyle={{ fontSize: 10, color: colors.textSecondary }}
                xAxisLabelsHeight={22}
                labelsExtraHeight={4}
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

        {/* Activity */}
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
                    progressRangeChanged({ chart: 'activity', range_days: RANGE_DAYS[r] });
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
              <BarChart
                key={activityRange}
                data={activityChartData}
                width={ACTIVITY_CHART_W}
                height={128}
                barWidth={activityLayout.barWidth}
                spacing={activityLayout.spacing}
                initialSpacing={activityLayout.initialSpacing}
                endSpacing={8}
                roundedTop
                noOfSections={activityMaxValue <= 4 ? activityMaxValue : 4}
                maxValue={activityMaxValue}
                frontColor={colors.primary}
                disableScroll={activityLayout.fitsWithoutScroll}
                scrollToEnd={!activityLayout.fitsWithoutScroll && !activityHasFuture}
                scrollToIndex={
                  !activityLayout.fitsWithoutScroll && activityHasFuture && activityCurrentIndex >= 0
                    ? activityCurrentIndex
                    : undefined
                }
                scrollAnimation={false}
                showScrollIndicator={false}
                formatYLabel={(label) => String(Math.round(Number(label)))}
                yAxisTextStyle={{ fontSize: 10, color: colors.textSecondary }}
                xAxisLabelTextStyle={{ fontSize: 10, color: colors.textSecondary }}
                xAxisLabelsHeight={22}
                labelsExtraHeight={4}
                xAxisTextNumberOfLines={1}
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
      </ScrollView>
    </TabFadeWrapper>
  );
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
    fontSize: 17,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 16,
    letterSpacing: -0.1,
  },
  programBlock: {
    marginBottom: 24,
  },
  pathWrap: {
    marginTop: 18,
    height: PATH_H + 20,
  },
  pathLabels: {
    position: 'absolute',
    top: PATH_H + 2,
    left: 0,
    right: 0,
    height: 18,
  },
  pathLabel: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  pathLabelStart: {
    left: 0,
  },
  pathLabelEnd: {
    right: 0,
    textAlign: 'right',
  },
  pathLabelHere: {
    color: colors.secondary,
  },
  pathLabelDone: {
    color: colors.primary,
  },
  kicker: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 4,
  },
  heroFigure: {
    fontFamily: serifFont,
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.6,
    marginBottom: 4,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 12,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 4,
  },
  rangePill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
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
  legendDotPlanned: {
    backgroundColor: colors.primaryMuted,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  legendDotMissed: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendText: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  programProgressWeekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  programProgressCopy: {
    flex: 1,
  },
  progressWeek: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
    fontVariant: ['tabular-nums'],
  },
  progressWeekDim: {
    fontSize: 20,
    fontWeight: '400',
    color: colors.textSecondary,
  },
  estimatedEnd: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  weeksToGo: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.primary,
  },
  showingUpBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.primary,
    marginTop: 2,
  },
  showingUpDays: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  showingUpDay: {
    width: 34,
    height: 34,
    borderRadius: radius.circle,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  showingUpDayPlanned: {
    backgroundColor: colors.primaryMuted,
    borderColor: colors.primary,
  },
  showingUpDaySkipped: {
    backgroundColor: colors.background,
    borderColor: colors.border,
  },
  showingUpDayDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  showingUpDayLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  showingUpDayLabelPlanned: {
    color: colors.primary,
  },
  showingUpDayLabelSkipped: {
    color: colors.textTertiary,
  },
  showingUpDayLabelDone: {
    color: '#FFFFFF',
  },
  petGrowthText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textSecondary,
    marginTop: 12,
  },
  petBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.borderLight,
    overflow: 'hidden',
    marginTop: 10,
  },
  petBarFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  skeletonBlock: {
    marginBottom: 16,
  },
});
