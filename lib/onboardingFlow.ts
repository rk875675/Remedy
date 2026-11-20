// Hooks and analytics wrappers the onboarding screens call.
// `goNext` reads the context snapshot so `setIntake` then `goNext()` in one
// handler navigates with the value that was just written.

import { useRouter } from 'expo-router';
import type { z } from 'zod';

import {
  OB_STEPS,
  chapterProgress,
  nextStep,
  type ObChapter,
  type ObFlowState,
  type ObStepKey,
} from '../constants/onboardingFlow';
import { useAuth } from '../context/AuthContext';
import { useOnboarding, useTrackOnboardingStep } from '../context/OnboardingContext';
import { currentOnboardingEntry, useOnboardingStepCompletion } from './analytics/onboardingSteps';
import { optionValue } from './analytics/events/enums';
import type { OnboardingDecisionKey, OnboardingDecisionValue } from './analytics/events/enums';
import { onboardingDecision, onboardingOptionSelected } from './analytics/events/onboarding';
import { useOnboardingPet } from './useOnboardingPet';

export type { ObChapter, ObFlowState, ObStepKey } from '../constants/onboardingFlow';

type OptionValue = z.infer<typeof optionValue>;

const SENSITIVE_STEPS = new Set<ObStepKey>(['leg', 'intensity', 'ns', 'conditions', 'age', 'safety']);

const CHAPTER_BY_KEY: Record<ObStepKey, ObChapter> = OB_STEPS.reduce(
  (chapters, step) => {
    chapters[step.key] = step.chapter;
    return chapters;
  },
  {} as Record<ObStepKey, ObChapter>,
);

export type TrackOptionOpts = {
  multi?: boolean;
  deselect?: boolean;
  count?: number;
  recommended?: boolean;
};

/** Next applicable route, or null after match. */
export function nextPath(key: ObStepKey, state: ObFlowState): string | null {
  return nextStep(key, state)?.path ?? null;
}

/**
 * Records the step for resume and analytics on mount.
 * `goNext` emits step completion, then pushes the next applicable step.
 * `finalizing` replaces onto match so the loader cannot be swiped back onto.
 */
export function useObStep(key: ObStepKey): {
  chapter: ObChapter;
  progress: number;
  goNext: (answerCount?: number) => void;
} {
  const router = useRouter();
  const { answers, intake, progress, getSnapshot } = useOnboarding();
  const hasPet = useHasPet();
  useTrackOnboardingStep(key);
  const completeStep = useOnboardingStepCompletion();
  const view: ObFlowState = { answers, intake, progress, hasPet };

  function goNext(answerCount?: number): void {
    const snap = getSnapshot();
    const state = {
      answers: snap.answers,
      intake: snap.intake,
      progress: snap.progress,
      hasPet,
    };
    completeStep(answerCount, nextStep(key, state)?.key);
    const path = nextPath(key, state);
    if (path === null) return;
    if (key === 'finalizing') router.replace(path);
    else router.push(path);
  }

  return {
    chapter: CHAPTER_BY_KEY[key],
    progress: chapterProgress(key, view),
    goNext,
  };
}

/** Maps a tracked option onto the decision tile. Null when the tap is not a decision. */
export function decisionKeyFor(stepKey: ObStepKey, value: string): OnboardingDecisionKey | null {
  if (stepKey === 'time') {
    if (value.startsWith('minutes_')) return 'session_length';
    if (value.startsWith('days_')) return 'days_per_week';
    return null;
  }
  if (stepKey === 'rapid') {
    if (value.startsWith('flare_')) return 'flare_settle';
    if (value.startsWith('trend_')) return 'pain_trend';
    if (value.startsWith('limit_')) return 'limitation';
    return null;
  }
  if (stepKey === 'finalizing') return 'acquisition_source';
  if (stepKey === 'welcome') return value === 'legal_assent' ? 'legal_assent' : null;
  switch (stepKey) {
    case 'goal':
    case 'hard_now':
    case 'location':
    case 'spread':
    case 'duration':
    case 'onset':
    case 'feel':
    case 'movement':
    case 'relief':
    case 'activity':
    case 'equipment':
      return stepKey;
    case 'reminders':
      return 'reminder';
    default:
      return null;
  }
}

/**
 * Closed choice for the decision tiles. Does not send names or clinical free text.
 * Sensitive steps never reach here.
 */
export function trackDecision(
  decisionKey: OnboardingDecisionKey,
  decisionValue: OnboardingDecisionValue,
  isDeselect = false,
): void {
  onboardingDecision({
    decision_key: decisionKey,
    decision_value: decisionValue,
    is_deselect: isDeselect,
    entry_point: currentOnboardingEntry(),
    flow: 'v2',
  });
}

/** Option analytics. No-ops on the sensitive steps (leg, intensity, ns, conditions, age, safety). */
export function trackOption(stepKey: ObStepKey, value: OptionValue, opts: TrackOptionOpts = {}): void {
  if (SENSITIVE_STEPS.has(stepKey)) return;
  onboardingOptionSelected({
    step_key: stepKey,
    option_value: value,
    is_multi_select: opts.multi ?? false,
    is_deselect: opts.deselect ?? false,
    ...(opts.count === undefined ? {} : { selection_count: opts.count }),
    ...(opts.recommended === undefined ? {} : { is_recommended: opts.recommended }),
  });
  const decisionKey = decisionKeyFor(stepKey, value);
  if (decisionKey !== null) trackDecision(decisionKey, value, opts.deselect ?? false);
}

/**
 * True when this person already has a pet and should skip meet + pet.
 * A name typed in this funnel (`progress.pet_name`) does not count.
 * Retake always counts as already having one.
 */
export function useHasPet(): boolean {
  const { user } = useAuth();
  const { progress, retaking } = useOnboarding();
  const { name: petName } = useOnboardingPet();
  return retaking || (!!user && !!petName && !progress?.pet_name);
}
