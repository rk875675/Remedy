import fs from "node:fs";
import path from "node:path";
import { ASSETS_DIR, BRAND, r2Configured } from "../config.js";
import { SCREENSHOT_R2_PREFIX, uploadBuffer } from "../publish/r2.js";
import { isScreenshotDeleted } from "./library-overrides.js";

export const SCREENSHOT_META_FILE = "meta.json";
const SKIP_FILES = new Set(["icon.png", "crop-config.json", SCREENSHOT_META_FILE, "library-overrides.json"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
/** Empty / duplicate frames — stay in Images, never auto-assign. Prefer the filled twin. */
const NEVER_ASSIGN = new Set(["img_0528.png", "img_0532.png", "img_0535.png"]);

export interface ScreenshotMeta {
  description?: string;
  cropped?: boolean;
  source?: string;
  /** When false, keep in the Images tab but never auto-assign. */
  assign?: boolean;
}

export function isCroppedScreenshot(file: string, meta?: ScreenshotMeta): boolean {
  return Boolean(meta?.cropped) || file.startsWith("crop_");
}

export function screenshotStem(file: string): string {
  return path.basename(file).toLowerCase().replace(/\.(png|jpe?g|webp)$/i, "");
}

export function defaultScreenshotDescription(file: string): string {
  const exact = BRAND.screenshots[file];
  if (exact) return exact;
  const png = `${screenshotStem(file)}.png`;
  return BRAND.screenshots[png] ?? "";
}

/** Filename / token hints for new uploads (onboarding, etc.) when meta is empty. */
const STEM_HINTS: Array<{ test: RegExp; description: string }> = [
  { test: /0524|founder|4.?in.?5/, description: "Founder: 4 in 5 people get back pain. Use for lifetime-stat / why-we-built slides." },
  { test: /0525|education|50.?percent|pain.over.time/, description: "Education: 50% less pain in ~6 weeks chart. Use for research / hope / timeline." },
  { test: /0526|hear.about|q0/, description: "Onboarding: where did you hear about us. Use for first-touch / social proof of discovery." },
  { test: /0527|tried.before|q9/, description: "Onboarding: have you tried to fix it before. Use for stretch-failed / YouTube-failed." },
  { test: /0529|0528|main.goal|q6/, description: "Onboarding: main goal (pain, workout, sleep, mobility). Use for tailored / personal plan." },
  { test: /0530|where.is|pain.location|q1/, description: "Onboarding: where is your back pain (lower selected). Use for tailored / not-generic." },
  { test: /0531|0532|how.long|duration|q2/, description: "Onboarding: how long you've had it. Use for chronic vs new / personal plan." },
  { test: /0533|describe.it|stiffness|q3/, description: "Onboarding: pain type (stiff / ache / sharp). Use for personalization / mobility." },
  { test: /0534|activity.level|q4/, description: "Onboarding: activity level (desk / light / lifting). Use for desk-worker plan." },
  { test: /0536|0535|makes.worse|trigger|q5/, description: "Onboarding: what makes pain worse (standing, mornings). Use for flare / sitting." },
  { test: /0537|equipment|q7/, description: "Onboarding: equipment (gym / bands / floor). Use for no-gym / gym plan." },
  { test: /0538|days.per|time.can.you|q8/, description: "Onboarding: 15 min + days per week. Use for schedule / fits-your-life." },
  { test: /0539|building.your.plan|finaliz/, description: "Onboarding: building your plan. Use for personalization moment / analyzing answers." },
  { test: /0540|your.program|match|lower.back.pain.relief/, description: "Onboarding: your matched program. Use for tailored-plan proof / not a playlist." },
  { test: /welcome|onboard_index/, description: "Welcome: Remedy start screen. Use for first-impression / get started." },
  { test: /safety|before.we.start|do.any.of.these.apply/, description: "Safety: do any of these apply. Use for trust / medical caution." },
];

export function inferScreenshotDescription(file: string, opts?: { cropped?: boolean; source?: string; sourceDescription?: string }): string {
  const known = defaultScreenshotDescription(file);
  if (known) return known;
  const stem = screenshotStem(file);
  for (const hint of STEM_HINTS) {
    if (hint.test.test(stem) || hint.test.test(file.toLowerCase())) return hint.description.slice(0, 160);
  }
  if (opts?.cropped) {
    const src = (opts.sourceDescription ?? defaultScreenshotDescription(opts.source ?? "") ?? opts.source ?? "screenshot")
      .split(". Use")[0]
      .replace(/^(Crop:\s*)/i, "")
      .trim();
    return `Crop: ${src}. Use for a close-up of that UI, not the full screenshot.`.slice(0, 160);
  }
  return `${stem.replace(/[_-]+/g, " ")}. Use when this screen matches the hook.`.slice(0, 160);
}

/** @deprecated use inferScreenshotDescription */
export function autoScreenshotDescription(
  file: string,
  opts?: { cropped?: boolean; source?: string; sourceDescription?: string },
): string {
  return inferScreenshotDescription(file, opts);
}

export function readScreenshotMeta(): Record<string, ScreenshotMeta> {
  const dest = path.join(ASSETS_DIR, SCREENSHOT_META_FILE);
  try {
    if (!fs.existsSync(dest)) return {};
    const parsed = JSON.parse(fs.readFileSync(dest, "utf-8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, ScreenshotMeta>) : {};
  } catch {
    return {};
  }
}

export function writeScreenshotMeta(meta: Record<string, ScreenshotMeta>): void {
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.writeFileSync(path.join(ASSETS_DIR, SCREENSHOT_META_FILE), JSON.stringify(meta, null, 2));
}

export function metaFor(file: string, meta?: Record<string, ScreenshotMeta>): ScreenshotMeta {
  const all = meta ?? readScreenshotMeta();
  if (all[file]) return all[file]!;
  const png = `${screenshotStem(file)}.png`;
  return all[png] ?? {};
}

export function sanitizeScreenshotName(raw: string): string {
  const base = path.basename(raw).toLowerCase();
  const ext = path.extname(base);
  const stem = base.slice(0, base.length - ext.length).replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  const safeExt = IMAGE_EXT.has(ext) ? ext : ".png";
  const name = `${stem || `upload_${Date.now()}`}${safeExt}`;
  if (name.includes("..") || name.includes("/") || name.includes("\\")) {
    return `upload_${Date.now()}.png`;
  }
  return name;
}

export function listLocalScreenshots(): string[] {
  if (!fs.existsSync(ASSETS_DIR)) return [];
  return fs
    .readdirSync(ASSETS_DIR)
    .filter((file) => IMAGE_EXT.has(path.extname(file).toLowerCase()) && !SKIP_FILES.has(file) && !isScreenshotDeleted(file))
    .sort();
}

/**
 * One file per stem for generation. Prefers .png over .jpg twins so
 * duplicate formats don't inflate "cold" counts or steal slots.
 */
export function listCanonicalScreenshots(): string[] {
  const byStem = new Map<string, string[]>();
  for (const file of listLocalScreenshots()) {
    const stem = screenshotStem(file);
    const list = byStem.get(stem) ?? [];
    list.push(file);
    byStem.set(stem, list);
  }
  const rank = (file: string): number => {
    const ext = path.extname(file).toLowerCase();
    if (ext === ".png") return 0;
    if (ext === ".webp") return 1;
    return 2;
  };
  return [...byStem.values()]
    .map((files) => [...files].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0]!)
    .sort();
}

/** Screenshots the picker may assign. Crops beat their full-screen source. */
export function listAssignableScreenshots(): string[] {
  const meta = readScreenshotMeta();
  const croppedSources = new Set(
    Object.entries(meta)
      .filter(([, m]) => m.cropped && m.source)
      .map(([, m]) => screenshotStem(m.source as string)),
  );
  return listCanonicalScreenshots().filter((file) => {
    const entry = metaFor(file, meta);
    if (entry.assign === false || NEVER_ASSIGN.has(file)) return false;
    if (file.startsWith("profile")) return false;
    if (croppedSources.has(screenshotStem(file)) && !isCroppedScreenshot(file, entry)) return false;
    // Full phone screens get a generic 45% top slice and look cut-off.
    // Only user-finished crops are auto-assigned.
    if (!isCroppedScreenshot(file, entry)) return false;
    return true;
  });
}

export function screenshotPath(file: string): string {
  return path.join(ASSETS_DIR, path.basename(file));
}

/**
 * LOCKED last-slide shots. Do not add/remove/swap unless the user explicitly asks.
 * Never fall back to a library crop.
 */
const CTA_SHOT_LOCKED = ["progress.png", "img_0525.png", "img_0539.png", "img_0540.png"] as const;

function isLockedCtaShot(file: string): boolean {
  return (CTA_SHOT_LOCKED as readonly string[]).includes(file);
}

/** Product shot for the last-slide CTA. Does not consume the body screenshot slot. */
export function resolveCtaScreenshot(preferred?: string | null): string | null {
  const seen = new Set<string>();
  const tryFile = (file: string | null | undefined): string | null => {
    if (!file || seen.has(file) || !isLockedCtaShot(file)) return null;
    seen.add(file);
    return fs.existsSync(screenshotPath(file)) ? file : null;
  };
  return tryFile(preferred) ?? CTA_SHOT_LOCKED.map(tryFile).find(Boolean) ?? null;
}

export function isAllowedScreenshotFile(file: string): boolean {
  const name = path.basename(file);
  return IMAGE_EXT.has(path.extname(name).toLowerCase()) && !SKIP_FILES.has(name) && !name.includes("..");
}

/** Fill missing descriptions so a new upload is usable on the next generate. */
export function ensureScreenshotMeta(): { wrote: boolean; added: string[] } {
  const meta = readScreenshotMeta();
  const added: string[] = [];
  let wrote = false;
  for (const file of listCanonicalScreenshots()) {
    const entry = meta[file] ?? {};
    const cropped = isCroppedScreenshot(file, entry);
    const inferred = inferScreenshotDescription(file, { cropped, source: entry.source });
    const current = (entry.description ?? "").trim();
    const generic = /use when this screen matches the hook/i.test(current);
    const mustBlock = NEVER_ASSIGN.has(file) && entry.assign !== false;
    if (!current || (generic && inferred !== current) || mustBlock) {
      meta[file] = {
        ...entry,
        description: current && !generic ? current : inferred,
        ...(cropped ? { cropped: true } : {}),
        ...(NEVER_ASSIGN.has(file) || entry.assign === false ? { assign: false } : {}),
      };
      added.push(file);
      wrote = true;
    }
  }
  if (wrote) writeScreenshotMeta(meta);
  return { wrote, added };
}

export async function persistScreenshotMetaToR2(): Promise<void> {
  if (!r2Configured()) return;
  const dest = path.join(ASSETS_DIR, SCREENSHOT_META_FILE);
  if (!fs.existsSync(dest)) return;
  await uploadBuffer(`${SCREENSHOT_R2_PREFIX}${SCREENSHOT_META_FILE}`, fs.readFileSync(dest), "application/json");
}

/** Catalog for hook + slide-copy prompts — unique assignable files with descriptions. */
export function screenshotCatalogForPrompt(): string {
  const meta = readScreenshotMeta();
  const lines = listAssignableScreenshots().map((file) => {
    const entry = metaFor(file, meta);
    const desc = entry.description || inferScreenshotDescription(file, { cropped: isCroppedScreenshot(file, entry), source: entry.source });
    return `- ${file}: ${desc}`;
  });
  return lines.length
    ? `Screenshot library (match the description to the slide; prefer unused / onboarding when the hook is about a tailored plan):\n${lines.join("\n")}`
    : "";
}

/** @deprecated use screenshotCatalogForPrompt */
export function cropCatalogForPrompt(): string {
  return screenshotCatalogForPrompt();
}
