import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";
import { BRAND, ASSETS_DIR, OUTPUT_DIR, ROOT_DIR } from "../config.js";
import {
  type Variation,
  SHOT_SCALE_SPEC,
  backgroundSvg,
  isDarkBackground,
  fontFamily,
} from "./variations.js";
import type { SlideKind } from "./templates.js";
import { illustrationFilePath, illustrationForSlide, illustrationRenderableSvg } from "./illustrations.js";
import { isCroppedScreenshot, readScreenshotMeta, resolveCtaScreenshot } from "./screenshots.js";
import { stripTipNumberPrefix } from "./hooks.js";

export const SLIDE_W = 1080;
/** TikTok photo posts display as 4:5. Designing 9:16 was the crop bug. */
export const SLIDE_H = 1350;
/** Following / search sit on the top of the 4:5 frame — not a huge dead zone. */
const SAFE_TOP = 118;
const SAFE_BOTTOM = 1264;
/** Gap above the REMEDY footer so plates/screenshots never cover the wordmark. */
const FOOTER_CLEARANCE = 88;
/** Bump this whenever framing changes so TikTok pulls new URLs instead of cache. */
export const SLIDE_REV = "v27";
/** Bump when CTA last-slide pixels change so the dashboard does not keep a stale JPEG. */
export const CTA_CACHE = "cta49";

export function slideFileName(index: number): string {
  return `slide-${index + 1}-${SLIDE_REV}.jpg`;
}

export function slideObjectKey(postId: number, index: number): string {
  return `growth/posts/${postId}/${SLIDE_REV}/slide-${index + 1}.jpg`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapText(text: string, fontSize: number, maxWidth: number, charRatio = 0.6): string[] {
  const avgChar = fontSize * charRatio;
  const maxChars = Math.max(8, Math.floor(maxWidth / avgChar));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function textBlockSvg(opts: {
  headline: string;
  sub: string;
  variation: Variation;
  headlineSize: number;
  subSize: number;
  centerY?: number;
  topY?: number;
  maxWidth: number;
  align?: "middle" | "start";
  anchorX?: number;
  /** light = white text (on a photo). dark = ink on cream. */
  ink?: "auto" | "light" | "dark";
}): { svg: string; heightUsed: number } {
  const { headline, sub, variation, headlineSize, subSize, maxWidth } = opts;
  const align = opts.align ?? "middle";
  const anchorX = opts.anchorX ?? SLIDE_W / 2;
  const lightText =
    opts.ink === "light" || (opts.ink !== "dark" && isDarkBackground(variation.background));
  const color = lightText ? BRAND.colors.textOnDark : BRAND.colors.text;
  const subColor = lightText ? "rgba(255,255,255,0.82)" : "rgba(28,28,30,0.72)";
  const family = fontFamily(variation.textStyle);
  const weight = variation.textStyle === "serif" ? "700" : "800";

  const charRatio = variation.textStyle === "mono" ? 0.95 : variation.textStyle === "serif" ? 0.52 : 0.58;
  const hLines = wrapText(headline, headlineSize, maxWidth, charRatio);
  const sLines = sub ? wrapText(sub, subSize, maxWidth, charRatio) : [];
  const hLineH = headlineSize * 1.18;
  const sLineH = subSize * 1.35;
  const totalH = hLines.length * hLineH + (sLines.length ? 30 + sLines.length * sLineH : 0);
  let y = opts.topY != null
    ? opts.topY + headlineSize
    : (opts.centerY ?? SLIDE_H / 2) - totalH / 2 + headlineSize;

  let svg = "";
  for (const line of hLines) {
    svg += `<text x="${anchorX}" y="${y.toFixed(0)}" text-anchor="${align}" font-family="${family}" font-size="${headlineSize}" font-weight="${weight}" fill="${color}">${escapeXml(line)}</text>`;
    y += hLineH;
  }
  if (sLines.length) {
    y += 30;
    for (const line of sLines) {
      svg += `<text x="${anchorX}" y="${y.toFixed(0)}" text-anchor="${align}" font-family="${family}" font-size="${subSize}" font-weight="500" fill="${subColor}">${escapeXml(line)}</text>`;
      y += sLineH;
    }
  }
  return { svg, heightUsed: totalH };
}

function footerSvg(variation: Variation, index: number, total: number, opts?: { photoAtTop?: boolean; hideWordmark?: boolean; hideCounter?: boolean }): string {
  const dark = isDarkBackground(variation.background);
  const color = dark ? "rgba(255,255,255,0.65)" : "rgba(28,28,30,0.55)";
  const family = fontFamily(variation.textStyle);
  const counterX = SLIDE_W - 64;
  const counterY = SAFE_TOP;
  // When a real photo occupies the top of the slide, use a dark pill so the counter
  // is always readable regardless of photo brightness.
  const counterSvg = opts?.hideCounter
    ? ""
    : opts?.photoAtTop
    ? `<rect x="${counterX - 56}" y="${counterY - 26}" width="112" height="40" rx="20" fill="rgba(0,0,0,0.45)"/><text x="${counterX}" y="${counterY + 2}" text-anchor="end" font-family="${family}" font-size="28" font-weight="600" fill="white">${index + 1}/${total}</text>`
    : `<text x="${counterX}" y="${counterY}" text-anchor="end" font-family="${family}" font-size="28" font-weight="600" fill="${color}">${index + 1}/${total}</text>`;
  const wordmark = opts?.hideWordmark
    ? ""
    : `<text x="${SLIDE_W / 2}" y="${SAFE_BOTTOM}" text-anchor="middle" font-family="${family}" font-size="28" font-weight="600" letter-spacing="3" fill="${color}">${BRAND.appName.toUpperCase()}</text>`;
  return wordmark + counterSvg;
}

/** Number badge for tip slides. */
function numberBadgeSvg(num: number, cx: number, cy: number, variation: Variation): string {
  const dark = isDarkBackground(variation.background);
  const badgeFill = dark ? BRAND.colors.cream : BRAND.colors.green;
  const textFill = dark ? BRAND.colors.dark : BRAND.colors.textOnDark;
  const r = 52;
  return (
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${badgeFill}"/>` +
    `<text x="${cx}" y="${cy + 20}" text-anchor="middle" font-family="${fontFamily(variation.textStyle)}" font-size="56" font-weight="800" fill="${textFill}">${num}</text>`
  );
}

/** Big stat number rendering with decorative ring. Sub is always stacked below the headline. */
function statNumberSvg(headline: string, sub: string, variation: Variation): string {
  const dark = isDarkBackground(variation.background);
  const accentColor = dark ? "#b7d5a0" : BRAND.colors.green;
  const subColor = dark ? "rgba(255,255,255,0.8)" : "rgba(28,28,30,0.7)";
  const family = fontFamily(variation.textStyle);
  const isShort = headline.trim().length <= 10;
  let fontSize = isShort ? 140 : 68;
  const maxW = SLIDE_W - 180;
  let hLines = wrapText(headline, fontSize, maxW, isShort ? 0.7 : 0.52);
  while (hLines.length > 2 && fontSize > 48) {
    fontSize -= 6;
    hLines = wrapText(headline, fontSize, maxW, 0.52);
  }
  const lineH = fontSize * 1.22;
  const sLines = sub ? wrapText(sub, 40, SLIDE_W - 200, 0.52) : [];
  const sLineH = 54;
  const gap = 44;
  const blockH = hLines.length * lineH + (sLines.length ? gap + sLines.length * sLineH : 0);
  const top = Math.max(SAFE_TOP + 80, (SLIDE_H - blockH) / 2);
  const cx = SLIDE_W / 2;

  let svg = "";
  if (isShort) {
    const RING_R = 130;
    const ringCy = Math.max(SAFE_TOP + RING_R + 24, SLIDE_H / 2 - 70);
    const ringColor = dark ? "rgba(183,213,160,0.15)" : "rgba(51,102,63,0.1)";
    const ringStroke = dark ? "rgba(183,213,160,0.3)" : "rgba(51,102,63,0.2)";
    svg += `<circle cx="${cx}" cy="${ringCy.toFixed(0)}" r="${RING_R}" fill="${ringColor}" stroke="${ringStroke}" stroke-width="4"/>`;
    svg += `<circle cx="${cx}" cy="${ringCy.toFixed(0)}" r="100" fill="none" stroke="${ringStroke}" stroke-width="2" stroke-dasharray="8,6"/>`;
    // Baseline sits ~0.36em below the ring center so the glyph box is optically centered.
    svg += `<text x="${cx}" y="${(ringCy + fontSize * 0.30).toFixed(0)}" text-anchor="middle" font-family="${family}" font-size="${fontSize}" font-weight="900" fill="${accentColor}">${escapeXml(headline)}</text>`;
    if (sLines.length) {
      let y = ringCy + RING_R + 40;
      for (const line of sLines) {
        svg += `<text x="${cx}" y="${y.toFixed(0)}" text-anchor="middle" font-family="${family}" font-size="40" font-weight="500" fill="${subColor}">${escapeXml(line)}</text>`;
        y += sLineH;
      }
    }
    return svg;
  }

  let y = top + fontSize;
  let lastHeadlineY = y;
  for (const line of hLines) {
    svg += `<text x="${cx}" y="${y.toFixed(0)}" text-anchor="middle" font-family="${family}" font-size="${fontSize}" font-weight="900" fill="${accentColor}">${escapeXml(line)}</text>`;
    lastHeadlineY = y;
    y += lineH;
  }
  if (sLines.length) {
    y = lastHeadlineY + gap + 40;
    for (const line of sLines) {
      svg += `<text x="${cx}" y="${y.toFixed(0)}" text-anchor="middle" font-family="${family}" font-size="40" font-weight="500" fill="${subColor}">${escapeXml(line)}</text>`;
      y += sLineH;
    }
  }
  return svg;
}

async function roundCorners(buf: Buffer, radius: number): Promise<Buffer> {
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 100;
  const h = meta.height ?? 100;
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`,
  );
  return sharp(buf).ensureAlpha().composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
}

// ---------------------------------------------------------------------------
// Per-screenshot crop configuration (editable via the dashboard Crop panel)
// ---------------------------------------------------------------------------

interface CropParam {
  skipTopPct: number;
  cropHPct: number;
  /** exercise_photo slides: fraction of screenshot height to start the crop (skip status bar) */
  exercisePhotoTopPct?: number;
  /** exercise_photo slides: fraction of screenshot height to end the crop */
  exercisePhotoBotPct?: number;
}
const CROP_CONFIG_PATH = path.join(ASSETS_DIR, "crop-config.json");
let _cropConfigCache: Record<string, CropParam> | null = null;

function loadCropConfig(): Record<string, CropParam> {
  if (_cropConfigCache !== null) return _cropConfigCache;
  try {
    if (fs.existsSync(CROP_CONFIG_PATH)) {
      _cropConfigCache = JSON.parse(fs.readFileSync(CROP_CONFIG_PATH, "utf-8")) as Record<string, CropParam>;
      return _cropConfigCache;
    }
  } catch { /* fall through */ }
  _cropConfigCache = {};
  return _cropConfigCache;
}

/** Call this after saving a new crop-config.json so prepareScreenshot picks it up. */
export function invalidateCropConfig(): void {
  _cropConfigCache = null;
}

function screenshotWell(variation: Variation, mediaTop: number): { targetW: number; available: number; pinTop: boolean } {
  const spec = SHOT_SCALE_SPEC[variation.shotScale ?? "contained"];
  const bottom = spec.coversFooter ? SLIDE_H - spec.bottomPad : SAFE_BOTTOM - spec.footerClearance;
  return {
    targetW: SLIDE_W - spec.sidePad * 2,
    available: Math.max(200, bottom - mediaTop),
    pinTop: spec.coversFooter,
  };
}

async function prepareScreenshot(
  file: string,
  variation: Variation,
  maxHLimit?: number,
  targetW = SLIDE_W - 120,
): Promise<{ image: Buffer; shadow: Buffer | null; width: number; height: number }> {
  let srcPath = path.join(ASSETS_DIR, file);
  if (!fs.existsSync(srcPath)) {
    // Screenshot was deleted from the library after this slide was stored —
    // fall back to any remaining screenshot so rerenders don't crash.
    const fallback = fs.existsSync(ASSETS_DIR)
      ? fs.readdirSync(ASSETS_DIR).find((f) => /\.(png|jpe?g|webp)$/i.test(f) && f !== "icon.png")
      : undefined;
    if (!fallback) throw new Error(`Screenshot ${file} missing and no fallback available`);
    srcPath = path.join(ASSETS_DIR, fallback);
    file = fallback;
  }
  const crop = loadCropConfig();
  const cfg = crop[file];
  const alreadyCropped =
    isCroppedScreenshot(file, readScreenshotMeta()[file]) ||
    (cfg?.skipTopPct === 0 && cfg?.cropHPct === 1);
  const maxH = Math.max(200, maxHLimit ?? 1100);
  targetW = Math.max(400, Math.min(SLIDE_W - 16, targetW));

  let plate: Buffer;
  if (alreadyCropped) {
    // User crops are finished assets — scale the whole thing into the well.
    // Never extract again to dodge the REMEDY footer.
    plate = await sharp(srcPath)
      .resize({ width: targetW, height: maxH, fit: "inside" })
      .png()
      .toBuffer();
  } else {
    const skipTopPct = cfg?.skipTopPct ?? 0.09;
    const cropHPct = cfg?.cropHPct ?? 0.45;
    const wide = await sharp(srcPath).resize({ width: targetW }).png().toBuffer();
    const wideMeta = await sharp(wide).metadata();
    const fullH = wideMeta.height ?? targetW * 2;
    const skipTop = Math.min(Math.round(fullH * skipTopPct), Math.max(0, fullH - 1));
    const intendedH = Math.min(Math.round(fullH * cropHPct), fullH - skipTop);
    plate = await sharp(wide)
      .extract({ left: 0, top: skipTop, width: targetW, height: Math.max(1, intendedH) })
      .png()
      .toBuffer();
    const plateH = (await sharp(plate).metadata()).height ?? intendedH;
    if (plateH > maxH) {
      plate = await sharp(plate)
        .resize({ width: targetW, height: maxH, fit: "inside" })
        .png()
        .toBuffer();
    }
  }
  const rounded = await roundCorners(plate, 44);

  let shadow: Buffer | null = null;
  if (variation.frame === "shadow") {
    shadow = await sharp(rounded)
      .linear([0, 0, 0, 0.3], [0, 0, 0, 0])
      .png()
      .toBuffer();
  }
  const meta = await sharp(rounded).metadata();
  return { image: rounded, shadow, width: meta.width ?? targetW, height: meta.height ?? targetW * 2 };
}

/** Decorative line divider. */
function dividerSvg(y: number, variation: Variation): string {
  const dark = isDarkBackground(variation.background);
  const color = dark ? "rgba(255,255,255,0.15)" : "rgba(28,28,30,0.1)";
  return `<line x1="160" y1="${y}" x2="${SLIDE_W - 160}" y2="${y}" stroke="${color}" stroke-width="2"/>`;
}

export interface SlideRenderSpec {
  kind: SlideKind;
  headline: string;
  sub: string;
  screenshot: string | null;
  index: number;
  total: number;
  /** For tip slides: which tip number (1, 2, 3...) */
  tipNumber?: number;
}

/** Exercise screenshots — just session.png and cat_cow.png contain real exercise video frames. */
const EXERCISE_PHOTO_FILES = ["session", "cat_cow"] as const;

/** Front-facing iPhone: tall 9:19.5, black frame, island, shadow. Screen is the full app. */
async function composeRealisticIphone(
  screen: Buffer,
  screenW: number,
  screenH: number,
  opts?: { tight?: boolean },
): Promise<{ image: Buffer; width: number; height: number }> {
  const tight = opts?.tight === true;
  const bezel = 16;
  const top = 16;
  const bottom = 16;
  const outerW = screenW + bezel * 2;
  const outerH = screenH + top + bottom;
  const outerR = Math.round(outerW * (tight ? 0.12 : 0.22));
  const screenR = Math.round(outerR * 0.78);
  const islandW = Math.round(screenW * 0.34);
  const islandH = 28;
  const pad = tight ? 0 : 18;
  const canvasW = outerW + pad * 2;
  const canvasH = outerH + pad * 2 + (tight ? 0 : 12);
  const frameSvg = Buffer.from(
    `<svg width="${outerW}" height="${outerH}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${outerW}" height="${outerH}" rx="${outerR}" fill="#1a1a1c"/>` +
      `<rect x="2" y="2" width="${outerW - 4}" height="${outerH - 4}" rx="${outerR - 2}" fill="#0b0b0d" stroke="#3a3a3e" stroke-width="2"/>` +
      `<rect x="0" y="${Math.round(outerH * 0.18)}" width="3" height="${Math.round(outerH * 0.08)}" rx="1.5" fill="#2c2c2e"/>` +
      `<rect x="0" y="${Math.round(outerH * 0.28)}" width="3" height="${Math.round(outerH * 0.12)}" rx="1.5" fill="#2c2c2e"/>` +
      `<rect x="${outerW - 3}" y="${Math.round(outerH * 0.24)}" width="3" height="${Math.round(outerH * 0.14)}" rx="1.5" fill="#2c2c2e"/>` +
      `</svg>`,
  );
  const islandSvg = Buffer.from(
    `<svg width="${islandW}" height="${islandH}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect width="${islandW}" height="${islandH}" rx="${islandH / 2}" fill="#010101"/>` +
      `</svg>`,
  );
  const rounded = await roundCorners(screen, screenR);
  const body = await sharp({
    create: { width: outerW, height: outerH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: frameSvg, left: 0, top: 0 },
      { input: rounded, left: bezel, top },
      { input: islandSvg, left: Math.round((outerW - islandW) / 2), top: 18 },
    ])
    .png()
    .toBuffer();
  const shadowBlob = await sharp({
    create: { width: outerW, height: 48, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{
      input: Buffer.from(
        `<svg width="${outerW}" height="48"><ellipse cx="${outerW / 2}" cy="20" rx="${Math.round(outerW * 0.42)}" ry="12" fill="rgba(0,0,0,0.35)"/></svg>`,
      ),
      left: 0,
      top: 0,
    }])
    .blur(10)
    .png()
    .toBuffer();
  if (tight) return { image: body, width: outerW, height: outerH };
  const image = await sharp({
    create: { width: canvasW, height: canvasH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: shadowBlob, left: pad, top: pad + outerH - 8 },
      { input: body, left: pad, top: pad },
    ])
    .png()
    .toBuffer();
  return { image, width: canvasW, height: canvasH };
}

async function loadCtaScreen(
  file: string,
  w: number,
  h: number,
  position: "top" | "center" = "top",
): Promise<Buffer> {
  const src = path.join(ASSETS_DIR, file);
  if (!fs.existsSync(src)) throw new Error(`CTA screenshot missing: ${file}`);
  return sharp(src).rotate().resize(Math.round(w), Math.round(h), { fit: "cover", position }).png().toBuffer();
}

/** Per-file crop so the half-phone shows the content cluster, not empty cream. */
const BLEED_CROP: Record<string, { skipTop: number; take: number; insetX: number }> = {
  "img_0525.png": { skipTop: 0.20, take: 0.78, insetX: 0.02 },
  "img_0539.png": { skipTop: 0.34, take: 0.54, insetX: 0.02 },
  "img_0540.png": { skipTop: 0.24, take: 0.40, insetX: 0.04 },
  "img_0524.png": { skipTop: 0.20, take: 0.52, insetX: 0.02 },
  "img_0538.png": { skipTop: 0.24, take: 0.55, insetX: 0.02 },
};

/** 50% screen: keep title + grey copy at full size, shrink only the bar chart to fit. */
async function loadCtaBleed0525(src: Buffer, sw: number, sh: number, w: number, h: number): Promise<Buffer> {
  const cream = { r: 250, g: 248, b: 244, alpha: 1 };
  const titleTop = Math.round(sh * 0.208);
  const titleH = Math.round(sh * 0.228);
  const chartPad = Math.round(sw * 0.055);
  const chartTop = Math.round(sh * 0.465);
  const chartH = Math.round(sh * 0.272);
  const title = await sharp(src)
    .extract({ left: 0, top: titleTop, width: sw, height: titleH })
    .resize(w, Math.round(titleH * (w / sw)))
    .png()
    .toBuffer();
  const titleMeta = await sharp(title).metadata();
  const titleOutH = titleMeta.height ?? Math.round(titleH * (w / sw));
  const bottomSafe = Math.round(h * 0.04);
  const availW = w;
  const availH = Math.max(80, h - titleOutH - bottomSafe);
  const chart = await sharp(src)
    .extract({
      left: chartPad,
      top: chartTop,
      width: sw - chartPad * 2,
      height: chartH,
    })
    .resize(availW, availH, { fit: "inside" })
    .png()
    .toBuffer();
  const chartMeta = await sharp(chart).metadata();
  const cw = chartMeta.width ?? availW;
  const ch = chartMeta.height ?? availH;
  return sharp({
    create: { width: w, height: h, channels: 4, background: cream },
  })
    .composite([
      { input: title, left: 0, top: 0 },
      { input: chart, left: Math.round((w - cw) / 2), top: titleOutH },
    ])
    .png()
    .toBuffer();
}

async function loadCtaBleedScreen(file: string, w: number, h: number): Promise<Buffer> {
  const src = path.join(ASSETS_DIR, file);
  if (!fs.existsSync(src)) throw new Error(`CTA screenshot missing: ${file}`);
  const upright = await sharp(src).rotate().png().toBuffer();
  const meta = await sharp(upright).metadata();
  const sw = meta.width ?? w;
  const sh = meta.height ?? h;
  if (path.basename(file) === "img_0525.png") {
    return loadCtaBleed0525(upright, sw, sh, Math.round(w), Math.round(h));
  }
  const crop = BLEED_CROP[path.basename(file)] ?? { skipTop: 0.18, take: 0.50, insetX: 0.03 };
  const insetX = Math.round(sw * crop.insetX);
  const maxW = Math.max(80, sw - insetX * 2);
  const aspect = w / h;
  let takeH = Math.min(sh - 8, Math.round(sh * crop.take));
  let takeW = Math.round(takeH * aspect);
  let left = Math.round((sw - takeW) / 2);
  let top = Math.round(sh * crop.skipTop);
  if (takeW > maxW) {
    takeW = maxW;
    takeH = Math.round(takeW / aspect);
    left = insetX;
  }
  if (top + takeH > sh) top = Math.max(0, sh - takeH);
  if (left < 0) left = 0;
  if (left + takeW > sw) left = sw - takeW;
  return sharp(upright)
    .extract({
      left,
      top,
      width: Math.max(80, takeW),
      height: Math.max(80, takeH),
    })
    .resize(Math.round(w), Math.round(h), { fit: "fill" })
    .png()
    .toBuffer();
}

/** LOCKED CTA scene. Do not restyle unless the user explicitly asks. */
function ctaAtmosphereSvg(kind: "field" | "dusk" | "haze"): string {
  // Clean deep-forest green — premium, no golf scene.
  // Subtle tonal variation per mood, stays brand-consistent.
  const bg = kind === "dusk" ? "#172A1D" : kind === "haze" ? "#1D3525" : "#1A3020";
  const lo = kind === "dusk" ? "#0F1F13" : kind === "haze" ? "#142B1C" : "#112B1A";
  const hi = kind === "dusk" ? "#223B25" : kind === "haze" ? "#293F2E" : "#1F3D28";
  return (
    `<rect width="${SLIDE_W}" height="${SLIDE_H}" fill="${bg}"/>` +
    // Two barely-visible organic blobs for depth — not grass/sky.
    `<ellipse cx="820" cy="250" rx="540" ry="390" fill="${hi}" opacity="0.20"/>` +
    `<ellipse cx="160" cy="1120" rx="500" ry="350" fill="${lo}" opacity="0.28"/>`
  );
}

/** Real Remedy app icon — green square, white spine — slightly tilted. */
async function loadCtaAppIcon(size: number, tiltDeg = 8): Promise<Buffer> {
  const src = path.join(ASSETS_DIR, "icon.png");
  if (!fs.existsSync(src)) {
    return sharp({
      create: { width: size, height: size, channels: 4, background: { r: 26, g: 48, b: 32, alpha: 1 } },
    }).png().toBuffer();
  }
  const square = await sharp(src).resize(size, size).png().toBuffer();
  const rounded = await roundCorners(square, Math.round(size * 0.22));
  if (!tiltDeg) return rounded;
  return sharp(rounded)
    .rotate(tiltDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** Official US/UK black badge (Apple artwork). Ratio from the source SVG. */
const STORE_BADGE_H = 112;
const STORE_BADGE_ASPECT = 119.66407 / 40;
const STORE_BADGE_W = Math.round(STORE_BADGE_H * STORE_BADGE_ASPECT);
const STORE_BADGE_PATH = path.join(ROOT_DIR, "assets", "badges", "download-on-the-app-store.svg");

async function loadStoreBadge(height = STORE_BADGE_H): Promise<Buffer> {
  const width = Math.round(height * STORE_BADGE_ASPECT);
  if (!fs.existsSync(STORE_BADGE_PATH)) {
    throw new Error(`Missing official App Store badge at ${STORE_BADGE_PATH}`);
  }
  return sharp(STORE_BADGE_PATH, { density: 400 })
    .resize(width, height)
    .png()
    .toBuffer();
}

async function renderCtaProduct(
  spec: SlideRenderSpec,
  variation: Variation,
  composites: sharp.OverlayOptions[],
): Promise<string> {
  const layout = variation.ctaLayout ?? "phone";
  const help = spec.headline.trim() || "Get out of bed without wincing";
  const shotFile = resolveCtaScreenshot(spec.screenshot);
  const atmosphere = variation.ctaAtmosphere ?? "field";
  const bgSvg = ctaAtmosphereSvg(atmosphere);
  const family = fontFamily(variation.textStyle);

  const TAG_FS = 62;
  const tagMaxW = SLIDE_W - 100;
  const tagLines = wrapText(help, TAG_FS, tagMaxW, variation.textStyle === "mono" ? 0.9 : 0.52);
  const tagLineH = TAG_FS * 1.18;

  function taglineSvg(topY: number): string {
    let svg = "";
    let y = topY + TAG_FS;
    for (const line of tagLines) {
      svg += `<text x="${SLIDE_W / 2}" y="${y}" text-anchor="middle" ` +
        `font-family="${family}" font-size="${TAG_FS}" font-weight="800" ` +
        `letter-spacing="-0.4" fill="white">${escapeXml(line)}</text>`;
      y += tagLineH;
    }
    return svg;
  }

  const BAR_ICON = 132;
  const BAR_GAP = 18;
  const NAME_W = 400;
  const TITLE_FS = 72;
  const SUB_FS = 40;
  const listing = BRAND.listingName.split(": ");
  const listingTitle = listing[0] ?? BRAND.appName;
  const listingSub = listing[1] ?? "";
  const barW = BAR_ICON + BAR_GAP + NAME_W + BAR_GAP + STORE_BADGE_W;
  const barLeft = Math.round((SLIDE_W - barW) / 2);
  const rowH = Math.max(BAR_ICON, STORE_BADGE_H, TITLE_FS + 10 + SUB_FS);
  const barBottom = SAFE_BOTTOM - 2;
  const barTop = barBottom - rowH;

  async function placeStoreRow(): Promise<string> {
    const rowIcon = await loadCtaAppIcon(BAR_ICON, 0);
    const rowMeta = await sharp(rowIcon).metadata();
    const rw = rowMeta.width ?? BAR_ICON;
    const rh = rowMeta.height ?? BAR_ICON;
    composites.push({
      input: rowIcon,
      left: barLeft + Math.round((BAR_ICON - rw) / 2),
      top: barTop + Math.round((rowH - rh) / 2),
    });
    const badge = await loadStoreBadge(STORE_BADGE_H);
    const badgeMeta = await sharp(badge).metadata();
    const bh = badgeMeta.height ?? STORE_BADGE_H;
    const badgeLeft = barLeft + BAR_ICON + BAR_GAP + NAME_W + BAR_GAP;
    composites.push({
      input: badge,
      left: badgeLeft,
      top: barTop + Math.round((rowH - bh) / 2),
    });
    const nameX = barLeft + BAR_ICON + BAR_GAP;
    const titleY = barTop + Math.round(rowH / 2) + 4;
    const subY = titleY + SUB_FS + 4;
    return (
      `<text x="${nameX}" y="${titleY}" text-anchor="start" ` +
        `font-family="${family}" font-size="${TITLE_FS}" font-weight="800" letter-spacing="-0.8" fill="#ffffff">${escapeXml(listingTitle)}</text>` +
      `<text x="${nameX}" y="${subY}" text-anchor="start" ` +
        `font-family="${family}" font-size="${SUB_FS}" font-weight="600" fill="#ffffff" opacity="0.9">${escapeXml(listingSub)}</text>`
    );
  }

  if (!shotFile) {
    const tagTop = SAFE_TOP + 20;
    const badge = await placeStoreRow();
    return bgSvg + taglineSvg(tagTop) + badge;
  }

  // Bleed: photo of the *bottom* of a phone — flush top/sides, full chin visible.
  if (layout === "bleed" || layout === "plate") {
    const visH = Math.round(SLIDE_H * 0.62);
    const cutTop = Math.round(SLIDE_W * 0.13);
    const bezel = 16;
    const screenW = SLIDE_W - bezel * 2;
    const screenH = visH - bezel + cutTop;
    const screen = await loadCtaBleedScreen(shotFile, screenW, screenH);
    const phone = await composeRealisticIphone(screen, screenW, screenH, { tight: true });
    const takeH = phone.height - cutTop;
    const cropped = await sharp(phone.image)
      .extract({
        left: 0,
        top: cutTop,
        width: phone.width,
        height: takeH,
      })
      .resize(SLIDE_W, takeH)
      .png()
      .toBuffer();
    composites.push({ input: cropped, left: 0, top: 0 });

    const textTop = takeH + 18;
    const badge = await placeStoreRow();
    const overlay = Buffer.from(
      `<svg width="${SLIDE_W}" height="${SLIDE_H}" xmlns="http://www.w3.org/2000/svg">` +
        taglineSvg(textTop) +
        badge +
        `</svg>`,
    );
    composites.push({ input: overlay, left: 0, top: 0 });
    return bgSvg;
  }

  // Full-phone / diagonal: outcome at top, phone, store row. No second logo up top.
  const tagTop = SAFE_TOP + 20;
  const tagBlockH = tagLines.length * tagLineH;
  const phoneTop = Math.round(tagTop + tagBlockH + 28);
  const phoneMaxH = barTop - 20 - phoneTop;

  const isDiag = layout === "diagonal";
  const SCREEN_W = isDiag ? 400 : 480;
  const SCREEN_H = Math.round(SCREEN_W * (19.5 / 9));
  const pScreen = await loadCtaScreen(shotFile, SCREEN_W, SCREEN_H);
  const phone = await composeRealisticIphone(pScreen, SCREEN_W, SCREEN_H);

  let phoneImg: Buffer = phone.image;
  if (isDiag) {
    phoneImg = await sharp(phone.image)
      .rotate(10, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
  }

  const phoneMeta = await sharp(phoneImg).metadata();
  let phW = phoneMeta.width ?? phone.width;
  let phH = phoneMeta.height ?? phone.height;
  if (phH > phoneMaxH) {
    const scale = phoneMaxH / phH;
    phW = Math.round(phW * scale);
    phH = phoneMaxH;
    phoneImg = await sharp(phoneImg).resize(phW, phH).png().toBuffer();
  }
  composites.push({ input: phoneImg, left: Math.round((SLIDE_W - phW) / 2), top: phoneTop });

  const badge = await placeStoreRow();
  const textOverlay = Buffer.from(
    `<svg width="${SLIDE_W}" height="${SLIDE_H}" xmlns="http://www.w3.org/2000/svg">` +
      taglineSvg(tagTop) +
      badge +
      `</svg>`,
  );
  composites.push({ input: textOverlay, left: 0, top: 0 });
  return bgSvg;
}

export async function renderSlide(spec: SlideRenderSpec, variation: Variation, outPath: string): Promise<void> {
  const composites: sharp.OverlayOptions[] = [];
  let overlaySvgBody = "";
  const isLeftAligned = variation.layout === "left_aligned";
  const alignX = isLeftAligned ? 90 : SLIDE_W / 2;
  const textAlign = isLeftAligned ? "start" as const : "middle" as const;
  const textMaxW = isLeftAligned ? SLIDE_W - 180 : SLIDE_W - 160;

  if (spec.kind === "screenshot" && spec.screenshot) {
    const headlineSize = 64;
    const block = textBlockSvg({
      headline: spec.headline, sub: spec.sub, variation,
      headlineSize, subSize: 38, topY: SAFE_TOP + 8, maxWidth: textMaxW,
      align: textAlign, anchorX: alignX,
    });
    overlaySvgBody += block.svg;
    // minText: 1 headline + 2 sub lines — prevents the phone sitting on a bare 1-word label
    const minText = headlineSize * 1.18 + 30 + 38 * 1.35 * 2;
    // textBlockSvg places the first baseline at topY+headlineSize, so heightUsed does NOT
    // include that initial offset. Adding headlineSize here closes the ~64px gap that was
    // causing the phone bezel to overlap subtitle descenders.
    const mediaTop = Math.round(SAFE_TOP + 8 + headlineSize + Math.max(block.heightUsed, minText) + 40);
    const well = screenshotWell(variation, mediaTop);
    const shot = await prepareScreenshot(spec.screenshot, variation, well.available, well.targetW);
    const x = Math.round((SLIDE_W - shot.width) / 2);
    const y = well.pinTop
      ? mediaTop
      : mediaTop + Math.max(0, Math.round((well.available - shot.height) / 2));
    if (shot.shadow) composites.push({ input: shot.shadow, left: x + 10, top: y + 12 });
    composites.push({ input: shot.image, left: x, top: y });

  } else if (spec.kind === "tip") {
    const headline = stripTipNumberPrefix(spec.headline);
    const badgeR = 52;
    const badgeCx = SLIDE_W / 2;
    const gapBadgeToLine = 22;
    const gapLineToText = 36;
    const subSize = 40;
    const charRatio = variation.textStyle === "mono" ? 0.95 : variation.textStyle === "serif" ? 0.52 : 0.58;
    let headlineSize = variation.textStyle === "mono" ? 56 : 68;
    while (wrapText(headline, headlineSize, textMaxW, charRatio).length > 4 && headlineSize > 44) {
      headlineSize -= 4;
    }
    const hLines = wrapText(headline, headlineSize, textMaxW, charRatio);
    const sLines = spec.sub ? wrapText(spec.sub, subSize, textMaxW, charRatio) : [];
    const textH = hLines.length * headlineSize * 1.18 + (sLines.length ? 30 + sLines.length * subSize * 1.35 : 0);
    const stackH = badgeR * 2 + gapBadgeToLine + gapLineToText + textH;
    const safeTop = SAFE_TOP + 28;
    const safeBottom = SAFE_BOTTOM - 36;
    let badgeTop = safeTop + Math.max(0, (safeBottom - safeTop - stackH) / 2);
    if (badgeTop + stackH > safeBottom) badgeTop = Math.max(safeTop, safeBottom - stackH);
    const badgeCy = badgeTop + badgeR;
    overlaySvgBody += numberBadgeSvg(spec.tipNumber ?? 1, badgeCx, badgeCy, variation);
    const dividerY = badgeCy + badgeR + gapBadgeToLine;
    overlaySvgBody += dividerSvg(dividerY, variation);
    const block = textBlockSvg({
      headline, sub: spec.sub, variation,
      headlineSize, subSize, topY: dividerY + gapLineToText, maxWidth: textMaxW,
      align: textAlign, anchorX: alignX,
    });
    overlaySvgBody += block.svg;

  } else if (spec.kind === "stat") {
    overlaySvgBody += statNumberSvg(spec.headline, spec.sub, variation);

  } else if (spec.kind === "text_story" || spec.kind === "full_text") {
    const headSize = spec.kind === "full_text" ? 78 : 68;
    const block = textBlockSvg({
      headline: spec.headline, sub: spec.sub, variation,
      headlineSize: headSize, subSize: 44,
      centerY: SLIDE_H / 2 - 40,
      maxWidth: textMaxW,
      align: textAlign, anchorX: alignX,
    });
    overlaySvgBody += block.svg;

  } else if (spec.kind === "illustration") {
    const asset = illustrationForSlide(variation.seed, spec.index, variation.illustrationIds, spec.kind);
    const svgBuf = Buffer.from(illustrationRenderableSvg(asset));
    // All illustrations render as figure-on-plate — no scene-cover mode.
    // Scene covers caused color clashing with text overlays.
    let mediaTop = SAFE_TOP + 8;
    if (spec.headline) {
      const block = textBlockSvg({
        headline: spec.headline, sub: spec.sub, variation,
        headlineSize: 62, subSize: 38,
        topY: SAFE_TOP + 8,
        maxWidth: textMaxW,
        align: textAlign, anchorX: alignX,
      });
      overlaySvgBody += block.svg;
      const illusHeadlineSize = 62;
      const minText = illusHeadlineSize * 1.18 + 30 + 38 * 1.35 * 2;
      mediaTop = Math.round(SAFE_TOP + 8 + illusHeadlineSize + Math.max(block.heightUsed, minText) + 36);
    }
    const wellW = SLIDE_W - 72;
    const wellH = Math.max(200, SAFE_BOTTOM - FOOTER_CLEARANCE - mediaTop);
    const inner = 56;
    const figure = await sharp(svgBuf, { density: 300 })
      .resize(wellW - inner * 2, wellH - inner * 2, { fit: "inside" })
      .png()
      .toBuffer();
    const fig = await sharp(figure).metadata();
    const fw = fig.width ?? wellW;
    const fh = fig.height ?? wellH;
    // Match the plate background to the slide background so it doesn't clash.
    const dark = isDarkBackground(variation.background);
    const plateBg = dark ? "#2a3a2e" : "#f7f2e9";
    const plate = await sharp({
      create: { width: wellW, height: wellH, channels: 4, background: plateBg },
    })
      .composite([{ input: figure, left: Math.round((wellW - fw) / 2), top: Math.round((wellH - fh) / 2) }])
      .png()
      .toBuffer();
    const rounded = await roundCorners(plate, 40);
    const meta = await sharp(rounded).metadata();
    const w = meta.width ?? wellW;
    const h = meta.height ?? wellH;
    composites.push({
      input: rounded,
      left: Math.round((SLIDE_W - w) / 2),
      top: Math.round(mediaTop + (wellH - h) / 2),
    });

  } else if (spec.kind === "photo_person") {
    const asset = illustrationForSlide(variation.seed, spec.index, variation.illustrationIds, spec.kind);
    const photoPath = illustrationFilePath(asset);
    if (fs.existsSync(photoPath)) {
      const padX = 32;
      const mediaTop = SAFE_TOP + 4;
      const mediaBot = SAFE_BOTTOM - 8;
      const wellW = SLIDE_W - padX * 2;
      const wellH = Math.max(280, mediaBot - mediaTop);
      const fitted = await sharp(photoPath)
        .rotate()
        .resize(wellW, wellH, { fit: "cover", position: "attention" })
        .png()
        .toBuffer();
      const rounded = await roundCorners(fitted, 36);
      composites.push({ input: rounded, left: padX, top: mediaTop });
      // Middle-top of the photo — not the status-bar strip.
      const textCenter = mediaTop + Math.round(wellH * 0.38);
      const bandTop = textCenter - 170;
      const bandH = 340;
      const gradient = Buffer.from(
        `<svg width="${SLIDE_W}" height="${SLIDE_H}" xmlns="http://www.w3.org/2000/svg">` +
          `<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="0%" stop-color="rgba(0,0,0,0)"/>` +
          `<stop offset="30%" stop-color="rgba(0,0,0,0.48)"/>` +
          `<stop offset="70%" stop-color="rgba(0,0,0,0.48)"/>` +
          `<stop offset="100%" stop-color="rgba(0,0,0,0)"/>` +
          `</linearGradient></defs>` +
          `<rect x="${padX}" y="${bandTop}" width="${wellW}" height="${bandH}" fill="url(#pg)"/>` +
          `</svg>`,
      );
      composites.push({ input: gradient, left: 0, top: 0 });
      const block = textBlockSvg({
        headline: spec.headline,
        sub: spec.sub,
        variation,
        headlineSize: 62,
        subSize: 36,
        centerY: textCenter,
        maxWidth: textMaxW,
        align: textAlign,
        anchorX: alignX,
        ink: "light",
      });
      composites.push({
        input: Buffer.from(
          `<svg width="${SLIDE_W}" height="${SLIDE_H}" xmlns="http://www.w3.org/2000/svg">${block.svg}</svg>`,
        ),
        left: 0,
        top: 0,
      });
    }

  } else if (spec.kind === "exercise_photo") {
    // Text at top, rounded exercise screenshot below — same layout as screenshot slides.
    let exPath: string | null = null;
    let exFileName: string | null = null;
    if (spec.screenshot) {
      const candidate = path.join(ASSETS_DIR, spec.screenshot);
      if (fs.existsSync(candidate)) {
        exPath = candidate;
        exFileName = spec.screenshot;
      }
    }
    if (!exPath) {
      const exFile = EXERCISE_PHOTO_FILES[(variation.seed + spec.index) % EXERCISE_PHOTO_FILES.length]!;
      exPath = path.join(ASSETS_DIR, `${exFile}.png`);
      exFileName = `${exFile}.png`;
    }

    if (fs.existsSync(exPath)) {
      const headlineSize = 64;
      const block = textBlockSvg({
        headline: spec.headline, sub: spec.sub, variation,
        headlineSize, subSize: 38, topY: SAFE_TOP + 8, maxWidth: textMaxW,
        align: textAlign, anchorX: alignX,
      });
      overlaySvgBody += block.svg;
      const minText = headlineSize * 1.18 + 30 + 38 * 1.35 * 2;
      const mediaTop = Math.round(SAFE_TOP + 8 + headlineSize + Math.max(block.heightUsed, minText) + 40);
      const well = screenshotWell(variation, mediaTop);

      const shot = await prepareScreenshot(exFileName!, variation, well.available, well.targetW);
      const x = Math.round((SLIDE_W - shot.width) / 2);
      const y = well.pinTop
        ? mediaTop
        : mediaTop + Math.max(0, Math.round((well.available - shot.height) / 2));
      if (shot.shadow) composites.push({ input: shot.shadow, left: x + 10, top: y + 12 });
      composites.push({ input: shot.image, left: x, top: y });
    }

  } else if (spec.kind === "cta" && variation.ctaLayout) {
    overlaySvgBody += await renderCtaProduct(spec, variation, composites);

  } else {
    // hook / problem / proof / before_after / legacy cta (icon + text)
    const isCta = spec.kind === "cta";
    const isHook = spec.kind === "hook";

    // CTA: icon is at SAFE_TOP+80 (height 160), text starts below icon with gap.
    // Other slides: centered on slide.
    const ctaTextTopY = isCta ? SAFE_TOP + 80 + 160 + 60 : undefined;
    const block = textBlockSvg({
      headline: spec.headline, sub: spec.sub, variation,
      headlineSize: isHook ? 92 : 74,
      subSize: 42,
      ...(ctaTextTopY != null ? { topY: ctaTextTopY } : { centerY: SLIDE_H / 2 - 20 }),
      maxWidth: SLIDE_W - 160,
      align: isCta ? "middle" as const : textAlign,
      anchorX: isCta ? SLIDE_W / 2 : alignX,
    });
    overlaySvgBody += block.svg;

    if (isCta) {
      const iconPath = path.join(ASSETS_DIR, "icon.png");
      if (fs.existsSync(iconPath)) {
        const icon = await sharp(iconPath).resize(160, 160).png().toBuffer();
        const roundedIcon = await roundCorners(icon, 36);
        // Icon sits at SAFE_TOP + 80 so it's always well above the text block.
        composites.push({ input: roundedIcon, left: Math.round(SLIDE_W / 2 - 80), top: SAFE_TOP + 80 });
      }
    }
  }

  // Covering sizes hide the wordmark on screenshot slides so REMEDY never
  // ghosts over the plate. contained keeps the letters, painted last.
  const coveringShot =
    (SHOT_SCALE_SPEC[variation.shotScale ?? "contained"].coversFooter &&
      (spec.kind === "screenshot" || spec.kind === "exercise_photo")) ||
    spec.kind === "photo_person" ||
    Boolean(variation.ctaLayout && spec.kind === "cta");
  const footerBuf = Buffer.from(
    `<svg width="${SLIDE_W}" height="${SLIDE_H}" xmlns="http://www.w3.org/2000/svg">${footerSvg(variation, spec.index, spec.total, { hideWordmark: coveringShot, hideCounter: Boolean(variation.ctaLayout && spec.kind === "cta"), photoAtTop: spec.kind === "photo_person" })}</svg>`,
  );

  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const fullSvg = `<svg width="${SLIDE_W}" height="${SLIDE_H}" xmlns="http://www.w3.org/2000/svg">${backgroundSvg(variation.background, SLIDE_W, SLIDE_H)}${overlaySvgBody}</svg>`;
  await sharp(Buffer.from(fullSvg))
    .composite([...composites, { input: footerBuf, left: 0, top: 0 }])
    .jpeg({ quality: 92 })
    .toFile(outPath);
}

/** Wrap, then narrow the box until the last line is not a lone word. */
function wrapNoWidow(text: string, size: number, maxW: number): string[] {
  let lines = wrapText(text, size, maxW, 0.55);
  for (let w = maxW; lines.length > 1 && !lines[lines.length - 1]!.includes(" ") && w > maxW * 0.6; w -= 30) {
    const next = wrapText(text, size, w, 0.55);
    if (next.length > lines.length + 1) break;
    lines = next;
  }
  return lines;
}

// ---------------------------------------------------------------------------
// Native deck slides (photo, split, quad, app) share one type system so a deck
// reads as set on purpose: one face (Segoe UI Bold, the closest installed match
// to the iOS system font the reference carousels use), white with a soft shadow
// and a hairline instead of the thick TikTok outline, one size per role, and
// one text position per slide role. Nothing else sits on a slide: no sub line,
// no counter, no wordmark.
// ---------------------------------------------------------------------------

const NATIVE_FONT = "'Segoe UI', Arial, Helvetica, sans-serif";

/** Fixed sizes per role. Lines only shrink (down to `min`) when they would need a 4th line. */
export const NATIVE_TYPE = {
  hook: 78,
  body: 66,
  splitHook: 64,
  splitBody: 58,
  quadTitle: 74,
  quadBody: 62,
  label: 44,
  min: 46,
  labelMin: 34,
} as const;

/** Blur for the shadow copy, plus the two scrims every native slide may use. */
const NATIVE_DEFS =
  `<defs>` +
  `<filter id="nativeShadow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="7"/></filter>` +
  `<linearGradient id="scrimBand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.5" stop-color="#000" stop-opacity="0.32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
  `<linearGradient id="scrimEdge" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="0.6" stop-color="#000" stop-opacity="0.22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
  `<radialGradient id="scrimSpot" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#000" stop-opacity="0.34"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>` +
  `<linearGradient id="scrimEdgeUp" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.5"/><stop offset="0.6" stop-color="#000" stop-opacity="0.22"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>` +
  `</defs>`;

function nativeOverlay(nodes: string): Buffer {
  return Buffer.from(`<svg width="${SLIDE_W}" height="${SLIDE_H}" xmlns="http://www.w3.org/2000/svg">${NATIVE_DEFS}${nodes}</svg>`);
}

/** Look A line: white, soft shadow underneath, hairline so it holds on a bright wall. */
function nativeText(line: string, size: number, y: number, x = SLIDE_W / 2): string {
  const t = escapeXml(line);
  const font = `font-family="${NATIVE_FONT}" font-weight="700" font-size="${size}" letter-spacing="-0.5" text-anchor="middle"`;
  return (
    `<text x="${x}" y="${Math.round(y + size * 0.06)}" ${font} fill="#000000" fill-opacity="0.5" filter="url(#nativeShadow)">${t}</text>` +
    `<text x="${x}" y="${Math.round(y)}" ${font} fill="#ffffff" stroke="#000000" stroke-opacity="0.2" stroke-width="${Math.max(2, Math.round(size * 0.035))}" stroke-linejoin="round" paint-order="stroke">${t}</text>`
  );
}

/** Look B line (Stories twin): black type on a white rounded box, TikTok "background" style. */
function boxedText(line: string, size: number, y: number, x = SLIDE_W / 2): string {
  const w = Math.min(SLIDE_W - 60, Math.round(line.length * size * 0.53 + size * 0.7));
  const h = Math.round(size * 1.18);
  const left = Math.round(x - w / 2);
  const top = Math.round(y - size * 0.88);
  return (
    `<rect x="${left}" y="${top}" width="${w}" height="${h}" rx="${Math.round(size * 0.22)}" fill="#ffffff"/>` +
    `<text x="${x}" y="${Math.round(y)}" text-anchor="middle" font-family="${NATIVE_FONT}" font-weight="700" font-size="${size}" fill="#111111">${escapeXml(line)}</text>`
  );
}

/** "A" = Recoveries look (white type, soft shadow). "B" = Stories A/B look (tilted, re-framed, warmer, boxed text). */
export type NativeLook = "A" | "B";

/** Wrap at the role size; step down (to `min`) only when the line would need more than `maxLines`. */
function fitLines(text: string, size: number, maxW: number, maxLines: number, min: number = NATIVE_TYPE.min): { size: number; lines: string[] } {
  let s = size;
  while (wrapText(text, s, maxW, 0.55).length > maxLines && s - 4 >= min) s -= 4;
  return { size: s, lines: wrapNoWidow(text, s, maxW) };
}

function lineLead(size: number, look: NativeLook): number {
  return size * (look === "B" ? 1.3 : 1.14);
}

/** A block of centered lines starting at `top`. */
function textBlock(lines: string[], size: number, top: number, look: NativeLook, x = SLIDE_W / 2): string {
  let y = top + size * 0.85;
  let nodes = "";
  for (const line of lines) {
    nodes += look === "B" ? boxedText(line, size, y, x) : nativeText(line, size, y, x);
    y += lineLead(size, look);
  }
  return nodes;
}

/**
 * Darkening behind a text block. Near the top edge it fades down from the frame
 * edge like a natural vignette; anywhere else it is a wide soft band with no
 * visible edge. Look B boxes carry their own contrast and get none.
 */
function scrimFor(top: number, blockH: number, look: NativeLook): string {
  if (look === "B") return "";
  if (top < SAFE_TOP + 80) {
    return `<rect x="0" y="0" width="${SLIDE_W}" height="${Math.round(top + blockH + 170)}" fill="url(#scrimEdge)"/>`;
  }
  return `<rect x="0" y="${Math.round(top - 150)}" width="${SLIDE_W}" height="${Math.round(blockH + 300)}" fill="url(#scrimBand)"/>`;
}

/** Average colour of the bottom rows of a screenshot, so a short crop can extend as "more screen". */
async function bottomEdgeColor(buf: Buffer): Promise<{ r: number; g: number; b: number }> {
  const meta = await sharp(buf).metadata();
  const h = meta.height ?? 10;
  const stats = await sharp(buf)
    .extract({ left: 0, top: Math.max(0, h - 6), width: meta.width ?? 10, height: Math.min(6, h) })
    .stats();
  const [r, g, b] = stats.channels;
  return { r: Math.round(r?.mean ?? 250), g: Math.round(g?.mean ?? 248), b: Math.round(b?.mean ?? 244) };
}

/**
 * Native app slide: the deck photo stays recognisable behind (light blur, darkened),
 * one line at the top, and the library crop as a tall screen plate anchored to the
 * bottom edge like a phone held up to the camera. Short crops extend in their own
 * background colour instead of being stretched or cut mid-text.
 */
export async function renderNativeScreenshotSlide(
  bgPhotoPath: string,
  screenshotFile: string,
  headline: string,
  outPath: string,
  look: NativeLook = "A",
): Promise<void> {
  const bg = await sharp(bgPhotoPath)
    .rotate()
    .resize(SLIDE_W, SLIDE_H, { fit: "cover", position: "attention" })
    .blur(5)
    .modulate({ brightness: 0.6, saturation: 0.85 })
    .toBuffer();
  const maxW = SLIDE_W - 160;
  const { size, lines } = fitLines(headline, NATIVE_TYPE.body, maxW, 3);
  const blockH = lines.length * lineLead(size, look);
  const top = SAFE_TOP + 44;
  const nodes = scrimFor(top, blockH, look) + textBlock(lines, size, top, look);

  const rim = 4;
  const plateW = Math.round(SLIDE_W * (look === "B" ? 0.62 : 0.66));
  const plateTop = Math.round(top + blockH + 64);
  const plateH = SLIDE_H - plateTop + 80; // runs off the bottom edge
  const innerW = plateW - rim * 2;
  const innerH = plateH - rim;
  const src = sharp(path.join(ASSETS_DIR, screenshotFile));
  const fitted = await src.resize({ width: innerW }).png().toBuffer();
  const fittedMeta = await sharp(fitted).metadata();
  let screen: Buffer;
  if ((fittedMeta.height ?? 0) >= innerH) {
    screen = await sharp(fitted).extract({ left: 0, top: 0, width: innerW, height: innerH }).png().toBuffer();
  } else {
    const fill = await bottomEdgeColor(fitted);
    screen = await sharp(fitted)
      .extend({ top: 0, left: 0, right: 0, bottom: innerH - (fittedMeta.height ?? 0), background: { ...fill, alpha: 1 } })
      .png()
      .toBuffer();
  }
  const radius = 54;
  const plateSvg = Buffer.from(
    `<svg width="${plateW}" height="${plateH}" xmlns="http://www.w3.org/2000/svg"><rect width="${plateW}" height="${plateH}" rx="${radius}" ry="${radius}" fill="#ffffff" fill-opacity="0.42"/></svg>`,
  );
  const screenRounded = await roundCorners(screen, radius - rim);
  // Built at full height for the rounded corners, then cut at the frame edge (sharp needs overlays inside the canvas).
  const plateFull = await sharp(plateSvg).composite([{ input: screenRounded, left: rim, top: rim }]).png().toBuffer();
  const plate = await sharp(plateFull).extract({ left: 0, top: 0, width: plateW, height: SLIDE_H - plateTop }).png().toBuffer();
  const shadow = Buffer.from(
    `<svg width="${SLIDE_W}" height="${SLIDE_H}" xmlns="http://www.w3.org/2000/svg"><defs><filter id="s" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="26"/></filter></defs>` +
      `<rect x="${Math.round((SLIDE_W - plateW) / 2)}" y="${plateTop + 18}" width="${plateW}" height="${plateH}" rx="${radius}" fill="#000" fill-opacity="0.55" filter="url(#s)"/></svg>`,
  );
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(bg)
    .composite([
      { input: shadow, left: 0, top: 0 },
      { input: plate, left: Math.round((SLIDE_W - plateW) / 2), top: plateTop },
      { input: nativeOverlay(nodes), left: 0, top: 0 },
    ])
    .jpeg({ quality: 92 })
    .toFile(outPath);
}

/**
 * Generated photos come out too clean (plastic skin, perfect focus). Push them
 * toward a real phone capture: lose a little fine detail, re-sharpen like a
 * phone ISP, mute colour slightly, add fine sensor grain, then recompress.
 * Tuned light on purpose: the earlier pass (62% downscale, lifted blacks, heavy
 * grain, q74) made every slide look muddy and low-resolution. Real blacks and
 * contrast are what read as a good phone photo.
 */
export async function phoneCapture(
  photoPath: string,
  seed = 1,
  look: NativeLook = "A",
  height = SLIDE_H,
  /** 0-1 down the source photo where the crop starts (portrait photo into a landscape band). Default: saliency crop. */
  focusY?: number,
  width = SLIDE_W,
): Promise<Buffer> {
  let base: Buffer;
  if (focusY === undefined) {
    base = await sharp(photoPath).rotate().resize(width, height, { fit: "cover", position: "attention" }).toBuffer();
  } else {
    const scaled = await sharp(photoPath).rotate().resize({ width }).toBuffer({ resolveWithObject: true });
    if (scaled.info.height <= height) {
      base = await sharp(scaled.data).resize(width, height, { fit: "cover" }).toBuffer();
    } else {
      // The B look punches in and trims the top, so start a little higher to keep heads in.
      const start = look === "B" ? focusY - 0.04 : focusY;
      const topPx = Math.round(Math.min(Math.max(start * scaled.info.height, 0), scaled.info.height - height));
      base = await sharp(scaled.data).extract({ left: 0, top: topPx, width, height }).toBuffer();
    }
  }
  if (look === "B") {
    // Stories B look: handheld tilt, punched in off-center, warmer and flatter.
    // No mirroring: it flips steering wheels and handedness.
    const zoom = 1.16 + (seed % 4) * 0.02;
    const angle = (seed % 2 ? 1 : -1) * (1.4 + (seed % 3) * 0.3);
    const tilted = await sharp(base)
      .resize(Math.round(width * zoom), Math.round(height * zoom))
      .rotate(angle, { background: "#000000" })
      .toBuffer({ resolveWithObject: true });
    const spareX = tilted.info.width - width;
    const spareY = tilted.info.height - height;
    base = await sharp(tilted.data)
      .extract({
        left: Math.round(spareX * (seed % 2 ? 0.4 : 0.6)),
        top: Math.round(spareY * 0.45),
        width,
        height,
      })
      .modulate({ saturation: 0.82, hue: 10, brightness: 1.03 })
      .toBuffer();
  }
  const soft = await sharp(base)
    .resize(Math.round(width * 0.8), Math.round(height * 0.8))
    .resize(width, height)
    .sharpen({ sigma: 1.0, m1: 0.5, m2: 2.0 })
    .modulate({ saturation: 0.94 })
    .linear(1.04, -5)
    .toBuffer();
  const grain = await sharp({
    create: { width, height, channels: 3, background: "#808080", noise: { type: "gaussian", mean: 128, sigma: 13 + (seed % 4) } },
  })
    .greyscale()
    .blur(0.5)
    .png()
    .toBuffer();
  const grained = await sharp(soft).composite([{ input: grain, blend: "soft-light" }]).jpeg({ quality: 84, chromaSubsampling: "4:2:0" }).toBuffer();
  return sharp(grained).toBuffer();
}

/**
 * Native photo slide: the photo fills the frame and one line sits in a fixed
 * band. "top" is the default and hugs the status-bar line on every slide so a
 * deck lines up; "upper" (28%) and "lower" (64%, above TikTok's buttons) exist
 * for photos with a face at the top. No card, counter, wordmark, or sub line.
 */
export async function renderNativePhotoSlide(
  photoPath: string,
  headline: string,
  outPath: string,
  opts: { hook?: boolean; textAt?: "top" | "upper" | "lower"; look?: NativeLook } = {},
): Promise<void> {
  const look = opts.look ?? "A";
  const photo = await phoneCapture(photoPath, headline.length, look);

  const maxW = SLIDE_W - 160;
  const { size, lines } = fitLines(headline, opts.hook ? NATIVE_TYPE.hook : NATIVE_TYPE.body, maxW, 3);
  const blockH = lines.length * lineLead(size, look);
  const textAt = opts.textAt ?? "top";
  let top =
    textAt === "top" ? SAFE_TOP + 44 : textAt === "lower" ? Math.round(SLIDE_H * 0.64 - blockH / 2) : Math.round(SLIDE_H * 0.28 - blockH / 2);
  top = Math.max(SAFE_TOP + 24, Math.min(top, Math.round(SLIDE_H * 0.8) - blockH));

  const nodes = scrimFor(top, blockH, look) + textBlock(lines, size, top, look);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(photo).composite([{ input: nativeOverlay(nodes), left: 0, top: 0 }]).jpeg({ quality: 92 }).toFile(outPath);
}

/** "top line / bottom line": the two halves of one sentence on a split slide. */
export function splitHeadline(headline: string): [string, string] {
  const i = headline.indexOf(" / ");
  if (i < 0) throw new Error(`Split headline needs " / " between its halves: "${headline}"`);
  return [headline.slice(0, i).trim(), headline.slice(i + 3).trim()];
}

/** "contrast" greys the top (bad) half and warms the bottom; "natural" leaves both as shot. */
export type SplitGrade = "contrast" | "natural";

/** The grey, slightly lifted treatment for the "bad" image in a contrast grade. */
function greyGrade(buf: Buffer): Promise<Buffer> {
  return sharp(buf).greyscale().toColourspace("srgb").linear(1.08, -8).toBuffer();
}

/** One half's caption, centered on the half. */
function splitHalfText(line: string, halfTop: number, hook: boolean, look: NativeLook): string {
  const half = SLIDE_H / 2;
  const { size, lines } = fitLines(line, hook ? NATIVE_TYPE.splitHook : NATIVE_TYPE.splitBody, SLIDE_W - 160, 3);
  const blockH = lines.length * lineLead(size, look);
  const top = Math.round(halfTop + half * 0.52 - blockH / 2);
  const scrim = look === "B" ? "" : `<rect x="0" y="${Math.round(top - 130)}" width="${SLIDE_W}" height="${Math.round(blockH + 260)}" fill="url(#scrimBand)"/>`;
  return scrim + textBlock(lines, size, top, look);
}

/**
 * Split-comparison slide: two real photos stacked 50/50, one sentence across both
 * (the top half sets it up, the bottom half lands it). Headline is "top / bottom".
 * Same person, same place in both halves is what makes the contrast read as a state, not a casting change.
 */
export async function renderSplitSlide(
  topPhotoPath: string,
  bottomPhotoPath: string,
  headline: string,
  outPath: string,
  opts: { hook?: boolean; look?: NativeLook; grade?: SplitGrade; topY?: number; bottomY?: number } = {},
): Promise<void> {
  const look = opts.look ?? "A";
  const grade = opts.grade ?? "contrast";
  const [topLine, bottomLine] = splitHeadline(headline);
  const half = SLIDE_H / 2;
  let top = await phoneCapture(topPhotoPath, headline.length, look, half, opts.topY);
  let bottom = await phoneCapture(bottomPhotoPath, headline.length + 1, look, half, opts.bottomY);
  if (grade === "contrast") {
    top = await greyGrade(top);
    bottom = await sharp(bottom).modulate({ saturation: 1.06, brightness: 1.02 }).linear([1.04, 1, 0.95], [2, 0, -2]).toBuffer();
  }
  const nodes = splitHalfText(topLine, 0, Boolean(opts.hook), look) + splitHalfText(bottomLine, half, Boolean(opts.hook), look);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp({ create: { width: SLIDE_W, height: SLIDE_H, channels: 3, background: "#000000" } })
    .composite([
      { input: top, left: 0, top: 0 },
      { input: bottom, left: 0, top: half },
      { input: nativeOverlay(nodes), left: 0, top: 0 },
    ])
    .jpeg({ quality: 92 })
    .toFile(outPath);
}

/** Quad grade: "natural" as shot; "contrast" greys all four cells (the slide about what did not work). */
export type QuadGrade = "natural" | "contrast";
export type Quad<T> = [T, T, T, T];

/** Where quad cell labels sit: at the outer edge of each cell (clear of faces) or mid-cell. */
export type QuadLabelAt = "edge" | "center";

/**
 * Quad slide (2x2 grid, from the reidbranded and barclayahmed carousels): four
 * real photos butted together with no gutter, one line centered across the
 * middle seam, and an optional short label per cell. Labels default to the
 * outer edge of each cell (top cells at the top, bottom cells at the bottom),
 * which is how the people-heavy decks do it so faces stay clear; "center"
 * puts them mid-cell, which suits object cells. The four photos are four
 * instances of the headline's idea. Cells are 540x675 (4:5, like the slide).
 */
export async function renderQuadSlide(
  photoPaths: Quad<string>,
  headline: string,
  outPath: string,
  opts: { labels?: Quad<string>; labelAt?: QuadLabelAt; hook?: boolean; look?: NativeLook; grade?: QuadGrade } = {},
): Promise<void> {
  const look = opts.look ?? "A";
  const cw = SLIDE_W / 2;
  const ch = SLIDE_H / 2;
  let cells = await Promise.all(photoPaths.map((p, i) => phoneCapture(p, headline.length + i * 3, look, ch, undefined, cw)));
  if (opts.grade === "contrast") cells = await Promise.all(cells.map(greyGrade));

  const { size, lines } = fitLines(headline, opts.hook ? NATIVE_TYPE.quadTitle : NATIVE_TYPE.quadBody, SLIDE_W - 120, 3);
  const blockH = lines.length * lineLead(size, look);
  const top = Math.round(SLIDE_H / 2 - blockH / 2);
  let nodes = look === "B" ? "" : `<rect x="0" y="${Math.round(top - 170)}" width="${SLIDE_W}" height="${Math.round(blockH + 340)}" fill="url(#scrimBand)"/>`;
  nodes += textBlock(lines, size, top, look);

  if (opts.labels) {
    const labelAt = opts.labelAt ?? "edge";
    const edgeInset = Math.round(ch * 0.09);
    opts.labels.forEach((label, i) => {
      const fit = fitLines(label, NATIVE_TYPE.label, cw - 90, 2, NATIVE_TYPE.labelMin);
      const lh = fit.lines.length * lineLead(fit.size, look);
      const cx = i % 2 === 0 ? cw / 2 : cw * 1.5;
      const isTop = i < 2;
      if (labelAt === "center") {
        const cy = isTop ? ch / 2 : ch * 1.5;
        if (look === "A") nodes += `<ellipse cx="${cx}" cy="${Math.round(cy)}" rx="${Math.round(cw * 0.48)}" ry="${Math.round(lh / 2 + 90)}" fill="url(#scrimSpot)"/>`;
        nodes += textBlock(fit.lines, fit.size, Math.round(cy - lh / 2), look, cx);
      } else {
        const ltop = isTop ? edgeInset : Math.round(SLIDE_H - edgeInset - lh);
        const left = i % 2 === 0 ? 0 : cw;
        if (look === "A") {
          const scrimH = Math.round(lh + edgeInset + 120);
          nodes += isTop
            ? `<rect x="${left}" y="0" width="${cw}" height="${scrimH}" fill="url(#scrimEdge)"/>`
            : `<rect x="${left}" y="${SLIDE_H - scrimH}" width="${cw}" height="${scrimH}" fill="url(#scrimEdgeUp)"/>`;
        }
        nodes += textBlock(fit.lines, fit.size, ltop, look, cx);
      }
    });
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp({ create: { width: SLIDE_W, height: SLIDE_H, channels: 3, background: "#000000" } })
    .composite([
      { input: cells[0]!, left: 0, top: 0 },
      { input: cells[1]!, left: cw, top: 0 },
      { input: cells[2]!, left: 0, top: ch },
      { input: cells[3]!, left: cw, top: ch },
      { input: nativeOverlay(nodes), left: 0, top: 0 },
    ])
    .jpeg({ quality: 92 })
    .toFile(outPath);
}

export function postOutputDir(postId: number): string {
  return path.join(OUTPUT_DIR, "posts", String(postId));
}
