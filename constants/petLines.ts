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

/**
 * Pain check-in: the pet reacts as the slider moves (score 1 to 10).
 * First person, sympathetic, never diagnostic.
 */
export const PET_CHECKIN_BEFORE_PROMPT = "How's the back right now? Be honest.";
export const PET_CHECKIN_AFTER_PROMPT = 'And now? Same scale.';

export function petCheckinReaction(score: number): {
  line: string;
  mood: 'celebrating' | 'ready' | 'concerned' | 'stiff';
} {
  if (score <= 2) return { line: 'Barely there. Lovely.', mood: 'celebrating' };
  if (score <= 4) return { line: 'A bit grumbly. Okay, noted.', mood: 'ready' };
  if (score <= 6) return { line: "Noticeable. We'll take it easy.", mood: 'stiff' };
  if (score <= 8) return { line: "That's a rough one. Go gently today.", mood: 'concerned' };
  return { line: "That's a lot. Your body gets the final say.", mood: 'concerned' };
}

/** Rest between sets and exercises, picked at random per rest. */
export const PET_REST_LINES = [
  "Breathe. I'm resting too.",
  'Shake it out. No rush.',
  'Good set. That counted.',
  'Shoulders down. There you go.',
] as const;

/** Orientation slides before the first session, one line per slide (last one repeats). */
export const PET_ORIENTATION_LINES = [
  'Three quick things before we start.',
  'This part matters. Read it slowly.',
  "Ready? I'm right behind you.",
] as const;

/** Next program: while it builds, and when it is revealed. */
export const PET_NEXT_PROGRAM_BUILDING = 'Building the next one. Bigger this time.';
export const PET_NEXT_PROGRAM_READY = 'New program. Same team.';

/** Feedback sent. */
export const PET_FEEDBACK_THANKS = "Thank you. I'll pass it on.";

/** Something broke. */
export const PET_ERROR_LINE = "Well. That wasn't supposed to happen.";

/** Sign-in screen: returning users, and new users creating an account after the paywall. */
export const PET_SIGN_IN_LINE = 'Welcome back. I kept your spot.';
export const PET_SIGN_UP_LINE = "One last step. Then it's you and me.";

/** Home, on the hill under the pet, when there is nothing to start. */
export const PET_HOME_DONE_LINE = 'Done for today. I can feel it.';
export const PET_HOME_REST_LINE = "Rest day. I'm napping. You should too.";

/** Reminder notifications. */
export const PET_WORKOUT_REMINDER = {
  title: '{name} is ready when you are',
  body: "Today's session is waiting. A few minutes and you're both done.",
} as const;

export const PET_STRETCH_REMINDER = {
  title: 'Stretch break',
  body: '{name} is stretching. Stand up and join in for a minute.',
} as const;
