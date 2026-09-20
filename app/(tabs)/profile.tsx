import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  Platform,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { usePremium } from '../../context/PremiumContext';
import {
  useUser,
  usePlacement,
  SUPERWALL_AVAILABLE,
  setSuperwallSubscriptionInactive,
} from '../../lib/superwall';
import { restoreRemedyTransaction } from '../../lib/iap';
import { supabase } from '../../lib/supabase';
import {
  requestPermissions,
  cancelWorkoutReminders,
  scheduleStretchReminders,
  cancelStretchReminders,
} from '../../lib/notifications';
import { colors } from '../../constants/colors';
import { radius } from '../../constants/spacing';
import { shadows } from '../../constants/shadows';
import { hapticWarning, hapticSelection } from '../../lib/haptics';
import { accountDeletionFailed, signedOut } from '../../lib/analytics/events/auth';
import {
  restoreFailed,
  restoreStarted,
  restoreSucceeded,
} from '../../lib/analytics/events/monetization';
import {
  dailyReminderDisabled,
  displayNameUpdated,
  progressReset,
  stretchRemindersDisabled,
  stretchRemindersEnabled,
} from '../../lib/analytics/events/engagement';
import { openContactPage, openLegalDocument } from '../../lib/legalLinks';
import { toProductId, toRestoreReason } from '../../lib/analytics/purchaseErrors';
import { isManualWriteReviewAvailable, openWriteReviewPage } from '../../lib/app-store-review';
import { extractInvokeError } from '../../lib/functionsError';
import { rememberDisplayName, resolveDisplayName } from '../../lib/greeting';
import { invalidateTabRefresh } from '../../lib/tabRefresh';
import { TabFadeWrapper } from '../../components/ui/TabFadeWrapper';
import { WorkoutDaysModal } from '../../components/progress/WorkoutDaysModal';
import { PromoCodeSheet } from '../../components/PromoCodeSheet';
import type { Entitlement, Profile, UserProgram } from '../../types/database';

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------
const STORAGE_NOTIF = 'remedy_notifications_enabled';
const STORAGE_NOTIF_TIME = 'remedy_notification_time';
const STORAGE_DAY_OFFSET = 'dev_day_offset';
const STORAGE_STRETCH = 'remedy_stretch_enabled';
const STORAGE_STRETCH_INTERVAL = 'remedy_stretch_interval';
const STORAGE_STRETCH_START = 'remedy_stretch_start_hour';
const STORAGE_STRETCH_END = 'remedy_stretch_end_hour';

const STRETCH_INTERVAL_OPTIONS: { value: number; label: string; short: string }[] = [
  { value: 60, label: '1 hour', short: '1h' },
  { value: 90, label: '90 min', short: '90m' },
  { value: 120, label: '2 hours', short: '2h' },
  { value: 240, label: '4 hours', short: '4h' },
];

function roundToQuarterHour(date: Date): { hour: number; minute: number } {
  const totalMins = date.getHours() * 60 + date.getMinutes();
  const rounded = Math.round(totalMins / 15) * 15;
  return { hour: Math.floor(rounded / 60) % 24, minute: rounded % 60 };
}

function formatTime12(hour24: number, minute: number): string {
  const h12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const period = hour24 < 12 ? 'AM' : 'PM';
  return `${h12}:${minute.toString().padStart(2, '0')} ${period}`;
}

function stretchIntervalLabel(minutes: number): string {
  return STRETCH_INTERVAL_OPTIONS.find((opt) => opt.value === minutes)?.label ?? `${minutes} min`;
}

// ---------------------------------------------------------------------------
// WheelTimePicker — pure-JS drum-roll time picker (no native module needed)
// ---------------------------------------------------------------------------
const WHEEL_ITEM_H = 44;
const WHEEL_VISIBLE = 5;
const WHEEL_H = WHEEL_ITEM_H * WHEEL_VISIBLE;
const WHEEL_PAD = WHEEL_ITEM_H * Math.floor(WHEEL_VISIBLE / 2);

const WHEEL_HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const WHEEL_MINUTES = ['00', '15', '30', '45'];
const WHEEL_PERIODS = ['AM', 'PM'];

interface WheelColumnProps {
  items: string[];
  initialIndex: number;
  onSelect: (index: number) => void;
}

function WheelColumn({ items, initialIndex, onSelect }: WheelColumnProps) {
  const scrollRef = useRef<ScrollView>(null);
  const [activeIdx, setActiveIdx] = useState(initialIndex);

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: initialIndex * WHEEL_ITEM_H, animated: false });
    }, 0);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const raw = e.nativeEvent.contentOffset.y;
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(raw / WHEEL_ITEM_H)));
    setActiveIdx(idx);
    onSelect(idx);
  }

  return (
    <View style={wStyles.column}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumScrollEnd}
        contentContainerStyle={{ paddingVertical: WHEEL_PAD }}
      >
        {items.map((item, i) => (
          <View key={i} style={wStyles.item}>
            <Text style={i === activeIdx ? wStyles.itemActive : wStyles.itemInactive}>
              {item}
            </Text>
          </View>
        ))}
      </ScrollView>
      {/* Selection band — two hairlines framing the centre item */}
      <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
        <View style={[wStyles.selectionLine, { top: WHEEL_PAD }]} />
        <View style={[wStyles.selectionLine, { top: WHEEL_PAD + WHEEL_ITEM_H }]} />
      </View>
    </View>
  );
}

interface WheelTimePickerProps {
  hour24: number;
  minute: number;
  onChange: (hour24: number, minute: number) => void;
}

function WheelTimePicker({ hour24, minute, onChange }: WheelTimePickerProps) {
  const displayH12 = hour24 === 0 ? 12 : hour24 > 12 ? hour24 - 12 : hour24;
  const initMinIdx = Math.max(0, Math.round(minute / 15) % 4);
  const initPeriodIdx: 0 | 1 = hour24 < 12 ? 0 : 1;

  const st = useRef({ h12: displayH12, minIdx: initMinIdx, pIdx: initPeriodIdx });

  function emit() {
    const { h12, minIdx, pIdx } = st.current;
    const h24 = pIdx === 0 ? (h12 === 12 ? 0 : h12) : (h12 === 12 ? 12 : h12 + 12);
    onChange(h24, minIdx * 15);
  }

  return (
    <View style={wStyles.container}>
      <WheelColumn
        items={WHEEL_HOURS}
        initialIndex={displayH12 - 1}
        onSelect={(i) => { st.current.h12 = i + 1; emit(); }}
      />
      <Text style={wStyles.colon}>:</Text>
      <WheelColumn
        items={WHEEL_MINUTES}
        initialIndex={initMinIdx}
        onSelect={(i) => { st.current.minIdx = i; emit(); }}
      />
      <WheelColumn
        items={WHEEL_PERIODS}
        initialIndex={initPeriodIdx}
        onSelect={(i) => { st.current.pIdx = i as 0 | 1; emit(); }}
      />
    </View>
  );
}

const wStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 4,
  },
  column: {
    flex: 1,
    height: WHEEL_H,
    overflow: 'hidden',
  },
  item: {
    height: WHEEL_ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemActive: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  itemInactive: {
    fontSize: 18,
    fontWeight: '400',
    color: colors.textTertiary,
  },
  selectionLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.border,
  },
  colon: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingBottom: 2,
  },
});

function formatHour(hour24: number): string {
  if (hour24 === 0) return '12 AM';
  if (hour24 === 12) return '12 PM';
  return hour24 < 12 ? `${hour24} AM` : `${hour24 - 12} PM`;
}

interface CompactHourRangeProps {
  startHour: number;
  endHour: number;
  onStartChange: (hour24: number) => void;
  onEndChange: (hour24: number) => void;
}

function CompactHourRange({
  startHour,
  endHour,
  onStartChange,
  onEndChange,
}: CompactHourRangeProps) {
  return (
    <View style={hrStyles.row}>
      <View style={hrStyles.side}>
        <TouchableOpacity
          style={[hrStyles.btn, startHour <= 0 && hrStyles.btnDisabled]}
          onPress={() => {
            if (startHour > 0) {
              hapticSelection();
              onStartChange(startHour - 1);
            }
          }}
          activeOpacity={0.7}
          disabled={startHour <= 0}
        >
          <Text style={hrStyles.btnText}>−</Text>
        </TouchableOpacity>
        <Text style={hrStyles.time}>{formatHour(startHour)}</Text>
        <TouchableOpacity
          style={[hrStyles.btn, startHour >= endHour - 1 && hrStyles.btnDisabled]}
          onPress={() => {
            if (startHour < endHour - 1) {
              hapticSelection();
              onStartChange(startHour + 1);
            }
          }}
          activeOpacity={0.7}
          disabled={startHour >= endHour - 1}
        >
          <Text style={hrStyles.btnText}>+</Text>
        </TouchableOpacity>
      </View>
      <Text style={hrStyles.dash}>–</Text>
      <View style={hrStyles.side}>
        <TouchableOpacity
          style={[hrStyles.btn, endHour <= startHour + 1 && hrStyles.btnDisabled]}
          onPress={() => {
            if (endHour > startHour + 1) {
              hapticSelection();
              onEndChange(endHour - 1);
            }
          }}
          activeOpacity={0.7}
          disabled={endHour <= startHour + 1}
        >
          <Text style={hrStyles.btnText}>−</Text>
        </TouchableOpacity>
        <Text style={hrStyles.time}>{formatHour(endHour)}</Text>
        <TouchableOpacity
          style={[hrStyles.btn, endHour >= 23 && hrStyles.btnDisabled]}
          onPress={() => {
            if (endHour < 23) {
              hapticSelection();
              onEndChange(endHour + 1);
            }
          }}
          activeOpacity={0.7}
          disabled={endHour >= 23}
        >
          <Text style={hrStyles.btnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const hrStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  side: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dash: {
    fontSize: 15,
    color: colors.textTertiary,
    fontWeight: '500',
  },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: {
    opacity: 0.3,
  },
  btnText: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: '600',
    lineHeight: 20,
  },
  time: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    minWidth: 52,
    textAlign: 'center',
  },
});

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

  if (subscription_status === 'dev_trial') {
    return { label: 'Dev Plan', isNegative: false, tappable: false };
  }

  // Reserved for a future free tier (and any leftover Apple trial status).
  if (subscription_status === 'trial') {
    return { label: 'Free Plan', isNegative: false, tappable: false };
  }

  if (subscription_status === 'active') {
    if (product_id?.startsWith('com.remedyapp.annual')) {
      return { label: 'Annual Plan', isNegative: false, tappable: false };
    }
    if (product_id?.startsWith('com.remedyapp.weekly')) {
      return { label: 'Weekly Plan', isNegative: false, tappable: false };
    }
    if (product_id?.startsWith('com.remedyapp.monthly')) {
      return { label: 'Monthly Plan', isNegative: false, tappable: false };
    }
    return { label: 'Active Plan', isNegative: false, tappable: false };
  }

  if (subscription_status === 'cancelled') {
    return { label: 'Cancelled', isNegative: true, tappable: true };
  }

  return { label: 'No active plan', isNegative: true, tappable: true };
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
  const { user, signOut, deleteAccount } = useAuth();
  const { signOut: superwallSignOut } = useUser();
  const { refreshPremium } = usePremium();
  const router = useRouter();
  const { editName } = useLocalSearchParams<{ editName?: string }>();
  const { registerPlacement } = usePlacement({
    onDismiss: async (_info, result) => {
      if (result.type === 'purchased' || result.type === 'restored') {
        await refreshPremium();
      }
    },
    onSkip: () => {
      void refreshPremium();
    },
  });
  const nameInputRef = useRef<TextInput>(null);

  // Existing state
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(() => roundToQuarterHour(new Date()).hour);
  const [reminderMinute, setReminderMinute] = useState(() => roundToQuarterHour(new Date()).minute);
  const [workoutSheetVisible, setWorkoutSheetVisible] = useState(false);
  const [workoutSheetPreferNotif, setWorkoutSheetPreferNotif] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);

  // Stretch reminders
  const [stretchEnabled, setStretchEnabled] = useState(false);
  const [stretchInterval, setStretchInterval] = useState(60);
  const [stretchStartHour, setStretchStartHour] = useState(9);
  const [stretchEndHour, setStretchEndHour] = useState(18);
  const [stretchExpanded, setStretchExpanded] = useState(false);

  // New state
  const [userProgramData, setUserProgramData] = useState<UserProgramWithProgram | null>(null);
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);

  // Inline name editing
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');

  // Restore state
  const [restoring, setRestoring] = useState(false);
  const [openingPaywall, setOpeningPaywall] = useState(false);

  // "Have a code?" promo sheet (backend creator codes + Apple offer-code fallback).
  const [promoVisible, setPromoVisible] = useState(false);

  // Delete account state
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Hidden until the App Store listing is live — the write-review URL 404s before that.
  const [showRateRemedy, setShowRateRemedy] = useState(false);

  // Reload on every focus (not just mount) so the plan card reflects a retake-rebuilt
  // program or fresh completions as soon as the user returns to this tab.
  useFocusEffect(
    useCallback(() => {
    if (!user) return;

    (async () => {
      const [
        profileRes,
        notifPref,
        notifTime,
        offsetStr,
        stretchPrefs,
        userProgramRes,
        entitlementRes,
      ] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        AsyncStorage.getItem(STORAGE_NOTIF),
        AsyncStorage.getItem(STORAGE_NOTIF_TIME),
        AsyncStorage.getItem(STORAGE_DAY_OFFSET),
        AsyncStorage.multiGet([
          STORAGE_STRETCH,
          STORAGE_STRETCH_INTERVAL,
          STORAGE_STRETCH_START,
          STORAGE_STRETCH_END,
        ]),
        supabase
          .from('user_programs')
          .select('*, programs(name, duration_weeks), user_program_plans(program_name, subtitle, duration_weeks)')
          .eq('user_id', user.id)
          .single(),
        supabase
          .from('entitlements')
          .select('*')
          .eq('user_id', user.id)
          .single(),
      ]);

      setProfile(profileRes.data);
      setNotificationsEnabled(notifPref === 'true');
      if (notifTime) {
        const parsed = JSON.parse(notifTime) as { hour: number; minute: number };
        setReminderHour(parsed.hour);
        setReminderMinute(parsed.minute);
      }
      setDayOffset(offsetStr ? parseInt(offsetStr, 10) : 0);

      const stretchMap = Object.fromEntries(stretchPrefs);
      setStretchEnabled(stretchMap[STORAGE_STRETCH] === 'true');
      const startHour = stretchMap[STORAGE_STRETCH_START]
        ? parseInt(stretchMap[STORAGE_STRETCH_START], 10)
        : 9;
      const endHour = stretchMap[STORAGE_STRETCH_END]
        ? parseInt(stretchMap[STORAGE_STRETCH_END], 10)
        : 18;
      if (stretchMap[STORAGE_STRETCH_START]) setStretchStartHour(startHour);
      if (stretchMap[STORAGE_STRETCH_END]) setStretchEndHour(endHour);
      if (stretchMap[STORAGE_STRETCH_INTERVAL]) {
        const parsed = parseInt(stretchMap[STORAGE_STRETCH_INTERVAL], 10);
        const allowed = STRETCH_INTERVAL_OPTIONS.some((opt) => opt.value === parsed);
        const next = allowed ? parsed : 60;
        setStretchInterval(next);
        if (!allowed) {
          await AsyncStorage.setItem(STORAGE_STRETCH_INTERVAL, '60');
          if (stretchMap[STORAGE_STRETCH] === 'true') {
            await scheduleStretchReminders(60, startHour, endHour);
          }
        }
      }

      setUserProgramData(userProgramRes.data as UserProgramWithProgram | null);
      setEntitlement(entitlementRes.data);
    })();
    }, [user]),
  );

  const startEditingName = useCallback((opts?: { focusDelayMs?: number }) => {
    const name = resolveDisplayName(profile?.display_name, user) ?? 'User';
    setNameInput(name);
    setEditingName(true);
    const delay = opts?.focusDelayMs ?? 50;
    setTimeout(() => nameInputRef.current?.focus(), delay);
  }, [profile?.display_name, user]);

  useFocusEffect(
    useCallback(() => {
      const flag = Array.isArray(editName) ? editName[0] : editName;
      if (flag !== '1') return;
      startEditingName({ focusDelayMs: 400 });
      router.setParams({ editName: '' });
    }, [editName, startEditingName, router]),
  );

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'ios') return;
      let cancelled = false;
      void isManualWriteReviewAvailable().then((live) => {
        if (!cancelled) setShowRateRemedy(live);
      });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (!user) {
    return (
      <TabFadeWrapper>
        <View style={[styles.container, { paddingTop: insets.top + 16 }]} />
      </TabFadeWrapper>
    );
  }

  const resolvedName = resolveDisplayName(profile?.display_name, user) ?? 'User';

  async function commitNameEdit() {
    setEditingName(false);
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === resolvedName) return;

    setProfile((prev) => (prev ? { ...prev, display_name: trimmed } : prev));
    rememberDisplayName(user!.id, trimmed);
    invalidateTabRefresh('home');
    await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('id', user!.id);
    // The name is user-entered text and never leaves the device — only the fact
    // that one is now set.
    displayNameUpdated({ has_name: true });
  }

  // Plan card — prefer the personalized snapshot name over the legacy program name.
  const programName =
    userProgramData?.user_program_plans?.program_name ?? userProgramData?.programs?.name ?? null;

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
    if (code === 'transaction_already_linked') {
      return (
        'This subscription is linked to a different Remedy account. Sign in with the ' +
        'account that purchased it to restore access.'
      );
    }
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
    restoreStarted({ source_screen: 'profile', is_authenticated: true });
    try {
      // Pull the real restored StoreKit transaction (original id + signed JWS) and
      // re-verify it server-side.
      const tx = await restoreRemedyTransaction();
      if (!tx) {
        restoreFailed({ source_screen: 'profile', reason: 'no_transaction' });
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
        restoreFailed({
          source_screen: 'profile',
          reason: toRestoreReason(await extractInvokeError(data, error)),
        });
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
      restoreSucceeded({ source_screen: 'profile', product_id: toProductId(tx.productId) });
      Alert.alert('Restore Purchases', 'Subscription restored successfully.');
    } catch {
      restoreFailed({ source_screen: 'profile', reason: 'network' });
      Alert.alert(
        'Restore Purchases',
        'Something went wrong. Check your connection and try again.',
      );
    } finally {
      setRestoring(false);
    }
  }

  async function handleResubscribe() {
    hapticSelection();
    if (!SUPERWALL_AVAILABLE) {
      Alert.alert(
        'Purchases unavailable',
        'Purchases are unavailable right now. Please try again later.',
      );
      return;
    }
    setOpeningPaywall(true);
    try {
      await setSuperwallSubscriptionInactive();
      await registerPlacement({ placement: 'onboarding_paywall' });
    } catch {
      Alert.alert('Could not open checkout', 'Please try again.');
    } finally {
      setOpeningPaywall(false);
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
  // Delete account
  // ---------------------------------------------------------------------------
  function getDeleteAccountErrorMessage(error?: string): string {
    if (error === 'rate_limited') {
      return 'Too many attempts. Please wait a bit and try again.';
    }
    if (error === 'missing_auth' || error === 'invalid_auth') {
      return 'Your session expired. Please sign in again and retry.';
    }
    return 'Something went wrong deleting your account. Check your connection and try again.';
  }

  function confirmDeleteAccount() {
    hapticWarning();

    const hasApplePlan =
      entitlement?.source !== 'promo' &&
      (entitlement?.subscription_status === 'active' ||
        entitlement?.subscription_status === 'trial' ||
        entitlement?.subscription_status === 'cancelled');

    Alert.alert(
      'Delete Account',
      hasApplePlan
        ? 'This permanently erases your profile, program, and history. This cannot be undone.\n\nDeleting your account does NOT cancel your Apple subscription. Cancel it separately in Settings → Apple ID → Subscriptions to avoid future charges.'
        : 'This permanently erases your profile, program, and history. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            // Second, explicit confirmation — mirrors the industry-standard
            // "delete my account" double-confirm pattern for irreversible actions.
            Alert.alert(
              'Are you absolutely sure?',
              'Your account and all data will be permanently deleted. This action cannot be reversed.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete My Account',
                  style: 'destructive',
                  onPress: handleDeleteAccount,
                },
              ],
            );
          },
        },
      ],
    );
  }

  async function handleDeleteAccount() {
    if (deletingAccount) return;
    setDeletingAccount(true);
    try {
      const result = await deleteAccount();
      if (!result.success) {
        accountDeletionFailed({ reason: result.error });
        Alert.alert('Delete Account', getDeleteAccountErrorMessage(result.error));
        return;
      }
      // Reset Superwall identity so a deleted account's paywall assignment doesn't
      // leak to the next person signing in on this device.
      void superwallSignOut();
      // No further navigation needed — clearing the session (inside deleteAccount)
      // flips the root guard in app/_layout.tsx back to the signed-out flow.
    } catch {
      accountDeletionFailed({ reason: 'request_failed' });
      Alert.alert('Delete Account', getDeleteAccountErrorMessage());
    } finally {
      setDeletingAccount(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Event handlers (all unchanged from original)
  // ---------------------------------------------------------------------------
  function openWorkoutDaysSheet(enableNotif: boolean) {
    hapticSelection();
    setWorkoutSheetPreferNotif(enableNotif);
    setWorkoutSheetVisible(true);
  }

  async function handleNotificationToggle(value: boolean) {
    if (value) {
      setNotificationsEnabled(true);
      openWorkoutDaysSheet(true);
      return;
    }
    setNotificationsEnabled(false);
    await AsyncStorage.setItem(STORAGE_NOTIF, 'false');
    await cancelWorkoutReminders();
    dailyReminderDisabled();
  }

  async function closeWorkoutDaysSheet() {
    setWorkoutSheetVisible(false);
    const stored = await AsyncStorage.getItem(STORAGE_NOTIF);
    setNotificationsEnabled(stored === 'true');
  }

  async function handleStretchToggle(value: boolean) {
    setStretchEnabled(value);

    if (value) {
      // The permission result was previously ignored, so a denial (or a throw from push
      // token registration) left this switch on with nothing scheduled. Only persist
      // "on" once reminders are actually in place.
      let granted = false;
      try {
        granted = await requestPermissions(user!.id, 'stretch_break');
        if (granted) {
          await scheduleStretchReminders(stretchInterval, stretchStartHour, stretchEndHour);
        }
      } catch {
        granted = false;
      }

      if (!granted) {
        setStretchEnabled(false);
        await AsyncStorage.setItem(STORAGE_STRETCH, 'false');
        Alert.alert(
          'Reminders are off',
          'Remedy needs notification permission for stretch breaks. Turn on Notifications for Remedy in iOS Settings, then try again.',
        );
        return;
      }

      await AsyncStorage.setItem(STORAGE_STRETCH, 'true');
      stretchRemindersEnabled({
        interval_minutes: stretchInterval,
        start_hour: stretchStartHour,
        end_hour: stretchEndHour,
      });
    } else {
      await AsyncStorage.setItem(STORAGE_STRETCH, 'false');
      setStretchExpanded(false);
      await cancelStretchReminders();
      stretchRemindersDisabled();
    }
  }

  async function handleStretchIntervalChange(interval: number) {
    hapticSelection();
    setStretchInterval(interval);
    await AsyncStorage.setItem(STORAGE_STRETCH_INTERVAL, String(interval));
    if (stretchEnabled) {
      await scheduleStretchReminders(interval, stretchStartHour, stretchEndHour);
    }
  }

  async function handleStretchStartChange(hour24: number) {
    setStretchStartHour(hour24);
    await AsyncStorage.setItem(STORAGE_STRETCH_START, String(hour24));
    if (stretchEnabled) {
      await scheduleStretchReminders(stretchInterval, hour24, stretchEndHour);
    }
  }

  async function handleStretchEndChange(hour24: number) {
    setStretchEndHour(hour24);
    await AsyncStorage.setItem(STORAGE_STRETCH_END, String(hour24));
    if (stretchEnabled) {
      await scheduleStretchReminders(stretchInterval, stretchStartHour, hour24);
    }
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
            const [completionsRes, checkinsRes, restartRes] = await Promise.all([
              supabase
                .from('session_completions')
                .delete()
                .eq('user_id', user!.id),
              supabase
                .from('pain_checkins')
                .delete()
                .eq('user_id', user!.id),
              // Server-side reset (migration 029): direct client UPDATE on
              // user_programs is revoked so the pointer can't be forged.
              supabase.rpc('restart_program', { p_reset_started_at: true }),
            ]);

            // The three calls are independent — a partial failure (network, RLS,
            // timeout) must not show "Done" while leaving e.g. completions deleted
            // but the pointer still mid-program (or vice versa). Only flag the
            // reset-pending state and report success once every part succeeded.
            const failed = [completionsRes, checkinsRes, restartRes].some((r) => r.error);
            if (failed) {
              Alert.alert(
                'Reset Incomplete',
                'Something went wrong and progress could not be fully reset. Please check your connection and try again.',
              );
              return;
            }

            await AsyncStorage.setItem('remedy_reset_pending', '1');
            progressReset();
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

        {/* ── Identity ── */}
        <View style={styles.card}>
          <View style={[styles.nameBox, editingName && styles.nameBoxEditing]}>
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
              <TouchableOpacity
                onPress={() => startEditingName()}
                activeOpacity={0.7}
                style={styles.nameRow}
                accessibilityRole="button"
                accessibilityLabel="Edit name"
              >
                <Text style={styles.name} numberOfLines={1}>{resolvedName}</Text>
                <Ionicons
                  name="pencil-outline"
                  size={18}
                  color={colors.textTertiary}
                />
              </TouchableOpacity>
            )}
          </View>
          {user.email ? <Text style={styles.email}>{user.email}</Text> : null}
          <TouchableOpacity
            style={[styles.planChip, planInfo.isNegative && styles.planChipNegative]}
            onPress={planInfo.tappable ? () => { void handleResubscribe(); } : undefined}
            activeOpacity={planInfo.tappable ? 0.7 : 1}
            disabled={!planInfo.tappable || openingPaywall}
            accessibilityRole={planInfo.tappable ? 'button' : 'text'}
            accessibilityLabel={planInfo.label}
          >
            {openingPaywall && planInfo.tappable ? (
              <ActivityIndicator size="small" color={colors.secondary} />
            ) : (
              <Text
                style={[
                  styles.planChipText,
                  planInfo.isNegative && styles.planChipTextNegative,
                ]}
              >
                {planInfo.label}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Program ── */}
        <Text style={styles.sectionLabel}>Program</Text>
        <View style={styles.settingsCard}>
          <TouchableOpacity
            style={styles.chevronRow}
            onPress={() => router.push('/onboarding-answers')}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Edit your program"
          >
            <View style={styles.chevronRowTextCol}>
              <Text style={styles.editProgramLabel}>
                {programName ?? 'Edit your program'}
              </Text>
              <Text style={styles.chevronRowCaption}>
                Pain, equipment, schedule, and goals
              </Text>
            </View>
            <Text style={styles.editProgramChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {showRateRemedy && (
          <TouchableOpacity
            style={styles.rateCard}
            onPress={() => {
              hapticSelection();
              openWriteReviewPage();
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Rate Remedy"
          >
            <Ionicons name="star-outline" size={20} color={colors.primary} />
            <Text style={styles.rateCardTitle}>Rate Remedy</Text>
            <Text style={styles.rateCardChevron}>›</Text>
          </TouchableOpacity>
        )}

        {/* ── Reminders ── */}
        <Text style={styles.sectionLabel}>Reminders</Text>
        <View style={styles.settingsCard}>
          <View style={styles.settingsRow}>
            <Text style={styles.settingsRowLabel}>Workout reminder</Text>
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
              <TouchableOpacity
                style={styles.reminderSummaryRow}
                onPress={() => openWorkoutDaysSheet(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.reminderSummaryText}>
                  {formatTime12(reminderHour, reminderMinute)}
                </Text>
                <Text style={styles.chevronIcon}>›</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.divider} />

          <View style={styles.settingsRow}>
            <Text style={styles.settingsRowLabel}>Stretch reminders</Text>
            <Switch
              value={stretchEnabled}
              onValueChange={handleStretchToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={stretchEnabled ? colors.surface : '#F4F4F4'}
            />
          </View>
          {stretchEnabled && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.reminderSummaryRow}
                onPress={() => setStretchExpanded((prev) => !prev)}
                activeOpacity={0.7}
              >
                <Text style={styles.reminderSummaryText}>
                  Every {stretchIntervalLabel(stretchInterval).toLowerCase()} ·{' '}
                  {formatHour(stretchStartHour)} – {formatHour(stretchEndHour)}
                </Text>
                <Text style={styles.chevronIcon}>{stretchExpanded ? '▴' : '▾'}</Text>
              </TouchableOpacity>
              {stretchExpanded && (
                <View style={styles.stretchExpanded}>
                  <View style={styles.compactSettingRow}>
                    <Text style={styles.compactSettingLabel}>Every</Text>
                    <View style={styles.compactIntervalRow}>
                      {STRETCH_INTERVAL_OPTIONS.map((opt) => (
                        <TouchableOpacity
                          key={opt.value}
                          style={[
                            styles.compactChip,
                            stretchInterval === opt.value && styles.compactChipSelected,
                          ]}
                          onPress={() => handleStretchIntervalChange(opt.value)}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.compactChipText,
                              stretchInterval === opt.value && styles.compactChipTextSelected,
                            ]}
                          >
                            {opt.short}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={styles.compactSettingRow}>
                    <Text style={styles.compactSettingLabel}>Hours</Text>
                    <CompactHourRange
                      startHour={stretchStartHour}
                      endHour={stretchEndHour}
                      onStartChange={handleStretchStartChange}
                      onEndChange={handleStretchEndChange}
                    />
                  </View>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── Account ── */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.settingsCard}>
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

          <View style={styles.divider} />

          {/* Have a code? — backend creator codes + Apple offer-code fallback */}
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => setPromoVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.settingsRowLabel}>Have a code?</Text>
            <Text style={styles.chevronIcon}>›</Text>
          </TouchableOpacity>

          {/* Resubscribe — cancelled, expired, or no plan. Opens Superwall in place
              (navigating to match would bounce a still-premium cancelled user home). */}
          {entitlement?.subscription_status !== 'active' &&
            entitlement?.subscription_status !== 'trial' &&
            entitlement?.subscription_status !== 'dev_trial' && (
            <>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.settingsRow}
                onPress={() => { void handleResubscribe(); }}
                activeOpacity={0.7}
                disabled={openingPaywall}
              >
                <Text style={styles.settingsRowLabel}>Resubscribe</Text>
                {openingPaywall ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Text style={styles.chevronIcon}>›</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {/* Manage Subscription — Apple-backed plans only. Promo grants have
              no App Store subscription to manage. */}
          {entitlement?.source !== 'promo' &&
            (entitlement?.subscription_status === 'active' ||
              entitlement?.subscription_status === 'trial' ||
              entitlement?.subscription_status === 'dev_trial' ||
              entitlement?.subscription_status === 'cancelled') && (
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

        <Text style={styles.sectionLabel}>More</Text>
        <View style={styles.settingsCard}>
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => {
              hapticSelection();
              router.push('/feedback');
            }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Send Feedback"
          >
            <Text style={styles.settingsRowLabel}>Send Feedback</Text>
            <Text style={styles.chevronIcon}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => {
              hapticSelection();
              openContactPage();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.settingsRowLabel}>Contact</Text>
            <Text style={styles.chevronIcon}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => {
              hapticSelection();
              openLegalDocument('terms', 'profile');
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.settingsRowLabel}>Terms of Service</Text>
            <Text style={styles.chevronIcon}>›</Text>
          </TouchableOpacity>
          <View style={styles.divider} />
          <TouchableOpacity
            style={styles.settingsRow}
            onPress={() => {
              hapticSelection();
              openLegalDocument('privacy', 'profile');
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.settingsRowLabel}>Privacy Policy</Text>
            <Text style={styles.chevronIcon}>›</Text>
          </TouchableOpacity>
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

        <View style={styles.accountActions}>
          <TouchableOpacity
            style={styles.signOutButton}
            onPress={() => {
              hapticWarning();
              signedOut({ source_screen: 'profile' });
              // Reset Superwall identity too, so paywall assignments don't leak to the
              // next account signed in on this device.
              void superwallSignOut();
              signOut();
            }}
            activeOpacity={0.7}
          >
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>

          {/* Delete Account (Apple guideline 5.1.1(v) requirement) */}
          <TouchableOpacity
            style={styles.deleteAccountButton}
            onPress={confirmDeleteAccount}
            activeOpacity={0.7}
            disabled={deletingAccount}
            accessibilityRole="button"
            accessibilityLabel="Delete Account"
          >
            {deletingAccount ? (
              <ActivityIndicator size="small" color={colors.secondary} />
            ) : (
              <Text style={styles.deleteAccountText}>Delete Account</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
      <WorkoutDaysModal
        visible={workoutSheetVisible}
        preferNotifOn={workoutSheetPreferNotif}
        initialNotif={notificationsEnabled}
        initialHour={reminderHour}
        initialMinute={reminderMinute}
        onClose={() => {
          void closeWorkoutDaysSheet();
        }}
        onSaved={(result) => {
          setNotificationsEnabled(result.notifEnabled);
          setReminderHour(result.hour);
          setReminderMinute(result.minute);
          setWorkoutSheetVisible(false);
        }}
        onEditProgram={() => {
          void closeWorkoutDaysSheet();
          router.push('/onboarding-answers');
        }}
      />
      <PromoCodeSheet
        visible={promoVisible}
        onClose={() => setPromoVisible(false)}
        // Already inside the app — refreshPremium ran inside the sheet; re-read the
        // entitlement row so the Plan card reflects the fresh grant immediately.
        onAccessGranted={() => {
          if (!user) return;
          void supabase
            .from('entitlements')
            .select('*')
            .eq('user_id', user.id)
            .single()
            .then(({ data }) => {
              if (data) setEntitlement(data);
            });
        }}
      />
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
  nameBox: {
    marginBottom: 4,
  },
  nameBoxEditing: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: -12,
    borderRadius: radius.chip,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  name: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  nameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.textPrimary,
    paddingVertical: 0,
    letterSpacing: -0.3,
  },
  email: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  planChip: {
    alignSelf: 'flex-start',
    marginTop: 8,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  planChipNegative: {
    backgroundColor: colors.secondaryMuted,
  },
  planChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.primary,
  },
  planChipTextNegative: {
    color: colors.secondary,
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
  chevronRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  chevronRowTextCol: {
    flex: 1,
    marginRight: 12,
    gap: 2,
  },
  editProgramLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  editProgramChevron: {
    fontSize: 20,
    color: colors.primary,
    lineHeight: 24,
  },
  chevronRowCaption: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  chevronIcon: {
    fontSize: 20,
    color: colors.textTertiary,
    lineHeight: 24,
  },
  rateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.card,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 28,
    gap: 12,
  },
  rateCardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.primaryDeep,
  },
  rateCardChevron: {
    fontSize: 20,
    color: colors.primary,
    lineHeight: 24,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderLight,
    marginHorizontal: 20,
  },

  // ── Reminders ──
  reminderSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  reminderSummaryText: {
    flex: 1,
    fontSize: 15,
    color: colors.textSecondary,
    marginRight: 8,
  },
  stretchExpanded: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  compactSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  compactSettingLabel: {
    fontSize: 15,
    color: colors.textPrimary,
    width: 52,
  },
  compactIntervalRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
  },
  compactChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.chip,
    backgroundColor: colors.background,
  },
  compactChipSelected: {
    backgroundColor: colors.primary,
  },
  compactChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  compactChipTextSelected: {
    color: colors.surface,
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

  // ── Sign Out / Delete Account ──
  accountActions: {
    marginTop: 4,
    gap: 10,
  },
  signOutButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderRadius: radius.button,
    paddingVertical: 16,
    ...shadows.low,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  deleteAccountButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondaryMuted,
    borderRadius: radius.button,
    paddingVertical: 16,
  },
  deleteAccountText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.secondary,
  },
});
