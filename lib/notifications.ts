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
import { getRememberedPetName } from './petNameCache';
import { PET_STRETCH_REMINDER, PET_WORKOUT_REMINDER, petLine } from '../constants/petLines';

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

  const petName = await getRememberedPetName();
  const ids: string[] = [];
  for (const dayIndex of selectedDays) {
    const identifier = `${WORKOUT_REMINDER_PREFIX}${dayIndex}`;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: petLine(PET_WORKOUT_REMINDER.title, petName),
        body: PET_WORKOUT_REMINDER.body,
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
  const petName = await getRememberedPetName();
  const ids: string[] = [];

  for (const slot of slots) {
    const identifier = `${STRETCH_ID_PREFIX}${slot.toISOString()}`;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: PET_STRETCH_REMINDER.title,
        body: petLine(PET_STRETCH_REMINDER.body, petName),
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

// Profile / Home persist these. Duplicated so a rename can refresh reminder copy
// without importing those screens (they already import this module).
const STORAGE_NOTIF_ENABLED = 'remedy_notifications_enabled';
const STORAGE_NOTIF_TIME = 'remedy_notification_time';
const STORAGE_WORKOUT_DAYS = 'remedy_workout_days';
const STORAGE_STRETCH_ENABLED = 'remedy_stretch_enabled';
const STORAGE_STRETCH_INTERVAL = 'remedy_stretch_interval';
const STORAGE_STRETCH_START = 'remedy_stretch_start_hour';
const STORAGE_STRETCH_END = 'remedy_stretch_end_hour';
const STORAGE_STRETCH_PAUSED = 'remedy_stretch_paused';

function parseWorkoutDays(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((day): day is number => typeof day === 'number' && Number.isFinite(day));
  } catch {
    return [];
  }
}

function parseReminderTime(raw: string | null): { hour: number; minute: number } {
  if (!raw) return { hour: 9, minute: 0 };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { hour: 9, minute: 0 };
    const hour = 'hour' in parsed ? parsed.hour : undefined;
    const minute = 'minute' in parsed ? parsed.minute : undefined;
    if (typeof hour !== 'number' || typeof minute !== 'number') return { hour: 9, minute: 0 };
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) return { hour: 9, minute: 0 };
    return { hour, minute };
  } catch {
    return { hour: 9, minute: 0 };
  }
}

function parseStoredInt(raw: string | null, fallback: number): number | null {
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rewrite workout and stretch reminders so their text uses the current pet name.
 * No-op unless that reminder is already enabled (stretch also skipped while paused).
 * Never asks for notification permission. Never throws.
 */
export function refreshScheduledRemindersForPetName(): void {
  void refreshScheduledRemindersForPetNameAsync().catch(() => {});
}

async function refreshScheduledRemindersForPetNameAsync(): Promise<void> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if ((existing as { granted?: boolean }).granted !== true) return;

    const pairs = await AsyncStorage.multiGet([
      STORAGE_NOTIF_ENABLED,
      STORAGE_NOTIF_TIME,
      STORAGE_WORKOUT_DAYS,
      STORAGE_STRETCH_ENABLED,
      STORAGE_STRETCH_INTERVAL,
      STORAGE_STRETCH_START,
      STORAGE_STRETCH_END,
      STORAGE_STRETCH_PAUSED,
    ]);
    const stored = Object.fromEntries(pairs);

    if (stored[STORAGE_NOTIF_ENABLED] === 'true') {
      const days = parseWorkoutDays(stored[STORAGE_WORKOUT_DAYS] ?? null);
      if (days.length > 0) {
        const time = parseReminderTime(stored[STORAGE_NOTIF_TIME] ?? null);
        await scheduleWorkoutReminders(days, time.hour, time.minute);
      }
    }

    if (stored[STORAGE_STRETCH_ENABLED] === 'true' && stored[STORAGE_STRETCH_PAUSED] !== 'true') {
      const interval = parseStoredInt(stored[STORAGE_STRETCH_INTERVAL] ?? null, 60);
      const start = parseStoredInt(stored[STORAGE_STRETCH_START] ?? null, 9);
      const end = parseStoredInt(stored[STORAGE_STRETCH_END] ?? null, 18);
      if (interval !== null && start !== null && end !== null) {
        await scheduleStretchReminders(interval, start, end);
      }
    }
  } catch {
    // A rename must succeed even when reminders cannot be rewritten.
  }
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
