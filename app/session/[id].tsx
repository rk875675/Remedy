import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Alert,
  Animated,
  AppState,
  Easing,
  InteractionManager,
  type LayoutChangeEvent,
} from 'react-native';
import { useEvent, useEventListener } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView } from 'expo-video';
import { playDoneChime } from '../../lib/sessionChime';
import { useSilentVideoPlayer } from '../../lib/videoPlayer';
import { getCachedVideoUri, getVideoUri, prefetchVideo } from '../../lib/videoCache';
import { invalidateTabRefresh } from '../../lib/tabRefresh';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  hasGuideContent,
  loadExerciseDetails,
  markGuideSeen,
  pacePhaseLabels,
  readGuideSeen,
  type ExerciseDetail,
} from '../../lib/exerciseDetails';
import { ExerciseGuidePill, ExerciseGuideSheet } from '../../components/session/ExerciseGuideSheet';
import { PaceRing } from '../../components/session/PaceRing';
import { setPersonProperties } from '../../lib/analytics';
import {
  exerciseCompleted,
  exerciseSetCompleted,
  exerciseSkipped,
  exerciseStarted,
  exerciseVideoFailed,
  painCheckinSubmitted,
  restSkipped,
  sessionAbandoned,
  sessionCompleted,
  sessionCompletionFailed,
  sessionLoadFailed,
  sessionPreviewed,
  sessionStarted,
} from '../../lib/analytics/events/coreLoop';
import { colors, serifFont } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import {
  hapticSessionComplete,
  hapticWarning,
  hapticPrimaryAction,
  hapticSelection,
  hapticCelebration,
} from '../../lib/haptics';
import { Skeleton } from '../../components/ui/Skeleton';
import {
  incrementSessionsCompleted,
  maybeRequestReviewAfterSession,
} from '../../lib/app-store-review';
import { friendShareArmed, petGrew } from '../../lib/analytics/events/engagement';
import {
  armFriendShareHome,
  claimFriendSharePreview,
  considerFriendShare,
  friendSharePreviewAvailable,
  isShareTestAccount,
} from '../../lib/friendShare';
import { firstNameFromDisplayName, resolveDisplayName } from '../../lib/greeting';
import { orderedEquipmentForExercises } from '../../lib/equipment';
import { MedicalDisclaimer } from '../../components/legal/MedicalDisclaimer';
import { PetBadge } from '../../components/pet/PetBadge';
import { PetGrow } from '../../components/pet/PetGrow';
import { Dust, type DustHandle } from '../../components/pet/Dust';
import { call } from '../../components/pet/petMotion';
import { useReduceMotion } from '../../lib/useReduceMotion';
import { PetSays } from '../../components/pet/PetSays';
import { PetStageStrip } from '../../components/pet/PetStageStrip';
import { PetCoach, type CoachExercise, type CoachRects } from '../../components/pet/PetCoach';
import type { Rect } from '../../lib/petSpots';
import { createCoachMemory } from '../../lib/petCoach';
import { PET_COMPLETE } from '../../constants/petSessionLines';
import { fillPetLine } from '../../constants/petOnboardingLines';
import { fetchPetState } from '../../lib/petApi';
import { useNamedPet } from '../../lib/petNameCache';
import { petGrowthCopy, type PetState } from '../../lib/pet';
import { markPetStageSeen, takePetGrowth } from '../../lib/petGrowth';
import type { PetMood, PetStage } from '../../constants/petImages';
import {
  PET_CHECKIN_AFTER_PROMPT,
  PET_CHECKIN_BEFORE_PROMPT,
  PET_GREW_LINES,
  PET_GREW_TITLE,
  PET_PAIN_UP_LINE,
  PET_REST_LINES,
  PET_SESSION_COMPLETE_LINES,
  petCheckinReaction,
  petLine,
} from '../../constants/petLines';
import type { movementPattern } from '../../lib/analytics/events/enums';
import type { Exercise, ExercisePhase, UserPlanSession } from '../../types/database';

/** `exercises.movement_pattern` is a `text` column; the closed set lives in analytics. */
type MovementPattern = import('zod').z.infer<typeof movementPattern>;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Postgres error messages are free text and can echo row data back, so the
 * message is inspected only to bucket it — it is never sent.
 */
function classifyCompletionError(message: string): 'network' | 'rpc_error' {
  const text = message.toLowerCase();
  const isNetwork =
    text.includes('network') || text.includes('fetch') || text.includes('timeout');
  return isNetwork ? 'network' : 'rpc_error';
}

// --- Rest timer depleting ring ---
const REST_RING_SIZE = 220;
const REST_RING_STROKE = 10;
const REST_RING_RADIUS = (REST_RING_SIZE - REST_RING_STROKE) / 2;
const REST_RING_CIRCUMFERENCE = 2 * Math.PI * REST_RING_RADIUS;

/** Auto-play this many times at the start of each set, then pause. */
const VIDEO_INTRO_LOOPS = 2;
const SESSION_RESUME_KEY = 'remedy_session_resume';

type SessionResume = {
  planSessionId: string;
  exerciseIndex: number;
  setIndex: number;
  phase: 'exercise' | 'checkin_after';
};

function RestRing({
  seconds,
  total,
  petBelow = false,
  onLayout,
}: {
  seconds: number;
  total: number;
  petBelow?: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const progress = useRef(new Animated.Value(Math.min(seconds / total, 1))).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: Math.max(0, (seconds - 1) / total),
      duration: 1000,
      easing: Easing.linear,
      // SVG props cannot be driven natively.
      useNativeDriver: false,
    }).start();
  }, [seconds]);

  const strokeDashoffset = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [REST_RING_CIRCUMFERENCE, 0],
  });

  return (
    <View style={[styles.restRingWrap, petBelow && styles.restRingAbovePet]} onLayout={onLayout}>
      <Svg width={REST_RING_SIZE} height={REST_RING_SIZE}>
        <Circle
          cx={REST_RING_SIZE / 2}
          cy={REST_RING_SIZE / 2}
          r={REST_RING_RADIUS}
          stroke={colors.primaryMuted}
          strokeWidth={REST_RING_STROKE}
          fill="none"
        />
        <AnimatedCircle
          cx={REST_RING_SIZE / 2}
          cy={REST_RING_SIZE / 2}
          r={REST_RING_RADIUS}
          stroke={colors.primary}
          strokeWidth={REST_RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={REST_RING_CIRCUMFERENCE}
          strokeDashoffset={strokeDashoffset}
          fill="none"
          transform={`rotate(-90 ${REST_RING_SIZE / 2} ${REST_RING_SIZE / 2})`}
        />
      </Svg>
      <View style={styles.restRingCenter}>
        <Text style={styles.restTimer}>{seconds}</Text>
        <Text style={styles.restTimerUnit}>seconds</Text>
      </View>
    </View>
  );
}

type Phase = 'preview' | 'checkin_before' | 'exercise' | 'rest' | 'checkin_after' | 'complete';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
/** The pet on the complete screen, and how far above his spot he drops from. */
const COMPLETE_BADGE_SIZE = SCREEN_HEIGHT < 720 ? 132 : 200;
const COMPLETE_DROP_FROM = 420;

const WARM_COPY = [
  'Consistency is what changes things.',
  'You showed up. That\u2019s what matters.',
  'Your body thanks you.',
  'One session at a time. Keep it going.',
];

// Friendly label for a session's dominant phase — surfaced as "Main Focus" on
// the preview screen so it's meaningful without repeating the session title.
const PHASE_LABEL: Record<string, string> = {
  mobility: 'Mobility',
  activation: 'Stability & Core',
  strength: 'Strength',
  recovery: 'Recovery',
};

// One-line dose summary, e.g. "3 sets × 5 × 10s holds", "3 sets × 12 reps",
// "2 sets × 40s". withSets=false drops the set prefix (used for set-rest,
// where the set counter is shown separately). perSide appends "each side".
function formatDose(
  ex: Pick<Exercise, 'sets' | 'reps' | 'duration_seconds'>,
  withSets: boolean,
  perSide = false,
): string {
  const dose = ex.duration_seconds
    ? ex.reps
      ? `${ex.reps} × ${ex.duration_seconds}s holds`
      : `${ex.duration_seconds}s`
    : ex.reps
      ? `${ex.reps} reps`
      : '';
  if (!dose) return '';
  const sets = ex.sets && ex.sets > 0 ? ex.sets : 1;
  const line = withSets && sets > 1 ? `${sets} sets × ${dose}` : dose;
  return perSide ? `${line} each side` : line;
}

/** Inclusive integer in [low, high]. Used as the opening pain score. */
function painStart(low: number, high: number): number {
  return low + Math.floor(Math.random() * (high - low + 1));
}

export default function SessionPlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [phase, setPhase] = useState<Phase>('preview');
  const [sessionMeta, setSessionMeta] = useState<{
    title: string;
    duration_minutes: number;
    week_number: number;
    session_number: number;
    phase: string;
  } | null>(null);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  // A shown score is what gets saved if the slider is left where it opened.
  // Before opens in 5–8. After opens in 1–3.
  const [painBefore, setPainBefore] = useState(() => painStart(5, 8));
  const [painAfter, setPainAfter] = useState(() => painStart(1, 3));
  const [restSeconds, setRestSeconds] = useState(0);
  const [restTotal, setRestTotal] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [detailsById, setDetailsById] = useState<ReadonlyMap<string, ExerciseDetail>>(
    () => new Map(),
  );
  const [detailsReady, setDetailsReady] = useState(false);
  const [guideSheetId, setGuideSheetId] = useState<string | null>(null);
  const [guideVisible, setGuideVisible] = useState(false);
  const [guidePulseId, setGuidePulseId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [countdown, setCountdown] = useState(0);
  // Hold-rep dosing: exercises with BOTH reps and duration_seconds are "reps of
  // timed holds" (e.g. Bird Dog 5 x 10s per side) — the countdown cycles per hold.
  const [holdRep, setHoldRep] = useState(1);
  // Set tracking: every exercise runs `sets` times with rest_seconds between sets
  // (rest_seconds is the catalog's between-set rest prescription).
  const [setIndex, setSetIndex] = useState(1);
  const [restKind, setRestKind] = useState<'set' | 'exercise'>('exercise');
  const [skippedExercises, setSkippedExercises] = useState<Set<number>>(new Set());
  const [nextSession, setNextSession] = useState<UserPlanSession | null>(null);
  const [isProgramCompleted, setIsProgramCompleted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const warmCopyRef = useRef<string | null>(null);
  const shareOfferRef = useRef<{ preview: boolean } | null>(null);
  const [petState, setPet] = useState<PetState | null>(null);
  const pet = useNamedPet(petState);
  const petRef = useRef<PetState | null>(null);
  petRef.current = pet;
  const [grewFrom, setGrewFrom] = useState<PetStage | null>(null);
  // Holds the complete badge on the earlier stage until takePetGrowth answers.
  const [badgeHold, setBadgeHold] = useState<PetStage | null>(null);
  const [badgePinned, setBadgePinned] = useState(false);
  // Set once completion owns the pet snapshot, so the mount fetch cannot
  // overwrite a newer stage or the "seen" stage takePetGrowth just recorded.
  const petLock = useRef(false);
  const mountPetPromise = useRef<Promise<PetState | null> | null>(null);
  const petWarmCopyRef = useRef<string | null>(null);
  const restPetLineRef = useRef<string>(PET_REST_LINES[0]);
  // The pet's memory of this session (cues given, last bubble) across exercise and rest screens.
  const coachMemory = useRef(createCoachMemory()).current;
  const [exitOpen, setExitOpen] = useState(false);
  // Measured layout for the pet's floating layer (in screen-root coordinates), and a tick for video touches.
  const [rects, setRects] = useState<Partial<Record<string, Rect>>>({});
  const trackRect = useCallback(
    (key: string) => (e: LayoutChangeEvent) => {
      const { x, y, width, height } = e.nativeEvent.layout;
      setRects((prev) => {
        const old = prev[key];
        if (old && old.x === x && old.y === y && old.w === width && old.h === height) return prev;
        return { ...prev, [key]: { x, y, w: width, h: height } };
      });
    },
    [],
  );
  const coachRects = useMemo<CoachRects>(() => {
    const info = rects.info;
    const text = rects.infoText;
    const cap = rects.caption;
    const body = rects.restBody;
    const inBody = (r: Rect | undefined): Rect | undefined =>
      r && body ? { x: body.x + r.x, y: body.y + r.y, w: r.w, h: r.h } : undefined;
    return {
      topBar: rects.topBar,
      video: rects.video,
      button: rects.button,
      infoText: info && text ? { x: info.x + text.x, y: info.y + text.y, w: text.w, h: text.h } : null,
      caption: info && cap && exercises[exerciseIndex]?.instructions ? { x: info.x + cap.x, y: info.y + cap.y, w: cap.w, h: cap.h } : null,
      exit: rects.restExit,
      ring: inBody(rects.ring),
      skip: inBody(rects.skipRest),
    };
  }, [rects, exercises, exerciseIndex]);
  // Complete screen: celebrate first, then the thumbs-up, once any growth moment is over.
  const [growDone, setGrowDone] = useState(false);
  const [completeCheer, setCompleteCheer] = useState(false);
  // Complete screen: he drops in from above and lands with weight before celebrating.
  const reduceMotion = useReduceMotion();
  const [landed, setLanded] = useState(false);
  const completeDrop = useRef(new Animated.Value(-COMPLETE_DROP_FROM)).current;
  const completeLand = useRef(new Animated.Value(0)).current;
  const completeDust = useRef<DustHandle>(null);
  const completeDropStyle = useMemo(
    () => ({
      transform: [
        { translateY: completeDrop },
        // Squash about the centre, feet kept on the ground.
        { translateY: completeLand.interpolate({ inputRange: [0, 1], outputRange: [0, COMPLETE_BADGE_SIZE * 0.08] }) },
        { scaleX: completeLand.interpolate({ inputRange: [0, 1], outputRange: [1, 1.14] }) },
        { scaleY: completeLand.interpolate({ inputRange: [0, 1], outputRange: [1, 0.84] }) },
      ],
    }),
    [completeDrop, completeLand],
  );
  const mountedRef = useRef(true);

  const player = useSilentVideoPlayer(null, (p) => {
    p.loop = false;
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const videoPlaysCompleted = useRef(0);
  const videoLoopUnlocked = useRef(false);
  const lastVideoExerciseIndex = useRef(exerciseIndex);
  const videoUrlRef = useRef(videoUrl);
  videoUrlRef.current = videoUrl;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const currentExerciseIdRef = useRef<string | null>(null);
  currentExerciseIdRef.current = exercises[exerciseIndex]?.id ?? null;
  const guideSheetIdRef = useRef<string | null>(null);
  guideSheetIdRef.current = guideSheetId;
  const guideVisibleRef = useRef(false);
  guideVisibleRef.current = guideVisible;
  const guideCheckedRef = useRef<Set<string>>(new Set());
  const guideDismissedRef = useRef<Set<string>>(new Set());

  const resetVideoLoopForSet = useCallback(() => {
    videoPlaysCompleted.current = 0;
    videoLoopUnlocked.current = false;
    player.loop = false;
  }, [player]);

  // play() is a no-op if VideoView is not attached yet (preview/rest unmount it)
  // or replaceAsync has not reached readyToPlay. Stay armed until playingChange.
  const autoplayArmedRef = useRef(false);

  const armSetAutoplay = useCallback(() => {
    resetVideoLoopForSet();
    autoplayArmedRef.current = true;
  }, [resetVideoLoopForSet]);

  const startArmedAutoplay = useCallback(() => {
    if (!autoplayArmedRef.current) return;
    if (phaseRef.current !== 'exercise') return;
    if (!videoUrlRef.current) return;
    player.replay();
    player.play();
  }, [player]);

  // Cache of pre-fetched signed URLs keyed by exercise id.
  // Populated during rest so the next exercise's video is ready to go instantly.
  const prefetchedUrls = useRef<Map<string, string>>(new Map());

  // Sync video source → player whenever the URL resolves for a new exercise.
  // replaceAsync avoids loading asset metadata on the iOS main thread.
  useEffect(() => {
    armSetAutoplay();
    if (videoUrl) {
      const failedExerciseId = exercises[exerciseIndex]?.id ?? null;
      void player
        .replaceAsync({ uri: videoUrl })
        .then(() => {
          startArmedAutoplay();
        })
        .catch(() => {
          setVideoError(true);
          if (failedExerciseId !== null) {
            exerciseVideoFailed({ exercise_id: failedExerciseId, reason: 'playback_error' });
          }
        });
    } else {
      player.pause();
    }
  }, [videoUrl, player, armSetAutoplay, startArmedAutoplay, exercises, exerciseIndex]);

  // Every new set / first enter of an exercise arms the 2-loop intro. Pause off
  // the exercise screen. Exercise changes wait for the URL effect to swap clips.
  useEffect(() => {
    if (phase !== 'exercise') {
      autoplayArmedRef.current = false;
      player.pause();
      return;
    }

    armSetAutoplay();

    if (lastVideoExerciseIndex.current !== exerciseIndex) {
      lastVideoExerciseIndex.current = exerciseIndex;
      return;
    }

    startArmedAutoplay();
  }, [phase, setIndex, exerciseIndex, player, armSetAutoplay, startArmedAutoplay]);

  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') setVideoError(true);
    if (status === 'readyToPlay') startArmedAutoplay();
  });

  useEventListener(player, 'playingChange', ({ isPlaying: nowPlaying }) => {
    if (nowPlaying) autoplayArmedRef.current = false;
  });

  useEventListener(player, 'playToEnd', () => {
    if (phaseRef.current !== 'exercise') return;
    if (autoplayArmedRef.current) return;
    const duration = player.duration;
    if (!Number.isFinite(duration) || duration < 0.4) return;
    if (videoLoopUnlocked.current) {
      if (!player.loop) {
        player.replay();
        player.play();
      }
      return;
    }
    videoPlaysCompleted.current += 1;
    if (videoPlaysCompleted.current >= VIDEO_INTRO_LOOPS) {
      player.pause();
      return;
    }
    player.replay();
    player.play();
  });

  const userPausedRef = useRef(false);

  const toggleVideoPlayback = useCallback(() => {
    hapticSelection();
    if (player.playing) {
      userPausedRef.current = true;
      player.pause();
      return;
    }
    userPausedRef.current = false;
    // Loop forever only after the intro auto-paused. Pausing mid-intro
    // resumes the remaining plays, then pauses again.
    if (videoPlaysCompleted.current >= VIDEO_INTRO_LOOPS) {
      videoLoopUnlocked.current = true;
      player.loop = true;
    }
    const duration = player.duration;
    if (Number.isFinite(duration) && duration > 0 && player.currentTime >= duration - 0.25) {
      player.replay();
    }
    player.play();
  }, [player]);

  const sessionStartTime = useRef(Date.now());
  // Activation depends on knowing whether this is the user's very first session,
  // which the player otherwise has no way to tell. Resolved once, off the
  // critical path, from the authoritative completion count.
  const isFirstSession = useRef(false);
  const exerciseStartedAt = useRef(Date.now());
  const setStartedAt = useRef(Date.now());
  /** Last exercise index reported as started, so sets don't re-fire it. */
  const reportedExerciseIndex = useRef<number | null>(null);
  /** One abandon per session — exit and background must not both report. */
  const abandonReported = useRef(false);
  const previewReported = useRef(false);
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdRepRef = useRef(1);
  const completionScale = useRef(new Animated.Value(0)).current;
  const completeStatAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  // Stable nodes. Rebuilding these when the pet arrives mid-entrance detaches
  // them from the native animation and freezes the cards 10px down.
  const completeEnter = useMemo(
    () =>
      completeStatAnims.map((anim) => ({
        opacity: anim,
        transform: [
          {
            translateY: anim.interpolate({
              inputRange: [0, 1],
              outputRange: [10, 0],
            }),
          },
        ],
      })),
    [completeStatAnims],
  );
  const sliderWidth = useRef(0);

  const loadSession = useCallback(() => {
    if (!id) return;
    setLoaded(false);
    setLoadError(false);

    // The player reads the resolved snapshot. The route id is a user_plan_sessions.id.
    // Per-exercise sets/reps/rest come from the resolved plan row (not the base
    // exercise); name/video/instructions come from the joined exercise.
    Promise.all([
      supabase
        .from('user_plan_sessions')
        .select('title, estimated_minutes, week_number, session_number, phase')
        .eq('id', id)
        .single(),
      supabase
        .from('user_plan_session_exercises')
        .select('order_index, sets, reps, duration_seconds, rest_seconds, exercises(*)')
        .eq('plan_session_id', id)
        .order('order_index', { ascending: true }),
    ]).then(([metaRes, exercisesRes]) => {
      if (metaRes.data) {
        setSessionMeta({
          title: metaRes.data.title,
          duration_minutes: metaRes.data.estimated_minutes,
          week_number: metaRes.data.week_number,
          session_number: metaRes.data.session_number,
          phase: metaRes.data.phase,
        });
      }
      if (exercisesRes.data) {
        const exs = exercisesRes.data
          .map((row) => {
            const r = row as unknown as {
              sets: number | null;
              reps: number | null;
              duration_seconds: number | null;
              rest_seconds: number;
              exercises: Exercise | null;
            };
            if (!r.exercises) return null;
            return {
              ...r.exercises,
              sets: r.sets,
              reps: r.reps,
              duration_seconds: r.duration_seconds,
              rest_seconds: r.rest_seconds ?? r.exercises.rest_seconds,
            };
          })
          .filter((e): e is Exercise => e !== null);
        setExercises(exs);
        setExerciseCount(exs.length);
        if (id) {
          void AsyncStorage.getItem(SESSION_RESUME_KEY).then((raw) => {
            if (!raw) return;
            try {
              const saved = JSON.parse(raw) as SessionResume;
              if (saved.planSessionId !== id) return;
              if (saved.phase === 'checkin_after') {
                setPhase('checkin_after');
                return;
              }
              if (saved.exerciseIndex >= 0 && saved.exerciseIndex < exs.length) {
                setExerciseIndex(saved.exerciseIndex);
                setSetIndex(Math.max(1, saved.setIndex));
                setPhase('exercise');
              }
            } catch {
              // A bad resume row just starts the session from the preview.
            }
          });
        }
        // One batched call resolves every clip for the session. Playback URLs come from
        // get-video-url rather than exercises.video_url so the server decides what the
        // client may fetch (signed R2 URL when configured, public URL otherwise) —
        // reading the column directly bypassed the entitlement gate entirely.
        InteractionManager.runAfterInteractions(() => {
          void supabase.functions
            .invoke('get-video-url', { body: { exerciseIds: exs.map((e) => e.id) } })
            .then(({ data, error }) => {
              if (error || !data?.urls) return;
              const urls = data.urls as Record<string, string>;
              for (const [exerciseId, url] of Object.entries(urls)) {
                prefetchedUrls.current.set(exerciseId, url);
                void prefetchVideo(url);
              }
            })
            .catch(() => {});
        });
      }
      // A failed query must surface a retry — swallowing it lets the player run with
      // zero exercises, which used to fall through to the completion UI without ever
      // recording a completion.
      if (metaRes.error || exercisesRes.error) {
        setLoadError(true);
        sessionLoadFailed({
          reason: metaRes.error ? 'not_found' : 'unknown',
          plan_session_id: id,
        });
      } else if (!exercisesRes.data?.length) {
        sessionLoadFailed({ reason: 'no_exercises', plan_session_id: id });
      }
      setLoaded(true);
    }).catch(() => {
      setLoadError(true);
      sessionLoadFailed({ reason: 'network', plan_session_id: id });
      setLoaded(true);
    });
  }, [id]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  // Teaching copy is optional. A missing table, a slow response, or a bad row
  // leaves details empty and the session runs exactly as it did without them.
  useEffect(() => {
    if (exercises.length === 0) return;
    let cancelled = false;
    void loadExerciseDetails(exercises.map((exercise) => exercise.id)).then((map) => {
      if (cancelled) return;
      setDetailsById(map);
      setDetailsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [exercises]);

  const openGuide = useCallback((exerciseId: string) => {
    guideSheetIdRef.current = exerciseId;
    setGuideSheetId(exerciseId);
    setGuideVisible(true);
  }, []);

  const closeGuide = useCallback(() => {
    const exerciseId = guideSheetIdRef.current;
    if (exerciseId) {
      guideDismissedRef.current.add(exerciseId);
      void markGuideSeen(exerciseId);
    }
    setGuideVisible(false);
  }, []);

  const endGuidePulse = useCallback(() => {
    setGuidePulseId(null);
  }, []);

  useEffect(() => {
    if (phase !== 'exercise' || !detailsReady) return;
    const exercise = exercises[exerciseIndex];
    if (!exercise) return;
    if (guideCheckedRef.current.has(exercise.id)) return;
    const detail = detailsById.get(exercise.id);
    if (!detail || !hasGuideContent(detail)) {
      guideCheckedRef.current.add(exercise.id);
      return;
    }
    guideCheckedRef.current.add(exercise.id);
    const exerciseId = exercise.id;
    const countdownRuns = Boolean(exercise.duration_seconds);
    void readGuideSeen(exerciseId).then((seen) => {
      if (seen) return;
      if (phaseRef.current !== 'exercise') return;
      if (currentExerciseIdRef.current !== exerciseId) return;
      if (guideDismissedRef.current.has(exerciseId)) return;
      if (countdownRuns) {
        setGuidePulseId(exerciseId);
        void markGuideSeen(exerciseId);
        return;
      }
      openGuide(exerciseId);
    });
  }, [phase, detailsReady, exercises, exerciseIndex, detailsById, openGuide]);

  useEffect(() => {
    if (!guideVisible) return;
    const stillHere =
      phase === 'exercise' && exercises[exerciseIndex]?.id === guideSheetId;
    if (stillHere) return;
    closeGuide();
  }, [guideVisible, phase, exerciseIndex, exercises, guideSheetId, closeGuide]);

  useEffect(() => {
    if (guidePulseId === null) return;
    if (phase === 'exercise' && exercises[exerciseIndex]?.id === guidePulseId) return;
    setGuidePulseId(null);
  }, [phase, exerciseIndex, exercises, guidePulseId]);

  useEffect(() => {
    return () => {
      const exerciseId = guideSheetIdRef.current;
      if (guideVisibleRef.current && exerciseId) void markGuideSeen(exerciseId);
    };
  }, []);

  // Analytics only. A head-count is cheap and runs while the user reads the
  // preview, so it never delays anything they are waiting on.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void supabase
      .from('session_completions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count, error }) => {
        if (!cancelled && !error) isFirstSession.current = (count ?? 0) === 0;
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Best-effort. Records the stage before this session is completed, so the
  // summary can tell whether completing it made the pet grow.
  useEffect(() => {
    let cancelled = false;
    const userId = user?.id;
    const promise = fetchPetState();
    mountPetPromise.current = promise;
    void promise.then((state) => {
      if (cancelled || !state || petLock.current) return;
      setPet(state);
      if (userId) void markPetStageSeen(userId, state.stage);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (previewReported.current) return;
    if (!loaded || loadError || !sessionMeta || exercises.length === 0) return;
    previewReported.current = true;
    sessionPreviewed({
      plan_session_id: id,
      week_number: sessionMeta.week_number,
      session_number: sessionMeta.session_number,
      exercise_count: exercises.length,
      estimated_minutes: sessionMeta.duration_minutes,
      phase: sessionMeta.phase as ExercisePhase,
    });
  }, [loaded, loadError, sessionMeta, exercises.length, id]);

  useEffect(() => {
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  // Video loads once per exercise (NOT per set — set changes must not refetch).
  // Checks the prefetch cache first; falls back to a fresh edge function call.
  useEffect(() => {
    const ex = exercises[exerciseIndex];
    if (!ex) return;

    setVideoError(false);

    const remote = prefetchedUrls.current.get(ex.id) ?? null;
    if (remote) {
      // Cached file if we already have it; otherwise stream now and warm the
      // cache in the background for the next session. Do not swap mid-play.
      setVideoUrl(getCachedVideoUri(remote) ?? remote);
      void prefetchVideo(remote);
      return;
    }

    setVideoUrl(null);

    // The batch resolve on session load usually populates prefetchedUrls first; this is
    // the fallback for a clip it missed (slow/failed batch, or a mid-session refresh).
    supabase.functions
      .invoke('get-video-url', { body: { exerciseId: ex.id } })
      .then(({ data, error }) => {
        if (error || !data?.url) {
          setVideoError(true);
          // The signed URL itself is never sent — only which exercise failed.
          exerciseVideoFailed({ exercise_id: ex.id, reason: 'url_fetch_failed' });
        } else {
          const url = data.url as string;
          prefetchedUrls.current.set(ex.id, url);
          setVideoUrl(getCachedVideoUri(url) ?? url);
          void prefetchVideo(url);
        }
      })
      .catch(() => {
        setVideoError(true);
        exerciseVideoFailed({ exercise_id: ex.id, reason: 'url_fetch_failed' });
      });
  }, [exerciseIndex, exercises]);

  // One `exercise_started` per exercise, not per set: the countdown effect below
  // re-arms on every set, so it cannot be the trigger.
  useEffect(() => {
    if (phase !== 'exercise') return;
    const ex = exercises[exerciseIndex];
    if (!ex) return;

    setStartedAt.current = Date.now();
    if (reportedExerciseIndex.current === exerciseIndex) return;
    reportedExerciseIndex.current = exerciseIndex;
    exerciseStartedAt.current = Date.now();

    exerciseStarted({
      exercise_id: ex.id,
      exercise_index: exerciseIndex,
      exercise_count: exercises.length,
      plan_session_id: id,
      movement_pattern: ex.movement_pattern as MovementPattern,
      phase: ex.phase,
      intensity_tier: ex.intensity_tier,
      ...(ex.sets === null ? {} : { sets: ex.sets }),
      ...(ex.reps === null ? {} : { reps: ex.reps }),
      ...(ex.duration_seconds === null ? {} : { duration_seconds: ex.duration_seconds }),
    });
  }, [phase, exerciseIndex, setIndex, exercises, id]);

  // Countdown runs per set: re-armed on every set of every exercise.
  useEffect(() => {
    if (phase !== 'exercise' || !exercises[exerciseIndex]) return;

    const ex = exercises[exerciseIndex];

    if (ex.duration_seconds) {
      const holdDuration = ex.duration_seconds;
      const holdReps = ex.reps && ex.reps > 0 ? ex.reps : 1;
      holdRepRef.current = 1;
      setHoldRep(1);
      setCountdown(holdDuration);
      userPausedRef.current = false;
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (userPausedRef.current) return prev;
          if (prev <= 1) {
            // Any exercise with a duration, including ones added later.
            playDoneChime();
            if (holdRepRef.current < holdReps) {
              holdRepRef.current += 1;
              setHoldRep(holdRepRef.current);
              return holdDuration;
            }
            if (countdownRef.current) clearInterval(countdownRef.current);
            handleSetDone();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCountdown(0);
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [exerciseIndex, setIndex, phase, exercises]);

  useEffect(() => {
    if (phase === 'complete') {
      // Two-beat finish: impact lands with the checkmark, success settles after.
      hapticSessionComplete();
      Animated.spring(completionScale, {
        toValue: 1,
        friction: 4,
        tension: 60,
        useNativeDriver: true,
      }).start();
      Animated.sequence([
        Animated.delay(250),
        Animated.stagger(
          80,
          completeStatAnims.map((anim) =>
            Animated.timing(anim, {
              toValue: 1,
              duration: 320,
              easing: Easing.out(Easing.cubic),
              useNativeDriver: true,
            }),
          ),
        ),
      ]).start();
      fetchNextSession();
    }
  }, [phase]);

  // Drop in, squash on landing with a puff of dust, then (and only then) celebrate.
  useEffect(() => {
    if (phase !== 'complete') return;
    if (reduceMotion !== false) {
      completeDrop.setValue(0);
      setLanded(true);
      return;
    }
    completeDrop.setValue(-COMPLETE_DROP_FROM);
    const anim = Animated.sequence([
      Animated.delay(150),
      Animated.timing(completeDrop, {
        toValue: 0,
        duration: 440,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      call(() => {
        completeDust.current?.play([
          { x: COMPLETE_BADGE_SIZE * 0.22, delay: 0, size: 16 },
          { x: COMPLETE_BADGE_SIZE * 0.78, delay: 30, size: 16 },
          { x: COMPLETE_BADGE_SIZE * 0.5, delay: 60, size: 12 },
        ]);
      }),
      Animated.timing(completeLand, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.spring(completeLand, {
        toValue: 0,
        speed: 16,
        bounciness: 14,
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished) setLanded(true);
    });
    return () => anim.stop();
  }, [phase, reduceMotion, completeDrop, completeLand]);

  // The pet celebrates, then gives its thumbs-up. Never mid growth moment, so only one move runs.
  useEffect(() => {
    if (phase !== 'complete' || completeCheer || badgePinned || !landed) return;
    if (grewFrom !== null && !growDone) return;
    const timer = setTimeout(() => setCompleteCheer(true), 2600);
    return () => clearTimeout(timer);
  }, [phase, completeCheer, badgePinned, landed, grewFrom, growDone]);

  const fetchNextSession = useCallback(async () => {
    if (!user || !id) return;
    const { data: up } = await supabase
      .from('user_programs')
      .select('active_plan_id, current_week, current_session')
      .eq('user_id', user.id)
      .single();
    if (!up || !up.active_plan_id) return;

    const { data: plan } = await supabase
      .from('user_program_plans')
      .select('sessions_per_week, duration_weeks')
      .eq('id', up.active_plan_id)
      .eq('status', 'active')
      .single();
    if (!plan) return;

    const sessionsPerWeek = plan.sessions_per_week;
    const durationWeeks = plan.duration_weeks;

    let nextSess = up.current_session + 1;
    let nextWeek = up.current_week;
    if (nextSess > sessionsPerWeek) {
      nextSess = 1;
      nextWeek = Math.min(nextWeek + 1, durationWeeks);
    }

    const { data } = await supabase
      .from('user_plan_sessions')
      .select('*')
      .eq('plan_id', up.active_plan_id)
      .eq('week_number', nextWeek)
      .eq('session_number', nextSess)
      .single();

    if (data) setNextSession(data);
  }, [user, id]);

  // Fire-and-forget: fetches and caches the signed URL for an exercise so it's
  // ready when the rest timer ends. Silently skips if already cached.
  function prefetchVideoUrl(ex: Exercise) {
    if (prefetchedUrls.current.has(ex.id)) return;
    supabase.functions
      .invoke('get-video-url', { body: { exerciseId: ex.id } })
      .then(({ data, error }) => {
        if (!error && data?.url) {
          const url = data.url as string;
          prefetchedUrls.current.set(ex.id, url);
          void prefetchVideo(url);
        }
      })
      .catch(() => {});
  }

  function startRest(seconds: number, kind: 'set' | 'exercise') {
    restPetLineRef.current =
      PET_REST_LINES[Math.floor(Math.random() * PET_REST_LINES.length)] ?? PET_REST_LINES[0];
    setRestKind(kind);
    setRestSeconds(seconds);
    setRestTotal(Math.max(seconds, 1));
    setPhase('rest');

    // Prefetch next exercise's video URL while the user rests — by the time
    // the timer ends the URL is cached and loads instantly.
    if (kind === 'exercise') {
      const nextEx = exercises[exerciseIndex + 1];
      if (nextEx) prefetchVideoUrl(nextEx);
    }

    restTimerRef.current = setInterval(() => {
      setRestSeconds((prev) => {
        if (userPausedRef.current) return prev;
        if (prev <= 1) {
          if (restTimerRef.current) clearInterval(restTimerRef.current);
          advanceAfterRest(kind);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function advanceAfterRest(kind: 'set' | 'exercise') {
    if (kind === 'set') {
      setSetIndex((i) => i + 1);
      setPhase('exercise');
    } else {
      advanceExercise();
    }
  }

  function skipRest() {
    // Navigation advance — stronger than a selection tick.
    hapticPrimaryAction();
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    restSkipped({ rest_kind: restKind, remaining_seconds: restSeconds });
    advanceAfterRest(restKind);
  }

  function advanceExercise() {
    const nextIndex = exerciseIndex + 1;
    setSetIndex(1);
    if (nextIndex >= exercises.length) {
      setPhase('checkin_after');
    } else {
      setExerciseIndex(nextIndex);
      setPhase('exercise');
    }
  }

  // One SET finished (timer elapsed or Done tapped). rest_seconds is the
  // prescribed between-set rest; it is also used as the transition rest before
  // the next exercise.
  function handleSetDone() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const currentEx = exercises[exerciseIndex];
    const totalSets = currentEx.sets && currentEx.sets > 0 ? currentEx.sets : 1;

    exerciseSetCompleted({
      exercise_id: currentEx.id,
      set_index: setIndex,
      set_count: totalSets,
      time_on_set_ms: Math.max(0, Date.now() - setStartedAt.current),
    });

    if (setIndex < totalSets) {
      startRest(currentEx.rest_seconds, 'set');
      return;
    }

    exerciseCompleted({
      exercise_id: currentEx.id,
      exercise_index: exerciseIndex,
      duration_ms: Math.max(0, Date.now() - exerciseStartedAt.current),
      sets_completed: totalSets,
    });

    // All sets done — move on to the next exercise (or finish the session).
    if (exerciseIndex < exercises.length - 1) {
      startRest(currentEx.rest_seconds, 'exercise');
    } else {
      setPhase('checkin_after');
    }
  }

  function handleSkipExercise() {
    hapticSelection();
    if (countdownRef.current) clearInterval(countdownRef.current);
    const currentEx = exercises[exerciseIndex];
    if (currentEx) {
      exerciseSkipped({
        exercise_id: currentEx.id,
        exercise_name: currentEx.name,
        exercise_index: exerciseIndex,
        set_index: setIndex,
        time_on_exercise_ms: Math.max(0, Date.now() - exerciseStartedAt.current),
      });
    }
    setSkippedExercises((prev) => new Set(prev).add(exerciseIndex));
    advanceExercise();
  }

  /**
   * Mid-session churn. Fires at most once per session: a user who backgrounds
   * the app and then confirms Exit is one abandonment, not two.
   *
   * The preview and complete phases are not abandonment — nothing was started in
   * the first, and everything was finished in the second.
   */
  function persistResume() {
    if (!id) return;
    let next: SessionResume | null = null;
    if (phase === 'checkin_after') {
      next = { planSessionId: id, exerciseIndex, setIndex, phase: 'checkin_after' };
    } else if (phase === 'exercise') {
      next = { planSessionId: id, exerciseIndex, setIndex, phase: 'exercise' };
    } else if (phase === 'rest') {
      const ontoNextExercise = restKind === 'exercise';
      next = {
        planSessionId: id,
        exerciseIndex: ontoNextExercise ? exerciseIndex + 1 : exerciseIndex,
        setIndex: ontoNextExercise ? 1 : setIndex + 1,
        phase: 'exercise',
      };
    }
    if (!next) return;
    void AsyncStorage.setItem(SESSION_RESUME_KEY, JSON.stringify(next));
  }

  function reportAbandon(exitType: 'user_exit' | 'backgrounded') {
    persistResume();
    if (abandonReported.current) return;
    if (phase === 'preview' || phase === 'complete') return;
    abandonReported.current = true;
    sessionAbandoned({
      plan_session_id: id,
      phase_key: phase,
      exercise_index: exerciseIndex,
      elapsed_ms: Math.max(0, Date.now() - sessionStartTime.current),
      exit_type: exitType,
      ...(sessionMeta === null ? {} : { week_number: sessionMeta.week_number }),
    });
  }

  // Read through a ref so the listener can be registered once while still seeing
  // the current phase and exercise.
  const reportAbandonRef = useRef(reportAbandon);
  reportAbandonRef.current = reportAbandon;

  useEffect(() => {
    // 'background' only. On iOS 'inactive' also fires for the app switcher and
    // notification shade, which is a glance, not an abandonment.
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'background') reportAbandonRef.current('backgrounded');
    });
    return () => subscription.remove();
  }, []);

  function handleExit() {
    hapticWarning();
    // Exiting mid-session does NOT record a completion. Writing one here inserted an
    // unguarded completion for an unfinished session (inflating counts and creating a
    // duplicate-completion vector). The pointer is untouched, so this session stays
    // current and can simply be resumed.
    setExitOpen(true);
    Alert.alert(
      'Exit session?',
      'This session isn\u2019t finished yet \u2014 you can resume it anytime.',
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setExitOpen(false) },
        {
          text: 'Exit',
          style: 'destructive',
          // Pop back to the existing tabs entry (dismissTo) rather than stacking a
          // duplicate — Home refreshes via its focus effect.
          onPress: () => {
            persistResume();
            reportAbandon('user_exit');
            router.dismissTo('/(tabs)');
          },
        },
      ],
      { cancelable: true, onDismiss: () => setExitOpen(false) },
    );
  }

  async function handleBeginSession() {
    hapticPrimaryAction();
    if (!user || !id) return;
    const { error: painError } = await supabase.from('pain_checkins').insert({
      user_id: user.id,
      score: painBefore,
      type: 'before' as const,
    });
    if (painError) {
      Alert.alert(
        'Could not save your pain score',
        'Check your connection and try again.',
        [{ text: 'Try again', onPress: () => void handleBeginSession() }],
      );
      return;
    }
    if (sessionMeta) {
      painCheckinSubmitted({
        checkin_type: 'before',
        score: painBefore,
        plan_session_id: id,
        week_number: sessionMeta.week_number,
      });
      sessionStarted({
        plan_session_id: id,
        week_number: sessionMeta.week_number,
        session_number: sessionMeta.session_number,
        exercise_count: exercises.length,
        pain_before: painBefore,
        is_first_session: isFirstSession.current,
      });
    }
    setPhase('exercise');
  }

  async function handleComplete() {
    if (!user || !id) return;
    // Guard against double submission (double-tap / re-render). Server also rejects a
    // second completion via the pointer guard, but this avoids the wasted round-trip and
    // a misleading error path.
    if (isSubmitting) return;
    setIsSubmitting(true);
    hapticPrimaryAction();

    const durationSeconds = Math.round((Date.now() - sessionStartTime.current) / 1000);

    // Authoritative, pointer-guarded completion. The server only accepts the session
    // that matches the user's current week/session, writes the completion + after-checkin,
    // and advances the pointer atomically (see migration 021).
    let data: unknown;
    let error: { message: string } | null = null;
    try {
      const response = await supabase.rpc('complete_session', {
        p_plan_session_id: id,
        p_duration_seconds: durationSeconds,
        p_pain_after: painAfter,
      });
      data = response.data;
      error = response.error;
    } catch {
      setIsSubmitting(false);
      sessionCompletionFailed({ reason: 'network', plan_session_id: id });
      hapticWarning();
      Alert.alert(
        'Could not save this session',
        'The connection dropped. Your session is still here — try again.',
        [
          { text: 'Try again', onPress: () => void handleComplete() },
          { text: 'Not now', style: 'cancel' },
        ],
      );
      return;
    }

    if (error || !data) {
      setIsSubmitting(false);
      const message = error?.message?.toLowerCase() ?? '';
      const rampRequired = message.includes('weekly_ramp_required');
      const notCurrent = message.includes('session_not_current') || message.includes('not_current');
      const reason = error
        ? classifyCompletionError(error.message)
        : notCurrent
          ? 'rpc_error'
          : 'network';
      sessionCompletionFailed({ reason, plan_session_id: id });
      hapticWarning();

      // Migration 057 gates week N on a ramp decision for week N-1. Home redirects to
      // /weekly-ramp whenever pending_ramp_week is set.
      if (rampRequired) {
        Alert.alert(
          'One step first',
          'Check in on how last week went, then come back and finish this session.',
          [{ text: 'Continue', onPress: () => router.dismissTo('/(tabs)') }],
        );
        return;
      }

      if (notCurrent) {
        Alert.alert(
          'Could not save this session',
          'This session is no longer your current one. Returning you to your plan.',
          [{ text: 'OK', onPress: () => router.dismissTo('/(tabs)') }],
        );
        return;
      }

      Alert.alert(
        'Could not save this session',
        'The connection dropped. Your session is still here — try again.',
        [
          { text: 'Try again', onPress: () => void handleComplete() },
          { text: 'Not now', style: 'cancel' },
        ],
      );
      return;
    }

    const result = data as {
      ended_week: boolean;
      completed_week: number | null;
      program_done: boolean;
      ramp_ready?: boolean;
    };

    invalidateTabRefresh('home');
    invalidateTabRefresh('progress');
    void AsyncStorage.removeItem(SESSION_RESUME_KEY);

    if (result.program_done) {
      setIsProgramCompleted(true);
    }

    if (sessionMeta) {
      painCheckinSubmitted({
        checkin_type: 'after',
        score: painAfter,
        plan_session_id: id,
        week_number: sessionMeta.week_number,
      });
      sessionCompleted({
        plan_session_id: id,
        week_number: sessionMeta.week_number,
        session_number: sessionMeta.session_number,
        duration_seconds: durationSeconds,
        exercise_count: exercises.length,
        skipped_exercise_count: skippedExercises.size,
        pain_before: painBefore,
        pain_after: painAfter,
        pain_delta: painAfter - painBefore,
        ended_week: result.ended_week,
        program_done: result.program_done,
        is_first_session: isFirstSession.current,
      });

      // Activation timestamp is set-once: a later completion must not overwrite
      // it, or the activation cohort silently slides forward in time.
      setPersonProperties(
        { program_week: sessionMeta.week_number },
        { first_session_completed_at: new Date().toISOString() },
      );
      isFirstSession.current = false;
    }

    // Advances review eligibility for every completion, including the end-of-week
    // ones that route away below without ever rendering the summary.
    void incrementSessionsCompleted();

    // End-of-week (and not the final week): route to the weekly hybrid ramp
    // only when every plan session that week is actually completed. A lone
    // session_number overflow used to land on a ramp that could not save.
    if (
      result.ended_week &&
      result.completed_week !== null &&
      !result.program_done &&
      result.ramp_ready !== false
    ) {
      // The in-flight mount fetch must not rewrite the stage weekly-ramp records.
      petLock.current = true;
      router.replace(`/weekly-ramp?week=${result.completed_week}`);
      return;
    }

    setPhase('complete');
    const onScreen = petRef.current?.stage ?? null;
    if (onScreen !== null) {
      setBadgeHold(onScreen);
      setBadgePinned(true);
    }

    // Best-effort: the summary renders without it. Wait for the pre-completion
    // snapshot so a late mount response cannot mark the new stage first.
    petLock.current = true;
    const userId = user.id;
    void (async () => {
      const pre = await mountPetPromise.current;
      const state = await fetchPetState();
      if (!mountedRef.current) return;
      if (!state) {
        if (pre) setPet(pre);
        setBadgePinned(false);
        setBadgeHold(null);
        return;
      }
      const earlier = pre?.stage ?? petRef.current?.stage ?? null;
      if (earlier !== null && earlier <= state.stage) {
        setBadgeHold(earlier);
        setBadgePinned(true);
      } else if (earlier === null) {
        setBadgeHold(null);
        setBadgePinned(true);
      }
      setPet(state);
      try {
        if (pre && pre.total_sessions < state.total_sessions && pre.stage <= state.stage) {
          await markPetStageSeen(userId, pre.stage);
        }
        if (!mountedRef.current) return;
        const from = await takePetGrowth(userId, state.stage);
        if (!mountedRef.current) return;
        if (from !== null) {
          setGrewFrom(from);
          hapticCelebration();
          petGrew({
            source_screen: 'session',
            stage: state.stage,
            total_sessions: state.total_sessions,
          });
        }
      } finally {
        // Whatever happened, never leave the badge held on the earlier stage.
        if (mountedRef.current) {
          setBadgePinned(false);
          setBadgeHold(null);
        }
      }
    })();
  }

  // Native App Store review sheet, then the friend-share card on the sessions
  // where that sheet will not appear. Deliberately not fired from handleComplete:
  // requesting the review mid-navigation loses the sheet silently. Waiting for
  // the summary's entrance animations to finish means it slides in over the
  // user's result, which is the moment it has earned.
  //
  // Pain is 1–10 with 10 the worst, so a lower "after" is an improvement.
  useEffect(() => {
    if (phase !== 'complete') return;
    if (isShareTestAccount(user?.email)) {
      shareOfferRef.current = { preview: false };
    }
    let cancelled = false;
    const task = InteractionManager.runAfterInteractions(() => {
      void (async () => {
        const testing = isShareTestAccount(user?.email);
        if (!testing) {
          // One dev completion skips the review sheet and arms the home share
          // sheet, so the next Back to Home can show it. Pain does not have to drop.
          const preview = await friendSharePreviewAvailable();
          if (cancelled) return;
          if (preview) {
            shareOfferRef.current = { preview: true };
            return;
          }
        }
        const review = await maybeRequestReviewAfterSession({
          triggerKey: id,
          painImproved: painAfter < painBefore,
          sourceScreen: 'session',
          planSessionId: id,
          ...(sessionMeta ? { weekNumber: sessionMeta.week_number } : {}),
        });
        if (cancelled) return;
        if (testing) {
          shareOfferRef.current = { preview: false };
          return;
        }
        const show = await considerFriendShare({
          triggerKey: id,
          painImproved: painAfter < painBefore,
          reviewMayDisplay: review.mayDisplay,
        });
        if (!cancelled && show) shareOfferRef.current = { preview: false };
      })();
    });
    return () => {
      cancelled = true;
      task.cancel();
    };
    // Intentionally keyed to the phase transition only: the pain values are
    // frozen by the time this screen renders, and re-running on them would
    // re-arm the task on every unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, id]);

  if (!loaded) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Skeleton height={SCREEN_WIDTH * 0.65} borderRadius={0} style={styles.skeletonVideo} />
        <Skeleton height={24} width={160} borderRadius={6} style={styles.skeletonText} />
      </View>
    );
  }

  // A session with no exercises must never start: with an empty list the exercise
  // phase has nothing to render and the player used to fall through straight to the
  // "Session Complete!" screen without writing a completion or advancing the program
  // pointer. Covers both load errors and legitimately empty/partial plan rows.
  if (loadError || exercises.length === 0) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.loadErrorTitle}>Could not load this session</Text>
        <Text style={styles.loadErrorText}>
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          style={[styles.primaryButton, { marginTop: 24 }]}
          onPress={() => {
            hapticPrimaryAction();
            loadSession();
          }}
        >
          <Text style={styles.primaryButtonText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.loadErrorBack}
          onPress={() => router.dismissTo('/(tabs)')}
        >
          <Text style={styles.loadErrorBackText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentExercise = exercises[exerciseIndex];
  const coachExercise: CoachExercise | null = currentExercise
    ? {
        id: currentExercise.id,
        name: currentExercise.name,
        instructions: currentExercise.instructions,
        description: currentExercise.description,
        holdSeconds: currentExercise.duration_seconds,
      }
    : null;
  const smallPhone = SCREEN_HEIGHT < 720;

  // --- SESSION PREVIEW ---
  if (phase === 'preview') {
    return (
      <SessionPreviewScreen
        sessionMeta={sessionMeta}
        exerciseCount={exerciseCount}
        equipmentItems={orderedEquipmentForExercises(exercises)}
        exercises={exercises}
        detailsById={detailsById}
        onBegin={() => setPhase('checkin_before')}
        onBack={() => router.back()}
        insets={insets}
        pet={pet}
      />
    );
  }

  // --- PAIN CHECK-IN (BEFORE) ---
  if (phase === 'checkin_before') {
    return (
      <PainCheckinView
        title="How is your pain right now?"
        value={painBefore}
        onValueChange={setPainBefore}
        buttonLabel="Begin Session"
        onSubmit={handleBeginSession}
        insets={insets}
        safetyNote
        phase="checkin_before"
        pet={pet}
      />
    );
  }

  // --- REST TIMER ---
  if (phase === 'rest') {
    // Between sets the "up next" is the SAME exercise's next set; between
    // exercises it is the next exercise in the session.
    const isSetRest = restKind === 'set';
    const nextEx = isSetRest ? currentExercise : exercises[exerciseIndex + 1];
    const nextSetNumber = setIndex + 1;
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <TouchableOpacity
          onPress={handleExit}
          style={[styles.exitButton, styles.restExitButton]}
          onLayout={trackRect('restExit')}
        >
          <Text style={styles.exitButtonText}>✕</Text>
        </TouchableOpacity>

        <View
          style={[styles.centered, styles.restBody, { paddingBottom: insets.bottom }]}
          onLayout={trackRect('restBody')}
        >
          <Text style={styles.restLabel}>Rest</Text>
          <RestRing
            seconds={restSeconds}
            total={restTotal}
            onLayout={trackRect('ring')}
          />

          {nextEx && (
            <View style={styles.nextExCard}>
              <Text style={styles.nextExLabel}>
                {isSetRest
                  ? `Up next: Set ${nextSetNumber} of ${nextEx.sets ?? 1}`
                  : 'Up next'}
              </Text>
              <Text style={styles.nextExName}>{nextEx.name}</Text>
              <Text style={styles.nextExDuration}>
                {formatDose(nextEx, !isSetRest, detailsById.get(nextEx.id)?.per_side === true)}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.skipButton}
            onPress={skipRest}
            onLayout={trackRect('skipRest')}
          >
            <Text style={styles.skipButtonText}>Skip Rest</Text>
          </TouchableOpacity>
        </View>

        {/* The buddy lives on a layer above everything, in front of the ring. */}
        {pet !== null && coachExercise ? (
          <PetCoach
            pet={pet}
            phase="rest"
            exercise={coachExercise}
            exerciseIndex={exerciseIndex}
            exerciseCount={exercises.length}
            setIndex={setIndex}
            restKind={restKind}
            restSeconds={restSeconds}
            restTotal={restTotal}
            countdown={0}
            holdRep={1}
            holdReps={1}
            exiting={exitOpen}
            maxSize={smallPhone ? 150 : 200}
            rects={coachRects}
            memory={coachMemory}
          />
        ) : null}
      </View>
    );
  }

  // --- EXERCISE ---
  if (phase === 'exercise' && currentExercise) {
    const exerciseDetail = detailsById.get(currentExercise.id) ?? null;
    const sideSuffix = exerciseDetail?.per_side === true ? ' each side' : '';
    const tempoLine = exerciseDetail?.tempo?.trim() ?? '';
    const guideDetail =
      exerciseDetail && hasGuideContent(exerciseDetail) ? exerciseDetail : null;
    const showPace =
      reduceMotion === false &&
      !currentExercise.duration_seconds &&
      Boolean(currentExercise.reps) &&
      pacePhaseLabels(exerciseDetail?.tempo_pattern ?? []) !== null;
    const guideSheetExercise = guideSheetId
      ? exercises.find((exercise) => exercise.id === guideSheetId) ?? null
      : null;
    const guideSheetDetail = guideSheetExercise
      ? detailsById.get(guideSheetExercise.id) ?? null
      : null;
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.exerciseTopBar} onLayout={trackRect('topBar')}>
          <View style={styles.exerciseTopRow}>
            <TouchableOpacity onPress={handleExit} style={styles.exitButton}>
              <Text style={styles.exitButtonText}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.exerciseProgress}>
              {exerciseIndex + 1} / {exercises.length}
            </Text>
            <TouchableOpacity onPress={handleSkipExercise} style={styles.skipExButton}>
              <Text style={styles.skipExButtonText}>Skip</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.exerciseProgressBar}>
            {exercises.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.exerciseProgressSegment,
                  i <= exerciseIndex && styles.exerciseProgressSegmentFilled,
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.videoContainer} onLayout={trackRect('video')}>
          {videoUrl ? (
            <>
              <VideoView
                player={player}
                style={styles.videoFullScreen}
                contentFit="cover"
                nativeControls={false}
                pointerEvents="none"
              />
              <TouchableOpacity
                style={styles.videoHitArea}
                onPress={toggleVideoPlayback}
                activeOpacity={1}
                accessibilityRole="button"
                accessibilityLabel={isPlaying ? 'Pause video' : 'Play video'}
              >
                <View style={[styles.videoControl, !isPlaying && styles.videoControlPaused]}>
                  <Text
                    style={[styles.videoControlGlyph, !isPlaying && styles.videoControlPlayGlyph]}
                  >
                    {isPlaying ? '❚❚' : '▶'}
                  </Text>
                </View>
              </TouchableOpacity>
            </>
          ) : videoError ? (
            <View style={styles.videoPlaceholder}>
              <Text style={styles.videoPlaceholderText}>Video unavailable</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setVideoError(false);
                  const ex = exercises[exerciseIndex];
                  if (!ex) return;
                  // Always re-resolve through the edge function: a stale signed URL is a
                  // likely reason playback failed, so reusing the old one would just fail
                  // again.
                  supabase.functions
                    .invoke('get-video-url', { body: { exerciseId: ex.id } })
                    .then(({ data, error }) => {
                      if (error || !data?.url) {
                        setVideoError(true);
                        return;
                      }
                      const url = data.url as string;
                      prefetchedUrls.current.set(ex.id, url);
                      void getVideoUri(url).then(setVideoUrl);
                    })
                    .catch(() => setVideoError(true));
                }}
              >
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.videoPlaceholder}>
              <Text style={styles.videoPlaceholderText}>{currentExercise.name}</Text>
            </View>
          )}
        </View>

        <View style={styles.exerciseInfo} onLayout={trackRect('info')}>
          {/* Name, dose, and the guide control: measured so the buddy never stands on them. */}
          <View style={{ alignSelf: 'flex-start' }} onLayout={trackRect('infoText')}>
            <Text style={styles.exerciseName}>{currentExercise.name}</Text>

            {(currentExercise.sets ?? 1) > 1 && (
              <Text style={styles.setIndicator}>
                Set {setIndex} of {currentExercise.sets}
              </Text>
            )}

            {currentExercise.duration_seconds ? (
              <Text style={styles.countdownText}>
                {currentExercise.reps
                  ? `Hold ${holdRep} of ${currentExercise.reps} · ${countdown}s${sideSuffix}`
                  : `${countdown}s remaining${sideSuffix}`}
              </Text>
            ) : currentExercise.reps ? (
              showPace && exerciseDetail ? (
                <View style={styles.doseRow}>
                  <Text style={[styles.countdownText, styles.countdownTextFlush]}>
                    {currentExercise.reps} reps{sideSuffix}
                  </Text>
                  <PaceRing pattern={exerciseDetail.tempo_pattern} />
                </View>
              ) : (
                <Text style={styles.countdownText}>
                  {currentExercise.reps} reps{sideSuffix}
                </Text>
              )
            ) : null}

            {tempoLine.length > 0 ? <Text style={styles.tempoHint}>{tempoLine}</Text> : null}

            {guideDetail ? (
              <ExerciseGuidePill
                pulse={guidePulseId === currentExercise.id}
                onPress={() => {
                  hapticSelection();
                  openGuide(currentExercise.id);
                }}
                onPulseEnd={endGuidePulse}
              />
            ) : null}
          </View>

          {currentExercise.instructions && (
            <Text style={styles.exerciseInstructions} onLayout={trackRect('caption')}>
              {currentExercise.instructions}
            </Text>
          )}
        </View>

        {/* Always available — on timed exercises it ends the current set early
            (finish ahead of the timer) without skipping the whole exercise. */}
        <View
          style={[styles.bottomButtonWrap, { paddingBottom: Math.max(insets.bottom, 24) }]}
          onLayout={trackRect('button')}
        >
          <TouchableOpacity style={styles.primaryButton} onPress={() => { hapticPrimaryAction(); handleSetDone(); }}>
            <Text style={styles.primaryButtonText}>
              {setIndex < (currentExercise.sets ?? 1) ? `Set ${setIndex} Done` : 'Done'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* The workout buddy lives on a layer above everything: standing on the floor in front of the info,
            standing in front of the info, leaning in from the side. */}
        {pet !== null && coachExercise ? (
          <PetCoach
            pet={pet}
            phase="exercise"
            exercise={coachExercise}
            exerciseIndex={exerciseIndex}
            exerciseCount={exercises.length}
            setIndex={setIndex}
            restKind={restKind}
            restSeconds={0}
            restTotal={1}
            countdown={countdown}
            holdRep={holdRep}
            holdReps={currentExercise.reps && currentExercise.reps > 0 ? currentExercise.reps : 1}
            exiting={exitOpen}
            maxSize={smallPhone ? 136 : 184}
            rects={coachRects}
            memory={coachMemory}
          />
        ) : null}

        {guideSheetExercise && guideSheetDetail && hasGuideContent(guideSheetDetail) ? (
          <ExerciseGuideSheet
            visible={guideVisible && guideSheetId === currentExercise.id}
            name={guideSheetExercise.name}
            detail={guideSheetDetail}
            onClose={closeGuide}
          />
        ) : null}
      </View>
    );
  }

  // --- PAIN CHECK-IN (AFTER) ---
  if (phase === 'checkin_after') {
    return (
      <PainCheckinView
        title="How is your pain now?"
        value={painAfter}
        onValueChange={setPainAfter}
        buttonLabel="Done"
        onSubmit={handleComplete}
        submitting={isSubmitting}
        insets={insets}
        phase="checkin_after"
        pet={pet}
      />
    );
  }

  // --- COMPLETE ---
  // Explicitly gated on phase: this block must be reachable only after handleComplete()
  // succeeded (server-side completion written, pointer advanced) — never as a render
  // fall-through from another phase.
  if (phase !== 'complete') {
    return <View style={styles.container} />;
  }

  const durationMin = Math.round((Date.now() - sessionStartTime.current) / 60000);
  const completedCount = exercises.length - skippedExercises.size;
  const painDelta = painBefore - painAfter;
  if (warmCopyRef.current === null) {
    warmCopyRef.current = WARM_COPY[Math.floor(Math.random() * WARM_COPY.length)] ?? '';
  }
  const warmCopy = warmCopyRef.current;
  if (petWarmCopyRef.current === null) {
    // The pet congratulates by name, with the number of exercises done.
    petWarmCopyRef.current = fillPetLine(
      PET_COMPLETE[Math.floor(Math.random() * PET_COMPLETE.length)] ?? '',
      { n: completedCount },
    );
  }
  const petWarmCopy = petWarmCopyRef.current;
  const petCompleteMood: PetMood =
    painAfter > painBefore
      ? 'concerned'
      : !landed
        ? 'ready'
        : completeCheer
          ? 'cheer'
          : 'celebrating';
  const compactHeight = SCREEN_HEIGHT < 720;
  const badgeSize = COMPLETE_BADGE_SIZE;
  const showNextSession = nextSession !== null && !isProgramCompleted;
  const showPetStrip = pet !== null && !(compactHeight && showNextSession);
  const petStage = pet?.stage;
  const petGrewLine =
    pet && grewFrom !== null && petStage !== undefined && petStage !== 1
      ? petLine(PET_GREW_LINES[petStage], pet.name)
      : null;
  const badgeStage: PetStage | null = badgePinned ? badgeHold : (pet?.stage ?? null);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={[styles.centered, { flex: 1 }]}>
      <Animated.View
        style={[
          pet ? styles.completePetWrap : styles.completeIconWrap,
          // The pet does not grow in from nothing: he drops in from above and lands.
          pet ? null : { transform: [{ scale: completionScale }] },
        ]}
      >
        {pet ? (
          <Animated.View style={completeDropStyle}>
          {grewFrom !== null && landed ? (
            <PetGrow
              from={grewFrom}
              to={pet.stage}
              mood={petCompleteMood}
              size={badgeSize}
              onDone={() => setGrowDone(true)}
            />
          ) : badgeStage !== null ? (
            <PetBadge stage={grewFrom ?? badgeStage} mood={petCompleteMood} size={badgeSize} />
          ) : (
            <View style={{ width: badgeSize, height: badgeSize }} />
          )}
          <View pointerEvents="none" style={styles.completeDust}>
            <Dust ref={completeDust} color="rgba(190, 160, 125, 0.6)" />
          </View>
          </Animated.View>
        ) : (
          <Text style={styles.completeIcon}>✓</Text>
        )}
      </Animated.View>

      <Text style={styles.completeTitle}>Session Complete!</Text>

      <Animated.View
        style={[
          styles.completeSummaryCard,
          completeEnter[0],
        ]}
      >
        <View style={styles.completeStatItem}>
          <Text style={styles.completeStatValue}>{durationMin}</Text>
          <Text style={styles.completeStatUnit}>min</Text>
        </View>
        <View style={styles.completeStatDividerVert} />
        <View style={styles.completeStatItem}>
          <Text style={styles.completeStatValue}>{completedCount}</Text>
          <Text style={styles.completeStatUnit}>exercises</Text>
        </View>
        {painDelta > 0 && (
          <>
            <View style={styles.completeStatDividerVert} />
            <View style={styles.completeStatItem}>
              <Text style={styles.completeStatValue}>-{painDelta}</Text>
              <Text style={styles.completeStatUnit}>pain</Text>
            </View>
          </>
        )}
      </Animated.View>

      <Animated.View
        style={[{ alignItems: 'center' }, completeEnter[1]]}
      >
        {!pet ? (
          <Text style={styles.warmCopy}>{warmCopy}</Text>
        ) : petGrewLine !== null ? (
          <>
            <Text style={[styles.warmCopy, styles.petGrewTitle]}>
              {petLine(PET_GREW_TITLE, pet.name)}
            </Text>
            <Text style={styles.warmCopy}>{petGrewLine}</Text>
          </>
        ) : painAfter > painBefore ? (
          <Text style={styles.warmCopy}>{petLine(PET_PAIN_UP_LINE, pet.name)}</Text>
        ) : (
          <Text style={styles.warmCopy}>{petLine(petWarmCopy, pet.name)}</Text>
        )}
      </Animated.View>

      {pet && showPetStrip && (
        <Animated.View
          style={[
            styles.completePetCard,
            completeEnter[1],
          ]}
        >
          <PetStageStrip stage={pet.stage} size={48} />
          <Text style={styles.completePetGrowth}>{petGrowthCopy(pet)}</Text>
        </Animated.View>
      )}

      {nextSession && !isProgramCompleted && (
        <Animated.View
          style={[
            styles.nextSessionCard,
            completeEnter[2],
          ]}
        >
          <Text style={styles.nextSessionLabel}>Next session</Text>
          <Text style={styles.nextSessionTitle}>{nextSession.title}</Text>
        </Animated.View>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, { marginTop: 24 }]}
        onPress={() => {
          hapticPrimaryAction();
          if (isProgramCompleted) {
            const offer = shareOfferRef.current;
            shareOfferRef.current = null;
            void (async () => {
              if (offer && isShareTestAccount(user?.email)) {
                const painImproved = painAfter < painBefore;
                await armFriendShareHome({ painImproved });
                friendShareArmed({
                  source_screen: 'session',
                  has_name: Boolean(firstNameFromDisplayName(resolveDisplayName(null, user))),
                  pain_improved: painImproved,
                });
              }
              router.replace('/program-complete');
            })();
            return;
          }
          const offer = shareOfferRef.current;
          shareOfferRef.current = null;
          void (async () => {
            if (offer) {
              const painImproved = painAfter < painBefore;
              const hasName = Boolean(
                firstNameFromDisplayName(resolveDisplayName(null, user)),
              );
              if (offer.preview) await claimFriendSharePreview();
              await armFriendShareHome({ painImproved });
              friendShareArmed({
                source_screen: 'session',
                has_name: hasName,
                pain_improved: painImproved,
              });
            }
            router.dismissTo('/(tabs)');
          })();
        }}
      >
        <Text style={styles.primaryButtonText}>
          {isProgramCompleted ? 'View Summary' : 'Back to Home'}
        </Text>
      </TouchableOpacity>
    </View>
    </View>
  );
}

// --- Session Preview Component ---
// The whole point of this screen is to surface what the home card doesn't:
// equipment needed, time, exercise count, and the session's main focus.
// No decorative icon — the stat grid below is the content.
function SessionPreviewScreen({
  sessionMeta,
  exerciseCount,
  equipmentItems,
  exercises,
  detailsById,
  onBegin,
  onBack,
  insets,
  pet,
}: {
  sessionMeta: { title: string; duration_minutes: number; week_number: number; session_number: number; phase: string } | null;
  exerciseCount: number;
  equipmentItems: string[];
  exercises: Exercise[];
  detailsById: ReadonlyMap<string, ExerciseDetail>;
  onBegin: () => void;
  onBack: () => void;
  insets: { top: number; bottom: number };
  pet: PetState | null;
}) {
  // Visible during the native push — fading the whole preview from 0 made
  // the incoming session screen look blank, then pop in after the slide.

  const focusLabel = sessionMeta ? PHASE_LABEL[sessionMeta.phase] ?? sessionMeta.phase : '';

  return (
    <View
      style={[
        previewStyles.container,
        { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 32) },
      ]}
    >
      <View style={[previewStyles.topBar, { marginTop: 8 }]}>
        <TouchableOpacity style={previewStyles.backButton} onPress={onBack}>
          <Text style={previewStyles.backButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={previewStyles.body}
        contentContainerStyle={previewStyles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={previewStyles.hero}>
          {pet ? (
            <View style={previewStyles.petWrap}>
              <PetBadge stage={pet.stage} mood="coach" size={SCREEN_HEIGHT < 720 ? 88 : 120} />
            </View>
          ) : null}
          <Text style={previewStyles.preLabel}>
            {sessionMeta
              ? `Week ${sessionMeta.week_number} · Session ${sessionMeta.session_number}`
              : 'Session preview'}
          </Text>
          {sessionMeta ? <Text style={previewStyles.title}>{sessionMeta.title}</Text> : null}
          <View style={previewStyles.chips}>
            <View style={previewStyles.chip}>
              <Text style={previewStyles.chipText}>{sessionMeta?.duration_minutes ?? '-'} min</Text>
            </View>
            <View style={previewStyles.chip}>
              <Text style={previewStyles.chipText}>
                {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'}
              </Text>
            </View>
            {focusLabel ? (
              <View style={previewStyles.chip}>
                <Text style={previewStyles.chipText}>{focusLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {equipmentItems.length > 0 ? (
          <View style={previewStyles.equip}>
            <Text style={previewStyles.equipLabel}>What you'll need</Text>
            <View style={previewStyles.equipRow}>
              {equipmentItems.map((item) => (
                <View key={item} style={previewStyles.equipChip}>
                  <Text style={previewStyles.equipChipText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {exercises.length > 0 ? (
          <View style={previewStyles.list}>
            {exercises.map((exercise, index) => {
              const dose = formatDose(
                exercise,
                true,
                detailsById.get(exercise.id)?.per_side === true,
              );
              return (
                <View
                  key={`${exercise.id}-${index}`}
                  style={previewStyles.listRow}
                  accessible
                  accessibilityLabel={`${index + 1}. ${exercise.name}${dose ? `, ${dose}` : ''}`}
                >
                  <Text style={previewStyles.listIndex}>{index + 1}</Text>
                  <View style={previewStyles.listBody}>
                    <Text style={previewStyles.listName}>{exercise.name}</Text>
                    {dose ? <Text style={previewStyles.listDose}>{dose}</Text> : null}
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}
      </ScrollView>

      <MedicalDisclaimer style={previewStyles.disclaimer} />
      <TouchableOpacity style={previewStyles.beginButton} onPress={() => { hapticPrimaryAction(); onBegin(); }} activeOpacity={0.85}>
        <Text style={previewStyles.beginButtonText}>Let's go</Text>
        <View style={previewStyles.beginArrow}>
          <Text style={previewStyles.beginArrowText}>→</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const previewStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: 24,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  body: {
    flex: 1,
    marginTop: 20,
  },
  bodyContent: {
    paddingBottom: 8,
  },
  hero: {
    backgroundColor: colors.primaryMuted,
    borderRadius: 32,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
  },
  petWrap: {
    alignItems: 'center',
    marginBottom: 16,
  },
  preLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 10,
  },
  title: {
    fontFamily: serifFont,
    fontSize: 34,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 16,
    lineHeight: 39,
    letterSpacing: -0.6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(62, 107, 78, 0.18)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  equip: {
    marginTop: 24,
    paddingHorizontal: 4,
  },
  equipLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 10,
  },
  equipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  equipChip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  equipChipText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  list: {
    marginTop: 20,
    paddingHorizontal: 4,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 6,
  },
  listIndex: {
    width: 24,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: colors.primary,
    fontVariant: ['tabular-nums'],
  },
  listBody: {
    flex: 1,
  },
  listName: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  listDose: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginTop: 2,
  },
  disclaimer: {
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  beginButton: {
    height: 56,
    borderRadius: 999,
    backgroundColor: '#17261C',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  beginButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  beginArrow: {
    position: 'absolute',
    right: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  beginArrowText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});

// --- Pain Check-In Slider Component ---
const SLIDER_THUMB = 24;

function PainCheckinView({
  title,
  value,
  onValueChange,
  buttonLabel,
  onSubmit,
  submitting = false,
  insets,
  safetyNote = false,
  phase,
  pet,
}: {
  title: string;
  value: number;
  onValueChange: (v: number) => void;
  buttonLabel: string;
  onSubmit: () => void;
  submitting?: boolean;
  insets: { top: number; bottom: number };
  /** Shows the pre-exercise safety reminder (before check-in only). */
  safetyNote?: boolean;
  phase: 'checkin_before' | 'checkin_after';
  pet: PetState | null;
}) {
  const sliderRef = useRef<View>(null);
  const [sliderLayoutWidth, setSliderLayoutWidth] = useState(0);
  const [sliderMoved, setSliderMoved] = useState(false);
  const [movedPhase, setMovedPhase] = useState(phase);
  if (movedPhase !== phase) {
    setMovedPhase(phase);
    setSliderMoved(false);
  }

  function handleSliderTouch(pageX: number) {
    sliderRef.current?.measure((_x, _y, width, _height, px) => {
      const position = Math.max(0, Math.min(pageX - px, width));
      const val = Math.max(1, Math.min(10, Math.round((position / width) * 9) + 1));
      // Notched feel: tick only when the integer value actually changes.
      if (val !== value) {
        hapticSelection();
        onValueChange(val);
        setSliderMoved(true);
      }
    });
  }

  const checkinPrompt = phase === 'checkin_before' ? PET_CHECKIN_BEFORE_PROMPT : PET_CHECKIN_AFTER_PROMPT;
  const checkinSpeech = sliderMoved ? petCheckinReaction(value) : null;

  const thumbPosition = sliderLayoutWidth > 0
    ? ((value - 1) / 9) * (sliderLayoutWidth - SLIDER_THUMB)
    : null;
  const fillWidth = thumbPosition !== null ? thumbPosition + SLIDER_THUMB / 2 : 0;

  return (
    <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
      {pet ? (
        <View style={styles.checkinPet}>
          <PetSays
            stage={pet.stage}
            mood={checkinSpeech?.mood ?? 'ready'}
            line={checkinSpeech?.line ?? checkinPrompt}
            size={72}
          />
        </View>
      ) : null}
      <Text style={styles.checkinTitle}>{title}</Text>
      <Text style={styles.painScore}>{value}</Text>
      <Text style={styles.painScoreSub}>out of 10</Text>

      <View
        ref={sliderRef}
        style={styles.sliderTrack}
        onLayout={(e) => setSliderLayoutWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => handleSliderTouch(e.nativeEvent.pageX)}
        onResponderMove={(e) => handleSliderTouch(e.nativeEvent.pageX)}
      >
        <View style={styles.sliderRail} pointerEvents="none" />
        {sliderLayoutWidth > 0 && (
          <View style={[styles.sliderFill, { width: fillWidth }]} pointerEvents="none" />
        )}
        {thumbPosition !== null && (
          <View style={[styles.sliderThumb, { left: thumbPosition }]} pointerEvents="none">
            <View style={styles.sliderThumbDot} />
          </View>
        )}
      </View>

      <View style={styles.sliderEnds}>
        <Text style={styles.sliderEndLabel}>None</Text>
        <Text style={styles.sliderEndLabel}>Severe</Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, submitting && styles.primaryButtonDisabled]}
        onPress={onSubmit}
        disabled={submitting}
      >
        <Text style={styles.primaryButtonText}>{submitting ? 'Saving\u2026' : buttonLabel}</Text>
      </TouchableOpacity>

      {safetyNote && (
        <Text style={styles.safetyNote}>
          Stop if pain is severe, spreading, or with numbness or weakness. See a
          clinician. Remedy is not medical care.
        </Text>
      )}
    </View>
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
    paddingHorizontal: 24,
  },
  checkinPet: {
    alignSelf: 'stretch',
    marginBottom: 20,
  },
  checkinTitle: {
    fontFamily: serifFont,
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 28,
    textAlign: 'center',
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  safetyNote: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: 16,
  },
  painScore: {
    fontSize: 64,
    fontWeight: '600',
    color: colors.textPrimary,
    letterSpacing: -1.5,
    lineHeight: 72,
    fontVariant: ['tabular-nums'],
  },
  painScoreSub: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textTertiary,
    marginBottom: 40,
    letterSpacing: 0.3,
  },

  // Slider
  sliderTrack: {
    width: '100%',
    height: 44,
    justifyContent: 'center',
  },
  sliderRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 20,
    height: 4,
    borderRadius: radius.circle,
    backgroundColor: colors.border,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    top: 20,
    height: 4,
    borderRadius: radius.circle,
    backgroundColor: colors.primary,
  },
  sliderThumb: {
    position: 'absolute',
    top: 10,
    width: SLIDER_THUMB,
    height: SLIDER_THUMB,
    borderRadius: radius.circle,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
  },
  sliderThumbDot: {
    width: 8,
    height: 8,
    borderRadius: radius.circle,
    backgroundColor: colors.primary,
  },
  sliderEnds: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
    marginBottom: 36,
  },
  sliderEndLabel: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textTertiary,
    letterSpacing: 0.2,
  },

  primaryButton: {
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  // Rest
  restLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 20,
  },
  restRingWrap: {
    width: REST_RING_SIZE,
    height: REST_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  restRingAbovePet: {
    marginBottom: 0,
  },
  restPet: {
    alignSelf: 'stretch',
    marginTop: 16,
    marginBottom: 16,
  },
  restRingCenter: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  restTimer: {
    fontSize: 64,
    fontWeight: '700',
    color: colors.primary,
    lineHeight: 70,
    fontVariant: ['tabular-nums'],
  },
  restTimerUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  restExitButton: {
    position: 'absolute',
    top: 12,
    left: 16,
    zIndex: 10,
  },
  restBody: {
    flex: 1,
  },
  nextExCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 24,
  },
  nextExLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 4,
  },
  nextExName: {
    fontFamily: serifFont,
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
    textAlign: 'center',
  },
  nextExDuration: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  skipButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadows.low,
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },

  // Exercise top bar
  exerciseTopBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 10,
  },
  exerciseTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseProgressBar: {
    flexDirection: 'row',
    gap: 4,
  },
  exerciseProgressSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderLight,
  },
  exerciseProgressSegmentFilled: {
    backgroundColor: colors.primary,
  },
  exitButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  exerciseProgress: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  skipExButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  skipExButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },

  // Video
  videoContainer: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.65,
    backgroundColor: colors.textPrimary,
    position: 'relative',
  },
  videoFullScreen: {
    width: '100%',
    height: '100%',
  },
  videoHitArea: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    padding: 12,
  },
  videoControl: {
    width: 48,
    height: 48,
    borderRadius: radius.circle,
    backgroundColor: 'rgba(28, 28, 30, 0.48)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoControlPaused: {
    backgroundColor: 'rgba(28, 28, 30, 0.72)',
  },
  videoControlGlyph: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  videoControlPlayGlyph: {
    paddingLeft: 3,
  },
  videoPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlaceholderText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  // Exercise info
  exerciseInfo: {
    padding: 24,
    flex: 1,
  },
  exerciseName: {
    fontFamily: serifFont,
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.4,
    lineHeight: 34,
  },
  setIndicator: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 6,
  },
  countdownText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 12,
    fontVariant: ['tabular-nums'],
  },
  countdownTextFlush: {
    marginBottom: 0,
    flexShrink: 1,
  },
  doseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  tempoHint: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  exerciseInstructions: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 23,
  },

  // Rep tracker
  repTracker: {
    marginTop: 12,
    marginBottom: 8,
  },
  repCirclesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  repCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.circle,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  repCircleDone: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  repCircleActive: {
    borderColor: colors.primary,
  },
  repCircleText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  repCircleTextDone: {
    color: '#FFFFFF',
  },
  repCircleTextActive: {
    color: colors.primary,
  },
  repCue: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Bottom "Done" button for non-rep non-timed exercises
  bottomButtonWrap: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },

  // Complete
  completeIconWrap: {
    width: 80,
    height: 80,
    borderRadius: radius.circle,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    ...shadows.high,
    shadowColor: colors.secondary,
    shadowOpacity: 0.35,
  },
  completeIcon: {
    fontSize: 36,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Where the landing dust is drawn: along the bottom of the pet's box.
  completeDust: {
    position: 'absolute',
    left: 0,
    bottom: 6,
    width: 1,
    height: 24,
  },
  completePetWrap: {
    marginBottom: 16,
  },
  completeTitle: {
    fontFamily: serifFont,
    fontSize: 32,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  completeSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginBottom: 20,
    width: '100%',
  },
  completeStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  completeStatValue: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: 2,
  },
  completeStatUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.2,
  },
  completeStatDividerVert: {
    width: 1,
    height: 32,
    backgroundColor: colors.borderLight,
  },
  warmCopy: {
    fontSize: 15,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 20,
  },
  petGrewTitle: {
    color: colors.primary,
    fontWeight: '700',
    marginBottom: 4,
  },
  completePetCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 20,
    width: '100%',
  },
  completePetGrowth: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  nextSessionCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
  },
  nextSessionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 4,
  },
  nextSessionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // Skeleton
  skeletonVideo: {
    marginTop: 60,
  },
  skeletonText: {
    marginHorizontal: 24,
    marginTop: 16,
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: radius.chip,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ── Session load error ──
  loadErrorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8,
  },
  loadErrorText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  loadErrorBack: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  loadErrorBackText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
