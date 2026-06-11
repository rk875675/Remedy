import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  requestPermissions,
  scheduleDailyReminder,
  cancelReminders,
} from '../../lib/notifications';
import { colors } from '../../constants/colors';
import { hapticWarning, hapticSelection } from '../../lib/haptics';
import { TabFadeWrapper } from '../../components/ui/TabFadeWrapper';
import type { Profile } from '../../types/database';

const STORAGE_NOTIF = 'remedy_notifications_enabled';
const STORAGE_NOTIF_TIME = 'remedy_notification_time';
const STORAGE_DAY_OFFSET = 'dev_day_offset';

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
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  cellSelected: {
    backgroundColor: colors.secondary,
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

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [reminderHour, setReminderHour] = useState(9);
  const [reminderMinute, setReminderMinute] = useState(0);
  const [dayOffset, setDayOffset] = useState(0);

  useEffect(() => {
    if (!user) return;

    (async () => {
      const [profileRes, notifPref, notifTime, offsetStr] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        AsyncStorage.getItem(STORAGE_NOTIF),
        AsyncStorage.getItem(STORAGE_NOTIF_TIME),
        AsyncStorage.getItem(STORAGE_DAY_OFFSET),
      ]);

      setProfile(profileRes.data);
      setNotificationsEnabled(notifPref === 'true');
      if (notifTime) {
        const parsed = JSON.parse(notifTime) as { hour: number; minute: number };
        setReminderHour(parsed.hour);
        setReminderMinute(parsed.minute);
      }
      setDayOffset(offsetStr ? parseInt(offsetStr, 10) : 0);
    })();
  }, [user]);

  if (!user) {
    return <TabFadeWrapper><View style={[styles.container, { paddingTop: insets.top + 16 }]} /></TabFadeWrapper>;
  }

  const displayName =
    profile?.display_name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    (user.email ? user.email.split('@')[0] : 'User');

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
    router.push('/(paywall)');
  }

  return (
    <TabFadeWrapper>
      <ScrollView
        style={[styles.container, { paddingTop: insets.top + 16 }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
      <Text style={styles.title}>Profile</Text>

      {/* Identity card */}
      <View style={styles.card}>
        <Text style={styles.name}>{displayName}</Text>
        <Text style={styles.email}>{user.email ?? ''}</Text>
      </View>

      {/* Settings section */}
      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.settingsCard}>
        <View style={styles.settingsRow}>
          <Text style={styles.settingsRowLabel}>Daily reminder</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationToggle}
            trackColor={{ false: '#E8E0DC', true: colors.secondary }}
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
        <View style={styles.divider} />
        <View style={styles.settingsRow}>
          <Text style={styles.settingsRowLabel}>App Version</Text>
          <Text style={styles.settingsRowValue}>0.1.0</Text>
        </View>
      </View>

      {/* Developer section — only visible when is_dev = true */}
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

      {/* Sign Out */}
      <TouchableOpacity
        style={styles.signOutButton}
        onPress={() => {
          hapticWarning();
          signOut();
        }}
        activeOpacity={0.7}
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
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  email: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  settingsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
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
  settingsRowValue: {
    fontSize: 15,
    color: colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0ECE8',
    marginHorizontal: 20,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
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
  signOutButton: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  signOutText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.primary,
  },
});
