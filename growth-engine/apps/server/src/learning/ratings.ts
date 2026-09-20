/**
 * 0–100 ratings for templates, hook formulas, hook categories, screenshots.
 *
 * One post never crowns or kills anything. A strong outlier moves the
 * score a few points; a mid-pack post barely moves it. Floor/ceiling
 * stay away from 0 and 100 so a cold streak can't cripple an asset
 * and a lucky viral hit can't lock it in.
 */

import { getDb, assetRatings, slides, hooks } from "@remedy-growth/db";
import { and, desc, eq } from "drizzle-orm";
import { svgIdsForSlides } from "../generation/illustrations.js";
import { screenshotStem } from "../generation/screenshots.js";
import { type ScoredPost } from "./normalize.js";

export type RatingDimension = "template" | "formula" | "hook_category" | "screenshot" | "svg" | "youtube_music" | "shot_scale";

/** Max points one post can add or subtract. */
const MAX_STEP = 6;
const FLOOR = 12;
const CEIL = 88;
export const RATING_START = 50;

export interface RatingRow {
  dimension: RatingDimension;
  key: string;
  score: number;
  samples: number;
  updatedAt: string;
}

function percentileRank(value: number, values: number[]): number {
  if (values.length === 0) return 0.5;
  const below = values.filter((v) => v < value).length;
  const equal = values.filter((v) => v === value).length;
  return (below + equal * 0.5) / values.length;
}

/**
 * Continuous signal in [-1, 1]. 0 = typical for the era. Shrinks toward 0
 * when the cohort is small or the post has almost no views (luck dominates).
 */
export function performanceSignal(post: ScoredPost, cohort: ScoredPost[]): number {
  if (cohort.length < 2) return 0;
  const reachRank = percentileRank(post.reach, cohort.map((p) => p.reach));
  const engRank = percentileRank(post.engagementRate, cohort.map((p) => p.engagementRate));
  const raw = (reachRank - 0.5) * 2 * 0.65 + (engRank - 0.5) * 2 * 0.35;
  const cohortShrink = Math.min(1, cohort.length / 12);
  const viewShrink = Math.min(1, Math.log10(post.views + 1) / 2.5);
  return Math.max(-1, Math.min(1, raw * cohortShrink * viewShrink));
}

export function getRating(dimension: RatingDimension, key: string): RatingRow {
  const db = getDb();
  const row = db
    .select()
    .from(assetRatings)
    .where(and(eq(assetRatings.dimension, dimension), eq(assetRatings.key, key)))
    .get();
  if (row) {
    return {
      dimension: row.dimension as RatingDimension,
      key: row.key,
      score: row.score,
      samples: row.samples,
      updatedAt: row.updatedAt,
    };
  }
  return { dimension, key, score: RATING_START, samples: 0, updatedAt: "" };
}

/** Weight for pickers: 50 → 1, 12 → 0.24, 88 → 1.76. Never zero. */
export function ratingWeight(score: number): number {
  return Math.max(0.2, score / 50);
}

function applyNudge(dimension: RatingDimension, key: string, signal: number): void {
  const db = getDb();
  const current = getRating(dimension, key);
  const next = Math.max(FLOOR, Math.min(CEIL, current.score + signal * MAX_STEP));
  const samples = current.samples + 1;
  const updatedAt = new Date().toISOString();
  if (current.samples === 0 && current.updatedAt === "") {
    db.insert(assetRatings).values({ dimension, key, score: next, samples, updatedAt }).run();
  } else {
    db.update(assetRatings)
      .set({ score: next, samples, updatedAt })
      .where(and(eq(assetRatings.dimension, dimension), eq(assetRatings.key, key)))
      .run();
  }
}

/** Nudge every attribute on a mature post. One post = a few points, both ways. */
export function nudgeAssetsFromPost(
  post: ScoredPost,
  cohort: ScoredPost[],
  variationSeed: number | null,
  storedIllustrationIds?: string[],
): void {
  const signal = performanceSignal(post, cohort);
  if (Math.abs(signal) < 0.02) return;
  const db = getDb();
  applyNudge("template", post.templateId, signal);
  const hook = db.select().from(hooks).where(eq(hooks.id, post.hookId)).get();
  if (hook) {
    applyNudge("hook_category", hook.category, signal);
    if (hook.formulaId) applyNudge("formula", String(hook.formulaId), signal);
  }
  const slideRows = db.select().from(slides).where(eq(slides.postId, post.postId)).all();
  const seenShots = new Set<string>();
  for (const s of slideRows) {
    if (s.screenshot) {
      const stem = screenshotStem(s.screenshot);
      if (seenShots.has(stem)) continue;
      seenShots.add(stem);
      applyNudge("screenshot", stem, signal);
    }
  }
  for (const id of svgIdsForSlides(variationSeed, storedIllustrationIds, slideRows)) {
    applyNudge("svg", id, signal);
  }
}

/** YouTube-only nudge. Music is never scored from TikTok/IG/FB. */
export function nudgeYoutubeMusic(post: ScoredPost, youtubeCohort: ScoredPost[], bedId: string | null | undefined): void {
  if (!bedId) return;
  const signal = performanceSignal(post, youtubeCohort);
  if (Math.abs(signal) < 0.02) return;
  applyNudge("youtube_music", bedId, signal);
}

/** Screenshot size is scored from all platforms — same slides ship everywhere. */
export function nudgeShotScale(post: ScoredPost, cohort: ScoredPost[], scale: string | null | undefined): void {
  if (!scale) return;
  const signal = performanceSignal(post, cohort);
  if (Math.abs(signal) < 0.02) return;
  applyNudge("shot_scale", scale, signal);
}

export function allRatings(): RatingRow[] {
  const db = getDb();
  return db
    .select()
    .from(assetRatings)
    .orderBy(desc(assetRatings.score))
    .all()
    .map((r) => ({
      dimension: r.dimension as RatingDimension,
      key: r.key,
      score: r.score,
      samples: r.samples,
      updatedAt: r.updatedAt,
    }));
}

export function ratingsMap(dimension: RatingDimension): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of allRatings().filter((x) => x.dimension === dimension)) {
    out[r.key] = r.score;
  }
  return out;
}
