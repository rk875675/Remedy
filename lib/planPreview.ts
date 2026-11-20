import type { Intake } from './intake';
import { completeIntake } from './intakeSummary';
import { supabase } from './supabase';
import {
  onboardingAnswersInputSchema,
  planPreviewSchema,
  type OnboardingAnswersInput,
  type PlanPreview,
} from './schemas';

export type PreviewLoad =
  | { ok: true; data: PlanPreview }
  | { ok: false };

// Superwall present/dismiss remounts the match screen. One invoke per answers
// fingerprint per JS session — sharing the Promise so a remount (or the
// finalizing preload + match consume) does not start a second assign-program call.
const previewByAnswers = new Map<string, Promise<PreviewLoad>>();
const resolvedByAnswers = new Map<string, PreviewLoad>();

function intakeHash(intake: Intake): string {
  const json = JSON.stringify(intake);
  let hash = 2166136261;
  for (let i = 0; i < json.length; i++) {
    hash ^= json.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function answersPreviewKey(answers: OnboardingAnswersInput, intake?: Intake | null): string {
  const base = [
    answers.pain_location,
    answers.pain_duration,
    answers.activity_level,
    answers.equipment,
    answers.sessions_per_week_preference,
    answers.main_goal[0] ?? '',
    answers.pain_type.join(','),
    answers.pain_trigger.join(','),
  ].join(':');
  if (!intake) return base;
  return `${base}:i${intakeHash(intake)}`;
}

type AnswerSource = {
  pain_location?: unknown;
  pain_duration?: unknown;
  pain_type?: unknown;
  activity_level?: unknown;
  pain_trigger?: unknown;
  equipment?: unknown;
  main_goal?: unknown;
  sessions_per_week_preference?: unknown;
};

export function parseCompleteAnswers(answers: AnswerSource): OnboardingAnswersInput | null {
  const result = onboardingAnswersInputSchema.safeParse({
    pain_location: answers.pain_location,
    pain_duration: answers.pain_duration,
    pain_type: answers.pain_type,
    activity_level: answers.activity_level,
    pain_trigger: answers.pain_trigger,
    equipment: answers.equipment,
    main_goal: answers.main_goal,
    sessions_per_week_preference: answers.sessions_per_week_preference,
  });
  return result.success ? result.data : null;
}

export function loadPlanPreview(
  answers: OnboardingAnswersInput,
  intake?: Intake | null,
): Promise<PreviewLoad> {
  const key = answersPreviewKey(answers, intake);
  const existing = previewByAnswers.get(key);
  if (existing) return existing;
  const body = intake
    ? { preview_only: true as const, answers, intake }
    : { preview_only: true as const, answers };
  const pending = supabase.functions
    .invoke('assign-program', { body })
    .then(({ data, error: invokeError }) => {
      const parsed = invokeError ? null : planPreviewSchema.safeParse(data);
      return parsed?.success ? { ok: true as const, data: parsed.data } : { ok: false as const };
    })
    .catch(() => ({ ok: false as const }))
    .then((result) => {
      resolvedByAnswers.set(key, result);
      return result;
    });
  previewByAnswers.set(key, pending);
  return pending;
}

export function peekPlanPreview(
  answers: OnboardingAnswersInput,
  intake?: Intake | null,
): PreviewLoad | null {
  return resolvedByAnswers.get(answersPreviewKey(answers, intake)) ?? null;
}

/** Kick off assign-program preview during the building animation so match has copy ready. */
export function prefetchPlanPreview(answers: AnswerSource, intakePartial?: unknown): void {
  const complete = parseCompleteAnswers(answers);
  if (!complete) return;
  const intake = intakePartial === undefined ? null : completeIntake(answers, intakePartial);
  void loadPlanPreview(complete, intake);
}
