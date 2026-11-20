import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';

import { hapticPrimaryAction, hapticSelection } from '../../lib/haptics';
import {
  scheduleStretchReminders,
  cancelStretchReminders,
  ensureStretchReminders,
  ensureWorkoutReminders,
  getNextStretchTime,
  STRETCH_PAUSED_KEY,
} from '../../lib/notifications';
import { TabFadeWrapper } from '../../components/ui/TabFadeWrapper';
import { Skeleton } from '../../components/ui/Skeleton';
import { InsightPager } from '../../components/home/InsightPager';
import {
  ThisWeekCard,
  STORAGE_WEEK_PLAN_COLLAPSED,
} from '../../components/home/ThisWeekCard';
import { supabase } from '../../lib/supabase';
import {
  WorkoutDaysModal,
  STORAGE_WORKOUT_DAYS,
  STORAGE_WORKOUT_DAYS_SINCE,
  STORAGE_NOTIF,
  STORAGE_NOTIF_TIME,
  type WeekSession,
} from '../../components/progress/WorkoutDaysModal';
import { computeWeekDays, localDateKey, type RawCompletion } from '../../lib/progress';
import {
  computeDefaultWorkoutDays,
  activeWorkoutDaysThisWeek,
  isTodayWorkoutDay,
  getNextWorkoutDay,
  todayDayIndex,
  DAY_NAMES_FULL,
} from '../../lib/workoutDays';
import {
  homeEmptyStateShown,
  homeNudgeShown,
  homeNudgeTapped,
  petNamed,
} from '../../lib/analytics/events/engagement';
import { sessionStartTapped } from '../../lib/analytics/events/coreLoop';
import type { homeEmptyStateReason } from '../../lib/analytics/events/enums';
import { FriendShareSheet } from '../../components/session/FriendShareSheet';
import { consumeFriendShareHome, type FriendShareHomePrompt } from '../../lib/friendShare';
import { resolveDisplayName, useHomeGreetingParts } from '../../lib/greeting';
import { prefetchSessionVideos } from '../../lib/prefetchSessionVideos';
import { useDaySky } from '../../lib/daySky';
import { hasCompletedOrientation } from '../../lib/orientation';
import {
  asPlanSession,
  asUserProgram,
  fetchHomeState,
} from '../../lib/homeState';
import {
  shouldSkipTabRefresh,
  beginTabRefresh,
  finishTabRefresh,
  failTabRefresh,
  invalidateTabRefresh,
} from '../../lib/tabRefresh';
import { isPendingApplyDue } from '../../lib/programAnswers';
import { flushPendingProgramApply } from '../../lib/applyProgramAnswers';
import { derivePetMood, type PetState } from '../../lib/pet';
import { fetchPetState } from '../../lib/petApi';
import { useNamedPet } from '../../lib/petNameCache';
import { countMissedThisWeek } from '../../lib/streak';
import {
  PetScene,
  SceneTitle,
  SceneBody,
  SceneButton,
  SceneLink,
} from '../../components/pet/PetScene';
import { PET_HOME_DONE_LINE, PET_HOME_REST_LINE } from '../../constants/petLines';
import { PetBadge } from '../../components/pet/PetBadge';
import type { PetStage } from '../../constants/petImages';
import type { PainTrigger } from '../../types/database';
import {
  PetNameSheet,
  hasDismissedPetNamePrompt,
  markPetNamePromptDismissed,
} from '../../components/pet/PetNameSheet';
import type { UserPlanSession, UserProgram } from '../../types/database';

type SessionWithExerciseCount = UserPlanSession & { exercise_count: number };
type HomeEmptyStateReason = import('zod').z.infer<typeof homeEmptyStateReason>;

/** Survives Home remounts. One shown per nudge_key per JS session. */
const nudgeShownKeys = new Set<string>();

const PAIN_TRIGGERS = ['sitting', 'bending', 'standing', 'morning', 'exercise', 'other'] as const;

const SESSION_LINE: Record<PainTrigger, string> = {
  sitting: 'Sitting was the hard one.',
  bending: 'Bending was the hard one.',
  standing: 'Standing was the hard one.',
  morning: 'Mornings were the hard part.',
  exercise: 'Training was the hard part.',
  other: 'A short one for today.',
};

function firstPainTrigger(value: unknown): PainTrigger | null {
  if (!Array.isArray(value)) return null;
  const first = value[0];
  return PAIN_TRIGGERS.find((item) => item === first) ?? null;
}

function doseLine(minutes: number, count: number): string {
  const exercises = count === 1 ? 'exercise' : 'exercises';
  return `${minutes} min · ${count} ${exercises}`;
}

const STRETCH_KEYS = {
  enabled: 'remedy_stretch_enabled',
  interval: 'remedy_stretch_interval',
  start: 'remedy_stretch_start_hour',
  end: 'remedy_stretch_end_hour',
  paused: STRETCH_PAUSED_KEY,
} as const;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function StretchReminderCard({ petStage }: { petStage?: PetStage }) {
  const [enabled, setEnabled] = useState(false);
  const [paused, setPaused] = useState(false);
  const [intervalMin, setIntervalMin] = useState(60);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(18);
  const [nextTime, setNextTime] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    const map = Object.fromEntries(
      await AsyncStorage.multiGet([
        STRETCH_KEYS.enabled,
        STRETCH_KEYS.interval,
        STRETCH_KEYS.start,
        STRETCH_KEYS.end,
        STRETCH_KEYS.paused,
      ]),
    );
    const isEnabled = map[STRETCH_KEYS.enabled] === 'true';
    const isPaused = map[STRETCH_KEYS.paused] === 'true';
    setEnabled(isEnabled);
    setPaused(isPaused);
    const intervalRaw = map[STRETCH_KEYS.interval];
    const startRaw = map[STRETCH_KEYS.start];
    const endRaw = map[STRETCH_KEYS.end];
    const interval = intervalRaw ? parseInt(intervalRaw, 10) : 60;
    const start = startRaw ? parseInt(startRaw, 10) : 9;
    const end = endRaw ? parseInt(endRaw, 10) : 18;
    if (intervalRaw && Number.isFinite(interval)) setIntervalMin(interval);
    if (startRaw && Number.isFinite(start)) setStartHour(start);
    if (endRaw && Number.isFinite(end)) setEndHour(end);
    if (isEnabled && !isPaused && Number.isFinite(interval) && Number.isFinite(start) && Number.isFinite(end)) {
      await ensureStretchReminders(interval, start, end);
    }
    setNextTime(isEnabled && !isPaused ? await getNextStretchTime() : null);
    setNow(Date.now());
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!enabled || paused) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [enabled, paused]);

  useEffect(() => {
    if (!enabled || paused || !nextTime) return;
    if (now < nextTime.getTime()) return;
    void getNextStretchTime().then(setNextTime);
  }, [now, nextTime, enabled, paused]);

  const handlePause = useCallback(async () => {
    hapticSelection();
    await cancelStretchReminders();
    await AsyncStorage.setItem(STRETCH_KEYS.paused, 'true');
    setPaused(true);
    setNextTime(null);
  }, []);

  const handleResume = useCallback(async () => {
    hapticSelection();
    await scheduleStretchReminders(intervalMin, startHour, endHour);
    await AsyncStorage.setItem(STRETCH_KEYS.paused, 'false');
    setPaused(false);
    const next = await getNextStretchTime();
    setNextTime(next);
  }, [intervalMin, startHour, endHour]);

  if (!enabled) return null;

  const remainingMs = nextTime ? nextTime.getTime() - now : 0;
  const valueText = paused
    ? 'Paused'
    : nextTime
      ? `Next stretch in ${formatCountdown(remainingMs)}`
      : 'No more reminders today';

  return (
    <View style={styles.stretchCard}>
      <View style={styles.stretchCardText}>
        {petStage != null ? (
          <View style={styles.stretchHeadingRow}>
            <PetBadge stage={petStage} mood="stiff" size={40} />
            <Text style={[styles.stretchCardLabel, styles.stretchCardLabelBesidePet]}>
              Stretch Break
            </Text>
          </View>
        ) : (
          <Text style={styles.stretchCardLabel}>Stretch Break</Text>
        )}
        <Text style={styles.stretchCardValue}>{valueText}</Text>
      </View>
      <TouchableOpacity
        style={styles.stretchCardButton}
        onPress={paused ? handleResume : handlePause}
        activeOpacity={0.8}
        accessibilityLabel={paused ? 'Resume stretch reminders' : 'Pause stretch reminders'}
      >
        <Text style={styles.stretchCardButtonText}>{paused ? '▶' : '❚❚'}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const sky = useDaySky();
  const { user } = useAuth();

  const [userProgram, setUserProgram] = useState<UserProgram | null>(null);
  const [todaySession, setTodaySession] = useState<SessionWithExerciseCount | null>(null);
  const [nextSessionId, setNextSessionId] = useState<string | null>(null);
  const nextSessionPosition = useRef<{ week: number; session: number } | null>(null);
  const [isRestDay, setIsRestDay] = useState(false);
  const [isDoneToday, setIsDoneToday] = useState(false);
  const [sessionsThisWeek, setSessionsThisWeek] = useState(0);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(4);
  const [durationWeeks, setDurationWeeks] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [homeLoadError, setHomeLoadError] = useState(false);

  const [workoutDays, setWorkoutDays] = useState<number[]>([]);
  const [daysSince, setDaysSince] = useState<string | null>(null);
  const [nextWorkoutDay, setNextWorkoutDay] = useState<number | null>(null);
  const [workoutNotifEnabled, setWorkoutNotifEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(9);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [weekSessions, setWeekSessions] = useState<WeekSession[]>([]);
  const [userEquipment, setUserEquipment] = useState<string | null>(null);
  const [hardTrigger, setHardTrigger] = useState<PainTrigger | null>(null);
  const [weekPlanCollapsed, setWeekPlanCollapsed] = useState(true);
  const [displayWeekDays, setDisplayWeekDays] = useState<boolean[]>(
    () => Array.from({ length: 7 }, () => false),
  );
  const [modalVisible, setModalVisible] = useState(false);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [sharePrompt, setSharePrompt] = useState<FriendShareHomePrompt | null>(null);
  const [thisWeekCompletions, setWeekCompletions] = useState<RawCompletion[]>([]);
  const [petState, setPet] = useState<PetState | null>(null);
  const pet = useNamedPet(petState);
  // null until read, so the naming sheet never flashes for someone who dismissed it.
  const [petPromptDismissed, setPetPromptDismissed] = useState<boolean | null>(null);
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!user?.id) return;
    let live = true;
    void hasDismissedPetNamePrompt(user.id).then((dismissed) => {
      if (live) setPetPromptDismissed(dismissed);
    });
    return () => {
      live = false;
    };
  }, [user?.id]);

  const fetchData = useCallback(async (opts?: { force?: boolean }) => {
    if (!user) return;

    const resetPending = await AsyncStorage.getItem('remedy_reset_pending');
    if (resetPending) {
      await AsyncStorage.removeItem('remedy_reset_pending');
      invalidateTabRefresh('home');
      setUserProgram(null);
      setTodaySession(null);
      setNextSessionId(null);
      setIsDoneToday(false);
      setSessionsThisWeek(0);
      setWeekCompletions([]);
      setWeekSessions([]);
      setDisplayWeekDays(Array.from({ length: 7 }, () => false));
      setLoaded(false);
    } else if (!opts?.force && shouldSkipTabRefresh('home')) {
      setDisplayName((prev) => resolveDisplayName(prev, user) ?? prev);
      return;
    }

    beginTabRefresh('home');
    let refreshOk = false;
    try {
    void fetchPetState().then((next) => {
      if (next) setPet(next);
    });
    const [
      offsetStr,
      storedDays,
      storedDaysSince,
      storedNotif,
      storedTime,
      storedCollapsed,
    ] = await AsyncStorage.multiGet([
      'dev_day_offset',
      STORAGE_WORKOUT_DAYS,
      STORAGE_WORKOUT_DAYS_SINCE,
      STORAGE_NOTIF,
      STORAGE_NOTIF_TIME,
      STORAGE_WEEK_PLAN_COLLAPSED,
    ]).then((pairs) => pairs.map(([, value]) => value));

    const offset = offsetStr ? parseInt(offsetStr, 10) : 0;
    const state = await fetchHomeState(Number.isFinite(offset) ? offset : 0);
    if (!state) {
      setDisplayName(resolveDisplayName(null, user));
      setHomeLoadError(true);
      setLoaded(true);
      return;
    }
    setHomeLoadError(false);

    setDisplayName(resolveDisplayName(state.display_name, user));

    const up = asUserProgram(state.user_program);
    if (!up) {
      setUserProgram(null);
      setWeekSessions([]);
      setDurationWeeks(null);
      setTodaySession(null);
      setNextSessionId(null);
      setLoaded(true);
      refreshOk = true;
      return;
    }
    setUserProgram(up);

    if (!state?.plan) {
      setWeekSessions([]);
      setDurationWeeks(null);
      setTodaySession(null);
      setNextSessionId(null);
      setLoaded(true);
      refreshOk = true;
      return;
    }

    if (state.pending_ramp_week != null) {
      refreshOk = true;
      router.replace(`/weekly-ramp?week=${state.pending_ramp_week}`);
      return;
    }

    let home = state;
    let program = up;
    if (isPendingApplyDue(program.pending_apply_week ?? null, program.current_week)) {
      const flushed = await flushPendingProgramApply();
      if (flushed === 'applied') {
        const refreshed = await fetchHomeState(Number.isFinite(offset) ? offset : 0);
        if (refreshed?.user_program && refreshed.plan) {
          home = refreshed;
          const nextUp = asUserProgram(refreshed.user_program);
          if (nextUp) {
            program = nextUp;
            setUserProgram(nextUp);
          }
        }
      }
    }

    if (!home.plan) {
      setWeekSessions([]);
      setDurationWeeks(null);
      setTodaySession(null);
      setNextSessionId(null);
      setLoaded(true);
      refreshOk = true;
      return;
    }

    if (program.pending_apply_week != null && program.applied_answers) {
      setHardTrigger(firstPainTrigger(program.applied_answers.pain_trigger));
    } else {
      const { data: triggerRow } = await supabase
        .from('onboarding_answers')
        .select('pain_trigger')
        .eq('user_id', user.id)
        .maybeSingle();
      setHardTrigger(firstPainTrigger(triggerRow?.pain_trigger));
    }

    const planSessionsPerWeek = home.plan.sessions_per_week;
    const planDurationWeeks = home.plan.duration_weeks;
    const displaySession = home.display_session ?? program.current_session;

    setDurationWeeks(planDurationWeeks);

    const weekCompletions = home.week_completions as RawCompletion[];
    setSessionsThisWeek(weekCompletions.length);
    setWeekCompletions(weekCompletions);
    const weekDays = computeWeekDays(weekCompletions, 0);
    setDisplayWeekDays(weekDays);
    const doneToday = weekDays[todayDayIndex()];

    const thisWeekSessions = home.week_sessions;
    setWeekSessions(thisWeekSessions);
    setSessionsPerWeek(
      thisWeekSessions.length > 0 ? thisWeekSessions.length : planSessionsPerWeek,
    );

    setUserEquipment(home.equipment);

    let days: number[] = [];
    try { if (storedDays) days = JSON.parse(storedDays) as number[]; } catch { /* ignore */ }
    let since = storedDaysSince;
    if (days.length !== planSessionsPerWeek) {
      days = computeDefaultWorkoutDays(planSessionsPerWeek);
      since = localDateKey(new Date());
      await AsyncStorage.multiSet([
        [STORAGE_WORKOUT_DAYS, JSON.stringify(days)],
        [STORAGE_WORKOUT_DAYS_SINCE, since],
      ]);
    }
    setWorkoutDays(days);
    setDaysSince(since);
    setWorkoutNotifEnabled(storedNotif === 'true');
    setWeekPlanCollapsed(storedCollapsed !== 'false');

    let hour = 9;
    let minute = 0;
    if (storedTime) {
      try {
        const t = JSON.parse(storedTime) as { hour: number; minute: number };
        hour = t.hour;
        minute = t.minute;
      } catch { /* ignore */ }
    }
    setReminderHour(hour);
    setReminderMinute(minute);
    // Keeps the weekly alarms on the saved days and copy. A new days/week count
    // (next program, edited answers) is already written above, so this moves the
    // alarms with it. Stretch alarms are a separate schedule.
    if (storedNotif === 'true') {
      void ensureWorkoutReminders(days, hour, minute).catch(() => {});
    }

    const todayIsWorkout = isTodayWorkoutDay(days);
    setNextWorkoutDay(getNextWorkoutDay(days));

    const sessionData = asPlanSession(home.display_plan_session);
    if (sessionData && todayIsWorkout && !doneToday) {
      setTodaySession({ ...sessionData, exercise_count: home.display_exercise_count });
      prefetchSessionVideos(sessionData.id);
      setNextSessionId(null);
      nextSessionPosition.current = null;
      setIsRestDay(false);
      setIsDoneToday(false);
    } else {
      const weekDone = program.current_session > planSessionsPerWeek;
      const restDay = !todayIsWorkout || weekDone;
      const pointerSession = asPlanSession(home.pointer_plan_session);

      if (
        !doneToday &&
        todayIsWorkout &&
        !weekDone &&
        !sessionData &&
        displaySession !== program.current_session &&
        pointerSession
      ) {
        setTodaySession({ ...pointerSession, exercise_count: home.pointer_exercise_count });
        prefetchSessionVideos(pointerSession.id);
        setIsRestDay(false);
        setIsDoneToday(false);
        setNextSessionId(null);
        nextSessionPosition.current = null;
        setLoaded(true);
        refreshOk = true;
        return;
      }

      setTodaySession(null);
      setIsRestDay(restDay);
      setIsDoneToday(doneToday);
      setNextSessionId(null);
      nextSessionPosition.current = null;

      // On a rest day the pointer session is still the user's next one. For a normal
      // account display == pointer, so pointer_plan_session is null and the pointer
      // arrives as display_plan_session; the dev day-offset path is the only case that
      // splits them.
      const restDayNextUp = pointerSession ?? sessionData;

      if (doneToday && sessionData) {
        setNextSessionId(sessionData.id);
        prefetchSessionVideos(sessionData.id);
        nextSessionPosition.current = {
          week: sessionData.week_number,
          session: sessionData.session_number,
        };
      } else if (restDay && !weekDone && restDayNextUp) {
        // Mid-week rest day. next_week_peek is deliberately `week_number >
        // display_week`, so linking it here opened NEXT WEEK's first session while the
        // pointer was still mid-week: the user could play a whole session and only find
        // out at save time, when complete_session rejects it as session_not_current.
        setNextSessionId(restDayNextUp.id);
        prefetchSessionVideos(restDayNextUp.id);
        nextSessionPosition.current = {
          week: restDayNextUp.week_number,
          session: restDayNextUp.session_number,
        };
      } else if (restDay && home.next_week_peek) {
        setNextSessionId(home.next_week_peek.id);
        nextSessionPosition.current = {
          week: home.next_week_peek.week_number,
          session: home.next_week_peek.session_number,
        };
      }
    }

    setLoaded(true);
    refreshOk = true;
    } catch {
      setHomeLoadError(true);
      setLoaded(true);
    } finally {
      if (refreshOk) finishTabRefresh('home');
      else failTabRefresh('home');
    }
  }, [user, router]);

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [fetchData]),
  );

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void (async () => {
        const pending = await consumeFriendShareHome();
        if (live && pending) setSharePrompt(pending);
      })();
      return () => {
        live = false;
      };
    }, []),
  );

  // Home with nothing to start is a dead end — the user opened the app to train
  // and got a wall. Reported on change so a re-focus doesn't re-count the same
  // state, and only for the reason actually being rendered.
  const lastEmptyReason = useRef<HomeEmptyStateReason | null>(null);
  useEffect(() => {
    if (!loaded || homeLoadError) return;

    let reason: HomeEmptyStateReason | null = null;
    if (durationWeeks != null && userProgram && userProgram.current_week > durationWeeks) reason = 'program_complete';
    else if (userProgram && !userProgram.active_plan_id) reason = 'no_active_plan';
    else if (!todaySession) {
      reason = isDoneToday
        ? 'session_done_today'
        : isRestDay
          ? 'rest_day'
          : 'no_session_available';
    }

    if (reason === lastEmptyReason.current) return;
    lastEmptyReason.current = reason;
    if (reason !== null) homeEmptyStateShown({ reason });
  }, [loaded, homeLoadError, userProgram, durationWeeks, todaySession, isRestDay, isDoneToday]);

  async function goToSession(sessionId: string) {
    if (user?.id && !(await hasCompletedOrientation(user.id))) {
      router.push(`/orientation?session=${sessionId}`);
      return;
    }
    router.push(`/session/${sessionId}`);
  }

  async function toggleWeekPlanCollapsed() {
    hapticSelection();
    LayoutAnimation.configureNext(
      LayoutAnimation.create(
        240,
        LayoutAnimation.Types.easeInEaseOut,
        LayoutAnimation.Properties.opacity,
      ),
    );
    const next = !weekPlanCollapsed;
    setWeekPlanCollapsed(next);
    await AsyncStorage.setItem(STORAGE_WEEK_PLAN_COLLAPSED, next ? 'true' : 'false');
  }

  const weekSchedule = activeWorkoutDaysThisWeek(workoutDays, daysSince);
  const showReminderNudge = !workoutNotifEnabled;
  const reminderNudgeOnCard = Boolean(userProgram?.active_plan_id) && showReminderNudge;
  useEffect(() => {
    if (!reminderNudgeOnCard) return;
    if (nudgeShownKeys.has('notification_setup')) return;
    nudgeShownKeys.add('notification_setup');
    homeNudgeShown({ nudge_key: 'notification_setup' });
  }, [reminderNudgeOnCard]);

  const { greeting, firstName } = useHomeGreetingParts(
    resolveDisplayName(displayName, user),
  );

  function openProfileNameEdit() {
    hapticSelection();
    router.navigate('/(tabs)/profile?editName=1');
  }

  const petMood = derivePetMood({
    programComplete: Boolean(durationWeeks != null && userProgram && userProgram.current_week > durationWeeks),
    isDoneToday,
    hasSessionToday: todaySession !== null,
    isRestDay,
    missedPlannedDays: countMissedThisWeek(thisWeekCompletions, weekSchedule),
    hour: new Date().getHours(),
  });
  const spoken = hardTrigger ? SESSION_LINE[hardTrigger] : 'A short one for today.';

  // Today's session, rest day, or program completion: lives on the hill in the pet scene.
  const sceneActions = !loaded ? null : homeLoadError ? (
    <>
      <SceneTitle hasBody lines={3}>Could not load your session.</SceneTitle>
      <SceneBody>Check your connection and try again.</SceneBody>
      <SceneButton
        label="Try again"
        onPress={() => {
          hapticPrimaryAction();
          void fetchData({ force: true });
        }}
      />
    </>
  ) : durationWeeks != null && userProgram && userProgram.current_week > durationWeeks ? (
    <>
      <SceneTitle lines={3}>{`${durationWeeks} weeks, done.`}</SceneTitle>
      <SceneBody>See your summary, then build the next one.</SceneBody>
      <SceneButton
        label="View summary"
        onPress={() => {
          hapticPrimaryAction();
          router.push('/program-complete');
        }}
      />
    </>
  ) : userProgram && !userProgram.active_plan_id ? (
    <>
      <SceneTitle lines={3}>Your plan still needs building.</SceneTitle>
      <SceneButton
        label="Build my program"
        onPress={() => {
          hapticPrimaryAction();
          router.replace('/building-plan');
        }}
      />
    </>
  ) : todaySession ? (
    <>
      <SceneTitle lines={3}>{todaySession.title}</SceneTitle>
      <SceneBody>{spoken}</SceneBody>
      <SceneButton
        label="Start session"
        detail={doseLine(todaySession.estimated_minutes, todaySession.exercise_count)}
        onPress={() => {
          hapticPrimaryAction();
          sessionStartTapped({
            source_screen: 'home',
            week_number: todaySession.week_number,
            session_number: todaySession.session_number,
          });
          void goToSession(todaySession.id);
        }}
      />
    </>
  ) : isDoneToday ? (
    <>
      <SceneTitle hasBody lines={3}>{PET_HOME_DONE_LINE}</SceneTitle>
      {nextWorkoutDay !== null && (
        <SceneBody>Next workout · {DAY_NAMES_FULL[nextWorkoutDay]}</SceneBody>
      )}
      {nextSessionId && (
        <SceneLink
          label="Do another session"
          onPress={() => {
            const position = nextSessionPosition.current;
            if (position) {
              sessionStartTapped({
                source_screen: 'home',
                week_number: position.week,
                session_number: position.session,
              });
            }
            void goToSession(nextSessionId);
          }}
        />
      )}
    </>
  ) : (
    <>
      <SceneTitle hasBody lines={3}>
        {isRestDay ? PET_HOME_REST_LINE : 'Your next session is ready whenever you are.'}
      </SceneTitle>
      {isRestDay && nextWorkoutDay !== null && (
        <SceneBody>Next workout · {DAY_NAMES_FULL[nextWorkoutDay]}</SceneBody>
      )}
      {nextSessionId &&
        (isRestDay ? (
          <SceneLink
            label="View next session"
            onPress={() => {
              const position = nextSessionPosition.current;
              if (position) {
                sessionStartTapped({
                  source_screen: 'home',
                  week_number: position.week,
                  session_number: position.session,
                });
              }
              void goToSession(nextSessionId);
            }}
          />
        ) : (
          <SceneButton
            label="Start session"
            onPress={() => {
              const position = nextSessionPosition.current;
              if (position) {
                sessionStartTapped({
                  source_screen: 'home',
                  week_number: position.week,
                  session_number: position.session,
                });
              }
              void goToSession(nextSessionId);
            }}
          />
        ))}
    </>
  );
  const petScene = (
    <View style={styles.petScene}>
      {/* Keeps the pull-down area the same cream as the meadow sky. */}
      <View pointerEvents="none" style={[styles.petSceneOverscroll, { backgroundColor: sky.top }]} />
      <PetScene
        topInset={insets.top}
        greeting={greeting}
        firstName={firstName}
        onPressFirstName={openProfileNameEdit}
        pet={pet}
        mood={petMood}
        sky={sky}
      >
        {sceneActions}
      </PetScene>
    </View>
  );

  if (!loaded) {
    return (
      <TabFadeWrapper>
        <View style={styles.container}>
          {petScene}
          <Skeleton height={180} borderRadius={radius.card} style={styles.skeletonCard} />
          <Skeleton height={180} borderRadius={radius.card} style={styles.skeletonCard} />
        </View>
      </TabFadeWrapper>
    );
  }

  return (
    <TabFadeWrapper>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      {petScene}

      {userProgram?.active_plan_id ? (
        <ThisWeekCard
          workoutDays={weekSchedule}
          displayWeekDays={displayWeekDays}
          weekSessions={weekSessions}
          sessionsPerWeek={weekSessions.length > 0 ? weekSessions.length : sessionsPerWeek}
          sessionsThisWeek={sessionsThisWeek}
          userEquipment={userEquipment}
          weekPlanCollapsed={weekPlanCollapsed}
          weekNumber={
            durationWeeks != null && userProgram.current_week <= durationWeeks
              ? userProgram.current_week
              : undefined
          }
          onToggleCollapsed={() => { void toggleWeekPlanCollapsed(); }}
          onEditDays={() => {
            hapticSelection();
            setModalVisible(true);
          }}
          showReminderNudge={showReminderNudge}
          onReminderNudgePress={() => {
            hapticPrimaryAction();
            homeNudgeTapped({ nudge_key: 'notification_setup' });
            setModalVisible(true);
          }}
        />
      ) : null}

      <StretchReminderCard petStage={pet?.stage} />
      <InsightPager petStage={pet?.stage} petName={pet?.name} />

    </ScrollView>

      {sharePrompt ? (
        <FriendShareSheet
          firstName={firstName}
          painImproved={sharePrompt.painImproved}
          onDismiss={() => setSharePrompt(null)}
        />
      ) : null}

      <WorkoutDaysModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        weekSessions={weekSessions}
        sessionsPerWeek={sessionsPerWeek}
        userEquipment={userEquipment}
        initialDays={workoutDays}
        initialNotif={workoutNotifEnabled}
        initialHour={reminderHour}
        initialMinute={reminderMinute}
        onSaved={(result) => {
          setWorkoutDays(result.days);
          setWorkoutNotifEnabled(result.notifEnabled);
          setReminderHour(result.hour);
          setReminderMinute(result.minute);
          setModalVisible(false);
          // Re-evaluate rest/workout day immediately with the new schedule.
          void fetchData({ force: true });
        }}
        onEditProgram={() => {
          setModalVisible(false);
          router.push('/onboarding-answers');
        }}
      />

      {pet ? (
        <PetNameSheet
          visible={
            isFocused &&
            pet.name === null &&
            petPromptDismissed === false &&
            sharePrompt === null &&
            !modalVisible
          }
          stage={pet.stage}
          onNamed={(state) => {
            setPet(state);
            petNamed({ source_screen: 'home', renamed: false });
          }}
          onDismiss={() => {
            setPetPromptDismissed(true);
            if (user?.id) void markPetNamePromptDismissed(user.id);
          }}
        />
      ) : null}
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
    paddingBottom: 48,
  },
  // Full-bleed: cancels the container's horizontal padding.
  petScene: {
    marginHorizontal: -24,
    marginBottom: 20,
  },
  petSceneOverscroll: {
    position: 'absolute',
    top: -600,
    left: 0,
    right: 0,
    height: 600,
    backgroundColor: colors.background,
  },

  stretchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 16,
  },
  stretchCardText: {
    flex: 1,
  },
  stretchCardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  stretchHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  stretchCardLabelBesidePet: {
    flex: 1,
    marginBottom: 0,
  },
  stretchCardValue: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  stretchCardButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  stretchCardButtonText: {
    color: colors.surface,
    fontSize: 15,
    fontWeight: '700',
  },
  skeletonCard: {
    marginBottom: 16,
  },
});
