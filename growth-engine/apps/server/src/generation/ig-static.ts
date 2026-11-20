import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { ROOT_DIR } from "../config.js";

/**
 * @remedyrecoveries main-grid statics (curated, Nov 1). One look for the whole grid:
 * every photo gets the same grade, every line is the same serif, every post carries
 * the same small mark. Two kinds: `still` (a real photo, one line) and `card` (type only).
 */

export const IG_DIR = path.join(ROOT_DIR, "assets", "ig");
export const W = 1080;
export const H = 1350;

/** The profile grid shows a 3:4 center crop of a 4:5 post; keep type inside it. */
const GRID_CROP_X = Math.round((W - (H * 3) / 4) / 2);
const MARGIN_X = 96;
const MAX_TEXT_W = W - MARGIN_X * 2;

const BONE = "#FAF7F4";
const INK = "#1C1C1E";
const TONES = { bone: { bg: BONE, fg: INK }, forest: { bg: "#2F5440", fg: BONE }, ink: { bg: INK, fg: BONE } } as const;
const SERIF = "Georgia, 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

/** One generated photo (objects and places, or the founder), compiled to a prompt by `_ig-statics.ts --prompts`. */
export const IgShotSchema = z
  .object({
    scene: z.string().min(10),
    person: z.enum(["none", "rahul-mid", "rahul-face", "rahul-behind", "rahul-profile"]).default("none"),
    hair: z.enum(["compact", "defined", "tousled", "hero-curl", "side-shift"]).optional(),
    outfit: z.enum(["grey-tee-jeans", "heather-tee", "black-tee-sweats", "sage-polo", "crewneck", "black-hoodie", "tan-tee"]).optional(),
    light: z.enum(["window-side", "dim-morning", "overcast-out", "low-sun", "evening-lamp", "car-day", "fluorescent", "garage-door"]),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.person !== "none" && (!s.hair || !s.outfit)) ctx.addIssue({ code: "custom", message: "a shot with Rahul needs hair and outfit" });
  });
export type IgShot = z.infer<typeof IgShotSchema>;

const LIGHT: Record<IgShot["light"], string> = {
  "window-side": "Bright natural daylight from a window at the side, the room well lit",
  "dim-morning": "Clear early-morning daylight coming in through a window, the room lit naturally",
  "overcast-out": "Bright overcast daylight outdoors, soft shadows",
  "low-sun": "Late-afternoon sun, warm light and soft long shadows",
  "evening-lamp": "Evening, warm lamps on and the room comfortably lit",
  "car-day": "Even daylight through car windows",
  fluorescent: "Normal bright indoor overhead lighting",
  "garage-door": "Daylight coming in through an open garage door",
};

/** Identity is only ever taken from real photos in assets/characters/rahul/real/ (see profile.json). */
const RAHUL_DIR = path.join(ROOT_DIR, "assets", "characters", "rahul", "real");
const RAHUL_ID =
  "Exactly the same man as in the reference photos, his real face, not a lookalike: early twenties, long oval face with an elongated midface, lean cheeks, defined but not square jaw, rounded chin; thick near-black mostly straight eyebrows with natural asymmetry; dark-brown almond eyes, slightly heavy upper lids; long prominent nose with a straight-to-slightly-convex bridge and rounded tip; thinner upper lip, fuller lower lip; medium warm-brown skin with olive undertones, real texture, faint under-eye darkness; short uneven stubble, not a beard. Lean athletic build, moderate shoulders. Not beautified, not a model, no airbrushing. Take only his face, hair texture and build from the references, never their rooms, clothes or poses.";

const HAIR: Record<NonNullable<IgShot["hair"]>, string> = {
  compact: "Hair: dense near-black curls kept compact, pushed mostly off the forehead, full natural sides.",
  defined: "Hair: defined near-black curls with a few loose ringlets falling onto the forehead, rounded natural volume.",
  tousled: "Hair: high-volume tousled near-black waves and curls, messy and lifted, flyaways, full sides.",
  "hero-curl": "Hair: near-black curls swept loosely back with one curl dropping onto the forehead, textured and a little messy.",
  "side-shift": "Hair: near-black curl mass shifted to one side, more forehead showing on the other side, natural volume.",
};

const OUTFIT: Record<NonNullable<IgShot["outfit"]>, string> = {
  "grey-tee-jeans": "He wears a washed grey cotton t-shirt and light-wash baggy cargo jeans, a black smartwatch.",
  "heather-tee": "He wears a plain heather-grey crew-neck t-shirt, a little wrinkled.",
  "black-tee-sweats": "He wears a plain black t-shirt and dark grey sweatpants.",
  "sage-polo": "He wears a pale sage knit polo with a soft open collar and a thin chain.",
  crewneck: "He wears an oatmeal crewneck sweatshirt over a dark tee and loose black pants.",
  "black-hoodie": "He wears a plain black hoodie.",
  "tan-tee": "He wears a loose tan t-shirt and light khaki pants.",
};

const ANGLE: Record<Exclude<IgShot["person"], "none">, { text: string; refs: string[] }> = {
  "rahul-face": {
    text: "Framed from an arm and a half away, his face under a third of the frame, candid, not looking at the camera.",
    refs: ["front-close-grey-tee.jpg", "front-desk-heather-tee.jpg", "three-quarter-cafe-sage-polo.jpg", "profile-right.jpg"],
  },
  "rahul-mid": {
    text: "Seen from about three meters away, natural and unposed.",
    refs: ["front-desk-heather-tee.jpg", "front-close-grey-tee.jpg", "three-quarter-cafe-sage-polo.jpg", "standing-grey-tee-jeans.jpg"],
  },
  "rahul-profile": {
    text: "Seen in profile from a few meters away.",
    refs: ["profile-right.jpg", "profile-left.jpg", "seated-profile-laptop.jpg", "front-close-grey-tee.jpg"],
  },
  "rahul-behind": {
    text: "Seen from behind, face not visible; his build, posture and curly hair match the reference photos.",
    refs: ["standing-grey-tee-jeans.jpg", "standing-crewneck-black-pants.jpg", "profile-left.jpg"],
  },
};

/** The realism recipe is added to every shot; the scene is the only creative input. */
export function compileShot(shot: IgShot, textAt: "top" | "bottom"): { prompt: string; refs: string[] } {
  const headroom =
    textAt === "top"
      ? "The camera sits a little low and leaves generous quiet headroom above the subject: plain wall, ceiling, sky or floor in the upper third."
      : "The subject sits in the upper part of the frame with quiet plain floor or ground in the lower third.";
  const person =
    shot.person === "none"
      ? ["No people anywhere in the frame."]
      : [RAHUL_ID, HAIR[shot.hair!], OUTFIT[shot.outfit!], ANGLE[shot.person].text];
  const prompt = [
    "Candid photo taken on a recent iPhone.",
    `${LIGHT[shot.light]}.`,
    `${shot.scene}.`,
    ...person,
    headroom,
    "Calm, minimal, lived-in, nothing staged. Sharp, clean, true-to-life color and contrast like a good phone camera, slightly off-center, no haze, no film look, not retouched, not a stock photo, not an ad.",
    "No readable text, labels, packaging words, logos, screens with content, or digits anywhere. No microphone.",
  ].join(" ");
  const refs = shot.person === "none" ? [] : ANGLE[shot.person].refs.map((f) => path.join(RAHUL_DIR, f));
  return { prompt, refs };
}

export const IgPostSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    kind: z.enum(["still", "card"]),
    /** File in assets/ig/photos/: CC0 with a sources.json entry, or `gen/…` with a `shot`. */
    photo: z.string().optional(),
    shot: IgShotSchema.optional(),
    focus: z.enum(["centre", "north", "south", "east", "west"]).default("centre"),
    tone: z.enum(["bone", "forest", "ink"]).optional(),
    lines: z.array(z.string().min(1)).min(1).max(4),
    textAt: z.enum(["top", "bottom"]).default("top"),
    caption: z.string().min(1),
    note: z.string().default(""),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.kind === "still" && !p.photo) ctx.addIssue({ code: "custom", message: `${p.id}: a still needs a photo` });
    if (p.kind === "card" && !p.tone) ctx.addIssue({ code: "custom", message: `${p.id}: a card needs a tone` });
  });

export const IgPlanSchema = z.object({ posts: z.array(IgPostSchema).min(1) }).strict();
export type IgPost = z.infer<typeof IgPostSchema>;

const CarouselSlideSchema = z.union([
  z
    .object({
      kind: z.literal("still"),
      photo: z.string(),
      shot: IgShotSchema.optional(),
      lines: z.array(z.string().min(1)).min(1).max(4),
      textAt: z.enum(["top", "bottom"]).default("top"),
      focus: z.enum(["centre", "north", "south", "east", "west"]).default("centre"),
    })
    .strict(),
  z.object({ kind: z.literal("app"), screenshot: z.string().regex(/^crop_.*\.png$/), lines: z.array(z.string().min(1)).min(1).max(3) }).strict(),
  z.object({ kind: z.literal("card"), tone: z.enum(["bone", "forest", "ink"]), lines: z.array(z.string().min(1)).min(1).max(4) }).strict(),
]);

export const IgCarouselSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    founder: z.boolean().default(false),
    slides: z.array(CarouselSlideSchema).min(4).max(10),
    caption: z.string().min(1),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (c.slides[0]!.kind !== "still") ctx.addIssue({ code: "custom", message: `${c.id}: the cover must be a photo` });
    if (c.slides.filter((s) => s.kind === "app").length > 1) ctx.addIssue({ code: "custom", message: `${c.id}: at most one app slide` });
  });
export const IgCarouselsSchema = z.object({ carousels: z.array(IgCarouselSchema).min(1) }).strict();
export type IgCarousel = z.infer<typeof IgCarouselSchema>;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Georgia averages about half an em per character; refuse a line that would run into the margin. */
function headSize(lines: string[], start: number): number {
  const longest = Math.max(...lines.map((l) => l.length));
  let size = start;
  while (size > 40 && longest * size * 0.5 > MAX_TEXT_W) size -= 2;
  if (longest * size * 0.5 > MAX_TEXT_W) throw new Error(`Line too long for the grid: "${lines.find((l) => l.length === longest)}"`);
  return size;
}

async function grain(strength: number): Promise<Buffer> {
  const px = Buffer.alloc(W * H);
  for (let i = 0; i < px.length; i++) px[i] = 128 + Math.round((Math.random() - 0.5) * strength);
  return sharp(px, { raw: { width: W, height: H, channels: 1 } }).toColourspace("srgb").png().toBuffer();
}

/** True-to-life correction, the same on every photo: clip the haze out of the levels and give color back. No grain, no tint. */
async function gradedPhoto(file: string, focus: IgPost["focus"]): Promise<Buffer> {
  const src = path.join(IG_DIR, "photos", file);
  if (!fs.existsSync(src)) throw new Error(`Missing photo: ${src}`);
  const levelled = await sharp(src)
    .rotate()
    .resize(W, H, { fit: "cover", position: focus })
    .png()
    .toBuffer();
  const mean = (await sharp(levelled).greyscale().stats()).channels[0]!.mean;
  const brightness = mean < 112 ? Math.min(1.2, 118 / mean) : 1;
  return sharp(levelled).modulate({ brightness }).png().toBuffer();
}

async function regionStats(img: Buffer, top: number, height: number): Promise<{ mean: number; busy: boolean }> {
  const s = await sharp(img).extract({ left: GRID_CROP_X, top, width: W - GRID_CROP_X * 2, height }).greyscale().stats();
  return { mean: s.channels[0]!.mean, busy: s.channels[0]!.stdev > 38 };
}

function textSvg(lines: string[], size: number, color: string, y: number, markColor: string, opts: { mark?: boolean; arrow?: boolean } = {}): string {
  const lh = Math.round(size * 1.18);
  const head = lines
    .map((l, i) => `<text x="${MARGIN_X}" y="${y + Math.round(size * 0.8) + i * lh}" font-family="${SERIF}" font-size="${size}" letter-spacing="-0.4" fill="${color}">${esc(l)}</text>`)
    .join("");
  const mark =
    opts.mark === false
      ? ""
      : `<text x="${MARGIN_X}" y="${H - 84}" font-family="${SANS}" font-size="20" font-weight="600" letter-spacing="5" fill="${markColor}" opacity="0.72">REMEDY</text>`;
  const ax = W - MARGIN_X;
  const arrow = opts.arrow
    ? `<g stroke="${markColor}" stroke-width="2.4" fill="none" opacity="0.72" stroke-linecap="round"><line x1="${ax - 44}" y1="${H - 91}" x2="${ax}" y2="${H - 91}"/><polyline points="${ax - 12},${H - 102} ${ax},${H - 91} ${ax - 12},${H - 80}"/></g>`
    : "";
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${head}${mark}${arrow}</svg>`;
}

function blockHeight(lines: string[], size: number): number {
  return Math.round(size * 1.18) * (lines.length - 1) + size;
}

/** App slide: bone page, the line at the top, the library crop on a rounded plate that runs off the bottom edge. */
export async function renderIgAppSlide(screenshot: string, lines: string[]): Promise<Buffer> {
  const src = path.join(ROOT_DIR, "assets", "screenshots", screenshot);
  if (!fs.existsSync(src)) throw new Error(`Missing screenshot: ${src}`);
  const size = headSize(lines, 54);
  const y = 132;
  const textBottom = y + blockHeight(lines, size);
  const plateW = 780;
  const meta = await sharp(src).metadata();
  const scaledH = Math.round(((meta.height ?? 1) / (meta.width ?? 1)) * plateW);
  const top = Math.max(textBottom + 90, H - scaledH - 40);
  const plateH = H - top + 60;
  const resized = await sharp(src).resize(plateW, scaledH).flatten({ background: "#FFFFFF" }).png().toBuffer();
  const extended = await sharp(resized).extend({ bottom: Math.max(0, plateH - scaledH), background: "#FFFFFF" }).png().toBuffer();
  const shot = await sharp(extended).extract({ left: 0, top: 0, width: plateW, height: plateH }).png().toBuffer();
  const mask = Buffer.from(`<svg width="${plateW}" height="${plateH}"><rect width="${plateW}" height="${plateH}" rx="40" ry="40" fill="#fff"/></svg>`);
  const plate = await sharp(shot).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const left = Math.round((W - plateW) / 2);
  const shadow = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="28"/></filter></defs><rect x="${left + 10}" y="${top + 24}" width="${plateW - 20}" height="${plateH}" rx="40" fill="#1C1C1E" opacity="0.18" filter="url(#s)"/></svg>`,
  );
  const bg = await sharp({ create: { width: W, height: H, channels: 3, background: BONE } })
    .composite([{ input: await grain(14), blend: "soft-light" }])
    .png()
    .toBuffer();
  return sharp(bg)
    .composite([
      { input: shadow },
      { input: plate, left, top },
      { input: Buffer.from(textSvg(lines, size, INK, y, INK, { mark: false })) },
    ])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

export async function renderIgCarousel(c: IgCarousel): Promise<Buffer[]> {
  const out: Buffer[] = [];
  for (const [i, s] of c.slides.entries()) {
    const arrow = i === 0;
    if (s.kind === "app") out.push(await renderIgAppSlide(s.screenshot, s.lines));
    else if (s.kind === "card") out.push(await renderIgPost({ id: `${c.id}-${i}`, kind: "card", tone: s.tone, lines: s.lines, caption: "-", focus: "centre", textAt: "top", note: "" }));
    else out.push(await renderIgPost({ id: `${c.id}-${i}`, kind: "still", photo: s.photo, lines: s.lines, caption: "-", focus: s.focus, textAt: s.textAt, note: "" }, { arrow }));
  }
  return out;
}

export async function renderIgPost(post: IgPost, opts: { arrow?: boolean } = {}): Promise<Buffer> {
  if (post.kind === "card") {
    const tone = TONES[post.tone!];
    const size = headSize(post.lines, 66);
    const y = Math.round(H * 0.42 - blockHeight(post.lines, size) / 2);
    const bg = await sharp({ create: { width: W, height: H, channels: 3, background: tone.bg } })
      .composite([{ input: await grain(14), blend: "soft-light" }])
      .png()
      .toBuffer();
    return sharp(bg)
      .composite([{ input: Buffer.from(textSvg(post.lines, size, tone.fg, y, tone.fg)) }])
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
  }

  const photo = await gradedPhoto(post.photo!, post.focus);
  const size = headSize(post.lines, 54);
  const bh = blockHeight(post.lines, size);
  const y = post.textAt === "top" ? 132 : H - 150 - bh;
  const under = await regionStats(photo, Math.max(0, y - 40), bh + 80);
  const light = under.mean > 132;
  const fg = light ? INK : BONE;
  // A soft wash behind the line when the photo under it is mid-grey or busy and the line would get lost.
  const washOpacity = under.busy ? 0.72 : under.mean > 95 && under.mean < 170 ? 0.55 : 0;
  const top = post.textAt === "top";
  const wash =
    washOpacity > 0
      ? `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="w" x1="0" y1="${top ? 0 : 1}" x2="0" y2="${top ? 1 : 0}"><stop offset="0" stop-color="${light ? BONE : INK}" stop-opacity="${washOpacity}"/><stop offset="0.55" stop-color="${light ? BONE : INK}" stop-opacity="${washOpacity * 0.6}"/><stop offset="1" stop-color="${light ? BONE : INK}" stop-opacity="0"/></linearGradient></defs><rect x="0" y="${top ? 0 : y - 160}" width="${W}" height="${top ? y + bh + 200 : H - y + 160}" fill="url(#w)"/></svg>`
      : null;
  const layers: sharp.OverlayOptions[] = [];
  if (wash) layers.push({ input: Buffer.from(wash) });
  const markUnder = await regionStats(photo, H - 130, 70);
  const markOnLight = !top && washOpacity > 0 ? light : markUnder.mean > 132;
  layers.push({ input: Buffer.from(textSvg(post.lines, size, fg, y, markOnLight ? INK : BONE, { arrow: opts.arrow })) });
  return sharp(photo).composite(layers).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

/** What the profile looks like: newest top-left, 3:4 thumbnails, 3 across. */
export async function renderGridPreview(files: string[], out: string): Promise<void> {
  const tw = 360;
  const th = 480;
  const gap = 3;
  const header = 120;
  const rows = Math.ceil(files.length / 3);
  const comps: sharp.OverlayOptions[] = [
    {
      input: Buffer.from(
        `<svg width="${tw * 3 + gap * 2}" height="${header}" xmlns="http://www.w3.org/2000/svg"><text x="24" y="72" font-family="${SANS}" font-size="34" font-weight="700" fill="${INK}">remedyrecoveries</text></svg>`,
      ),
      left: 0,
      top: 0,
    },
  ];
  for (let i = 0; i < files.length; i++) {
    const thumb = await sharp(files[i]!).resize(tw, th, { fit: "cover", position: "centre" }).toBuffer();
    comps.push({ input: thumb, left: (i % 3) * (tw + gap), top: header + Math.floor(i / 3) * (th + gap) });
  }
  await sharp({ create: { width: tw * 3 + gap * 2, height: header + rows * (th + gap), channels: 3, background: "#FFFFFF" } })
    .composite(comps)
    .jpeg({ quality: 88 })
    .toFile(out);
}
