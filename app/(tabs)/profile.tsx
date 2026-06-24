import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useUser } from '../../lib/superwall';
import { restoreRemedyTransaction } from '../../lib/iap';
import { supabase } from '../../lib/supabase';
import {
  requestPermissions,
  scheduleDailyReminder,
  cancelReminders,
} from '../../lib/notifications';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticWarning, hapticSelection } from '../../lib/haptics';
import { TabFadeWrapper } from '../../components/ui/TabFadeWrapper';
import type { Entitlement, OnboardingAnswers, Profile, UserProgram } from '../../types/database';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const STORAGE_NOTIF = 'remedy_notifications_enabled';
const STORAGE_NOTIF_TIME = 'remedy_notification_time';
const STORAGE_DAY_OFFSET = 'dev_day_offset';

// ---------------------------------------------------------------------------
// TimePicker (unchanged)
// ---------------------------------------------------------------------------
const HOUR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const MINUTE_OPTIONS = [0, 15, 30, 45];
const PERIOD_OPTIONS = ['AM', 'PM'] as const;

type Period = 'AM' | 'PM';

function to24h(displayHour: number, minute: number, period: Period): { hour: number; minute: number } {
  let hour = displayHour;
  if (period === 'AM' && displayHour === 12) hour = 0;
  else if (period === 'PM' && displayHour !== 12) hour = displayHour + 12;
  return { hour, minute };
}

function from24h(hour: number, minute: number): { displayHour: number; minute: number; period: Period } {
  const period: Period = hour < 12 ? 'AM' : 'PM';
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  return { displayHour, minute, period };
}

interface TimePickerProps {
  hour24: number;
  minute: number;
  onChange: (hour24: number, minute: number) => void;
}

function TimePicker({ hour24, minute, onChange }: TimePickerProps) {
  const { displayHour, period } = from24h(hour24, minute);

  function selectHour(h: number) {
    hapticSelection();
    const { hour, minute: m } = to24h(h, minute, period);
    onChange(hour, m);
  }

  function selectMinute(m: number) {
    hapticSelection();
    const { hour } = to24h(displayHour, m, period);
    onChange(hour, m);
  }

  function selectPeriod(p: Period) {
    hapticSelection();
    const { hour, minute: m } = to24h(displayHour, minute, p);
    onChange(hour, m);
  }

  return (
    <View style={tpStyles.container}>
      <View style={tpStyles.column}>
        {HOUR_OPTIONS.map((h) => (
          <TouchableOpacity
            key={h}
            style={[tpStyles.cell, displayHour === h && tpStyles.cellSelected]}
            onPress={() => selectHour(h)}
            activeOpacity={0.7}
          >
            <Text style={[tpStyles.cellText, displayHour === h && tpStyles.cellTextSelected]}>
              {h}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={tpStyles.column}>
        {MINUTE_OPTIONS.map((m) => (
          <TouchableOpacity
            key={m}
            style={[tpStyles.cell, minute === m && tpStyles.cellSelected]}
            onPress={() => selectMinute(m)}
            activeOpacity={0.7}
          >
            <Text style={[tpStyles.cellText, minute === m && tpStyles.cellTextSelected]}>
              {String(m).padStart(2, '0')}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={tpStyles.column}>
        {PERIOD_OPTIONS.map((p) => (
          <TouchableOpacity
            key={p}
            style={[tpStyles.cell, period === p && tpStyles.cellSelected]}
            onPress={() => selectPeriod(p)}
            activeOpacity={0.7}
          >
            <Text style={[tpStyles.cellText, period === p && tpStyles.cellTextSelected]}>
              {p}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const tpStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 8,
  },
  column: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cell: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.chip,
    backgroundColor: colors.background,
  },
  cellSelected: {
    backgroundColor: colors.primary,
    ...shadows.low,
    shadowColor: colors.primaryDeep,
    shadowOpacity: 0.2,
  },
  cellText: {
    fontSize: 15,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  cellTextSelected: {
    color: colors.surface,
    fontWeight: '700',
  },
});

// ---------------------------------------------------------------------------
// Label maps for onboarding answers
// ---------------------------------------------------------------------------
const PAIN_LOCATION_LABELS: Record<OnboardingAnswers['pain_location'], string> = {
  upper: 'Upper back',
  lower: 'Lower back',
  all: 'Full back',
};

const ACTIVITY_LEVEL_LABELS: Record<OnboardingAnswers['activity_level'], string> = {
  sedentary: 'Sedentary',
  light: 'Lightly active',
  active: 'Active',
  athlete: 'Athlete',
};

const MAIN_GOAL_LABELS: Record<'reduce_pain' | 'return_to_exercise' | 'sleep' | 'mobility', string> = {
  reduce_pain: 'Reduce daily pain',
  return_to_exercise: 'Return to exercise',
  sleep: 'Sleep better',
  mobility: 'Improve mobility',
};

// ---------------------------------------------------------------------------
// Subscription plan helpers
// ---------------------------------------------------------------------------
type PlanInfo = {
  label: string;
  isNegative: boolean;
  tappable: boolean;
};

function getPlanInfo(entitlement: Entitlement | null): PlanInfo {
  if (!entitlement) {
    return { label: 'No active plan', isNegative: true, tappable: true };
  }

  const { subscription_status, product_id } = entitlement;

  if (subscription_status === 'trial' || subscription_status === 'dev_trial') {
    return {
      label: 'Free Trial',
      isNegative: false,
      tappable: false,
    };
  }

  if (subscription_status === 'active') {
    if (product_id === 'com.remedyapp.annual') {
      return { label: 'Annual Plan', isNegative: false, tappable: false };
    }
    if (product_id === 'com.remedyapp.monthly') {
      return { label: 'Monthly Plan', isNegative: false, tappable: false };
    }
    return { label: 'Active Plan', isNegative: false, tappable: false };
  }

  if (subscription_status === 'cancelled') {
    return { label: 'Cancelled', isNegative: true, tappable: false };
  }

  return { label: 'No active plan', isNegative: true, tappable: true };
}

function formatMemberSince(startedAt: string | null | undefined): string {
  if (!startedAt) return '—';
  const diffDays = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 86400000),
  );
  if (diffDays < 7) {
    return diffDays === 1 ? '1 day' : `${diffDays} days`;
  }
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks < 8) {
    return diffWeeks === 1 ? '1 wk' : `${diffWeeks} wks`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  return diffMonths === 1 ? '1 mo' : `${diffMonths} mo`;
}

// ---------------------------------------------------------------------------
// Local types for joined queries
// ---------------------------------------------------------------------------
type UserProgramWithProgram = UserProgram & {
  programs: { name: string; duration_weeks: number } | null;
  // The resolved snapshot header — the personalized program name lives here.
  user_program_plans: { program_name: string; subtitle: string | null; duration_weeks: number } | null;
};

// ---------------------------------------------------------------------------
// ProfileScreen
// ---------------------------------------------------------------------------
export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const { signOut: superwallSignOut } = useUser();
  const router = useRouter();
  const nameInputRef = useRef<TextInput>(null);

  // Existing state
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(9);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [dayOffset, setDayOffset] = useState(0);

  // New state
  const [userProgramData, setUserProgramData] = useState<UserProgramWithProgram | null>(null);
  const [onboardingAnswers, setOnboardingAnswers] = useState<OnboardingAnswers | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [sessionCount, setSessionCount] = useState(0);
  const [painAvg, setPainAvg] = useState<number | null>(null);

  // Inline name editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Restore state
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (!user) return;

    (async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const sevenDaysAgoISO = sevenDaysAgo.toISOString();

      const [
        profileRes,
        notifPref,
        notifTime,
        offsetStr,
        userProgramRes,
        answersRes,
        entitlementRes,
        completionsRes,
        painRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        AsyncStorage.getItem(STORAGE_NOTIF),
        AsyncStorage.getItem(STORAGE_NOTIF_TIME),
        AsyncStorage.getItem(STORAGE_DAY_OFFSET),
        supabase
          .from('user_programs')
          .select('*, programs(name, duration_weeks), user_program_plans(program_name, subtitle, duration_weeks)')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('onboarding_answers')
          .select('*')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('entitlements')
          .select('*')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('session_completions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id),
        supabase
          .from('pain_checkins')
          .select('score, type')
          .eq('user_id', user.id)
          .gte('recorded_at', sevenDaysAgoISO),
      ]);

      setProfile(profileRes.data);
      setNotificationsEnabled(notifPref === 'true');
      if (notifTime) {
        const parsed = JSON.parse(notifTime) as { hour: number; minute: number };
        setReminderHour(parsed.hour);
        setReminderMinute(parsed.minute);
      }
      setDayOffset(offsetStr ? parseInt(offsetStr, 10) : 0);
      setUserProgramData(userProgramRes.data as UserProgramWithProgram | null);
      setOnboardingAnswers(answersRes.data);
      setEntitlement(entitlementRes.data);

      setSessionCount(completionsRes.count ?? 0);

      const beforeScores = (painRes.data ?? [])
        .filter((p) => p.type === 'before')
        .map((p) => p.score);
      if (beforeScores.length > 0) {
        setPainAvg(
          Math.round((beforeScores.reduce((s, v) => s + v, 0) / beforeScores.length) * 10) / 10,
        );
      } else {
        setPainAvg(null);
      }
    })();
  }, [user]);

  if (!user) {
    return (
      <TabFadeWrapper>
        <View style={[styles.container, { paddingTop: insets.top + 16 }]} />
      </TabFadeWrapper>
    );
  }

  const resolvedName =
    profile?.display_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    (user.email ? user.email.split('@')[0] : 'User');

  function startEditingName() {
    setNameInput(resolvedName);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }

  async function commitNameEdit() {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === resolvedName) return;

    setProfile((prev) => (prev ? { ...prev, display_name: trimmed } : prev));
    await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', user!.id);
  }

  // Plan card — prefer the personalized snapshot name over the legacy program name.
  const programName =
    userProgramData?.user_program_plans?.program_name ?? userProgramData?.programs?.name ?? null;
  const painLocationLabel = onboardingAnswers
    ? PAIN_LOCATION_LABELS[onboardingAnswers.pain_location]
    : null;
  const activityLevelLabel = onboardingAnswers
    ? ACTIVITY_LEVEL_LABELS[onboardingAnswers.activity_level]
    : null;
  const mainGoalLabel = onboardingAnswers?.main_goal?.length
    ? onboardingAnswers.main_goal.map((g) => MAIN_GOAL_LABELS[g]).join(', ')
    : null;
  const memberSince = formatMemberSince(userProgramData?.started_at);

  // Subscription
  const planInfo = getPlanInfo(entitlement);

  // ---------------------------------------------------------------------------
  // Subscription helpers
  // ---------------------------------------------------------------------------
  function getRestoreErrorMessage(
    invokeError: { message?: string } | null,
    data: { success?: boolean; error?: string } | null,
  ): string {
    const code = data?.error;
    if (code === 'invalid_transaction') {
      return 'No active subscription found for this Apple ID.';
    }
    if (code === 'rate_limited') {
      return 'Too many restore attempts. Please wait a few minutes and try again.';
    }
    if (code === 'missing_auth') {
      return 'Please sign in again and try again.';
    }
    if (invokeError) {
      return 'Could not reach the server. Check your connection and try again.';
    }
    if (data?.success === false) {
      return 'No active subscription found for this Apple ID.';
    }
    return 'Could not restore purchases. Try again later.';
  }

  async function handleRestorePurchases() {
    if (!user || restoring) return;
    setRestoring(true);
    try {
      // Pull the real restored StoreKit transaction (original id + signed JWS) and
      // re-verify it server-side.
      const tx = await restoreRemedyTransaction();
      if (!tx) {
        Alert.alert('Restore Purchases', 'No active subscription found for this Apple ID.');
        return;
      }

      const { data, error } = await supabase.functions.invoke('restore-purchases', {
        body: {
          originalTransactionId: tx.originalTransactionId,
          signedTransaction: tx.jws,
        },
        headers: { 'Idempotency-Key': `restore_${user.id}_${tx.originalTransactionId}` },
      });

      if (error || !data?.success) {
        Alert.alert('Restore Purchases', getRestoreErrorMessage(error, data));
        return;
      }

      const { data: freshEnt } = await supabase
        .from('entitlements')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (freshEnt) {
        setEntitlement(freshEnt);
      }
      Alert.alert('Restore Purchases', 'Subscription restored successfully.');
    } catch {
      Alert.alert(
        'Restore Purchases',
        'Something went wrong. Check your connection and try again.',
      );
    } finally {
      setRestoring(false);
    }
  }

  async function handleManageSubscription() {
    const url = 'https://apps.apple.com/account/subscriptions';
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        Alert.alert(
          'Manage Subscription',
          'Open Settings → Apple ID → Subscriptions on your device to manage your plan.',
        );
        return;
      }
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        'Manage Subscription',
        'Could not open subscription settings. Go to Settings → Apple ID → Subscriptions on your device.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Event handlers (all unchanged from original)
  // ---------------------------------------------------------------------------
  async function handleNotificationToggle(value: boolean) {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem(STORAGE_NOTIF, value ? 'true' : 'false');

    if (value) {
      await requestPermissions(user!.id);
      await scheduleDailyReminder(reminderHour, reminderMinute);
    } else {
      await cancelReminders();
    }
  }

  async function handleReminderTimeChange(hour24: number, minute: number) {
    setReminderHour(hour24);
    setReminderMinute(minute);
    await AsyncStorage.setItem(STORAGE_NOTIF_TIME, JSON.stringify({ hour: hour24, minute }));
    await scheduleDailyReminder(hour24, minute);
  }

  async function adjustDayOffset(delta: number) {
    hapticSelection();
    const next = Math.max(-30, Math.min(30, dayOffset + delta));
    setDayOffset(next);
    await AsyncStorage.setItem(STORAGE_DAY_OFFSET, String(next));
  }

  function handleResetProgress() {
    hapticWarning();
    Alert.alert(
      'Reset Progress',
      'This will delete all session logs and reset your program start date to today. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            hapticWarning();
            await Promise.all([
              supabase
                .from('session_completions')
                .delete()
                .eq('user_id', user!.id),
              supabase
                .from('pain_checkins')
                .delete()
                .eq('user_id', user!.id),
              supabase
                .from('user_programs')
                .update({
                  started_at: new Date().toISOString(),
                  current_week: 1,
                  current_session: 1,
                })
                .eq('user_id', user!.id),
            ]);
            await AsyncStorage.setItem('remedy_reset_pending', '1');
            Alert.alert('Done', 'Progress has been reset.', [
              {
                text: 'OK',
                onPress: () => router.navigate('/(tabs)'),
              },
            ]);
          },
        },
      ],
    );
  }

  function handleForcePaywall() {
    router.push('/(onboarding)/match');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <TabFadeWrapper>
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + 16 }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Profile</Text>

        {/* ── Header card ── */}
        <View style={styles.card}>
          {/* Editable name */}
          {editingName ? (
            <TextInput
              ref={nameInputRef}
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              onBlur={commitNameEdit}
              onSubmitEditing={commitNameEdit}
              returnKeyType="done"
              autoCorrect={false}
              autoCapitalize="words"
              maxLength={50}
            />
          ) : (
            <TouchableOpacity onPress={startEditingName} activeOpacity={0.7}>
              <Text style={styles.name}>{resolvedName}</Text>
            </TouchableOpacity>
          )}
          <Text style={styles.email}>{user.email ?? ''}</Text>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{sessionCount}</Text>
              <Text style={styles.statLabel}>Sessions</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {painAvg !== null ? painAvg : '—'}
              </Text>
              <Text style={styles.statLabel}>Avg Pain</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{memberSince}</Text>
              <Text style={styles.statLabel}>In Program</Text>
            </View>
          </View>
        </View>

        {/* ── YOUR PLAN section ── */}
        <Text style={styles.sectionLabel}>Your Plan</Text>
        <View style={styles.settingsCard}>
          {programName !== null && (
            <>
              <View style={styles.planNameRow}>
                <Text style={styles.planName}>{programName}</Text>
              </View>
              <View style={styles.divider} />
            </>
          )}

          {(painLocationLabel !== null || activityLevelLabel !== null) && (
            <>
              <View style={styles.settingsRow}>
                <Text style={styles.settingsRowLabel}>Focus</Text>
                <Text style={styles.settingsRowValue}>
                  {[painLocationLabel, activityLevelLabel].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <View style={styles.divider} />
            </>
          )}

          {mainGoalLabel !== null && (
            <>
              <View style={styles.settingsRow}>
                <Text style={styles.settingsRowLabel}>Goal</Text>
                <Text style={styles.settingsRowValue}>{mainGoalLabel}</Text>
              </View>
              <View style={styles.divider} />
            </>
          )}

          <TouchableOpacity
            style={styles.chevronRow}
            onPress={() => router.push('/onboarding-answers')}
            activeOpacity={0.7}
          >
            <Text style={styles.chevronRowLabel}>View your onboarding answers</Text>
            <Text style={styles.chevronIcon}>›</Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          <View style={styles.settingsRow}>
            <Text style={styles.settingsRowLabel}>Daily reminder</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={notificationsEnabled ? colors.surface : '#F4F4F4'}
            />
          </View>
          {notificationsEnabled && (
            <>
              <View style={styles.divider} />
              <TimePicker
                hour24={reminderHour}
                minute={reminderMinute}
                onChange={handleReminderTimeChange}
              />
            </>
          )}
        </View>

        {/* ── ACCOUNT section ── */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.settingsCard}>
          {/* Plan row */}
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={planInfo.tappable ? () => router.push('/(onboarding)/match') : undefined}
            activeOpacity={planInfo.tappable ? 0.7 : 1}
            disabled={!planInfo.tappable}
          >
            <Text style={styles.settingsRowLabel}>Plan</Text>
            <Text
              style={[
                styles.settingsRowValue,
                planInfo.isNegative && styles.settingsRowValueNegative,
              ]}
            >
              {planInfo.label}
            </Text>
          </TouchableOpacity>

          <View style={styles.divider} />

          {/* Restore Purchases — always visible; Apple guideline requirement */}
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={handleRestorePurchases}
            activeOpacity={0.7}
            disabled={restoring}
          >
            <Text style={styles.settingsRowLabel}>Restore Purchases</Text>
            {restoring && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </TouchableOpacity>

          {/* Manage Subscription — only when user has an active or trial subscription */}
          {(entitlement?.subscription_status === 'active' ||
            entitlement?.subscription_status === 'trial' ||
            entitlement?.subscription_status === 'dev_trial') && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.settingsRow}
                onPress={handleManageSubscription}
                activeOpacity={0.7}
              >
                <Text style={styles.settingsRowLabel}>Manage Subscription</Text>
                <Text style={styles.chevronIcon}>›</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── Developer section — only visible when is_dev = true ── */}
        {profile?.is_dev && (
          <>
            <Text style={styles.sectionLabel}>Developer</Text>
            <View style={styles.settingsCard}>
              {/* Simulate Day stepper */}
              <View style={styles.settingsRow}>
                <Text style={styles.settingsRowLabel}>Simulate Day</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => adjustDayOffset(-1)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stepperButtonText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>
                    {dayOffset >= 0 ? `+${dayOffset}` : `${dayOffset}`}
                  </Text>
                  <TouchableOpacity
                    style={styles.stepperButton}
                    onPress={() => adjustDayOffset(1)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Reset Progress */}
              <TouchableOpacity
                style={styles.devActionRow}
                onPress={handleResetProgress}
                activeOpacity={0.7}
              >
                <Text style={styles.devActionLabel}>Reset Progress</Text>
                <Text style={styles.devActionArrow}>→</Text>
              </TouchableOpacity>

              <View style={styles.divider} />

              {/* Force Paywall */}
              <TouchableOpacity
                style={styles.devActionRow}
                onPress={handleForcePaywall}
                activeOpacity={0.7}
              >
                <Text style={styles.devActionLabel}>Force Paywall</Text>
                <Text style={styles.devActionArrow}>→</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Sign Out ── */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={() => {
            hapticWarning();
            // Reset Superwall identity too, so paywall assignments don't leak to the
            // next account signed in on this device.
            void superwallSignOut();
            signOut();
          }}
          activeOpacity={0.6}
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
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
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 20,
    letterSpacing: -0.3,
  },

  // ── Header card ──
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: 20,
    marginBottom: 28,
    ...shadows.low,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  nameInput: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
    paddingVertical: 0,
  },
  email: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 16,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.borderLight,
  },

  // ── Section label ──
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
  },

  // ── Settings / plan card ──
  settingsCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    marginBottom: 28,
    ...shadows.low,
    overflow: 'hidden',
  },
  planNameRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  planName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  settingsRowLabel: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  settingsRowValue: {
    fontSize: 15,
    color: colors.textSecondary,
    flexShrink: 1,
    marginLeft: 12,
    textAlign: 'right',
  },
  settingsRowValueNegative: {
    color: colors.secondary,
  },
  chevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  chevronRowLabel: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  chevronIcon: {
    fontSize: 20,
    color: colors.textTertiary,
    lineHeight: 24,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: 20,
  },

  // ── Developer section ──
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: radius.chip,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textPrimary,
    lineHeight: 24,
  },
  stepperValue: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    minWidth: 36,
    textAlign: 'center',
  },
  devActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  devActionLabel: {
    fontSize: 16,
    color: colors.textPrimary,
  },
  devActionArrow: {
    fontSize: 16,
    color: colors.textSecondary,
  },

  // ── Sign Out ──
  signOutButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
  },
});
