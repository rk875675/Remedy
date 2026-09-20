// =============================================================================
// ANALYTICS FACADE
//
// This is the ONLY module in the codebase permitted to touch the PostHog SDK.
// If you are about to write `from 'posthog-react-native'` anywhere else: stop.
// Add a typed event wrapper in `lib/analytics/events/` instead, and add the row
// to docs/ANALYTICS.md in the same commit. See docs/ANALYTICS.md §8.
//
// Guarantees this module makes, which the rest of the app relies on:
//   1. It never throws. Every SDK call is wrapped and failures are swallowed.
//   2. It never returns a promise the caller has to await, and never blocks a
//      user-visible action.
//   3. Calls made before the SDK has loaded are buffered in order and replayed
//      once it binds, so events fired during first paint are not lost.
//   4. With ANALYTICS_ENABLED false it is a total no-op and the SDK is never
//      even imported — the dependency does not initialize, open storage, or
//      touch the network.
// =============================================================================

// Type-only: erased at compile time, so this import does not pull the SDK into
// the bundle graph at runtime. The single runtime import lives in initAnalytics().
import type { PostHog } from 'posthog-react-native';

import {
  ANALYTICS_DEBUG,
  ANALYTICS_ENABLED,
  FLUSH_AT,
  FLUSH_INTERVAL_MS,
  MAX_QUEUE_SIZE,
  MAX_QUEUED_CALLS,
  POSTHOG_HOST,
  POSTHOG_KEY,
} from './config';

/**
 * Values permitted in an event payload. Deliberately excludes nested objects:
 * they are unqueryable in PostHog breakdowns and are the usual way a free-text
 * blob or a whole API response ends up in analytics by accident.
 */
export type AnalyticsPropertyValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | readonly string[]
  | readonly number[];

export type AnalyticsProperties = Record<string, AnalyticsPropertyValue>;

/** The subset of the SDK's JsonType we permit. Named locally so the SDK's types
 *  stay behind this module's boundary. */
type SdkProperties = Record<string, string | number | boolean | null | string[] | number[]>;

type QueuedCall = { label: string; run: (client: PostHog) => void };

let client: PostHog | null = null;
let queued: QueuedCall[] = [];
let initStarted = false;
let droppedCallCount = 0;

export { ANALYTICS_ENABLED };

// -----------------------------------------------------------------------------
// Internals
// -----------------------------------------------------------------------------

function safeRun(label: string, fn: () => void): void {
  try {
    fn();
  } catch (error) {
    // Analytics must never crash the app.
    if (ANALYTICS_DEBUG) {
      console.log(`[analytics] "${label}" threw and was swallowed`, error);
    }
  }
}

/** Fire-and-forget a promise-returning SDK call without leaking a rejection. */
function swallow(result: unknown): void {
  if (result instanceof Promise) result.catch(() => {});
}

function enqueueOrRun(label: string, run: (client: PostHog) => void): void {
  if (!ANALYTICS_ENABLED) return;

  const bound = client;
  if (bound) {
    safeRun(label, () => run(bound));
    return;
  }

  if (queued.length >= MAX_QUEUED_CALLS) {
    queued.shift();
    droppedCallCount += 1;
  }
  queued.push({ label, run });
}

/**
 * Drops `undefined` values and copies arrays before handing them to the SDK.
 *
 * Undefined is dropped rather than coerced to null because "the property was
 * never set" and "the property is empty" are different answers in a breakdown,
 * and collapsing them makes optional properties unqueryable.
 */
function sanitize(properties?: AnalyticsProperties): SdkProperties | undefined {
  if (!properties) return undefined;

  const sanitized: SdkProperties = {};
  for (const key of Object.keys(properties)) {
    const value = properties[key];
    if (value === undefined) continue;
    sanitized[key] =
      typeof value === 'object' && value !== null
        ? ([...value] as string[] | number[])
        : value;
  }
  return sanitized;
}

function logDev(kind: string, name: string, properties?: AnalyticsProperties): void {
  if (!ANALYTICS_DEBUG || !ANALYTICS_ENABLED) return;
  if (properties && Object.keys(properties).length > 0) {
    console.log(`[analytics] ${kind} → ${name}`, properties);
  } else {
    console.log(`[analytics] ${kind} → ${name}`);
  }
}

// -----------------------------------------------------------------------------
// Lifecycle
// -----------------------------------------------------------------------------

/**
 * Loads the SDK and binds it. Safe to call more than once; only the first call
 * does work. Resolves whether or not init succeeded — a failure leaves the app
 * running with analytics silently off, which is the correct trade.
 */
export async function initAnalytics(): Promise<void> {
  if (!ANALYTICS_ENABLED || initStarted) return;
  initStarted = true;

  try {
    // The one runtime reference to the SDK in the entire codebase.
    const { PostHog: PostHogClient } = await import('posthog-react-native');

    setClient(
      new PostHogClient(POSTHOG_KEY, {
        host: POSTHOG_HOST,
        flushAt: FLUSH_AT,
        flushInterval: FLUSH_INTERVAL_MS,
        maxQueueSize: MAX_QUEUE_SIZE,

        // Kept ON. Application Installed / Opened / Backgrounded is the only
        // reliable install-and-return signal we have, it is low volume, and the
        // PRD's D7/D30 retention targets are measured on it.
        captureAppLifecycleEvents: true,

        // Kept OFF. Privacy-label impact, App Store disclosure obligations, and
        // bandwidth cost during video playback. See docs/ANALYTICS.md §7.
        enableSessionReplay: false,

        // No PostHogSurveyProvider is mounted, so loading surveys would only add
        // a startup request for data nothing renders.
        disableSurveys: true,

        // Warms the flag cache in the background at init (non-blocking) so that
        // isFeatureEnabled() can answer synchronously later. Paywall variants are
        // still bridged from Superwall as person properties, not evaluated here;
        // the one flag this serves is the App Store review prompt kill switch,
        // which has to be answerable at the moment a session ends.
        preloadFeatureFlags: true,
      }),
    );

    if (ANALYTICS_DEBUG) {
      console.log(`[analytics] enabled — host ${POSTHOG_HOST}, flushAt ${FLUSH_AT}`);
    }
  } catch (error) {
    // Allow a later retry rather than latching off for the whole session.
    initStarted = false;
    if (ANALYTICS_DEBUG) {
      console.log('[analytics] SDK failed to load; running without analytics', error);
    }
  }
}

/**
 * Binds the client and replays anything buffered, in the order it was called.
 * Exposed so tests can inject a fake client or unbind with `null`.
 */
export function setClient(next: PostHog | null): void {
  client = next;
  if (!next) return;

  const pending = queued;
  queued = [];

  if (ANALYTICS_DEBUG && (pending.length > 0 || droppedCallCount > 0)) {
    const dropped = droppedCallCount > 0 ? `, ${droppedCallCount} dropped` : '';
    console.log(`[analytics] client bound — replaying ${pending.length} buffered call(s)${dropped}`);
  }
  droppedCallCount = 0;

  for (const call of pending) {
    safeRun(call.label, () => call.run(next));
  }
}

// -----------------------------------------------------------------------------
// Public surface — capture, screen, identify, reset, setPersonProperties, flush
// -----------------------------------------------------------------------------

export function capture(event: string, properties?: AnalyticsProperties): void {
  logDev('capture', event, properties);
  const payload = sanitize(properties);
  enqueueOrRun(`capture:${event}`, (c) => {
    c.capture(event, payload);
  });
}

/**
 * Emits `$screen`. `name` must be a normalized route pattern from
 * `lib/analytics/routes.ts` — never an interpolated path, never a query string.
 */
export function screen(name: string, properties?: AnalyticsProperties): void {
  logDev('screen', name, properties);
  const payload = sanitize(properties);
  enqueueOrRun(`screen:${name}`, (c) => {
    swallow(c.screen(name, payload));
  });
}

/**
 * `distinctId` must be the Supabase Auth UUID and nothing else — never an email,
 * a display name, or any other mutable or personally identifying value.
 *
 * Called while the current person is anonymous, this merges the pre-auth funnel
 * (onboarding, paywall, purchase) into the identified person. That merge is the
 * whole reason the top of Remedy's funnel is attributable, so do not call reset()
 * on the anonymous → authenticated transition.
 */
export function identify(distinctId: string, personProperties?: AnalyticsProperties): void {
  logDev('identify', distinctId, personProperties);
  const payload = sanitize(personProperties);
  enqueueOrRun(`identify:${distinctId}`, (c) => {
    c.identify(distinctId, payload);
  });
}

/** Clears identity and cached person state. Logout and account switch only. */
export function reset(): void {
  logDev('reset', 'identity');
  enqueueOrRun('reset', (c) => {
    c.reset();
  });
}

export function setPersonProperties(
  properties: AnalyticsProperties,
  propertiesToSetOnce?: AnalyticsProperties,
): void {
  logDev('person', 'properties', properties);
  const payload = sanitize(properties);
  const payloadOnce = sanitize(propertiesToSetOnce);
  enqueueOrRun('setPersonProperties', (c) => {
    c.setPersonProperties(payload, payloadOnce);
  });
}

/**
 * Reads a boolean feature flag. Fails closed.
 *
 * Returns `false` whenever the answer is not known — analytics disabled, SDK not
 * bound, flag never fetched, flag absent, or a multivariate (string) value. A
 * kill switch that fails open is not a kill switch: an unreachable PostHog must
 * leave the gated feature off, not silently enable it for everyone.
 *
 * This is the only flag reader in the app. Do not evaluate flags from the SDK
 * directly — see docs/ANALYTICS.md §8.
 */
export async function isFeatureEnabled(key: string): Promise<boolean> {
  if (!ANALYTICS_ENABLED) return false;
  const bound = client;
  if (!bound) return false;

  try {
    const cached = bound.isFeatureEnabled(key);
    if (typeof cached === 'boolean') return cached;

    // preloadFeatureFlags warms the cache at init, but a cold start that raced
    // the network leaves it empty. Fetch once rather than reporting a false
    // negative that would look identical to the flag being switched off.
    await bound.reloadFeatureFlagsAsync();
    const refreshed = bound.isFeatureEnabled(key);
    return typeof refreshed === 'boolean' ? refreshed : false;
  } catch {
    return false;
  }
}

/** Best-effort drain. Returns void by design — no caller ever awaits analytics. */
export function flush(): void {
  if (!ANALYTICS_ENABLED) return;
  const bound = client;
  if (!bound) return;
  safeRun('flush', () => {
    swallow(bound.flush());
  });
}
