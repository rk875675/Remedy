import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { trackEvent } from '../../lib/analytics';
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
import type { Exercise, UserPlanSession } from '../../types/database';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// --- Rest timer depleting ring ---
const REST_RING_SIZE = 220;
const REST_RING_STROKE = 10;
const REST_RING_RADIUS = (REST_RING_SIZE - REST_RING_STROKE) / 2;
const REST_RING_CIRCUMFERENCE = 2 * Math.PI * REST_RING_RADIUS;

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
  'One session closer to feeling better.',
];

const BREATHING_CYCLE_MS = 4000;

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
  } | null>(null);
  const [exerciseCount, setExerciseCount] = useState(0);
  const [exerciseIndex, setExerciseIndex] = useState(0);
  const [painBefore, setPainBefore] = useState(5);
  const [painAfter, setPainAfter] = useState(5);
  const [restSeconds, setRestSeconds] = useState(0);
  const [restTotal, setRestTotal] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [skippedExercises, setSkippedExercises] = useState<Set<number>>(new Set());
  const [breatheIn, setBreatheIn] = useState(true);
  const [nextSession, setNextSession] = useState<UserPlanSession | null>(null);
  const [isProgramCompleted, setIsProgramCompleted] = useState(false);

  const player = useVideoPlayer(null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Sync video source → player whenever the URL resolves for a new exercise
  useEffect(() => {
    if (videoUrl) {
      player.replace({ uri: videoUrl });
      player.play();
    } else {
      player.pause();
    }
  }, [videoUrl, player]);

  // Sync mute toggle → player
  useEffect(() => {
    player.muted = isMuted;
  }, [isMuted, player]);

  const sessionStartTime = useRef(Date.now());
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breatheRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionScale = useRef(new Animated.Value(0)).current;
  const completeStatAnims = useRef([
    new Animated.Value(0),
    new Animated.Value(0),
    new Animated.Value(0),
  ]).current;
  const sliderWidth = useRef(0);

  useEffect(() => {
    if (!id) return;

    // The player reads the resolved snapshot. The route id is a user_plan_sessions.id.
    // Per-exercise sets/reps/rest come from the resolved plan row (not the base
    // exercise); name/video/instructions come from the joined exercise.
    Promise.all([
      supabase
        .from('user_plan_sessions')
        .select('title, estimated_minutes, week_number, session_number')
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
      }
      setLoaded(true);
    });
  }, [id]);

  useEffect(() => {
    return () => {
      if (restTimerRef.current) clearInterval(restTimerRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (breatheRef.current) clearInterval(breatheRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'exercise' || !exercises[exerciseIndex]) return;

    const ex = exercises[exerciseIndex];
    setVideoUrl(null);
    setVideoError(false);

    if (ex.duration_seconds) {
      setCountdown(ex.duration_seconds);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            handleExerciseDone();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      setCountdown(0);
    }

    if (ex.cloudflare_stream_id) {
      supabase.functions
        .invoke('get-video-url', { body: { exerciseId: ex.id } })
        .then(({ data, error }) => {
          if (error || !data?.url) {
            setVideoError(true);
          } else {
            setVideoUrl(data.url);
          }
        })
        .catch(() => setVideoError(true));
    } else if (ex.video_url) {
      setVideoUrl(ex.video_url);
    }

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [exerciseIndex, phase, exercises]);

  useEffect(() => {
    if (phase === 'rest') {
      breatheRef.current = setInterval(() => {
        setBreatheIn((prev) => !prev);
      }, BREATHING_CYCLE_MS);
    } else {
      if (breatheRef.current) clearInterval(breatheRef.current);
      setBreatheIn(true);
    }
    return () => {
      if (breatheRef.current) clearInterval(breatheRef.current);
    };
  }, [phase]);

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
      .single();

    const sessionsPerWeek = plan?.sessions_per_week ?? 4;
    const durationWeeks = plan?.duration_weeks ?? 5;

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

  function startRest(seconds: number) {
    setRestSeconds(seconds);
    setRestTotal(Math.max(seconds, 1));
    setPhase('rest');
    restTimerRef.current = setInterval(() => {
      setRestSeconds((prev) => {
        if (prev <= 1) {
          if (restTimerRef.current) clearInterval(restTimerRef.current);
          advanceExercise();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }

  function skipRest() {
    // Navigation advance — stronger than a selection tick.
    hapticPrimaryAction();
    if (restTimerRef.current) clearInterval(restTimerRef.current);
    advanceExercise();
  }

  function advanceExercise() {
    const nextIndex = exerciseIndex + 1;
    if (nextIndex >= exercises.length) {
      setPhase('checkin_after');
    } else {
      setExerciseIndex(nextIndex);
      setPhase('exercise');
    }
  }

  function handleExerciseDone() {
    if (countdownRef.current) clearInterval(countdownRef.current);
    const currentEx = exercises[exerciseIndex];
    if (exerciseIndex < exercises.length - 1) {
      startRest(currentEx.rest_seconds);
    } else {
      setPhase('checkin_after');
    }
  }

  function handleSkipExercise() {
    hapticSelection();
    if (countdownRef.current) clearInterval(countdownRef.current);
    setSkippedExercises((prev) => new Set(prev).add(exerciseIndex));
    advanceExercise();
  }

  function handleExit() {
    hapticWarning();
    Alert.alert(
      'Exit session?',
      'Your progress will be saved.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit',
          style: 'destructive',
          onPress: async () => {
            if (user && id) {
              await supabase.from('session_completions').insert({
                user_id: user.id,
                plan_session_id: id,
                duration_seconds: Math.round((Date.now() - sessionStartTime.current) / 1000),
              });
            }
            router.replace('/(tabs)');
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
    trackEvent('session_started', {
      sessionId: id,
      weekNumber: sessionMeta?.week_number,
      sessionNumber: sessionMeta?.session_number,
    });
    setPhase('exercise');
  }

  async function handleComplete() {
    hapticPrimaryAction();
    if (!user || !id) return;

    const durationSeconds = Math.round((Date.now() - sessionStartTime.current) / 1000);

    const { data: completion } = await supabase
      .from('session_completions')
      .insert({
        user_id: user.id,
        plan_session_id: id,
        duration_seconds: durationSeconds,
      })
      .select()
      .single();

    await supabase.from('pain_checkins').insert({
      user_id: user.id,
      session_completion_id: completion?.id ?? null,
      score: painAfter,
      type: 'after' as const,
    });

    const { data: up } = await supabase
      .from('user_programs')
      .select('active_plan_id, current_week, current_session')
      .eq('user_id', user.id)
      .single();

    let completedWeek: number | null = null;
    let endedWeek = false;
    let programDone = false;
    if (up) {
      let sessionsPerWeek = 4;
      let durationWeeks = 5;
      if (up.active_plan_id) {
        const { data: plan } = await supabase
          .from('user_program_plans')
          .select('sessions_per_week, duration_weeks')
          .eq('id', up.active_plan_id)
          .single();
        if (plan) {
          sessionsPerWeek = plan.sessions_per_week;
          durationWeeks = plan.duration_weeks;
        }
      }

      let nextSess = up.current_session + 1;
      let nextWeek = up.current_week;
      if (nextSess > sessionsPerWeek) {
        // Just finished the last session of the week → eligible for the weekly ramp.
        nextSess = 1;
        nextWeek = up.current_week + 1;
        completedWeek = up.current_week;
        endedWeek = true;
      }

      if (nextWeek > durationWeeks) {
        // Program finished — write completion sentinel; no valid session to advance to.
        programDone = true;
        setIsProgramCompleted(true);
        await supabase
          .from('user_programs')
          .update({ current_week: durationWeeks + 1, current_session: 1 })
          .eq('user_id', user.id);
      } else {
        await supabase
          .from('user_programs')
          .update({ current_session: nextSess, current_week: nextWeek })
          .eq('user_id', user.id);
      }
    }

    trackEvent('session_completed', {
      sessionId: id,
      weekNumber: sessionMeta?.week_number,
      sessionNumber: sessionMeta?.session_number,
    });

    // End-of-week (and not the final week): route to the weekly hybrid ramp.
    if (endedWeek && completedWeek !== null && !programDone) {
      router.replace(`/weekly-ramp?week=${completedWeek}`);
      return;
    }

    setPhase('complete');
  }

  if (!loaded) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Skeleton height={SCREEN_WIDTH * 0.65} borderRadius={0} style={styles.skeletonVideo} />
        <Skeleton height={24} width={160} borderRadius={6} style={styles.skeletonText} />
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
      />
    );
  }

  // --- REST TIMER ---
  if (phase === 'rest') {
    const nextEx = exercises[exerciseIndex + 1];
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.restLabel}>Rest</Text>
        <RestRing seconds={restSeconds} total={restTotal} />

        {nextEx && (
          <View style={styles.nextExPreview}>
            <Text style={styles.nextExLabel}>Up next</Text>
            <Text style={styles.nextExName}>{nextEx.name}</Text>
            <Text style={styles.nextExDuration}>
              {nextEx.duration_seconds
                ? `${nextEx.duration_seconds}s`
                : nextEx.reps
                  ? `${nextEx.reps} reps`
                  : ''}
            </Text>
          </View>
        )}

        <Text style={styles.breatheCue}>
          {breatheIn ? 'Breathe in\u2026' : 'Breathe out\u2026'}
        </Text>

        <TouchableOpacity style={styles.skipButton} onPress={skipRest}>
          <Text style={styles.skipButtonText}>Skip Rest</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // --- EXERCISE ---
  if (phase === 'exercise' && currentExercise) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.exerciseTopBar}>
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

        <View style={styles.videoContainer}>
          {videoUrl ? (
            <VideoView
              player={player}
              style={styles.videoFullScreen}
              contentFit="cover"
              nativeControls={false}
            />
          ) : videoError ? (
            <View style={styles.videoPlaceholder}>
              <Text style={styles.videoPlaceholderText}>Video unavailable</Text>
              <TouchableOpacity
                style={styles.retryButton}
                onPress={() => {
                  setVideoError(false);
                  const ex = exercises[exerciseIndex];
                  if (ex?.cloudflare_stream_id) {
                    supabase.functions
                      .invoke('get-video-url', { body: { exerciseId: ex.id } })
                      .then(({ data, error }) => {
                        if (error || !data?.url) setVideoError(true);
                        else setVideoUrl(data.url);
                      })
                      .catch(() => setVideoError(true));
                  }
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
          <TouchableOpacity
            style={styles.muteButton}
            onPress={() => {
              hapticSelection();
              setIsMuted((m) => !m);
            }}
          >
            <Text style={styles.muteButtonText}>{isMuted ? '⊗' : '◉'}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.exerciseInfo}>
          <Text style={styles.exerciseName}>{currentExercise.name}</Text>

          {currentExercise.duration_seconds ? (
            <Text style={styles.countdownText}>{countdown}s remaining</Text>
          ) : currentExercise.reps ? (
            <Text style={styles.countdownText}>{currentExercise.reps} reps</Text>
          ) : null}

          {currentExercise.instructions && (
            <Text style={styles.exerciseInstructions}>
              {currentExercise.instructions}
            </Text>
          )}
        </View>

        {!currentExercise.duration_seconds && (
          <View style={[styles.bottomButtonWrap, { paddingBottom: Math.max(insets.bottom, 24) }]}>
            <TouchableOpacity style={styles.primaryButton} onPress={() => { hapticPrimaryAction(); handleExerciseDone(); }}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
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
        insets={insets}
      />
    );
  }

  // --- COMPLETE ---
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
          styles.completeStats,
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
        <Text style={styles.completeStatText}>{durationMin} min</Text>
        <Text style={styles.completeStatDivider}>·</Text>
        <Text style={styles.completeStatText}>{completedCount} exercises</Text>
      </Animated.View>

      <Animated.View
        style={{
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
        {painDelta > 0 && (
          <Text style={styles.painDelta}>
            Pain: {painBefore} → {painAfter} — nice work
          </Text>
        )}
      </Animated.View>

      <Animated.View
        style={{
          alignItems: 'center',
          opacity: completeStatAnims[2],
          transform: [
            {
              translateY: completeStatAnims[2].interpolate({
                inputRange: [0, 1],
                outputRange: [10, 0],
              }),
            },
          ],
        }}
      >
        <Text style={styles.warmCopy}>{warmCopy}</Text>

        {nextSession && !isProgramCompleted && (
          <View style={styles.nextSessionPreview}>
            <Text style={styles.nextSessionLabel}>Next session</Text>
            <Text style={styles.nextSessionTitle}>{nextSession.title}</Text>
          </View>
        )}
      </Animated.View>

      <TouchableOpacity
        style={[styles.primaryButton, { marginTop: 24 }]}
        onPress={() => {
          hapticPrimaryAction();
          if (isProgramCompleted) {
            router.replace('/program-complete');
          } else {
            router.replace('/(tabs)');
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
function SessionPreviewScreen({
  sessionMeta,
  exerciseCount,
  onBegin,
  onBack,
  insets,
}: {
  sessionMeta: { title: string; duration_minutes: number; week_number: number; session_number: number } | null;
  exerciseCount: number;
  onBegin: () => void;
  onBack: () => void;
  insets: { top: number; bottom: number };
}) {
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const ringScale = useRef(new Animated.Value(0.85)).current;
  const ringOpacity = useRef(new Animated.Value(0.5)).current;
  const entryOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(entryOpacity, {
      toValue: 1,
      duration: 500,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    // Organic breathing pulse — easeInOut so the turnarounds feel soft.
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.06,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.95,
          duration: 2200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale, {
            toValue: 1.55,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 2000,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(ringScale, { toValue: 0.85, duration: 0, useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0.5, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    ).start();
  }, [scaleAnim, ringScale, ringOpacity, entryOpacity]);

  return (
    <Animated.View
      style={[
        previewStyles.container,
        { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 32), opacity: entryOpacity },
      ]}
    >
      <TouchableOpacity
        style={[previewStyles.backButton, { top: insets.top + 8 }]}
        onPress={onBack}
      >
        <Text style={previewStyles.backButtonText}>✕</Text>
      </TouchableOpacity>

      <View style={previewStyles.figureArea}>
        <Animated.View
          style={[
            previewStyles.figureRing,
            { transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />
        <Animated.View
          style={[previewStyles.figureCircle, { transform: [{ scale: scaleAnim }] }]}
        >
          <Text style={previewStyles.figureGlyph}>✦</Text>
        </Animated.View>
      </View>

      <Text style={previewStyles.preLabel}>Get ready</Text>
      {sessionMeta && (
        <>
          <Text style={previewStyles.title}>{sessionMeta.title}</Text>
          <View style={previewStyles.badgeRow}>
            <View style={previewStyles.badge}>
              <Text style={previewStyles.badgeText}>
                W{sessionMeta.week_number} · S{sessionMeta.session_number}
              </Text>
            </View>
          </View>
          <View style={previewStyles.statsRow}>
            <View style={previewStyles.statPill}>
              <Text style={previewStyles.statPillValue}>{sessionMeta.duration_minutes}</Text>
              <Text style={previewStyles.statPillLabel}>min</Text>
            </View>
            <View style={previewStyles.statPillDivider} />
            <View style={previewStyles.statPill}>
              <Text style={previewStyles.statPillValue}>{exerciseCount}</Text>
              <Text style={previewStyles.statPillLabel}>exercises</Text>
            </View>
          </View>
        </>
      )}

      <Text style={previewStyles.tip}>
        Find a slightly open space and a mat if you have one. You're about to move.
      </Text>

      <TouchableOpacity style={previewStyles.beginButton} onPress={() => { hapticPrimaryAction(); onBegin(); }} activeOpacity={0.85}>
        <Text style={previewStyles.beginButtonText}>Let's go</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const previewStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  backButton: {
    position: 'absolute',
    left: 20,
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
  figureArea: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 36,
  },
  figureRing: {
    position: 'absolute',
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  figureCircle: {
    width: 110,
    height: 110,
    borderRadius: radius.circle,
    backgroundColor: colors.primaryMuted,
    borderWidth: 1.5,
    borderColor: colors.primary + '28',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.medium,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.15,
  },
  figureGlyph: {
    fontSize: 44,
    color: colors.primary,
    lineHeight: 52,
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
    fontSize: 26,
    fontWeight: '700',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 32,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 20,
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
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.borderLight,
    paddingVertical: 14,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 24,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
  },
  statPillValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  statPillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 1,
  },
  statPillDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.borderLight,
  },
  tip: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 32,
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
function PainCheckinView({
  title,
  value,
  onValueChange,
  buttonLabel,
  onSubmit,
  insets,
}: {
  title: string;
  value: number;
  onValueChange: (v: number) => void;
  buttonLabel: string;
  onSubmit: () => void;
  insets: { top: number; bottom: number };
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
    ? ((value - 1) / 9) * (sliderLayoutWidth - 28)
    : null;

  return (
    <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
      <Text style={styles.checkinTitle}>{title}</Text>
      <Text style={styles.painScore}>{value}</Text>

      <View
        ref={sliderRef}
        style={styles.sliderTrack}
        onLayout={(e) => setSliderLayoutWidth(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => handleSliderTouch(e.nativeEvent.pageX)}
        onResponderMove={(e) => handleSliderTouch(e.nativeEvent.pageX)}
      >
        {sliderLayoutWidth > 0 && (
          <View style={styles.sliderFill} pointerEvents="none">
            <Svg width={sliderLayoutWidth} height={8}>
              <Defs>
                <SvgLinearGradient id="painScale" x1="0" y1="0.5" x2="1" y2="0.5">
                  <Stop offset="0" stopColor={colors.primary} />
                  <Stop offset="0.5" stopColor={colors.warning} />
                  <Stop offset="1" stopColor={colors.secondary} />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width={sliderLayoutWidth} height={8} rx={4} fill="url(#painScale)" />
            </Svg>
          </View>
        )}
        <View style={styles.sliderTicks}>
          {Array.from({ length: 10 }, (_, i) => (
            <View
              key={i}
              style={[
                styles.sliderTick,
                i + 1 <= value && styles.sliderTickActive,
              ]}
            />
          ))}
        </View>
        {thumbPosition !== null && (
          <View style={[styles.sliderThumb, { left: thumbPosition }]} />
        )}
      </View>

      <Text style={styles.sliderHint}>1 = No pain · 10 = Severe pain</Text>

      <TouchableOpacity style={styles.primaryButton} onPress={onSubmit}>
        <Text style={styles.primaryButtonText}>{buttonLabel}</Text>
      </TouchableOpacity>
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
    fontSize: 24,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  painScore: {
    fontSize: 56,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 32,
    fontVariant: ['tabular-nums'],
  },

  // Slider
  sliderTrack: {
    width: '100%',
    height: 48,
    justifyContent: 'center',
    marginBottom: 8,
  },
  sliderFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 20,
    height: 8,
    borderRadius: radius.circle,
    opacity: 0.85,
  },
  sliderThumb: {
    position: 'absolute',
    top: 10,
    width: 28,
    height: 28,
    borderRadius: radius.circle,
    backgroundColor: colors.surface,
    borderWidth: 3,
    borderColor: colors.primary,
    ...shadows.medium,
    shadowOpacity: 0.18,
  },
  sliderTicks: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 20,
    height: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  sliderTick: {
    width: 4,
    height: 4,
    borderRadius: radius.circle,
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  sliderTickActive: {
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  sliderHint: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
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
  nextExPreview: {
    alignItems: 'center',
    marginBottom: 16,
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
  breatheCue: {
    fontSize: 16,
    color: colors.secondary,
    fontStyle: 'italic',
    marginBottom: 24,
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
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
  muteButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  muteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 18,
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
  completeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  completeStatText: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  completeStatDivider: {
    fontSize: 16,
    color: colors.textSecondary,
  },
  painDelta: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
    marginBottom: 8,
  },
  warmCopy: {
    fontSize: 15,
    color: colors.textSecondary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 4,
  },
  nextSessionPreview: {
    marginTop: 20,
    alignItems: 'center',
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
});
