import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import { clearPendingPurchase } from '../lib/pendingPurchase';
import { parseRecognizeSelected, type RecognizeKey } from '../constants/mindset';
import { appBelief, type AppBelief } from '../lib/analytics/events/enums';
import { NS_LEVEL, NS_PREDICTABLE, type Intake } from '../lib/intake';
import type { OnboardingAnswers } from '../types/database';
import {
  OB_STEPS,
  getResumeStep,
  hasMeaningfulIncompleteFunnel,
  rebuildOnboardingStack,
  shouldOpenMatch,
  type ObStepKey,
  type ReminderTime,
} from '../constants/onboardingFlow';

type AnswerFields = Omit<OnboardingAnswers, 'id' | 'user_id' | 'completed_at' | 'created_at'>;

// Answers are persisted to AsyncStorage as they are entered so they survive a
// force-quit between the paywall purchase and post-signup persistence on
// building-plan (the pending IAP transaction is persisted the same way in
// lib/pendingPurchase.ts). Cleared on a fresh funnel start and after the
// post-auth upsert succeeds.
const STORAGE_KEY = 'remedy.onboardingAnswers';
const INTAKE_KEY = 'remedy.onboardingIntake';
// Separate blob for funnel-resume state. Kept OUT of STORAGE_KEY so no extra keys
// ever leak into the strict Zod answers object that building-plan upserts to Supabase.
const PROGRESS_KEY = 'remedy.onboardingProgress';

export type OnboardingStep = ObStepKey;

// Furthest-reached ordering. Backed by the step registry in constants/onboardingFlow.
export const ONBOARDING_FLOW: readonly OnboardingStep[] = OB_STEPS.map((step) => step.key);

export const ONBOARDING_STEP_PATHS: Record<OnboardingStep, string> = OB_STEPS.reduce(
  (paths, step) => {
    paths[step.key] = step.path;
    return paths;
  },
  {} as Record<OnboardingStep, string>,
);

const STEP_INDEX: Record<OnboardingStep, number> = ONBOARDING_FLOW.reduce(
  (index, step, position) => {
    index[step] = position;
    return index;
  },
  {} as Record<OnboardingStep, number>,
);

// UI/analytics-only selections that are NOT part of the strict answers schema,
// persisted alongside progress so they restore on resume/back-navigation.
type LocalSelections = {
  hear_about: string | null;
  // Legacy answer. No longer set; kept so older blobs still parse.
  tried_before: string | null;
  // Legacy belief question. No longer asked; kept so older blobs still parse.
  app_belief: AppBelief | null;
  // Set once "Hold to commit" completes, so swiping back shows the committed state.
  committed_at: string | null;
  minutes: number | null;
  // Set when the safety step is accepted (ISO timestamp).
  safety_accepted_at: string | null;
  has_red_flag: boolean | null;
  agreed_legal: boolean;
  // Legacy recognition multi-select. No longer set; kept so older blobs still parse.
  recognize_selected: RecognizeKey[];
  recognize_completed: boolean;
  // Pet name typed on the pet screen. Sent with setPetName on building-plan, never
  // with the onboarding_answers upsert.
  pet_name: string | null;
  first_name: string | null;
  // Undefined until the reminders step is passed. null means the user skipped it.
  reminder_time: ReminderTime | null | undefined;
  // Second page of "What's hard right now?". Restores that page on back.
  hard_now_more: boolean;
  // Second page of the conditions question. Restores that page on back.
  conditions_more: boolean;
  // Nervous-system deck answers before all five are in. The strict intake field
  // is only written once the deck is complete.
  ns_draft: Partial<Intake['ns']> | null;
};

export type OnboardingProgress = { step: OnboardingStep } & LocalSelections;

export type OnboardingSnapshot = {
  answers: Partial<AnswerFields>;
  intake: Partial<Intake>;
  progress: OnboardingProgress | null;
};

export {
  getResumeStep,
  hasMeaningfulIncompleteFunnel,
  rebuildOnboardingStack,
  shouldOpenMatch,
};
export type { ObFlowState, ReminderTime } from '../constants/onboardingFlow';

const DEFAULT_PROGRESS: OnboardingProgress = {
  step: 'welcome',
  hear_about: null,
  tried_before: null,
  app_belief: null,
  committed_at: null,
  minutes: null,
  safety_accepted_at: null,
  has_red_flag: null,
  agreed_legal: false,
  recognize_selected: [],
  recognize_completed: false,
  pet_name: null,
  first_name: null,
  reminder_time: undefined,
  hard_now_more: false,
  conditions_more: false,
  ns_draft: null,
};

const KNOWN_STEPS = new Set<string>(ONBOARDING_FLOW);

const NS_PREDICTABLE_VALUES = new Set<string>(NS_PREDICTABLE);
const NS_LEVEL_VALUES = new Set<string>(NS_LEVEL);

function readNsDraft(value: unknown): Partial<Intake['ns']> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const draft: Partial<Intake['ns']> = {};
  if (typeof raw.predictable === 'string' && NS_PREDICTABLE_VALUES.has(raw.predictable)) {
    draft.predictable = raw.predictable as Intake['ns']['predictable'];
  }
  for (const key of ['small_triggers', 'stress', 'anticipation', 'avoidance'] as const) {
    const item = raw[key];
    if (typeof item === 'string' && NS_LEVEL_VALUES.has(item)) {
      draft[key] = item as Intake['ns']['stress'];
    }
  }
  return draft.predictable !== undefined ||
    draft.small_triggers !== undefined ||
    draft.stress !== undefined ||
    draft.anticipation !== undefined ||
    draft.avoidance !== undefined
    ? draft
    : null;
}

function isReminderTime(value: unknown): value is ReminderTime {
  return value === 'morning' || value === 'midday' || value === 'evening';
}

function readReminderTime(raw: Record<string, unknown>): ReminderTime | null | undefined {
  if (!Object.prototype.hasOwnProperty.call(raw, 'reminder_time')) return undefined;
  if (raw.reminder_time === null) return null;
  return isReminderTime(raw.reminder_time) ? raw.reminder_time : undefined;
}

export async function clearStoredAnswers(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Best-effort: a stale entry is cleared on the next funnel start.
  }
}

export async function clearStoredIntake(): Promise<void> {
  try {
    await AsyncStorage.removeItem(INTAKE_KEY);
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
  intake: Partial<Intake>;
  setIntake: <K extends keyof Intake>(field: K, value: Intake[K]) => void;
  clearIntake: <K extends keyof Intake>(field: K) => void;
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
  /** Freshest answers, intake, and progress, including writes from this tick. */
  getSnapshot: () => OnboardingSnapshot;
};

const OnboardingContext = createContext<OnboardingContextType | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<Partial<AnswerFields>>({});
  const [intake, setIntakeState] = useState<Partial<Intake>>({});
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [retaking, setRetaking] = useState(false);
  // Guards against hydration clobbering answers entered (or reset) before the
  // async read resolves.
  const touched = useRef(false);
  const intakeTouched = useRef(false);
  const progressTouched = useRef(false);
  // Welcome mounts and records its step before AsyncStorage resolves. Writing
  // that through immediately used to replace the saved funnel with a blank
  // welcome step, so a relaunch started over. Queue those writes until the
  // read finishes, then advance from the stored step.
  const hydratedRef = useRef(false);
  const pendingStepRef = useRef<OnboardingStep | null>(null);
  const pendingLocalRef = useRef<Partial<LocalSelections>>({});
  const prevUserId = useRef<string | null>(null);
  const answersRef = useRef(answers);
  const intakeRef = useRef(intake);
  const progressRef = useRef(progress);
  answersRef.current = answers;
  intakeRef.current = intake;
  progressRef.current = progress;

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
      intakeTouched.current = true;
      progressTouched.current = true;
      answersRef.current = {};
      intakeRef.current = {};
      progressRef.current = null;
      setAnswers({});
      setIntakeState({});
      setProgress(null);
      setRetaking(false);
      void clearStoredAnswers();
      void clearStoredIntake();
      void clearStoredProgress();
      void clearPendingPurchase();
    }
  }, [user?.id]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      AsyncStorage.getItem(STORAGE_KEY),
      AsyncStorage.getItem(INTAKE_KEY),
      AsyncStorage.getItem(PROGRESS_KEY),
    ])
      .then(([answersRaw, intakeRaw, progressRaw]) => {
        if (cancelled) return;
        if (answersRaw && !touched.current) {
          try {
            const parsed: unknown = JSON.parse(answersRaw);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              const next = parsed as Partial<AnswerFields>;
              answersRef.current = next;
              setAnswers(next);
            }
          } catch {
            // Corrupt answers blob — treat as no stored answers.
          }
        }
        if (intakeRaw && !intakeTouched.current) {
          try {
            const parsed: unknown = JSON.parse(intakeRaw);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              const next = parsed as Partial<Intake>;
              intakeRef.current = next;
              setIntakeState(next);
            }
          } catch {
            // Corrupt intake blob — treat as no stored intake.
          }
        }
        if (progressRaw && !progressTouched.current) {
          try {
            const parsed: unknown = JSON.parse(progressRaw);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              const raw = parsed as Record<string, unknown>;
              const rawStep = typeof raw.step === 'string' ? raw.step : '';
              // Removed steps resume at the next question still in the flow.
              const storedStep =
                rawStep === 'scans'
                  ? 'onset'
                  : rawStep === 'tried' || rawStep === 'seen'
                    ? 'conditions'
                    : rawStep;
              const step: OnboardingStep = KNOWN_STEPS.has(storedStep)
                ? (storedStep as OnboardingStep)
                : 'welcome';
              const next: OnboardingProgress = {
                step,
                hear_about: typeof raw.hear_about === 'string' ? raw.hear_about : null,
                tried_before: typeof raw.tried_before === 'string' ? raw.tried_before : null,
                app_belief: appBelief.safeParse(raw.app_belief).success ? (raw.app_belief as AppBelief) : null,
                committed_at: typeof raw.committed_at === 'string' ? raw.committed_at : null,
                minutes: typeof raw.minutes === 'number' ? raw.minutes : null,
                safety_accepted_at:
                  typeof raw.safety_accepted_at === 'string' ? raw.safety_accepted_at : null,
                has_red_flag: typeof raw.has_red_flag === 'boolean' ? raw.has_red_flag : null,
                agreed_legal: raw.agreed_legal === true,
                recognize_selected: parseRecognizeSelected(raw.recognize_selected),
                recognize_completed: raw.recognize_completed === true,
                pet_name: typeof raw.pet_name === 'string' ? raw.pet_name : null,
                first_name: typeof raw.first_name === 'string' ? raw.first_name : null,
                reminder_time: readReminderTime(raw),
                hard_now_more: raw.hard_now_more === true,
                conditions_more: raw.conditions_more === true,
                ns_draft: readNsDraft(raw.ns_draft),
              };
              progressRef.current = next;
              setProgress(next);
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
        if (cancelled) return;
        hydratedRef.current = true;
        const queuedStep = pendingStepRef.current;
        const queuedLocal = pendingLocalRef.current;
        pendingStepRef.current = null;
        pendingLocalRef.current = {};
        const hasLocal = Object.keys(queuedLocal).length > 0;
        const stored = progressRef.current;
        const base = stored ?? DEFAULT_PROGRESS;
        const furthest =
          queuedStep && STEP_INDEX[queuedStep] > STEP_INDEX[base.step] ? queuedStep : base.step;
        const changed =
          hasLocal ||
          (stored !== null && furthest !== stored.step) ||
          (stored === null && queuedStep !== null && queuedStep !== 'welcome');
        if (changed) {
          const merged: OnboardingProgress = { ...base, ...queuedLocal, step: furthest };
          progressTouched.current = true;
          progressRef.current = merged;
          setProgress(merged);
          AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(merged)).catch(() => {});
        }
        setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function setAnswer<K extends keyof AnswerFields>(field: K, value: AnswerFields[K]) {
    touched.current = true;
    const next = { ...answersRef.current, [field]: value };
    answersRef.current = next;
    setAnswers(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }

  function clearAnswer<K extends keyof AnswerFields>(field: K) {
    touched.current = true;
    const next = { ...answersRef.current };
    delete next[field];
    answersRef.current = next;
    setAnswers(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }

  function setIntake<K extends keyof Intake>(field: K, value: Intake[K]) {
    intakeTouched.current = true;
    const next = { ...intakeRef.current, [field]: value };
    intakeRef.current = next;
    setIntakeState(next);
    AsyncStorage.setItem(INTAKE_KEY, JSON.stringify(next)).catch(() => {});
  }

  function clearIntake<K extends keyof Intake>(field: K) {
    intakeTouched.current = true;
    const next = { ...intakeRef.current };
    delete next[field];
    intakeRef.current = next;
    setIntakeState(next);
    AsyncStorage.setItem(INTAKE_KEY, JSON.stringify(next)).catch(() => {});
  }

  function writeProgress(next: OnboardingProgress) {
    progressRef.current = next;
    setProgress(next);
    AsyncStorage.setItem(PROGRESS_KEY, JSON.stringify(next)).catch(() => {});
  }

  function setProgressStep(step: OnboardingStep) {
    if (!hydratedRef.current) {
      const queued = pendingStepRef.current;
      pendingStepRef.current = queued && STEP_INDEX[queued] > STEP_INDEX[step] ? queued : step;
      return;
    }
    progressTouched.current = true;
    const base = progressRef.current ?? DEFAULT_PROGRESS;
    const furthest = STEP_INDEX[step] > STEP_INDEX[base.step] ? step : base.step;
    writeProgress({ ...base, step: furthest });
  }

  function setLocalAnswer<K extends keyof LocalSelections>(key: K, value: LocalSelections[K]) {
    if (!hydratedRef.current) {
      pendingLocalRef.current = { ...pendingLocalRef.current, [key]: value };
      return;
    }
    progressTouched.current = true;
    const base = progressRef.current ?? DEFAULT_PROGRESS;
    writeProgress({ ...base, [key]: value });
  }

  function resetAnswers() {
    touched.current = true;
    intakeTouched.current = true;
    progressTouched.current = true;
    answersRef.current = {};
    intakeRef.current = {};
    progressRef.current = null;
    setAnswers({});
    setIntakeState({});
    setProgress(null);
    void clearStoredAnswers();
    void clearStoredIntake();
    void clearStoredProgress();
  }

  function startRetake() {
    resetAnswers();
    setRetaking(true);
  }

  function endRetake() {
    setRetaking(false);
  }

  function getSnapshot(): OnboardingSnapshot {
    return {
      answers: answersRef.current,
      intake: intakeRef.current,
      progress: progressRef.current,
    };
  }

  return (
    <OnboardingContext.Provider
      value={{
        answers,
        setAnswer,
        clearAnswer,
        intake,
        setIntake,
        clearIntake,
        resetAnswers,
        progress,
        setProgressStep,
        setLocalAnswer,
        hydrated,
        retaking,
        startRetake,
        endRetake,
        getSnapshot,
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
    // setProgressStep is stable in behavior (it only advances) and is recreated
    // each render. Depending on it would rewrite progress on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
}
