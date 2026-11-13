import { useEffect, useMemo, useState } from 'react';
import type { PetMood } from '../../constants/petImages';

/**
 * The one place a pet's face (mood drawing) is changed on a screen.
 *
 * Every change is a squash-swap, so a face is a deliberate event: once a face
 * other than the baseline (null) is shown it is held for at least
 * MIN_FACE_HOLD_MS, and no two changes land closer than FACE_SWAP_GAP_MS.
 * A request that comes too soon is deferred to the first allowed moment
 * (the latest request wins), never dropped into a flicker. `force` is for the
 * start of an emotional state, which owns the face. `auto` returns to the
 * baseline when the hold ends. Timers are cancelled on unmount.
 */
export const MIN_FACE_HOLD_MS = 2500;
export const FACE_SWAP_GAP_MS = 400;

export type FaceRequest = {
  /** How long to hold at least (ms). Default MIN_FACE_HOLD_MS. */
  hold?: number;
  /** Go back to the baseline when the hold ends. */
  auto?: boolean;
  /** Change now, whatever is being held. */
  force?: boolean;
};

export type PetFaceControl = {
  /** The face being shown over the baseline, or null for the baseline. */
  face: PetMood | null;
  /** Same, but readable from timers without a re-render. */
  current: () => PetMood | null;
  request: (mood: PetMood | null, opts?: FaceRequest) => void;
};

type Pending = { mood: PetMood | null; hold: number; auto: boolean };

export function usePetFace(): PetFaceControl {
  const [face, setFace] = useState<PetMood | null>(null);

  const control = useMemo(() => {
    const s = {
      mood: null as PetMood | null,
      heldUntil: 0,
      changedAt: 0,
      pending: null as Pending | null,
      timer: null as ReturnType<typeof setTimeout> | null,
      alive: true,
    };

    const clearTimer = () => {
      if (s.timer) clearTimeout(s.timer);
      s.timer = null;
      s.pending = null;
    };

    const schedule = (pending: Pending, at: number) => {
      clearTimer();
      s.pending = pending;
      s.timer = setTimeout(
        () => {
          const next = s.pending;
          s.timer = null;
          s.pending = null;
          if (s.alive && next) commit(next.mood, next.hold, next.auto);
        },
        Math.max(0, at - Date.now()),
      );
    };

    const commit = (mood: PetMood | null, hold: number, auto: boolean) => {
      clearTimer();
      const now = Date.now();
      s.mood = mood;
      s.changedAt = now;
      s.heldUntil = mood === null ? 0 : now + Math.max(hold, MIN_FACE_HOLD_MS);
      setFace(mood);
      if (mood !== null && auto) schedule({ mood: null, hold: 0, auto: false }, s.heldUntil);
    };

    const request = (mood: PetMood | null, opts: FaceRequest = {}) => {
      if (!s.alive) return;
      const hold = opts.hold ?? MIN_FACE_HOLD_MS;
      const auto = opts.auto ?? false;
      const now = Date.now();
      if (opts.force) {
        commit(mood, hold, auto);
        return;
      }
      if (s.mood === mood) {
        // Already showing it: only the hold changes.
        if (mood === null) {
          clearTimer();
        } else {
          s.heldUntil = Math.max(s.heldUntil, now + hold);
          if (auto) schedule({ mood: null, hold: 0, auto: false }, s.heldUntil);
          else clearTimer();
        }
        return;
      }
      const earliest = Math.max(s.mood !== null ? s.heldUntil : 0, s.changedAt + FACE_SWAP_GAP_MS);
      if (now >= earliest) commit(mood, hold, auto);
      else schedule({ mood, hold, auto }, earliest);
    };

    return {
      current: () => s.mood,
      request,
      stop: () => {
        s.alive = false;
        clearTimer();
      },
      start: () => {
        s.alive = true;
      },
    };
  }, []);

  useEffect(() => {
    control.start();
    return control.stop;
  }, [control]);

  return useMemo(
    () => ({ face, current: control.current, request: control.request }),
    [face, control],
  );
}
