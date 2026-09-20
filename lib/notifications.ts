import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import type { z } from 'zod';
import { supabase } from './supabase';
import {
  notificationPermissionDenied,
  notificationPermissionGranted,
  notificationPermissionRequested,
} from './analytics/events/engagement';
import type { notificationPurpose } from './analytics/events/enums';

type NotificationPurpose = z.infer<typeof notificationPurpose>;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Legacy identifier — kept only for one-time cancellation of pre-migration schedules.
const LEGACY_DAILY_REMINDER_ID = 'remedy-daily-reminder';

// Workout reminders: one WEEKLY notification per selected day-of-week.
// IDs are stable per day so re-scheduling atomically replaces the existing one.
const WORKOUT_REMINDER_PREFIX = 'remedy-workout-';
const STORAGE_WORKOUT_IDS = 'remedy_workout_ids';

// Identifier prefix + storage key for the stretch reminder system. Keeping the
// stretch notifications namespaced lets workout reminders and stretch reminders
// be cancelled independently of one another.
const STRETCH_ID_PREFIX = 'remedy-stretch-';
const STORAGE_STRETCH_IDS = 'remedy_stretch_ids';

// Internal day index (0=Mon … 6=Sun) → expo-notifications weekday (1=Sun … 7=Sat)
function toExpoWeekday(dayIndex: number): number {
  return dayIndex === 6 ? 1 : dayIndex + 2;
}

/**
 * `purpose` exists only so the permission outcome is attributable to the toggle
 * that triggered it — iOS grants this once, so which feature spent the single
 * prompt is worth knowing. Instrumented here rather than at the call sites
 * because only this function can tell an actual prompt from an already-granted
 * permission.
 */
export async function requestPermissions(
  userId: string,
  purpose: NotificationPurpose,
): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  let isGranted = (existing as { granted?: boolean }).granted === true;

  if (!isGranted) {
    notificationPermissionRequested({ purpose });
    const requested = await Notifications.requestPermissionsAsync();
    isGranted = (requested as { granted?: boolean }).granted === true;
    if (isGranted) notificationPermissionGranted({ purpose });
    else notificationPermissionDenied({ purpose });
  }

  if (!isGranted) return false;

  // Best-effort and deliberately not part of the result. Every reminder in this app is a
  // LOCAL notification, which needs permission only — no push token and no APNs
  // entitlement. This app ships without the expo-notifications config plugin, so
  // getExpoPushTokenAsync() throws on device; when its result gated scheduling, the
  // reminder toggles read "on" while nothing was ever scheduled.
  void registerPushToken(userId);

  return true;
}

async function registerPushToken(userId: string): Promise<void> {
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    await supabase
      .from('profiles')
      .update({ push_token: tokenData.data })
      .eq('id', userId);
  } catch {
    // Remote push is not wired up for V1. A missing token must never break local reminders.
  }
}

/**
 * Schedule weekly workout reminders — one per selected day, firing at the
 * given time. Cancels any previous workout reminders first (including the legacy
 * daily reminder), so this is safe to call whenever selection or time changes.
 *
 * @param selectedDays  Array of day indices: 0 = Monday … 6 = Sunday.
 * @param hour          24-hour clock hour (0–23).
 * @param minute        Minutes (0–59).
 */
export async function scheduleWorkoutReminders(
  selectedDays: number[],
  hour: number,
  minute: number,
): Promise<void> {
  await cancelWorkoutReminders();
  if (selectedDays.length === 0) return;

  const ids: string[] = [];
  for (const dayIndex of selectedDays) {
    const identifier = `${WORKOUT_REMINDER_PREFIX}${dayIndex}`;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: 'Time for your workout',
        body: "Today's exercises are ready. Open Remedy and get it done.",
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: toExpoWeekday(dayIndex),
        hour,
        minute,
      },
    });
    ids.push(identifier);
  }

  await AsyncStorage.setItem(STORAGE_WORKOUT_IDS, JSON.stringify(ids));
}

/** Cancel all scheduled workout reminders (also clears any legacy daily reminder). */
export async function cancelWorkoutReminders(): Promise<void> {
  // One-time migration: cancel any pre-existing daily reminder.
  await Notifications.cancelScheduledNotificationAsync(LEGACY_DAILY_REMINDER_ID).catch(() => {});

  const raw = await AsyncStorage.getItem(STORAGE_WORKOUT_IDS);
  if (raw) {
    let ids: string[] = [];
    try {
      ids = JSON.parse(raw) as string[];
    } catch {
      ids = [];
    }
    await Promise.all(
      ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
    );
  }
  await AsyncStorage.removeItem(STORAGE_WORKOUT_IDS);
}

/** Alias kept for call sites that previously used `cancelReminders`. */
export async function cancelReminders(): Promise<void> {
  await cancelWorkoutReminders();
}

// ---------------------------------------------------------------------------
// Stretch reminders
// ---------------------------------------------------------------------------

const STRETCH_TITLE = 'Stretch break';
const STRETCH_BODY = 'Get up and move. Take a short walk or do a quick stretch.';

// Builds the list of future slot times for today + tomorrow that fall within
// the active hours window, spaced by the configured interval.
function buildStretchSlots(
  intervalMinutes: number,
  startHour: number,
  endHour: number,
): Date[] {
  const slots: Date[] = [];
  const now = new Date();

  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    const base = new Date(now);
    base.setDate(base.getDate() + dayOffset);
    base.setHours(startHour, 0, 0, 0);

    const dayEnd = new Date(base);
    dayEnd.setHours(endHour, 0, 0, 0);

    for (
      let slot = new Date(base);
      slot <= dayEnd;
      slot = new Date(slot.getTime() + intervalMinutes * 60_000)
    ) {
      if (slot.getTime() > now.getTime()) {
        slots.push(new Date(slot));
      }
    }
  }

  return slots;
}

// Cancels prior stretch notifications and schedules a fresh set of one-off
// notifications for every active-hours slot across today + tomorrow.
export async function scheduleStretchReminders(
  intervalMinutes: number,
  startHour: number,
  endHour: number,
): Promise<void> {
  await cancelStretchReminders();

  const slots = buildStretchSlots(intervalMinutes, startHour, endHour);
  const ids: string[] = [];

  for (const slot of slots) {
    const identifier = `${STRETCH_ID_PREFIX}${slot.toISOString()}`;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: STRETCH_TITLE,
        body: STRETCH_BODY,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: slot,
      },
    });
    ids.push(identifier);
  }

  await AsyncStorage.setItem(STORAGE_STRETCH_IDS, JSON.stringify(ids));
}

// Cancels every scheduled stretch notification and clears the stored IDs.
export async function cancelStretchReminders(): Promise<void> {
  const raw = await AsyncStorage.getItem(STORAGE_STRETCH_IDS);
  if (raw) {
    let ids: string[] = [];
    try {
      ids = JSON.parse(raw) as string[];
    } catch {
      ids = [];
    }
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  }
  await AsyncStorage.removeItem(STORAGE_STRETCH_IDS);
}

// Returns the soonest future stretch reminder time, or null if none remain.
export async function getNextStretchTime(): Promise<Date | null> {
  const raw = await AsyncStorage.getItem(STORAGE_STRETCH_IDS);
  if (!raw) return null;

  let ids: string[] = [];
  try {
    ids = JSON.parse(raw) as string[];
  } catch {
    return null;
  }

  const now = Date.now();
  const futureTimes = ids
    .map((id) => new Date(id.slice(STRETCH_ID_PREFIX.length)))
    .filter((d) => !Number.isNaN(d.getTime()) && d.getTime() > now)
    .sort((a, b) => a.getTime() - b.getTime());

  return futureTimes[0] ?? null;
}
