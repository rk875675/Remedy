import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";
import { BRAND, ASSETS_DIR, OUTPUT_DIR } from "../config.js";
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
export const SLIDE_REV = "v25";
/** Bump when CTA last-slide pixels change so the dashboard does not keep a stale JPEG. */
export const CTA_CACHE = "cta44";

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

const STORE_BADGE_W = 430;
const STORE_BADGE_H = 118;

/** Official-style black badge: big Apple, stacked copy, tight padding. */
function storeBadgeSvg(x: number, y: number, family: string): string {
  return (
    `<rect x="${x}" y="${y}" width="${STORE_BADGE_W}" height="${STORE_BADGE_H}" rx="22" fill="#000000"/>` +
    `<g transform="translate(${x + 28},${y + 20}) scale(3.15)">` +
    `<path fill="#ffffff" d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>` +
    `</g>` +
    `<text x="${x + 124}" y="${y + 44}" text-anchor="start" font-family="${family}" font-size="22" font-weight="500" fill="#ffffff">Coming soon</text>` +
    `<text x="${x + 124}" y="${y + 90}" text-anchor="start" font-family="${family}" font-size="40" font-weight="700" fill="#ffffff">App Store</text>`
  );
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

  const BAR_ICON = 112;
  const BAR_GAP = 20;
  const barW = BAR_ICON + BAR_GAP + STORE_BADGE_W;
  const barLeft = Math.round((SLIDE_W - barW) / 2);
  const barBottom = SAFE_BOTTOM - 2;
  const barTop = barBottom - Math.max(BAR_ICON, STORE_BADGE_H);

  async function placeStoreRow(): Promise<string> {
    const rowIcon = await loadCtaAppIcon(BAR_ICON, 0);
    const rowMeta = await sharp(rowIcon).metadata();
    const rw = rowMeta.width ?? BAR_ICON;
    const rh = rowMeta.height ?? BAR_ICON;
    composites.push({
      input: rowIcon,
      left: barLeft + Math.round((BAR_ICON - rw) / 2),
      top: barTop + Math.round((Math.max(BAR_ICON, STORE_BADGE_H) - rh) / 2),
    });
    return storeBadgeSvg(barLeft + BAR_ICON + BAR_GAP, barTop + Math.round((Math.max(BAR_ICON, STORE_BADGE_H) - STORE_BADGE_H) / 2), family);
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

export function postOutputDir(postId: number): string {
  return path.join(OUTPUT_DIR, "posts", String(postId));
}
