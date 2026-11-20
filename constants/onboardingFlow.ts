// Ordered onboarding step registry. Screen files are named after `key`
// (`welcome` is the group index). Pure helpers take a snapshot so a setter and
// a navigation call in the same tick see the same answers.

import { isLegLike, normalizeIntake, SESSION_MINUTES, type Intake } from '../lib/intake';
import { onboardingAnswersInputSchema } from '../lib/schemas';
import type { OnboardingAnswers } from '../types/database';

export type ObStepKey =
  | 'welcome'
  | 'meet'
  | 'pet'
  | 'open_goals'
  | 'goal'
  | 'hard_now'
  | 'outlook'
  | 'open_back'
  | 'location'
  | 'spread'
  | 'duration'
  | 'onset'
  | 'feel'
  | 'leg'
  | 'intensity'
  | 'open_pattern'
  | 'movement'
  | 'relief'
  | 'rapid'
  | 'ns'
  | 'ns_result'
  | 'open_you'
  | 'conditions'
  | 'age'
  | 'activity'
  | 'equipment'
  | 'time'
  | 'reminders'
  | 'safety'
  | 'finalizing'
  | 'match';

export type ObChapter = 1 | 2 | 3 | 4 | null;

export type ObStepKind = 'beat' | 'input' | 'opener' | 'question' | 'deck' | 'loader' | 'plan';

export type ReminderTime = 'morning' | 'midday' | 'evening';

export type ObStep = {
  key: ObStepKey;
  path: string;
  chapter: ObChapter;
  kind: ObStepKind;
  conditional: boolean;
};

type AnswerFields = Omit<OnboardingAnswers, 'id' | 'user_id' | 'completed_at' | 'created_at'>;

export type ObFlowState = {
  answers: Partial<AnswerFields>;
  intake: Partial<Intake>;
  progress: {
    step: ObStepKey;
    agreed_legal: boolean;
    safety_accepted_at: string | null;
    pet_name: string | null;
    reminder_time: ReminderTime | null | undefined;
    first_name?: string | null;
    hear_about?: string | null;
    tried_before?: string | null;
    app_belief?: string | null;
    committed_at?: string | null;
    minutes?: number | null;
    has_red_flag?: boolean | null;
    recognize_selected?: readonly string[];
    recognize_completed?: boolean;
  } | null;
  hasPet: boolean;
};

export const OB_STEPS: readonly ObStep[] = [
  { key: 'welcome', path: '/(onboarding)', chapter: null, kind: 'beat', conditional: false },
  { key: 'meet', path: '/(onboarding)/meet', chapter: null, kind: 'beat', conditional: true },
  { key: 'pet', path: '/(onboarding)/pet', chapter: null, kind: 'input', conditional: true },
  { key: 'open_goals', path: '/(onboarding)/open_goals', chapter: 1, kind: 'opener', conditional: false },
  { key: 'goal', path: '/(onboarding)/goal', chapter: 1, kind: 'question', conditional: false },
  { key: 'hard_now', path: '/(onboarding)/hard_now', chapter: 1, kind: 'question', conditional: false },
  { key: 'outlook', path: '/(onboarding)/outlook', chapter: 1, kind: 'beat', conditional: false },
  { key: 'open_back', path: '/(onboarding)/open_back', chapter: 2, kind: 'opener', conditional: false },
  { key: 'location', path: '/(onboarding)/location', chapter: 2, kind: 'question', conditional: false },
  { key: 'spread', path: '/(onboarding)/spread', chapter: 2, kind: 'question', conditional: false },
  { key: 'duration', path: '/(onboarding)/duration', chapter: 2, kind: 'question', conditional: false },
  { key: 'onset', path: '/(onboarding)/onset', chapter: 2, kind: 'question', conditional: false },
  { key: 'feel', path: '/(onboarding)/feel', chapter: 2, kind: 'question', conditional: false },
  { key: 'leg', path: '/(onboarding)/leg', chapter: 2, kind: 'question', conditional: true },
  { key: 'intensity', path: '/(onboarding)/intensity', chapter: 2, kind: 'question', conditional: false },
  { key: 'open_pattern', path: '/(onboarding)/open_pattern', chapter: 3, kind: 'opener', conditional: false },
  { key: 'movement', path: '/(onboarding)/movement', chapter: 3, kind: 'question', conditional: false },
  { key: 'relief', path: '/(onboarding)/relief', chapter: 3, kind: 'question', conditional: false },
  { key: 'rapid', path: '/(onboarding)/rapid', chapter: 3, kind: 'deck', conditional: false },
  { key: 'ns', path: '/(onboarding)/ns', chapter: 3, kind: 'deck', conditional: false },
  { key: 'ns_result', path: '/(onboarding)/ns_result', chapter: 3, kind: 'beat', conditional: false },
  { key: 'open_you', path: '/(onboarding)/open_you', chapter: 4, kind: 'opener', conditional: false },
  { key: 'conditions', path: '/(onboarding)/conditions', chapter: 4, kind: 'question', conditional: false },
  { key: 'age', path: '/(onboarding)/age', chapter: 4, kind: 'question', conditional: false },
  { key: 'activity', path: '/(onboarding)/activity', chapter: 4, kind: 'question', conditional: false },
  { key: 'equipment', path: '/(onboarding)/equipment', chapter: 4, kind: 'question', conditional: false },
  { key: 'time', path: '/(onboarding)/time', chapter: 4, kind: 'question', conditional: false },
  { key: 'reminders', path: '/(onboarding)/reminders', chapter: 4, kind: 'question', conditional: false },
  { key: 'safety', path: '/(onboarding)/safety', chapter: 4, kind: 'question', conditional: false },
  { key: 'finalizing', path: '/(onboarding)/finalizing', chapter: null, kind: 'loader', conditional: false },
  { key: 'match', path: '/(onboarding)/match', chapter: null, kind: 'plan', conditional: false },
];

export type ObChapterId = 1 | 2 | 3 | 4;

export const OB_CHAPTER_STEPS: Record<ObChapterId, readonly ObStep[]> = {
  1: OB_STEPS.filter((step) => step.chapter === 1),
  2: OB_STEPS.filter((step) => step.chapter === 2),
  3: OB_STEPS.filter((step) => step.chapter === 3),
  4: OB_STEPS.filter((step) => step.chapter === 4),
};

const STEP_INDEX: Record<ObStepKey, number> = OB_STEPS.reduce(
  (index, step, position) => {
    index[step.key] = position;
    return index;
  },
  {} as Record<ObStepKey, number>,
);

const SAFETY_INDEX = STEP_INDEX.safety;

const NO_REQUIREMENT = new Set<ObStepKey>([
  'meet',
  'open_goals',
  'outlook',
  'open_back',
  'open_pattern',
  'ns_result',
  'open_you',
  'finalizing',
  'match',
]);

function hasItems(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && value.length > 0;
}

function isDefinedArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isSessionMinutes(value: unknown): value is (typeof SESSION_MINUTES)[number] {
  return value === 15 || value === 20 || value === 30;
}

export function isStepApplicable(key: ObStepKey, state: ObFlowState): boolean {
  if (key === 'meet' || key === 'pet') return !state.hasPet;
  if (key === 'leg') {
    return isLegLike(
      state.answers.pain_type ?? [],
      state.intake.spread,
      state.intake.conditions,
    );
  }
  return true;
}

export function isStepSatisfied(key: ObStepKey, state: ObFlowState): boolean {
  if (NO_REQUIREMENT.has(key)) return true;
  const { answers, intake, progress } = state;
  switch (key) {
    case 'welcome':
      return progress?.agreed_legal === true;
    case 'pet':
      return typeof progress?.pet_name === 'string' && progress.pet_name.trim().length > 0;
    case 'goal':
      return hasItems(answers.main_goal);
    case 'hard_now':
      return isDefinedArray(intake.hard_now);
    case 'location':
      return answers.pain_location === 'upper' || answers.pain_location === 'lower' || answers.pain_location === 'all';
    case 'spread':
      return intake.spread !== undefined;
    case 'duration':
      return intake.duration_detail !== undefined;
    case 'onset':
      return intake.onset !== undefined;
    case 'feel':
      return hasItems(answers.pain_type);
    case 'leg':
      return intake.leg_reach != null;
    case 'intensity':
      return typeof intake.intensity === 'number';
    case 'movement':
      return isDefinedArray(intake.movement_feel);
    case 'relief':
      return intake.relief_direction !== undefined;
    case 'rapid':
      return intake.flare_settle !== undefined && intake.trend !== undefined && intake.limitation !== undefined;
    case 'ns': {
      const ns = intake.ns;
      return (
        ns?.predictable !== undefined &&
        ns.small_triggers !== undefined &&
        ns.stress !== undefined &&
        ns.anticipation !== undefined &&
        ns.avoidance !== undefined
      );
    }
    case 'conditions':
      return isDefinedArray(intake.conditions);
    case 'age':
      return intake.age_band !== undefined;
    case 'activity':
      return answers.activity_level !== undefined;
    case 'equipment':
      return !!answers.equipment;
    case 'time':
      return isSessionMinutes(intake.minutes) && typeof answers.sessions_per_week_preference === 'number';
    case 'reminders':
      return progress != null && progress.reminder_time !== undefined;
    case 'safety':
      return typeof progress?.safety_accepted_at === 'string' && progress.safety_accepted_at.length > 0;
    default:
      return true;
  }
}

export function nextStep(key: ObStepKey, state: ObFlowState): ObStep | null {
  for (let i = STEP_INDEX[key] + 1; i < OB_STEPS.length; i++) {
    const step = OB_STEPS[i];
    if (step && isStepApplicable(step.key, state)) return step;
  }
  return null;
}

/** 0 for steps outside a chapter. First applicable step of a chapter is 1/n, last is 1. */
export function chapterProgress(key: ObStepKey, state: ObFlowState): number {
  const step = OB_STEPS[STEP_INDEX[key]];
  if (!step || step.chapter === null) return 0;
  const chapter = step.chapter;
  const applicable = OB_STEPS.filter(
    (candidate) => candidate.chapter === chapter && isStepApplicable(candidate.key, state),
  );
  const position = applicable.findIndex((candidate) => candidate.key === key);
  if (position < 0 || applicable.length === 0) return 0;
  return (position + 1) / applicable.length;
}

export function getResumeStep(state: ObFlowState): ObStepKey {
  if (!state.progress) return 'welcome';
  // Your Program is the end of the funnel. Once it has been opened, a relaunch
  // returns there instead of walking back to an earlier question.
  if (state.progress.step === 'match') return 'match';
  const furthestIndex = STEP_INDEX[state.progress.step] ?? 0;
  let lastApplicable: ObStepKey = 'welcome';
  for (let i = 0; i <= furthestIndex; i++) {
    const step = OB_STEPS[i];
    if (!step || !isStepApplicable(step.key, state)) continue;
    lastApplicable = step.key;
    if (!isStepSatisfied(step.key, state)) return step.key;
  }
  return lastApplicable;
}

/**
 * Ready for the plan screen: every applicable step through safety is satisfied,
 * the legacy 8 answers parse, and the intake normalizes. `v` defaults to 1 when
 * the stored partial has not set it yet (no screen writes `v` on its own).
 */
export function shouldOpenMatch(state: ObFlowState): boolean {
  for (let i = 0; i <= SAFETY_INDEX; i++) {
    const step = OB_STEPS[i];
    if (!step || !isStepApplicable(step.key, state)) continue;
    if (!isStepSatisfied(step.key, state)) return false;
  }
  if (!onboardingAnswersInputSchema.safeParse(state.answers).success) return false;
  const withVersion = state.intake.v === undefined ? { ...state.intake, v: 1 as const } : state.intake;
  return normalizeIntake(withVersion, state.answers.pain_type ?? []) !== null;
}

export function hasMeaningfulIncompleteFunnel(state: ObFlowState): boolean {
  if (shouldOpenMatch(state)) return false;
  const progress = state.progress;
  if (!progress) return false;
  if ((STEP_INDEX[progress.step] ?? 0) > 0) return true;
  return (
    (progress.hear_about ?? null) !== null ||
    (progress.tried_before ?? null) !== null ||
    (progress.app_belief ?? null) !== null ||
    progress.safety_accepted_at !== null ||
    progress.agreed_legal ||
    (progress.has_red_flag ?? null) !== null ||
    (progress.minutes ?? null) !== null ||
    progress.recognize_completed === true ||
    (progress.recognize_selected?.length ?? 0) > 0 ||
    (progress.first_name ?? null) !== null ||
    progress.pet_name !== null ||
    (progress.committed_at ?? null) !== null ||
    progress.reminder_time !== undefined
  );
}

type StackRouter = {
  replace: (href: string) => void;
  push: (href: string) => void;
};

/** Rebuild welcome through `target`, skipping steps that do not apply, so swipe-back still works. */
export function rebuildOnboardingStack(router: StackRouter, target: ObStepKey, state: ObFlowState): void {
  // Your Program has no way back into the quiz. Replacing onto it drops the
  // questions that would otherwise sit underneath a swipe.
  if (target === 'match') {
    router.replace('/(onboarding)/match');
    return;
  }
  const targetIndex = STEP_INDEX[target] ?? 0;
  const steps = OB_STEPS.filter((step, index) => index <= targetIndex && isStepApplicable(step.key, state));
  const first = steps[0];
  if (!first) {
    router.replace('/(onboarding)');
    return;
  }
  router.replace(first.path);
  for (let i = 1; i < steps.length; i++) {
    const step = steps[i];
    if (step) router.push(step.path);
  }
}
