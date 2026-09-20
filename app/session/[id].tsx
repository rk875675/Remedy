import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Animated,
  AppState,
  Easing,
  InteractionManager,
} from 'react-native';
import { useEvent, useEventListener } from 'expo';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView } from 'expo-video';
import { useSilentVideoPlayer } from '../../lib/videoPlayer';
import { getCachedVideoUri, getVideoUri, prefetchVideo } from '../../lib/videoCache';
import { invalidateTabRefresh } from '../../lib/tabRefresh';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
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
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import {
  hapticSessionComplete,
  hapticWarning,
  hapticPrimaryAction,
  hapticSelection,
} from '../../lib/haptics';
import { Skeleton } from '../../components/ui/Skeleton';
import {
  incrementSessionsCompleted,
  maybeRequestReviewAfterSession,
} from '../../lib/app-store-review';
import { orderedEquipmentForExercises } from '../../lib/equipment';
import { MedicalDisclaimer } from '../../components/legal/MedicalDisclaimer';
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

function RestRing({ seconds, total }: { seconds: number; total: number }) {
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
    <View style={styles.restRingWrap}>
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
  activation: 'Activation',
  strength: 'Strength',
  recovery: 'Recovery',
};

// One-line dose summary, e.g. "3 sets × 5 × 10s holds", "3 sets × 12 reps",
// "2 sets × 40s". withSets=false drops the set prefix (used for set-rest,
// where the set counter is shown separately).
function formatDose(
  ex: Pick<Exercise, 'sets' | 'reps' | 'duration_seconds'>,
  withSets: boolean,
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
  return withSets && sets > 1 ? `${sets} sets × ${dose}` : dose;
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
  const [painBefore, setPainBefore] = useState(5);
  const [painAfter, setPainAfter] = useState(5);
  const [restSeconds, setRestSeconds] = useState(0);
  const [restTotal, setRestTotal] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
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

  const toggleVideoPlayback = useCallback(() => {
    hapticSelection();
    if (player.playing) {
      player.pause();
      return;
    }
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
              sets: r.sets ?? r.exercises.sets,
              reps: r.reps ?? r.exercises.reps,
              duration_seconds: r.duration_seconds ?? r.exercises.duration_seconds,
              rest_seconds: r.rest_seconds ?? r.exercises.rest_seconds,
            };
          })
          .filter((e): e is Exercise => e !== null);
        setExercises(exs);
        setExerciseCount(exs.length);
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
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
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
  function reportAbandon(exitType: 'user_exit' | 'backgrounded') {
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
    Alert.alert(
      'Exit session?',
      'This session isn\u2019t finished yet \u2014 you can resume it anytime.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          // Pop back to the existing tabs entry (dismissTo) rather than stacking a
          // duplicate — Home refreshes via its focus effect.
          onPress: () => {
            reportAbandon('user_exit');
            router.dismissTo('/(tabs)');
          },
        },
      ],
    );
  }

  async function handleBeginSession() {
    hapticPrimaryAction();
    if (!user || !id) return;
    await supabase.from('pain_checkins').insert({
      user_id: user.id,
      score: painBefore,
      type: 'before' as const,
    });
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
    const { data, error } = await supabase.rpc('complete_session', {
      p_plan_session_id: id,
      p_duration_seconds: durationSeconds,
      p_pain_after: painAfter,
    });

    if (error || !data) {
      setIsSubmitting(false);
      const reason = error ? classifyCompletionError(error.message) : 'not_current_session';
      sessionCompletionFailed({ reason, plan_session_id: id });
      hapticWarning();

      // A dropped connection must not throw away a finished workout. Stay on this screen
      // so Try again re-sends the same completion; the server's pointer guard makes a
      // duplicate impossible, so retrying is safe.
      if (reason === 'network') {
        Alert.alert(
          'Could not save this session',
          "The connection dropped. Your session is still here — try again.",
          [
            { text: 'Try again', onPress: () => void handleComplete() },
            { text: 'Not now', style: 'cancel' },
          ],
        );
        return;
      }

      // Migration 057 gates week N on a ramp decision for week N-1. Saying "this isn't
      // your current session" here told the user nothing actionable. Home redirects to
      // /weekly-ramp whenever pending_ramp_week is set, so routing there unblocks them
      // without this screen having to work out the week number.
      if (error && error.message.toLowerCase().includes('weekly_ramp_required')) {
        Alert.alert(
          'One step first',
          'Check in on how last week went, then come back and finish this session.',
          [{ text: 'Continue', onPress: () => router.dismissTo('/(tabs)') }],
        );
        return;
      }

      // Otherwise the session genuinely isn't the user's current one (deep-link / replay
      // / already completed). Don't corrupt UI state — send them back to Home where the
      // real next session is surfaced.
      Alert.alert(
        'Could not save this session',
        'This session is no longer your current one. Returning you to your plan.',
        [{ text: 'OK', onPress: () => router.dismissTo('/(tabs)') }],
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
      router.replace(`/weekly-ramp?week=${result.completed_week}`);
      return;
    }

    setPhase('complete');
  }

  // Native App Store review sheet. Deliberately not fired from handleComplete:
  // requesting it mid-navigation loses the sheet silently. Waiting for the
  // summary's entrance animations to finish means it slides in over the user's
  // result, which is the moment it has earned.
  //
  // Pain is 1–10 with 10 the worst, so a lower "after" is an improvement.
  useEffect(() => {
    if (phase !== 'complete') return;
    const task = InteractionManager.runAfterInteractions(() => {
      void maybeRequestReviewAfterSession({
        triggerKey: id,
        painImproved: painAfter < painBefore,
        sourceScreen: 'session',
        planSessionId: id,
        ...(sessionMeta ? { weekNumber: sessionMeta.week_number } : {}),
      });
    });
    return () => task.cancel();
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

  // --- SESSION PREVIEW ---
  if (phase === 'preview') {
    return (
      <SessionPreviewScreen
        sessionMeta={sessionMeta}
        exerciseCount={exerciseCount}
        equipmentItems={orderedEquipmentForExercises(exercises)}
        onBegin={() => setPhase('checkin_before')}
        onBack={() => router.back()}
        insets={insets}
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
        <TouchableOpacity onPress={handleExit} style={[styles.exitButton, styles.restExitButton]}>
          <Text style={styles.exitButtonText}>✕</Text>
        </TouchableOpacity>

        <View style={[styles.centered, styles.restBody, { paddingBottom: insets.bottom }]}>
          <Text style={styles.restLabel}>Rest</Text>
          <RestRing seconds={restSeconds} total={restTotal} />

          {nextEx && (
            <View style={styles.nextExCard}>
              <Text style={styles.nextExLabel}>
                {isSetRest
                  ? `Up next: Set ${nextSetNumber} of ${nextEx.sets ?? 1}`
                  : 'Up next'}
              </Text>
              <Text style={styles.nextExName}>{nextEx.name}</Text>
              <Text style={styles.nextExDuration}>
                {formatDose(nextEx, !isSetRest)}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.skipButton} onPress={skipRest}>
            <Text style={styles.skipButtonText}>Skip Rest</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // --- EXERCISE ---
  if (phase === 'exercise' && currentExercise) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.exerciseTopBar}>
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

        <View style={styles.videoContainer}>
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

        <View style={styles.exerciseInfo}>
          <Text style={styles.exerciseName}>{currentExercise.name}</Text>

          {(currentExercise.sets ?? 1) > 1 && (
            <Text style={styles.setIndicator}>
              Set {setIndex} of {currentExercise.sets}
            </Text>
          )}

          {currentExercise.duration_seconds ? (
            <Text style={styles.countdownText}>
              {currentExercise.reps
                ? `Hold ${holdRep} of ${currentExercise.reps} · ${countdown}s`
                : `${countdown}s remaining`}
            </Text>
          ) : currentExercise.reps ? (
            <Text style={styles.countdownText}>{currentExercise.reps} reps</Text>
          ) : null}

          {currentExercise.instructions && (
            <Text style={styles.exerciseInstructions}>
              {currentExercise.instructions}
            </Text>
          )}
        </View>

        {/* Always available — on timed exercises it ends the current set early
            (finish ahead of the timer) without skipping the whole exercise. */}
        <View style={[styles.bottomButtonWrap, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <TouchableOpacity style={styles.primaryButton} onPress={() => { hapticPrimaryAction(); handleSetDone(); }}>
            <Text style={styles.primaryButtonText}>
              {setIndex < (currentExercise.sets ?? 1) ? `Set ${setIndex} Done` : 'Done'}
            </Text>
          </TouchableOpacity>
        </View>
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
  const warmCopy = WARM_COPY[Math.floor(Math.random() * WARM_COPY.length)];

  return (
    <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
      <Animated.View
        style={[
          styles.completeIconWrap,
          { transform: [{ scale: completionScale }] },
        ]}
      >
        <Text style={styles.completeIcon}>✓</Text>
      </Animated.View>

      <Text style={styles.completeTitle}>Session Complete!</Text>

      <Animated.View
        style={[
          styles.completeSummaryCard,
          {
            opacity: completeStatAnims[0],
            transform: [
              {
                translateY: completeStatAnims[0].interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, 0],
                }),
              },
            ],
          },
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
        style={{
          alignItems: 'center',
          opacity: completeStatAnims[1],
          transform: [
            {
              translateY: completeStatAnims[1].interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        }}
      >
        <Text style={styles.warmCopy}>{warmCopy}</Text>
      </Animated.View>

      {nextSession && !isProgramCompleted && (
        <Animated.View
          style={[
            styles.nextSessionCard,
            {
              opacity: completeStatAnims[2],
              transform: [
                {
                  translateY: completeStatAnims[2].interpolate({
                    inputRange: [0, 1],
                    outputRange: [10, 0],
                  }),
                },
              ],
            },
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
            router.replace('/program-complete');
          } else {
            router.dismissTo('/(tabs)');
          }
        }}
      >
        <Text style={styles.primaryButtonText}>
          {isProgramCompleted ? 'View Summary' : 'Back to Home'}
        </Text>
      </TouchableOpacity>
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
  onBegin,
  onBack,
  insets,
}: {
  sessionMeta: { title: string; duration_minutes: number; week_number: number; session_number: number; phase: string } | null;
  exerciseCount: number;
  equipmentItems: string[];
  onBegin: () => void;
  onBack: () => void;
  insets: { top: number; bottom: number };
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
        {sessionMeta && (
          <View style={previewStyles.badge}>
            <Text style={previewStyles.badgeText}>
              W{sessionMeta.week_number} · S{sessionMeta.session_number}
            </Text>
          </View>
        )}
      </View>

      <View style={previewStyles.body}>
        <Text style={previewStyles.preLabel}>Session Preview</Text>
        {sessionMeta && <Text style={previewStyles.title}>{sessionMeta.title}</Text>}

        <View style={previewStyles.grid}>
          <View style={previewStyles.gridTile}>
            <Text style={previewStyles.gridValue}>{sessionMeta?.duration_minutes ?? '-'}</Text>
            <Text style={previewStyles.gridLabel}>Minutes</Text>
          </View>
          <View style={previewStyles.gridTile}>
            <Text style={previewStyles.gridValue}>{exerciseCount}</Text>
            <Text style={previewStyles.gridLabel}>Exercises</Text>
          </View>
          <View style={[previewStyles.gridTile, previewStyles.gridTileWide]}>
            <Text style={previewStyles.gridValueSmall}>{focusLabel || '-'}</Text>
            <Text style={previewStyles.gridLabel}>Main Focus</Text>
          </View>
          <View style={[previewStyles.gridTile, previewStyles.gridTileWide]}>
            <View style={previewStyles.equipmentList}>
              {equipmentItems.map((item) => (
                <Text key={item} style={previewStyles.equipmentItem}>
                  {item}
                </Text>
              ))}
            </View>
            <Text style={previewStyles.gridLabel}>Equipment Needed</Text>
          </View>
        </View>
      </View>

      <MedicalDisclaimer style={previewStyles.disclaimer} />
      <TouchableOpacity style={previewStyles.beginButton} onPress={() => { hapticPrimaryAction(); onBegin(); }} activeOpacity={0.85}>
        <Text style={previewStyles.beginButtonText}>Let's go</Text>
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
  badge: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radius.chip,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primaryDeep,
    letterSpacing: 0.4,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  preLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 28,
    lineHeight: 34,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  gridTile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: 20,
    paddingHorizontal: 16,
    ...shadows.low,
  },
  gridTileWide: {
    flexBasis: '100%',
  },
  gridValue: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
    marginBottom: 4,
  },
  gridValueSmall: {
    fontSize: 19,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  equipmentList: {
    gap: 2,
    marginBottom: 4,
  },
  equipmentItem: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 22,
  },
  gridLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  disclaimer: {
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  beginButton: {
    height: 56,
    borderRadius: radius.button,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.25,
  },
  beginButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.2,
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
}) {
  const sliderRef = useRef<View>(null);
  const [sliderLayoutWidth, setSliderLayoutWidth] = useState(0);

  function handleSliderTouch(pageX: number) {
    sliderRef.current?.measure((_x, _y, width, _height, px) => {
      const position = Math.max(0, Math.min(pageX - px, width));
      const val = Math.max(1, Math.min(10, Math.round((position / width) * 9) + 1));
      // Notched feel: tick only when the integer value actually changes.
      if (val !== value) {
        hapticSelection();
        onValueChange(val);
      }
    });
  }

  const thumbPosition = sliderLayoutWidth > 0
    ? ((value - 1) / 9) * (sliderLayoutWidth - SLIDER_THUMB)
    : null;
  const fillWidth = thumbPosition !== null ? thumbPosition + SLIDER_THUMB / 2 : 0;

  return (
    <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
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
  checkinTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 28,
    textAlign: 'center',
    letterSpacing: -0.3,
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
    borderRadius: radius.button,
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
    fontSize: 14,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 20,
  },
  restRingWrap: {
    width: REST_RING_SIZE,
    height: REST_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
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
    borderRadius: radius.card,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    marginBottom: 24,
    ...shadows.low,
  },
  nextExLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  nextExName: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
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
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  setIndicator: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  countdownText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.primary,
    marginBottom: 12,
    fontVariant: ['tabular-nums'],
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
  completeTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 8,
  },
  completeSummaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginBottom: 20,
    width: '100%',
    ...shadows.low,
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
    textTransform: 'uppercase',
    letterSpacing: 1,
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
  nextSessionCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
    ...shadows.low,
  },
  nextSessionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
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
