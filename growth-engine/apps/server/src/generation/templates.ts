/**
 * Slide sequence templates — 10 fundamentally different carousel structures.
 * The learning loop adjusts weights over time (winners get picked more often).
 */
export type SlideKind =
  | "hook"           // big text opener
  | "problem"        // names the pain
  | "before_after"   // text-based transformation contrast
  | "screenshot"     // app screen with headline
  | "proof"          // social proof / claim slide
  | "cta"            // download call to action
  | "tip"            // numbered tip card (big number badge + text)
  | "stat"           // bold stat slide (big number + explanation)
  | "text_story"     // narrative text beat (story arc)
  | "full_text"      // full-screen text insight, no image
  | "illustration"   // flat-style SVG illustration of a person/scene
  | "photo_person"   // photoreal AI person — cover plus at least one later slide, never every slide
  | "exercise_photo"; // real exercise photo cropped from session screenshot — most visual/compelling

export interface SlideSpec {
  kind: SlideKind;
  usesScreenshot: boolean;
}

export interface CarouselTemplate {
  id: string;
  name: string;
  description: string;
  slides: SlideSpec[];
  /** Story/tips templates lean toward a TikTok music cue (added in-app; API cannot attach audio). */
  preferMusic?: boolean;
}

export const TEMPLATES: Record<string, CarouselTemplate> = {
  A: {
    id: "A",
    name: "Classic App Install",
    description: "Illustration hook → tip → screenshot → CTA. Short teach + one late proof.",
    preferMusic: true,
    slides: [
      { kind: "illustration", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  B: {
    id: "B",
    name: "Exercise Proof",
    description: "Hook → problem → exercise photo → screenshot → CTA. Text-driven, exercise payoff.",
    slides: [
      { kind: "hook", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  C: {
    id: "C",
    name: "Deep Dive",
    description: "Illustration hook → problem → tip → screenshot → exercise → CTA. Teach, then one app proof.",
    preferMusic: true,
    slides: [
      { kind: "illustration", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  D: {
    id: "D",
    name: "Tips Carousel",
    description: "Hook → 3 tips → screenshot → CTA. Value-first, tip-driven.",
    preferMusic: true,
    slides: [
      { kind: "hook", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  E: {
    id: "E",
    name: "Stat Puncher",
    description: "Hook → stat → screenshot → exercise photo → CTA. Bold number hooks attention, then proves it.",
    slides: [
      { kind: "hook", usesScreenshot: false },
      { kind: "stat", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  F: {
    id: "F",
    name: "Story Arc",
    description: "Illustration hook → illustration → screenshot → CTA. SVG cover into emotional story.",
    preferMusic: true,
    slides: [
      { kind: "illustration", usesScreenshot: false },
      { kind: "illustration", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  G: {
    id: "G",
    name: "Before / After",
    description: "Hook → before/after → illustration → tip → screenshot → CTA. Transformation, then one proof.",
    slides: [
      { kind: "hook", usesScreenshot: false },
      { kind: "before_after", usesScreenshot: false },
      { kind: "illustration", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  H: {
    id: "H",
    name: "Exercise Focus",
    description: "Illustration hook → exercise photo → screenshot → CTA. SVG cover, exercise proves it.",
    slides: [
      { kind: "illustration", usesScreenshot: false },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  I: {
    id: "I",
    name: "Quick Hit",
    description: "Hook → screenshot → CTA. Shortest format — punchy hook, fast payoff.",
    slides: [
      { kind: "hook", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  J: {
    id: "J",
    name: "Tip + Demo",
    description: "Illustration hook → tip → screenshot → CTA. SVG cover, tip teaches, app shows.",
    preferMusic: true,
    slides: [
      { kind: "illustration", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  K: {
    id: "K",
    name: "Problem → Solution",
    description: "Hook → problem → screenshot → exercise photo → CTA. Names the pain then fixes it.",
    slides: [
      { kind: "hook", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  L: {
    id: "L",
    name: "Your First Session",
    description: "Illustration hook → illustration → exercise photo → screenshot → proof → CTA. Walks you through what day 1 looks like.",
    slides: [
      { kind: "illustration", usesScreenshot: false },
      { kind: "illustration", usesScreenshot: false },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "proof", usesScreenshot: false },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  M: {
    id: "M",
    name: "Long Teach",
    description: "Hook → problem → 2 tips → screenshot → exercise → CTA. 7-slide argument.",
    preferMusic: true,
    slides: [
      { kind: "hook", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  N: {
    id: "N",
    name: "Full Arc",
    description: "Illustration hook → illustration → problem → tip → screenshot → exercise → proof → CTA. 8-slide story.",
    slides: [
      { kind: "illustration", usesScreenshot: false },
      { kind: "illustration", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "proof", usesScreenshot: false },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  O: {
    id: "O",
    name: "Deep Story",
    description: "Hook → problem → 3 tips → illustration → screenshot → exercise → CTA. 9-slide teach.",
    preferMusic: true,
    slides: [
      { kind: "hook", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "illustration", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  P: {
    id: "P",
    name: "Max Carousel",
    description: "Hook → illustration → problem → 3 tips → screenshot → exercise → proof → CTA. 10-slide teach, one proof.",
    slides: [
      { kind: "hook", usesScreenshot: false },
      { kind: "illustration", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "proof", usesScreenshot: false },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  Q: {
    id: "Q",
    name: "Long Cover",
    description: "Illustration hook → problem → tip → screenshot → exercise → proof → CTA. 7-slide SVG cover.",
    slides: [
      { kind: "illustration", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "proof", usesScreenshot: false },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  R: {
    id: "R",
    name: "Cover Story",
    description: "Illustration hook → illustration → problem → 2 tips → screenshot → exercise → CTA. 8-slide SVG cover, one proof.",
    preferMusic: true,
    slides: [
      { kind: "illustration", usesScreenshot: false },
      { kind: "illustration", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  S: {
    id: "S",
    name: "Person + 3rd",
    description: "Person cover + person on slide 3. Problem and tip, one late proof. 6-slide test.",
    slides: [
      { kind: "photo_person", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "photo_person", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  T: {
    id: "T",
    name: "Person + 3rd Teach",
    description: "Person cover + person on slide 3, with a tip. 7-slide test.",
    slides: [
      { kind: "photo_person", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "photo_person", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  U: {
    id: "U",
    name: "Person + 4th",
    description: "Person cover + person on slide 4. 8-slide test.",
    slides: [
      { kind: "photo_person", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "photo_person", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "proof", usesScreenshot: false },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  V: {
    id: "V",
    name: "Person + 2nd",
    description: "Person cover + person immediately on slide 2. 7-slide test.",
    slides: [
      { kind: "photo_person", usesScreenshot: false },
      { kind: "photo_person", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "proof", usesScreenshot: false },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  W: {
    id: "W",
    name: "Person + 5th",
    description: "Person cover + person on slide 5. 8-slide test.",
    slides: [
      { kind: "photo_person", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "photo_person", usesScreenshot: false },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "proof", usesScreenshot: false },
      { kind: "cta", usesScreenshot: false },
    ],
  },
  X: {
    id: "X",
    name: "Person Combo",
    description: "Person on cover, slide 3, and slide 6. 9-slide combo — never every slide.",
    preferMusic: true,
    slides: [
      { kind: "photo_person", usesScreenshot: false },
      { kind: "problem", usesScreenshot: false },
      { kind: "photo_person", usesScreenshot: false },
      { kind: "tip", usesScreenshot: false },
      { kind: "screenshot", usesScreenshot: true },
      { kind: "photo_person", usesScreenshot: false },
      { kind: "exercise_photo", usesScreenshot: true },
      { kind: "proof", usesScreenshot: false },
      { kind: "cta", usesScreenshot: false },
    ],
  },
};

/** 6+ slides — the length we want to test more often. */
export function isLongTemplate(template: CarouselTemplate, min = 6): boolean {
  return template.slides.length >= min;
}

const COVER_LONG_IDS = ["Q", "N", "R", "L", "C"] as const;
const PHOTO_LONG_IDS = ["T", "U", "W", "X", "V", "S"] as const;
const TEXT_LONG_IDS = ["D", "M", "O", "P", "G"] as const;

function nextUnused(pool: readonly string[], used: string[]): string {
  const unused = pool.filter((id) => !used.includes(id));
  if (unused.length) return unused[0]!;
  const hits = used.filter((id) => pool.includes(id)).length;
  return pool[hits % pool.length]!;
}

/**
 * Map a short template onto a 6–10 slide structure that keeps the same
 * cover style (SVG hook vs text hook) and stays in the hook's argument.
 */
export function pickLongerTemplateId(currentId: string, hookText = "", used: string[] = []): string {
  const current = TEMPLATES[currentId];
  if (current && isLongTemplate(current)) return currentId;
  const cover = Boolean(current && hasIllustrationCover(current));
  const photo = Boolean(current && hasPhotoCover(current));
  const t = hookText.toLowerCase();
  if (photo) return nextUnused(PHOTO_LONG_IDS, used);
  if (cover) return nextUnused(COVER_LONG_IDS, used);
  if (/wait (for|until) slide|you'll want slide/.test(t)) return nextUnused(["O", "P", "N"], used);
  if (/youtube|playlist|guess/.test(t)) return nextUnused(["M", "N", "O"], used);
  if (/%|\bat least once\b/.test(t)) return nextUnused(["M", "O", "Q"], used);
  if (/stretch|flexib|foam/.test(t)) return nextUnused(["M", "O", "D"], used);
  if (/minute|reset|session|21 days/.test(t)) return nextUnused(["L", "Q", "M"], used);
  return nextUnused(TEXT_LONG_IDS, used);
}

const TEMPLATE_IDS = Object.keys(TEMPLATES);

/** Slide 1 carries the hook text (text hook, SVG cover, or person cover). */
export function isCoverHeadlineSlide(kind: string, index: number): boolean {
  return kind === "hook" || ((kind === "illustration" || kind === "photo_person") && index === 0);
}

/** Cover (slide 1) is an SVG/illustration. */
export function hasIllustrationCover(template: CarouselTemplate): boolean {
  return template.slides[0]?.kind === "illustration";
}

/** Cover (slide 1) is a photoreal person. */
export function hasPhotoCover(template: CarouselTemplate): boolean {
  return template.slides[0]?.kind === "photo_person";
}

/** Person slides after the title — person posts must have at least one. */
export function personSlidesAfterCover(template: CarouselTemplate): number {
  return template.slides.slice(1).filter((s) => s.kind === "photo_person").length;
}

/**
 * Person-cover posts must be 6–10 slides and place a person after the title.
 * Remaps a violating id onto a long person template.
 */
export function enforcePersonTemplate(templateId: string, hookText = "", used: string[] = []): string {
  const t = TEMPLATES[templateId];
  if (!t || !hasPhotoCover(t)) return templateId;
  if (isLongTemplate(t) && personSlidesAfterCover(t) >= 1) return templateId;
  return pickLongerTemplateId(templateId, hookText, used);
}

export function hasVisualCover(template: CarouselTemplate): boolean {
  return hasIllustrationCover(template) || hasPhotoCover(template);
}

export function illustrationCoverTemplateIds(): string[] {
  return TEMPLATE_IDS.filter((id) => hasIllustrationCover(TEMPLATES[id]!));
}

export function photoCoverTemplateIds(): string[] {
  return TEMPLATE_IDS.filter((id) => hasPhotoCover(TEMPLATES[id]!));
}

const TEACH_BODY_KINDS: ReadonlySet<SlideKind> = new Set(["tip", "problem", "stat", "before_after"]);

function screenshotCount(template: CarouselTemplate): number {
  return template.slides.filter((s) => s.kind === "screenshot").length;
}

function firstScreenshotIndex(template: CarouselTemplate): number {
  return template.slides.findIndex((s) => s.kind === "screenshot");
}

/** Tip / problem / stat body, at most one screenshot, and not as slide 2. */
export function isTeachShaped(template: CarouselTemplate): boolean {
  const firstShot = firstScreenshotIndex(template);
  return (
    screenshotCount(template) <= 1 &&
    template.slides.some((s) => TEACH_BODY_KINDS.has(s.kind)) &&
    firstShot >= 2
  );
}

/** Two-plus app screens, or a screenshot immediately after the hook with no teach body. */
export function isTourShaped(template: CarouselTemplate): boolean {
  if (screenshotCount(template) >= 2) return true;
  const firstShot = firstScreenshotIndex(template);
  const hasTeach = template.slides.some((s) => TEACH_BODY_KINDS.has(s.kind));
  return firstShot === 1 && !hasTeach;
}

/**
 * Soft tilt toward teach-shaped IDs already in the cover/length pool.
 * Keeps tour/balanced in the mix so we do not freeze on one shape.
 */
export function biasPoolTowardTeach(pool: string[], opts?: { preferLong?: boolean }): string[] {
  if (pool.length <= 1) return pool;
  const teach = pool.filter((id) => {
    const t = TEMPLATES[id];
    return Boolean(t && isTeachShaped(t));
  });
  if (teach.length === 0) return pool;
  let preferred = teach;
  if (opts?.preferLong) {
    const longTeach = teach.filter((id) => isLongTemplate(TEMPLATES[id]!));
    if (longTeach.length) preferred = longTeach;
  }
  if (Math.random() >= 0.55) return pool;
  const keep = new Set(preferred);
  const rest = pool.filter((id) => {
    const t = TEMPLATES[id];
    return Boolean(t && !isTourShaped(t) && !keep.has(id));
  });
  return [...preferred, ...rest];
}

export function teachBiasWeights(
  ids: string[],
  base?: Partial<Record<string, number>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) {
    const t = TEMPLATES[id];
    let w = base?.[id] ?? 1;
    if (t && isTeachShaped(t)) w *= 1.3;
    if (t && isTourShaped(t)) w *= 0.5;
    out[id] = Math.max(w, 0.1);
  }
  return out;
}

export function pickTemplateId(weights?: Partial<Record<string, number>>): string {
  const w = TEMPLATE_IDS.map((id) => Math.max(weights?.[id] ?? 1, 0.1));
  const total = w.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < TEMPLATE_IDS.length; i++) {
    r -= w[i]!;
    if (r <= 0) return TEMPLATE_IDS[i]!;
  }
  return TEMPLATE_IDS[0]!;
}
