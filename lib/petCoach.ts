// What the pet coaches in a session, as pure logic (no React) so it can be checked.
// Cues come from the exercise's own text; nothing here is invented advice.

import { PET_GENERIC_CUES } from '../constants/petSessionLines';

/** A cue longer than this is split at a dash or comma, or dropped. */
export const MAX_CUE_CHARS = 70;
export const MIN_CUE_CHARS = 6;
export const MAX_CUES = 4;
/** A non-critical line waits this long after the last one. */
export const LINE_GAP_MS = 6000;
/** Even the well-timed lines leave the bubble up this long. */
export const CRITICAL_LINE_GAP_MS = 2000;
/** A fresh cue every this often while an exercise runs. */
export const CUE_EVERY_MS = 13500;

function tidy(part: string): string {
  const trimmed = part.replace(/\s+/g, ' ').trim().replace(/^[\s\-\u2013\u2014,]+/, '');
  if (trimmed.length === 0) return '';
  const capped = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

/** One sentence or step, cut down to fit; empty array when it cannot be made to fit. */
function fitCue(part: string): string[] {
  const whole = tidy(part);
  if (whole.length === 0) return [];
  if (whole.length <= MAX_CUE_CHARS) return whole.length >= MIN_CUE_CHARS ? [whole] : [];
  const pieces = whole
    .split(/\s[\u2013\u2014-]\s|,\s/)
    .map(tidy)
    .filter((p) => p.length >= MIN_CUE_CHARS && p.length <= MAX_CUE_CHARS);
  return pieces;
}

/** Split free text into short cue lines: sentences and steps, trimmed, capped. */
export function splitCues(text: string | null | undefined): string[] {
  if (!text) return [];
  const parts = text.match(/[^.!?;\n]+[.!?]?/g) ?? [];
  const seen = new Set<string>();
  const cues: string[] = [];
  for (const part of parts) {
    for (const cue of fitCue(part)) {
      const key = cue.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cues.push(cue);
      if (cues.length >= MAX_CUES) return cues;
    }
  }
  return cues;
}

/**
 * 2-4 cue lines for an exercise, from its instructions, else its description,
 * else a few generic form reminders.
 */
export function exerciseCues(
  instructions: string | null | undefined,
  description: string | null | undefined,
): string[] {
  const fromInstructions = splitCues(instructions);
  if (fromInstructions.length > 0) return fromInstructions;
  const fromDescription = splitCues(description).slice(0, 3);
  if (fromDescription.length > 0) return fromDescription;
  return [...PET_GENERIC_CUES];
}

/** What the pet remembers across the exercise and rest screens of one session. */
export type CoachMemory = {
  /** The exercise whose intro cue has been given. */
  introduced: string | null;
  /** Next cue to give, counted across sets of the same exercise. */
  cueIndex: number;
  /** When the last bubble went up (ms). */
  lastLineAt: number;
};

export function createCoachMemory(): CoachMemory {
  return { introduced: null, cueIndex: 0, lastLineAt: 0 };
}

/** Next cue, cycling. Advances the memory. */
export function takeCue(memory: CoachMemory, cues: readonly string[]): string {
  const cue = cues[memory.cueIndex % Math.max(1, cues.length)] ?? '';
  memory.cueIndex += 1;
  return cue;
}

/** One bubble at a time, and not too often. `critical` lines are the well-timed ones. */
export function lineAllowed(now: number, lastLineAt: number, critical: boolean): boolean {
  return now - lastLineAt >= (critical ? CRITICAL_LINE_GAP_MS : LINE_GAP_MS);
}

export type HoldMoment = 'last-hold' | 'last-seconds' | 'halfway' | null;

/**
 * A natural point inside a timed hold. `countdown` is the seconds left in the
 * current hold, `holdRep` which hold of `holdReps` this is.
 */
export function holdMoment(
  countdown: number,
  holdSeconds: number,
  holdRep: number,
  holdReps: number,
): HoldMoment {
  if (holdSeconds <= 0 || countdown <= 0) return null;
  if (holdReps > 1 && holdRep === holdReps && countdown === holdSeconds) return 'last-hold';
  if (holdSeconds >= 8 && countdown === 5) return 'last-seconds';
  if (holdSeconds >= 20 && countdown === Math.floor(holdSeconds / 2)) return 'halfway';
  return null;
}

/** True once the exercise that just finished (0-based) takes the session to its halfway mark. */
export function isHalfway(finishedIndex: number, count: number): boolean {
  return count >= 4 && finishedIndex + 1 === Math.ceil(count / 2);
}

/** True when the exercise after the one that just finished is the last one. */
export function nextIsFinal(finishedIndex: number, count: number): boolean {
  return count >= 2 && finishedIndex + 1 === count - 1;
}
