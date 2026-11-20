// Onboarding funnel step tracking: dwell timing and exit classification.
//
// Driven centrally off the router rather than per-screen mount, because
// expo-router keeps earlier screens mounted in the stack — a mount/unmount hook
// would miss every back-navigation and every re-entry. Watching the active route
// catches forward, backward and re-entry uniformly, with no per-screen wiring.
//
// Visit semantics: exactly one `onboarding_step_viewed` and one
// `onboarding_step_exited` per visit. Backgrounding ends the visit (so a user who
// takes a phone call is recorded as `backgrounded`, not as an infinite dwell);
// returning to the same step begins a new visit.

import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';

import { useOnboarding } from '../../context/OnboardingContext';
import {
  onboardingStepCompleted,
  onboardingStepExited,
  onboardingStepViewed,
} from './events/onboarding';
import { onboardingStepKey, screenName } from './events/enums';
import type { OnboardingEntryPoint, OnboardingLeftTo, OnboardingStepKey } from './events/enums';

export const ONBOARDING_STEP_KEYS = onboardingStepKey.options;

/** Wall-clock start of this JS-session's funnel, set on "Get Started". */
let funnelStartedAt: number | null = null;

export function markOnboardingFunnelStart(): void {
  funnelStartedAt = Date.now();
}

/** Elapsed ms since Get Started, or undefined if the funnel was never started here. */
export function onboardingFunnelDurationMs(): number | undefined {
  if (funnelStartedAt === null) return undefined;
  return Math.max(0, Date.now() - funnelStartedAt);
}

/** Route pattern → step key. Mirrors the onboarding step registry (welcome is the group index). */
const STEP_BY_SCREEN: ReadonlyMap<string, OnboardingStepKey> = new Map(
  ONBOARDING_STEP_KEYS.map((key) => [
    key === 'welcome' ? '/(onboarding)' : `/(onboarding)/${key}`,
    key,
  ]),
);

export function stepForScreen(screenName: string | null): OnboardingStepKey | null {
  if (screenName === null) return null;
  return STEP_BY_SCREEN.get(screenName) ?? null;
}

function indexOfStep(key: OnboardingStepKey): number {
  return ONBOARDING_STEP_KEYS.indexOf(key);
}

type ActiveStep = {
  key: OnboardingStepKey;
  index: number;
  enteredAt: number;
  entry: OnboardingEntryPoint;
  isRetake: boolean;
};

let active: ActiveStep | null = null;

/**
 * Developer Profile → Force Paywall opens match without a quiz. Set before the
 * navigation so the visit is tagged `profile_preview` and kept out of onboarding.
 */
let profilePreview = false;

export function markProfilePreview(): void {
  profilePreview = true;
}

export function entryForStep(key: OnboardingStepKey, lapsed: boolean): OnboardingEntryPoint {
  if (key === 'match' && profilePreview) return 'profile_preview';
  if (key === 'match' && lapsed) return 'lapsed';
  return 'funnel';
}

export function currentOnboardingEntry(): OnboardingEntryPoint {
  return active?.entry ?? 'funnel';
}

/** Milliseconds spent on the current step, or null if no step is active. */
export function activeStepDwellMs(): number | null {
  return active === null ? null : Math.max(0, Date.now() - active.enteredAt);
}

export function activeStepKey(): OnboardingStepKey | null {
  return active?.key ?? null;
}

function enterStep(key: OnboardingStepKey, isRetake: boolean, lapsed: boolean): void {
  const entry = entryForStep(key, lapsed);
  active = { key, index: indexOfStep(key), enteredAt: Date.now(), entry, isRetake };
  onboardingStepViewed({
    step_key: key,
    step_index: active.index,
    is_retake: isRetake,
    entry_point: entry,
    flow: 'v2',
  });
}

function leaveStep(
  exitType: 'forward' | 'backward' | 'backgrounded' | 'abandoned',
  leftTo: OnboardingLeftTo,
): void {
  if (active === null) return;
  const visit = active;
  onboardingStepExited({
    step_key: visit.key,
    step_index: visit.index,
    time_on_step_ms: Math.max(0, Date.now() - visit.enteredAt),
    exit_type: exitType,
    left_to: leftTo,
    is_retake: visit.isRetake,
    entry_point: visit.entry,
    flow: 'v2',
  });
  if (visit.entry === 'profile_preview') profilePreview = false;
  active = null;
}

/**
 * Closes the current step visit as forward progress. Called by the Continue
 * handlers via `useOnboardingStepCompletion` so a completed step is never also
 * reported as a backward or abandoned exit by the route watcher.
 */
export function closeStepAsCompleted(leftTo: OnboardingStepKey): void {
  leaveStep('forward', leftTo);
}

/**
 * Returns the function a question screen's Continue handler calls once the answer
 * is valid and it is about to navigate. Emits `onboarding_step_completed` with the
 * dwell time, then closes the visit as forward progress.
 *
 * Call it only when actually proceeding — calling it and then staying on the screen
 * ends the visit without starting a new one.
 */
export function useOnboardingStepCompletion(): (answerCount?: number, leftTo?: OnboardingStepKey) => void {
  const { retaking } = useOnboarding();

  return useCallback(
    (answerCount?: number, leftTo?: OnboardingStepKey) => {
      const current = active;
      if (current === null) return;

      onboardingStepCompleted({
        step_key: current.key,
        step_index: current.index,
        time_on_step_ms: Math.max(0, Date.now() - current.enteredAt),
        is_retake: retaking,
        entry_point: current.entry,
        flow: 'v2',
        ...(answerCount === undefined ? {} : { answer_count: answerCount }),
      });
      closeStepAsCompleted(leftTo ?? current.key);
    },
    [retaking],
  );
}

function screenLeftTo(name: string | null): OnboardingLeftTo {
  const parsed = screenName.safeParse(name);
  return parsed.success ? parsed.data : 'left_app';
}

/**
 * Watches the active route and maintains step visits. Mounted once, inside
 * `AnalyticsBridge`.
 */
export function useOnboardingStepTracking(
  screen: string | null,
  isRetake: boolean,
  lapsed: boolean,
): void {
  const stepKey = stepForScreen(screen);

  // Read through a ref so the route effect depends on the route alone.
  const isRetakeRef = useRef(isRetake);
  isRetakeRef.current = isRetake;
  const lapsedRef = useRef(lapsed);
  lapsedRef.current = lapsed;

  useEffect(() => {
    // Router hasn't settled on a route yet — not a transition out of the funnel.
    if (screen === null) return;

    const current = active;

    if (stepKey === null) {
      // Left the onboarding group without completing the step.
      if (current !== null) leaveStep('abandoned', screenLeftTo(screen));
      return;
    }

    if (current !== null && current.key === stepKey) return;

    if (current !== null) {
      leaveStep(indexOfStep(stepKey) > current.index ? 'forward' : 'backward', stepKey);
    }
    enterStep(stepKey, isRetakeRef.current, lapsedRef.current);
  }, [screen, stepKey]);

  useEffect(() => {
    function onAppStateChange(status: AppStateStatus): void {
      // `inactive` is the app switcher and notification shade. Only a real
      // background ends the visit, so a glance is not recorded as a leave.
      if (status === 'background') {
        leaveStep('backgrounded', 'app_background');
        return;
      }
      // Returned to the foreground still on a funnel step: start a fresh visit so
      // dwell time excludes however long the app was away.
      if (status === 'active' && active === null && stepKey !== null) {
        enterStep(stepKey, isRetakeRef.current, lapsedRef.current);
      }
    }

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [stepKey]);
}
