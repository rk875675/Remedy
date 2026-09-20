// Product-usage tracking: screen dwell and app-session duration.
//
// Driven off the router + AppState, not per-screen mount — expo-router keeps
// earlier screens mounted, so a mount hook would miss back-navigation and
// re-entry. Same reason onboarding step tracking is centralised.
//
// Visit semantics:
//   - $screen fires at the start of every visit (navigate or return from background).
//   - screen_exited fires at the end when dwell is ≥400ms, with time_on_screen_ms.
//     Sub-400ms tab flickers are omitted (noise, not product use).
//   - Backgrounding ends the visit and the app session. iOS `inactive` (app switcher
//     glance) does not — matching session_abandoned. Returning starts a new visit
//     and a new app session, so dwell excludes time away.
//   - previous_screen is null on the first screen of each foreground session.

import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { appSessionEnded, screenExited } from './events/engagement';
import { screenName } from './events/enums';
import type { ScreenName } from './events/enums';
import { flush, screen } from './facade';

export type UsageContext = {
  is_authenticated: boolean;
  is_onboarded: boolean;
  is_premium: boolean;
  has_active_plan: boolean;
  is_retaking: boolean;
};

type ActiveScreen = { name: ScreenName; enteredAt: number };

let activeScreen: ActiveScreen | null = null;
let lastScreenName: ScreenName | null = null;
let appSessionStartedAt: number | null = null;
let screensThisSession = 0;

function parseScreenName(name: string): ScreenName | null {
  const parsed = screenName.safeParse(name);
  return parsed.success ? parsed.data : null;
}

/** Tab flickers under this are not product use — skip the exit event. */
const SCREEN_EXIT_MIN_DWELL_MS = 400;

function leaveScreen(exitType: 'navigate' | 'backgrounded', context: UsageContext): void {
  if (activeScreen === null) return;
  const dwellMs = Math.max(0, Date.now() - activeScreen.enteredAt);
  if (dwellMs >= SCREEN_EXIT_MIN_DWELL_MS) {
    screenExited({
      screen_name: activeScreen.name,
      time_on_screen_ms: dwellMs,
      exit_type: exitType,
      is_authenticated: context.is_authenticated,
      is_onboarded: context.is_onboarded,
      is_premium: context.is_premium,
      has_active_plan: context.has_active_plan,
      is_retaking: context.is_retaking,
    });
  }
  activeScreen = null;
}

function enterScreen(name: ScreenName, context: UsageContext, previous: ScreenName | null): void {
  screen(name, {
    previous_screen: previous,
    is_authenticated: context.is_authenticated,
    is_onboarded: context.is_onboarded,
    is_premium: context.is_premium,
    has_active_plan: context.has_active_plan,
    is_retaking: context.is_retaking,
  });
  activeScreen = { name, enteredAt: Date.now() };
  lastScreenName = name;
  screensThisSession += 1;
}

function ensureAppSession(): void {
  if (appSessionStartedAt !== null) return;
  appSessionStartedAt = Date.now();
  screensThisSession = 0;
}

function endAppSession(context: UsageContext): void {
  if (appSessionStartedAt === null) return;
  appSessionEnded({
    duration_ms: Math.max(0, Date.now() - appSessionStartedAt),
    screen_count: screensThisSession,
    ended_reason: 'backgrounded',
    is_authenticated: context.is_authenticated,
    is_premium: context.is_premium,
  });
  appSessionStartedAt = null;
  screensThisSession = 0;
  lastScreenName = null;
  flush();
}

/**
 * Emits $screen on every visit, screen_exited with dwell, and app_session_ended
 * on background. Mounted once, inside AnalyticsBridge.
 */
export function useProductUsageTracking(
  routeName: string | null,
  context: UsageContext,
): void {
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (routeName === null) return;
    const name = parseScreenName(routeName);
    if (name === null) return;
    if (activeScreen !== null && activeScreen.name === name) return;

    const ctx = contextRef.current;
    ensureAppSession();
    if (activeScreen !== null) leaveScreen('navigate', ctx);
    enterScreen(name, ctx, lastScreenName);
  }, [routeName]);

  useEffect(() => {
    function onAppStateChange(status: AppStateStatus): void {
      const ctx = contextRef.current;
      if (status === 'background') {
        leaveScreen('backgrounded', ctx);
        endAppSession(ctx);
        return;
      }
      if (status === 'active') {
        ensureAppSession();
        const current = routeName === null ? null : parseScreenName(routeName);
        if (current !== null && activeScreen === null) {
          enterScreen(current, ctx, null);
        }
      }
    }

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [routeName]);
}
