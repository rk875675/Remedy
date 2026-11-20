import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LineChart, BarChart } from 'react-native-gifted-charts';
import LinearGradient from 'react-native-linear-gradient';
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
import { Dust, DUST_EARTH, easedTimeAt, type DustHandle } from '../../components/pet/Dust';
import { MeadowStage } from '../../components/onboarding/coldopen/MeadowStage';
import { useDaySky, type DaySky } from '../../lib/daySky';
import { JourneyPet, type JourneyPetHandle } from '../../components/pet/JourneyPet';
import { PET_UNFURL_MS } from '../../components/pet/Pet';
import { petGrowthCopy, stageProgress, type PetState } from '../../lib/pet';
import { fetchPetState } from '../../lib/petApi';
import { useNamedPet } from '../../lib/petNameCache';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { PET_FALLBACK_NAME } from '../../constants/petLines';
import type { UserProgram } from '../../types/database';
import {
  computePainChart,
  computeActivityChart,
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
import { shouldSkipTabRefresh, beginTabRefresh, finishTabRefresh, failTabRefresh, invalidateTabRefresh } from '../../lib/tabRefresh';
import { computeDefaultWorkoutDays, activeWorkoutDaysThisWeek, todayDayIndex } from '../../lib/workoutDays';
import { STORAGE_WORKOUT_DAYS, STORAGE_WORKOUT_DAYS_SINCE, DAY_LABELS } from '../../components/progress/WorkoutDaysModal';

const PAIN_Y_AXIS_W = 36;
const DECK_GAP = 12;
const DECK_PEEK = 32;

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

const TRAIL_DROP = 22;
const PATH_H = 64;
const PATH_MID = 22;
const PATH_PAD = 18;
const PET_ON_NODE = 78;
// Highest in the middle, so the marks sit on the hill. The pet stands on the current one.
const PATH_PET_PAD = PET_ON_NODE - PATH_MID + 12;
const JOURNEY_TRACK_W = 180;
const STAGE_SLOT = 52;

// The program as a route. The intro plays once per route per app session.
let journeyPlayedKey: string | null = null;

const ROLL_EASE = Easing.inOut(Easing.quad);
const PAST = 6;
const CURVE_STEPS = 8;
const BALL_DRAWN = PET_ON_NODE * PET_STAGE_SCALE[1];
const BALL_RADIUS = BALL_DRAWN / 2;
const LEAD_MS = 300;

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
  road: string;
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

/** The crown of the hill: highest in the middle, lower toward both edges. */
function trailDrop(t: number): number {
  const u = Math.max(-0.96, Math.min(0.96, (t - 0.5) * 1.8));
  return TRAIL_DROP * (1 - Math.sqrt(1 - u * u));
}

function trailAt(t: number, span: number): Pt {
  return {
    x: PATH_PAD + span * t,
    y: PATH_MID + trailDrop(t),
  };
}

function trailTangent(t: number, span: number): Pt {
  const u = Math.max(-0.96, Math.min(0.96, (t - 0.5) * 1.8));
  const slope = (TRAIL_DROP * u) / Math.sqrt(1 - u * u);
  return { x: span, y: slope * 1.8 };
}

function segmentCubic(t0: number, t1: number, span: number): { a: Pt; c1: Pt; c2: Pt; b: Pt } {
  const a = trailAt(t0, span);
  const b = trailAt(t1, span);
  const dt = t1 - t0;
  const m0 = trailTangent(t0, span);
  const m1 = trailTangent(t1, span);
  return {
    a,
    b,
    c1: { x: a.x + (m0.x * dt) / 3, y: a.y + (m0.y * dt) / 3 },
    c2: { x: b.x - (m1.x * dt) / 3, y: b.y - (m1.y * dt) / 3 },
  };
}

function cubicPoint(a: Pt, c1: Pt, c2: Pt, b: Pt, u: number): Pt {
  const m = 1 - u;
  const mm = m * m;
  const uu = u * u;
  return {
    x: mm * m * a.x + 3 * mm * u * c1.x + 3 * m * uu * c2.x + uu * u * b.x,
    y: mm * m * a.y + 3 * mm * u * c1.y + 3 * m * uu * c2.y + uu * u * b.y,
  };
}

function cubicPath(a: Pt, c1: Pt, c2: Pt, b: Pt): string {
  return `M ${a.x} ${a.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${b.x} ${b.y}`;
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
    road: '',
    pops: [],
    dust: [],
  };
}

function buildGeom(width: number, weeks: number, currentWeek: number, complete: boolean): Geom {
  if (width <= 0 || weeks <= 0) return emptyGeom();
  const span = Math.max(0, width - PATH_PAD * 2);
  const stops: Pt[] = Array.from({ length: weeks }, (_, i) => {
    const t = weeks > 1 ? i / (weeks - 1) : 0.5;
    return trailAt(t, span);
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
  let road = `M ${first.x} ${first.y}`;

  for (let i = 0; i < stops.length - 1; i++) {
    const seg = segmentCubic(i / (stops.length - 1), (i + 1) / (stops.length - 1), span);
    const path = cubicPath(seg.a, seg.c1, seg.c2, seg.b);
    road += ` C ${seg.c1.x} ${seg.c1.y}, ${seg.c2.x} ${seg.c2.y}, ${seg.b.x} ${seg.b.y}`;
    if (i < goal) {
      const start = travelled;
      let prev = seg.a;
      for (let k = 1; k <= CURVE_STEPS; k++) {
        const p = cubicPoint(seg.a, seg.c1, seg.c2, seg.b, k / CURVE_STEPS);
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

  return { stops, goal, length, turn: faceTurn(length), samples, segments, ahead, road, pops, dust };
}

function JourneyRoute({
  weeks,
  currentWeek,
  complete,
  startLabel = 'Start',
  finishLabel,
  pet,
  petSettled,
  ends = true,
  onDark = false,
}: {
  weeks: number;
  currentWeek: number;
  complete: boolean;
  startLabel?: string;
  finishLabel: string;
  pet: PetState | null;
  /** The pet lookup has answered (with or without a pet), so the intro can start. */
  petSettled: boolean;
  /** Names at the two ends of the path. */
  ends?: boolean;
  /** Trail drawn on a dark sky. */
  onDark?: boolean;
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
        accessibilityLabel={
          complete
            ? `${Math.max(weeks - 1, 0)} of ${Math.max(weeks - 1, 0)} sessions this week`
            : `${Math.max(currentWeek - 1, 0)} of ${Math.max(weeks - 1, 0)} sessions this week`
        }
      >
        {width > 0
          ? stops.map((s, i) => {
              // The first point is where the week starts. Marks are the sessions themselves.
              if (i === 0) return null;
              const reached = currentIdx >= 0 && i <= currentIdx;
              const look = nodeLooks[i];
              const plain = !complete && i === currentIdx;
              const scale = scalesRef.current[i];
              return (
                <View
                  key={`node-${i}`}
                  pointerEvents="none"
                  style={[styles.nodeSpot, { left: s.x - 16, top: PATH_PET_PAD + s.y - 16 }]}
                >
                  {!plain && !reached ? (
                    <View style={[styles.tickOpen, onDark ? styles.tickOpenOnSky : null]} />
                  ) : null}
                  {reached && (!plain || !pet) && look && scale ? (
                    <>
                      <Animated.View
                        style={[
                          styles.nodeRing,
                          onDark ? styles.nodeRingOnHill : null,
                          { opacity: look.ringOpacity, transform: [{ scale: look.ringScale }] },
                        ]}
                      />
                      <Animated.View
                        style={[
                          styles.tickDone,
                          onDark ? styles.tickDoneOnSky : null,
                          { transform: [{ scale }] },
                        ]}
                      />
                    </>
                  ) : null}
                </View>
              );
            })
          : null}
        {width > 0 ? (
          <View pointerEvents="none" style={styles.dustLane}>
            <Dust ref={dustRef} color={DUST_EARTH} />
          </View>
        ) : null}
        {width > 0 && ends ? (
          <View style={styles.pathLabels}>
            {currentIdx !== 0 ? (
              <Text style={[styles.pathLabel, styles.pathLabelStart]}>{startLabel}</Text>
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
  sky,
  children,
}: {
  topInset: number;
  sky: DaySky;
  children?: React.ReactNode;
}) {
  const [box, setBox] = useState({ width: 0, height: 0 });
  return (
    <View style={styles.journeyBleed}>
      <View pointerEvents="none" style={[styles.journeyOverscroll, { backgroundColor: sky.top }]} />
      <View
        style={[styles.journeyPanel, { paddingTop: topInset + 16, backgroundColor: sky.top }]}
        onLayout={(event) => {
          const width = Math.round(event.nativeEvent.layout.width);
          const height = Math.round(event.nativeEvent.layout.height);
          setBox((current) =>
            current.width === width && current.height === height ? current : { width, height },
          );
        }}
      >
        {box.width > 0 && box.height > 0 ? (
          <MeadowStage
            width={box.width}
            height={box.height}
              groundY={topInset + 86 + PATH_PET_PAD + PATH_MID + 12}
            frame={false}
            day={sky}
            still
          />
        ) : null}
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

function countSessionsThisWeek(completions: RawCompletion[], now = new Date()): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  let count = 0;
  for (const row of completions) {
    const at = new Date(row.completed_at);
    if (at >= start && at < end) count += 1;
  }
  return count;
}

function deckCardWidth(screen: number): number {
  return Math.max(240, screen - 24 - DECK_GAP - DECK_PEEK);
}

function ProgressDeck({ pages }: { pages: { key: string; title: string; node: React.ReactNode }[] }) {
  const { width } = useWindowDimensions();
  const cardW = deckCardWidth(width);
  const stride = cardW + DECK_GAP;
  const loop = pages.length > 1;
  const items = loop ? [pages[pages.length - 1]!, ...pages, pages[0]!] : pages;
  const scroller = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    if (!loop) return;
    scroller.current?.scrollTo({ x: stride, animated: false });
  }, [loop, stride]);

  function pageFromOffset(x: number): number {
    const index = Math.round(x / stride);
    if (!loop) return Math.min(pages.length - 1, Math.max(0, index));
    if (index <= 0) return pages.length - 1;
    if (index >= pages.length + 1) return 0;
    return index - 1;
  }

  function settle(x: number) {
    if (!loop) {
      setActive(pageFromOffset(x));
      return;
    }
    const index = Math.round(x / stride);
    if (index <= 0) {
      scroller.current?.scrollTo({ x: pages.length * stride, animated: false });
      setActive(pages.length - 1);
      return;
    }
    if (index >= pages.length + 1) {
      scroller.current?.scrollTo({ x: stride, animated: false });
      setActive(0);
      return;
    }
    setActive(index - 1);
  }

  function go(page: number) {
    const next = ((page % pages.length) + pages.length) % pages.length;
    scroller.current?.scrollTo({ x: (loop ? next + 1 : next) * stride, animated: true });
    setActive(next);
  }

  return (
    <View style={styles.deck}>
      {pages.length > 1 ? (
        <View style={styles.tabRow}>
          {pages.map((page, index) => {
            const on = index === active;
            return (
              <TouchableOpacity
                key={page.key}
                onPress={() => go(index)}
                activeOpacity={0.75}
                style={[styles.tab, on ? styles.tabOn : styles.tabOff]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={on ? styles.tabTextOn : styles.tabTextOff}>{page.title}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      <View style={styles.deckStage}>
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={stride}
          snapToAlignment="start"
          disableIntervalMomentum
          contentOffset={{ x: loop ? stride : 0, y: 0 }}
          contentContainerStyle={styles.deckContent}
          scrollEventThrottle={16}
          onMomentumScrollEnd={(event) => settle(event.nativeEvent.contentOffset.x)}
        >
          {items.map((page, index) => (
            <View
              key={`${page.key}-${index}`}
              style={[
                styles.card,
                styles.deckCard,
                { width: cardW, marginRight: index === items.length - 1 ? 0 : DECK_GAP },
              ]}
            >
              {page.node}
            </View>
          ))}
        </ScrollView>
        {loop ? (
          <>
            <View pointerEvents="none" style={[styles.edgeFade, styles.edgeLeft]}>
              <LinearGradient
                colors={[colors.background, 'rgba(246, 237, 224, 0)']}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
            <View pointerEvents="none" style={[styles.edgeFade, styles.edgeRight]}>
              <LinearGradient
                colors={['rgba(246, 237, 224, 0)', colors.background]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={StyleSheet.absoluteFill}
              />
            </View>
          </>
        ) : null}
      </View>
    </View>
  );
}

export default function ProgressScreen() {
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const sky = useDaySky();
  const { user } = useAuth();

  const [totalSessions, setTotalSessions] = useState(0);
  const [userProgram, setUserProgram] = useState<UserProgram | null>(null);
  const [durationWeeks, setDurationWeeks] = useState<number | null>(null);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(4);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [allPainCheckins, setAllPainCheckins] = useState<RawCheckin[]>([]);
  const [allActivityCompletions, setAllActivityCompletions] = useState<RawCompletion[]>([]);
  const [painRange, setPainRange] = useState<PainRange>('2w');
  const [activityRange, setActivityRange] = useState<ActivityRange>('1m');
  const [workoutDays, setWorkoutDays] = useState<number[]>([]);
  const [daysSince, setDaysSince] = useState<string | null>(null);
  const [petState, setPet] = useState<PetState | null>(null);
  const pet = useNamedPet(petState);
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

  const painChartW = Math.max(120, deckCardWidth(screenW) - 40 - PAIN_Y_AXIS_W);
  const activityChartW = Math.max(120, painChartW - 12);

  const activityLayout = useMemo(
    () => activityBarLayout(weeklyBarData.length, activityChartW),
    [weeklyBarData.length, activityChartW],
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
    let refreshed = false;
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

    const coreFailed =
      painRes.error != null ||
      activityRes.error != null ||
      totalRes.error != null ||
      (upRes.error != null && upRes.error.code !== 'PGRST116');
    if (coreFailed) {
      setLoadError(true);
    } else {
    setLoadError(false);
    let planSessionsPerWeek = sessionsPerWeek;
    if (!upRes.error || upRes.error.code === 'PGRST116') {
      const up = upRes.data;
      setUserProgram(up);

      if (up?.active_plan_id) {
        const { data: planRes, error: planError } = await supabase
          .from('user_program_plans')
          .select('duration_weeks, sessions_per_week')
          .eq('id', up.active_plan_id)
          .eq('status', 'active')
          .single();

        if (planError || !planRes) {
          setLoadError(true);
          return;
        }
        setDurationWeeks(planRes.duration_weeks);
        setSessionsPerWeek(planRes.sessions_per_week);
        planSessionsPerWeek = planRes.sessions_per_week;
      } else {
        setDurationWeeks(null);
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
    refreshed = true;
    }

    } catch {
      setLoadError(true);
    } finally {
      if (refreshed) finishTabRefresh('progress');
      else failTabRefresh('progress');
      setLoaded(true);
    }
  }

  const hasEnoughData = allPainCheckins.filter((c) => c.type === 'before').length >= 3;
  const showPainChart = hasEnoughData && painRangeHasData;

  const isProgramComplete = userProgram != null && durationWeeks != null
    ? userProgram.current_week > durationWeeks
    : false;

  const effectiveDays =
    workoutDays.length === sessionsPerWeek
      ? workoutDays
      : computeDefaultWorkoutDays(sessionsPerWeek);
  const weekSchedule = activeWorkoutDaysThisWeek(effectiveDays, daysSince);
  const weekTarget = sessionsPerWeek;
  const weekDoneFlags = computeWeekDays(allActivityCompletions, 0);
  const sessionsThisWeek = countSessionsThisWeek(allActivityCompletions);
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
          <JourneyFrame topInset={insets.top} sky={sky} />
          <Skeleton height={180} borderRadius={radius.card} style={styles.skeletonBlock} />
          <Skeleton height={100} borderRadius={radius.card} style={styles.skeletonBlock} />
          <Skeleton height={180} borderRadius={radius.card} style={styles.skeletonBlock} />
        </View>
      </TabFadeWrapper>
    );
  }

  if (loadError) {
    return (
      <TabFadeWrapper>
        <View style={styles.container}>
          <JourneyFrame topInset={insets.top} sky={sky} />
          <Text style={styles.placeholder}>Could not load your progress.</Text>
          <Text style={styles.placeholder}>Check your connection and try again.</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              hapticSelection();
              void fetchAll();
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
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
        <JourneyFrame topInset={insets.top} sky={sky}>
          {userProgram && !isProgramComplete && weekTarget > 0 ? (
            <>
              <Text style={[styles.journeyLabel, sky.ink === 'light' ? styles.onSky : null]}>
                {durationWeeks != null && userProgram
                  ? `Week ${userProgram.current_week} of ${durationWeeks}`
                  : 'This week'}
              </Text>
              <Text
                style={[styles.journeyHeadline, sky.ink === 'light' ? styles.onSkyTitle : null]}
                accessibilityLabel={`${sessionsThisWeek} of ${weekTarget} sessions this week`}
              >
                {sessionsThisWeek}
                <Text style={[styles.journeyHeadlineDim, sky.ink === 'light' ? styles.onSky : null]}> / {weekTarget}</Text>
              </Text>
              <JourneyRoute
                weeks={weekTarget + 1}
                currentWeek={Math.min(sessionsThisWeek, weekTarget) + 1}
                complete={sessionsThisWeek >= weekTarget}
                finishLabel=""
                ends={false}
                onDark
                pet={pet}
                petSettled={petSettled}
              />
            </>
          ) : (
            <Text style={[styles.journeyHeadline, sky.ink === 'light' ? styles.onSkyTitle : null]}>
              {userProgram && durationWeeks != null
                ? `${durationWeeks} weeks done`
                : pet
                  ? petName
                  : 'Sessions'}
            </Text>
          )}
          {!userProgram && pet ? (
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

        <ProgressDeck
          pages={[
            ...(userProgram && !isProgramComplete
              ? [{
                  key: 'week',
                  title: 'This week',
                  node: (
                    <>
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
                    </>
                  ),
                }]
              : []),
            {
              key: 'pain',
              title: 'Pain',
              node: (
                <>
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
                width={painChartW}
                spacing={
                  beforeData.length > 1
                    ? Math.max(16, Math.floor((painChartW - 8) / (beforeData.length - 1)))
                    : painChartW - 8
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
                </>
              ),
            },
            {
              key: 'activity',
              title: 'Activity',
              node: (
                <>
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
                width={activityChartW}
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
                </>
              ),
            },
          ]}
        />
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
    backgroundColor: colors.background,
  },
  journeyPanel: {
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 20,
    paddingBottom: 22,
    overflow: 'hidden',
  },
  journeyHeadline: {
    ...type.title,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  journeyLabel: {
    ...type.label,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  journeyHeadlineDim: {
    fontSize: 20,
    fontWeight: '500',
    color: colors.textSecondary,
  },
  onSky: {
    color: 'rgba(255, 255, 255, 0.78)',
  },
  onSkyTitle: {
    color: '#FFFFFF',
  },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  tabOn: {
    backgroundColor: colors.primary,
  },
  tabOff: {
    backgroundColor: colors.primaryMuted,
  },
  tabTextOn: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tabTextOff: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primaryDeep,
  },
  deck: {
    marginHorizontal: -24,
    marginBottom: 8,
  },
  deckStage: {
    position: 'relative',
  },
  deckContent: {
    paddingHorizontal: 24,
    alignItems: 'stretch',
  },
  deckCard: {
    marginBottom: 0,
    minHeight: 300,
  },
  edgeFade: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 28,
  },
  edgeLeft: {
    left: 0,
  },
  edgeRight: {
    right: 0,
  },
  deckDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 14,
    height: 8,
  },
  deckDot: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.primary,
  },
  pathWrap: {
    marginTop: 18,
    height: PATH_PET_PAD + PATH_H + 20,
    overflow: 'visible',
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
    color: colors.primaryDeep,
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
  tickOpen: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(62, 107, 78, 0.4)',
    backgroundColor: 'transparent',
  },
  tickOpenOnSky: {
    borderColor: 'rgba(255, 255, 255, 0.72)',
  },
  tickDone: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  tickDoneOnSky: {
    backgroundColor: '#FFFFFF',
  },
  nodeRing: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    left: 6,
    top: 6,
  },
  nodeRingOnHill: {
    borderColor: 'rgba(255, 255, 255, 0.85)',
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
  retryButton: {
    alignSelf: 'center',
    marginTop: 4,
    backgroundColor: colors.primary,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
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
