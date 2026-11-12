import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'remedy.petName';

/** Best-effort copy of the pet's name so local notifications can use it. A null name clears it. */
export async function rememberPetName(name: string | null): Promise<void> {
  try {
    if (name) await AsyncStorage.setItem(STORAGE_KEY, name);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort: reminders fall back to the generic wording.
  }
}

export async function getRememberedPetName(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
