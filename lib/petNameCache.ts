import { useEffect, useMemo, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'remedy.petName';

// The name is also kept in memory so any component can show it (the tag on the
// pet's speech bubble) without each screen having to pass it down.
let current: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function setCurrent(name: string | null): void {
  if (current === name) return;
  current = name;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getCurrent(): string | null {
  return current;
}

/**
 * Best-effort copy of the pet's name: used by local notifications and by the
 * name tag on the pet's speech bubble. A null name clears it.
 */
export async function rememberPetName(name: string | null): Promise<void> {
  const clean = name && name.trim() ? name.trim() : null;
  loaded = true;
  setCurrent(clean);
  try {
    if (clean) await AsyncStorage.setItem(STORAGE_KEY, clean);
    else await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort: reminders fall back to the generic wording.
  }
}

/** Drop the device copy on sign-out so the next account cannot inherit it. */
export async function clearRememberedPetName(): Promise<void> {
  loaded = true;
  current = null;
  listeners.forEach((listener) => listener());
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Memory is already clear; a failed delete must not block sign-out.
  }
}

export async function getRememberedPetName(): Promise<string | null> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    // Only adopt the stored value if nothing newer has been set this run.
    if (!loaded) {
      loaded = true;
      setCurrent(stored);
    }
    return loaded ? current : stored;
  } catch {
    return current;
  }
}

/** The pet's name if the device knows it; updates when it is named or renamed. */
export function usePetName(): string | null {
  useEffect(() => {
    if (!loaded) void getRememberedPetName();
  }, []);
  return useSyncExternalStore(subscribe, getCurrent, getCurrent);
}

/**
 * A screen's own pet, with the name swapped for the one just saved on this
 * device. Home and Progress keep a fetched copy and do not reload on every
 * tab switch, so this is what makes a rename show up there immediately.
 */
export function useNamedPet<T extends { name: string | null }>(pet: T | null): T | null {
  const liveName = usePetName();
  return useMemo(() => {
    if (!pet || !liveName || pet.name === liveName) return pet;
    return { ...pet, name: liveName };
  }, [pet, liveName]);
}
