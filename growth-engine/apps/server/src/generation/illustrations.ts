/**
 * File-based illustration library for carousel slides 1-3.
 *
 * Assets live in growth-engine/assets/illustrations/ (manifest.json).
 * Remedy-owned sources (`Remedy original`, `Remedy flat`) are preferred on new slides.
 * Third-party tiles are MIT / CC0 — see THIRD_PARTY_NOTICES.md.
 *
 * Slides 1-3 pick thematically:
 *   slide 1 -> office / pain     (the hook: desk life, back flaring up)
 *   slide 2 -> pain / lifestyle  (relatable day-to-day)
 *   slide 3 -> recovery / lifestyle (where Remedy takes you)
 *
 * The composer rasterizes the SVG file with Sharp, so real-world SVGs
 * (gradients, defs, Illustrator/Sketch output) render correctly.
 */

import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "../config.js";
import { isIllustrationRejected, setRejectedIllustration } from "./library-overrides.js";

export const ILLUSTRATIONS_DIR = path.join(ROOT_DIR, "assets", "illustrations");

export type IllustrationTheme = "office" | "pain" | "recovery" | "lifestyle";
export type IllustrationFit = "scene" | "figure" | "photo";

/** Kits the picker may use on new SVG slides. Third-party stays in the library for reject/enable. */
export const OWNED_SOURCES = ["Remedy original", "Remedy flat"] as const;
export const PHOTO_SOURCE = "Remedy people";

export interface IllustrationAsset {
  id: string;
  /** Path relative to ILLUSTRATIONS_DIR, e.g. "opendoodles/sitting.svg" */
  file: string;
  name: string;
  description: string;
  source: string;
  license: string;
  themes: IllustrationTheme[];
  enabled: boolean;
}

interface Manifest {
  illustrations: IllustrationAsset[];
}

let _manifestCache: IllustrationAsset[] | null = null;
let _blocklistCache: Set<string> | null = null;

const MANIFEST_PATH = path.join(ILLUSTRATIONS_DIR, "manifest.json");
const BLOCKLIST_PATH = path.join(ILLUSTRATIONS_DIR, "blocklist.json");

function blockedIllustrationIds(): Set<string> {
  if (_blocklistCache) return _blocklistCache;
  try {
    const raw = JSON.parse(fs.readFileSync(BLOCKLIST_PATH, "utf-8")) as {
      neverRestoreIds?: string[];
    };
    // Exercise-form silhouettes only — user rejects stay reversible via Enable.
    _blocklistCache = new Set(raw.neverRestoreIds ?? []);
  } catch {
    _blocklistCache = new Set();
  }
  return _blocklistCache;
}

export function invalidateIllustrationCache(): void {
  _manifestCache = null;
  _blocklistCache = null;
}

/** All manifest entries whose SVG file exists on disk (enabled or not). */
export function allIllustrationAssets(): IllustrationAsset[] {
  if (_manifestCache) return _manifestCache;
  const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
  _manifestCache = parsed.illustrations.filter((a) =>
    fs.existsSync(path.join(ILLUSTRATIONS_DIR, a.file)),
  );
  return _manifestCache;
}

export function isPhotoAsset(asset: IllustrationAsset): boolean {
  return asset.source === PHOTO_SOURCE || /\.(jpe?g|png|webp)$/i.test(asset.file);
}

export function illustrationMime(file: string): string {
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

/** Scene tiles have their own canvas; figures are transparent ink drawings. */
export function illustrationFit(asset: IllustrationAsset): IllustrationFit {
  if (isPhotoAsset(asset)) return "photo";
  return asset.source === "illlustrations.co" || asset.source === "Remedy flat"
    ? "scene"
    : "figure";
}

export function enabledSvgIllustrations(): IllustrationAsset[] {
  return enabledIllustrations().filter((a) => !isPhotoAsset(a));
}

export function enabledPeople(): IllustrationAsset[] {
  return enabledIllustrations().filter(isPhotoAsset);
}

/**
 * Reject / enable from the dashboard. Writes the cloud overrides list so the
 * live site and the next PC generate stay in sync. Does not rewrite the
 * vendored manifest (that's the default catalog).
 */
export async function setIllustrationEnabled(id: string, enabled: boolean): Promise<IllustrationAsset | null> {
  const entry = allIllustrationAssets().find((a) => a.id === id);
  if (!entry) return null;
  await setRejectedIllustration(id, enabled);
  return { ...entry, enabled };
}

/** Effective enabled flag: vendor default minus cloud rejects and the hard blocklist. */
export function isIllustrationEnabled(asset: IllustrationAsset): boolean {
  if (blockedIllustrationIds().has(asset.id)) return false;
  return asset.enabled && !isIllustrationRejected(asset.id);
}

/** The pool used for slide rendering. */
export function enabledIllustrations(): IllustrationAsset[] {
  return allIllustrationAssets().filter(isIllustrationEnabled);
}

export function getIllustration(id: string): IllustrationAsset | undefined {
  return allIllustrationAssets().find((a) => a.id === id);
}

export function illustrationFilePath(asset: IllustrationAsset): string {
  return path.join(ILLUSTRATIONS_DIR, asset.file);
}

/** Raw SVG markup with the XML prolog/doctype and any script tags stripped. */
export function illustrationSvg(asset: IllustrationAsset): string {
  const raw = fs.readFileSync(illustrationFilePath(asset), "utf-8");
  return raw
    .replace(/<\?xml[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/g, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .trim();
}

/**
 * illlustrations.co tiles bake a branding footer ("designed by @realvjy ...")
 * into the bottom band of every 1000x1000 canvas. Crop it out via viewBox so
 * it never appears on published slides or previews.
 */
const SOURCE_BOTTOM_CROP: Record<string, number> = {
  "illlustrations.co": 0.14,
};

function parsedViewBox(svg: string): { x: number; y: number; w: number; h: number } {
  const open = svg.match(/<svg[^>]*>/i)?.[0] ?? "";
  const vb = open.match(/viewBox="([^"]+)"/i)?.[1];
  if (vb) {
    const [x = 0, y = 0, w = 1024, h = 768] = vb.trim().split(/[\s,]+/).map(Number);
    return { x, y, w, h };
  }
  const w = Number(open.match(/\swidth="([\d.]+)/i)?.[1] ?? 1024);
  const h = Number(open.match(/\sheight="([\d.]+)/i)?.[1] ?? 768);
  return { x: 0, y: 0, w, h };
}

/** The viewBox to render with, after any per-source branding crop. */
export function illustrationViewBox(asset: IllustrationAsset, svg: string): string {
  const { x, y, w, h } = parsedViewBox(svg);
  const crop = SOURCE_BOTTOM_CROP[asset.source] ?? 0;
  return `${x} ${y} ${w} ${Math.round(h * (1 - crop))}`;
}

/**
 * Full standalone SVG document ready for Sharp rasterization: sanitized,
 * branding-cropped, and stripped of fixed width/height so density scaling
 * applies cleanly.
 */
export function illustrationRenderableSvg(asset: IllustrationAsset): string {
  const inner = illustrationSvg(asset);
  const viewBox = illustrationViewBox(asset, inner);
  const body = inner.replace(/<svg[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}">` +
    body +
    `</svg>`
  );
}

// ---------------------------------------------------------------------------
// Thematic picker
// ---------------------------------------------------------------------------

const SLIDE_THEMES: IllustrationTheme[][] = [
  ["office", "pain"],
  ["pain", "lifestyle"],
  ["recovery", "lifestyle"],
];

/**
 * Pick the single illustration source/style for this post.
 * All illustrations in a carousel must come from the same source to avoid
 * mixing flat scenes, line doodles, and original figures.
 */
function pickSourceForPost(seed: number): string {
  const pool = enabledSvgIllustrations();
  const sources = [...new Set(pool.map((a) => a.source))];
  if (!sources.length) return "Remedy original";
  const owned = sources.filter((s) => (OWNED_SOURCES as readonly string[]).includes(s));
  if (owned.length) return owned[Math.abs(seed) % owned.length]!;
  return sources[Math.abs(seed) % sources.length]!;
}

export function isOwnedIllustration(asset: IllustrationAsset): boolean {
  return (OWNED_SOURCES as readonly string[]).includes(asset.source);
}

/** Slide-index list for a template: asset id or "" on non-visual slides. */
export function illustrationIdsForTemplate(
  seed: number,
  slideCount: number,
  kindAt: (idx: number) => string | undefined,
): string[] {
  const ids: string[] = [];
  const usedPeople = new Set<string>();
  for (let i = 0; i < slideCount; i++) {
    const kind = kindAt(i);
    try {
      if (kind === "photo_person") {
        const person = pickPerson(seed, i, usedPeople);
        usedPeople.add(person.id);
        ids.push(person.id);
      } else if (kind === "illustration") ids.push(pickIllustration(seed, i).id);
      else ids.push("");
    } catch {
      ids.push("");
    }
  }
  return ids;
}

export function svgIdsForSlides(
  seed: number | null | undefined,
  storedIds: string[] | undefined,
  slideRows: Array<{ idx: number; kind: string }>,
): string[] {
  if (typeof seed !== "number") return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const s of slideRows) {
    if (s.kind !== "illustration" && s.kind !== "photo_person") continue;
    try {
      const id = illustrationForSlide(seed, s.idx, storedIds, s.kind).id;
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    } catch {
      // pool empty
    }
  }
  return ids;
}

/** Stored id wins so picker changes don't rewrite history. */
export function illustrationForSlide(
  seed: number,
  slideIndex: number,
  storedIds?: string[] | null,
  kind?: string,
): IllustrationAsset {
  const stored = storedIds?.[slideIndex];
  if (stored) {
    const hit = getIllustration(stored);
    if (hit && isIllustrationEnabled(hit)) return hit;
  }
  if (kind === "photo_person") return pickPerson(seed, slideIndex);
  return pickIllustration(seed, slideIndex);
}

/**
 * Deterministic thematic pick with in-post dedup and style consistency:
 * all illustrations in a post come from the same source so visual styles
 * never clash (e.g. no isometric scene next to a line doodle).
 */
export function pickPerson(
  seed: number,
  slideIndex: number,
  exclude: Set<string> = new Set(),
): IllustrationAsset {
  const pool = enabledPeople();
  if (!pool.length) throw new Error("No enabled people photos in manifest");
  const themes = SLIDE_THEMES[Math.min(slideIndex, SLIDE_THEMES.length - 1)]!;
  let candidates = pool.filter(
    (a) => !exclude.has(a.id) && a.themes.some((t) => themes.includes(t)),
  );
  if (!candidates.length) candidates = pool.filter((a) => !exclude.has(a.id));
  if (!candidates.length) candidates = pool;
  return candidates[Math.abs(seed + slideIndex * 7919) % candidates.length]!;
}

export function pickIllustration(seed: number, slideIndex: number): IllustrationAsset {
  const allEnabled = enabledSvgIllustrations();
  if (!allEnabled.length) throw new Error("No enabled illustrations in manifest");
  const source = pickSourceForPost(seed);
  const pool = allEnabled.filter((a) => a.source === source);
  // Fallback to all enabled if the chosen source pool is empty.
  const effectivePool = pool.length >= 2 ? pool : allEnabled;
  const chosen: IllustrationAsset[] = [];
  for (let i = 0; i <= slideIndex; i++) {
    const themes = SLIDE_THEMES[Math.min(i, SLIDE_THEMES.length - 1)]!;
    const taken = new Set(chosen.map((c) => c.id));
    let candidates = effectivePool.filter(
      (a) => !taken.has(a.id) && a.themes.some((t) => themes.includes(t)),
    );
    if (!candidates.length) candidates = effectivePool.filter((a) => !taken.has(a.id));
    if (!candidates.length) candidates = effectivePool;
    const idx = Math.abs(seed + i * 7919) % candidates.length;
    chosen.push(candidates[idx]!);
  }
  return chosen[slideIndex]!;
}

// ---------------------------------------------------------------------------
// Dashboard previews
// ---------------------------------------------------------------------------

/**
 * Wraps the asset in a fixed-size preview frame (cream or brand green) by
 * nesting the original SVG, preserving its own viewBox/aspect ratio.
 */
export function illustrationPreviewSvg(asset: IllustrationAsset, dark = false): string {
  const inner = illustrationSvg(asset);
  const viewBox = illustrationViewBox(asset, inner);
  const body = inner.replace(/<svg[^>]*>/i, "").replace(/<\/svg>\s*$/i, "");
  const W = 640;
  const H = 480;
  if (illustrationFit(asset) === "scene") {
    return (
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      `<svg width="${W}" height="${H}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice">${body}</svg>` +
      `</svg>`
    );
  }
  const bg = dark ? "#33663f" : "#f7f2e9";
  const PAD = 28;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${bg}"/>` +
    `<svg x="${PAD}" y="${PAD}" width="${W - PAD * 2}" height="${H - PAD * 2}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${body}</svg>` +
    `</svg>`
  );
}

const FOLDER_SOURCE: Record<string, { source: string; license: string }> = {
  flat: { source: "Remedy flat", license: "owned" },
  custom: { source: "Remedy original", license: "owned" },
  illlustrations: { source: "illlustrations.co", license: "MIT" },
  opendoodles: { source: "Open Doodles", license: "CC0" },
  people: { source: PHOTO_SOURCE, license: "owned" },
};

function inferThemes(stem: string): IllustrationTheme[] {
  const s = stem.toLowerCase();
  const themes = new Set<IllustrationTheme>();
  if (/desk|office|laptop|chair|work|coding|freelancer|kitchen|fluorescent/.test(s)) themes.add("office");
  if (/pain|stiff|slouch|flare|hurt|ache|bend|wince/.test(s)) themes.add("pain");
  if (/walk|stretch|recover|morning-ok|standing-tall|standing-relief|floor-rest|progress|denim/.test(s)) themes.add("recovery");
  if (/couch|bed|phone|commute|cook|laundry|stairs|walk|kitchen|car|gym|grocery|airport|restaurant|toddler|hood|booth/.test(s)) {
    themes.add("lifestyle");
  }
  if (!themes.size) themes.add("lifestyle");
  return [...themes];
}

function listCatalogFiles(): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    if (!fs.existsSync(d)) return;
    for (const n of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, n.name);
      if (n.isDirectory()) {
        walk(p);
        continue;
      }
      const rel = path.relative(ILLUSTRATIONS_DIR, p).replace(/\\/g, "/");
      const folder = rel.split("/")[0] ?? "";
      if (folder === "people" && /\.(jpe?g|png|webp)$/i.test(n.name)) out.push(rel);
      else if (n.name.endsWith(".svg")) out.push(rel);
    }
  };
  walk(ILLUSTRATIONS_DIR);
  return out;
}

/**
 * Drop a file in flat/ custom/ illlustrations/ opendoodles/ — next generate
 * catalogs it so the new type enters pick / cold-test / ratings.
 */
export function ensureIllustrationManifest(): { added: string[] } {
  const parsed = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf-8")) as Manifest;
  const known = new Set(parsed.illustrations.map((a) => a.file.replace(/\\/g, "/")));
  const blocked = blockedIllustrationIds();
  const added: string[] = [];
  for (const file of listCatalogFiles()) {
    if (known.has(file)) continue;
    const folder = file.split("/")[0] ?? "";
    const kit = FOLDER_SOURCE[folder];
    if (!kit) continue;
    const stem = path.basename(file).replace(/\.[^.]+$/, "");
    const id = stem.replace(/[^a-z0-9._-]+/gi, "-").toLowerCase();
    if (blocked.has(id) || parsed.illustrations.some((a) => a.id === id)) continue;
    parsed.illustrations.push({
      id,
      file,
      name: stem.replace(/[-_]+/g, " "),
      description: `${kit.source} ${folder === "people" ? "photo" : "illustration"} (${stem.replace(/[-_]+/g, " ")}).`,
      source: kit.source,
      license: kit.license,
      themes: inferThemes(stem),
      enabled: true,
    });
    added.push(id);
  }
  if (added.length) {
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(parsed, null, 2));
    invalidateIllustrationCache();
  }
  return { added };
}
