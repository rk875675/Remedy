// Public analytics surface. Import from here, never from 'posthog-react-native'.
//
// Product code fires events through the typed wrappers in `lib/analytics/events/`.
// `capture` is exported only because defineEvent needs it; there is no untyped
// escape hatch, by design — see docs/ANALYTICS.md §8 for how to add an event.

export {
  ANALYTICS_ENABLED,
  capture,
  flush,
  identify,
  initAnalytics,
  isFeatureEnabled,
  reset,
  screen,
  setClient,
  setPersonProperties,
} from './facade';
export type { AnalyticsProperties, AnalyticsPropertyValue } from './facade';

export { AnalyticsBridge, AnalyticsProvider } from './AnalyticsProvider';
export { KNOWN_SCREENS, UNKNOWN_SCREEN, buildRoutePattern, toScreenName } from './routes';
export type { KnownScreen } from './routes';
