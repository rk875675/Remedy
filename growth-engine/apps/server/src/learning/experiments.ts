/**
 * A/B testing framework.
 *
 * createVariant(): given a post, generate a second post that differs in
 * exactly ONE dimension (hook, template, asset, or visual). The pair is
 * linked in the experiments table and scheduled 24-48h apart.
 *
 * concludeExperiments(): once both posts are published and measured, compare
 * performance, record the winner + lift, and emit a structured signal so the
 * result feeds straight back into generation.
 */

import path from "node:path";
import { z } from "zod";
import {
  getDb,
  posts,
  slides,
  hooks,
  analytics,
  experiments,
  type SignalDimension,
} from "@remedy-growth/db";
import { asc, desc, eq, inArray, or } from "drizzle-orm";
import { BRAND, configuredPlatforms, env, GENERATE_PAUSED_MESSAGE } from "../config.js";
import { generateJson } from "../generation/llm.js";
import { generateCarouselCopy } from "../generation/hooks.js";
import { TEMPLATES, isCoverHeadlineSlide, type SlideKind } from "../generation/templates.js";
import { makeVariation, parseVariation, pickShotScale, VariationSchema, type Variation } from "../generation/variations.js";
import { renderSlide, postOutputDir, slideFileName } from "../generation/composer.js";
import { assignScreenshots, ensurePostShort } from "../generation/index.js";
import { illustrationIdsForTemplate } from "../generation/illustrations.js";
import { pickShortBed, listBeds } from "../generation/short.js";
import { shippedBedUsage, shippedShotScaleUsage } from "../generation/diversity.js";
import { ratingsMap } from "./ratings.js";
import { addSignal } from "./classify.js";
import { experimentTieThreshold, isMature, reachScore } from "./normalize.js";

/** Dimensions a variant can be generated for. */
export const TESTABLE_DIMENSIONS = ["hook", "template", "asset", "visual", "music", "shot_scale"] as const;
export type TestableDimension = (typeof TESTABLE_DIMENSIONS)[number];

const HookVariantSchema = z
  .object({ hook: z.string().min(3).max(90) })
  .strict();

function pickDifferent<T>(options: readonly T[], current: T): T {
  const others = options.filter((o) => o !== current);
  if (others.length === 0) return current;
  return others[Math.floor(Math.random() * others.length)]!;
}

/** The least-tested testable dimension (fewest experiments so far). */
export function leastTestedDimension(): TestableDimension {
  const db = getDb();
  const rows = db.select({ dimension: experiments.dimension }).from(experiments).all();
  const counts = new Map<string, number>(TESTABLE_DIMENSIONS.map((d) => [d, 0]));
  for (const r of rows) counts.set(r.dimension, (counts.get(r.dimension) ?? 0) + 1);
  let best: TestableDimension = TESTABLE_DIMENSIONS[0];
  let min = Infinity;
  for (const d of TESTABLE_DIMENSIONS) {
    const n = counts.get(d) ?? 0;
    if (n < min) {
      min = n;
      best = d;
    }
  }
  return best;
}

async function generateHookVariant(originalHook: string): Promise<string> {
  const prompt = `This TikTok carousel hook for ${BRAND.appName} (a ${BRAND.niche} app) is being A/B tested:
"${originalHook}"

Write ONE alternative hook that keeps the same core promise but changes the angle,
framing, or emotional register. 1–2 on-screen lines (about 5–14 words).
Keep the avatar or back-pain noun. No vague "this" / save / slide-N lines.
Fragments are good. No emojis, no brand name. It must feel like a different hook, not a paraphrase.
Return JSON: {"hook":"..."}`;
  const result = await generateJson(prompt, HookVariantSchema);
  if (result) return result.hook;
  // Offline fallback mutation.
  if (originalHook.endsWith("?")) return originalHook.replace(/\?$/, ". Here's the fix.");
  return `POV: ${originalHook.charAt(0).toLowerCase()}${originalHook.slice(1).replace(/[.?!]$/, "")}`;
}

interface SlideLine {
  kind: SlideKind;
  headline: string;
  sub: string;
  screenshot: string | null;
}

/** Render + persist all slides for a variant post. */
async function renderVariantSlides(postId: number, lines: SlideLine[], variation: Variation): Promise<void> {
  const db = getDb();
  const outDir = postOutputDir(postId);
  let tipNumber = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.kind === "tip") tipNumber++;
    const filePath = path.join(outDir, slideFileName(i));
    await renderSlide(
      {
        kind: line.kind,
        headline: line.headline,
        sub: line.sub,
        screenshot: line.screenshot,
        index: i,
        total: lines.length,
        tipNumber: line.kind === "tip" ? tipNumber : undefined,
      },
      variation,
      filePath,
    );
    db.insert(slides)
      .values({
        postId,
        idx: i,
        kind: line.kind,
        headline: line.headline,
        sub: line.sub,
        screenshot: line.screenshot,
        filePath,
      })
      .run();
  }
}

/** Music A/B reuses the same JPEG files — only the YouTube bed changes. */
function copyVariantSlides(postId: number, source: Array<{ idx: number; kind: string; headline: string; sub: string; screenshot: string | null; filePath: string }>): void {
  const db = getDb();
  for (const s of source) {
    db.insert(slides)
      .values({
        postId,
        idx: s.idx,
        kind: s.kind as SlideKind,
        headline: s.headline,
        sub: s.sub,
        screenshot: s.screenshot,
        filePath: s.filePath,
      })
      .run();
  }
}

export interface CreateVariantResult {
  ok: boolean;
  error?: string;
  experimentId?: number;
  variantPostId?: number;
  dimension?: TestableDimension;
  detail?: { a: string; b: string };
}

/**
 * Create the B-side of an A/B experiment from an existing post.
 * The variant enters the review queue and must be approved like any post.
 */
export async function createVariant(postId: number, dimensionArg?: TestableDimension): Promise<CreateVariantResult> {
  if (!env.GENERATE_ENABLED) return { ok: false, error: GENERATE_PAUSED_MESSAGE };
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) return { ok: false, error: `Post ${postId} not found` };
  if (!["queued", "approved"].includes(post.status)) {
    return { ok: false, error: `Post ${postId} is ${post.status} — variants need a queued or approved post` };
  }
  const existing = db
    .select()
    .from(experiments)
    .where(or(eq(experiments.postAId, postId), eq(experiments.postBId, postId)))
    .all()
    .find((e) => e.status !== "cancelled");
  if (existing) return { ok: false, error: `Post ${postId} is already part of experiment #${existing.id}` };

  const hook = db.select().from(hooks).where(eq(hooks.id, post.hookId)).get();
  if (!hook) return { ok: false, error: "Hook not found for post" };
  const template = TEMPLATES[post.templateId];
  if (!template) return { ok: false, error: `Unknown template ${post.templateId}` };
  const slideRows = db.select().from(slides).where(eq(slides.postId, postId)).orderBy(asc(slides.idx)).all();
  const baseVariation = parseVariation(post.variation, Boolean(template.preferMusic));

  const dimension = dimensionArg ?? leastTestedDimension();

  let variantHookId = post.hookId;
  let variantTemplateId = post.templateId;
  let variantVariation: Variation = baseVariation;
  let variantCaption = post.caption;
  let variantTitle = post.tiktokTitle;
  let variantHashtags = post.hashtags;
  let lines: SlideLine[];
  let detail: { a: string; b: string; note?: string };

  if (dimension === "hook") {
    const newHookText = await generateHookVariant(hook.text);
    const newHook = db
      .insert(hooks)
      .values({ text: newHookText, category: hook.category, formulaId: hook.formulaId, source: "evolved", parentHookId: hook.id, status: "used" })
      .returning()
      .get();
    if (!newHook) return { ok: false, error: "Could not insert variant hook" };
    variantHookId = newHook.id;
    const copy = await generateCarouselCopy(newHookText, template, hook.category);
    variantCaption = copy.caption;
    variantTitle = copy.tiktokTitle;
    variantHashtags = copy.hashtags;
    // Same template, same variation, same screenshots — only the words change.
    lines = template.slides.map((spec, i) => {
      const isHookSlide = isCoverHeadlineSlide(spec.kind, i);
      return {
        kind: spec.kind,
        headline: isHookSlide ? newHookText : (copy.slides[i]?.headline ?? slideRows[i]?.headline ?? ""),
        sub: isHookSlide ? "" : (copy.slides[i]?.sub ?? slideRows[i]?.sub ?? ""),
        screenshot: slideRows[i]?.screenshot ?? null,
      };
    });
    detail = { a: hook.text, b: newHookText };
  } else if (dimension === "template") {
    const otherIds = Object.keys(TEMPLATES).filter((id) => id !== post.templateId);
    variantTemplateId = otherIds[Math.floor(Math.random() * otherIds.length)] ?? post.templateId;
    const newTemplate = TEMPLATES[variantTemplateId]!;
    variantVariation = makeVariation({
      seed: baseVariation.seed,
      hasScreenshots: newTemplate.slides.some((s) => s.usesScreenshot),
      preferMusic: Boolean(newTemplate.preferMusic),
    });
    const copy = await generateCarouselCopy(hook.text, newTemplate, hook.category);
    variantCaption = copy.caption;
    variantTitle = copy.tiktokTitle;
    variantHashtags = copy.hashtags;
    const slotDescriptors = newTemplate.slides
      .map((s, i) => ({ idx: i, usesScreenshot: s.usesScreenshot, headline: copy.slides[i]?.headline ?? "", sub: copy.slides[i]?.sub ?? "" }))
      .filter((s) => s.usesScreenshot);
    const shots = assignScreenshots(slotDescriptors, variantVariation.seed, []);
    let shotIdx = 0;
    lines = newTemplate.slides.map((spec, i) => {
      const isHookSlide = isCoverHeadlineSlide(spec.kind, i);
      return {
        kind: spec.kind,
        headline: isHookSlide ? hook.text : (copy.slides[i]?.headline ?? ""),
        sub: isHookSlide ? "" : (copy.slides[i]?.sub ?? ""),
        screenshot: spec.usesScreenshot ? (shots[shotIdx++] ?? null) : null,
      };
    });
    detail = { a: post.templateId, b: variantTemplateId };
  } else if (dimension === "asset") {
    // Same copy, different screenshots: exclude A's picks so the swap is real.
    const usedShots = slideRows.map((s) => s.screenshot).filter((s): s is string => Boolean(s));
    if (usedShots.length === 0) {
      return { ok: false, error: "Post has no screenshots — pick another dimension for this experiment" };
    }
    const slotDescriptors = slideRows
      .filter((s) => s.screenshot !== null)
      .map((s) => ({ idx: s.idx, headline: s.headline, sub: s.sub }));
    const freshSeed = Math.floor(Math.random() * 2 ** 31);
    const shots = assignScreenshots(slotDescriptors, freshSeed, [], usedShots);
    if (shots.every((s, i) => s === usedShots[i]) || shots.every((s) => !s)) {
      return { ok: false, error: "No alternative screenshots available for an asset experiment" };
    }
    let shotIdx = 0;
    lines = slideRows.map((s) => ({
      kind: s.kind as SlideKind,
      headline: s.headline,
      sub: s.sub,
      screenshot: s.screenshot ? (shots[shotIdx++] ?? s.screenshot) : null,
    }));
    detail = { a: usedShots.join(", "), b: shots.filter(Boolean).join(", ") };
  } else if (dimension === "music") {
    if (listBeds().length < 2) {
      return { ok: false, error: "Need at least 2 YouTube beds to run a music experiment" };
    }
    const bedA = baseVariation.shortBed ?? pickShortBed({ shipped: shippedBedUsage(), weights: ratingsMap("youtube_music") }).id;
    if (!baseVariation.shortBed) {
      db.update(posts)
        .set({ variation: { ...baseVariation, shortBed: bedA } })
        .where(eq(posts.id, postId))
        .run();
    }
    const bedB = pickShortBed({
      exclude: [bedA],
      shipped: shippedBedUsage(),
      weights: ratingsMap("youtube_music"),
    });
    variantVariation = { ...baseVariation, shortBed: bedB.id };
    lines = slideRows.map((s) => ({
      kind: s.kind as SlideKind,
      headline: s.headline,
      sub: s.sub,
      screenshot: s.screenshot,
    }));
    detail = { a: bedA, b: bedB.id, note: "YouTube soundtrack only — same slides" };
  } else if (dimension === "shot_scale") {
    const hasShot = slideRows.some((s) => s.screenshot);
    if (!hasShot) {
      return { ok: false, error: "Post has no screenshots — pick another dimension for this experiment" };
    }
    const scaleA = baseVariation.shotScale ?? "contained";
    const scaleB = pickShotScale({
      exclude: [scaleA],
      shipped: shippedShotScaleUsage(),
      weights: ratingsMap("shot_scale"),
    });
    variantVariation = { ...baseVariation, shotScale: scaleB };
    lines = slideRows.map((s) => ({
      kind: s.kind as SlideKind,
      headline: s.headline,
      sub: s.sub,
      screenshot: s.screenshot,
    }));
    detail = { a: scaleA, b: scaleB, note: "Screenshot size only — same crops and copy" };
  } else {
    // visual: keep the seed (same illustrations) but restyle everything else.
    const bgOptions = VariationSchema.shape.background.options.filter((b) => !b.startsWith("split_"));
    variantVariation = {
      ...baseVariation,
      background: pickDifferent(bgOptions, baseVariation.background),
      textStyle: pickDifferent(VariationSchema.shape.textStyle.options, baseVariation.textStyle),
      frame: pickDifferent(VariationSchema.shape.frame.options, baseVariation.frame),
      layout: pickDifferent(VariationSchema.shape.layout.options, baseVariation.layout),
      accentBar: !baseVariation.accentBar,
    };
    lines = slideRows.map((s) => ({
      kind: s.kind as SlideKind,
      headline: s.headline,
      sub: s.sub,
      screenshot: s.screenshot,
    }));
    detail = {
      a: `${baseVariation.background}/${baseVariation.textStyle}/${baseVariation.frame}/${baseVariation.layout}`,
      b: `${variantVariation.background}/${variantVariation.textStyle}/${variantVariation.frame}/${variantVariation.layout}`,
    };
  }

  const variantTemplate = TEMPLATES[variantTemplateId];
  if (variantTemplate) {
    const sameTemplate = variantTemplateId === post.templateId && (baseVariation.illustrationIds?.length ?? 0) === variantTemplate.slides.length;
    variantVariation = {
      ...variantVariation,
      illustrationIds: sameTemplate && baseVariation.illustrationIds
        ? baseVariation.illustrationIds
        : illustrationIdsForTemplate(
            variantVariation.seed,
            variantTemplate.slides.length,
            (i) => variantTemplate.slides[i]?.kind,
          ),
    };
  }

  const variantPost = db
    .insert(posts)
    .values({
      hookId: variantHookId,
      templateId: variantTemplateId,
      variation: variantVariation,
      caption: variantCaption,
      tiktokTitle: variantTitle,
      hashtags: variantHashtags,
      platforms: (post.platforms as string[] | null) ?? configuredPlatforms(),
      status: "queued",
      confidence: post.confidence,
    })
    .returning()
    .get();
  if (!variantPost) return { ok: false, error: "Could not insert variant post" };

  if (dimension === "music") {
    copyVariantSlides(variantPost.id, slideRows);
    await ensurePostShort(
      variantPost.id,
      slideRows.map((s) => s.filePath),
      true,
    );
  } else {
    await renderVariantSlides(variantPost.id, lines, variantVariation);
  }

  const experiment = db
    .insert(experiments)
    .values({
      postAId: post.id,
      postBId: variantPost.id,
      dimension: dimension as SignalDimension,
      variableDetail: detail,
      status: "pending",
    })
    .returning()
    .get();

  console.log(`Experiment #${experiment?.id}: post #${post.id} vs #${variantPost.id} on ${dimension} (${detail.a} -> ${detail.b})`);
  return {
    ok: true,
    experimentId: experiment?.id,
    variantPostId: variantPost.id,
    dimension,
    detail: { a: detail.a, b: detail.b },
  };
}

interface PostScore {
  views: number;
  engagement: number;
  engagementRate: number;
  followers: number;
  reach: number;
  composite: number;
  publishedAt: string | null;
}

function scorePost(postId: number, platform?: string): PostScore | null {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  const rows = db
    .select()
    .from(analytics)
    .where(eq(analytics.postId, postId))
    .orderBy(desc(analytics.fetchedAt))
    .all();
  if (rows.length === 0) return null;
  const latestByPlatform = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (platform && r.platform !== platform) continue;
    if (!latestByPlatform.has(r.platform)) latestByPlatform.set(r.platform, r);
  }
  if (latestByPlatform.size === 0) return null;
  let views = 0;
  let engagement = 0;
  let snapFollowers = 0;
  for (const r of latestByPlatform.values()) {
    views += r.views;
    engagement += r.likes + r.comments + r.shares + r.saves;
    if (r.platform === "tiktok" && r.followers > 0) snapFollowers = r.followers;
    else if (snapFollowers === 0) snapFollowers = r.followers;
  }
  const followers = (post?.followersAtPublish ?? 0) > 0 ? post!.followersAtPublish : snapFollowers;
  const engagementRate = views > 0 ? engagement / views : 0;
  const reach = reachScore(views, followers);
  return {
    views,
    engagement,
    engagementRate,
    followers,
    reach,
    composite: reach * (1 + engagementRate * 10),
    publishedAt: post?.publishedAt ?? null,
  };
}

export interface ConcludeResult {
  concluded: number;
  activated: number;
}

/**
 * Advance experiment lifecycles:
 * - pending -> active when both posts are published
 * - active -> concluded when both posts have analytics; winner + lift recorded,
 *   and the result becomes a structured signal.
 */
export function concludeExperiments(): ConcludeResult {
  const db = getDb();
  const open = db
    .select()
    .from(experiments)
    .where(inArray(experiments.status, ["pending", "active"]))
    .all();

  let concluded = 0;
  let activated = 0;

  for (const exp of open) {
    const postA = db.select().from(posts).where(eq(posts.id, exp.postAId)).get();
    const postB = db.select().from(posts).where(eq(posts.id, exp.postBId)).get();
    if (!postA || !postB) continue;

    // Cancel the experiment when either side got rejected.
    if (postA.status === "rejected" || postB.status === "rejected") {
      db.update(experiments).set({ status: "cancelled" }).where(eq(experiments.id, exp.id)).run();
      continue;
    }

    if (exp.status === "pending" && postA.status === "published" && postB.status === "published") {
      db.update(experiments).set({ status: "active" }).where(eq(experiments.id, exp.id)).run();
      activated++;
    }
    if (postA.status !== "published" || postB.status !== "published") continue;
    if (!isMature(postA.publishedAt) || !isMature(postB.publishedAt)) continue;

    const platform = exp.dimension === "music" ? "youtube" : undefined;
    const scoreA = scorePost(exp.postAId, platform);
    const scoreB = scorePost(exp.postBId, platform);
    if (!scoreA || !scoreB) continue;

    const detail = exp.variableDetail as { a: string; b: string };
    let winner: "a" | "b" | "tie";
    let liftPct = 0;
    const hi = Math.max(scoreA.composite, scoreB.composite);
    const lo = Math.min(scoreA.composite, scoreB.composite);
    const tieBar = experimentTieThreshold(scoreA.views, scoreB.views);
    if (lo === 0 && hi === 0) {
      winner = "tie";
    } else if ((hi - lo) / Math.max(lo, 1e-9) < tieBar) {
      winner = "tie";
    } else {
      winner = scoreA.composite > scoreB.composite ? "a" : "b";
      liftPct = Math.round(((hi - lo) / Math.max(lo, 1e-9)) * 1000) / 10;
    }

    db.update(experiments)
      .set({
        status: "concluded",
        winner,
        liftPct: winner === "tie" ? 0 : liftPct,
        resultData: { a: scoreA, b: scoreB },
        concludedAt: new Date().toISOString(),
      })
      .where(eq(experiments.id, exp.id))
      .run();
    concluded++;

    const dimension = exp.dimension as SignalDimension;
    const smallN = Math.min(scoreA.views, scoreB.views) < 50;
    if (winner === "tie") {
      addSignal({
        dimension,
        category: `experiment_${dimension}`,
        source: "experiment",
        direction: "prefer",
        content: `A/B tie on ${dimension}: "${detail.a}" vs "${detail.b}" — not enough gap after follower-normalizing. Keep both in rotation.`,
        data: { experimentId: exp.id, a: scoreA, b: scoreB },
        score: 0.5,
      });
    } else {
      const winVal = winner === "a" ? detail.a : detail.b;
      const loseVal = winner === "a" ? detail.b : detail.a;
      addSignal({
        dimension,
        category: `experiment_${dimension}`,
        source: "experiment",
        direction: "prefer",
        content: smallN
          ? `A/B lean (${dimension}): "${winVal}" beat "${loseVal}" by ${liftPct}% on a tiny sample — note it, don't treat it as a rule yet.`
          : `A/B result (${dimension}): "${winVal}" beat "${loseVal}" by ${liftPct}% on follower-normalized reach. Prefer this style; still retest.`,
        data: { experimentId: exp.id, winner, liftPct, a: scoreA, b: scoreB, smallN },
        score: smallN ? 0.75 : Math.min(4, 1 + liftPct / 50),
        postId: winner === "a" ? exp.postAId : exp.postBId,
      });
    }
    console.log(`Experiment #${exp.id} concluded: ${winner} (${liftPct}% lift) on ${dimension}.`);
  }

  return { concluded, activated };
}

/** The partner post id if this post is part of an open experiment. */
export function experimentPartner(postId: number): { experimentId: number; partnerId: number; dimension: string } | null {
  const db = getDb();
  const exp = db
    .select()
    .from(experiments)
    .where(or(eq(experiments.postAId, postId), eq(experiments.postBId, postId)))
    .all()
    .find((e) => e.status === "pending" || e.status === "active");
  if (!exp) return null;
  return {
    experimentId: exp.id,
    partnerId: exp.postAId === postId ? exp.postBId : exp.postAId,
    dimension: exp.dimension,
  };
}

/** Experiments with post context for the dashboard. */
export function listExperiments(limit = 50) {
  const db = getDb();
  const rows = db.select().from(experiments).orderBy(desc(experiments.createdAt)).limit(limit).all();
  return rows.map((exp) => {
    const postA = db.select().from(posts).where(eq(posts.id, exp.postAId)).get();
    const postB = db.select().from(posts).where(eq(posts.id, exp.postBId)).get();
    const hookA = postA ? db.select().from(hooks).where(eq(hooks.id, postA.hookId)).get() : null;
    const hookB = postB ? db.select().from(hooks).where(eq(hooks.id, postB.hookId)).get() : null;
    return {
      ...exp,
      postAStatus: postA?.status ?? "missing",
      postBStatus: postB?.status ?? "missing",
      hookAText: hookA?.text ?? "",
      hookBText: hookB?.text ?? "",
    };
  });
}
