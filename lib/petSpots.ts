// Where the workout buddy can stand on the session screens, worked out from the
// measured layout. Pure geometry (no React) so it can be checked: every spot's
// pet and bubble stay clear of everything that must never be covered, and he is
// never cut off by the screen edge.

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

export type SpotName = 'floorLeft' | 'floorMid' | 'floorRight' | 'restLeft' | 'restRight';
export type SpotKind = 'floor' | 'rest';

export type BubblePlacement = {
  rect: Rect;
  /** Which edge of the bubble its tail is on, pointing at the pet. */
  tail: 'left' | 'right' | 'bottom';
  /** For a bottom tail: how far along the bubble the pet is (px from its left edge). */
  tailOffset?: number;
};

export type Spot = {
  name: SpotName;
  kind: SpotKind;
  /** Centre x of the pet's box. */
  cx: number;
  /** y of the bottom of the drawn pet. */
  groundY: number;
  /** Distance scale: a little bigger near the viewer. */
  scale: number;
  /** Faces the right-hand side of the screen (towards the centre from a left spot). */
  faceRight: boolean;
  /** The visible drawing (a little inside its box), for keep-clear checks. */
  art: Rect;
  /** Drawn height of the pet at this spot. */
  drawn: number;
  /** Null when no side has room: he stays quiet there. */
  bubble: BubblePlacement | null;
  /** He would stand partly over the instruction caption (allowed, but other spots are preferred). */
  coversCaption: boolean;
};

/** The bubble's estimated size: up to 3 lines at 17 pt, plus padding. */
export const BUBBLE_W = 230;
export const BUBBLE_H = 96;
export const BUBBLE_MIN_W = 170;
export const EDGE = 8;
export const FLOOR_SCALE = 1.12;
/** Smallest box size he is stepped down to before he is left out. */
export const MIN_PET_SIZE = 120;
const SIZE_STEP = 8;
/** Share of the drawing that is actually visible (width), and of its height. */
const ART_W = 0.74;
const ART_H = 0.96;

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function inflate(r: Rect, d: number): Rect {
  return { x: r.x - d, y: r.y - d, w: r.w + 2 * d, h: r.h + 2 * d };
}

function artFor(cx: number, groundY: number, drawn: number): Rect {
  const w = drawn * ART_W;
  const h = drawn * ART_H;
  return { x: cx - w / 2, y: groundY - h, w, h };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function bubbleFits(rect: Rect, screen: Size, clear: Rect[]): boolean {
  return (
    rect.w >= BUBBLE_MIN_W &&
    rect.x >= EDGE &&
    rect.x + rect.w <= screen.w - EDGE &&
    rect.y >= EDGE &&
    rect.y + rect.h <= screen.h - EDGE &&
    !clear.some((c) => rectsIntersect(rect, c))
  );
}

/** The first side of the pet with room for a bubble, the side facing the screen's centre first. */
function placeBubble(
  art: Rect,
  onLeft: boolean,
  screen: Size,
  clear: Rect[],
  /** The lowest the bubble's top may be when it goes above him (to clear a label above). */
  aboveCeiling?: number,
): BubblePlacement | null {
  const right = (): BubblePlacement => {
    const x = art.x + art.w + 6;
    return {
      rect: { x, y: art.y + art.h * 0.06, w: Math.min(BUBBLE_W, screen.w - EDGE - x), h: BUBBLE_H },
      tail: 'left',
    };
  };
  const left = (): BubblePlacement => {
    const w = Math.min(BUBBLE_W, art.x - 6 - EDGE);
    return { rect: { x: art.x - 6 - w, y: art.y + art.h * 0.06, w, h: BUBBLE_H }, tail: 'right' };
  };
  // Beside him but low, level with his feet: clears text that sits level with his head.
  const rightLow = (): BubblePlacement => {
    const p = right();
    return { ...p, rect: { ...p.rect, y: art.y + art.h - BUBBLE_H } };
  };
  const leftLow = (): BubblePlacement => {
    const p = left();
    return { ...p, rect: { ...p.rect, y: art.y + art.h - BUBBLE_H } };
  };
  // Above his head: centred on him if that is clear, else slid along to dodge what is in the way.
  const aboveAt = (pick: 'centre' | 'right' | 'left') => (): BubblePlacement => {
    const centred = art.x + art.w / 2 - BUBBLE_W / 2;
    const x = clamp(
      pick === 'centre' ? centred : pick === 'right' ? screen.w - EDGE - BUBBLE_W : EDGE,
      EDGE,
      screen.w - EDGE - BUBBLE_W,
    );
    return {
      rect: { x, y: Math.min(art.y - 14 - BUBBLE_H, aboveCeiling ?? Infinity), w: BUBBLE_W, h: BUBBLE_H },
      tail: 'bottom',
      tailOffset: clamp(art.x + art.w / 2 - x, 18, BUBBLE_W - 18),
    };
  };
  const order = onLeft
    ? [right, rightLow, aboveAt('centre'), aboveAt('right'), aboveAt('left'), left, leftLow]
    : [left, leftLow, aboveAt('centre'), aboveAt('left'), aboveAt('right'), right, rightLow];
  for (const make of order) {
    const placement = make();
    if (bubbleFits(placement.rect, screen, clear)) return placement;
  }
  return null;
}

type Common = {
  screen: Size;
  /** The pet's box size on this phone. */
  size: number;
  /** petScale for the standing poses at this stage. */
  standScale: number;
};

export type ExerciseSpotInput = Common & {
  /** The whole video. */
  video: Rect;
  /** The whole top bar: exit, 'n / N' counter, Skip and the progress bar. */
  topBar: Rect;
  /** Name, set counter and hold countdown. */
  infoText: Rect | null;
  /** The instruction caption. */
  caption: Rect | null;
  /** The primary button's strip along the bottom. */
  button: Rect;
};

/**
 * What must never be covered on the exercise screen. The pet's body keeps clear
 * of the whole video, the whole top bar, the buttons, and the name, set counter
 * and countdown. The caption is only hard keep-clear for his bubble: he may
 * stand partly over it when there is no better spot.
 */
export function exerciseClearRects(
  input: Pick<ExerciseSpotInput, 'video' | 'topBar' | 'infoText' | 'caption' | 'button'>,
): { art: Rect[]; bubble: Rect[]; caption: Rect | null } {
  const { video, topBar, infoText, caption, button } = input;
  const art = [video, topBar, button, ...(infoText ? [inflate(infoText, 4)] : [])];
  const captionRect = caption ? inflate(caption, 4) : null;
  return { art, bubble: [...art, ...(captionRect ? [captionRect] : [])], caption: captionRect };
}
/**
 * The spots on the exercise screen: standing on the 'floor' just above the
 * button, left, middle or right. A spot that cannot keep clear (or would be cut
 * off) is simply left out.
 */
export function exerciseSpots(input: ExerciseSpotInput): Spot[] {
  const { screen, size, standScale, button } = input;
  const clear = exerciseClearRects(input);
  const drawn = size * FLOOR_SCALE * standScale;
  const half = (drawn * ART_W) / 2;
  const groundY = button.y - 6;
  const spots: Spot[] = [];
  const candidates: Array<{ name: SpotName; cx: number; faceRight: boolean; onLeft: boolean }> = [
    { name: 'floorLeft', cx: 6 + half, faceRight: true, onLeft: true },
    { name: 'floorMid', cx: screen.w / 2, faceRight: true, onLeft: false },
    { name: 'floorRight', cx: screen.w - 6 - half, faceRight: false, onLeft: false },
  ];
  for (const c of candidates) {
    const art = artFor(c.cx, groundY, drawn);
    if (art.y < 0 || art.y + art.h > screen.h || art.x < 2 || art.x + art.w > screen.w - 2) continue;
    if (clear.art.some((r) => rectsIntersect(art, r))) continue;
    spots.push({
      name: c.name,
      kind: 'floor',
      cx: c.cx,
      groundY,
      scale: FLOOR_SCALE,
      faceRight: c.faceRight,
      art,
      drawn,
      bubble: placeBubble(art, c.onLeft, screen, clear.bubble),
      coversCaption: clear.caption !== null && rectsIntersect(art, clear.caption),
    });
  }
  return spots;
}

export type RestSpotInput = Common & {
  /** The depleting ring, whose middle holds the countdown. */
  ring: Rect;
  exit: Rect;
  /** The Skip Rest button. */
  skip: Rect;
};

export function restClearRects(input: Pick<RestSpotInput, 'ring' | 'exit' | 'skip'>): {
  art: Rect[];
  bubble: Rect[];
  label: Rect;
} {
  const { ring, exit, skip } = input;
  const digits: Rect = {
    x: ring.x + ring.w / 2 - 70,
    y: ring.y + ring.h / 2 - 50,
    w: 140,
    h: 100,
  };
  // The 'Rest' label above the ring: only his bubble keeps clear of it.
  const label: Rect = { x: ring.x + ring.w / 2 - 50, y: ring.y - 42, w: 100, h: 24 };
  return { art: [exit, skip, digits], bubble: [exit, skip, digits, label], label };
}

/** Rest: standing in front of the ring's outer edge, either side, never over the digits. */
export function restSpots(input: RestSpotInput): Spot[] {
  const { screen, size, standScale, ring } = input;
  const clear = restClearRects(input);
  const drawn = size * standScale;
  const half = (drawn * ART_W) / 2;
  const groundY = ring.y + ring.h * 0.97;
  const spots: Spot[] = [];
  const candidates: Array<{ name: SpotName; cx: number; faceRight: boolean; onLeft: boolean }> = [
    { name: 'restLeft', cx: ring.x + 30 - half, faceRight: true, onLeft: true },
    { name: 'restRight', cx: ring.x + ring.w - 30 + half, faceRight: false, onLeft: false },
  ];
  for (const c of candidates) {
    const art = artFor(c.cx, groundY, drawn);
    // Never cut off by the bezel.
    if (art.y < 0 || art.y + art.h > screen.h || art.x < 2 || art.x + art.w > screen.w - 2) continue;
    if (clear.art.some((r) => rectsIntersect(art, r))) continue;
    spots.push({
      name: c.name,
      kind: 'rest',
      cx: c.cx,
      groundY,
      scale: 1,
      faceRight: c.faceRight,
      art,
      drawn,
      bubble: placeBubble(art, c.onLeft, screen, clear.bubble, clear.label.y - 6 - BUBBLE_H),
      coversCaption: false,
    });
  }
  return spots;
}

/**
 * The largest size, stepping down from `input.size` to MIN_PET_SIZE, at which
 * at least one spot exists. Empty (and the given size) when none does.
 */
export function fitSpots<T extends Common>(
  input: T,
  make: (input: T) => Spot[],
): { spots: Spot[]; size: number } {
  for (let size = input.size; size >= MIN_PET_SIZE; size -= SIZE_STEP) {
    const spots = make({ ...input, size });
    if (spots.length > 0) return { spots, size };
  }
  return { spots: [], size: input.size };
}

/**
 * A different spot from where he is and from where he was before that. Falls
 * back to any other spot; null when there is only one. Spots clear of the
 * caption are preferred when any exists.
 */
export function nextSpot(
  spots: readonly Spot[],
  currentName: SpotName | null,
  lastName: SpotName | null,
  rand: () => number = Math.random,
): Spot | null {
  let pool = spots.filter((s) => s.name !== currentName && s.name !== lastName);
  if (pool.length === 0) pool = spots.filter((s) => s.name !== currentName);
  const clean = pool.filter((s) => !s.coversCaption);
  if (clean.length > 0) pool = clean;
  return pool[Math.floor(rand() * pool.length)] ?? null;
}
