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
import {
  PET_STRETCH_REMINDERS,
  PET_WORKOUT_REMINDERS,
  petLine,
} from '../constants/petLines';

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

// Stretch reminders use their own id prefix and storage key. Cancelling one
// system only removes that prefix, so a workout save never clears stretch
// alarms and a stretch pause never clears workout alarms.
const STRETCH_ID_PREFIX = 'remedy-stretch-';
const STORAGE_STRETCH_IDS = 'remedy_stretch_ids';
export const STRETCH_PAUSED_KEY = 'remedy_stretch_paused';

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

type ReminderLine = { readonly title: string; readonly body: string };

function reminderText(
  lines: readonly ReminderLine[],
  index: number,
  petName: string | null,
): { title: string; body: string } {
  if (lines.length === 0) return { title: 'Remedy', body: 'A short one is waiting.' };
  const slot = ((index % lines.length) + lines.length) % lines.length;
  const line = lines[slot] ?? lines[0];
  if (!line) return { title: 'Remedy', body: 'A short one is waiting.' };
  return {
    title: petLine(line.title, petName),
    body: petLine(line.body, petName),
  };
}

/** Workout line for the onboarding preview. Same pool the scheduler sends. */
export function workoutReminderPreview(
  petName: string | null,
  index: number,
): { title: string; body: string } {
  return reminderText(PET_WORKOUT_REMINDERS, index, petName);
}

/**
 * Rebuild workout alarms when the days, time, or copy on the device don't match
 * what is saved. No-op when they already match. Does not touch stretch alarms.
 */
export async function ensureWorkoutReminders(
  selectedDays: number[],
  hour: number,
  minute: number,
): Promise<void> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if ((existing as { granted?: boolean }).granted !== true) return;

    const petName = await getRememberedPetName();
    const expectedIds = selectedDays.map((day) => `${WORKOUT_REMINDER_PREFIX}${day}`);
    let live: { identifier: string; title: string | null; body: string | null }[] = [];
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      live = all
        .filter(
          (request) =>
            request.identifier.startsWith(WORKOUT_REMINDER_PREFIX) ||
            request.identifier === LEGACY_DAILY_REMINDER_ID,
        )
        .map((request) => ({
          identifier: request.identifier,
          title: request.content.title,
          body: request.content.body,
        }));
    } catch {
      live = [];
    }

    const staleCopy = selectedDays.some((day) => {
      const copy = reminderText(PET_WORKOUT_REMINDERS, day, petName);
      const found = live.find((item) => item.identifier === `${WORKOUT_REMINDER_PREFIX}${day}`);
      return !found || found.title !== copy.title || found.body !== copy.body;
    });
    const staleIds =
      live.some((item) => item.identifier === LEGACY_DAILY_REMINDER_ID) ||
      !sameIds(
        live.map((item) => item.identifier).filter((id) => id !== LEGACY_DAILY_REMINDER_ID),
        expectedIds,
      );
    if (staleCopy || staleIds) {
      await scheduleWorkoutReminders(selectedDays, hour, minute);
    }
  } catch {
    // Leave the existing workout alarms in place.
  }
}

/**
 * Schedule weekly workout reminders — one per selected day, firing at the
 * given time. Cancels any previous workout reminders first (including the legacy
 * daily reminder), so this is safe to call whenever selection or time changes.
 * Does not touch stretch reminders.
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
    const copy = reminderText(PET_WORKOUT_REMINDERS, dayIndex, petName);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: copy.title,
        body: copy.body,
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

async function readIdList(key: string): Promise<string[]> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string');
  } catch {
    return [];
  }
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = new Set(a);
  if (seen.size !== a.length) return false;
  return b.every((id) => seen.has(id));
}

/** Cancel stored ids plus anything still on the OS with this prefix. Never touches the other prefix. */
async function cancelPrefixed(prefix: string, storageKey: string, extraIds: string[]): Promise<void> {
  const stored = await readIdList(storageKey);
  let live: string[] = [];
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    live = all.map((request) => request.identifier).filter((id) => id.startsWith(prefix));
  } catch {
    live = [];
  }
  const ids = new Set<string>([...stored, ...live, ...extraIds]);
  await Promise.all(
    [...ids].map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
  );
  await AsyncStorage.removeItem(storageKey);
}

/** Cancel all scheduled workout reminders (also clears any legacy daily reminder). */
export async function cancelWorkoutReminders(): Promise<void> {
  await cancelPrefixed(WORKOUT_REMINDER_PREFIX, STORAGE_WORKOUT_IDS, [LEGACY_DAILY_REMINDER_ID]);
}

/** Alias kept for call sites that previously used `cancelReminders`. */
export async function cancelReminders(): Promise<void> {
  await cancelWorkoutReminders();
}

// ---------------------------------------------------------------------------
// Stretch reminders
// ---------------------------------------------------------------------------

type StretchClock = { hour: number; minute: number };

// One repeating daily alarm per clock time inside the window. These keep
// firing without the app being opened. Workout reminders stay weekly.
function stretchClocks(intervalMinutes: number, startHour: number, endHour: number): StretchClock[] {
  if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1) return [];
  if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) return [];
  const start = startHour * 60;
  const end = endHour * 60;
  if (end < start) return [];
  const clocks: StretchClock[] = [];
  for (let mins = start; mins <= end; mins += intervalMinutes) {
    clocks.push({ hour: Math.floor(mins / 60) % 24, minute: mins % 60 });
  }
  return clocks;
}

function stretchId(clock: StretchClock): string {
  const hour = String(clock.hour).padStart(2, '0');
  const minute = String(clock.minute).padStart(2, '0');
  return `${STRETCH_ID_PREFIX}${hour}-${minute}`;
}

// Cancels prior stretch notifications and schedules a daily alarm for every
// slot in the window. Does not touch workout reminders.
export async function scheduleStretchReminders(
  intervalMinutes: number,
  startHour: number,
  endHour: number,
): Promise<void> {
  await cancelStretchReminders();

  const clocks = stretchClocks(intervalMinutes, startHour, endHour);
  const petName = await getRememberedPetName();
  const ids: string[] = [];

  for (let index = 0; index < clocks.length; index += 1) {
    const clock = clocks[index];
    if (!clock) continue;
    const identifier = stretchId(clock);
    const copy = reminderText(PET_STRETCH_REMINDERS, index, petName);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: copy.title,
        body: copy.body,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: clock.hour,
        minute: clock.minute,
      },
    });
    ids.push(identifier);
  }

  await AsyncStorage.setItem(STORAGE_STRETCH_IDS, JSON.stringify(ids));
}

/**
 * Rebuild stretch alarms when the slots or the stretch copy don't match.
 * No-op when both already match, and no-op without notification permission.
 * Never touches workout reminders.
 */
export async function ensureStretchReminders(
  intervalMinutes: number,
  startHour: number,
  endHour: number,
): Promise<void> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if ((existing as { granted?: boolean }).granted !== true) return;

    const clocks = stretchClocks(intervalMinutes, startHour, endHour);
    const expected = clocks.map(stretchId);
    const petName = await getRememberedPetName();
    let live: { identifier: string; title: string | null; body: string | null }[] | null = null;
    try {
      const all = await Notifications.getAllScheduledNotificationsAsync();
      live = all
        .filter((request) => request.identifier.startsWith(STRETCH_ID_PREFIX))
        .map((request) => ({
          identifier: request.identifier,
          title: request.content.title,
          body: request.content.body,
        }));
    } catch {
      live = null;
    }
    const liveIds = live ? live.map((item) => item.identifier) : await readIdList(STORAGE_STRETCH_IDS);
    const staleCopy =
      live !== null &&
      clocks.some((clock, index) => {
        const copy = reminderText(PET_STRETCH_REMINDERS, index, petName);
        const found = live?.find((item) => item.identifier === stretchId(clock));
        return !found || found.title !== copy.title || found.body !== copy.body;
      });
    if (sameIds(liveIds, expected) && !staleCopy) {
      const stored = await readIdList(STORAGE_STRETCH_IDS);
      if (!sameIds(stored, expected)) {
        await AsyncStorage.setItem(STORAGE_STRETCH_IDS, JSON.stringify(expected));
      }
      return;
    }
    await scheduleStretchReminders(intervalMinutes, startHour, endHour);
  } catch {
    // Home can still show the previous countdown.
  }
}

// Cancels every scheduled stretch notification and clears the stored IDs.
export async function cancelStretchReminders(): Promise<void> {
  await cancelPrefixed(STRETCH_ID_PREFIX, STORAGE_STRETCH_IDS, []);
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
      STRETCH_PAUSED_KEY,
    ]);
    const stored = Object.fromEntries(pairs);

    if (stored[STORAGE_NOTIF_ENABLED] === 'true') {
      const days = parseWorkoutDays(stored[STORAGE_WORKOUT_DAYS] ?? null);
      if (days.length > 0) {
        const time = parseReminderTime(stored[STORAGE_NOTIF_TIME] ?? null);
        await scheduleWorkoutReminders(days, time.hour, time.minute);
      }
    }

    if (stored[STORAGE_STRETCH_ENABLED] === 'true' && stored[STRETCH_PAUSED_KEY] !== 'true') {
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

const STRETCH_CLOCK_ID = /^remedy-stretch-(\d{2})-(\d{2})$/;

function nextClockTime(hour: number, minute: number, now: Date): Date {
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

// Soonest future stretch slot. Daily alarms roll forward on their own.
export async function getNextStretchTime(): Promise<Date | null> {
  const ids = await readIdList(STORAGE_STRETCH_IDS);
  const now = new Date();
  let soonest: Date | null = null;
  for (const id of ids) {
    const match = STRETCH_CLOCK_ID.exec(id);
    if (!match) continue;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (!Number.isFinite(hour) || !Number.isFinite(minute)) continue;
    const next = nextClockTime(hour, minute, now);
    if (!soonest || next.getTime() < soonest.getTime()) soonest = next;
  }
  return soonest;
}
