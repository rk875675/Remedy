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
import { onboardingStepKey } from './events/enums';
import type { OnboardingStepKey } from './events/enums';

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

/** Route pattern → step key. Mirrors ONBOARDING_STEP_PATHS plus the two post-quiz screens. */
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

type ActiveStep = { key: OnboardingStepKey; index: number; enteredAt: number };

let active: ActiveStep | null = null;

/** Milliseconds spent on the current step, or null if no step is active. */
export function activeStepDwellMs(): number | null {
  return active === null ? null : Math.max(0, Date.now() - active.enteredAt);
}

export function activeStepKey(): OnboardingStepKey | null {
  return active?.key ?? null;
}

function enterStep(key: OnboardingStepKey, isRetake: boolean): void {
  active = { key, index: indexOfStep(key), enteredAt: Date.now() };
  onboardingStepViewed({ step_key: key, step_index: active.index, is_retake: isRetake });
}

function leaveStep(exitType: 'forward' | 'backward' | 'backgrounded' | 'abandoned'): void {
  if (active === null) return;
  onboardingStepExited({
    step_key: active.key,
    step_index: active.index,
    time_on_step_ms: Math.max(0, Date.now() - active.enteredAt),
    exit_type: exitType,
  });
  active = null;
}

/**
 * Closes the current step visit as forward progress. Called by the Continue
 * handlers via `useOnboardingStepCompletion` so a completed step is never also
 * reported as a backward or abandoned exit by the route watcher.
 */
export function closeStepAsCompleted(): void {
  leaveStep('forward');
}

/**
 * Returns the function a question screen's Continue handler calls once the answer
 * is valid and it is about to navigate. Emits `onboarding_step_completed` with the
 * dwell time, then closes the visit as forward progress.
 *
 * Call it only when actually proceeding — calling it and then staying on the screen
 * ends the visit without starting a new one.
 */
export function useOnboardingStepCompletion(): (answerCount?: number) => void {
  const { retaking } = useOnboarding();

  return useCallback(
    (answerCount?: number) => {
      const current = active;
      if (current === null) return;

      onboardingStepCompleted({
        step_key: current.key,
        step_index: current.index,
        time_on_step_ms: Math.max(0, Date.now() - current.enteredAt),
        is_retake: retaking,
        ...(answerCount === undefined ? {} : { answer_count: answerCount }),
      });
      closeStepAsCompleted();
    },
    [retaking],
  );
}

/**
 * Watches the active route and maintains step visits. Mounted once, inside
 * `AnalyticsBridge`.
 */
export function useOnboardingStepTracking(screenName: string | null, isRetake: boolean): void {
  const stepKey = stepForScreen(screenName);

  // Read through a ref so the route effect depends on the route alone.
  const isRetakeRef = useRef(isRetake);
  isRetakeRef.current = isRetake;

  useEffect(() => {
    // Router hasn't settled on a route yet — not a transition out of the funnel.
    if (screenName === null) return;

    const current = active;

    if (stepKey === null) {
      // Left the onboarding group without completing the step.
      if (current !== null) leaveStep('abandoned');
      return;
    }

    if (current !== null && current.key === stepKey) return;

    if (current !== null) {
      leaveStep(indexOfStep(stepKey) > current.index ? 'forward' : 'backward');
    }
    enterStep(stepKey, isRetakeRef.current);
  }, [screenName, stepKey]);

  useEffect(() => {
    function onAppStateChange(status: AppStateStatus): void {
      if (status === 'background' || status === 'inactive') {
        leaveStep('backgrounded');
        return;
      }
      // Returned to the foreground still on a funnel step: start a fresh visit so
      // dwell time excludes however long the app was away.
      if (status === 'active' && active === null && stepKey !== null) {
        enterStep(stepKey, isRetakeRef.current);
      }
    }

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, [stepKey]);
}
