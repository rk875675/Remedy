import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const engineAssetsOut = path.resolve(repo, "growth-engine/assets/statics");
const webPublicOut = path.resolve(repo, "growth-engine/apps/web/public/statics");

export const WIDTH = 1080;
export const HEIGHT = 1350;

const MARGIN_X = 72;
const SAFE_RIGHT = 80;
const MAX_TEXT_W = WIDTH - MARGIN_X - SAFE_RIGHT;

/** App brand green, lightened so it reads on a dark photo. */
const KICKER = "#D2E4D6";
const HEAD = "#FAF7F4";
const SUB = "rgba(250,247,244,0.9)";
/** Bottom inset. Meta draws Install under the image, so the photo stays clear of a second CTA. */
const BOTTOM_PAD = 96;

export const MetaStaticAdConfigSchema = z
  .object({
    id: z.string(),
    headline: z.string(),
    headlineLines: z.array(z.string()).min(1).max(5),
    subline: z.array(z.string()).min(1).max(4),
    /** One quieter line under the headline, still in the headline face. */
    subhead: z.boolean().optional(),
    /** scrim is the original full-bleed type. The others are separate layouts. */
    format: z.enum(["scrim", "caption", "phone", "note", "object", "band"]).optional(),
    kicker: z.string(),
    photo: z.string().optional(),
    photoText: z.enum(["top", "bottom"]),
    textAlignment: z.enum(["left", "center"]).default("left"),
    icp: z
      .object({
        name: z.string(),
        age: z.string(),
        persona: z.string(),
        friction: z.string(),
        emotionalOutcome: z.string(),
      })
      .strict(),
    copy: z
      .object({
        primaryText: z.string(),
        metaHeadline: z.string(),
        description: z.string(),
        callToAction: z.string(),
      })
      .strict(),
  })
  .strict();

export type MetaStaticAdConfig = z.infer<typeof MetaStaticAdConfigSchema>;

export const STATIC_ADS: MetaStaticAdConfig[] = [
  {
    id: "static-01-bending-down",
    headline: "Stop calculating the risk of bending down.",
    headlineLines: ["Stop calculating the", "risk of bending down."],
    subline: [
      "Pick your kid up without holding your breath.",
      "A personalized recovery plan for lasting relief.",
    ],
    kicker: "REMEDY · BACK REHABILITATION",
    photo: "growth-engine/assets/statics/src/dad-son-bend.jpg",
    photoText: "top",
    textAlignment: "left",
    icp: {
      name: "David",
      age: "36",
      persona: "The Hesitant Dad / Active Avoidance Sufferer",
      friction: "Calculates the risk before picking up his son or tying shoes.",
      emotionalOutcome: "Spontaneous confidence to move with his kid without holding his breath.",
    },
    copy: {
      primaryText:
        "When was the last time you bent down without holding your breath?\n\nIf you have a toddler, a desk job, or a back that flares up every few weeks, you know the feeling: that split-second calculation before you bend over to pick up a toy, grab your keys, or lift your kid.\n\nRandom YouTube stretches don't fix that. They give you 10 minutes of relief before the stiffness resets.\n\nRemedy builds a personalized recovery plan from your pain history and daily habits. 8 to 12 minutes a day. Follow the video on your iPhone.\n\nGet your back back.",
      metaHeadline: "Stop calculating the risk of bending down.",
      description: "A personalized recovery plan for lasting relief.",
      callToAction: "Install Now",
    },
  },
  {
    id: "static-02-cracked-back",
    headline: "You just cracked your back for the 7th time today.",
    headlineLines: ["You just cracked your back", "for the 7th time today."],
    subline: ["The pain came right back."],
    subhead: true,
    kicker: "REMEDY · DAILY BACK PROGRAM",
    photo: "growth-engine/assets/statics/src/desk-back-ordinary.jpg",
    photoText: "bottom",
    textAlignment: "left",
    icp: {
      name: "Maya",
      age: "31",
      persona: "The Desk Worker / Temporary Relief Trap",
      friction: "Cracks their back and rolls out just to feel relief that resets within minutes.",
      emotionalOutcome: "Sitting through a workday without thinking about their back.",
    },
    copy: {
      primaryText:
        "Twisting in your chair. Cracking your lower back against the backrest. Using a foam roller before bed.\n\nIt feels good for about 8 minutes. Then you sit back down, and the exact same dull throb returns.\n\nCracking your back feels like relief, then the ache comes right back. That's why you're doing it 10 times a day.\n\nRemedy gives you a short daily back program built from your answers. Real stability, so you can sit through work and forget you have a lower back.",
      metaHeadline: "You just cracked your back for the 7th time today.",
      description: "Break the temporary relief loop.",
      callToAction: "Install Now",
    },
  },
  {
    id: "static-03-first-thought-morning",
    headline: "Your lower back shouldn't be your first thought every morning.",
    headlineLines: ["Your lower back", "shouldn't be your first", "thought every morning."],
    subline: ["Roll out of bed without testing your spine first.", "A short recovery routine that fits into your morning."],
    kicker: "REMEDY · PERSONALIZED PROGRAM",
    photo: "growth-engine/assets/pins/bed-edge-young.jpg",
    photoText: "bottom",
    textAlignment: "left",
    icp: {
      name: "Elena",
      age: "52",
      persona: "The Morning Bracer / Chronic Stiffness Sufferer",
      friction: "Wakes up scanning her back before her feet hit the floor.",
      emotionalOutcome: "Waking up unburdened, without a mental body check.",
    },
    copy: {
      primaryText:
        "Alarm rings. Before your feet touch the floor, you do the mental scan: How stiff is it today? Is this going to be an okay day, or a slow day?\n\nYour back shouldn't dictate how your morning starts.\n\nRemedy takes your pain history, movement patterns, and schedule and builds a short daily recovery routine. Right from your bedroom or living room.\n\nNo waiting rooms. No random exercises.",
      metaHeadline: "Your lower back shouldn't be your first thought every morning.",
      description: "Wake up feeling normal again.",
      callToAction: "Install Now",
    },
  },
  {
    id: "static-04-best-chair",
    format: "caption",
    headline: "You bought the best chair. Your back still hurts.",
    headlineLines: ["You bought the best chair."],
    subline: ["Your back still hurts."],
    kicker: "",
    photo: "growth-engine/assets/statics/src/mesh-headrest-chair.jpg",
    photoText: "top",
    icp: {
      name: "Chris",
      age: "41",
      persona: "Bought the chair",
      friction: "Paid for the expensive chair and the ache is still there.",
      emotionalOutcome: "A back that does not depend on the chair.",
    },
    copy: {
      primaryText:
        "You bought the best chair. Your back still hurts.\n\nThe chair was supposed to be the fix. You still shift, still press a hand into your back, still think about it by the afternoon.\n\nRemedy builds a short daily plan from your answers.",
      metaHeadline: "You bought the best chair. Your back still hurts.",
      description: "A short daily plan for your back.",
      callToAction: "Install Now",
    },
  },
  {
    id: "static-05-every-video",
    format: "phone",
    headline: "You followed every video. Your back still hurts at your desk.",
    headlineLines: ["You followed every video."],
    subline: ["Your back still hurts at your desk."],
    subhead: true,
    kicker: "",
    photo: "growth-engine/assets/statics/src/desk-after-videos.jpg",
    photoText: "top",
    icp: {
      name: "Priya",
      age: "34",
      persona: "Followed the videos",
      friction: "Did the stretch videos and the desk ache is still there.",
      emotionalOutcome: "A workday that is not about her back.",
    },
    copy: {
      primaryText:
        "You followed every video. Your back still hurts at your desk.\n\nThe video ends. You sit back down. The ache is in the same place.\n\nRemedy is a plan that keeps going, built from your answers.",
      metaHeadline: "You followed every video. Your back still hurts.",
      description: "A plan that keeps going.",
      callToAction: "Install Now",
    },
  },
  {
    id: "static-06-years",
    format: "note",
    headline: "It's been years. You still don't trust your back to bend.",
    headlineLines: ["It's been years."],
    subline: ["You still don't trust", "your back to bend."],
    kicker: "",
    photo: "growth-engine/assets/statics/src/keys-on-floor.jpg",
    photoText: "top",
    icp: {
      name: "Elena",
      age: "48",
      persona: "Years of not trusting the bend",
      friction: "Has had this long enough that bending feels like a risk.",
      emotionalOutcome: "Bending down without running the calculation.",
    },
    copy: {
      primaryText:
        "It's been years. You still don't trust your back to bend.\n\nYou pause before you pick something up. You have learned to live around it.\n\nRemedy is a short daily plan, built from your answers.",
      metaHeadline: "It's been years. You still don't trust your back to bend.",
      description: "A short daily plan, from your answers.",
      callToAction: "Install Now",
    },
  },
  {
    id: "static-07-massage-gun",
    format: "object",
    headline: "Keep the massage gun. Your back will hurt again tomorrow.",
    headlineLines: ["Keep the massage gun."],
    subline: ["Your back will hurt", "again tomorrow."],
    kicker: "",
    photo: "growth-engine/assets/statics/src/massage-gun-couch.jpg",
    photoText: "top",
    icp: {
      name: "Matt",
      age: "36",
      persona: "Massage gun every night",
      friction: "The gun feels good tonight and the ache is back in the morning.",
      emotionalOutcome: "A morning that is not a repeat of last night.",
    },
    copy: {
      primaryText:
        "Keep the massage gun. Your back will hurt again tomorrow.\n\nIt feels better for a little while. Then you wake up and it is the same ache.\n\nRemedy is a short daily plan, built from your answers.",
      metaHeadline: "Keep the massage gun. Your back will hurt again tomorrow.",
      description: "Relief that is still there tomorrow.",
      callToAction: "Install Now",
    },
  },
  {
    id: "static-08-morning-stretches",
    format: "band",
    headline: "Those morning stretches feel good. Then you sit down.",
    headlineLines: ["Those morning stretches", "feel good."],
    subline: ["Then you sit down."],
    subhead: true,
    kicker: "",
    photo: "growth-engine/assets/statics/src/sit-after-stretch.jpg",
    photoText: "top",
    icp: {
      name: "Hannah",
      age: "38",
      persona: "Stretches, then the chair",
      friction: "The stretch feels good until she sits down for the day.",
      emotionalOutcome: "A sit that does not undo the morning.",
    },
    copy: {
      primaryText:
        "Those morning stretches feel good. Then you sit down.\n\nTen minutes on the mat. Then the chair. By lunch the ache is back where it started.\n\nRemedy is a short daily plan, built from your answers.",
      metaHeadline: "Those morning stretches feel good. Then you sit down.",
      description: "A short daily plan for the rest of the day.",
      callToAction: "Install Now",
    },
  },
];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function longest(lines: string[]): string {
  return lines.reduce((a, b) => (a.length >= b.length ? a : b), "");
}

/** Shrink until the longest line fits. Ratio is conservative so Georgia cannot clip. */
function fitSize(lines: string[], start: number, min: number, ratio: number): number {
  let size = start;
  while (size > min && longest(lines).length * size * ratio > MAX_TEXT_W) size -= 2;
  const width = longest(lines).length * size * ratio;
  if (width > MAX_TEXT_W) {
    throw new Error(`Line still overflows at ${size}px: "${longest(lines)}"`);
  }
  return size;
}

function renderOverlaySvg(config: MetaStaticAdConfig): string {
  const isTop = config.photoText === "top";
  const textX = MARGIN_X;
  const anchor = "start";

  const hasKicker = config.kicker.trim().length > 0;
  const kickerSize = hasKicker ? fitSize([config.kicker], 22, 16, 0.68) : 0;
  const headSize = fitSize(config.headlineLines, config.headlineLines.length > 2 ? 64 : 72, 42, 0.56);
  const subSize = fitSize(config.subline, config.subhead ? 46 : 30, config.subhead ? 32 : 20, config.subhead ? 0.54 : 0.56);
  const headLH = Math.round(headSize * 1.14);
  const subLH = Math.round(subSize * 1.32);

  const headFamily = "Georgia, 'Times New Roman', serif";
  const uiFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
  const subFamily = config.subhead ? headFamily : uiFamily;
  const subFill = config.subhead ? "rgba(250,247,244,0.82)" : SUB;

  const blockHeight = (hasKicker ? kickerSize + 26 : 0) + config.headlineLines.length * headLH + 18 + config.subline.length * subLH;
  const startY = isTop ? 96 : HEIGHT - BOTTOM_PAD - blockHeight;

  let currentY = startY;
  const parts: string[] = [];

  const scrim = isTop
    ? `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(22,18,16,0.88)"/>
        <stop offset="38%" stop-color="rgba(22,18,16,0.55)"/>
        <stop offset="70%" stop-color="rgba(22,18,16,0.12)"/>
        <stop offset="100%" stop-color="rgba(22,18,16,0)"/>
      </linearGradient></defs>
      <rect width="${WIDTH}" height="${Math.round(HEIGHT * 0.62)}" fill="url(#scrim)"/>`
    : `<defs><linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="rgba(22,18,16,0)"/>
        <stop offset="34%" stop-color="rgba(22,18,16,0.28)"/>
        <stop offset="62%" stop-color="rgba(22,18,16,0.78)"/>
        <stop offset="100%" stop-color="rgba(22,18,16,0.94)"/>
      </linearGradient></defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#scrim)"/>`;

  if (hasKicker) {
    parts.push(
      `<text x="${textX}" y="${currentY + kickerSize}" text-anchor="${anchor}" font-family="${uiFamily}" font-size="${kickerSize}" font-weight="700" letter-spacing="2.4" fill="${KICKER}">${esc(config.kicker)}</text>`,
    );
    currentY += kickerSize + 26;
  }
  currentY += Math.round(headSize * 0.82);

  for (const line of config.headlineLines) {
    parts.push(
      `<text x="${textX}" y="${currentY}" text-anchor="${anchor}" font-family="${headFamily}" font-size="${headSize}" font-weight="400" letter-spacing="-0.6" fill="${HEAD}">${esc(line)}</text>`,
    );
    currentY += headLH;
  }
  currentY += config.subhead ? 36 : 18 - Math.round(headLH * 0.12);

  for (const line of config.subline) {
    parts.push(
      `<text x="${textX}" y="${currentY}" text-anchor="${anchor}" font-family="${subFamily}" font-size="${subSize}" font-weight="400" fill="${subFill}">${esc(line)}</text>`,
    );
    currentY += subLH;
  }

  return `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">${scrim}${parts.join("")}</svg>`;
}

const INK = "#1C1C1E";

async function coverPhoto(rel: string, w: number, h: number, position: "centre" | "north" = "centre"): Promise<Buffer> {
  const photoPath = path.resolve(repo, rel);
  if (!fs.existsSync(photoPath)) throw new Error(`Photo file does not exist: ${photoPath}`);
  return sharp(photoPath).rotate().resize(w, h, { fit: "cover", position }).png().toBuffer();
}

function inkBlock(
  lines: string[],
  size: number,
  color: string,
  family: string,
  x: number,
  y: number,
  lift = false,
): string {
  const lh = Math.round(size * (lift ? 1.34 : 1.16));
  let baseline = y + Math.round(size * 0.82);
  const stroke = lift ? ` stroke="#F4EFE6" stroke-width="5" paint-order="stroke fill"` : "";
  return lines
    .map((line) => {
      const node = `<text x="${x}" y="${baseline}" text-anchor="start" font-family="${family}" font-size="${size}" font-weight="400" fill="${color}"${stroke}>${esc(line)}</text>`;
      baseline += lh;
      return node;
    })
    .join("");
}

/** Headline sits on the photo. No separate caption bar. */
async function renderTopInk(config: MetaStaticAdConfig, x = 72, lift = false, drop = 0): Promise<Buffer> {
  if (!config.photo) throw new Error(`${config.id} needs a photo`);
  const photo = await coverPhoto(config.photo, WIDTH, HEIGHT, drop > 0 ? "centre" : "north");
  const georgia = "Georgia, 'Times New Roman', serif";
  const headSize = fitSize(config.headlineLines, 62, 40, 0.52);
  const subSize = fitSize(config.subline, 42, 28, 0.52);
  const textY = drop > 0 ? 36 : 108;
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    ${inkBlock(config.headlineLines, headSize, INK, georgia, x, textY, lift)}
    ${inkBlock(config.subline, subSize, INK, georgia, x, textY + config.headlineLines.length * Math.round(headSize * (lift ? 1.34 : 1.16)) + 28, lift)}
  </svg>`;
  let base = photo;
  if (drop > 0) {
    const wall = await sharp(photo)
      .extract({ left: 900, top: 16, width: 140, height: 100 })
      .resize(WIDTH, drop + 24, { fit: "fill" })
      .blur(10)
      .png()
      .toBuffer();
    base = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 3, background: "#e6e2dc" },
    })
      .composite([
        { input: wall, left: 0, top: 0 },
        { input: photo, left: 0, top: drop },
      ])
      .png()
      .toBuffer();
  }
  return sharp(base).composite([{ input: Buffer.from(svg), left: 0, top: 0 }]).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}

async function renderBottomType(config: MetaStaticAdConfig): Promise<Buffer> {
  if (!config.photo) throw new Error(`${config.id} needs a photo`);
  const photo = await coverPhoto(config.photo, WIDTH, HEIGHT, "centre");
  const withBottom = { ...config, photoText: "bottom" as const, kicker: "" };
  return sharp(photo)
    .composite([{ input: Buffer.from(renderOverlaySvg(withBottom)), left: 0, top: 0 }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

async function renderCaption(config: MetaStaticAdConfig): Promise<Buffer> {
  return renderTopInk(config, 72, false, 200);
}

async function renderPhone(config: MetaStaticAdConfig): Promise<Buffer> {
  return renderBottomType(config);
}

async function renderNote(config: MetaStaticAdConfig): Promise<Buffer> {
  return renderTopInk(config, 72, false);
}

async function renderObject(config: MetaStaticAdConfig): Promise<Buffer> {
  return renderTopInk(config, 240, false);
}

async function renderBand(config: MetaStaticAdConfig): Promise<Buffer> {
  return renderBottomType(config);
}

export async function renderStaticAd(config: MetaStaticAdConfig): Promise<Buffer> {
  MetaStaticAdConfigSchema.parse(config);
  if (config.format === "caption") return renderCaption(config);
  if (config.format === "phone") return renderPhone(config);
  if (config.format === "note") return renderNote(config);
  if (config.format === "object") return renderObject(config);
  if (config.format === "band") return renderBand(config);

  if (!config.photo) throw new Error(`${config.id} needs a photo`);
  const fitted = await sharp(path.resolve(repo, config.photo))
    .rotate()
    .resize(WIDTH, HEIGHT, { fit: "cover", position: "centre" })
    .png()
    .toBuffer();

  return sharp(fitted)
    .composite([{ input: Buffer.from(renderOverlaySvg(config)), left: 0, top: 0 }])
    .jpeg({ quality: 92, mozjpeg: true })
    .toBuffer();
}

export async function renderAllStatics(): Promise<void> {
  fs.mkdirSync(engineAssetsOut, { recursive: true });
  fs.mkdirSync(webPublicOut, { recursive: true });

  for (const ad of STATIC_ADS) {
    const buf = await renderStaticAd(ad);
    const fileName = `${ad.id}.jpg`;
    fs.writeFileSync(path.join(engineAssetsOut, fileName), buf);
    fs.writeFileSync(path.join(webPublicOut, fileName), buf);
    const meta = await sharp(buf).metadata();
    console.log(`Rendered ${fileName} ${meta.width}x${meta.height} (${buf.length} bytes)`);
  }

  const manifest = JSON.stringify(STATIC_ADS, null, 2);
  fs.writeFileSync(path.join(engineAssetsOut, "meta-campaign-manifest.json"), manifest, "utf8");
  fs.writeFileSync(path.join(webPublicOut, "meta-campaign-manifest.json"), manifest, "utf8");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  renderAllStatics().catch((err) => {
    console.error("Render failed:", err);
    process.exit(1);
  });
}
