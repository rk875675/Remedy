// Post-session "help a friend out" card.
//
// Shows on a completion where pain dropped, and only when the App Store review
// sheet is not one that might still appear. The mutual annual discount is not
// live, so the card shares the App Store link and nothing else.
//
// Cadence, on this device:
//   - The first improved session never offers. The second can.
//   - After an offer, wait 14 days.
//   - After a send, wait 30 days.
//   - Three closes (X, or leaving the screen with the card up) and it stops.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import { APP_STORE_URL } from './app-store-review';

const KEYS = {
  LAST_TRIGGER: 'remedy.friendShare.lastTrigger',
  IMPROVED_COUNT: 'remedy.friendShare.improvedCount',
  LAST_OFFER_AT: 'remedy.friendShare.lastOfferAt',
  LAST_SHARE_AT: 'remedy.friendShare.lastShareAt',
  DISMISS_COUNT: 'remedy.friendShare.dismissCount',
  PREVIEW_SHOWN: 'remedy.friendShare.previewHomeShown',
  LIVE_BOTTOM: 'remedy.friendShare.liveBottomShown3',
  PENDING_HOME: 'remedy.friendShare.pendingHome',
} as const;

const pendingHomeSchema = z
  .object({
    painImproved: z.boolean(),
  })
  .strict();

export type FriendShareHomePrompt = z.infer<typeof pendingHomeSchema>;

const SHARE_TEST_EMAIL = 'rkumar875675@gmail.com';

/** Temporary. This account sees the sheet after every lesson so the flow can be tested. */
export function isShareTestAccount(email: string | null | undefined): boolean {
  return (email ?? '').trim().toLowerCase() === SHARE_TEST_EMAIL;
}
const MIN_IMPROVED_SESSIONS = 2;
const DISMISS_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
const SHARE_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DISMISSALS = 3;

export function friendShareSheetCopy(
  _firstName: string | null,
  _painImproved: boolean,
): { title: string; body: string } {
  return {
    title: 'Have someone owe you a favor.',
    body: "Others are still putting up with it, the way you used to. Be the reason someone you care about doesn't have to.",
  };
}

/** Written as the sender. The thread already shows who it is from. */
export function friendShareOutboundMessage(): string {
  return `Hey, I know you've been having back pain for a while, and it's always on your mind. Check out Remedy, it helped my back out a lot: ${APP_STORE_URL}`;
}


/** Same JS session, including a fast remount, must not decide twice. */
const handledTriggers = new Set<string>();

/** Dev-only. True until the one-shot preview has been used. Does not consume it. */
export async function friendSharePreviewAvailable(): Promise<boolean> {
  if (!__DEV__) return false;
  try {
    return (await AsyncStorage.getItem(KEYS.PREVIEW_SHOWN)) !== '1';
  } catch {
    return false;
  }
}

/**
 * Dev-only. The next Back to Home shows the sheet once, pain and review gates
 * included, so the layout can be looked at. Cleared after that arm.
 */
export async function claimFriendSharePreview(): Promise<boolean> {
  if (!__DEV__) return false;
  try {
    if ((await AsyncStorage.getItem(KEYS.PREVIEW_SHOWN)) === '1') return false;
    await AsyncStorage.multiSet([
      [KEYS.PREVIEW_SHOWN, '1'],
      [KEYS.LAST_OFFER_AT, new Date().toISOString()],
    ]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Dev-only. Opens the sheet on the next Home focus so the bottom layout can be
 * checked without finishing a session. One show per device.
 */
export async function liveBottomPreviewAvailable(): Promise<boolean> {
  if (!__DEV__) return false;
  try {
    return (await AsyncStorage.getItem(KEYS.LIVE_BOTTOM)) !== '1';
  } catch {
    return false;
  }
}

export async function markLiveBottomPreview(): Promise<void> {
  if (!__DEV__) return;
  try {
    await AsyncStorage.setItem(KEYS.LIVE_BOTTOM, '1');
  } catch {
    // A second Home focus can show it again. Still dev-only.
  }
}

function within(iso: string | null, windowMs: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < windowMs;
}

async function readCount(key: string): Promise<number> {
  const raw = await AsyncStorage.getItem(key);
  const parsed = raw ? parseInt(raw, 10) : 0;
  return Number.isNaN(parsed) ? 0 : parsed;
}

async function incrementImproved(): Promise<number> {
  const next = (await readCount(KEYS.IMPROVED_COUNT)) + 1;
  await AsyncStorage.setItem(KEYS.IMPROVED_COUNT, String(next));
  return next;
}

/**
 * Decides whether this completion should show the card. Records the offer
 * timestamp when it returns true, so leaving the screen still counts as shown.
 */
export async function considerFriendShare(input: {
  triggerKey: string;
  painImproved: boolean;
  reviewMayDisplay: boolean;
}): Promise<boolean> {
  if (handledTriggers.has(input.triggerKey)) return false;
  handledTriggers.add(input.triggerKey);

  try {
    const lastTrigger = await AsyncStorage.getItem(KEYS.LAST_TRIGGER);
    if (lastTrigger === input.triggerKey) return false;
    await AsyncStorage.setItem(KEYS.LAST_TRIGGER, input.triggerKey);

    if (!input.painImproved || input.reviewMayDisplay) {
      if (input.painImproved) await incrementImproved();
      return false;
    }

    const improved = await incrementImproved();
    if (improved < MIN_IMPROVED_SESSIONS) return false;

    const [dismissCount, lastOfferAt, lastShareAt] = await Promise.all([
      readCount(KEYS.DISMISS_COUNT),
      AsyncStorage.getItem(KEYS.LAST_OFFER_AT),
      AsyncStorage.getItem(KEYS.LAST_SHARE_AT),
    ]);

    if (dismissCount >= MAX_DISMISSALS) return false;
    if (within(lastShareAt, SHARE_SNOOZE_MS)) return false;
    if (within(lastOfferAt, DISMISS_SNOOZE_MS)) return false;

    await AsyncStorage.setItem(KEYS.LAST_OFFER_AT, new Date().toISOString());
    return true;
  } catch {
    // Unreadable cadence storage would let the card repeat. Stay quiet.
    return false;
  }
}

export async function recordFriendShareDismissed(): Promise<void> {
  try {
    const next = (await readCount(KEYS.DISMISS_COUNT)) + 1;
    await AsyncStorage.setItem(KEYS.DISMISS_COUNT, String(next));
  } catch {
    // A missed increment can cost one extra offer. The 14-day snooze still holds.
  }
}

/** In-memory copy so Home can show the sheet in the same turn as Back to Home. */
let pendingHome: FriendShareHomePrompt | null = null;
let consumingHome = false;

/** Stash the offer until Home is focused after Back to Home. */
export async function armFriendShareHome(prompt: FriendShareHomePrompt): Promise<void> {
  pendingHome = prompt;
  try {
    await AsyncStorage.setItem(KEYS.PENDING_HOME, JSON.stringify(prompt));
  } catch {
    // The in-memory copy still covers this process.
  }
}

/** Read and clear the stashed offer. Invalid payloads are dropped. */
export async function consumeFriendShareHome(): Promise<FriendShareHomePrompt | null> {
  if (consumingHome) return null;
  consumingHome = true;
  try {
    const memory = pendingHome;
    pendingHome = null;
    if (memory) {
      await AsyncStorage.removeItem(KEYS.PENDING_HOME).catch(() => {});
      return memory;
    }
    const raw = await AsyncStorage.getItem(KEYS.PENDING_HOME);
    if (!raw) return null;
    await AsyncStorage.removeItem(KEYS.PENDING_HOME);
    const parsed = pendingHomeSchema.safeParse(JSON.parse(raw) as unknown);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    consumingHome = false;
  }
}

export async function recordFriendShareShared(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEYS.LAST_SHARE_AT, new Date().toISOString());
  } catch {
    // The offer timestamp already snoozes 14 days if this write fails.
  }
}
