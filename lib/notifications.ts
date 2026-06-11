import Constants from 'expo-constants';
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
  await cancelReminders();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Remedy',
      body: 'Time for your Remedy session 💪',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export async function cancelReminders(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}
