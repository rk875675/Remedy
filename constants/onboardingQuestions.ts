import type { OnboardingAnswers, PainTrigger } from '../types/database';

/**
 * Single source of truth for program-affecting onboarding questions.
 *
 * When you change a question's options or copy, change it HERE.
 * q1–q8 and the Your Answers screen both import from this file so the
 * answers list cannot drift from the questionnaire.
 *
 * Marketing-only screens (q0 hear-about, q9 tried-before, recognize) and the
 * local session-length picker on q8 are not stored on the answers row and are
 * not listed here.
 */

export const PAIN_LOCATION_OPTIONS = [
  { value: 'upper' as const, label: 'Upper back' },
  { value: 'lower' as const, label: 'Lower back' },
  { value: 'all' as const, label: 'All over' },
];

// Several rows share an engine bucket (acute / subacute / chronic). The extra
// granularity is so people with months/years of pain feel seen — assignment
// still uses the bucket. `id` is UI-only and is not persisted.
export const PAIN_DURATION_OPTIONS = [
  { id: 'lt_2w', value: 'acute' as const, label: 'Less than 2 weeks' },
  { id: '2w_3m', value: 'subacute' as const, label: '2 weeks to 3 months' },
  { id: '3_12m', value: 'chronic' as const, label: '3 to 12 months' },
  { id: '1_5y', value: 'chronic' as const, label: '1 to 5 years' },
  { id: '5y_plus', value: 'chronic' as const, label: 'More than 5 years' },
];

export const PAIN_DURATION_DISPLAY: Record<OnboardingAnswers['pain_duration'], string> = {
  acute: 'Less than 2 weeks',
  subacute: '2 weeks to 3 months',
  chronic: '3 months or more',
};

export const PAIN_TYPE_OPTIONS = [
  { value: 'stiffness' as const, label: 'Stiffness' },
  { value: 'ache' as const, label: 'Dull ache' },
  { value: 'sharp' as const, label: 'Sharp pain' },
  { value: 'nerve' as const, label: 'Travels or tingles' },
];

export const ACTIVITY_LEVEL_OPTIONS = [
  { value: 'sedentary' as const, label: 'Mostly sitting day-to-day' },
  { value: 'light' as const, label: 'Lightly active' },
  { value: 'active' as const, label: 'Very active / strength training' },
];

export const ACTIVITY_LEVEL_DISPLAY: Record<OnboardingAnswers['activity_level'], string> = {
  sedentary: 'Mostly sitting day-to-day',
  light: 'Lightly active',
  active: 'Very active / strength training',
  athlete: 'Athlete',
};

export const PAIN_TRIGGER_OPTIONS = [
  { value: 'sitting' as const, label: 'Sitting too long' },
  { value: 'bending' as const, label: 'Bending or lifting' },
  { value: 'standing' as const, label: 'Standing or walking' },
  { value: 'morning' as const, label: 'Mornings / after rest' },
];

export const PAIN_TRIGGER_DISPLAY: Record<PainTrigger, string> = {
  sitting: 'Sitting too long',
  bending: 'Bending or lifting',
  standing: 'Standing or walking',
  morning: 'Mornings / after rest',
  exercise: 'Exercise',
  other: 'Other',
};

export const EQUIPMENT_OPTIONS = [
  {
    value: 'gym' as const,
    label: 'Full gym access',
    subtitle: 'Most room to progress. Machines, free weights, cables',
    badge: 'Recommended',
  },
  {
    value: 'bands_dumbbells' as const,
    label: 'Bands & light dumbbells',
    subtitle: 'The next best setup if a gym is not an option',
  },
  {
    value: 'open_space' as const,
    label: 'Open floor space',
    subtitle: 'Bodyweight only. The smallest toolkit',
  },
];

export const MAIN_GOAL_OPTIONS = [
  { value: 'reduce_pain' as const, label: 'Reduce daily pain' },
  { value: 'return_to_exercise' as const, label: 'Get back to working out' },
  { value: 'sleep' as const, label: 'Sleep better' },
  { value: 'mobility' as const, label: 'Improve mobility' },
];

export const SESSIONS_PER_WEEK_VALUES = [3, 4, 5, 6, 7] as const;
export type SessionsPerWeekValue = (typeof SESSIONS_PER_WEEK_VALUES)[number];

export type ProgramAnswerKey = keyof Pick<
  OnboardingAnswers,
  | 'pain_location'
  | 'pain_duration'
  | 'pain_type'
  | 'activity_level'
  | 'pain_trigger'
  | 'equipment'
  | 'main_goal'
  | 'sessions_per_week_preference'
>;

export const PROGRAM_ANSWER_ROWS: Array<{
  key: ProgramAnswerKey;
  label: string;
  multi: boolean;
}> = [
  { key: 'pain_location', label: 'Pain location', multi: false },
  { key: 'pain_duration', label: 'How long', multi: false },
  { key: 'pain_type', label: 'Pain type', multi: true },
  { key: 'activity_level', label: 'Activity level', multi: false },
  { key: 'pain_trigger', label: 'Main trigger', multi: true },
  { key: 'equipment', label: 'Equipment', multi: false },
  { key: 'main_goal', label: 'Main goal', multi: true },
  { key: 'sessions_per_week_preference', label: 'Days per week', multi: false },
];

export type EditorOption = {
  id: string;
  value: string;
  label: string;
  subtitle?: string;
  badge?: string;
};

function optionId(value: string): string {
  return value;
}

export function editorOptionsFor(
  key: ProgramAnswerKey,
  current: unknown,
): EditorOption[] {
  switch (key) {
    case 'pain_location':
      return PAIN_LOCATION_OPTIONS.map((o) => ({
        id: optionId(o.value),
        value: o.value,
        label: o.label,
      }));
    case 'pain_duration':
      return PAIN_DURATION_OPTIONS.map((o) => ({
        id: o.id,
        value: o.value,
        label: o.label,
      }));
    case 'pain_type':
      return PAIN_TYPE_OPTIONS.map((o) => ({
        id: optionId(o.value),
        value: o.value,
        label: o.label,
      }));
    case 'activity_level': {
      const options: EditorOption[] = ACTIVITY_LEVEL_OPTIONS.map((o) => ({
        id: optionId(o.value),
        value: o.value,
        label: o.label,
      }));
      if (current === 'athlete') {
        options.push({ id: 'athlete', value: 'athlete', label: ACTIVITY_LEVEL_DISPLAY.athlete });
      }
      return options;
    }
    case 'pain_trigger': {
      const options: EditorOption[] = PAIN_TRIGGER_OPTIONS.map((o) => ({
        id: optionId(o.value),
        value: o.value,
        label: o.label,
      }));
      const selected = Array.isArray(current) ? current : [];
      for (const extra of ['exercise', 'other'] as const) {
        if (selected.includes(extra)) {
          options.push({
            id: extra,
            value: extra,
            label: PAIN_TRIGGER_DISPLAY[extra],
          });
        }
      }
      return options;
    }
    case 'equipment':
      return EQUIPMENT_OPTIONS.map((o) => ({
        id: optionId(o.value),
        value: o.value,
        label: o.label,
        subtitle: o.subtitle,
        badge: o.badge,
      }));
    case 'main_goal':
      return MAIN_GOAL_OPTIONS.map((o) => ({
        id: optionId(o.value),
        value: o.value,
        label: o.label,
      }));
    case 'sessions_per_week_preference':
      return SESSIONS_PER_WEEK_VALUES.map((n) => ({
        id: String(n),
        value: String(n),
        label: `${n} days / week`,
      }));
  }
}

function labelForScalar(key: ProgramAnswerKey, value: string): string {
  switch (key) {
    case 'pain_location':
      return PAIN_LOCATION_OPTIONS.find((o) => o.value === value)?.label ?? value;
    case 'pain_duration':
      return PAIN_DURATION_DISPLAY[value as OnboardingAnswers['pain_duration']] ?? value;
    case 'pain_type':
      return PAIN_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
    case 'activity_level':
      return ACTIVITY_LEVEL_DISPLAY[value as OnboardingAnswers['activity_level']] ?? value;
    case 'pain_trigger':
      return PAIN_TRIGGER_DISPLAY[value as PainTrigger] ?? value;
    case 'equipment':
      return EQUIPMENT_OPTIONS.find((o) => o.value === value)?.label ?? value;
    case 'main_goal':
      return MAIN_GOAL_OPTIONS.find((o) => o.value === value)?.label ?? value;
    case 'sessions_per_week_preference':
      return `${value} days / week`;
  }
}

export function formatProgramAnswer(key: ProgramAnswerKey, value: unknown): string {
  if (value == null) return '—';
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return value.map((v) => labelForScalar(key, String(v))).join(', ');
  }
  return labelForScalar(key, String(value));
}

export function durationOptionIdFor(value: OnboardingAnswers['pain_duration'] | undefined): string | null {
  if (!value) return null;
  return PAIN_DURATION_OPTIONS.find((o) => o.value === value)?.id ?? null;
}

