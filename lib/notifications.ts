import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// Fixed identifier for the daily session reminder. Using a stable ID means
// re-scheduling always replaces the existing notification atomically — no race
// condition even if the scheduler is called multiple times in quick succession.
const DAILY_REMINDER_ID = 'remedy-daily-reminder';

// Identifier prefix + storage key for the stretch reminder system. Keeping the
// stretch notifications namespaced lets the daily reminder and stretch reminder
// systems be cancelled independently of one another.
const STRETCH_ID_PREFIX = 'remedy-stretch-';
const STORAGE_STRETCH_IDS = 'remedy_stretch_ids';

export async function requestPermissions(userId: string): Promise<string | null> {
  const existing = await Notifications.getPermissionsAsync();
  let isGranted = (existing as { granted?: boolean }).granted === true;

  if (!isGranted) {
    const requested = await Notifications.requestPermissionsAsync();
    isGranted = (requested as { granted?: boolean }).granted === true;
  }

  if (!isGranted) return null;

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: Constants.expoConfig?.extra?.eas?.projectId,
  });
  const token = tokenData.data;

  await supabase
    .from('profiles')
    .update({ push_token: token })
    .eq('id', userId);

  return token;
}

export async function scheduleDailyReminder(hour: number, minute: number): Promise<void> {
  // Scheduling with the same identifier replaces any existing notification with
  // that ID, so this is safe to call multiple times without accumulating duplicates.
  await Notifications.scheduleNotificationAsync({
    identifier: DAILY_REMINDER_ID,
    content: {
      title: 'Time for your session',
      body: 'Open Remedy and get today\'s exercises done.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

// Cancels the daily reminder only, without touching stretch reminders.
export async function cancelReminders(): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(DAILY_REMINDER_ID);
}

// ---------------------------------------------------------------------------
// Stretch reminders
// ---------------------------------------------------------------------------

const STRETCH_TITLE = 'Stretch break';
const STRETCH_BODY = 'Get up and move — take a short walk or do a quick stretch.';

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
