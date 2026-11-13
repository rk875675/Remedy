/**
 * What the pet says while it coaches a session. First person, warm, a little
 * cheeky, short. Never medical, never guilt. `{name}` is the pet's name and
 * `{n}` a simple count; pick with pickPetLine (no immediate repeats).
 * The movement cues themselves come from each exercise's own text (lib/petCoach).
 */

/** Used only when an exercise has no usable instruction text. Safe, generic form reminders. */
export const PET_GENERIC_CUES = [
  'Slow and smooth.',
  'Keep breathing.',
  'Stay in the range that feels okay.',
  'No rushing. Smooth is good.',
] as const;

/** The start of the last hold of a set. */
export const PET_LAST_HOLD = [
  'Last hold. I am right here.',
  'One more hold. Stay with it.',
  'Final hold. Breathe through it.',
  'Last one. You have got this.',
  'Last hold of the set. Easy does it.',
] as const;

/** The last 5 seconds of a hold. */
export const PET_COUNTDOWN_END = [
  'Five more seconds. I am counting.',
  'Nearly there. Keep breathing.',
  'Almost. Slow breaths.',
  'Five to go. I will count with you.',
  'Stay with it. Almost done.',
] as const;

/** A set is finished and there is another to come. */
export const PET_SET_DONE = [
  'Set done. Nicely done.',
  'That one counted.',
  'Good set. Shake it out.',
  'Done. I am impressed. Quietly.',
  'One more set down.',
  'Smooth. I liked that one.',
] as const;

/** An exercise is finished and another is coming. */
export const PET_EXERCISE_DONE = [
  'That exercise is done.',
  'Exercise finished. Go you.',
  'Done with that one. Onwards.',
  'Check that off. Nice.',
  'Well done. Next one in a moment.',
] as const;

/** Halfway through the session. */
export const PET_HALFWAY = [
  'Halfway there. Look at us.',
  'Half done. The easy half is a myth.',
  'We are halfway. I am counting.',
  'Halfway. Still smiling?',
  'That is half the session. Nice.',
] as const;

/** The rest before the final exercise. */
export const PET_FINAL_NEXT = [
  'Last exercise next. Almost there.',
  'One more exercise after this.',
  'Final one coming up. Nearly done.',
  'The last one is next. I am proud already.',
  'Last exercise. Then we are done.',
] as const;

/** Taking a break during the rest timer. */
export const PET_REST_BREAK = [
  'Hydrating. You should too.',
  'I did nothing and I am exhausted.',
  'Break time. I brought a towel.',
  'Resting is part of the work. I am very good at it.',
  'Sip, breathe, shake it out.',
  'My water bottle and I have a lot to discuss.',
] as const;

/** The rest is nearly over. */
export const PET_REST_READY = [
  'Ready when you are.',
  'Okay. Back to it.',
  'Rest is nearly done. Coach mode on.',
  'Whistle is back on. Ready?',
  'Here we go again.',
] as const;

/** Tapping the pet mid-workout. */
export const PET_TAP = [
  'Hehe. Eyes on the movement.',
  'I am here. Keep going.',
  'You are doing great. Carry on.',
  'Thumbs up from me.',
  'Focus on you. I will cheer.',
  'Noted. Tapped. Still cheering.',
] as const;

/** The exit prompt is open. No pressure, no guilt. */
export const PET_EXIT = [
  'No pressure. I will be right here.',
  'Take what you need. I am not going anywhere.',
  'Whatever you decide is okay.',
  'You can pick this up again anytime.',
] as const;

/** The session is complete. `{n}` is how many exercises were done. */
export const PET_COMPLETE = [
  '{n} exercises. {name} is so proud of you.',
  'You did that. {name} watched. Thumbs up.',
  '{name} says that was a great session.',
  'All done. {name} is a little emotional.',
  '{n} exercises done. {name} approves, loudly.',
  'Nice work. {name} is doing a tiny dance.',
] as const;
