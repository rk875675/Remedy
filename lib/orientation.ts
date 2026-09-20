import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'remedy.orientationCompleted.';

export async function hasCompletedOrientation(userId: string): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(STORAGE_PREFIX + userId);
    return value === '1';
  } catch {
    return false;
  }
}

export async function markOrientationCompleted(userId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_PREFIX + userId, '1');
  } catch {
    // Best-effort: they will see orientation again next time.
  }
}
