/**
 * Diversity engine — tracks which assets (screenshots, SVGs, templates, hook
 * formulas) have actually been tested in the wild, surfaces "cold" ones that
 * never shipped, and nudges generation to activate them.
 *
 * SVG usage is re-derived deterministically from each post's variation seed
 * (the composer picks illustrations from the seed, so the same math re-runs
 * here). Cold-SVG activation happens at seed-selection time in generateBatch
 * so pickIllustration itself stays deterministic and rerenders don't mutate
 * old posts.
 */

import { getDb, posts, slides, hooks, hookFormulas, analytics } from "@remedy-growth/db";
import { desc, eq, inArray } from "drizzle-orm";
import { listCanonicalScreenshots, screenshotStem } from "./screenshots.js";
import { enabledSvgIllustrations, getIllustration, illustrationForSlide, isOwnedIllustration, pickIllustration } from "./illustrations.js";
import { TEMPLATES, type CarouselTemplate } from "./templates.js";
import { makeVariation, parseVariation, SHOT_SCALES, shotScaleLabel } from "./variations.js";
import { listBeds } from "./short.js";

/** Post statuses that count as "shipped" for usage/testing purposes. */
const SHIPPED_STATUSES = ["published", "draft_sent"] as const;

export interface AssetStat {
  name: string;
  /** Uses across all posts (any status). */
  totalUses: number;
  /** Uses in shipped posts (published or sent to drafts). */
  publishedUses: number;
  /** Total views across shipped posts this asset appeared in. */
  views: number;
  /** Follower-normalized reach (views / followers-at-publish). Use this to rank, not raw views. */
  reach: number;
  cold: boolean;
}

export interface AssetCoverage {
  screenshots: AssetStat[];
  svgs: AssetStat[];
  templates: AssetStat[];
  formulas: Array<AssetStat & { id: number; category: string }>;
  music: AssetStat[];
  shotScales: AssetStat[];
}

function latestViewsFromMap(byPost: Map<number, Map<string, number>>, postId: number, platform?: string): number {
  const byPlatform = byPost.get(postId);
  if (!byPlatform) return 0;
  if (platform) return byPlatform.get(platform) ?? 0;
  let total = 0;
  for (const v of byPlatform.values()) total += v;
  return total;
}

function loadLatestViews(): Map<number, Map<string, number>> {
  const rows = getDb()
    .select({
      postId: analytics.postId,
      platform: analytics.platform,
      views: analytics.views,
      fetchedAt: analytics.fetchedAt,
    })
    .from(analytics)
    .orderBy(desc(analytics.fetchedAt))
    .all();
  const out = new Map<number, Map<string, number>>();
  for (const r of rows) {
    const byPlatform = out.get(r.postId) ?? new Map<string, number>();
    if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, r.views);
    out.set(r.postId, byPlatform);
  }
  return out;
}

interface UsageAcc {
  total: number;
  published: number;
  views: number;
  reach: number;
}

function bump(map: Map<string, UsageAcc>, key: string, shipped: boolean, views: number, reach: number): void {
  const acc = map.get(key) ?? { total: 0, published: 0, views: 0, reach: 0 };
  acc.total++;
  if (shipped) {
    acc.published++;
    acc.views += views;
    acc.reach += reach;
  }
  map.set(key, acc);
}

let usageCache: { at: number; value: AssetCoverage } | null = null;
const USAGE_TTL_MS = 20_000;

export function invalidateAssetUsage(): void {
  usageCache = null;
}

/** Full utilization report across all asset types. Cached so generate doesn't rescan the DB per post. */
export function getAssetUsage(): AssetCoverage {
  if (usageCache && Date.now() - usageCache.at < USAGE_TTL_MS) return usageCache.value;
  const value = computeAssetUsage();
  usageCache = { at: Date.now(), value };
  return value;
}

function computeAssetUsage(): AssetCoverage {
  const db = getDb();
  const allPosts = db.select({
    id: posts.id,
    status: posts.status,
    templateId: posts.templateId,
    hookId: posts.hookId,
    variation: posts.variation,
    followersAtPublish: posts.followersAtPublish,
  }).from(posts).all();
  const shippedIds = new Set(allPosts.filter((p) => (SHIPPED_STATUSES as readonly string[]).includes(p.status)).map((p) => p.id));
  const latestByPost = loadLatestViews();
  const viewsByPost = new Map<number, number>();
  const reachByPost = new Map<number, number>();
  for (const post of allPosts) {
    if (!shippedIds.has(post.id)) continue;
    const views = latestViewsFromMap(latestByPost, post.id);
    viewsByPost.set(post.id, views);
    reachByPost.set(post.id, post.followersAtPublish > 0 ? views / post.followersAtPublish : views);
  }

  const screenshotUsage = new Map<string, UsageAcc>();
  const svgUsage = new Map<string, UsageAcc>();
  const templateUsage = new Map<string, UsageAcc>();
  const formulaUsage = new Map<string, UsageAcc>();

  const allSlides = db.select().from(slides).all();
  const slidesByPost = new Map<number, typeof allSlides>();
  for (const s of allSlides) {
    const list = slidesByPost.get(s.postId) ?? [];
    list.push(s);
    slidesByPost.set(s.postId, list);
  }

  const hookById = new Map(db.select().from(hooks).all().map((h) => [h.id, h]));

  for (const post of allPosts) {
    const shipped = shippedIds.has(post.id);
    const views = viewsByPost.get(post.id) ?? 0;
    const reach = reachByPost.get(post.id) ?? 0;

    bump(templateUsage, post.templateId, shipped, views, reach);

    const hook = hookById.get(post.hookId);
    if (hook?.formulaId) bump(formulaUsage, String(hook.formulaId), shipped, views, reach);

    const postSlides = slidesByPost.get(post.id) ?? [];
    const variation = post.variation as { seed?: number; illustrationIds?: string[] } | null;
    const seed = variation?.seed;
    for (const s of postSlides) {
      if (s.screenshot) bump(screenshotUsage, screenshotStem(s.screenshot), shipped, views, reach);
      if ((s.kind === "illustration" || s.kind === "photo_person") && typeof seed === "number") {
        try {
          const asset = illustrationForSlide(seed, s.idx, variation?.illustrationIds, s.kind);
          bump(svgUsage, asset.id, shipped, views, reach);
        } catch {
          // no enabled illustrations — skip
        }
      }
    }
  }

  const screenshotStats: AssetStat[] = listCanonicalScreenshots().map((file) => {
    const acc = screenshotUsage.get(screenshotStem(file)) ?? { total: 0, published: 0, views: 0, reach: 0 };
    return { name: file, totalUses: acc.total, publishedUses: acc.published, views: acc.views, reach: acc.reach, cold: acc.published === 0 };
  });

  const svgStats: AssetStat[] = enabledSvgIllustrations().map((asset) => {
    const acc = svgUsage.get(asset.id) ?? { total: 0, published: 0, views: 0, reach: 0 };
    return { name: asset.id, totalUses: acc.total, publishedUses: acc.published, views: acc.views, reach: acc.reach, cold: acc.published === 0 };
  });

  const templateStats: AssetStat[] = Object.keys(TEMPLATES).map((id) => {
    const acc = templateUsage.get(id) ?? { total: 0, published: 0, views: 0, reach: 0 };
    return { name: id, totalUses: acc.total, publishedUses: acc.published, views: acc.views, reach: acc.reach, cold: acc.published === 0 };
  });

  const formulaStats = getDb()
    .select()
    .from(hookFormulas)
    .all()
    .map((f) => {
      const acc = formulaUsage.get(String(f.id)) ?? { total: 0, published: 0, views: 0, reach: 0 };
      return {
        id: f.id,
        name: f.name,
        category: f.category,
        totalUses: acc.total,
        publishedUses: acc.published,
        views: acc.views,
        reach: acc.reach,
        cold: acc.published === 0,
      };
    });

  const musicUsage = new Map<string, UsageAcc>();
  for (const post of allPosts) {
    const bed = (post.variation as { shortBed?: string } | null)?.shortBed;
    if (!bed) continue;
    const ytViews = latestViewsFromMap(latestByPost, post.id, "youtube");
    const ytReach = post.followersAtPublish > 0 ? ytViews / post.followersAtPublish : ytViews;
    bump(musicUsage, bed, shippedIds.has(post.id), ytViews, ytReach);
  }
  const musicStats: AssetStat[] = listBeds().map((bed) => {
    const acc = musicUsage.get(bed.id) ?? { total: 0, published: 0, views: 0, reach: 0 };
    return { name: `${bed.mood}/${bed.id}`, totalUses: acc.total, publishedUses: acc.published, views: acc.views, reach: acc.reach, cold: acc.published === 0 };
  });

  const shotScaleUsage = new Map<string, UsageAcc>();
  for (const post of allPosts) {
    const scale = parseVariation(post.variation).shotScale;
    if (!scale) continue;
    bump(shotScaleUsage, scale, shippedIds.has(post.id), viewsByPost.get(post.id) ?? 0, reachByPost.get(post.id) ?? 0);
  }
  const shotScaleStats: AssetStat[] = SHOT_SCALES.map((scale) => {
    const acc = shotScaleUsage.get(scale) ?? { total: 0, published: 0, views: 0, reach: 0 };
    return {
      name: `${scale} · ${shotScaleLabel(scale)}`,
      totalUses: acc.total,
      publishedUses: acc.published,
      views: acc.views,
      reach: acc.reach,
      cold: acc.published === 0,
    };
  });

  return { screenshots: screenshotStats, svgs: svgStats, templates: templateStats, formulas: formulaStats, music: musicStats, shotScales: shotScaleStats };
}

/** How many shipped posts used each YouTube bed. */
/** How many shipped posts used each screenshot size. */
export function shippedShotScaleUsage(): Map<string, number> {
  const db = getDb();
  const counts = new Map<string, number>();
  for (const post of db.select().from(posts).all()) {
    const shipped = (SHIPPED_STATUSES as readonly string[]).includes(post.status);
    const scale = parseVariation(post.variation).shotScale;
    if (!scale) continue;
    counts.set(scale, (counts.get(scale) ?? 0) + (shipped ? 1 : 0));
  }
  return counts;
}

export function shippedBedUsage(): Map<string, number> {
  const db = getDb();
  const counts = new Map<string, number>();
  for (const post of db.select().from(posts).all()) {
    const shipped = (SHIPPED_STATUSES as readonly string[]).includes(post.status);
    const bed = (post.variation as { shortBed?: string } | null)?.shortBed;
    if (!bed) continue;
    counts.set(bed, (counts.get(bed) ?? 0) + (shipped ? 1 : 0));
  }
  return counts;
}

export interface ColdAssets {
  screenshots: string[];
  svgs: string[];
  templates: string[];
}

/** Assets with zero shipped uses — the ones we still know nothing about. */
export function getColdAssets(): ColdAssets {
  const usage = getAssetUsage();
  return {
    screenshots: usage.screenshots.filter((s) => s.cold).map((s) => s.name),
    svgs: usage.svgs.filter((s) => s.cold).map((s) => s.name),
    templates: usage.templates.filter((s) => s.cold).map((s) => s.name),
  };
}

/** Assets shipped fewer than `threshold` times — not enough evidence yet. */
export function getUndertestedAssets(threshold = 3): ColdAssets {
  const usage = getAssetUsage();
  return {
    screenshots: usage.screenshots.filter((s) => s.publishedUses < threshold).map((s) => s.name),
    svgs: usage.svgs.filter((s) => s.publishedUses < threshold).map((s) => s.name),
    templates: usage.templates.filter((s) => s.publishedUses < threshold).map((s) => s.name),
  };
}

/** Shipped-use counts per screenshot stem. */
export function publishedScreenshotUsage(): Map<string, number> {
  return screenshotUsageForStatuses([...SHIPPED_STATUSES]);
}

/**
 * Queued + approved + shipped uses per stem. In-review overuse counts so
 * a new upload still beats crop_session_preview before anything is live.
 */
export function assignmentScreenshotUsage(): Map<string, number> {
  return screenshotUsageForStatuses(["queued", "approved", ...SHIPPED_STATUSES]);
}

function screenshotUsageForStatuses(statuses: string[]): Map<string, number> {
  const db = getDb();
  const wanted = new Set(statuses);
  const ids = new Set(
    db
      .select({ id: posts.id, status: posts.status })
      .from(posts)
      .all()
      .filter((p) => wanted.has(p.status))
      .map((p) => p.id),
  );
  const counts = new Map<string, number>();
  for (const s of db.select({ screenshot: slides.screenshot, postId: slides.postId }).from(slides).all()) {
    if (s.screenshot && ids.has(s.postId)) {
      const stem = screenshotStem(s.screenshot);
      counts.set(stem, (counts.get(stem) ?? 0) + 1);
    }
  }
  return counts;
}

/** All background x textStyle x layout combos the renderer can produce. */
export function allStyleCombos(): string[] {
  const backgrounds = [
    "atmosphere_ink", "atmosphere_clay", "atmosphere_slate",
    "atmosphere_duskblue", "atmosphere_ember", "atmosphere_plum",
    "atmosphere_sand", "atmosphere_copper", "atmosphere_fog",
    "cream", "dark", "gradient_warm", "charcoal", "sage",
  ];
  const textStyles = ["bold", "serif", "clean", "mono"];
  const layouts = ["standard", "left_aligned", "card_inset"];
  const combos: string[] = [];
  for (const b of backgrounds) for (const t of textStyles) for (const l of layouts) combos.push(`${b}/${t}/${l}`);
  return combos;
}

/** Shipped-use counts per background/textStyle/layout combo. */
export function shippedStyleComboUsage(): Map<string, number> {
  const db = getDb();
  const shipped = db.select().from(posts).where(inArray(posts.status, [...SHIPPED_STATUSES])).all();
  const counts = new Map<string, number>();
  for (const p of shipped) {
    const v = parseVariation(p.variation);
    const combo = `${v.background}/${v.textStyle}/${v.layout}`;
    counts.set(combo, (counts.get(combo) ?? 0) + 1);
  }
  return counts;
}

/**
 * Search random seeds for one whose deterministic variation lands on a
 * never-shipped background/textStyle/layout combo. Diversity rounds use this
 * so every color/style combination eventually gets a real test.
 */
export function pickSeedForNovelStyle(
  coldCombos: Set<string>,
  opts: { hasScreenshots: boolean; preferMusic: boolean },
): number | undefined {
  if (coldCombos.size === 0) return undefined;
  for (let attempt = 0; attempt < 60; attempt++) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const v = makeVariation({ seed, hasScreenshots: opts.hasScreenshots, preferMusic: opts.preferMusic });
    if (coldCombos.has(`${v.background}/${v.textStyle}/${v.layout}`)) return seed;
  }
  return undefined;
}

/**
 * If the template renders illustrations and cold SVGs exist, search random
 * seeds for one whose deterministic picks hit a cold asset. Keeps
 * pickIllustration untouched so rerenders stay stable.
 */
export function pickSeedForColdCoverage(
  template: CarouselTemplate,
  coldSvgIds: string[],
  opts?: { preferIds?: string[] },
): number | undefined {
  const illustrationIdxs = template.slides
    .map((s, i) => (s.kind === "illustration" ? i : -1))
    .filter((i) => i >= 0);
  if (illustrationIdxs.length === 0) return undefined;

  const hittable = new Set(enabledSvgIllustrations().filter(isOwnedIllustration).map((a) => a.id));
  const prefer = (opts?.preferIds ?? []).filter((id) => hittable.has(id));
  const coldOwned = coldSvgIds.filter((id) => hittable.has(id));
  const flatCold = coldOwned.filter((id) => getIllustration(id)?.source === "Remedy flat");
  const targets = prefer.length ? prefer : flatCold.length ? flatCold : coldOwned;
  if (targets.length === 0) return undefined;
  const targetSet = new Set(targets);

  for (let attempt = 0; attempt < 80; attempt++) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    try {
      for (const idx of illustrationIdxs) {
        if (targetSet.has(pickIllustration(seed, idx).id)) return seed;
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
}
