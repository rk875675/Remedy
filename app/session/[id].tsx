import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Video, ResizeMode } from 'expo-av';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';
import { hapticSuccess, hapticWarning, hapticPrimaryAction, hapticSelection } from '../../lib/haptics';
import type { Exercise, ProgramSession } from '../../types/database';

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
  const [loaded, setLoaded] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [skippedExercises, setSkippedExercises] = useState<Set<number>>(new Set());
  const [breatheIn, setBreatheIn] = useState(true);
  const [nextSession, setNextSession] = useState<ProgramSession | null>(null);

  const sessionStartTime = useRef(Date.now());
  const restTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breatheRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionScale = useRef(new Animated.Value(0)).current;
  const sliderWidth = useRef(0);

  useEffect(() => {
    if (!id) return;

    Promise.all([
      supabase
        .from('program_sessions')
        .select('title, duration_minutes, week_number, session_number')
        .eq('id', id)
        .single(),
      supabase
        .from('session_exercises')
        .select('order_index, exercises(*)')
        .eq('session_id', id)
        .order('order_index', { ascending: true }),
    ]).then(([metaRes, exercisesRes]) => {
      if (metaRes.data) setSessionMeta(metaRes.data);
      if (exercisesRes.data) {
        const exs = exercisesRes.data
          .map((row) => (row as unknown as { exercises: Exercise }).exercises)
          .filter(Boolean);
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
      hapticSuccess();
      Animated.spring(completionScale, {
        toValue: 1,
        friction: 4,
        tension: 60,
        useNativeDriver: true,
      }).start();
      fetchNextSession();
    }
  }, [phase]);

  const fetchNextSession = useCallback(async () => {
    if (!user || !id) return;
    const { data: up } = await supabase
      .from('user_programs')
      .select('*')
      .eq('user_id', user.id)
      .single();
    if (!up) return;

    let nextSess = up.current_session + 1;
    let nextWeek = up.current_week;
    if (nextSess > 4) {
      nextSess = 1;
      nextWeek = Math.min(nextWeek + 1, 5);
    }

    const { data } = await supabase
      .from('program_sessions')
      .select('*')
      .eq('program_id', up.program_id)
      .eq('week_number', nextWeek)
      .eq('session_number', nextSess)
      .single();

    if (data) setNextSession(data);
  }, [user, id]);

  function startRest(seconds: number) {
    setRestSeconds(seconds);
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
    hapticSelection();
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
                program_session_id: id,
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
    setPhase('exercise');
  }

  async function handleComplete() {
    if (!user || !id) return;

    const durationSeconds = Math.round((Date.now() - sessionStartTime.current) / 1000);

    const { data: completion } = await supabase
      .from('session_completions')
      .insert({
        user_id: user.id,
        program_session_id: id,
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
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (up) {
      let nextSess = up.current_session + 1;
      let nextWeek = up.current_week;
      if (nextSess > 4) {
        nextSess = 1;
        nextWeek = Math.min(nextWeek + 1, 5);
      }
      await supabase
        .from('user_programs')
        .update({ current_session: nextSess, current_week: nextWeek })
        .eq('user_id', user.id);
    }

    setPhase('complete');
  }

  if (!loaded) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.skeletonVideo} />
        <View style={styles.skeletonText} />
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
        <Text style={styles.restTimer}>{restSeconds}s</Text>

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
            <Video
              source={{ uri: videoUrl }}
              style={styles.videoFullScreen}
              resizeMode={ResizeMode.COVER}
              shouldPlay
              isLooping
              isMuted={isMuted}
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

      <View style={styles.completeStats}>
        <Text style={styles.completeStatText}>{durationMin} min</Text>
        <Text style={styles.completeStatDivider}>·</Text>
        <Text style={styles.completeStatText}>{completedCount} exercises</Text>
      </View>

      {painDelta > 0 && (
        <Text style={styles.painDelta}>
          Pain: {painBefore} → {painAfter} — nice work
        </Text>
      )}

      <Text style={styles.warmCopy}>{warmCopy}</Text>

      {nextSession && (
        <View style={styles.nextSessionPreview}>
          <Text style={styles.nextSessionLabel}>Next session</Text>
          <Text style={styles.nextSessionTitle}>{nextSession.title}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryButton, { marginTop: 24 }]}
        onPress={() => {
          hapticPrimaryAction();
          router.replace('/(tabs)');
        }}
      >
        <Text style={styles.primaryButtonText}>Back to Home</Text>
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
    Animated.timing(entryOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.06, duration: 2200, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 2200, useNativeDriver: true }),
      ]),
    ).start();

    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ringScale, { toValue: 1.55, duration: 2000, useNativeDriver: true }),
          Animated.timing(ringOpacity, { toValue: 0, duration: 2000, useNativeDriver: true }),
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
          <View style={previewStyles.personHead} />
          <View style={previewStyles.personTorso} />
          <View style={previewStyles.personLegs} />
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
    borderRadius: 55,
    backgroundColor: colors.primary + '12',
    borderWidth: 1.5,
    borderColor: colors.primary + '28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  personHead: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    marginBottom: 5,
  },
  personTorso: {
    width: 32,
    height: 24,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    backgroundColor: colors.primary,
  },
  personLegs: {
    width: 38,
    height: 14,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    backgroundColor: colors.primary + '60',
    marginTop: 2,
  },
  preLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
    backgroundColor: colors.primary + '18',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.primary,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#F0EBE7',
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
  },
  statPillLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: 1,
  },
  statPillDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#F0EBE7',
  },
  tip: {
    fontSize: 15,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
    paddingHorizontal: 8,
  },
  beginButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  beginButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
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
      const val = Math.round((position / width) * 9) + 1;
      onValueChange(Math.max(1, Math.min(10, val)));
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
        <View style={styles.sliderFill} />
        {thumbPosition !== null && (
          <View style={[styles.sliderThumb, { left: thumbPosition }]} />
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
    borderRadius: 4,
    backgroundColor: '#E8E0DC',
  },
  sliderThumb: {
    position: 'absolute',
    top: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
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
    borderRadius: 2,
    backgroundColor: '#D0C8C3',
  },
  sliderTickActive: {
    backgroundColor: colors.primary,
  },
  sliderHint: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 32,
    textAlign: 'center',
  },

  primaryButton: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  primaryButtonDisabled: {
    opacity: 0.4,
  },
  primaryButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Rest
  restLabel: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 8,
  },
  restTimer: {
    fontSize: 64,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 20,
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
    letterSpacing: 0.5,
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
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
  },
  skipButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
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
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: colors.textSecondary,
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
  },
  exerciseInstructions: {
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 22,
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
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#E8E0DC',
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
    borderRadius: 40,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
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
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  nextSessionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },

  // Skeleton
  skeletonVideo: {
    height: SCREEN_WIDTH * 0.65,
    marginTop: 60,
    backgroundColor: '#E8E0DC',
  },
  skeletonText: {
    height: 24,
    width: 160,
    marginHorizontal: 24,
    marginTop: 16,
    backgroundColor: '#E8E0DC',
    borderRadius: 6,
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
