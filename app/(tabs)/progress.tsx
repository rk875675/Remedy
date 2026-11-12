import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import Svg, { Circle, Path } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { type } from '../../constants/typography';
import { hapticSelection } from '../../lib/haptics';
import { TabFadeWrapper } from '../../components/ui/TabFadeWrapper';
import { Skeleton } from '../../components/ui/Skeleton';
import { MiniRing } from '../../components/ui/MiniRing';
import { progressRangeChanged } from '../../lib/analytics/events/engagement';
import { PetStageStrip } from '../../components/pet/PetStageStrip';
import { PET_STAGE_SCALE, petImage, type PetStage } from '../../constants/petImages';
import { petGrowthCopy, stageProgress, type PetState } from '../../lib/pet';
import { fetchPetState } from '../../lib/petApi';
import { useReduceMotion } from '../../lib/useReduceMotion';
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
const PET_ON_NODE = 46;
// The highest node is 6px above PATH_MID. The tallest pet is PET_ON_NODE and
// stands with its bottom on that point, plus 8px of air so it is not clipped.
const PATH_PET_PAD = PET_ON_NODE - (PATH_MID - 6) + 8;
const JOURNEY_TRACK_W = 180;
const STAGE_SLOT = 52;
const PATH_LINE = 'rgba(255, 255, 255, 0.35)';

// The program as a route: one stop per week on a gently rolling line.
// Covered ground is solid, what's ahead is dashed, and the pet stands on today.
function ProgramPath({
  weeks,
  currentWeek,
  complete,
  finishLabel,
  pet,
}: {
  weeks: number;
  currentWeek: number;
  complete: boolean;
  finishLabel: string;
  pet: PetState | null;
}) {
  const [width, setWidth] = useState(0);
  const reduceMotion = useReduceMotion();
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
  const here =
    !complete && currentIdx >= 0 && currentIdx < stops.length
      ? stops[currentIdx]
      : undefined;

  // The walk: each time the tab is opened the covered route draws itself and
  // the pet hops along it, week by week, to where it is now. `walk` runs 0..1
  // over the covered segments; it is JS-driven because SVG props are.
  const segments = Math.max(0, currentIdx);
  const walk = useRef(new Animated.Value(0)).current;
  const land = useRef(new Animated.Value(0)).current;
  const [focusRun, setFocusRun] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setFocusRun((n) => n + 1);
    }, []),
  );
  useEffect(() => {
    if (width <= 0 || reduceMotion === null) return;
    land.setValue(0);
    if (reduceMotion || segments === 0) {
      walk.setValue(1);
      return;
    }
    walk.setValue(0);
    const anim = Animated.sequence([
      Animated.delay(250),
      Animated.timing(walk, {
        toValue: 1,
        duration: Math.min(2200, 520 * segments + 300),
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: false,
      }),
    ]);
    anim.start(({ finished }) => {
      if (!finished || !here) return;
      // Arriving: a little squash and spring (inner view, native driven).
      Animated.sequence([
        Animated.timing(land, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.spring(land, { toValue: 0, speed: 16, bounciness: 14, useNativeDriver: true }),
      ]).start();
    });
    return () => anim.stop();
    // `here` only matters for the landing; the walk restarts on layout, tab focus and week change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, reduceMotion, segments, focusRun, currentWeek, complete]);

  const walkLook = useMemo(() => {
    const pts = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = (b.x - a.x) / 2;
      return (u: number) => {
        const m = 1 - u;
        const x = m ** 3 * a.x + 3 * m * m * u * (a.x + dx) + 3 * m * u * u * (b.x - dx) + u ** 3 * b.x;
        const y = m ** 3 * a.y + 3 * m * m * u * a.y + 3 * m * u * u * b.y + u ** 3 * b.y;
        return { x, y };
      };
    };
    const reveal = Array.from({ length: segments }, (_, i) => {
      const a = stops[i];
      const b = stops[i + 1];
      const len = a && b ? Math.hypot(b.x - a.x, b.y - a.y) * 1.12 + 4 : 0;
      const drawn = walk.interpolate({
        inputRange: [i / segments, (i + 1) / segments],
        outputRange: [len, 0],
        extrapolate: 'clamp',
      });
      return { len, drawn };
    });
    // The pet's route, sampled along the curves with a little hop each week.
    const inputRange: number[] = [];
    const xs: number[] = [];
    const ys: number[] = [];
    const per = 10;
    for (let i = 0; i < segments; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (!a || !b) continue;
      const at = pts(a, b);
      for (let k = 0; k <= per; k++) {
        if (i > 0 && k === 0) continue;
        const u = k / per;
        const p = at(u);
        inputRange.push((i + u) / segments);
        xs.push(p.x - b.x);
        ys.push(p.y - b.y - Math.sin(u * Math.PI) * 9);
      }
    }
    const route =
      inputRange.length > 1
        ? {
            x: walk.interpolate({ inputRange, outputRange: xs }),
            y: walk.interpolate({ inputRange, outputRange: ys }),
          }
        : null;
    return { reveal, route };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walk, segments, width, weeks]);

  return (
    <View
      style={styles.pathWrap}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityLabel={
        complete ? 'Program complete' : `Week ${currentWeek} of ${weeks}`
      }
    >
      <View style={styles.pathShift}>
        {width > 0 ? (
            <Svg width={width} height={PATH_H}>
              {stops.slice(0, -1).map((a, i) => {
                const b = stops[i + 1]!;
                const dx = (b.x - a.x) / 2;
                const walked = b.reached;
                const drawing = walkLook.reveal[i];
                if (walked && drawing) {
                  return (
                    <AnimatedPath
                      key={`seg-${i}`}
                      d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`}
                      fill="none"
                      strokeLinecap="round"
                      stroke={PATH_LINE}
                      strokeWidth={3}
                      strokeDasharray={[drawing.len, drawing.len]}
                      strokeDashoffset={drawing.drawn}
                    />
                  );
                }
                return (
                  <Path
                    key={`seg-${i}`}
                    d={`M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`}
                    fill="none"
                    strokeLinecap="round"
                    stroke={PATH_LINE}
                    strokeWidth={walked ? 3 : 2}
                    strokeDasharray={walked ? undefined : '1 7'}
                  />
                );
              })}
              {stops.map((s, i) => {
                if (s.current) {
                  if (!pet) {
                    return (
                      <Circle
                        key={`stop-${i}`}
                        cx={s.x}
                        cy={s.y}
                        r={6.5}
                        fill={colors.background}
                      />
                    );
                  }
                  return null;
                }
                if (s.reached) {
                  const isEnd = complete && i === lastIdx;
                  return (
                    <React.Fragment key={`stop-${i}`}>
                      {isEnd ? (
                        <Circle cx={s.x} cy={s.y} r={15} fill="#FFFFFF" fillOpacity={0.2} />
                      ) : null}
                      <Circle cx={s.x} cy={s.y} r={6.5} fill={colors.background} />
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
                    fill={PATH_LINE}
                    stroke={PATH_LINE}
                    strokeWidth={2}
                  />
                );
              })}
            </Svg>
        ) : null}
      </View>
      {width > 0 ? (
        <View style={styles.pathLabels}>
          {currentIdx !== 0 ? (
            <Text style={[styles.pathLabel, styles.pathLabelStart]}>Start</Text>
          ) : null}
          {currentIdx !== lastIdx ? (
            <Text style={[styles.pathLabel, styles.pathLabelEnd]}>{finishLabel}</Text>
          ) : null}
          {complete ? (
            <Text
              style={[
                styles.pathLabel,
                currentIdx === 0
                  ? styles.pathLabelStart
                  : currentIdx === lastIdx
                  ? styles.pathLabelEnd
                  : { left: (stops[currentIdx]?.x ?? 0) - 45, width: 90, textAlign: 'center' as const },
              ]}
            >
              Finished
            </Text>
          ) : null}
        </View>
      ) : null}
      {width > 0 && pet && here ? (
        <NodePet x={here.x} y={here.y} stage={pet.stage} route={walkLook.route} land={land} />
      ) : null}
    </View>
  );
}

const AnimatedPath = Animated.createAnimatedComponent(Path);

function NodePet({
  x,
  y,
  stage,
  route,
  land,
}: {
  x: number;
  y: number;
  stage: PetStage;
  route: { x: Animated.AnimatedInterpolation<number>; y: Animated.AnimatedInterpolation<number> } | null;
  land: Animated.Value;
}) {
  const drawn = PET_ON_NODE * PET_STAGE_SCALE[stage];
  const shadowW = drawn * 0.55;
  const shadowH = Math.max(4, drawn * 0.08);
  const squash = useMemo(
    () => ({
      transform: [
        { translateY: land.interpolate({ inputRange: [0, 1], outputRange: [0, drawn * 0.1] }) },
        { scaleX: land.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) },
        { scaleY: land.interpolate({ inputRange: [0, 1], outputRange: [1, 0.8] }) },
      ],
    }),
    [land, drawn],
  );
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x - drawn / 2,
        top: PATH_PET_PAD + y - drawn,
        width: drawn,
        height: drawn + shadowH / 2,
        overflow: 'visible',
        transform: route ? [{ translateX: route.x }, { translateY: route.y }] : [],
      }}
    >
      <View
        style={{
          position: 'absolute',
          left: (drawn - shadowW) / 2,
          top: drawn - shadowH / 2,
          width: shadowW,
          height: shadowH,
          borderRadius: shadowW / 2,
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
        }}
      />
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, width: drawn, height: drawn }, squash]}>
        <Image
          source={petImage(stage, 'idle')}
          resizeMode="contain"
          accessible={false}
          style={{ width: drawn, height: drawn }}
        />
      </Animated.View>
    </Animated.View>
  );
}

function JourneyFrame({
  topInset,
  children,
}: {
  topInset: number;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.journeyBleed}>
      {/* Keeps the pull-down area green instead of showing the page background. */}
      <View pointerEvents="none" style={styles.journeyOverscroll} />
      <View style={[styles.journeyPanel, { paddingTop: topInset + 16 }]}>
        {children}
      </View>
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
        <View style={styles.container}>
          <JourneyFrame topInset={insets.top}>
            <Text style={styles.journeyLabel}>PROGRESS</Text>
          </JourneyFrame>
          <Skeleton height={180} borderRadius={radius.card} style={styles.skeletonBlock} />
          <Skeleton height={100} borderRadius={radius.card} style={styles.skeletonBlock} />
          <Skeleton height={180} borderRadius={radius.card} style={styles.skeletonBlock} />
        </View>
      </TabFadeWrapper>
    );
  }

  const petName = pet?.name ?? PET_FALLBACK_NAME;

  return (
    <TabFadeWrapper>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <JourneyFrame topInset={insets.top}>
          <Text style={styles.journeyLabel}>PROGRESS</Text>
          <Text style={styles.journeyHeadline}>
            {userProgram
              ? isProgramComplete
                ? 'Complete'
                : `Week ${programWeek}`
              : pet
                ? petName
                : 'Progress'}
            {userProgram && !isProgramComplete ? (
              <Text style={styles.journeyHeadlineDim}> of {durationWeeks}</Text>
            ) : null}
          </Text>
          {userProgram ? (
            <Text style={styles.journeySub}>
              {isProgramComplete
                ? 'You finished your program!'
                : weeksRemaining > 0
                ? `${weeksRemaining} week${weeksRemaining !== 1 ? 's' : ''} to go`
                : 'Final week'}
              {estimatedEnd ? `  ·  Est. finish ${estimatedEnd}` : null}
            </Text>
          ) : null}
          {userProgram ? (
            <ProgramPath
              weeks={durationWeeks}
              currentWeek={programWeek}
              complete={isProgramComplete}
              finishLabel={`Week ${durationWeeks}`}
              pet={pet}
            />
          ) : null}
          {pet ? (
            <View style={styles.growthPillWrap}>
              <View style={styles.growthPill}>
                <Text style={styles.growthPillText}>{petGrowthCopy(pet)}</Text>
                {pet.stage < 5 ? (
                  <View style={styles.growthTrack}>
                    <View
                      style={[
                        styles.growthTrackFill,
                        { width: JOURNEY_TRACK_W * stageProgress(pet) },
                      ]}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </JourneyFrame>

        {pet ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{petName}</Text>
            <PetStageStrip stage={pet.stage} size={STAGE_SLOT} />
            <View style={styles.thresholdRow}>
              {pet.thresholds.map((sessions, index) => (
                <View key={index} style={styles.thresholdSlot}>
                  <Text style={styles.thresholdLabel}>{sessions}</Text>
                </View>
              ))}
            </View>
            <Text style={styles.thresholdUnit}>sessions</Text>
          </View>
        ) : null}

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
  // Full-bleed: cancels the container's horizontal padding.
  journeyBleed: {
    marginHorizontal: -24,
    marginBottom: 20,
  },
  journeyOverscroll: {
    position: 'absolute',
    top: -600,
    left: 0,
    right: 0,
    height: 600,
    backgroundColor: colors.primary,
  },
  journeyPanel: {
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 20,
    overflow: 'visible',
  },
  journeyLabel: {
    ...type.label,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 6,
  },
  journeyHeadline: {
    ...type.title,
    color: '#FFFFFF',
  },
  journeyHeadlineDim: {
    fontSize: 20,
    fontWeight: '400',
    letterSpacing: 0,
    color: 'rgba(255, 255, 255, 0.85)',
  },
  journeySub: {
    ...type.body,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 4,
  },
  pathWrap: {
    marginTop: 18,
    height: PATH_PET_PAD + PATH_H + 20,
    overflow: 'visible',
  },
  pathShift: {
    marginTop: PATH_PET_PAD,
  },
  pathLabels: {
    position: 'absolute',
    top: PATH_PET_PAD + PATH_H + 2,
    left: 0,
    right: 0,
    height: 18,
  },
  pathLabel: {
    position: 'absolute',
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  pathLabelStart: {
    left: 0,
  },
  pathLabelEnd: {
    right: 0,
    textAlign: 'right',
  },
  growthPillWrap: {
    alignItems: 'center',
    marginTop: 16,
  },
  growthPill: {
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: radius.circle,
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'center',
  },
  growthPillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  growthTrack: {
    width: JOURNEY_TRACK_W,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    marginTop: 6,
    overflow: 'hidden',
  },
  growthTrackFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  thresholdRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  thresholdSlot: {
    width: STAGE_SLOT,
    alignItems: 'center',
  },
  thresholdLabel: {
    ...type.metric,
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  thresholdUnit: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 2,
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
  skeletonBlock: {
    marginBottom: 16,
  },
});
