import { z } from "zod";
import { BRAND } from "../config.js";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const VariationSchema = z
  .object({
    seed: z.number().int(),
    background: z.enum([
      "green", "cream", "dark",
      "gradient_green", "gradient_warm",
      "split_green_cream", "split_dark_cream",
      "charcoal", "sage",
      "atmosphere_ink",
      "atmosphere_clay",
      "atmosphere_slate",
      "atmosphere_duskblue",
      "atmosphere_ember",
      "atmosphere_plum",
      "atmosphere_sand",
      "atmosphere_copper",
      "atmosphere_fog",
    ]),
    tilt: z.number(),
    textStyle: z.enum(["bold", "serif", "clean", "mono"]),
    textPlacement: z.enum(["top", "center"]),
    zoom: z.number(),
    frame: z.enum(["shadow", "plain", "border"]),
    accentBar: z.boolean(),
    layout: z.enum(["standard", "left_aligned", "card_inset"]),
    /** TikTok music cue — unused while TikTok posts silent. */
    music: z.enum(["none", "calm", "warm", "drive"]).default("none"),
    /** YouTube Short bed id — the only music factor we measure. */
    shortBed: z.string().optional(),
    /**
     * How large screenshots render on the slide. large/bleed may occupy the
     * REMEDY zone on purpose — that's a tracked factor, not a layout bug.
     */
    shotScale: z.enum(["contained", "medium", "large", "bleed"]).default("contained"),
    /** Per-slide illustration ids (empty string = not an illustration slide). */
    illustrationIds: z.array(z.string()).optional(),
    /**
     * Pre-store teaser. When true, rerender keeps the coming-soon CTA
     * and never appends the App Store download line.
     */
    prelaunch: z.boolean().optional(),
    /**
     * Last-slide product card. Unset keeps the old icon + text CTA
     * so already-posted / "This post" slides do not change on rerender.
     */
    ctaLayout: z.enum(["phone", "phone_soon", "bleed", "plate", "copy_first", "diagonal"]).optional(),
    /** Soft scene behind the phone — not a flat fill. */
    ctaAtmosphere: z.enum(["field", "dusk", "haze"]).optional(),
    /** Review-only teaser posts. Hidden from Approve all / This post. */
    ctaReview: z.boolean().optional(),
    /** After the photo carousel lands, send the Short at this time. */
    videoFollowUpAt: z.string().optional(),
    videoFollowUpDone: z.boolean().optional(),
    /** Only platforms whose slideshow succeeded — never send the Short where the carousel failed. */
    videoFollowUpPlatforms: z.array(z.enum(["tiktok", "instagram", "facebook"])).optional(),
  })
  .strict();

export type Variation = z.infer<typeof VariationSchema>;
export type MusicStyle = Variation["music"];
export type ShotScale = Variation["shotScale"];
export type CtaLayout = NonNullable<Variation["ctaLayout"]>;

export const CTA_LAYOUTS = ["phone", "phone_soon", "bleed", "plate", "copy_first", "diagonal"] as const;

export function ctaLayoutLabel(layout: CtaLayout | undefined): string {
  if (layout === "phone") return "Phone";
  if (layout === "phone_soon") return "Phone · coming soon";
  if (layout === "bleed") return "Full screen";
  if (layout === "plate") return "Screenshot";
  if (layout === "copy_first") return "Copy first";
  if (layout === "diagonal") return "Phone · tilted";
  return "Classic";
}

export const SHOT_SCALES = ["contained", "medium", "large", "bleed"] as const;

/** How each scale sits on the 4:5 canvas. large/bleed are allowed to cover REMEDY. */
export const SHOT_SCALE_SPEC: Record<
  ShotScale,
  { label: string; coversFooter: boolean; sidePad: number; footerClearance: number; bottomPad: number }
> = {
  contained: { label: "Fits above REMEDY", coversFooter: false, sidePad: 60, footerClearance: 88, bottomPad: 86 },
  medium: { label: "Larger — may kiss footer", coversFooter: true, sidePad: 36, footerClearance: 28, bottomPad: 20 },
  large: { label: "Covers REMEDY zone", coversFooter: true, sidePad: 24, footerClearance: 0, bottomPad: 8 },
  bleed: { label: "Fills remaining slide", coversFooter: true, sidePad: 12, footerClearance: 0, bottomPad: 4 },
};

export function shotScaleLabel(scale: ShotScale | undefined): string {
  return SHOT_SCALE_SPEC[scale ?? "contained"].label;
}

export const MUSIC_CUES: Record<MusicStyle, string> = {
  none: "No music — leave the draft silent",
  calm: "Add in TikTok: search “calm piano”",
  warm: "Add in TikTok: search “warm acoustic”",
  drive: "Add in TikTok: search “lo-fi beat”",
};

/**
 * Soft-depth palettes (CTA technique: base + two ellipses).
 * Hues are not the CTA forest green.
 */
const ATMOSPHERE_BACKGROUNDS: Variation["background"][] = [
  "atmosphere_ink",
  "atmosphere_clay",
  "atmosphere_slate",
  "atmosphere_duskblue",
  "atmosphere_ember",
  "atmosphere_plum",
  "atmosphere_sand",
  "atmosphere_copper",
  "atmosphere_fog",
];

/** Legacy flats stay parseable; new posts almost never pick brand-green (too close to CTA). */
const LEGACY_BACKGROUNDS: Variation["background"][] = [
  "cream", "dark", "gradient_warm", "charcoal", "sage",
];

/** Backgrounds safe for any template. Atmosphere weighted so new posts are not flat fills. */
const FULL_BLEED_BACKGROUNDS: Variation["background"][] = [
  ...ATMOSPHERE_BACKGROUNDS,
  ...ATMOSPHERE_BACKGROUNDS,
  ...ATMOSPHERE_BACKGROUNDS,
  ...LEGACY_BACKGROUNDS,
];

/** Split backgrounds are removed — they looked broken on most templates. */
const ALL_BACKGROUNDS: Variation["background"][] = [...FULL_BLEED_BACKGROUNDS];

const TILTS = [0, 0, 0, -3, -5, 3, 5]; // tripled 0 weight for straight screenshots
const TEXT_STYLES: Variation["textStyle"][] = ["bold", "serif", "clean", "mono"];
const PLACEMENTS: Variation["textPlacement"][] = ["top", "center"];
const ZOOMS = [0.88, 0.95, 1.0, 1.05];
const FRAMES: Variation["frame"][] = ["shadow", "plain", "border"];
const LAYOUTS: Variation["layout"][] = ["standard", "left_aligned", "card_inset"];
/** Lean larger until ratings exist — contained is the old conservative default. */
const SHOT_SCALE_POOL: ShotScale[] = ["medium", "large", "bleed", "medium", "large", "contained"];

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

export interface MakeVariationOpts {
  seed?: number;
  /** If false, excludes split backgrounds that look broken on text-only slides. */
  hasScreenshots?: boolean;
  /** Story/tips templates bias toward a music cue. */
  preferMusic?: boolean;
}

function pickMusic(rng: () => number, preferMusic: boolean): MusicStyle {
  if (preferMusic) return pick(rng, ["calm", "warm", "drive", "calm", "warm", "none"]);
  return pick(rng, ["none", "none", "none", "none", "calm", "warm"]);
}

export function makeVariation(opts?: MakeVariationOpts): Variation {
  const s = opts?.seed ?? Math.floor(Math.random() * 2 ** 31);
  const hasScreenshots = opts?.hasScreenshots ?? true;
  const rng = mulberry32(s);
  const bgPool = hasScreenshots ? ALL_BACKGROUNDS : FULL_BLEED_BACKGROUNDS;
  return {
    seed: s,
    background: pick(rng, bgPool),
    tilt: pick(rng, TILTS),
    textStyle: pick(rng, TEXT_STYLES),
    textPlacement: pick(rng, PLACEMENTS),
    zoom: pick(rng, ZOOMS),
    frame: pick(rng, FRAMES),
    accentBar: rng() > 0.5,
    layout: pick(rng, LAYOUTS),
    music: pickMusic(rng, opts?.preferMusic ?? false),
    shotScale: pick(rng, SHOT_SCALE_POOL),
  };
}

/** Cold-first pick so each size gets shipped; ratings are a soft weight. */
export function pickShotScale(opts?: {
  exclude?: ShotScale[];
  shipped?: Map<string, number>;
  weights?: Record<string, number>;
}): ShotScale {
  const exclude = new Set(opts?.exclude ?? []);
  const pool = SHOT_SCALES.filter((s) => !exclude.has(s));
  const candidates = pool.length ? pool : [...SHOT_SCALES];
  const shipped = opts?.shipped ?? new Map<string, number>();
  const weights = opts?.weights ?? {};
  const prior: Record<ShotScale, number> = { contained: 0.7, medium: 1.3, large: 1.4, bleed: 1.15 };
  const ranked = [...candidates].sort((a, b) => {
    const sa = shipped.get(a) ?? 0;
    const sb = shipped.get(b) ?? 0;
    if (sa !== sb) return sa - sb;
    return (weights[b] ?? 50) * prior[b] - (weights[a] ?? 50) * prior[a];
  });
  const top = ranked.slice(0, Math.min(3, ranked.length));
  return top[Math.floor(Math.random() * top.length)] ?? "medium";
}

/** Rehydrate a stored variation; assigns music from the seed if older posts lack it. */
export function parseVariation(raw: unknown, preferMusic = false): Variation {
  const obj = raw && typeof raw === "object" ? { ...(raw as Record<string, unknown>) } : {};
  if (obj.music === undefined) {
    const seed = typeof obj.seed === "number" ? obj.seed : 1;
    obj.music = pickMusic(mulberry32(seed >>> 0), preferMusic);
  }
  if (obj.shotScale === undefined) obj.shotScale = "contained";
  const parsed = VariationSchema.safeParse(obj);
  if (parsed.success) return parsed.data;
  return makeVariation({
    seed: typeof obj.seed === "number" ? obj.seed : undefined,
    preferMusic,
  });
}

/** Soft organic depth — same idea as the CTA scene, different hues. */
function atmosphereSvg(
  w: number,
  h: number,
  field: string,
  lo: string,
  hi: string,
  cx1: number,
  cy1: number,
  cx2: number,
  cy2: number,
  hiOpacity = 0.22,
  loOpacity = 0.30,
): string {
  return (
    `<rect width="${w}" height="${h}" fill="${field}"/>` +
    `<ellipse cx="${Math.round(w * cx1)}" cy="${Math.round(h * cy1)}" rx="${Math.round(w * 0.50)}" ry="${Math.round(h * 0.29)}" fill="${hi}" opacity="${hiOpacity}"/>` +
    `<ellipse cx="${Math.round(w * cx2)}" cy="${Math.round(h * cy2)}" rx="${Math.round(w * 0.46)}" ry="${Math.round(h * 0.26)}" fill="${lo}" opacity="${loOpacity}"/>`
  );
}

export function backgroundSvg(bg: Variation["background"], w: number, h: number): string {
  const c = BRAND.colors;
  switch (bg) {
    case "green":
      return `<rect width="${w}" height="${h}" fill="${c.green}"/>`;
    case "cream":
      return `<rect width="${w}" height="${h}" fill="${c.cream}"/>`;
    case "dark":
      return `<rect width="${w}" height="${h}" fill="${c.dark}"/>`;
    case "charcoal":
      return `<rect width="${w}" height="${h}" fill="#2c2c2e"/>`;
    case "sage":
      return `<rect width="${w}" height="${h}" fill="#a3b18a"/>`;
    case "gradient_green":
      return `<defs><linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.green}"/><stop offset="1" stop-color="${c.greenDark}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#gg)"/>`;
    case "gradient_warm":
      return `<defs><linearGradient id="gw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.cream}"/><stop offset="1" stop-color="#e8dcc8"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#gw)"/>`;
    case "split_green_cream":
      return `<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.green}"/><stop offset="0.48" stop-color="${c.green}"/><stop offset="0.52" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.cream}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#sg)"/>`;
    case "split_dark_cream":
      return `<defs><linearGradient id="sd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.dark}"/><stop offset="0.48" stop-color="${c.dark}"/><stop offset="0.52" stop-color="${c.cream}"/><stop offset="1" stop-color="${c.cream}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#sd)"/>`;
    case "atmosphere_ink":
      return atmosphereSvg(w, h, "#1B2740", "#101828", "#2C3D5C", 0.78, 0.18, 0.14, 0.84);
    case "atmosphere_clay":
      return atmosphereSvg(w, h, "#3D2618", "#24150E", "#5A3A28", 0.72, 0.22, 0.20, 0.80);
    case "atmosphere_slate":
      return atmosphereSvg(w, h, "#2B343E", "#1A222A", "#3E4C5A", 0.80, 0.16, 0.12, 0.86);
    case "atmosphere_duskblue":
      return atmosphereSvg(w, h, "#1E2240", "#121428", "#2E3460", 0.70, 0.20, 0.22, 0.82);
    case "atmosphere_ember":
      return atmosphereSvg(w, h, "#322018", "#1C100C", "#4A3024", 0.76, 0.24, 0.16, 0.78);
    case "atmosphere_plum":
      return atmosphereSvg(w, h, "#2C1C2A", "#1A1018", "#403040", 0.74, 0.14, 0.18, 0.88);
    case "atmosphere_sand":
      return atmosphereSvg(w, h, "#F3E6D4", "#E0D0B8", "#FAF0E4", 0.68, 0.20, 0.24, 0.80, 0.35, 0.28);
    case "atmosphere_copper":
      return atmosphereSvg(w, h, "#3A2418", "#22140E", "#5C3824", 0.82, 0.18, 0.10, 0.82);
    case "atmosphere_fog":
      return atmosphereSvg(w, h, "#3A4450", "#2A343E", "#4E5A66", 0.66, 0.26, 0.28, 0.76);
  }
}

const DARK_BACKGROUNDS = new Set<Variation["background"]>([
  "green", "dark", "gradient_green", "charcoal",
  "split_green_cream", "split_dark_cream",
  "atmosphere_ink", "atmosphere_clay", "atmosphere_slate",
  "atmosphere_duskblue", "atmosphere_ember", "atmosphere_plum",
  "atmosphere_copper", "atmosphere_fog",
]);

export function isDarkBackground(bg: Variation["background"]): boolean {
  return DARK_BACKGROUNDS.has(bg);
}

export function fontFamily(style: Variation["textStyle"]): string {
  switch (style) {
    case "bold":
      return "Arial, Helvetica, sans-serif";
    case "serif":
      return "Georgia, 'Times New Roman', serif";
    case "clean":
      return "'Segoe UI', Verdana, sans-serif";
    case "mono":
      return "'Courier New', Courier, monospace";
  }
}
