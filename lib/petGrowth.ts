import AsyncStorage from '@react-native-async-storage/async-storage';

import type { PetStage } from '../constants/petImages';

// The last stage this user has seen their pet at, so the "it grew" moment is
// shown once, on whichever screen comes right after the session that caused it.
const STORAGE_PREFIX = 'remedy.petSeenStage.';

function parseStage(value: string | null): PetStage | null {
  const n = Number(value);
  return n === 1 || n === 2 || n === 3 || n === 4 || n === 5 ? n : null;
}

/** Call when a session starts, with the stage before it is completed. */
export async function markPetStageSeen(userId: string, stage: PetStage): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_PREFIX + userId, String(stage));
  } catch {
    // Best-effort: worst case a growth moment is skipped.
  }
}

/**
 * Call after a session is completed, with the stage now. Returns the stage the
 * pet grew FROM if it has grown since it was last seen, otherwise null, and
 * records the new stage so the moment is not shown twice.
 */
export async function takePetGrowth(userId: string, stage: PetStage): Promise<PetStage | null> {
  try {
    const seen = parseStage(await AsyncStorage.getItem(STORAGE_PREFIX + userId));
    await AsyncStorage.setItem(STORAGE_PREFIX + userId, String(stage));
    return seen !== null && seen < stage ? seen : null;
  } catch {
    return null;
  }
}
