/**
 * Renders the pinned slideshows into apps/web/public/pins.
 * Separate from carousel generate. Re-run after editing pins/content.ts:
 *   npx tsx scripts/render-pins.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  PIN_H,
  PIN_W,
  PIN_POSTS,
  pinSlideFile,
  type PinBg,
  type PinShot,
  type PinSlide,
} from "../apps/web/src/pins/content.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const outDir = path.resolve(here, "../apps/web/public/pins");
const shotDir = path.join(repo, "app-store", "img");

const CREAM = "#FAF7F4";
const GREEN = "#33663f";
const INK = "#2C2C2E";
const WARM = "#F5F0EB";
const MUTED = "#888888";
const WARM_SUB = "rgba(255,255,255,0.55)";

const SHOTS: Record<PinShot, string> = {
  session: "session.png",
  progress: "progress.png",
  workout_days: "workout_days.png",
  pain_check: "pain_check_8.png",
  session_preview: "session_preview.png",
  cat_cow: "cat_cow.png",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function roundCorners(buf: Buffer, radius: number): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 10;
  const h = meta.height ?? 10;
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  return sharp(buf).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

const FOCUS: Partial<Record<PinShot, { topPct: number; heightPct: number }>> = {
  // Question through the clinician line. Skip the status bar, keep the slider whole.
  pain_check: { topPct: 0.18, heightPct: 0.58 },
};

async function makePhone(shot: PinShot, outerW: number): Promise<{ buf: Buffer; width: number; height: number }> {
  const pad = 14;
  const innerW = outerW - pad * 2;
  const src = path.join(shotDir, SHOTS[shot]);
  const focus = FOCUS[shot];
  let pipeline = sharp(src);
  if (focus) {
    const meta = await sharp(src).metadata();
    const srcW = meta.width ?? innerW;
    const srcH = meta.height ?? innerW * 2;
    pipeline = sharp(src).extract({
      left: 0,
      top: Math.round(srcH * focus.topPct),
      width: srcW,
      height: Math.max(1, Math.round(srcH * focus.heightPct)),
    });
  }
  const screen = await pipeline.resize({ width: innerW }).png().toBuffer();
  const meta = await sharp(screen).metadata();
  const innerH = meta.height ?? innerW * 2;
  const outerH = innerH + pad * 2;
  const outerR = Math.round(outerW * 0.068);
  const innerR = Math.round(innerW * 0.062);
  const rounded = await roundCorners(screen, innerR);
  const frame = Buffer.from(
    `<svg width="${outerW}" height="${outerH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${outerW}" height="${outerH}" rx="${outerR}" fill="#1d1d1f"/>
      <rect x="1" y="1" width="${outerW - 2}" height="${outerH - 2}" rx="${outerR - 1}" fill="none" stroke="rgba(255,255,255,0.08)"/>
    </svg>`,
  );
  const buf = await sharp(frame).composite([{ input: rounded, left: pad, top: pad }]).png().toBuffer();
  return { buf, width: outerW, height: outerH };
}

async function appIcon(size: number): Promise<Buffer> {
  const img = await sharp(path.join(shotDir, "icon.png")).resize(size, size).png().toBuffer();
  return roundCorners(img, Math.round(size * 0.225));
}

function textSvg(
  slide: PinSlide,
  phone: boolean,
  opts: { align?: "center" | "left"; bottom?: boolean } = {},
): { svg: string; textBottom: number; textTop: number } {
  const left = opts.align === "left";
  const x = left ? 84 : PIN_W / 2;
  const anchor = left ? "start" : "middle";
  const dark = slide.bg === "cream";
  const headFill = dark ? INK : WARM;
  const subFill = slide.subStrong ? headFill : dark ? MUTED : WARM_SUB;
  const headSize = phone ? 76 : slide.mark ? 96 : 88;
  const headLH = Math.round(headSize * 1.12);
  const subSize = slide.subStrong ? (phone ? 34 : 44) : phone ? 30 : 34;
  const subLH = Math.round(subSize * 1.28);
  const headFamily = "Georgia, 'Times New Roman', serif";
  const subFamily = slide.subStrong ? headFamily : "'Segoe UI', Helvetica, Arial, sans-serif";

  const iconBlock = slide.mark ? 96 + 40 : 0;
  const headBlock = slide.headline.length * headLH;
  const gap = 22;
  const subBlock = slide.sub.length * subLH;
  const total = iconBlock + headBlock + gap + subBlock;

  const top = opts.bottom ? PIN_H - 104 - total : phone ? 108 : Math.round((PIN_H - total) / 2);
  let baseline = top + (slide.mark ? 96 + 40 : 0) + Math.round(headSize * 0.82);
  const parts: string[] = [];

  for (const line of slide.headline) {
    parts.push(
      `<text x="${x}" y="${baseline}" text-anchor="${anchor}" font-family="${headFamily}" font-size="${headSize}" font-weight="400" letter-spacing="-0.6" fill="${headFill}">${esc(line)}</text>`,
    );
    baseline += headLH;
  }
  baseline += gap - Math.round(headLH * 0.15);
  for (const line of slide.sub) {
    parts.push(
      `<text x="${x}" y="${baseline}" text-anchor="${anchor}" font-family="${subFamily}" font-size="${subSize}" font-weight="400" fill="${subFill}">${esc(line)}</text>`,
    );
    baseline += subLH;
  }

  const svg = `<svg width="${PIN_W}" height="${PIN_H}" xmlns="http://www.w3.org/2000/svg">${parts.join("")}</svg>`;
  return { svg, textBottom: baseline, textTop: top };
}

function bg(slideBg: PinBg): string {
  return slideBg === "green" ? GREEN : CREAM;
}

function photoTextSvg(slide: PinSlide): string {
  const atBottom = slide.photoText === "bottom";
  const headSize = 76;
  const headLH = Math.round(headSize * 1.1);
  const subSize = slide.subStrong ? 40 : 32;
  const subLH = Math.round(subSize * 1.28);
  const headFamily = "Georgia, 'Times New Roman', serif";
  const subFamily = slide.subStrong ? headFamily : "'Segoe UI', Helvetica, Arial, sans-serif";
  const headFill = "#F5F0EB";
  const subFill = "rgba(245,240,235,0.88)";
  const block = slide.headline.length * headLH + 18 + slide.sub.length * subLH;
  let baseline = atBottom
    ? PIN_H - 150 - block + Math.round(headSize * 0.8)
    : 168 + Math.round(headSize * 0.8);
  const parts: string[] = [];
  for (const line of slide.headline) {
    parts.push(
      `<text x="${PIN_W / 2}" y="${baseline}" text-anchor="middle" font-family="${headFamily}" font-size="${headSize}" font-weight="400" letter-spacing="-0.6" fill="${headFill}">${esc(line)}</text>`,
    );
    baseline += headLH;
  }
  baseline += 18;
  for (const line of slide.sub) {
    parts.push(
      `<text x="${PIN_W / 2}" y="${baseline}" text-anchor="middle" font-family="${subFamily}" font-size="${subSize}" font-weight="400" fill="${subFill}">${esc(line)}</text>`,
    );
    baseline += subLH;
  }
  const scrim = atBottom
    ? `<defs><linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="rgba(0,0,0,0)"/>` +
      `<stop offset="52%" stop-color="rgba(0,0,0,0)"/>` +
      `<stop offset="78%" stop-color="rgba(0,0,0,0.38)"/>` +
      `<stop offset="100%" stop-color="rgba(0,0,0,0.66)"/>` +
      `</linearGradient></defs>`
    : `<defs><linearGradient id="edge" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="rgba(0,0,0,0.62)"/>` +
      `<stop offset="38%" stop-color="rgba(0,0,0,0.28)"/>` +
      `<stop offset="68%" stop-color="rgba(0,0,0,0)"/>` +
      `</linearGradient></defs>`;
  return `<svg width="${PIN_W}" height="${PIN_H}" xmlns="http://www.w3.org/2000/svg">${scrim}<rect width="${PIN_W}" height="${PIN_H}" fill="url(#edge)"/>${parts.join("")}</svg>`;
}

async function renderPhotoSlide(slide: PinSlide): Promise<Buffer> {
  if (!slide.photo) throw new Error("Missing photo");
  const src = path.join(repo, slide.photo);
  const fitted = await sharp(src)
    .rotate()
    .resize(PIN_W, PIN_H, { fit: "cover", position: "attention" })
    .png()
    .toBuffer();
  return sharp(fitted)
    .composite([{ input: Buffer.from(photoTextSvg(slide)), left: 0, top: 0 }])
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function renderSlide(slide: PinSlide): Promise<Buffer> {
  if (slide.photo) return renderPhotoSlide(slide);
  const layout = slide.shot ? (slide.phoneLayout ?? "center") : "center";
  const { svg, textBottom, textTop } = textSvg(slide, Boolean(slide.shot), {
    align: layout === "tilt" ? "left" : "center",
    bottom: layout === "top",
  });
  const layers: sharp.OverlayOptions[] = [];
  let canvasH = PIN_H;
  let canvasW = PIN_W;

  if (slide.mark) {
    const size = 96;
    const icon = await appIcon(size);
    const iconBlock = 96 + 40;
    const headSize = 96;
    const headLH = Math.round(headSize * 1.12);
    const subSize = slide.subStrong ? 44 : 34;
    const subLH = Math.round(subSize * 1.28);
    const total = iconBlock + slide.headline.length * headLH + 22 + slide.sub.length * subLH;
    const top = Math.round((PIN_H - total) / 2);
    layers.push({ input: icon, left: Math.round((PIN_W - size) / 2), top });
  }

  if (slide.shot && layout === "top") {
    const phone = await makePhone(slide.shot, 780);
    const top = 72;
    const left = Math.round((PIN_W - phone.width) / 2);
    const shadow = await sharp(phone.buf).ensureAlpha().linear([0, 0, 0, 0.2], [0, 0, 0, 0]).png().toBuffer();
    layers.push({ input: shadow, left: left + 8, top: top + 16 });
    layers.push({ input: phone.buf, left, top });
    canvasH = Math.max(PIN_H, top + phone.height + 24);
    const fadeTop = textTop - 260;
    const fill = bg(slide.bg);
    const fade = Buffer.from(
      `<svg width="${PIN_W}" height="${canvasH}" xmlns="http://www.w3.org/2000/svg">` +
        `<defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0%" stop-color="${fill}" stop-opacity="0"/>` +
        `<stop offset="100%" stop-color="${fill}" stop-opacity="1"/>` +
        `</linearGradient></defs>` +
        `<rect x="0" y="${fadeTop}" width="${PIN_W}" height="220" fill="url(#f)"/>` +
        `<rect x="0" y="${fadeTop + 219}" width="${PIN_W}" height="${canvasH - fadeTop}" fill="${fill}"/>` +
        `</svg>`,
    );
    layers.push({ input: fade, left: 0, top: 0 });
  } else if (slide.shot && layout === "tilt") {
    const phone = await makePhone(slide.shot, 640);
    const clear = { r: 0, g: 0, b: 0, alpha: 0 };
    const rotated = await sharp(phone.buf).rotate(8, { background: clear }).png().toBuffer();
    const rMeta = await sharp(rotated).metadata();
    const rw = rMeta.width ?? phone.width;
    const rh = rMeta.height ?? phone.height;
    const left = 380;
    const top = textBottom - 40;
    const shadow = await sharp(rotated).ensureAlpha().linear([0, 0, 0, 0.22], [0, 0, 0, 0]).png().toBuffer();
    layers.push({ input: shadow, left: left + 14, top: top + 22 });
    layers.push({ input: rotated, left, top });
    canvasW = Math.max(PIN_W, left + rw + 40);
    canvasH = Math.max(PIN_H, top + rh + 40);
  } else if (slide.shot) {
    const phone = await makePhone(slide.shot, slide.shot === "pain_check" ? 640 : 720);
    const top = Math.max(textBottom + 28, 290);
    const left = Math.round((PIN_W - phone.width) / 2);
    canvasH = Math.max(PIN_H, top + 40);
    const shadow = await sharp(phone.buf)
      .ensureAlpha()
      .linear([0, 0, 0, 0.2], [0, 0, 0, 0])
      .png()
      .toBuffer();
    layers.push({ input: shadow, left: left + 8, top: top + 16 });
    layers.push({ input: phone.buf, left, top });
    canvasH = Math.max(canvasH, top + phone.height + 24);
  }

  layers.push({ input: Buffer.from(svg), left: 0, top: 0 });

  const tall = await sharp({
    create: {
      width: canvasW,
      height: canvasH,
      channels: 4,
      background: bg(slide.bg),
    },
  })
    .composite(layers)
    .png()
    .toBuffer();

  return sharp(tall)
    .extract({ left: 0, top: 0, width: PIN_W, height: PIN_H })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
}

async function main(): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true });
  for (const name of fs.readdirSync(outDir)) {
    if (name.endsWith(".jpg")) fs.unlinkSync(path.join(outDir, name));
  }
  for (const post of PIN_POSTS) {
    for (let i = 0; i < post.slides.length; i++) {
      const file = pinSlideFile(post.id, i);
      const buf = await renderSlide(post.slides[i]);
      const dest = path.join(outDir, file);
      fs.writeFileSync(dest, buf);
      console.log(`${file}  ${buf.length} bytes`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
