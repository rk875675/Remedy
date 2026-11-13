// The pet's temper: when it sleeps, and how much poking it puts up with.
// Pure logic, no React, so scripts/verify_pet.ts can check it.

export type SleepReason = 'night' | 'early' | 'nap';

/** Night: 22:00 up to (not including) 05:00. */
export const NIGHT_START_HOUR = 22;
export const NIGHT_END_HOUR = 5;
/** Early morning: 05:00 up to (not including) 07:00. */
export const EARLY_END_HOUR = 7;
/** Afternoon nap window: 13:00 up to (not including) 15:30, on some days only. */
export const NAP_START_MINUTE = 13 * 60;
export const NAP_END_MINUTE = 15 * 60 + 30;
/** Roughly this share of days include a nap. */
export const NAP_DAY_PERCENT = 45;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** Same answer all day for the same pet; roughly NAP_DAY_PERCENT of days are nap days. */
export function isNapDay(now: Date, seed: string): boolean {
  return hash(`${dayKey(now)}|${seed}`) % 100 < NAP_DAY_PERCENT;
}

/** Why the pet is asleep right now, or null when it is up. Uses the local clock. */
export function petSleepReason(now: Date, seed: string): SleepReason | null {
  const hour = now.getHours();
  if (hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR) return 'night';
  if (hour < EARLY_END_HOUR) return 'early';
  const minute = hour * 60 + now.getMinutes();
  if (minute >= NAP_START_MINUTE && minute < NAP_END_MINUTE && isNapDay(now, seed)) return 'nap';
  return null;
}

export type PatienceVerdict = 'fine' | 'warn' | 'snap';

/** This many taps inside WARN_WINDOW_MS earns one warning. */
export const WARN_TAPS = 4;
export const WARN_WINDOW_MS = 2500;
/** After a warning, this many taps inside SNAP_WINDOW_MS is too many. */
export const SNAP_TAPS = 7;
export const SNAP_WINDOW_MS = 5000;
/** A pause this long between two taps is calm: the count starts over. */
export const CALM_GAP_MS = 2500;

export type Patience = {
  tap: (nowMs: number) => PatienceVerdict;
  reset: () => void;
};

export function createPatience(): Patience {
  let taps: number[] = [];
  let warned = false;

  return {
    tap(nowMs) {
      const last = taps[taps.length - 1];
      if (last !== undefined && nowMs - last >= CALM_GAP_MS) {
        taps = [];
        warned = false;
      }
      taps.push(nowMs);
      taps = taps.filter((t) => nowMs - t <= SNAP_WINDOW_MS);
      if (warned && taps.length >= SNAP_TAPS) {
        taps = [];
        warned = false;
        return 'snap';
      }
      const recent = taps.filter((t) => nowMs - t <= WARN_WINDOW_MS).length;
      if (!warned && recent >= WARN_TAPS) {
        warned = true;
        return 'warn';
      }
      return 'fine';
    },
    reset() {
      taps = [];
      warned = false;
    },
  };
}

// The ladder: warn, then angry, then storm off. Pure, so it can be checked.
// Rung 1 (warn) and rung 2 (angry) come from `createPatience`; this adds what
// happens while it is angry.

/** Angry stays at least this long after the last tap. */
export const ANGRY_HOLD_MS = 12000;
/** While angry, this many taps in one run of spamming sends it off. */
export const STORM_TAPS = 8;
/** Or this long of continued tapping (at least STORM_MIN_TAPS taps). */
export const STORM_STREAK_MS = 5000;
export const STORM_MIN_TAPS = 3;
/** Taps further apart than this are not one run of spamming. */
export const STREAK_GAP_MS = 1500;

export type Ladder = {
  phase: 'calm' | 'angry';
  angrySince: number;
  lastTapAt: number;
  streakStart: number;
  streakTaps: number;
};
export type LadderAction = 'none' | 'warn' | 'angry' | 'storm' | 'soften';
export type LadderStep = { state: Ladder; action: LadderAction };

export function createLadder(): Ladder {
  return { phase: 'calm', angrySince: 0, lastTapAt: 0, streakStart: 0, streakTaps: 0 };
}

/** A tap. `verdict` is what the patience counter said (only used while calm). */
export function ladderTap(state: Ladder, now: number, verdict: PatienceVerdict): LadderStep {
  if (state.phase === 'calm') {
    if (verdict === 'snap') {
      return {
        state: { phase: 'angry', angrySince: now, lastTapAt: now, streakStart: now, streakTaps: 0 },
        action: 'angry',
      };
    }
    return { state: { ...state, lastTapAt: now }, action: verdict === 'warn' ? 'warn' : 'none' };
  }
  const continuing = state.streakTaps > 0 && now - state.lastTapAt <= STREAK_GAP_MS;
  const streakStart = continuing ? state.streakStart : now;
  const streakTaps = (continuing ? state.streakTaps : 0) + 1;
  if (
    streakTaps >= STORM_TAPS ||
    (streakTaps >= STORM_MIN_TAPS && now - streakStart >= STORM_STREAK_MS)
  ) {
    return { state: createLadder(), action: 'storm' };
  }
  return { state: { ...state, lastTapAt: now, streakStart, streakTaps }, action: 'none' };
}

/** Time passing: angry softens once it has been left alone long enough. */
export function ladderTick(state: Ladder, now: number): LadderStep {
  if (state.phase === 'angry' && now - state.lastTapAt >= ANGRY_HOLD_MS) {
    return { state: createLadder(), action: 'soften' };
  }
  return { state, action: 'none' };
}
