import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { clearPendingPurchase } from '../lib/pendingPurchase';
import { onboardingAnswersInputSchema } from '../lib/schemas';
import { parseRecognizeSelected, type RecognizeKey } from '../constants/mindset';
import type { OnboardingAnswers } from '../types/database';

type AnswerFields = Omit<OnboardingAnswers, 'id' | 'user_id' | 'completed_at' | 'created_at'>;

// Answers are persisted to AsyncStorage as they are entered so they survive a
// force-quit between the paywall purchase and post-signup persistence on
// building-plan (the pending IAP transaction is persisted the same way in
// lib/pendingPurchase.ts). Cleared on a fresh funnel start and after the
// post-auth upsert succeeds.
const STORAGE_KEY = 'remedy.onboardingAnswers';
// Separate blob for funnel-resume state. Kept OUT of STORAGE_KEY so no extra keys
// ever leak into the strict Zod answers object that building-plan upserts to Supabase.
const PROGRESS_KEY = 'remedy.onboardingProgress';

// Furthest-reached ordering of the first-run funnel. The root guard uses this to
// resume an unauthenticated user at their last screen and rebuild the back stack.
export const ONBOARDING_FLOW = [
  'welcome',
  'founder',
  'education',
  'q0',
  'safety',
  'q9',
  'recognize',
  'seen',
  'q6',
  'q1',
  'q2',
  'q3',
  'q4',
  'q5',
  'q7',
  'q8',
] as const;

export type OnboardingStep = (typeof ONBOARDING_FLOW)[number];

// Route path for each step (welcome is the onboarding group index route).
export const ONBOARDING_STEP_PATHS: Record<OnboardingStep, string> = {
  welcome: '/(onboarding)',
  founder: '/(onboarding)/founder',
  education: '/(onboarding)/education',
  safety: '/(onboarding)/safety',
  q0: '/(onboarding)/q0',
  q9: '/(onboarding)/q9',
  recognize: '/(onboarding)/recognize',
  seen: '/(onboarding)/seen',
  q6: '/(onboarding)/q6',
  q1: '/(onboarding)/q1',
  q2: '/(onboarding)/q2',
  q3: '/(onboarding)/q3',
  q4: '/(onboarding)/q4',
  q5: '/(onboarding)/q5',
  q7: '/(onboarding)/q7',
  q8: '/(onboarding)/q8',
};

// UI/analytics-only selections that are NOT part of the strict answers schema,
// persisted alongside progress so they restore on resume/back-navigation.
type LocalSelections = {
  hear_about: string | null;
  tried_before: string | null;
  minutes: number | null;
  // Set when the safety/consent gate was accepted (ISO timestamp). The gate is a
  // hard requirement: resume clamps back to it until acceptance exists.
  safety_accepted_at: string | null;
  // Safety gate selections, persisted as they are made so back-navigation and
  // funnel resume restore them (the acceptance timestamp above only exists after
  // Continue is tapped).
  has_red_flag: boolean | null;
  agreed_legal: boolean;
  // Recognition multi-select (analytics / copy only). Completed even when empty
  // so resume can leave the screen.
  recognize_selected: RecognizeKey[];
  recognize_completed: boolean;
};

export type OnboardingProgress = { step: OnboardingStep } & LocalSelections;

// What each step needs before the funnel can resume PAST it. Info screens have no
// requirement (reaching them is enough); question screens need their answer. Undefined
// entries mean "no data required".
const STEP_REQUIREMENT: Partial<
  Record<OnboardingStep, (progress: OnboardingProgress, answers: Partial<AnswerFields>) => boolean>
> = {
  safety: (p) => p.safety_accepted_at !== null,
  q0: (p) => p.hear_about !== null,
  q9: (p) => p.tried_before !== null,
  recognize: (p) => p.recognize_completed,
  q6: (_p, a) => Array.isArray(a.main_goal) && a.main_goal.length > 0,
  q1: (_p, a) => !!a.pain_location,
  q2: (_p, a) => !!a.pain_duration,
  q3: (_p, a) => Array.isArray(a.pain_type) && a.pain_type.length > 0,
  q4: (_p, a) => !!a.activity_level,
  q5: (_p, a) => Array.isArray(a.pain_trigger) && a.pain_trigger.length > 0,
  q7: (_p, a) => !!a.equipment,
  q8: (_p, a) => typeof a.sessions_per_week_preference === 'number',
};

// Where an interrupted funnel should actually resume. The furthest-reached step alone
// is not safe: progress can outlive answers (e.g. answers cleared on completion, then
// the user wanders back into onboarding recreating a progress record) and resuming deep
// into the quiz with empty earlier answers strands the user on match's "complete all
// questions" error. Clamp to the first step whose data is missing.
export function getResumeStep(
  progress: OnboardingProgress | null,
  answers: Partial<AnswerFields>,
): OnboardingStep {
  if (!progress) return 'welcome';
  const furthestIndex = ONBOARDING_FLOW.indexOf(progress.step);
  for (let i = 0; i <= furthestIndex; i++) {
    const step = ONBOARDING_FLOW[i];
    const requirement = STEP_REQUIREMENT[step];
    if (requirement && !requirement(progress, answers)) return step;
  }
  return progress.step;
}

/** True only when THIS funnel finished the quiz (safety + every required answer + q8). */
export function shouldOpenMatch(
  progress: OnboardingProgress | null,
  answers: Partial<AnswerFields>,
): boolean {
  if (!onboardingAnswersInputSchema.safeParse(answers).success) return false;
  // Stale complete answers without a live safety acceptance are leftover from a
  // previous run — do not jump to "Your Program".
  if (!progress || progress.safety_accepted_at === null) return false;
  if (getResumeStep(progress, answers) !== 'q8') return false;
  const requirement = STEP_REQUIREMENT.q8;
  return !requirement || requirement(progress, answers);
}

/**
 * A real in-progress first-run (past welcome, or a safety/q0 selection exists).
 * A welcome-only flash while a leftover session restores is NOT this — those
 * users belong on Home.
 */
export function hasMeaningfulIncompleteFunnel(
  progress: OnboardingProgress | null,
  answers: Partial<AnswerFields>,
): boolean {
  if (shouldOpenMatch(progress, answers)) return false;
  if (!progress) return false;
  if (ONBOARDING_FLOW.indexOf(progress.step) > 0) return true;
  return (
    progress.hear_about !== null ||
    progress.tried_before !== null ||
    progress.safety_accepted_at !== null ||
    progress.agreed_legal ||
    progress.has_red_flag !== null ||
    progress.minutes !== null ||
    progress.recognize_completed ||
    progress.recognize_selected.length > 0
  );
}

type StackRouter = {
  replace: (href: string) => void;
  push: (href: string) => void;
};

/** Rebuild welcome → … → target so swipe-back still works after a resume. */
export function rebuildOnboardingStack(
  router: StackRouter,
  target: OnboardingStep | 'match',
  _answers: Partial<AnswerFields> = {},
): void {
  router.replace(ONBOARDING_STEP_PATHS[ONBOARDING_FLOW[0]]);
  if (target === 'match') {
    for (let i = 1; i < ONBOARDING_FLOW.length; i++) {
      router.push(ONBOARDING_STEP_PATHS[ONBOARDING_FLOW[i]]);
    }
    router.push('/(onboarding)/match');
    return;
  }
  const targetIndex = ONBOARDING_FLOW.indexOf(target);
  for (let i = 1; i <= targetIndex; i++) {
    router.push(ONBOARDING_STEP_PATHS[ONBOARDING_FLOW[i]]);
  }
}

const DEFAULT_PROGRESS: OnboardingProgress = {
  step: 'welcome',
  hear_about: null,
  tried_before: null,
  minutes: null,
  safety_accepted_at: null,
  has_red_flag: null,
  agreed_legal: false,
  recognize_selected: [],
  recognize_completed: false,
};

export async function clearStoredAnswers(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort: a stale entry is cleared on the next funnel start.
  }
}

export async function clearStoredProgress(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Best-effort: a stale entry is cleared on the next funnel start.
  }
}

type OnboardingContextType = {
  answers: Partial<AnswerFields>;
  setAnswer: <K extends keyof AnswerFields>(field: K, value: AnswerFields[K]) => void;
  /** Removes a field from the answers object so bars and the continue guard treat it as unanswered. */
  clearAnswer: <K extends keyof AnswerFields>(field: K) => void;
  resetAnswers: () => void;
  // Furthest-reached step + restorable local-only selections for funnel resume.
  progress: OnboardingProgress | null;
  setProgressStep: (step: OnboardingStep) => void;
  setLocalAnswer: <K extends keyof LocalSelections>(key: K, value: LocalSelections[K]) => void;
  // True once the AsyncStorage hydration attempt has finished (whether or not
  // anything was stored). The root guard waits for this before routing an
  // unauthenticated user, so persisted post-purchase answers are not missed.
  hydrated: boolean;
  // Retake mode: an already-onboarded, premium user is re-answering to regenerate
  // their plan. While true, the root guard lets the user stay in the onboarding flow.
  retaking: boolean;
  startRetake: () => void;
  endRetake: () => void;
};

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Partial<AnswerFields>>({});
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [retaking, setRetaking] = useState(false);
  // Guards against hydration clobbering answers entered (or reset) before the
  // async read resolves.
  const touched = useRef(false);
  // Same guard for the separate progress blob.
  const progressTouched = useRef(false);
  const prevUserId = useRef<string | null>(null);

  // When a signed-in user signs out (or the account switches), the quiz answers in
  // context/AsyncStorage belong to the PREVIOUS user. Without this, the root guard
  // treats them as pending answers and building-plan upserts them — plus any stashed
  // paywall transaction — onto the NEXT account signed in on this device. Anonymous →
  // signed-in transitions (prev null) must NOT clear: that's the normal post-paywall
  // signup handoff whose answers building-plan persists.
  useEffect(() => {
    const currentId = user?.id ?? null;
    const prevId = prevUserId.current;
    prevUserId.current = currentId;
    if (prevId !== null && prevId !== currentId) {
      touched.current = true;
      progressTouched.current = true;
      setAnswers({});
      setProgress(null);
      setRetaking(false);
      void clearStoredAnswers();
      void clearStoredProgress();
      void clearPendingPurchase();
    }
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(PROGRESS_KEY)])
      .then(([answersRaw, progressRaw]) => {
        if (cancelled) return;
        if (answersRaw && !touched.current) {
          try {
            const parsed: unknown = JSON.parse(answersRaw);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              setAnswers(parsed as Partial<AnswerFields>);
            }
          } catch {
            // Corrupt answers blob — treat as no stored answers.
          }
        }
        if (progressRaw && !progressTouched.current) {
          try {
            const parsed: unknown = JSON.parse(progressRaw);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              const p = parsed as Record<string, unknown>;
              const rawStep = typeof p.step === 'string' ? p.step : null;
              const step: OnboardingStep | null =
                rawStep === 'alarm' || rawStep === 'why'
                  ? 'seen'
                  : rawStep && (ONBOARDING_FLOW as readonly string[]).includes(rawStep)
                    ? (rawStep as OnboardingStep)
                    : null;
              if (step) {
                setProgress({
                  step,
                  hear_about: typeof p.hear_about === 'string' ? p.hear_about : null,
                  tried_before: typeof p.tried_before === 'string' ? p.tried_before : null,
                  minutes: typeof p.minutes === 'number' ? p.minutes : null,
                  safety_accepted_at:
                    typeof p.safety_accepted_at === 'string' ? p.safety_accepted_at : null,
                  has_red_flag: typeof p.has_red_flag === 'boolean' ? p.has_red_flag : null,
                  agreed_legal: p.agreed_legal === true,
                  recognize_selected: parseRecognizeSelected(p.recognize_selected),
                  recognize_completed: p.recognize_completed === true,
                });
              }
            }
          } catch {
            // Corrupt progress blob — treat as no saved progress.
          }
        }
      })
      .catch(() => {
        // Unreadable storage — treat as a fresh funnel.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setAnswer<K extends keyof AnswerFields>(field: K, value: AnswerFields[K]) {
    touched.current = true;
    setAnswers((prev) => {
      const next = { ...prev, [field]: value };
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  function clearAnswer<K extends keyof AnswerFields>(field: K) {
    touched.current = true;
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[field];
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  function setProgressStep(step: OnboardingStep) {
    progressTouched.current = true;
    setProgress((prev) => {
      const base = prev ?? DEFAULT_PROGRESS;
      // Only advance — never rewind the furthest-reached step on back-navigation.
      const furthest =
        ONBOARDING_FLOW.indexOf(step) > ONBOARDING_FLOW.indexOf(base.step) ? step : base.step;
      const next: OnboardingProgress = { ...base, step: furthest };
      AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  function setLocalAnswer<K extends keyof LocalSelections>(key: K, value: LocalSelections[K]) {
    progressTouched.current = true;
    setProgress((prev) => {
      const base = prev ?? DEFAULT_PROGRESS;
      const next: OnboardingProgress = { ...base, [key]: value };
      AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }

  function resetAnswers() {
    touched.current = true;
    progressTouched.current = true;
    setAnswers({});
    setProgress(null);
    clearStoredAnswers();
    clearStoredProgress();
  }

  function startRetake() {
    touched.current = true;
    progressTouched.current = true;
    setAnswers({});
    setProgress(null);
    clearStoredAnswers();
    clearStoredProgress();
    setRetaking(true);
  }

  function endRetake() {
    setRetaking(false);
  }

  return (
    <OnboardingContext.Provider
      value={{
        answers,
        setAnswer,
        clearAnswer,
        resetAnswers,
        progress,
        setProgressStep,
        setLocalAnswer,
        hydrated,
        retaking,
        startRetake,
        endRetake,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return ctx;
}

// Records a funnel screen as reached on mount. `step` is constant per screen, so this
// fires once; setProgressStep only advances the furthest-reached marker.
export function useTrackOnboardingStep(step: OnboardingStep) {
  const { setProgressStep } = useOnboarding();
  useEffect(() => {
    setProgressStep(step);
  }, [step]);
}
