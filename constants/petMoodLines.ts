import { fillPetLine } from './petOnboardingLines';

/**
 * What the pet says when it has feelings. First person, short, a little cheeky,
 * never guilt, never medical. `{name}` is filled by pickPetLine.
 */

/** Night tap 1: asleep, mumbling. */
export const PET_SLEEP_MUMBLE = [
  'Mmf.',
  'Not now. Dreaming.',
  'Zzz... pancakes...',
  'Shh. Shell is closed.',
  'Mm. Ten more minutes.',
  'Whoever that is. No.',
] as const;

/** Night tap 2: half awake. */
export const PET_SLEEP_HALF = [
  'Is it morning? Say no.',
  'I can feel you poking. Rude.',
  'One eye open. That is all you get.',
  'Mmh. What do you want.',
  'I was winning a race.',
] as const;

/** Night: finally up, grumpy. */
export const PET_NIGHT_UP = [
  'Fine. I am up. Happy?',
  'This better be important.',
  'Up. Awake. Unimpressed.',
  'Okay. Hello. Why.',
  'I was mid-dream. It was good.',
] as const;

/** Early morning taps while it sleeps. */
export const PET_EARLY_MORNING = [
  'It is early. Even the sun is stretching.',
  'Mornings are for curling up.',
  'Five more minutes of dark. Please.',
  'Too early. Shh.',
  'The day can wait. I am.',
  'Shell closed until breakfast.',
] as const;

/** Afternoon nap: the first tap, and every "five more minutes" after. */
export const PET_NAP_FIVE_MORE = [
  'Five more minutes.',
  'Five more minutes. Ten, tops.',
  'Still five more minutes. It resets.',
  'I said five more minutes. Both times.',
] as const;

/** Afternoon nap: funny refusals. */
export const PET_NAP_REFUSE = [
  'Lunch is still settling. Come back.',
  'Not asleep. Resting my eyes. Loudly.',
  'Napping is a skill. I am gifted.',
  'Your poking is in my dream now.',
  'Tell my schedule I am busy.',
  'This nap is load-bearing.',
  'Go away. Lovingly.',
  'I earned this nap. Probably.',
] as const;

/** Afternoon nap: the one tap where it curls up to block you out. */
export const PET_NAP_BALL = [
  'Ball mode. Do not disturb.',
  'Cannot hear you. Too round.',
  'Closed for napping.',
] as const;

/** Afternoon nap: finally gets up, dramatically. */
export const PET_NAP_UP = [
  'Fine. FINE. I am awake.',
  'Wow. Ruined it. There were snacks in that dream.',
  'Up. Awake. Deeply offended.',
] as const;

/** Right after being woken, still scowling. */
export const PET_WOKEN_GRUMPY = [
  'I was RESTING.',
  'Do not talk to me yet.',
  'Give me a second to be mad.',
  'Mornings are a scam.',
  'I need a moment. And a snack.',
  'Fine. But I am keeping this face.',
] as const;

/** First warning: too many taps. */
export const PET_WARN = [
  'Hey. Personal space.',
  'Easy. I am not a button.',
  'Okay, that is a lot of poking.',
  'Gentle. I have feelings. And a shell.',
  'One more and I am rolling away.',
  'Slow down. Hands.',
] as const;

/** The snap. */
export const PET_ANGRY = [
  'That is it.',
  'I am NOT amused.',
  'Enough! I mean it.',
  'I am a pet, not a bongo.',
  'Rude. Just rude.',
  'Done. We are done.',
] as const;

/** Storming off. */
export const PET_STORM_OFF = [
  'Fine. I am leaving.',
  'Going for a roll. Alone.',
  'Do not follow me.',
  'Bye. Do not wait up.',
  'Out of my way. Rolling through.',
] as const;

/** Hiding in the ball. Ignoring IS the joke, so these are used sparingly. */
export const PET_IGNORING = [
  'Nobody is home.',
  'Leave a message.',
  'The ball is closed.',
  'Shh. Cannot hear you.',
  'La la la.',
  'Out of order.',
] as const;

/** A bubble from off screen while it is gone. */
export const PET_GONE_BUBBLE = ['...', '...hmph.', '... still mad.', '... rolling. Mad.'] as const;

/** Coming back, making up. */
export const PET_COMING_BACK = [
  'Okay. I am back. Do not do that again.',
  'I missed this spot. Not you. The spot.',
  'Fine. You are forgiven. Barely.',
  'I am over it. Mostly.',
  'Truce? Truce.',
  'That was a lot. Let us start over.',
] as const;

/** Hurt feelings, after being angry. */
export const PET_SAD = [
  'That hurt my feelings.',
  'I thought we were friends.',
  'It is fine. I am fine. Sniff.',
  'I will just sit here.',
  'Poke poke poke. Is that all I am?',
] as const;

/** Cheered up by a gentle tap. */
export const PET_FORGIVEN = [
  'Okay. Okay. I feel better.',
  'Thank you. I needed that.',
  'Aww. Fine. We are good.',
  'I forgive you. Slowly.',
  'A hug would have been nicer. This works.',
] as const;

/** Calm single taps. */
export const PET_HAPPY = [
  'Hehe. Again.',
  'That is the spot.',
  'Okay, that was nice.',
  'You are my favourite human. Do not tell the others.',
  'Warm hands. Good hands.',
  'I am doing great. How are you?',
  '{name} approves.',
  'Small tap. Big smile.',
] as const;

/** After a startled hop. */
export const PET_STARTLED = [
  'Whoa. Okay. I am fine.',
  'Do not sneak up on a ball.',
  'I was not scared. I was surprised. Different.',
  'My heart. Where is it. There it is.',
] as const;

/** After looking around. */
export const PET_CURIOUS = [
  'Did someone say snacks?',
  'Thought I heard something. Just you.',
  'Who is there? Oh. You.',
  'Nothing. Just checking.',
] as const;

/** Reading the book, now and then. */
export const PET_READING = [
  'It reads better this way.',
  'Chapter three. No idea what is happening.',
  'Do not tell me how it ends.',
  'The plot is thickening. Or the book is upside down.',
  'One more page. I said that ten pages ago.',
  'The armadillo did it. I think.',
] as const;

/** First tap while reading. */
export const PET_READING_LOOKUP = [
  'I am at a good part.',
  'Mm? Hold on. Good part.',
  'Shh. The butler is about to speak.',
  'Yes? Quickly. I have a page to turn.',
] as const;

/** Second tap: the book goes away. */
export const PET_READING_AWAY = [
  'Fine. Bookmark. Bookmark.',
  'Okay. Book away. I am all yours.',
  'I will finish it later. Probably.',
  'Closing it. Dramatically.',
] as const;

/** Holding a stretch, now and then. */
export const PET_STRETCHING = [
  'Reach. Hold. Do not pull anything.',
  'Ahhh. That is the good one.',
  'Arms up. Mind clear. Nearly.',
  'I am as tall as I get.',
  'Hold it. Count to five. I lost count.',
  'Look how long I am.',
] as const;

/** A tap ends the stretch. */
export const PET_STRETCH_STOP = [
  'Okay, okay. Stretch over.',
  'Mid-stretch. Rude. Fine.',
  'And release.',
  'That was a good one. Hi.',
] as const;

const lastPicked = new Map<readonly string[], string>();

/**
 * A random line from the group that is never the one it just returned, with
 * `{name}` filled in. (A fixed rotation would always start from the same line.)
 */
export function pickPetLine(group: readonly string[], name?: string | null): string {
  const last = lastPicked.get(group);
  const options = group.length > 1 ? group.filter((line) => line !== last) : group;
  const line = options[Math.floor(Math.random() * options.length)] ?? group[0] ?? '';
  lastPicked.set(group, line);
  return fillPetLine(line, { name: name ?? null });
}
