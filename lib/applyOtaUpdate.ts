import * as Updates from 'expo-updates';

/** Download and apply an EAS Update on this launch — no second force-quit. */
export async function applyAvailableUpdate(): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable) return;
    const fetched = await Updates.fetchUpdateAsync();
    if (fetched.isNew) {
      await Updates.reloadAsync();
    }
  } catch {
    // Stay on the current bundle if Expo is unreachable.
  }
}
