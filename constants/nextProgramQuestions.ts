import type { Difficulty, PainChange } from '../lib/schemas';
import type { MainGoal, OnboardingAnswers } from '../types/database';

/**
 * Program-complete check-in (app/next-program.tsx). Every answer maps to something
 * start-next-program actually uses: the first two set the progression level, the
 * next four replace their saved onboarding answers. The last step is the optional
 * note and the build button.
 */
export const CHECKIN_STEP_KEYS = [
  'pain_change',
  'difficulty',
  'main_goal',
  'pain_location',
  'sessions_per_week',
  'equipment',
  'feedback',
] as const;
export type CheckinStepKey = (typeof CHECKIN_STEP_KEYS)[number];

export const CHECKIN_COPY: Record<CheckinStepKey, { title: string; subtitle?: string }> = {
  pain_change: {
    title: 'How does your back feel now?',
    subtitle: 'Compared to when you started this program.',
  },
  difficulty: { title: 'How did the workouts feel?' },
  main_goal: { title: 'What should your next program focus on?', subtitle: 'Select all that apply' },
  pain_location: { title: 'Where do you feel it most now?' },
  sessions_per_week: { title: 'How many days a week?', subtitle: 'Pick what you can keep up with.' },
  equipment: { title: 'What can you use now?' },
  feedback: {
    title: 'Anything else we should know?',
    subtitle: 'Optional. What worked, what didn\u2019t, what you\u2019d change. We read every note.',
  },
};

export const PAIN_CHANGE_OPTIONS: { value: PainChange; label: string }[] = [
  { value: 'much_better', label: 'Much better' },
  { value: 'better', label: 'A little better' },
  { value: 'same', label: 'About the same' },
  { value: 'worse', label: 'Worse' },
];

export const DIFFICULTY_OPTIONS: { value: Difficulty; label: string; subtitle: string }[] = [
  { value: 'too_easy', label: 'Too easy', subtitle: 'I had more in the tank' },
  { value: 'just_right', label: 'Just right', subtitle: 'Challenging but doable' },
  { value: 'too_hard', label: 'Too hard', subtitle: 'It was a struggle to keep up' },
];

export const WORSE_PAIN_NOTE =
  'Sorry it\u2019s been rough. We won\u2019t make your next program harder. If your pain keeps getting worse, check in with a doctor or physical therapist.';

export const GOAL_FOCUS: Record<MainGoal, string> = {
  reduce_pain: 'reducing daily pain',
  return_to_exercise: 'getting back to working out',
  sleep: 'sleeping better',
  mobility: 'improving mobility',
};

export const LOCATION_FOCUS: Record<OnboardingAnswers['pain_location'], string> = {
  upper: 'Targets your upper back',
  lower: 'Targets your lower back',
  all: 'Covers your whole back',
};
