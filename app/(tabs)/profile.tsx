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
const STORAGE_DAY_OFFSET = 'dev_day_offset';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [dayOffset, setDayOffset] = useState(0);

  useEffect(() => {
    if (!user) return;

    (async () => {
      const [profileRes, notifPref, offsetStr] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        AsyncStorage.getItem(STORAGE_NOTIF),
        AsyncStorage.getItem(STORAGE_DAY_OFFSET),
      ]);

      setProfile(profileRes.data);
      setNotificationsEnabled(notifPref === 'true');
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
      await scheduleDailyReminder(9, 0);
    } else {
      await cancelReminders();
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
          <Text style={styles.settingsRowLabel}>Notifications</Text>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleNotificationToggle}
            trackColor={{ false: '#E8E0DC', true: colors.secondary }}
            thumbColor={notificationsEnabled ? colors.surface : '#F4F4F4'}
          />
        </View>
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
