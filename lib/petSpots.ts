// Where the workout buddy can stand on the session screens, worked out from the
// measured layout. Pure geometry (no React) so it can be checked: every spot's
// pet and bubble stay clear of the things that must never be covered.

export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

export type SpotName =
  | 'videoTopLeft'
  | 'videoTopRight'
  | 'floorLeft'
  | 'floorRight'
  | 'sideLeft'
  | 'sideRight'
  | 'restLeft'
  | 'restRight';
export type SpotKind = 'perch' | 'floor' | 'side' | 'rest';

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
  /** y of the bottom of the drawn pet (a perched pet's legs hang below the seat line). */
  groundY: number;
  /** Distance scale: a little bigger near the viewer, smaller up on the video. */
  scale: number;
  /** Faces the right-hand side of the screen (towards the centre from a left spot). */
  faceRight: boolean;
  /** The visible drawing (a little inside its box), for keep-clear checks. */
  art: Rect;
  /** Drawn height of the pet at this spot. */
  drawn: number;
  /** A seated perch drawing (stage 3 and up): the seat line is above the bottom. */
  sits: boolean;
  /** Null when no side has room: he stays quiet there. */
  bubble: BubblePlacement | null;
};

export const BUBBLE_W = 200;
export const BUBBLE_H = 76;
export const BUBBLE_MIN_W = 140;
export const EDGE = 8;
/** The bottom share of a perch drawing that hangs below the seat line. */
export const PERCH_SEAT_DROP = 0.18;
/** Only the top share of the video may be covered (legs dangling over the edge). */
export const VIDEO_PERCH_FRAC = 0.14;
export const PERCH_SCALE = 0.92;
export const FLOOR_SCALE = 1.12;
export const SIDE_SCALE = 1.0;
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
function placeBubble(art: Rect, onLeft: boolean, screen: Size, clear: Rect[]): BubblePlacement | null {
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
  // Above his head: centred on him if that is clear, else slid along to dodge what is in the way.
  const aboveAt = (pick: 'centre' | 'right' | 'left') => (): BubblePlacement => {
    const centred = art.x + art.w / 2 - BUBBLE_W / 2;
    const x = clamp(
      pick === 'centre' ? centred : pick === 'right' ? screen.w - EDGE - BUBBLE_W : EDGE,
      EDGE,
      screen.w - EDGE - BUBBLE_W,
    );
    return {
      rect: { x, y: art.y - 14 - BUBBLE_H, w: BUBBLE_W, h: BUBBLE_H },
      tail: 'bottom',
      tailOffset: clamp(art.x + art.w / 2 - x, 18, BUBBLE_W - 18),
    };
  };
  const order = onLeft
    ? [right, aboveAt('centre'), aboveAt('right'), aboveAt('left'), left]
    : [left, aboveAt('centre'), aboveAt('left'), aboveAt('right'), right];
  for (const make of order) {
    const placement = make();
    if (bubbleFits(placement.rect, screen, clear)) return placement;
  }
  return null;
}

/** How much of the art is on screen (0-1), sideways. */
function visibleShare(art: Rect, screen: Size): number {
  const left = Math.max(0, art.x);
  const right = Math.min(screen.w, art.x + art.w);
  return Math.max(0, right - left) / art.w;
}

type Common = {
  screen: Size;
  /** The pet's box size on this phone. */
  size: number;
  /** petScale for the standing poses and for the perch pose at this stage. */
  standScale: number;
  perchScale: number;
  /** Stage 3 and up have the seated perch drawing; earlier stages simply rest on the edge. */
  perchSits: boolean;
};

export type ExerciseSpotInput = Common & {
  video: Rect;
  topBar: Rect;
  /** Name, set counter and hold countdown. */
  infoText: Rect | null;
  /** The primary button's strip along the bottom. */
  button: Rect;
};

/** The exit control, the Skip button, and what must stay clear of the pet and of his bubble. */
export function exerciseClearRects(input: Pick<ExerciseSpotInput, 'video' | 'topBar' | 'infoText' | 'button'>): {
  exit: Rect;
  skip: Rect;
  videoLower: Rect;
  /** Never covered by the pet. */
  art: Rect[];
  /** Never covered by the bubble (Skip is only a secondary control, and a bubble does not take touches). */
  bubble: Rect[];
} {
  const { video, topBar, infoText, button } = input;
  const exit: Rect = { x: topBar.x + 16, y: topBar.y + 10, w: 36, h: 36 };
  const skip: Rect = { x: topBar.x + topBar.w - 16 - 72, y: topBar.y + 10, w: 72, h: 36 };
  const videoLower: Rect = {
    x: video.x,
    y: video.y + VIDEO_PERCH_FRAC * video.h,
    w: video.w,
    h: video.h * (1 - VIDEO_PERCH_FRAC),
  };
  const bubble = [exit, button, videoLower, ...(infoText ? [inflate(infoText, 4)] : [])];
  return { exit, skip, videoLower, art: [...bubble, skip], bubble };
}

/**
 * The spots on the exercise screen: perched on the video's top edge (legs over
 * the top ~14% of the picture), standing near the bottom above the button, and
 * leaning in from a side edge. A spot that cannot keep clear is simply left out.
 */
export function exerciseSpots(input: ExerciseSpotInput): Spot[] {
  const { screen, size, standScale, perchScale, perchSits, video, button } = input;
  const clear = exerciseClearRects(input);
  const spots: Spot[] = [];

  const add = (
    name: SpotName,
    kind: SpotKind,
    cx: number,
    groundY: number,
    scale: number,
    faceRight: boolean,
    drawn: number,
    sits: boolean,
    onLeft: boolean,
  ) => {
    const art = artFor(cx, groundY, drawn);
    const top = art.y >= 0 && art.y + art.h <= screen.h;
    if (!top) return;
    if (kind === 'side' ? visibleShare(art, screen) < 0.6 : art.x < 2 || art.x + art.w > screen.w - 2) return;
    if (clear.art.some((c) => rectsIntersect(art, c))) return;
    spots.push({
      name,
      kind,
      cx,
      groundY,
      scale,
      faceRight,
      art,
      drawn,
      sits,
      bubble: placeBubble(art, onLeft, screen, clear.bubble),
    });
  };

  // Perched on the video's top edge. Smaller, because he is further up; and never so tall that his head leaves the screen.
  const perchRoom = (video.y - 6) / (perchSits ? 1 - PERCH_SEAT_DROP : 1);
  const perchScaleNow = Math.min(PERCH_SCALE, perchRoom / (size * perchScale));
  if (perchScaleNow >= 0.5) {
    const drawn = size * perchScaleNow * perchScale;
    const groundY = video.y + (perchSits ? PERCH_SEAT_DROP * drawn : 0);
    const half = (drawn * ART_W) / 2;
    add('videoTopLeft', 'perch', clear.exit.x + clear.exit.w + 6 + half, groundY, perchScaleNow, true, drawn, perchSits, true);
    add('videoTopRight', 'perch', clear.skip.x - 6 - half, groundY, perchScaleNow, false, drawn, perchSits, false);
  }

  // Standing on the 'floor': near the viewer, so a little bigger.
  const floorDrawn = size * FLOOR_SCALE * standScale;
  const floorY = button.y - 6;
  const floorHalf = (floorDrawn * ART_W) / 2;
  add('floorLeft', 'floor', 4 + floorHalf, floorY, FLOOR_SCALE, true, floorDrawn, false, true);
  add('floorRight', 'floor', screen.w - 4 - floorHalf, floorY, FLOOR_SCALE, false, floorDrawn, false, false);

  // Leaning in from the side edge, part of him cut off by the bezel.
  const sideDrawn = size * SIDE_SCALE * standScale;
  const sideW = sideDrawn * ART_W;
  const sideY = (video.y + video.h + button.y) / 2 + (sideDrawn * ART_H) / 2;
  add('sideLeft', 'side', -0.3 * sideW + sideW / 2, sideY, SIDE_SCALE, true, sideDrawn, false, true);
  add('sideRight', 'side', screen.w - 0.7 * sideW + sideW / 2, sideY, SIDE_SCALE, false, sideDrawn, false, false);

  return spots;
}

export type RestSpotInput = Common & {
  /** The depleting ring, whose middle holds the countdown. */
  ring: Rect;
  exit: Rect;
  /** The Skip Rest button. */
  skip: Rect;
};

export function restClearRects(input: Pick<RestSpotInput, 'ring' | 'exit' | 'skip'>): Rect[] {
  const { ring, exit, skip } = input;
  const digits: Rect = {
    x: ring.x + ring.w / 2 - 70,
    y: ring.y + ring.h / 2 - 50,
    w: 140,
    h: 100,
  };
  return [exit, skip, digits];
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
    if (art.y < 0 || art.y + art.h > screen.h || visibleShare(art, screen) < 0.65) continue;
    if (clear.some((r) => rectsIntersect(art, r))) continue;
    spots.push({
      name: c.name,
      kind: 'rest',
      cx: c.cx,
      groundY,
      scale: 1,
      faceRight: c.faceRight,
      art,
      drawn,
      sits: false,
      bubble: placeBubble(art, c.onLeft, screen, clear),
    });
  }
  return spots;
}

/**
 * A different spot from where he is and from where he was before that. Falls
 * back to any other spot; null when there is only one. `prefer` narrows the
 * choice when any spot of that kind exists.
 */
export function nextSpot(
  spots: readonly Spot[],
  currentName: SpotName | null,
  lastName: SpotName | null,
  prefer: readonly SpotKind[] = [],
  rand: () => number = Math.random,
): Spot | null {
  let pool = spots.filter((s) => s.name !== currentName && s.name !== lastName);
  if (pool.length === 0) pool = spots.filter((s) => s.name !== currentName);
  const preferred = pool.filter((s) => prefer.includes(s.kind));
  if (preferred.length > 0) pool = preferred;
  return pool[Math.floor(rand() * pool.length)] ?? null;
}
