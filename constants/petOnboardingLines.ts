import type { PetMood } from './petImages';

/**
 * What the pet says during onboarding, in its own voice (first person).
 *
 * One bubble per screen: `prompt` shows until the user answers, then the bubble
 * is rewritten with the reaction for what they tapped (for multi-select, the
 * option tapped most recently).
 *
 * Voice rules: warm, a little cheeky, on the user's side. The pet is curled up
 * and stiff too, so it sympathises rather than advises. No guilt, no medical
 * claims, no promises about the user's back.
 */

export type PetSay = { line: string; mood: PetMood };

const say = (line: string, mood: PetMood = 'ready'): PetSay => ({ line, mood });

/** Names offered by the "Suggest one" link on the naming screen. */
export const PET_NAME_SUGGESTIONS = [
  'Biscuit',
  'Pebble',
  'Waffles',
  'Dumpling',
  'Truffle',
  'Acorn',
  'Nugget',
  'Mochi',
  'Tank',
  'Clove',
] as const;

/** Naming screen (right after welcome). `{name}` is what the user typed. */
export const PET_NAMING = {
  title: 'Name your armadillo',
  asleep: say('It lives on your home screen. It needs a name.', 'idle'),
  named: say('{name}. Yeah. That feels like me.', 'celebrating'),
  suggest: 'Suggest one',
} as const;

/**
 * Growth preview (right after naming): the user taps through the five stages.
 * Index 0 is stage 1.
 */
export const PET_GROW_PREVIEW = {
  title: 'Every session, {name} uncurls a little',
  chips: ['Today', '1 session', '4', '9', '15'],
  // Read in order, the five lines carry the whole rule: it grows when you finish
  // sessions, and it never shrinks when you miss a day.
  stages: [
    say("This is me now. Curled up tight.", 'stiff'),
    say('Finish one session and I peek out.', 'ready'),
    say('Every session you finish, I grow.', 'celebrating'),
    say('Miss a day? I wait. I never shrink.', 'ready'),
    say('Fifteen sessions and I am all grown.', 'proud'),
  ],
} as const;

/** Screens where the pet presents something and the user just reads. */
export const PET_PRESENTS = {
  founder: say('A quick word from the human who made me.'),
  education: say('Good news first. I like good news.', 'celebrating'),
  proof: say("The serious bit. Read it properly, I'll wait."),
  commitBefore: say("Hold it down. I'll hold on too."),
  commitAfter: say("That's a promise. {name} heard it.", 'celebrating'),
  finalizing: say('Building your plan. {name} is supervising.'),
  match: say("This plan is ours. {name} is ready when you are.", 'celebrating'),
  matchLapsed: say('You came back. I kept your spot.', 'celebrating'),
  matchRetake: say('New answers, new plan. Same me.'),
  /** Shown on the program screen after the paywall is closed without buying. */
  paywallDismissed: say("No rush. {name} isn't going anywhere.", 'concerned'),
  buildingPlan: say('Last pieces. {name} is on it.'),
} as const;

/** Where did you hear about us? Any answer gets the same thanks. */
export const PET_Q0 = {
  prompt: say('Who sent you? I owe them a thank-you.'),
  answered: say('Noted. {name} says thanks.', 'celebrating'),
} as const;

/** Do you believe Remedy can help? Map the screen's options onto these three. */
export const PET_Q9 = {
  prompt: say('Be honest. I can take it.'),
  yes: say('That makes two of us.', 'celebrating'),
  unsure: say('Fair. Let me earn it.'),
  no: say('Honest. I respect that. Watch me anyway.', 'concerned'),
} as const;

/** Which of these sound like you? (multi-select) */
export const PET_RECOGNIZE = {
  prompt: say('Tap anything that sounds familiar.'),
  some: say('Yep. I know that one.', 'concerned'),
  /** Three or more selected. */
  many: say("That's a lot to carry around.", 'concerned'),
} as const;

/** Keyed by MAIN_GOAL_OPTIONS values. */
export const PET_Q6 = {
  prompt: say('What are we working toward?'),
  reactions: {
    reduce_pain: say('Less ouch, more everything else. Got it.'),
    return_to_exercise: say("Back to training. I'll spot you. Sort of.", 'celebrating'),
    sleep: say("A full night's sleep. I'm something of an expert.", 'celebrating'),
    mobility: say('Moving freely. Same goal as me, honestly.'),
  },
} as const;

/** Keyed by PAIN_LOCATION_OPTIONS values. */
export const PET_Q1 = {
  prompt: say('Show me where it gets you.'),
  reactions: {
    upper: say('Up top. Shoulders up by the ears, right?', 'concerned'),
    lower: say('Lower back. The classic.', 'concerned'),
    all: say('All of it. Okay. We start gentle.', 'concerned'),
  },
} as const;

/** Keyed by PAIN_DURATION_OPTIONS ids (not values: several ids share a value). */
export const PET_Q2 = {
  prompt: say('How long has this been going on?'),
  reactions: {
    lt_2w: say('Fresh. Good time to start.'),
    '2w_3m': say('Long enough to be annoying.', 'concerned'),
    '3_12m': say("That's a long time to put up with it.", 'concerned'),
    '1_5y': say("Years. You've been patient enough.", 'concerned'),
    '5y_plus': say('That long? Then we take this seriously.', 'concerned'),
  },
} as const;

/** Keyed by PAIN_TYPE_OPTIONS values (multi-select). */
export const PET_Q3 = {
  prompt: say('What does it feel like?'),
  reactions: {
    stiffness: say('Stiff. Look at me. I get it.', 'stiff'),
    ache: say('The dull, always-there kind. Understood.', 'concerned'),
    sharp: say("Sharp. Then we go carefully.", 'concerned'),
    nerve: say('Travels or tingles. Noted. Gentle it is.', 'concerned'),
  },
} as const;

/** Keyed by ACTIVITY_LEVEL_OPTIONS values. */
export const PET_Q4 = {
  prompt: say('How much do you move in a normal week?'),
  reactions: {
    sedentary: say("Lots of sitting. No judgement, I'm a ball."),
    light: say("A bit of moving. That's a good base."),
    active: say('Strong already. Then we can build.', 'celebrating'),
  },
} as const;

/** Keyed by PAIN_TRIGGER_OPTIONS values (multi-select). */
export const PET_Q5 = {
  prompt: say('What sets it off?'),
  reactions: {
    sitting: say('Chairs. The quiet enemy.', 'concerned'),
    bending: say("Bending and lifting. That's what we practise.", 'concerned'),
    standing: say('On your feet too long. Noted.', 'concerned'),
    morning: say('Mornings. I uncurl slowly too.', 'stiff'),
  },
} as const;

/** Keyed by EQUIPMENT_OPTIONS values. */
export const PET_Q7 = {
  prompt: say('What have you got to work with?'),
  reactions: {
    gym: say('A whole gym. Fancy.', 'celebrating'),
    bands_dumbbells: say('Bands and dumbbells. Plenty.'),
    open_space: say("A bit of floor. That's all I use."),
  },
} as const;

/** Time per day, then days per week. `{n}` is the number of days chosen. */
export const PET_Q8 = {
  prompt: say('How much time can you give this?'),
  minutes: say("That's enough. Really."),
  daysLow: say('{n} days a week. Solid.'),
  daysMid: say('{n} days a week. {name} will be ready.', 'celebrating'),
  daysHigh: say('{n} days. Ambitious. I like it.', 'celebrating'),
} as const;

/**
 * Replace `{name}` and `{n}` in a line. A placeholder is only replaced when its
 * value is passed, so a line can be filled in two steps (the screen fills `{n}`,
 * the speech bubble fills `{name}`). A null or empty name becomes "your armadillo",
 * capitalised when it starts a sentence.
 */
export function fillPetLine(line: string, vars: { name?: string | null; n?: number }): string {
  let out = line;
  if (vars.n !== undefined) out = out.replace(/\{n\}/g, String(vars.n));
  if (vars.name !== undefined) {
    const name = vars.name && vars.name.trim() ? vars.name.trim() : null;
    out = out.replace(/\{name\}/g, (_match, offset: number, whole: string) => {
      if (name) return name;
      const before = whole.slice(0, offset).trimEnd();
      return before === '' || /[.!?]$/.test(before) ? 'Your armadillo' : 'your armadillo';
    });
  }
  return out;
}

/** Said when the pet is tapped. Cycled in order from a random start. */
export const PET_POKE_LINES = [
  'Hey. That tickles.',
  'Boop received.',
  '{name} is busy. Being round.',
  'Careful. Freshly polished shell.',
  'You poked {name}. {name} noticed.',
  'Yes? I am listening. Mostly.',
] as const;

/** Said when a napping pet is tapped awake. */
export const PET_WAKE_LINE = "Mm? I'm up. I'm up.";

/** Said on Home after the pet does its roll. */
export const PET_HOME_TRICK_LINES = [
  'Wheee.',
  'Did you see that? Tell me you saw that.',
  '{name} rolls. It is what {name} does.',
  'Again? Fine. One more.',
  'Nailed the landing.',
  'That was my whole warm-up, by the way.',
] as const;
