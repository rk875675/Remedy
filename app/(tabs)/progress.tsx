import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  Animated,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import Svg, { Path } from 'react-native-svg';
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
import { PET_STAGE_SCALE } from '../../constants/petImages';
import { Dust, DUST_PALE, easedTimeAt, type DustHandle } from '../../components/pet/Dust';
import { JourneyPet, type JourneyPetHandle } from '../../components/pet/JourneyPet';
import { PET_UNFURL_MS } from '../../components/pet/Pet';
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

// The program as a route. The intro plays once per route per app session.
let journeyPlayedKey: string | null = null;

const ROLL_EASE = Easing.inOut(Easing.quad);
const PAST = 6;
const CURVE_STEPS = 8;
const BALL_DRAWN = PET_ON_NODE * PET_STAGE_SCALE[1];
const BALL_RADIUS = BALL_DRAWN / 2;
const LEAD_MS = 300;

const AnimatedPath = Animated.createAnimatedComponent(Path);

type Pt = { x: number; y: number };
type Sample = { d: number; x: number; y: number };
type Seg = { d: string; dash: number; from: number; to: number };
type Geom = {
  stops: Pt[];
  goal: number;
  length: number;
  turn: number;
  samples: Sample[];
  segments: Seg[];
  ahead: string[];
  pops: { i: number; f: number }[];
  dust: { x: number; f: number }[];
};

type Gate = { alive: boolean; cancel: Array<() => void> };

function makeGate(): Gate {
  return { alive: true, cancel: [] };
}

function shut(gate: Gate) {
  gate.alive = false;
  const fns = gate.cancel.splice(0);
  for (const fn of fns) fn();
}

function wait(ms: number, gate: Gate): Promise<boolean> {
  if (!gate.alive) return Promise.resolve(false);
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(gate.alive), ms);
    gate.cancel.push(() => {
      clearTimeout(id);
      resolve(false);
    });
  });
}

function playAnim(anim: Animated.CompositeAnimation, gate: Gate): Promise<boolean> {
  if (!gate.alive) return Promise.resolve(false);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    gate.cancel.push(() => {
      anim.stop();
      finish(false);
    });
    anim.start(({ finished }) => finish(finished && gate.alive));
  });
}

function routeKey(weeks: number, week: number, complete: boolean): string {
  return complete ? `${weeks}:done` : `${weeks}:${week}`;
}

function curvePoint(a: Pt, b: Pt, u: number): Pt {
  const dx = (b.x - a.x) / 2;
  const m = 1 - u;
  const mm = m * m;
  const uu = u * u;
  return {
    x: mm * m * a.x + 3 * mm * u * (a.x + dx) + 3 * m * uu * (b.x - dx) + uu * u * b.x,
    y: mm * m * a.y + 3 * mm * u * a.y + 3 * m * uu * b.y + uu * u * b.y,
  };
}

function curvePath(a: Pt, b: Pt): string {
  const dx = (b.x - a.x) / 2;
  return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function faceTurn(length: number): number {
  if (length <= 0) return 0;
  const deg = (length / BALL_RADIUS) * (180 / Math.PI);
  const rem = ((deg % 360) + 360) % 360;
  return rem <= 180 ? -rem : 360 - rem;
}

function pointAt(samples: Sample[], distance: number): Pt {
  const first = samples[0];
  if (!first) return { x: 0, y: 0 };
  if (distance <= first.d) return first;
  for (let i = 1; i < samples.length; i++) {
    const b = samples[i];
    const a = samples[i - 1];
    if (!a || !b) continue;
    if (distance <= b.d) {
      const span = b.d - a.d || 1;
      const u = (distance - a.d) / span;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
  }
  const last = samples[samples.length - 1];
  return last ?? first;
}

function emptyGeom(): Geom {
  return {
    stops: [],
    goal: -1,
    length: 0,
    turn: 0,
    samples: [],
    segments: [],
    ahead: [],
    pops: [],
    dust: [],
  };
}

function buildGeom(width: number, weeks: number, currentWeek: number, complete: boolean): Geom {
  if (width <= 0 || weeks <= 0) return emptyGeom();
  const span = Math.max(0, width - PATH_PAD * 2);
  const stops: Pt[] = Array.from({ length: weeks }, (_, i) => {
    const t = weeks > 1 ? i / (weeks - 1) : 0.5;
    return {
      x: PATH_PAD + span * t,
      y: PATH_MID + Math.sin(t * Math.PI * 2) * 6,
    };
  });
  const rawGoal = complete ? weeks - 1 : currentWeek - 1;
  const goal = Math.max(-1, Math.min(weeks - 1, rawGoal));
  const samples: Sample[] = [];
  const nodeD: number[] = [];
  const rawSeg: { d: string; start: number; end: number }[] = [];
  const ahead: string[] = [];
  const first = stops[0];
  if (!first) return emptyGeom();
  samples.push({ d: 0, x: first.x, y: first.y });
  nodeD.push(0);
  let travelled = 0;

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (!a || !b) continue;
    const path = curvePath(a, b);
    if (i < goal) {
      const start = travelled;
      let prev = a;
      for (let k = 1; k <= CURVE_STEPS; k++) {
        const p = curvePoint(a, b, k / CURVE_STEPS);
        travelled += Math.hypot(p.x - prev.x, p.y - prev.y);
        const last = samples[samples.length - 1];
        const d = last && travelled <= last.d ? last.d + 0.001 : travelled;
        travelled = d;
        samples.push({ d, x: p.x, y: p.y });
        prev = p;
      }
      nodeD.push(travelled);
      rawSeg.push({ d: path, start, end: travelled });
    } else {
      ahead.push(path);
    }
  }

  const length = goal > 0 ? (nodeD[goal] ?? 0) : 0;
  if (length > 0) {
    const end = stops[goal];
    if (end) samples.push({ d: length + PAST, x: end.x + PAST, y: end.y });
  }

  const segments: Seg[] = rawSeg.map((seg, index) => {
    let from = length > 0 ? seg.start / length : 0;
    let to = index === rawSeg.length - 1 ? 1 : length > 0 ? seg.end / length : 1;
    if (from < 0) from = 0;
    if (from >= 1) from = 0.999;
    if (to > 1) to = 1;
    if (to <= from) to = Math.min(1, from + 0.0001);
    const len = Math.max(1, seg.end - seg.start);
    return { d: seg.d, dash: len + 1, from, to };
  });

  const pops: { i: number; f: number }[] = [];
  if (length > 0 && goal > 0) {
    for (let i = 0; i <= goal; i++) {
      const d = nodeD[i] ?? 0;
      pops.push({ i, f: i === goal ? 1 : Math.min(1, d / length) });
    }
  }

  const dust: { x: number; f: number }[] = [];
  if (length > 36) {
    for (let d = 28; d < length - 8 && dust.length < 8; d += 42) {
      dust.push({ x: pointAt(samples, d).x, f: d / length });
    }
  }

  return { stops, goal, length, turn: faceTurn(length), samples, segments, ahead, pops, dust };
}

function JourneyRoute({
  weeks,
  currentWeek,
  complete,
  finishLabel,
  pet,
  petSettled,
}: {
  weeks: number;
  currentWeek: number;
  complete: boolean;
  finishLabel: string;
  pet: PetState | null;
  /** The pet lookup has answered (with or without a pet), so the intro can start. */
  petSettled: boolean;
}) {
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const keyNow = routeKey(weeks, currentWeek, complete);
  const settleFirst = reduceMotion === true || journeyPlayedKey === keyNow;
  const [curled, setCurled] = useState(!settleFirst);
  const [poseEpoch, setPoseEpoch] = useState(0);
  const [live, setLive] = useState(false);
  const [settledStamp, setSettledStamp] = useState(0);

  const dist = useRef(new Animated.Value(0)).current;
  const line = useRef(new Animated.Value(0)).current;
  const unwind = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const pill = useRef(new Animated.Value(1)).current;
  const scalesRef = useRef<Animated.Value[]>([]);
  const ripplesRef = useRef<Animated.Value[]>([]);
  while (scalesRef.current.length < weeks) {
    scalesRef.current.push(new Animated.Value(0));
    ripplesRef.current.push(new Animated.Value(0));
  }

  const geom = useMemo(
    () => buildGeom(width, weeks, currentWeek, complete),
    [width, weeks, currentWeek, complete],
  );
  const geomRef = useRef(geom);
  geomRef.current = geom;
  const petDataRef = useRef(pet);
  petDataRef.current = pet;
  const progressRef = useRef(0);
  progressRef.current = pet ? stageProgress(pet) : 0;
  const petRef = useRef<JourneyPetHandle | null>(null);
  const dustRef = useRef<DustHandle>(null);
  const curledRef = useRef(!settleFirst);
  const openingRef = useRef(false);
  const settledRef = useRef(false);
  const focusedRef = useRef(false);
  const hoppingRef = useRef(false);
  const mounted = useRef(true);
  const runRef = useRef(0);
  const sigRef = useRef<string | null>(null);

  const ready = width > 0 && reduceMotion !== null && petSettled;
  const focusSig = `${ready ? 1 : 0}|${reduceMotion === null ? 'n' : reduceMotion ? '1' : '0'}|${weeks}|${currentWeek}|${complete ? 1 : 0}`;

  const motion = useMemo(() => {
    if (complete || geom.goal < 0 || geom.length <= 0 || geom.samples.length < 2) return null;
    const anchor = geom.stops[geom.goal];
    if (!anchor) return null;
    const inputRange = geom.samples.map((s) => s.d);
    for (let i = 1; i < inputRange.length; i++) {
      if ((inputRange[i] ?? 0) <= (inputRange[i - 1] ?? 0)) return null;
    }
    const rollDeg = dist.interpolate({
      inputRange,
      outputRange: geom.samples.map((s) => (s.d / BALL_RADIUS) * (180 / Math.PI)),
      extrapolate: 'clamp',
    });
    return {
      x: dist.interpolate({
        inputRange,
        outputRange: geom.samples.map((s) => s.x - anchor.x),
        extrapolate: 'clamp',
      }),
      y: dist.interpolate({
        inputRange,
        outputRange: geom.samples.map((s) => s.y - anchor.y),
        extrapolate: 'clamp',
      }),
      spin: Animated.add(rollDeg, unwind).interpolate({
        inputRange: [-8000, 8000],
        outputRange: ['-8000deg', '8000deg'],
        extrapolate: 'clamp',
      }),
    };
  }, [geom, complete, dist, unwind]);

  const reveal = useMemo(
    () =>
      geom.segments.map((seg) => ({
        d: seg.d,
        dash: seg.dash,
        offset: line.interpolate({
          inputRange: [seg.from, seg.to],
          outputRange: [seg.dash, 0],
          extrapolate: 'clamp',
        }),
      })),
    [geom, line],
  );

  const nodeLooks = useMemo(
    () =>
      Array.from({ length: weeks }, (_, i) => {
        const ripple = ripplesRef.current[i];
        if (!ripple) return null;
        return {
          ringScale: ripple.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 2.6],
            extrapolate: 'clamp',
          }),
          ringOpacity: ripple.interpolate({
            inputRange: [0, 0.12, 1],
            outputRange: [0, 0.7, 0],
            extrapolate: 'clamp',
          }),
        };
      }),
    [weeks],
  );

  const barX = useMemo(
    () =>
      bar.interpolate({
        inputRange: [0, 1],
        outputRange: [-JOURNEY_TRACK_W, 0],
        extrapolate: 'clamp',
      }),
    [bar],
  );

  const paintNodes = useCallback((filledCount: number) => {
    for (let i = 0; i < scalesRef.current.length; i++) {
      scalesRef.current[i]?.setValue(i < filledCount ? 1 : 0);
      ripplesRef.current[i]?.setValue(0);
    }
  }, []);

  const showBallNow = useCallback(() => {
    dist.setValue(0);
    line.setValue(0);
    unwind.setValue(0);
    bar.setValue(0);
    pill.setValue(1);
    paintNodes(0);
    petRef.current?.stop();
    openingRef.current = false;
    settledRef.current = false;
    if (!curledRef.current) setPoseEpoch((n) => n + 1);
    curledRef.current = true;
    setCurled(true);
    setLive(false);
  }, [dist, line, unwind, bar, pill, paintNodes]);

  const showFinalNow = useCallback(() => {
    const g = geomRef.current;
    dist.setValue(g.length);
    line.setValue(1);
    unwind.setValue(g.turn);
    bar.setValue(progressRef.current);
    pill.setValue(1);
    paintNodes(g.goal >= 0 ? g.goal + 1 : 0);
    petRef.current?.stop();
    const stage = petDataRef.current?.stage ?? 1;
    if ((curledRef.current && stage > 1) || openingRef.current) setPoseEpoch((n) => n + 1);
    openingRef.current = false;
    curledRef.current = false;
    setCurled(false);
    setLive(false);
    settledRef.current = true;
  }, [dist, line, unwind, bar, pill, paintNodes]);

  useLayoutEffect(() => {
    if (sigRef.current !== focusSig) {
      if (sigRef.current !== null) runRef.current += 1;
      sigRef.current = focusSig;
    }
    if (!ready || reduceMotion === null) return;
    const key = routeKey(weeks, currentWeek, complete);
    const full = reduceMotion === false && journeyPlayedKey !== key;
    if (!full) {
      journeyPlayedKey = key;
      showFinalNow();
      return;
    }
    showBallNow();
  }, [focusSig, ready, reduceMotion, weeks, currentWeek, complete, showFinalNow, showBallNow]);

  useLayoutEffect(() => {
    if (width <= 0 || !settledRef.current) return;
    const g = geomRef.current;
    dist.setValue(g.length);
    line.setValue(1);
    unwind.setValue(g.turn);
  }, [width, weeks, currentWeek, complete, dist, line, unwind]);

  useFocusEffect(
    useCallback(() => {
      const my = runRef.current;
      if (!ready || reduceMotion === null) return;
      const key = routeKey(weeks, currentWeek, complete);
      const full = reduceMotion === false && journeyPlayedKey !== key;
      const gate = makeGate();
      focusedRef.current = true;

      const alive = () => gate.alive && my === runRef.current && mounted.current;

      if (!full) {
        // Stop ran in the previous cleanup and can leave a value mid-way.
        showFinalNow();
        void (async () => {
          hoppingRef.current = true;
          const actor = petRef.current;
          if (reduceMotion === true || complete || !actor || !petDataRef.current) {
            hoppingRef.current = false;
            return;
          }
          const ok = await actor.hop(1);
          hoppingRef.current = false;
          if (!ok || !alive()) return;
          setLive(true);
        })();
        return () => {
          focusedRef.current = false;
          hoppingRef.current = false;
          shut(gate);
          petRef.current?.stop();
          if (my === runRef.current && mounted.current) showFinalNow();
        };
      }

      journeyPlayedKey = key;
      showBallNow();

      function popNode(index: number) {
        const scale = scalesRef.current[index];
        const ripple = ripplesRef.current[index];
        if (!scale || !ripple || !gate.alive) return;
        scale.setValue(0);
        ripple.setValue(0);
        const anim = Animated.parallel([
          Animated.sequence([
            Animated.timing(scale, {
              toValue: 1.3,
              duration: 150,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.spring(scale, { toValue: 1, speed: 16, bounciness: 8, useNativeDriver: true }),
          ]),
          Animated.timing(ripple, {
            toValue: 1,
            duration: 540,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]);
        gate.cancel.push(() => anim.stop());
        anim.start();
        hapticSelection();
      }

      void (async () => {
        const led = await wait(LEAD_MS, gate);
        if (!led || !alive()) return;

        let g = geomRef.current;
        let canRoll = g.length > 0 && g.goal > 0;
        if (canRoll && !complete && petRef.current) {
          const leaned = await petRef.current.anticipate();
          if (!leaned || !alive()) return;
          g = geomRef.current;
          canRoll = g.length > 0 && g.goal > 0;
        }

        if (canRoll) {
          const duration = Math.min(2400, Math.round(450 * g.goal));
          for (const pop of g.pops) {
            const delay = Math.round(easedTimeAt(ROLL_EASE, pop.f) * duration);
            const id = setTimeout(() => {
              if (gate.alive) popNode(pop.i);
            }, delay);
            gate.cancel.push(() => clearTimeout(id));
          }
          if (!complete && g.dust.length > 0) {
            dustRef.current?.play(
              g.dust.map((spot) => ({
                x: spot.x,
                delay: Math.round(easedTimeAt(ROLL_EASE, spot.f) * duration),
                size: 9,
              })),
            );
          }
          const rolled = await playAnim(
            Animated.parallel([
              Animated.timing(dist, {
                toValue: g.length,
                duration,
                easing: ROLL_EASE,
                useNativeDriver: true,
              }),
              Animated.timing(line, {
                toValue: 1,
                duration,
                easing: ROLL_EASE,
                useNativeDriver: false,
              }),
            ]),
            gate,
          );
          if (!rolled || !alive()) return;

          if (!complete && petRef.current) {
            const past = await playAnim(
              Animated.timing(dist, {
                toValue: g.length + PAST,
                duration: 200,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              gate,
            );
            if (!past || !alive()) return;
            const back = await playAnim(
              Animated.timing(dist, {
                toValue: g.length,
                duration: 250,
                easing: Easing.inOut(Easing.quad),
                useNativeDriver: true,
              }),
              gate,
            );
            if (!back || !alive()) return;
            if (Math.abs(g.turn) > 4) {
              const spun = await playAnim(
                Animated.timing(unwind, {
                  toValue: g.turn,
                  duration: Math.round(Math.min(280, 120 + Math.abs(g.turn) * 0.7)),
                  easing: Easing.out(Easing.quad),
                  useNativeDriver: true,
                }),
                gate,
              );
              if (!spun || !alive()) return;
            }
            const rocked = await petRef.current.rock();
            if (!rocked || !alive()) return;
          }
        } else if (g.goal >= 0 && !complete) {
          scalesRef.current[g.goal]?.setValue(1);
        } else if (g.goal >= 0 && complete) {
          popNode(g.goal);
        }

        const actor = !complete ? petRef.current : null;
        const stage = petDataRef.current?.stage ?? 1;
        if (actor && petDataRef.current) {
          openingRef.current = stage > 1;
          curledRef.current = false;
          if (mounted.current) setCurled(false);
          if (stage > 1) {
            const opened = await wait(PET_UNFURL_MS, gate);
            openingRef.current = false;
            if (!opened || !alive()) return;
          }
          const hopped = await actor.hop(1);
          if (!hopped || !alive()) return;
        } else if (canRoll) {
          const paused = await wait(180, gate);
          if (!paused || !alive()) return;
        }

        if (!actor) {
          // No pet yet (it may arrive later): never leave the ball curled.
          curledRef.current = false;
          if (mounted.current) setCurled(false);
        }

        const grown = petDataRef.current;
        if (grown && alive()) {
          if (grown.stage < 5) {
            const filled = await playAnim(
              Animated.timing(bar, {
                toValue: stageProgress(grown),
                duration: 700,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
              gate,
            );
            if (!filled || !alive()) return;
          }
          const pulsed = await playAnim(
            Animated.sequence([
              Animated.timing(pill, {
                toValue: 1.045,
                duration: 160,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.spring(pill, { toValue: 1, speed: 14, bounciness: 6, useNativeDriver: true }),
            ]),
            gate,
          );
          if (!pulsed || !alive()) return;
        }

        if (!alive()) return;
        settledRef.current = true;
        setSettledStamp((n) => n + 1);
      })();

      return () => {
        focusedRef.current = false;
        hoppingRef.current = false;
        shut(gate);
        petRef.current?.stop();
        if (my === runRef.current && mounted.current) showFinalNow();
      };
    }, [ready, reduceMotion, weeks, currentWeek, complete, showBallNow, showFinalNow, dist, line, unwind, bar, pill]),
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!pet || !settledRef.current || hoppingRef.current) return;
    bar.setValue(stageProgress(pet));
    if (!focusedRef.current || reduceMotion !== false || complete) return;
    setLive(true);
  }, [pet, complete, reduceMotion, settledStamp, bar]);

  const stops = geom.stops;
  const currentIdx = geom.goal;
  const lastIdx = stops.length - 1;
  const here =
    !complete && currentIdx >= 0 && currentIdx < stops.length ? stops[currentIdx] : undefined;

  return (
    <>
      <View
        style={styles.pathWrap}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        accessibilityLabel={complete ? 'Program complete' : `Week ${currentWeek} of ${weeks}`}
      >
        <View style={styles.pathShift}>
          {width > 0 ? (
            <Svg width={width} height={PATH_H}>
              {reveal.map((seg, i) => (
                <AnimatedPath
                  key={`seg-${i}`}
                  d={seg.d}
                  fill="none"
                  stroke={PATH_LINE}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={[seg.dash, seg.dash]}
                  strokeDashoffset={seg.offset}
                />
              ))}
              {geom.ahead.map((d, i) => (
                <Path
                  key={`ahead-${i}`}
                  d={d}
                  fill="none"
                  stroke={PATH_LINE}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeDasharray="1 7"
                />
              ))}
            </Svg>
          ) : null}
        </View>
        {width > 0
          ? stops.map((s, i) => {
              const reached = currentIdx >= 0 && i <= currentIdx;
              const look = nodeLooks[i];
              const end = complete && i === lastIdx;
              const plain = !complete && !pet && i === currentIdx;
              const scale = scalesRef.current[i];
              return (
                <View
                  key={`node-${i}`}
                  pointerEvents="none"
                  style={[styles.nodeSpot, { left: s.x - 16, top: PATH_PET_PAD + s.y - 16 }]}
                >
                  <View style={styles.nodeAhead} />
                  {reached && look && scale ? (
                    <>
                      <Animated.View
                        style={[
                          styles.nodeRing,
                          { opacity: look.ringOpacity, transform: [{ scale: look.ringScale }] },
                        ]}
                      />
                      <Animated.View style={[styles.nodeFill, { transform: [{ scale }] }]}>
                        {end ? <View style={styles.nodeHalo} /> : null}
                        <View style={styles.nodeDisk}>{plain ? null : <View style={styles.nodeDot} />}</View>
                      </Animated.View>
                    </>
                  ) : null}
                </View>
              );
            })
          : null}
        {width > 0 ? (
          <View pointerEvents="none" style={styles.dustLane}>
            <Dust ref={dustRef} color={DUST_PALE} />
          </View>
        ) : null}
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
          <Animated.View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: here.x - PET_ON_NODE / 2,
              top: PATH_PET_PAD + here.y - PET_ON_NODE,
              width: PET_ON_NODE,
              height: PET_ON_NODE,
              transform: motion ? [{ translateX: motion.x }, { translateY: motion.y }] : undefined,
            }}
          >
            <JourneyPet
              ref={petRef}
              stage={pet.stage}
              curled={curled}
              poseKey={poseEpoch}
              roll={motion?.spin ?? null}
              live={live}
              size={PET_ON_NODE}
            />
          </Animated.View>
        ) : null}
      </View>
      {pet ? (
        <View style={styles.growthPillWrap}>
          <Animated.View style={[styles.growthPill, { transform: [{ scale: pill }] }]}>
            <Text style={styles.growthPillText}>{petGrowthCopy(pet)}</Text>
            {pet.stage < 5 ? (
              <View style={styles.growthTrack}>
                <Animated.View
                  style={[
                    styles.growthTrackFill,
                    { width: JOURNEY_TRACK_W, transform: [{ translateX: barX }] },
                  ]}
                />
              </View>
            ) : null}
          </Animated.View>
        </View>
      ) : null}
    </>
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
  const [petSettled, setPetSettled] = useState(false);

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
      setPetSettled(true);
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
            <JourneyRoute
              weeks={durationWeeks}
              currentWeek={programWeek}
              complete={isProgramComplete}
              finishLabel={`Week ${durationWeeks}`}
              pet={pet}
              petSettled={petSettled}
            />
          ) : pet ? (
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
  dustLane: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: PATH_PET_PAD + PATH_MID - 14,
    height: 14,
  },
  nodeSpot: {
    position: 'absolute',
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeAhead: {
    position: 'absolute',
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: PATH_LINE,
    left: 9.5,
    top: 9.5,
  },
  nodeRing: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    left: 7,
    top: 7,
  },
  nodeFill: {
    position: 'absolute',
    width: 30,
    height: 30,
    left: 1,
    top: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeHalo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  nodeDisk: {
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.surface,
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
