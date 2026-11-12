// Native App Store review sheet (SKStoreReviewController), requested after a
// session where the user's pain went down.
//
// What this module does NOT do: decide whether pain improved. The caller passes
// that in, computed from the values the session screen already holds.
//
// Things about this API that are counterintuitive and drive the code below:
//   - iOS shows the sheet at most 3 times per app, per device, per 365 days, and
//     silently discards every request past that. requestReview() still resolves
//     normally. There is no error, no callback, and no way to know whether
//     anything appeared. So: never branch on the result, and never await it
//     before navigating.
//   - Because Apple already throttles, this module deliberately adds NO cooldown
//     of its own. A second local counter would drift from Apple's and suppress
//     prompts Apple would have granted. The only local guard is idempotency.
//   - It is a no-op in TestFlight, and unthrottled in Simulator/debug builds.
//     Neither resembles production. Judge this feature by the analytics funnel,
//     not by whether a sheet appears.

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Linking, Platform } from 'react-native';

import { isFeatureEnabled } from './analytics';
import {
  reviewManualTapped,
  reviewPromptRequested,
  reviewPromptSkipped,
} from './analytics/events/engagement';

/**
 * Binaries built before expo-store-review was added do not contain the native
 * module, and the package's JS entry point calls requireNativeModule() at import
 * time — which throws, red-boxing the app on import rather than at call time.
 * requireOptionalNativeModule returns null instead, making absence detectable.
 *
 * Do not replace this with a static `import * as StoreReview from
 * 'expo-store-review'`. That reintroduces the crash for anyone on an older
 * binary (stale dev client, or JS delivered ahead of a native build).
 */
function getStoreReview(): typeof import('expo-store-review') | null {
  if (!requireOptionalNativeModule('ExpoStoreReview')) {
    return null;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('expo-store-review') as typeof import('expo-store-review');
}

const KEYS = {
  LIFETIME_SESSIONS: 'remedy.appReview.lifetimeSessions',
  LAST_REQUEST_AT: 'remedy.appReview.lastRequestAt',
  LAST_REQUEST_TRIGGER: 'remedy.appReview.lastRequestTrigger',
  LISTING_LIVE: 'remedy.appReview.listingLive',
  REQUEST_COUNT: 'remedy.appReview.requestCount',
  REQUEST_WINDOW_START: 'remedy.appReview.requestWindowStart',
} as const;

/** Remote kill switch. Defaults off when PostHog is unreachable — see isFeatureEnabled. */
const FLAG_KEY = 'app_store_review_prompt';

/** Numeric App Store Connect id for com.remedyappco.ios. */
const APP_STORE_ID = '6813745106';

/** Store listing, without the write-review action. */
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

const APP_STORE_REVIEW_URL = `https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review`;
const ITUNES_LOOKUP_URL = `https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=us`;

/** Once the US listing exists, stay live for the process. */
let listingLiveMemory = false;
let listingMissAt = 0;
const LISTING_MISS_TTL_MS = 10 * 60 * 1000;

function itunesResultCount(value: unknown): number {
  if (typeof value !== 'object' || value === null || !('resultCount' in value)) {
    return 0;
  }
  const count = (value as { resultCount: unknown }).resultCount;
  return typeof count === 'number' && Number.isFinite(count) ? count : 0;
}

/**
 * The write-review URL 404s until Apple publishes the listing. Hide every
 * manual "Rate Remedy" / "Leave a review" entry point until lookup says the
 * US store page exists, then cache that forever. Fails closed: a reviewer
 * never taps a dead App Store link.
 */
export async function isManualWriteReviewAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  if (listingLiveMemory) return true;

  try {
    const cached = await AsyncStorage.getItem(KEYS.LISTING_LIVE);
    if (cached === '1') {
      listingLiveMemory = true;
      return true;
    }
  } catch {
    // Fall through to the network check.
  }

  if (listingMissAt > 0 && Date.now() - listingMissAt < LISTING_MISS_TTL_MS) {
    return false;
  }

  try {
    const response = await fetch(ITUNES_LOOKUP_URL);
    if (!response.ok) {
      listingMissAt = Date.now();
      return false;
    }
    const live = itunesResultCount(await response.json()) > 0;
    if (!live) {
      listingMissAt = Date.now();
      return false;
    }
    listingLiveMemory = true;
    try {
      await AsyncStorage.setItem(KEYS.LISTING_LIVE, '1');
    } catch {
      // Memory cache still holds for this session.
    }
    return true;
  } catch {
    listingMissAt = Date.now();
    return false;
  }
}

/** Don't ask someone who has completed nothing. 1 = eligible from the first session. */
const MIN_SESSIONS = 1;

/**
 * 0 = no app-side cooldown, deliberately. iOS already caps prompts at 3 per 365
 * days and drops the rest, which is exactly the "as often as Apple allows"
 * behaviour we want. Raising this throws away allotment Apple would have granted.
 */
const MIN_HOURS_SINCE_LAST_REQUEST = 0;

/** Surfaces allowed to trigger the sheet. Both are post-session "it worked" moments. */
export type ReviewSourceScreen = 'session' | 'weekly_ramp';

/** What this completion did with the native review API. */
export type ReviewAttempt = {
  /** `requestReview()` was called. Says nothing about whether iOS drew the sheet. */
  requested: boolean;
  /**
   * This call is still inside Apple's 3-per-365-days display cap, so the sheet
   * might be on screen. Further calls in the same window are discarded by iOS.
   */
  mayDisplay: boolean;
};

const REVIEW_SKIPPED: ReviewAttempt = { requested: false, mayDisplay: false };

/** Apple shows the sheet at most this many times per app, per 365 days. */
const APPLE_PROMPT_CAP = 3;
const REVIEW_WINDOW_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Counts this request toward Apple's yearly cap. Returns whether the sheet
 * might actually appear. A storage failure assumes it might, so a share card
 * does not stack on top of a review sheet we failed to remember.
 */
async function noteReviewRequest(): Promise<{ withinCap: boolean; count: number; windowStart: string }> {
  const now = Date.now();
  let count = 0;
  let windowStart = new Date(now).toISOString();
  try {
    const [rawCount, rawStart] = await Promise.all([
      AsyncStorage.getItem(KEYS.REQUEST_COUNT),
      AsyncStorage.getItem(KEYS.REQUEST_WINDOW_START),
    ]);
    const startMs = rawStart ? Date.parse(rawStart) : NaN;
    if (Number.isFinite(startMs) && now - startMs < REVIEW_WINDOW_MS) {
      windowStart = new Date(startMs).toISOString();
      const parsed = rawCount ? parseInt(rawCount, 10) : 0;
      count = Number.isNaN(parsed) ? 0 : parsed;
    }
  } catch {
    return { withinCap: true, count: 1, windowStart };
  }
  return { withinCap: count + 1 <= APPLE_PROMPT_CAP, count: count + 1, windowStart };
}

function hoursSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60);
}

/**
 * Call once per completed session, regardless of the pain outcome, so eligibility
 * keeps advancing even while the prompt itself is gated off.
 */
export async function incrementSessionsCompleted(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.LIFETIME_SESSIONS);
    const current = raw ? parseInt(raw, 10) : 0;
    const next = (Number.isNaN(current) ? 0 : current) + 1;
    await AsyncStorage.setItem(KEYS.LIFETIME_SESSIONS, String(next));
  } catch {
    // Best-effort: a missed increment only delays eligibility by one session.
  }
}

export type ReviewTrigger = {
  /**
   * Stable, unique key for this earned moment, used only for idempotency — a
   * re-render, a back-navigation or a remount must not fire twice for the same
   * session. A plan_session_id for a session, `week:<planId>:<n>` for a ramp.
   */
  triggerKey: string;
  /** Computed by the caller from the pain values it already has. */
  painImproved: boolean;
  sourceScreen: ReviewSourceScreen;
  /** Analytics only. Omitted on the weekly ramp, which is not keyed to a session. */
  planSessionId?: string;
  weekNumber?: number;
};

/**
 * Requests the native review sheet if this moment qualifies. Safe to call on
 * every completion; every rejection path is instrumented.
 *
 * Never await this before navigating — it resolves independently of whether the
 * sheet was shown. The return value is only "did we call requestReview, and
 * might Apple still display it", which the share card uses to stay off that screen.
 */
export async function maybeRequestReviewAfterSession(trigger: ReviewTrigger): Promise<ReviewAttempt> {
  const { triggerKey, painImproved, sourceScreen, planSessionId, weekNumber } = trigger;
  const skip = (reason: Parameters<typeof reviewPromptSkipped>[0]['reason']): ReviewAttempt => {
    reviewPromptSkipped({ source_screen: sourceScreen, reason });
    return REVIEW_SKIPPED;
  };

  // The only product rule: this is a "the app just worked for me" moment.
  if (!painImproved) {
    return skip('pain_not_improved');
  }

  // Gate A: build-time flag baked into the binary. Lets the feature ship dormant
  // and lets QA force it on in a specific build.
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const buildEnabled = extra?.enableAppStoreReviewPrompt === true;
  if (__DEV__ && !buildEnabled) {
    return skip('dev');
  }
  if (!buildEnabled) {
    return skip('build_gate_off');
  }

  // Android maps to Play In-App Review, a different API with its own quota that
  // will not show in debug at all. Out of scope.
  if (Platform.OS !== 'ios') {
    return skip('not_ios');
  }

  // Gate B: remote kill switch. Once a binary is on the App Store, a hardcoded
  // trigger cannot be turned off without another release cycle.
  if (!(await isFeatureEnabled(FLAG_KEY))) {
    return skip('flag_off');
  }

  // Gate C: local eligibility.
  let count = 0;
  let lastRequestAt: string | null = null;
  let lastTriggerKey: string | null = null;
  try {
    const [rawCount, rawLastAt, rawLastKey] = await Promise.all([
      AsyncStorage.getItem(KEYS.LIFETIME_SESSIONS),
      AsyncStorage.getItem(KEYS.LAST_REQUEST_AT),
      AsyncStorage.getItem(KEYS.LAST_REQUEST_TRIGGER),
    ]);
    count = rawCount ? parseInt(rawCount, 10) : 0;
    lastRequestAt = rawLastAt;
    lastTriggerKey = rawLastKey;
  } catch {
    // Unreadable storage means the idempotency guard is gone. Skip rather than
    // risk double-prompting for one session.
    return skip('threshold');
  }

  if (Number.isNaN(count) || count < MIN_SESSIONS) {
    return skip('threshold');
  }

  if (lastTriggerKey && lastTriggerKey === triggerKey) {
    return skip('already_requested_for_trigger');
  }

  if (MIN_HOURS_SINCE_LAST_REQUEST > 0 && hoursSince(lastRequestAt) < MIN_HOURS_SINCE_LAST_REQUEST) {
    return skip('cooldown');
  }

  const StoreReview = getStoreReview();
  if (!StoreReview) {
    return skip('native_module_missing');
  }

  // False in TestFlight, where requestReview() is a documented no-op.
  if (!(await StoreReview.isAvailableAsync())) {
    return skip('unavailable');
  }

  const noted = await noteReviewRequest();

  // Recorded BEFORE requesting: requestReview() resolves whether or not iOS
  // showed anything, so there is no success callback to record from.
  try {
    await AsyncStorage.multiSet([
      [KEYS.LAST_REQUEST_AT, new Date().toISOString()],
      [KEYS.LAST_REQUEST_TRIGGER, triggerKey],
      [KEYS.REQUEST_COUNT, String(noted.count)],
      [KEYS.REQUEST_WINDOW_START, noted.windowStart],
    ]);
  } catch {
    // Losing the write costs at most one duplicate request, which iOS throttles.
  }

  reviewPromptRequested({
    source_screen: sourceScreen,
    ...(planSessionId ? { plan_session_id: planSessionId } : {}),
    ...(weekNumber !== undefined ? { week_number: weekNumber } : {}),
  });

  // Fire-and-forget. Apple decides whether the sheet appears; never await it.
  void StoreReview.requestReview();
  return { requested: true, mayDisplay: noted.withinCap };
}

/**
 * Manual entry point for users who actively want to review. Uses the write-review
 * deep link rather than requestReview(), which Apple does not permit behind a
 * button and which is invisibly throttled anyway.
 */
export function openWriteReviewPage(source_screen: 'profile' | 'feedback' = 'profile'): void {
  void (async () => {
    if (!(await isManualWriteReviewAvailable())) return;
    reviewManualTapped({ source_screen });
    void Linking.openURL(APP_STORE_REVIEW_URL).catch(() => {});
  })();
}
