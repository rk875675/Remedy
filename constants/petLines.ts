import type { PetStage } from './petImages';

/**
 * Everything the pet "says". Voice: warm and a little cheeky.
 * Rules: the pet never guilt-trips, never gets hurt, and never makes a claim
 * about the user's back. Lines are about the pet and about showing up.
 * `{name}` is replaced with the pet's name.
 */

export const PET_FALLBACK_NAME = 'Your armadillo';

export function petLine(template: string, name: string | null | undefined): string {
  return template.replace(/\{name\}/g, name && name.trim() ? name.trim() : PET_FALLBACK_NAME);
}

/** Session complete, picked at random. */
export const PET_SESSION_COMPLETE_LINES = [
  '{name} felt that one.',
  '{name} is a little looser already.',
  'Nice work. {name} noticed.',
  '{name} approves. Loudly.',
  'That is one more for {name}.',
] as const;

/** Session complete when the after-session pain score is higher than before. */
export const PET_PAIN_UP_LINE = 'That one was tougher. {name} is sticking with you.';

/** Shown when a session takes the pet to a new stage. */
export const PET_GREW_TITLE = '{name} grew!';
export const PET_GREW_LINES: Record<Exclude<PetStage, 1>, string> = {
  2: '{name} is peeking out for the first time.',
  3: '{name} is out of the shell.',
  4: '{name} is up on two feet.',
  5: '{name} is fully grown.',
};

/** Week complete (weekly ramp screen). */
export const PET_WEEK_COMPLETE_LINE = '{name} is proud of that week.';

/** Program complete. */
export const PET_PROGRAM_COMPLETE_LINE = '{name} made it the whole way with you.';

/** Onboarding: meeting and naming the pet. */
export const PET_MEET_TITLE = 'Meet your armadillo';
export const PET_MEET_BODY =
  "It's curled up tight right now. Every session helps it loosen up and grow.";
export const PET_NAME_LABEL = 'Give it a name';
export const PET_NAME_PLACEHOLDER = 'Biscuit';
export const PET_NAME_INVALID = 'Names are 1 to 20 characters.';
export const PET_NAME_MAX_LENGTH = 20;

/** Program match screen, beside the program card. */
export const PET_MATCH_LINE = '{name} is ready to start with you.';

/** Reminder notifications. */
export const PET_WORKOUT_REMINDER = {
  title: '{name} is ready when you are',
  body: "Today's session is waiting. A few minutes and you're both done.",
} as const;

export const PET_STRETCH_REMINDER = {
  title: 'Stretch break',
  body: '{name} is stretching. Stand up and join in for a minute.',
} as const;
