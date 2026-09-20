import path from "node:path";
import fs from "node:fs";
import { getDb, posts, slides, rounds, hooks as hooksTable, isLowSignalHook } from "@remedy-growth/db";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { ASSETS_DIR, BRAND, env, configuredPlatforms, r2Configured, GENERATE_PAUSED_MESSAGE, type Platform } from "../config.js";
import { accountFor } from "../publish/brightbean.js";
import {
  generateHooks,
  generateCarouselCopy,
  ensureAppStoreCaption,
  ensureComingSoonCaption,
  CTA_REVIEW_OPTIONS,
  pickBestCtaOption,
  ensureDistributionMeta,
  stripFalseFreeClaims,
  stripTipNumberPrefix,
} from "./hooks.js";
import { TEMPLATES, pickTemplateId, illustrationCoverTemplateIds, photoCoverTemplateIds, hasPhotoCover, hasVisualCover, isCoverHeadlineSlide, isLongTemplate, pickLongerTemplateId, enforcePersonTemplate, biasPoolTowardTeach, teachBiasWeights, type SlideKind } from "./templates.js";
import { makeVariation, parseVariation, pickShotScale, type Variation } from "./variations.js";
import { renderSlide, postOutputDir, slideFileName } from "./composer.js";
import { renderSlideshowShort, shortOutputPath, SILENT_BED_ID } from "./short.js";
import { approvedReadyIds, initManualQueue, loadManualPosting, saveManualPosting } from "../manual/queue.js";
import { pruneLocalPostDir, pruneRemotePostMedia } from "./storage.js";
import { shippedShotScaleUsage } from "./diversity.js";
import { addRule, getKnowledgeContext, HARD_CONSTRAINTS } from "../learning/knowledge.js";
import { ratingsMap } from "../learning/ratings.js";
import {
  ensureScreenshotMeta,
  inferScreenshotDescription,
  isCroppedScreenshot,
  listAssignableScreenshots,
  listLocalScreenshots,
  metaFor,
  persistScreenshotMetaToR2,
  readScreenshotMeta,
  resolveCtaScreenshot,
  screenshotPath,
  screenshotStem,
  type ScreenshotMeta,
} from "./screenshots.js";
import {
  assignmentScreenshotUsage,
  getAssetUsage,
  invalidateAssetUsage,
  pickSeedForColdCoverage,
  pickSeedForNovelStyle,
  allStyleCombos,
  shippedStyleComboUsage,
} from "./diversity.js";
import { ensureIllustrationManifest, illustrationIdsForTemplate, pickPerson } from "./illustrations.js";
import { deleteStaleR2Crops, SCREENSHOT_R2_PREFIX, syncScreenshotsFromR2, uploadBuffer, uploadShort } from "../publish/r2.js";

/** ~98% of title pages get a visual (SVG or photoreal person). ~45% of all new posts are person covers. */
const COVER_VISUAL_RATE = 0.98;
const COVER_PHOTO_RATE = 0.45;
/** Reviewer rejects 3–5 page carousels. Every new post is 6–10 slides. */
const LONG_SLIDE_RATE = 1;

/**
 * Screenshots that should never be auto-assigned to slides —
 * they are too generic or identity-focused to randomly appear.
 * Users can still use these via explicit crop requests.
 */
const BLOCKED_SCREENSHOTS = new Set(["profile.png", "profile_original.png"]);

function applyPrelaunchVariation(variation: Variation, hookText = ""): Variation {
  if (!env.PRELAUNCH) return variation;
  variation.prelaunch = true;
  const option = pickBestCtaOption(hookText);
  variation.ctaLayout = option.layout;
  variation.ctaAtmosphere = option.atmosphere;
  return variation;
}

function pickSlideScreenshot(
  spec: { kind: SlideKind; usesScreenshot: boolean },
  shots: Array<string | null>,
  shotIdx: { n: number },
  fallback?: string | null,
): string | null {
  if (spec.kind === "cta") return resolveCtaScreenshot(fallback);
  if (!spec.usesScreenshot) return fallback ?? null;
  return shots[shotIdx.n++] ?? fallback ?? null;
}

/** Fisher-Yates shuffle seeded by the variation seed for reproducibility. */
function shuffleWithSeed<T>(arr: T[], seed: number): T[] {
  const copy = [...arr];
  let m = copy.length;
  let s = seed >>> 0;
  while (m > 0) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const i = s % m;
    m--;
    [copy[m], copy[i]] = [copy[i]!, copy[m]!];
  }
  return copy;
}

/** Load screenshot descriptions for keyword-matching. */
function loadScreenshotMeta(): Record<string, ScreenshotMeta> {
  return readScreenshotMeta();
}

/**
 * Score a screenshot against slide text. Keyword match still wins when it
 * is real; overused files and jpg/png twins lose so new uploads get slots.
 */
function screenshotKeywordHits(
  file: string,
  slideText: string,
  meta: Record<string, ScreenshotMeta>,
): number {
  const entry = metaFor(file, meta);
  const desc = (entry.description ?? inferScreenshotDescription(file, { cropped: isCroppedScreenshot(file, entry), source: entry.source })).toLowerCase();
  const words = slideText.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  return words.filter((w) => desc.includes(w)).length;
}

function scoreScreenshot(
  file: string,
  slideText: string,
  meta: Record<string, ScreenshotMeta>,
  assignmentUses?: Map<string, number>,
  ratings?: Record<string, number>,
  batchUsed?: Map<string, number>,
): number {
  const entry = metaFor(file, meta);
  const keywordHits = screenshotKeywordHits(file, slideText, meta);
  const cropBonus = isCroppedScreenshot(file, entry) ? 3 : 0;
  const stem = screenshotStem(file);
  const uses = assignmentUses?.get(stem) ?? 0;
  const coldBonus = uses === 0 ? 4 : uses < 3 ? 2 : 0;
  const overuse = uses >= 6 ? -3 : uses >= 3 ? -1 : 0;
  const batchPenalty = -2 * (batchUsed?.get(stem) ?? 0);
  const ratingBonus = ratings ? ((ratings[file] ?? ratings[stem] ?? 50) - 50) / 25 : 0;
  // One real copy match must beat "unused crop" (crop +3, cold +4).
  return keywordHits * 10 + cropBonus + coldBonus + overuse + batchPenalty + ratingBonus;
}

export interface AssignScreenshotOpts {
  exclude?: string[];
  batchUsed?: Map<string, number>;
  ratings?: Record<string, number>;
}

/**
 * Assign screenshots to slide slots using keyword matching against slide copy.
 * Falls back to seeded-random for slots with no good match.
 */
export function assignScreenshots(
  slots: Array<{ idx: number; headline: string; sub: string }>,
  seed: number,
  preferred: string[],
  excludeOrOpts: string[] | AssignScreenshotOpts = [],
): string[] {
  const opts: AssignScreenshotOpts = Array.isArray(excludeOrOpts) ? { exclude: excludeOrOpts } : excludeOrOpts;
  const exclude = opts.exclude ?? [];
  const meta = loadScreenshotMeta();
  const excluded = new Set([...exclude, ...exclude.map(screenshotStem)]);
  let all = listAssignableScreenshots().filter((f) => !BLOCKED_SCREENSHOTS.has(f) && !excluded.has(f) && !excluded.has(screenshotStem(f)));
  if (all.length < slots.length && exclude.length > 0) {
    all = listAssignableScreenshots().filter((f) => !BLOCKED_SCREENSHOTS.has(f));
  }
  if (all.length === 0) return slots.map(() => "");

  const byStem = new Map(all.map((f) => [screenshotStem(f), f]));
  const resolvedPreferred = [...new Set(
    preferred
      .map((p) => (all.includes(p) ? p : byStem.get(screenshotStem(p)) ?? byStem.get(p)))
      .filter((p): p is string => Boolean(p)),
  )];
  const preferredSet = new Set(resolvedPreferred);
  const pool = [
    ...resolvedPreferred,
    ...shuffleWithSeed(all.filter((s) => !preferredSet.has(s)), seed),
  ];

  const assigned: string[] = [];
  const used = new Set<string>();
  let assignmentUses: Map<string, number> | undefined;
  try {
    assignmentUses = assignmentScreenshotUsage();
  } catch {
    assignmentUses = undefined;
  }

  for (const slot of slots) {
    const slideText = `${slot.headline} ${slot.sub}`;
    const scored = pool
      .filter((f) => !used.has(f) && !used.has(screenshotStem(f)))
      .map((f) => ({
        file: f,
        hits: screenshotKeywordHits(f, slideText, meta),
        score: scoreScreenshot(f, slideText, meta, assignmentUses, opts.ratings, opts.batchUsed),
      }))
      .sort((a, b) => b.score - a.score);
    const matched = scored.filter((s) => s.hits > 0);
    const pick = (matched[0] ?? scored[0])?.file ?? pool.find((f) => !used.has(f)) ?? pool[0]!;
    if (pick && !isCroppedScreenshot(pick, metaFor(pick, meta))) {
      throw new Error(`Screenshot assigner picked a raw file (${pick}). Only library crops may be assigned.`);
    }
    assigned.push(pick);
    used.add(pick);
    used.add(screenshotStem(pick));
  }
  return assigned;
}

function usageColdScreens(assignable: Set<string>): string[] {
  try {
    return getAssetUsage()
      .screenshots.filter((s) => s.cold && assignable.has(s.name))
      .sort((a, b) => a.totalUses - b.totalUses)
      .map((s) => s.name)
      .slice(0, 8);
  } catch {
    return [];
  }
}

export interface GeneratedPost {
  postId: number;
  hookText: string;
  templateId: string;
  slideFiles: string[];
  status: string;
}

export async function generateBatch(count = env.POSTS_PER_DAY, variationsPerHook = 1): Promise<GeneratedPost[]> {
  if (!env.GENERATE_ENABLED) throw new Error(GENERATE_PAUSED_MESSAGE);
  for (const rule of HARD_CONSTRAINTS) addRule(rule, 10);
  const ingestedSvgs = ensureIllustrationManifest();
  if (ingestedSvgs.added.length) {
    console.log(`Ingested ${ingestedSvgs.added.length} illustration(s): ${ingestedSvgs.added.join(", ")}`);
  }
  await syncScreenshotsFromR2().catch(() => 0);
  const ingested = ensureScreenshotMeta();
  if (ingested.added.length) {
    console.log(`Ingested ${ingested.added.length} screenshot(s) into the library: ${ingested.added.join(", ")}`);
    await persistScreenshotMetaToR2().catch(() => undefined);
  }
  invalidateAssetUsage();
  const db = getDb();
  const knowledge = getKnowledgeContext();
  const platforms: Platform[] = [...configuredPlatforms()];
  if (accountFor("youtube") && !platforms.includes("youtube")) platforms.push("youtube");
  const generated: GeneratedPost[] = [];

  const hookCount = Math.ceil(count / variationsPerHook);
  const newHooks = await generateHooks(hookCount);
  if (newHooks.length === 0) throw new Error("No hooks generated — check hook formulas are seeded (npm run db:seed).");

  // Learning cycle phase: diversity rounds hunt untested combos much harder.
  let diversityPhase = true;
  try {
    const round = db.select().from(rounds).where(eq(rounds.status, "active")).orderBy(desc(rounds.id)).get();
    diversityPhase = (round?.phase ?? "diversity") === "diversity";
  } catch {
    // rounds table missing on old DBs — default to diversity behavior
  }

  // Cold assets (never shipped) get pushed into this batch so they get tested.
  let coldSvgIds: string[] = [];
  let templateShippedUses = new Map<string, number>();
  let coldStyleCombos = new Set<string>();
  try {
    const usage = getAssetUsage();
    coldSvgIds = usage.svgs.filter((s) => s.cold).map((s) => s.name);
    templateShippedUses = new Map(usage.templates.map((t) => [t.name, t.publishedUses]));
    const comboUsage = shippedStyleComboUsage();
    coldStyleCombos = new Set(allStyleCombos().filter((c) => !comboUsage.has(c)));
    const coldScreens = usage.screenshots.filter((s) => s.cold).length;
    if (coldScreens || coldSvgIds.length || coldStyleCombos.size) {
      console.log(
        `Cold pending test: ${coldScreens} screenshots, ${coldSvgIds.length} SVGs, ${coldStyleCombos.size} style combos${diversityPhase ? " (diversity phase — targeting them)" : ""}.`,
      );
    }
  } catch {
    // usage scan is best-effort — never block generation
  }
  // Diversity phase activates cold assets on every post; A/B phase once per batch.
  const coldSeedBudget = diversityPhase ? count : 1;
  let coldSeedsUsed = 0;

  // Track which templates were used in this batch to enforce variety + cover mix.
  const usedTemplates: string[] = [];
  const batchShotUses = new Map<string, number>();
  const screenshotRatings = ratingsMap("screenshot");
  const longIds = Object.keys(TEMPLATES).filter((id) => isLongTemplate(TEMPLATES[id]!));
  const photoIds = photoCoverTemplateIds().filter((id) => longIds.includes(id));
  const svgCoverIds = illustrationCoverTemplateIds().filter((id) => longIds.includes(id));
  const textIds = Object.keys(TEMPLATES).filter(
    (id) => longIds.includes(id) && !photoIds.includes(id) && !svgCoverIds.includes(id),
  );
  let targetPhotos: number;
  let targetSvgs: number;
  if (count === 1) {
    const r = Math.random();
    targetPhotos = r < COVER_PHOTO_RATE ? 1 : 0;
    targetSvgs = r >= COVER_PHOTO_RATE && r < COVER_VISUAL_RATE ? 1 : 0;
  } else {
    targetPhotos = Math.round(count * COVER_PHOTO_RATE);
    targetSvgs = Math.max(0, Math.round(count * COVER_VISUAL_RATE) - targetPhotos);
  }
  const targetLong = count === 1
    ? (Math.random() < LONG_SLIDE_RATE ? 1 : 0)
    : Math.max(1, Math.round(count * LONG_SLIDE_RATE));
  let photosUsed = 0;
  let svgsUsed = 0;
  let longsUsed = 0;

  outer: for (const hook of newHooks) {
    for (let v = 0; v < variationsPerHook; v++) {
      if (generated.length >= count) break outer;

      const remaining = count - generated.length;
      const photosLeft = targetPhotos - photosUsed;
      const svgsLeft = targetSvgs - svgsUsed;
      const visualsLeft = photosLeft + svgsLeft;
      let pool: string[];
      if (photosLeft >= remaining && photosLeft > 0) {
        pool = photoIds;
      } else if (svgsLeft >= remaining && svgsLeft > 0) {
        pool = svgCoverIds;
      } else if (visualsLeft >= remaining && visualsLeft > 0) {
        pool = [...(photosLeft > 0 ? photoIds : []), ...(svgsLeft > 0 ? svgCoverIds : [])];
      } else {
        pool = [
          ...(photosLeft > 0 ? photoIds : []),
          ...(svgsLeft > 0 ? svgCoverIds : []),
          ...textIds,
        ];
      }
      if (!pool.length) pool = textIds;
      const longPool = pool.filter((id) => longIds.includes(id));
      if (longPool.length) pool = longPool;
      // Soft teach tilt inside the cover/length pool — length stays 6–10.
      pool = biasPoolTowardTeach(pool, { preferLong: true });

      let templateId: string;
      const unused = pool.filter((id) => !usedTemplates.includes(id));
      if (unused.length > 0 && diversityPhase) {
        // Diversity phase: among unused templates, favor the least-shipped ones.
        const sorted = [...unused].sort(
          (a, b) => (templateShippedUses.get(a) ?? 0) - (templateShippedUses.get(b) ?? 0),
        );
        const window = sorted.slice(0, Math.min(3, sorted.length));
        templateId = window[Math.floor(Math.random() * window.length)]!;
      } else if (unused.length > 0) {
        templateId = unused[Math.floor(Math.random() * unused.length)]!;
      } else {
        templateId = pickTemplateId(teachBiasWeights(pool, knowledge.templateWeights));
        if (!pool.includes(templateId)) templateId = pool[Math.floor(Math.random() * pool.length)] ?? svgCoverIds[0] ?? "N";
        usedTemplates.length = 0;
      }
      templateId = enforcePersonTemplate(templateId, hook.text, usedTemplates);
      usedTemplates.push(templateId);
      if (photoIds.includes(templateId)) photosUsed++;
      if (svgCoverIds.includes(templateId)) svgsUsed++;
      if (longIds.includes(templateId)) longsUsed++;

      const template = TEMPLATES[templateId]!;
      const hasScreenshots = template.slides.some((s) => s.usesScreenshot);
      // Steer the seed toward untested territory: first cold SVGs, then
      // never-shipped style combos. Budgeted per phase (see coldSeedBudget).
      let coldSeed: number | undefined;
      if (coldSeedsUsed < coldSeedBudget) {
        if (coldSvgIds.length > 0) {
          coldSeed = pickSeedForColdCoverage(template, coldSvgIds, { preferIds: knowledge.asset.preferSVGs });
          if (coldSeed !== undefined) {
            console.log(`Cold-asset activation: seed ${coldSeed} hits an untested SVG on template ${templateId}.`);
          }
        }
        if (coldSeed === undefined && diversityPhase && coldStyleCombos.size > 0) {
          coldSeed = pickSeedForNovelStyle(coldStyleCombos, { hasScreenshots, preferMusic: Boolean(template.preferMusic) });
          if (coldSeed !== undefined) {
            // Don't chase the same combo twice within one batch.
            const v = makeVariation({ seed: coldSeed, hasScreenshots, preferMusic: Boolean(template.preferMusic) });
            coldStyleCombos.delete(`${v.background}/${v.textStyle}/${v.layout}`);
            console.log(`Style-novelty activation: seed ${coldSeed} lands an untested color/style combo on template ${templateId}.`);
          }
        }
        if (coldSeed !== undefined) coldSeedsUsed++;
      }
      const variation: Variation = applyPrelaunchVariation(
        makeVariation({ seed: coldSeed, hasScreenshots, preferMusic: Boolean(template.preferMusic) }),
        hook.text,
      );
      const ctaOption = pickBestCtaOption(hook.text);
      variation.illustrationIds = illustrationIdsForTemplate(
        variation.seed,
        template.slides.length,
        (i) => template.slides[i]?.kind,
      );
      variation.shortBed = SILENT_BED_ID;
      variation.shotScale = pickShotScale({
        shipped: shippedShotScaleUsage(),
        weights: ratingsMap("shot_scale"),
      });

      // Generate copy FIRST so we can match screenshots to slide text.
      const copy = await generateCarouselCopy(hook.text, template, hook.category, ctaOption);

      // Build slot descriptors from the generated copy for keyword-matching.
      const screenshotSlotDescriptors = template.slides
        .map((s, i) => ({ idx: i, usesScreenshot: s.usesScreenshot, headline: copy.slides[i]?.headline ?? "", sub: copy.slides[i]?.sub ?? "" }))
        .filter((s) => s.usesScreenshot);
      const assignable = new Set(listAssignableScreenshots());
      const coldPreferred = usageColdScreens(assignable);
      const shots = assignScreenshots(screenshotSlotDescriptors, variation.seed, [...coldPreferred, ...knowledge.bestScreenshots], {
        batchUsed: batchShotUses,
        ratings: screenshotRatings,
      });
      for (const file of shots) {
        if (!file) continue;
        const stem = screenshotStem(file);
        batchShotUses.set(stem, (batchShotUses.get(stem) ?? 0) + 1);
      }

      const formulaScore = hook.formulaId
        ? (knowledge.formulaScores[hook.formulaId] ?? 0)
        : 0;
      const evolvedBonus = hook.source === "evolved" ? 15 : 0;
      const confidence = Math.max(0, Math.min(100, 50 + formulaScore * 10 + evolvedBonus));

      const status = confidence >= env.AUTO_APPROVE_CONFIDENCE ? "approved" : "queued";
      const post = db
        .insert(posts)
        .values({
          hookId: hook.id,
          templateId,
          variation,
          caption: copy.caption,
          tiktokTitle: copy.tiktokTitle,
          hashtags: copy.hashtags,
          platforms,
          status,
          confidence,
        })
        .returning()
        .get();
      if (!post) continue;

      db.update(hooksTable).set({ status: "used" }).where(eq(hooksTable.id, hook.id)).run();

      const outDir = postOutputDir(post.id);
      const slideFiles: string[] = [];
      const shotCursor = { n: 0 };
      let tipNumber = 0;
      for (let i = 0; i < template.slides.length; i++) {
        const spec = template.slides[i]!;
        const line = copy.slides[i] ?? { headline: "", sub: "" };
        const screenshot = pickSlideScreenshot(
          spec,
          shots,
          shotCursor,
          spec.kind === "cta" ? ctaOption.screenshot : undefined,
        );
        if (spec.kind === "tip") tipNumber++;
        const filePath = path.join(outDir, slideFileName(i));
        // Illustration on slide 0 acts as the hook — always uses hook text.
        const isHookSlide = isCoverHeadlineSlide(spec.kind, i);
        const headline = isHookSlide ? hook.text : line.headline;
        await renderSlide(
          {
            kind: spec.kind,
            headline,
            sub: line.sub,
            screenshot,
            index: i,
            total: template.slides.length,
            tipNumber: spec.kind === "tip" ? tipNumber : undefined,
          },
          variation,
          filePath,
        );
        db.insert(slides)
          .values({
            postId: post.id,
            idx: i,
            kind: spec.kind,
            headline,
            sub: line.sub,
            screenshot,
            filePath,
          })
          .run();
        slideFiles.push(filePath);
      }

      await ensurePostShort(post.id, slideFiles, status === "queued" || status === "approved");
      generated.push({ postId: post.id, hookText: hook.text, templateId, slideFiles, status });
      console.log(`Generated post #${post.id} [${templateId}] (${status}, confidence ${confidence.toFixed(0)}): ${hook.text}`);
    }
  }

  return generated;
}

/** One-off review batch: force cover templates + specific SVGs. Does not turn generate on. */
export async function generateForcedIllustrationPosts(
  jobs: Array<{ templateId: string; illustrationIds: string[] }>,
): Promise<GeneratedPost[]> {
  if (jobs.length === 0) return [];
  const ingestedSvgs = ensureIllustrationManifest();
  if (ingestedSvgs.added.length) {
    console.log(`Ingested ${ingestedSvgs.added.length} illustration(s): ${ingestedSvgs.added.join(", ")}`);
  }
  await syncScreenshotsFromR2().catch(() => 0);
  const ingested = ensureScreenshotMeta();
  if (ingested.added.length) {
    console.log(`Ingested ${ingested.added.length} screenshot(s) into the library: ${ingested.added.join(", ")}`);
    await persistScreenshotMetaToR2().catch(() => undefined);
  }
  invalidateAssetUsage();
  const db = getDb();
  const knowledge = getKnowledgeContext();
  const platforms: Platform[] = [...configuredPlatforms()];
  if (accountFor("youtube") && !platforms.includes("youtube")) platforms.push("youtube");
  const newHooks = await generateHooks(jobs.length);
  if (newHooks.length < jobs.length) throw new Error("Not enough hooks generated for the SVG review batch.");
  const generated: GeneratedPost[] = [];
  const batchShotUses = new Map<string, number>();
  const screenshotRatings = ratingsMap("screenshot");

  for (let j = 0; j < jobs.length; j++) {
    const job = jobs[j]!;
    const hook = newHooks[j]!;
    const templateId = enforcePersonTemplate(job.templateId, hook.text);
    const template = TEMPLATES[templateId];
    if (!template) throw new Error(`Unknown template ${templateId}`);
    const hasScreenshots = template.slides.some((s) => s.usesScreenshot);
    const variation: Variation = makeVariation({ hasScreenshots, preferMusic: Boolean(template.preferMusic) });
    applyPrelaunchVariation(variation, hook.text);
    variation.shortBed = SILENT_BED_ID;
    const ctaOption = pickBestCtaOption(hook.text);
    const pickedIds = illustrationIdsForTemplate(
      variation.seed,
      template.slides.length,
      (i) => template.slides[i]?.kind,
    );
    if (job.illustrationIds[0] && pickedIds.length) pickedIds[0] = job.illustrationIds[0];
    for (let i = 0; i < Math.min(job.illustrationIds.length, pickedIds.length); i++) {
      if (job.illustrationIds[i]) pickedIds[i] = job.illustrationIds[i]!;
    }
    variation.illustrationIds = pickedIds;
    const copy = await generateCarouselCopy(hook.text, template, hook.category, ctaOption);
    const screenshotSlotDescriptors = template.slides
      .map((s, i) => ({ idx: i, usesScreenshot: s.usesScreenshot, headline: copy.slides[i]?.headline ?? "", sub: copy.slides[i]?.sub ?? "" }))
      .filter((s) => s.usesScreenshot);
    const assignable = new Set(listAssignableScreenshots());
    const coldPreferred = usageColdScreens(assignable);
    const shots = assignScreenshots(screenshotSlotDescriptors, variation.seed, [...coldPreferred, ...knowledge.bestScreenshots], {
      batchUsed: batchShotUses,
      ratings: screenshotRatings,
    });
    for (const file of shots) {
      if (!file) continue;
      const stem = screenshotStem(file);
      batchShotUses.set(stem, (batchShotUses.get(stem) ?? 0) + 1);
    }
    const status = "queued";
    const post = db
      .insert(posts)
      .values({
        hookId: hook.id,
        templateId,
        variation,
        caption: copy.caption,
        tiktokTitle: copy.tiktokTitle,
        hashtags: copy.hashtags,
        platforms,
        status,
        confidence: 50,
      })
      .returning()
      .get();
    if (!post) continue;
    db.update(hooksTable).set({ status: "used" }).where(eq(hooksTable.id, hook.id)).run();
    const outDir = postOutputDir(post.id);
    const slideFiles: string[] = [];
    const shotCursor = { n: 0 };
    let tipNumber = 0;
    for (let i = 0; i < template.slides.length; i++) {
      const spec = template.slides[i]!;
      const line = copy.slides[i] ?? { headline: "", sub: "" };
      const screenshot = pickSlideScreenshot(
        spec,
        shots,
        shotCursor,
        spec.kind === "cta" ? ctaOption.screenshot : undefined,
      );
      if (spec.kind === "tip") tipNumber++;
      const filePath = path.join(outDir, slideFileName(i));
      const isHookSlide = isCoverHeadlineSlide(spec.kind, i);
      const headline = isHookSlide ? hook.text : line.headline;
      await renderSlide(
        {
          kind: spec.kind,
          headline,
          sub: line.sub,
          screenshot,
          index: i,
          total: template.slides.length,
          tipNumber: spec.kind === "tip" ? tipNumber : undefined,
        },
        variation,
        filePath,
      );
      db.insert(slides)
        .values({
          postId: post.id,
          idx: i,
          kind: spec.kind,
          headline,
          sub: line.sub,
          screenshot,
          filePath,
        })
        .run();
      slideFiles.push(filePath);
    }
    await ensurePostShort(post.id, slideFiles, true);
    generated.push({ postId: post.id, hookText: hook.text, templateId, slideFiles, status });
    console.log(`Generated post #${post.id} [${templateId}] (queued): ${hook.text}`);
  }
  return generated;
}

/**
 * Queued CTA-layout teasers for Review. Does not pin or replace
 * the current "This post" manual item.
 */
export async function generateCtaReviewPosts(): Promise<GeneratedPost[]> {
  const pinned = loadManualPosting();
  const db = getDb();
  const template = TEMPLATES.I;
  if (!template) throw new Error("Template I missing");
  await syncScreenshotsFromR2().catch(() => 0);
  ensureScreenshotMeta();
  const queued = db.select().from(posts).where(eq(posts.status, "queued")).all();
  const review = queued
    .filter((post) => parseVariation(post.variation).ctaReview)
    .sort((a, b) => a.id - b.id);
  /** First-pass fakes (#83–85). Keep #86+ and remake those in place. */
  const OLD_CTA_MAX = 85;
  for (const post of review) {
    if (post.id <= OLD_CTA_MAX) {
      db.update(posts).set({ status: "rejected" }).where(eq(posts.id, post.id)).run();
    }
  }
  const keepers = review.filter((post) => post.id > OLD_CTA_MAX);
  for (const extra of keepers.slice(CTA_REVIEW_OPTIONS.length)) {
    db.update(posts).set({ status: "rejected" }).where(eq(posts.id, extra.id)).run();
  }
  const reuse = keepers.slice(0, CTA_REVIEW_OPTIONS.length);
  const platforms: Platform[] = [...configuredPlatforms()];
  if (accountFor("youtube") && !platforms.includes("youtube")) platforms.push("youtube");
  let hookRows = db.select().from(hooksTable).orderBy(desc(hooksTable.id)).limit(12).all();
  const needHooks = Math.max(0, CTA_REVIEW_OPTIONS.length - reuse.length);
  if (hookRows.length < needHooks) {
    hookRows = [...hookRows, ...(await generateHooks(needHooks - hookRows.length))];
  }
  const generated: GeneratedPost[] = [];
  const ctaShot = resolveCtaScreenshot();
  try {
    for (let i = 0; i < CTA_REVIEW_OPTIONS.length; i++) {
      const option = CTA_REVIEW_OPTIONS[i]!;
      const ctaFile = resolveCtaScreenshot(option.screenshot) ?? ctaShot;
      const existing = reuse[i];
      if (existing) {
        const variation: Variation = {
          ...parseVariation(existing.variation),
          background: "dark",
          textStyle: option.textStyle,
          layout: "standard",
          frame: "plain",
          shotScale: "contained",
          tilt: 0,
          prelaunch: true,
          ctaLayout: option.layout,
          ctaAtmosphere: option.atmosphere,
          ctaReview: true,
          shortBed: SILENT_BED_ID,
        };
        db.update(posts)
          .set({
            variation,
            caption: ensureComingSoonCaption(existing.caption),
          })
          .where(eq(posts.id, existing.id))
          .run();
        const slideRows = db.select().from(slides).where(eq(slides.postId, existing.id)).all();
        for (const row of slideRows) {
          if (row.kind !== "cta") continue;
          db.update(slides)
            .set({ headline: option.headline, sub: option.sub, screenshot: ctaFile })
            .where(eq(slides.id, row.id))
            .run();
        }
        await rerenderPost(existing.id);
        generated.push({
          postId: existing.id,
          hookText: option.headline,
          templateId: existing.templateId,
          slideFiles: [],
          status: "queued",
        });
        console.log(`CTA review remade #${existing.id} [${option.layout}]: ${option.headline}`);
        continue;
      }
      const hook = hookRows[i - reuse.length];
      if (!hook) throw new Error("No hooks available for CTA review");
      const variation: Variation = {
        ...makeVariation({ seed: 9100 + i, hasScreenshots: true }),
        background: "dark",
        textStyle: option.textStyle,
        layout: "standard",
        frame: "plain",
        shotScale: "contained",
        tilt: 0,
        prelaunch: true,
        ctaLayout: option.layout,
        ctaAtmosphere: option.atmosphere,
        ctaReview: true,
        shortBed: SILENT_BED_ID,
      };
      const bodyShot = assignScreenshots(
        [{ idx: 1, headline: hook.text, sub: "" }],
        variation.seed,
        [],
      )[0] ?? ctaFile;
      const copySlides = [
        { headline: hook.text, sub: "" },
        { headline: "This is what that looks like.", sub: "A session, not another playlist." },
        { headline: option.headline, sub: option.sub },
      ];
      const caption = ensureComingSoonCaption(`${hook.text}\n\n${option.headline}`);
      const post = db
        .insert(posts)
        .values({
          hookId: hook.id,
          templateId: template.id,
          variation,
          caption,
          tiktokTitle: hook.text.slice(0, 88),
          hashtags: "#backpain #backpainrelief #posture #physicaltherapy #lowerbackpain",
          platforms,
          status: "queued",
          confidence: 50,
        })
        .returning()
        .get();
      if (!post) continue;
      const outDir = postOutputDir(post.id);
      const slideFiles: string[] = [];
      for (let s = 0; s < template.slides.length; s++) {
        const spec = template.slides[s]!;
        const line = copySlides[s] ?? { headline: "", sub: "" };
        const screenshot = spec.kind === "cta" ? ctaFile : spec.usesScreenshot ? bodyShot : null;
        const filePath = path.join(outDir, slideFileName(s));
        await renderSlide(
          {
            kind: spec.kind,
            headline: line.headline,
            sub: line.sub,
            screenshot,
            index: s,
            total: template.slides.length,
          },
          variation,
          filePath,
        );
        db.insert(slides)
          .values({
            postId: post.id,
            idx: s,
            kind: spec.kind,
            headline: line.headline,
            sub: line.sub,
            screenshot,
            filePath,
          })
          .run();
        slideFiles.push(filePath);
      }
      await ensurePostShort(post.id, slideFiles, true);
      generated.push({ postId: post.id, hookText: hook.text, templateId: template.id, slideFiles, status: "queued" });
      console.log(`CTA review #${post.id} [${option.layout}]: ${option.headline}`);
    }
  } finally {
    const now = loadManualPosting();
    if (now.currentPostId !== pinned.currentPostId) {
      saveManualPosting({ ...now, currentPostId: pinned.currentPostId });
    }
  }
  return generated;
}

/** Patch one post's last slide + caption for coming-soon. Skips already-sent posts. */
export async function applyPrelaunchCta(postId: number): Promise<void> {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) throw new Error(`Post ${postId} not found`);
  if (post.status === "published" || post.status === "draft_sent") {
    throw new Error(`Post ${postId} already sent`);
  }
  const template = TEMPLATES[post.templateId];
  const hook = db.select().from(hooksTable).where(eq(hooksTable.id, post.hookId)).get();
  const hookText = hook?.text ?? post.tiktokTitle;
  const parsed = parseVariation(post.variation, Boolean(template?.preferMusic));
  const variation: Variation = applyPrelaunchVariation({ ...parsed }, hookText);
  const option = pickBestCtaOption(hookText);
  const meta = ensureDistributionMeta(hookText, post.tiktokTitle, post.caption);
  db.update(posts)
    .set({
      variation,
      caption: meta.caption,
      tiktokTitle: meta.tiktokTitle,
    })
    .where(eq(posts.id, postId))
    .run();
  const ctaRows = db.select().from(slides).where(eq(slides.postId, postId)).all().filter((s) => s.kind === "cta");
  if (ctaRows.length === 0) throw new Error(`Post ${postId} has no CTA slide`);
  const ctaFile = resolveCtaScreenshot(option.screenshot);
  for (const row of ctaRows) {
    db.update(slides)
      .set({ headline: option.headline, sub: option.sub, screenshot: ctaFile })
      .where(eq(slides.id, row.id))
      .run();
  }
  await rerenderPost(postId);
}

export async function applyPrelaunchQueue(): Promise<{
  converted: number;
  skipped: number;
  currentPostId: number | null;
  remaining: number;
}> {
  const db = getDb();
  const approved = db.select().from(posts).where(eq(posts.status, "approved")).all();
  let converted = 0;
  let skipped = 0;
  for (const post of approved) {
    const template = TEMPLATES[post.templateId];
    const variation = parseVariation(post.variation, Boolean(template?.preferMusic));
    if (variation.prelaunch) {
      skipped++;
      continue;
    }
    await applyPrelaunchCta(post.id);
    converted++;
  }
  const state = initManualQueue([56]);
  return {
    converted,
    skipped,
    currentPostId: state.currentPostId,
    remaining: approvedReadyIds(loadManualPosting().completedIds).length,
  };
}

export async function rerenderPost(postId: number): Promise<void> {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) throw new Error(`Post ${postId} not found`);
  const template = TEMPLATES[post.templateId];
  const variation = parseVariation(post.variation, Boolean(template?.preferMusic));
  const caption = variation.prelaunch
    ? ensureComingSoonCaption(post.caption)
    : ensureAppStoreCaption(post.caption);
  db.update(posts)
    .set({ variation, caption })
    .where(eq(posts.id, postId))
    .run();

  const slideRows = db.select().from(slides).where(eq(slides.postId, postId)).orderBy(asc(slides.idx)).all();
  let tipNumber = 0;
  for (const s of slideRows) {
    const kind = s.kind as SlideKind;
    if (kind === "tip") tipNumber++;
    const filePath = path.join(postOutputDir(postId), slideFileName(s.idx));
    const headline = kind === "tip"
      ? stripTipNumberPrefix(stripFalseFreeClaims(s.headline))
      : stripFalseFreeClaims(s.headline);
    const sub = stripFalseFreeClaims(s.sub);
    if (headline !== s.headline || sub !== s.sub) {
      db.update(slides).set({ headline, sub }).where(eq(slides.id, s.id)).run();
    }
    await renderSlide(
      {
        kind,
        headline,
        sub,
        screenshot: s.screenshot,
        index: s.idx,
        total: slideRows.length,
        tipNumber: s.kind === "tip" ? tipNumber : undefined,
      },
      variation,
      filePath,
    );
    if (filePath !== s.filePath) {
      db.update(slides).set({ filePath }).where(eq(slides.id, s.id)).run();
    }
  }
  const paths = db.select().from(slides).where(eq(slides.postId, postId)).orderBy(asc(slides.idx)).all().map((s) => s.filePath);
  if (paths.length < 2) return;
  await ensurePostShort(postId, paths, post.status === "queued" || post.status === "approved");
}

export async function ensurePostShort(postId: number, slidePaths: string[], uploadPreview: boolean): Promise<string> {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  const variation = post ? parseVariation(post.variation) : undefined;
  const out = shortOutputPath(postOutputDir(postId));
  const rendered = await renderSlideshowShort(slidePaths, out, postId, SILENT_BED_ID);
  if (post && variation?.shortBed !== SILENT_BED_ID) {
    db.update(posts)
      .set({ variation: { ...parseVariation(post.variation), shortBed: SILENT_BED_ID } })
      .where(eq(posts.id, postId))
      .run();
  }
  pruneLocalPostDir(postId, true);
  if (uploadPreview && r2Configured()) {
    await uploadShort(postId, out, !rendered.reused).catch((err) => {
      console.warn(`Short preview upload skipped for #${postId}:`, err instanceof Error ? err.message : err);
    });
    await pruneRemotePostMedia(postId, true).catch(() => 0);
  }
  return out;
}

/** Render missing in-review Shorts (skip-ffmpeg when slides+bed already match). */
export async function buildInReviewShorts(): Promise<{ built: number; reused: number }> {
  const db = getDb();
  const rows = db
    .select()
    .from(posts)
    .where(inArray(posts.status, ["queued", "approved"]))
    .all();
  let built = 0;
  let reused = 0;
  for (const post of rows) {
    const slideRows = db.select().from(slides).where(eq(slides.postId, post.id)).orderBy(asc(slides.idx)).all();
    if (slideRows.length < 2) continue;
    const out = shortOutputPath(postOutputDir(post.id));
    const existed = fs.existsSync(out);
    await ensurePostShort(
      post.id,
      slideRows.map((s) => s.filePath),
      true,
    );
    if (existed) reused++;
    else built++;
  }
  return { built, reused };
}

/** Apply the best review CTA + distribution title/caption on queued/approved posts. */
export async function applyBestCtasInPlace(): Promise<{ postIds: number[] }> {
  const db = getDb();
  const rows = db
    .select()
    .from(posts)
    .where(inArray(posts.status, ["queued", "approved"]))
    .all();
  const postIds: number[] = [];
  for (const post of rows) {
    const parsed = parseVariation(post.variation);
    if (parsed.ctaReview) continue;
    const hook = db.select().from(hooksTable).where(eq(hooksTable.id, post.hookId)).get();
    const hookText = hook?.text ?? post.tiktokTitle;
    const variation = applyPrelaunchVariation({ ...parsed }, hookText);
    const option = pickBestCtaOption(hookText);
    const meta = ensureDistributionMeta(hookText, post.tiktokTitle, post.caption);
    db.update(posts)
      .set({
        variation,
        caption: meta.caption,
        tiktokTitle: meta.tiktokTitle,
      })
      .where(eq(posts.id, post.id))
      .run();
    const slideRows = db.select().from(slides).where(eq(slides.postId, post.id)).all();
    if (slideRows.length < 2) {
      console.warn(`Skip #${post.id} — ${slideRows.length} slide(s), need 2+`);
      continue;
    }
    const ctaFile = resolveCtaScreenshot(option.screenshot);
    const ctaRows = slideRows.filter((s) => s.kind === "cta");
    for (const row of ctaRows) {
      db.update(slides)
        .set({ headline: option.headline, sub: option.sub, screenshot: ctaFile })
        .where(eq(slides.id, row.id))
        .run();
    }
    await rerenderPost(post.id);
    postIds.push(post.id);
    console.log(`In-place CTA #${post.id} [${option.label}]: ${option.headline}`);
  }
  return { postIds };
}

/** Rewrite body copy + slides for queued posts. Keeps the same hooks, templates, and post IDs. */
export async function remakeQueuedCopy(): Promise<{ postIds: number[] }> {
  if (!env.GENERATE_ENABLED) throw new Error(GENERATE_PAUSED_MESSAGE);
  const db = getDb();
  const queued = db.select().from(posts).where(eq(posts.status, "queued")).all();
  const knowledge = getKnowledgeContext();
  const screenshotRatings = ratingsMap("screenshot");
  const batchShotUses = new Map<string, number>();
  const postIds: number[] = [];

  for (const post of queued) {
    const hook = db.select().from(hooksTable).where(eq(hooksTable.id, post.hookId)).get();
    const template = TEMPLATES[post.templateId];
    if (!hook || !template) continue;
    const parsed = parseVariation(post.variation, Boolean(template.preferMusic));
    if (parsed.ctaReview) continue;

    const variation = applyPrelaunchVariation({ ...parsed }, hook.text);
    const ctaOption = pickBestCtaOption(hook.text);
    const copy = await generateCarouselCopy(hook.text, template, hook.category, ctaOption);

    const screenshotSlotDescriptors = template.slides
      .map((s, i) => ({
        idx: i,
        usesScreenshot: s.usesScreenshot,
        headline: copy.slides[i]?.headline ?? "",
        sub: copy.slides[i]?.sub ?? "",
      }))
      .filter((s) => s.usesScreenshot);
    const assignable = new Set(listAssignableScreenshots());
    const coldPreferred = usageColdScreens(assignable);
    const shots = assignScreenshots(screenshotSlotDescriptors, variation.seed, [...coldPreferred, ...knowledge.bestScreenshots], {
      batchUsed: batchShotUses,
      ratings: screenshotRatings,
    });
    for (const file of shots) {
      if (!file) continue;
      const stem = screenshotStem(file);
      batchShotUses.set(stem, (batchShotUses.get(stem) ?? 0) + 1);
    }

    db.update(posts)
      .set({
        variation,
        caption: copy.caption,
        tiktokTitle: copy.tiktokTitle,
        hashtags: copy.hashtags,
      })
      .where(eq(posts.id, post.id))
      .run();

    const slideRows = db.select().from(slides).where(eq(slides.postId, post.id)).orderBy(asc(slides.idx)).all();
    let shotIdx = 0;
    for (let i = 0; i < slideRows.length; i++) {
      const row = slideRows[i]!;
      const spec = template.slides[i];
      const line = copy.slides[i] ?? { headline: "", sub: "" };
      const isHookSlide = isCoverHeadlineSlide(row.kind, i);
      const screenshot = pickSlideScreenshot(
        spec ?? { kind: row.kind as SlideKind, usesScreenshot: false },
        shots,
        { n: shotIdx },
        spec?.kind === "cta" ? ctaOption.screenshot : row.screenshot,
      );
      if (spec?.usesScreenshot) shotIdx++;
      db.update(slides)
        .set({
          headline: isHookSlide ? hook.text : line.headline,
          sub: isHookSlide ? "" : line.sub,
          screenshot,
        })
        .where(eq(slides.id, row.id))
        .run();
    }

    await rerenderPost(post.id);
    postIds.push(post.id);
    console.log(`Remade copy for #${post.id} [${post.templateId}]: ${hook.text}`);
  }

  return { postIds };
}

/** Rebuild one post onto a (usually longer) template. Keeps hook + visual style. */
export async function rebuildPostOnTemplate(
  postId: number,
  templateId: string,
  batchShotUses?: Map<string, number>,
): Promise<void> {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) throw new Error(`Post ${postId} not found`);
  const hook = db.select().from(hooksTable).where(eq(hooksTable.id, post.hookId)).get();
  templateId = enforcePersonTemplate(templateId, hook?.text ?? "");
  const template = TEMPLATES[templateId];
  if (!hook || !template) throw new Error(`Post ${postId} missing hook or template ${templateId}`);

  const knowledge = getKnowledgeContext();
  const screenshotRatings = ratingsMap("screenshot");
  const uses = batchShotUses ?? new Map<string, number>();
  const variation: Variation = applyPrelaunchVariation({
    ...parseVariation(post.variation, Boolean(template.preferMusic)),
    illustrationIds: (() => {
      const prev = parseVariation(post.variation, Boolean(template.preferMusic));
      const ids = illustrationIdsForTemplate(
        prev.seed,
        template.slides.length,
        (i) => template.slides[i]?.kind,
      );
      const coverId = prev.illustrationIds?.[0];
      const coverKind = template.slides[0]?.kind;
      if (coverId && (coverKind === "photo_person" || coverKind === "illustration") && ids.length) {
        ids[0] = coverId;
        if (coverKind === "photo_person") {
          const used = new Set([coverId]);
          for (let i = 1; i < ids.length; i++) {
            if (template.slides[i]?.kind !== "photo_person") continue;
            if (!ids[i] || used.has(ids[i])) {
              try {
                ids[i] = pickPerson(prev.seed, i, used).id;
              } catch {
                // pool empty — leave as-is
              }
            }
            if (ids[i]) used.add(ids[i]);
          }
        }
      }
      return ids;
    })(),
  }, hook.text);
  const ctaOption = pickBestCtaOption(hook.text);
  const copy = await generateCarouselCopy(hook.text, template, hook.category, ctaOption);
  const screenshotSlotDescriptors = template.slides
    .map((s, i) => ({
      idx: i,
      usesScreenshot: s.usesScreenshot,
      headline: copy.slides[i]?.headline ?? "",
      sub: copy.slides[i]?.sub ?? "",
    }))
    .filter((s) => s.usesScreenshot);
  const assignable = new Set(listAssignableScreenshots());
  const coldPreferred = usageColdScreens(assignable);
  const shots = assignScreenshots(screenshotSlotDescriptors, variation.seed, [...coldPreferred, ...knowledge.bestScreenshots], {
    batchUsed: uses,
    ratings: screenshotRatings,
  });
  for (const file of shots) {
    if (!file) continue;
    const stem = screenshotStem(file);
    uses.set(stem, (uses.get(stem) ?? 0) + 1);
  }

  db.update(posts)
    .set({
      templateId,
      variation,
      caption: copy.caption,
      tiktokTitle: copy.tiktokTitle,
      hashtags: copy.hashtags,
    })
    .where(eq(posts.id, post.id))
    .run();
  db.delete(slides).where(eq(slides.postId, post.id)).run();

  const outDir = postOutputDir(post.id);
  const slideFiles: string[] = [];
  const shotCursor = { n: 0 };
  let tipNumber = 0;
  for (let i = 0; i < template.slides.length; i++) {
    const spec = template.slides[i]!;
    const line = copy.slides[i] ?? { headline: "", sub: "" };
    const screenshot = pickSlideScreenshot(
      spec,
      shots,
      shotCursor,
      spec.kind === "cta" ? ctaOption.screenshot : undefined,
    );
    if (spec.kind === "tip") tipNumber++;
    const filePath = path.join(outDir, slideFileName(i));
    const isHookSlide = isCoverHeadlineSlide(spec.kind, i);
    const headline = isHookSlide ? hook.text : line.headline;
    const sub = isHookSlide ? "" : line.sub;
    await renderSlide(
      {
        kind: spec.kind,
        headline,
        sub,
        screenshot,
        index: i,
        total: template.slides.length,
        tipNumber: spec.kind === "tip" ? tipNumber : undefined,
      },
      variation,
      filePath,
    );
    db.insert(slides)
      .values({
        postId: post.id,
        idx: i,
        kind: spec.kind,
        headline,
        sub,
        screenshot,
        filePath,
      })
      .run();
    slideFiles.push(filePath);
  }
  await ensurePostShort(post.id, slideFiles, post.status === "queued" || post.status === "approved");
}

/** Swap vague hooks + put an illustration on text-only covers for approved posts. */
export async function refreshApprovedPosts(): Promise<{
  postIds: number[];
  hookSwaps: Array<{ postId: number; from: string; to: string }>;
  coverMoves: Array<{ postId: number; from: string; to: string }>;
}> {
  if (!env.GENERATE_ENABLED) throw new Error(GENERATE_PAUSED_MESSAGE);
  const db = getDb();
  const approved = db.select().from(posts).where(eq(posts.status, "approved")).orderBy(asc(posts.id)).all();
  const needHooks = approved.filter((p) => {
    const hook = db.select().from(hooksTable).where(eq(hooksTable.id, p.hookId)).get();
    return !hook || isLowSignalHook(hook.text);
  }).length;
  const fresh = needHooks > 0 ? await generateHooks(needHooks) : [];
  const hookSwaps: Array<{ postId: number; from: string; to: string }> = [];
  const coverMoves: Array<{ postId: number; from: string; to: string }> = [];
  const usedSvg: string[] = [];
  const batchShotUses = new Map<string, number>();
  const svgPool = illustrationCoverTemplateIds().filter((id) => isLongTemplate(TEMPLATES[id]!));
  const svgIds = svgPool.length ? svgPool : illustrationCoverTemplateIds();

  function nextSvgCover(): string {
    const unused = svgIds.filter((id) => !usedSvg.includes(id));
    const id = (unused[0] ?? svgIds[usedSvg.length % svgIds.length])!;
    usedSvg.push(id);
    return id;
  }

  for (const post of approved) {
    const hook = db.select().from(hooksTable).where(eq(hooksTable.id, post.hookId)).get();
    if (!hook) continue;
    const current = TEMPLATES[post.templateId];
    const alreadyVisual = current ? hasVisualCover(current) : false;
    if (!isLowSignalHook(hook.text) && alreadyVisual) {
      console.log(`Approved #${post.id} already high-signal + visual cover — skip`);
      continue;
    }
    if (isLowSignalHook(hook.text)) {
      const next = fresh.shift();
      if (next) {
        db.update(posts).set({ hookId: next.id }).where(eq(posts.id, post.id)).run();
        db.update(hooksTable).set({ status: "used" }).where(eq(hooksTable.id, next.id)).run();
        hookSwaps.push({ postId: post.id, from: hook.text, to: next.text });
      }
    }
    const keepPhoto = current ? hasPhotoCover(current) : false;
    const nextTemplate = keepPhoto ? post.templateId : nextSvgCover();
    if (nextTemplate !== post.templateId) {
      coverMoves.push({ postId: post.id, from: post.templateId, to: nextTemplate });
    }
    await rebuildPostOnTemplate(post.id, nextTemplate, batchShotUses);
    console.log(`Refreshed approved #${post.id} → ${nextTemplate}`);
  }

  return { postIds: approved.map((p) => p.id), hookSwaps, coverMoves };
}

/** Stretch every in-review short carousel to 6+ slides. Keeps hooks. */
export async function lengthenInReviewPosts(): Promise<{ postIds: number[]; map: Record<number, string> }> {
  for (const rule of HARD_CONSTRAINTS) addRule(rule, 10);
  const db = getDb();
  const inReview = db
    .select()
    .from(posts)
    .where(inArray(posts.status, ["queued", "approved"]))
    .all();
  const batchShotUses = new Map<string, number>();
  const usedLong: string[] = [];
  const postIds: number[] = [];
  const map: Record<number, string> = {};

  for (const post of inReview) {
    const current = TEMPLATES[post.templateId];
    if (current && isLongTemplate(current)) continue;
    const hook = db.select().from(hooksTable).where(eq(hooksTable.id, post.hookId)).get();
    const nextId = pickLongerTemplateId(post.templateId, hook?.text ?? "", usedLong);
    usedLong.push(nextId);
    await rebuildPostOnTemplate(post.id, nextId, batchShotUses);
    postIds.push(post.id);
    map[post.id] = nextId;
    console.log(`Lengthened #${post.id} ${post.templateId}→${nextId} (${TEMPLATES[nextId]?.slides.length ?? 0} slides): ${hook?.text ?? ""}`);
  }

  return { postIds, map };
}

export async function remakeQueuedPosts(): Promise<{ rejectedIds: number[]; generated: GeneratedPost[]; staleCrops: string[] }> {
  if (!env.GENERATE_ENABLED) throw new Error(GENERATE_PAUSED_MESSAGE);
  await syncScreenshotsFromR2().catch(() => 0);
  const ingested = ensureScreenshotMeta();
  if (ingested.wrote) await persistScreenshotMetaToR2().catch(() => undefined);
  for (const rule of HARD_CONSTRAINTS) addRule(rule, 10);
  const keepCrops = listLocalScreenshots().filter((f) => f.startsWith("crop_"));
  for (const file of keepCrops) {
    await uploadBuffer(`${SCREENSHOT_R2_PREFIX}${file}`, fs.readFileSync(screenshotPath(file)), "image/png").catch(() => "");
  }
  const metaPath = path.join(ASSETS_DIR, "meta.json");
  if (fs.existsSync(metaPath)) {
    await uploadBuffer(`${SCREENSHOT_R2_PREFIX}meta.json`, fs.readFileSync(metaPath), "application/json").catch(() => "");
  }
  const staleCrops = await deleteStaleR2Crops(new Set(keepCrops)).catch(() => [] as string[]);
  const db = getDb();
  const queued = db.select().from(posts).where(eq(posts.status, "queued")).all();
  const rejectedIds = queued.map((p) => p.id);
  for (const id of rejectedIds) {
    db.update(posts).set({ status: "rejected" }).where(eq(posts.id, id)).run();
  }
  const generated = rejectedIds.length ? await generateBatch(rejectedIds.length) : [];
  return { rejectedIds, generated, staleCrops };
}

/** Assign a spread of screenshot sizes to in-review posts, then persist. */
export function assignInReviewShotScales(): number[] {
  const db = getDb();
  const rows = db
    .select()
    .from(posts)
    .where(inArray(posts.status, ["queued", "approved"]))
    .all();
  const batch = new Map(shippedShotScaleUsage());
  const weights = ratingsMap("shot_scale");
  for (const p of rows) {
    const v = parseVariation(p.variation);
    const scale = pickShotScale({ shipped: batch, weights });
    batch.set(scale, (batch.get(scale) ?? 0) + 1);
    db.update(posts)
      .set({ variation: { ...v, shotScale: scale } })
      .where(eq(posts.id, p.id))
      .run();
  }
  return rows.map((p) => p.id);
}

export async function rerenderInReviewPosts(): Promise<number[]> {
  const db = getDb();
  const rows = db
    .select({ id: posts.id })
    .from(posts)
    .where(inArray(posts.status, ["queued", "approved"]))
    .all();
  for (const p of rows) await rerenderPost(p.id);
  return rows.map((p) => p.id);
}

export async function rerenderQueuedPosts(): Promise<number[]> {
  for (const rule of HARD_CONSTRAINTS) addRule(rule, 10);
  const db = getDb();
  const queued = db.select().from(posts).where(eq(posts.status, "queued")).all();
  for (const p of queued) await rerenderPost(p.id);
  return queued.map((p) => p.id);
}

export async function rerenderAllPosts(): Promise<number> {
  await syncScreenshotsFromR2().catch(() => 0);
  const db = getDb();
  const all = db.select({ id: posts.id }).from(posts).all();
  for (const p of all) await rerenderPost(p.id);
  return all.length;
}

export { BRAND };
