// Analytics configuration. Read once, at module load.
//
// Both the key and the host are required. A half-configured client that quietly
// falls back to a default host is worse than no analytics at all: events go
// somewhere nobody is looking and the gap is invisible until someone asks why a
// funnel is empty. If either value is missing, analytics is off and every call
// in the facade becomes a no-op.

const KEY = (process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '').trim();
const HOST = (process.env.EXPO_PUBLIC_POSTHOG_HOST ?? '').trim();

export const POSTHOG_KEY = KEY;
export const POSTHOG_HOST = HOST;

export const ANALYTICS_ENABLED = KEY.length > 0 && HOST.length > 0;

/** Console logging + immediate flush. Development builds only. */
export const ANALYTICS_DEBUG = __DEV__;

// Calls made before the SDK finishes loading are buffered. The cap exists so a
// failed init can never turn the buffer into a memory leak — past the cap the
// oldest call is dropped, because the first screen of a session matters less
// than the hundred after it.
export const MAX_QUEUED_CALLS = 100;

// Dev flushes on every event so it shows up in PostHog in seconds rather than on
// a batch timer. Production batches: users are on cellular, often mid-session
// with video streaming, and a request per event would be wasteful.
export const FLUSH_AT = __DEV__ ? 1 : 20;
export const FLUSH_INTERVAL_MS = __DEV__ ? 5_000 : 30_000;

/** Cap on events persisted locally while offline, before the oldest are dropped. */
export const MAX_QUEUE_SIZE = 1_000;
