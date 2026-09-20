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

export function answersPreviewKey(answers: OnboardingAnswersInput): string {
  return [
    answers.pain_location,
    answers.pain_duration,
    answers.activity_level,
    answers.equipment,
    answers.sessions_per_week_preference,
    answers.main_goal[0] ?? '',
  ].join(':');
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

export function loadPlanPreview(answers: OnboardingAnswersInput): Promise<PreviewLoad> {
  const key = answersPreviewKey(answers);
  const existing = previewByAnswers.get(key);
  if (existing) return existing;
  const pending = supabase.functions
    .invoke('assign-program', { body: { preview_only: true, answers } })
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

export function peekPlanPreview(answers: OnboardingAnswersInput): PreviewLoad | null {
  return resolvedByAnswers.get(answersPreviewKey(answers)) ?? null;
}

/** Kick off assign-program preview during the building animation so match has copy ready. */
export function prefetchPlanPreview(answers: AnswerSource): void {
  const complete = parseCompleteAnswers(answers);
  if (complete) void loadPlanPreview(complete);
}
