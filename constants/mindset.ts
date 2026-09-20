import type { OnboardingAnswers } from '../types/database';

/**
 * Mental-side copy for onboarding recognition, pre-session orientation,
 * weekly home cards, and the match-screen outcome line.
 *
 * These screens do not change program assignment. Recognition answers stay
 * in local onboarding progress, same as q0 / q9.
 */

export const RECOGNIZE_KEYS = ['effort', 'return_loop', 'flinch', 'permanence'] as const;
export type RecognizeKey = (typeof RECOGNIZE_KEYS)[number];

export const MINDSET_ONBOARDING_STEPS = ['recognize', 'seen'] as const;
export type MindsetOnboardingStep = (typeof MINDSET_ONBOARDING_STEPS)[number];

export function isMindsetOnboardingStep(step: string): step is MindsetOnboardingStep {
  return (MINDSET_ONBOARDING_STEPS as readonly string[]).includes(step);
}

export type TriedBefore = 'yes' | 'no';

export type RecognizeOption = {
  value: RecognizeKey;
  label: string;
  hint: string;
};

const RECOGNIZE_OPTIONS_YES: RecognizeOption[] = [
  {
    value: 'effort',
    label: "I've done stretches and PT. It never sticks.",
    hint: 'The relief never lasts past a week.',
  },
  {
    value: 'return_loop',
    label: 'A good week of progress disappears after one bad movement',
    hint: 'One wrong move and you start over.',
  },
  {
    value: 'flinch',
    label: 'I avoid moves I think will make my back worse',
    hint: 'You skip what feels risky.',
  },
  {
    value: 'permanence',
    label: "I've had this so long I've learned to live with it",
    hint: 'You stopped expecting it to change.',
  },
];

const RECOGNIZE_OPTIONS_NO: RecognizeOption[] = [
  {
    value: 'effort',
    label: "I don't know what's safe to start with",
    hint: 'You do not want to start the wrong thing.',
  },
  {
    value: 'return_loop',
    label: "There's so much contradicting advice I don't know who to trust",
    hint: 'Every video tells you the opposite.',
  },
  {
    value: 'flinch',
    label: "I can't afford weekly PT",
    hint: 'A visit a week is not realistic.',
  },
  {
    value: 'permanence',
    label: "I've had this so long I've learned to live with it",
    hint: 'You stopped expecting it to change.',
  },
];

export function recognizeOptionsFor(triedBefore: string | null | undefined): RecognizeOption[] {
  return triedBefore === 'no' ? RECOGNIZE_OPTIONS_NO : RECOGNIZE_OPTIONS_YES;
}

export function parseRecognizeSelected(value: unknown): RecognizeKey[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RecognizeKey =>
    typeof item === 'string' && (RECOGNIZE_KEYS as readonly string[]).includes(item),
  );
}

/**
 * Copy for the screen right after "Which of these sound like you?" (app/(onboarding)/seen.tsx).
 * Shape is intentionally three short beats, not three paragraphs:
 *   title: speaks their exact complaint back, so it feels heard
 *   teach: one tight idea, not the whole lecture
 *   weDo: one specific line on what Remedy does about it, not a slogan
 */
export function tailoredMindsetCopy(
  triedBefore: string | null | undefined,
  selected: RecognizeKey[],
): { title: string; teach: string; weDo: string } {
  const tried = triedBefore === 'no' ? 'no' : 'yes';
  const lead = selected[0];

  if (!lead) {
    return tried === 'no'
      ? {
          title: "You shouldn't have to guess.",
          teach: 'Most people wait because they do not know the first safe move to make.',
          weDo: 'We give you one clear place to start.',
        }
      : {
          title: "It's not your fault it didn't last.",
          teach: 'Stretches and appointments that fade in a week are the average experience, not a personal failing.',
          weDo: 'We pick up where those attempts stopped, and finish the job.',
        };
  }

  if (lead === 'permanence') {
    return {
          title: 'You can still get better.',
      teach: 'Pain that lasts this long does not mean your back is broken. It never got a chance to calm down.',
      weDo: 'We give it that chance, one week at a time.',
    };
  }

  if (tried === 'no') {
    switch (lead) {
      case 'effort':
        return {
          title: 'Not knowing where to start is normal.',
          teach: 'Guessing wrong feels riskier than doing nothing, so most people just wait.',
          weDo: 'We hand you the first week. No guessing required.',
        };
      case 'return_loop':
        return {
          title: 'Too much advice. No plan.',
          teach: 'Rest. Do not rest. Stretch. Do not stretch. No wonder you have not started.',
          weDo: 'One plan. Same next step, every day.',
        };
      case 'flinch':
        return {
          title: "You don't need weekly PT to start.",
          teach: 'You still need what PT gives you: a real plan, and a reason to stop being scared of moving.',
          weDo: 'This is built to be the plan you can actually keep up.',
        };
    }
  }

  switch (lead) {
    case 'effort':
      return {
        title: "That's why it never lasted.",
        teach: 'A stretch calms things down for a few days. It does not rebuild what your back needs to hold up under real life.',
        weDo: 'We build that part, in order, until the relief actually stays.',
      };
    case 'return_loop':
      return {
        title: "One bad move didn't ruin the week.",
        teach: "You got the pain down. You just weren't strong enough yet for a rough day.",
        weDo: "We build that strength, so one wrong move doesn't send you back to day one.",
      };
    case 'flinch':
      return {
        title: 'Skipping those moves is why they still hurt.',
        teach: "When you skip anything that feels risky, your back stays on high alert. That's why it still hurts.",
        weDo: 'We bring those moves back slowly, until they stop feeling scary.',
      };
  }

  // Unreachable: RecognizeKey is exhaustively handled above.
  return {
    title: "It's not your fault it didn't last.",
    teach: 'Stretches and appointments that fade in a week are the average experience, not a personal failing.',
    weDo: 'We pick up where those attempts stopped, and finish the job.',
  };
}

export const ORIENTATION_SLIDES = [
  {
    eyebrow: 'BEFORE YOU START',
    title: 'Your back is tougher than it feels.',
    body: 'Soreness during this work is information, not damage. Do the movement. Do not hunt for pain.',
  },
  {
    eyebrow: 'WHEN IT FLARES',
    title: "A bad morning doesn't mean it failed.",
    body: "Some days the pain will come back. Keep going. That's how it gets quieter.",
  },
  {
    eyebrow: 'HOW THIS WORKS',
    title: "Show up often. That's what changes it.",
    body: 'Not fake positivity. Your back is more adaptable than the last few years have made it feel. Kind and consistent beats intense and afraid.',
  },
] as const;

const WEEKLY_CARDS: readonly string[] = [
  'Do not hunt for pain during the session. Do the movement.',
  'Soreness after a session is often your system updating — not a setback.',
  'The first flare after you feel better is the trap. This is where people quit.',
  'You are not chasing zero pain. You are building enough margin that life fits under it.',
  'Guarded movement keeps the alarm on. Move like someone whose back can handle this.',
  'A good week is not the finish line. The next hard Tuesday is the test.',
  'You are allowed to trust a good day without waiting for it to be taken away.',
  'Capacity is the point — how much you can do before symptoms climb.',
  'This is becoming training, not rehab you have to think about.',
];

const WEEKLY_LATE =
  'You are not rehabbing forever. You are becoming someone who trains.';

export function weeklyMindsetLine(weekNumber: number): string {
  if (weekNumber < 1) return WEEKLY_CARDS[0] ?? WEEKLY_LATE;
  return WEEKLY_CARDS[weekNumber - 1] ?? WEEKLY_LATE;
}

export function outcomeTagline(
  goal: OnboardingAnswers['main_goal'][number],
  activity: OnboardingAnswers['activity_level'],
): string {
  switch (goal) {
    case 'reduce_pain':
      return activity === 'sedentary'
        ? 'So standing up from a chair feels normal again.'
        : 'So bending over is easy again.';
    case 'return_to_exercise':
      return 'So you think about the lift, not your back.';
    case 'sleep':
      return 'So you wake up thinking about the day, not the pain.';
    case 'mobility':
      return 'So you get off the floor without that pause.';
  }
}
