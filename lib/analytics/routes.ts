// Screen-name normalization.
//
// expo-router's useSegments() returns route *patterns*, not interpolated paths:
// visiting /session/8f3a-… yields ['session', '[id]']. That is exactly what we
// want as a screen name — one row per screen instead of one row per entity.
//
// Two hard rules enforced here:
//   1. Only names in KNOWN_SCREENS are ever emitted. Cardinality is bounded by
//      this list and cannot drift, no matter what the router hands us.
//   2. Route params and query strings never reach analytics. /auth-callback
//      carries a live auth token in its query string, which is why this is
//      absolute rather than a preference.

/** Emitted when the router reports a route not in the allow-list below. */
export const UNKNOWN_SCREEN = 'unknown';

/**
 * Every route in `app/`. Adding a screen means adding it here AND to
 * docs/ANALYTICS.md §3.2.1 in the same commit — otherwise it reports as
 * `unknown` and dev builds warn on every navigation to it.
 */
export const KNOWN_SCREENS = [
  // Onboarding funnel (order matches onboardingStepKey)
  '/(onboarding)',
  '/(onboarding)/meet',
  '/(onboarding)/pet',
  '/(onboarding)/open_goals',
  '/(onboarding)/goal',
  '/(onboarding)/hard_now',
  '/(onboarding)/outlook',
  '/(onboarding)/open_back',
  '/(onboarding)/location',
  '/(onboarding)/spread',
  '/(onboarding)/duration',
  '/(onboarding)/onset',
  '/(onboarding)/feel',
  '/(onboarding)/leg',
  '/(onboarding)/intensity',
  '/(onboarding)/open_pattern',
  '/(onboarding)/movement',
  '/(onboarding)/relief',
  '/(onboarding)/rapid',
  '/(onboarding)/ns',
  '/(onboarding)/ns_result',
  '/(onboarding)/open_you',
  '/(onboarding)/conditions',
  '/(onboarding)/age',
  '/(onboarding)/activity',
  '/(onboarding)/equipment',
  '/(onboarding)/time',
  '/(onboarding)/reminders',
  '/(onboarding)/safety',
  '/(onboarding)/finalizing',
  '/(onboarding)/match',

  // Auth
  '/(auth)/sign-in',
  '/(auth)/email',
  '/auth-callback',
  '/reset-password',

  // Legal
  '/(legal)/terms',
  '/(legal)/privacy',

  // Main app
  '/(tabs)',
  '/(tabs)/progress',
  '/(tabs)/profile',
  '/session/[id]',
  '/building-plan',
  '/weekly-ramp',
  '/orientation',
  '/program-complete',
  '/next-program',
  '/onboarding-answers',
  '/feedback',
] as const;

export type KnownScreen = (typeof KNOWN_SCREENS)[number];

const KNOWN = new Set<string>(KNOWN_SCREENS);

/**
 * Builds a route pattern from router segments. Index routes report as their
 * parent (expo-router omits the trailing `index`), which is why `/(tabs)` and
 * not `/(tabs)/index` is the canonical name for the home tab.
 */
export function buildRoutePattern(segments: readonly string[]): string {
  const meaningful = segments.filter((segment) => segment.length > 0 && segment !== 'index');
  return meaningful.length === 0 ? '/' : `/${meaningful.join('/')}`;
}

/**
 * Route pattern for the current segments, clamped to the allow-list.
 *
 * Returns `null` for the transient empty-segment state the router passes through
 * during a root transition — that is not a screen and emitting it would put a
 * meaningless step at the top of every path analysis.
 */
export function toScreenName(segments: readonly string[]): string | null {
  if (segments.length === 0) return null;

  const pattern = buildRoutePattern(segments);
  if (pattern === '/') return null;
  if (KNOWN.has(pattern)) return pattern;

  if (__DEV__) {
    console.log(
      `[analytics] unknown route "${pattern}" reported as "${UNKNOWN_SCREEN}". ` +
        'Add it to KNOWN_SCREENS in lib/analytics/routes.ts and to docs/ANALYTICS.md §3.2.1.',
    );
  }
  return UNKNOWN_SCREEN;
}
