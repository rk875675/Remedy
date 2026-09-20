import { getDb, posts, slides } from "@remedy-growth/db";
import { and, eq, gt, lte, asc, sql } from "drizzle-orm";
import { env, configuredPlatforms, r2Configured, type Platform } from "../config.js";
import { postOutputDir } from "../generation/composer.js";
import { ensureComingSoonCaption } from "../generation/hooks.js";
import { parseVariation } from "../generation/variations.js";
import { renderSlideshowShort, shortOutputPath, youtubeMusicCredit } from "../generation/short.js";
import { pruneLocalPostDir, pruneRemotePostMedia } from "../generation/storage.js";
import { uploadSlides } from "./r2.js";
import * as tiktok from "./tiktok.js";
import * as instagram from "./instagram.js";
import * as facebook from "./facebook.js";
import {
  accountFor,
  brightbeanConfigured,
  fetchBrightbeanPost,
  isBrightbeanPostId,
  publishCarouselToAccount,
  publisherReady,
  uploadSlideImages,
  uploadVideoFile,
} from "./brightbean.js";

export interface PlatformPostRecord {
  /** Public post/media id once known (used for analytics) */
  id?: string;
  /** TikTok publish job id (resolved to a post id later via status polling) */
  publishId?: string;
  status: "published" | "draft_sent" | "pending" | "failed";
  error?: string;
}

export type PlatformPosts = Partial<Record<Platform, PlatformPostRecord>>;

export type PublishMode = "drafts" | "live";

type VideoFollowPlatform = "tiktok" | "instagram" | "facebook";
const VIDEO_FOLLOW_PLATFORMS: VideoFollowPlatform[] = ["tiktok", "instagram", "facebook"];

function photoSucceeded(record: PlatformPostRecord | undefined): boolean {
  return Boolean(record && record.status !== "failed");
}

export function defaultPublishMode(): PublishMode {
  return env.LIVE_PUBLISH ? "live" : "drafts";
}

/** All BrightBean platforms go live. TikTok music is a later optional step. */
export function publishModeFor(_platform: Platform): PublishMode {
  return "live";
}

function withShortsTag(text: string, max: number): string {
  const tagged = /#shorts/i.test(text) ? text : `${text.trim()} #Shorts`;
  return tagged.slice(0, max);
}

function publishTargets(listed: Platform[]): Platform[] {
  const extra: Platform[] = [...listed];
  if (publisherReady("youtube") && !extra.includes("youtube")) extra.push("youtube");
  return extra.filter((p) => {
    if (!publisherReady(p)) return false;
    if (p === "youtube") return brightbeanConfigured();
    if (!brightbeanConfigured() && p !== "tiktok" && !env.LIVE_PUBLISH) return false;
    return true;
  });
}

/** Publish a single post's carousel. Drafts stay in BrightBean (or TikTok inbox as fallback). */
export async function publishPost(
  postId: number,
  opts?: { mode?: PublishMode; retryFailed?: boolean },
): Promise<{ ok: boolean; results?: PlatformPosts; error?: string }> {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) return { ok: false, error: `Post ${postId} not found` };
  const existing = (post.platformPosts ?? {}) as PlatformPosts;
  if ((post.status === "published" || post.status === "draft_sent") && !opts?.retryFailed) {
    return { ok: false, error: "Already sent" };
  }

  const slideRows = db.select().from(slides).where(eq(slides.postId, postId)).orderBy(asc(slides.idx)).all();
  if (slideRows.length < 2) return { ok: false, error: "Carousels need at least 2 slides" };

  const useBrightbean = brightbeanConfigured();
  if (!useBrightbean && !r2Configured()) {
    return { ok: false, error: "Connect BrightBean in Settings, or set R2_* so native APIs can pull slide URLs." };
  }

  let imageUrls: string[] = [];
  if (r2Configured()) {
    try {
      imageUrls = await uploadSlides(postId, slideRows.map((s) => s.filePath), parseVariation(post.variation).prelaunch === true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!useBrightbean) {
        db.update(posts).set({ status: "failed", error: message }).where(eq(posts.id, postId)).run();
        return { ok: false, error: message };
      }
      console.warn(`R2 slide upload failed for #${postId} (BrightBean will still get local files): ${message}`);
    }
  }

  const prelaunch = parseVariation(post.variation).prelaunch === true;
  const caption = [prelaunch ? ensureComingSoonCaption(post.caption) : post.caption, post.hashtags]
    .filter(Boolean)
    .join("\n\n");
  if (prelaunch && /apps\.apple\.com/i.test(caption)) {
    return { ok: false, error: "Pre-launch teaser still contains an App Store URL — fix the caption first." };
  }
  const forceMode = opts?.mode;
  let targets = publishTargets((post.platforms as Platform[]) ?? []);
  if (opts?.retryFailed) {
    targets = targets.filter((p) => !existing[p] || existing[p]?.status === "failed");
    if (targets.length === 0) return { ok: false, error: "No failed platforms to retry" };
  }
  if (targets.length === 0) {
    const hint = useBrightbean
      ? "BrightBean has no connected TikTok / Instagram / Facebook / YouTube account on this API key"
      : forceMode === "drafts" || !env.LIVE_PUBLISH
        ? "Connect BrightBean (or native TikTok) in Settings — native Instagram/Facebook have no draft inbox"
        : "No configured platforms for this post — connect BrightBean in Settings";
    return { ok: false, error: hint };
  }

  const results: PlatformPosts = opts?.retryFailed ? { ...existing } : {};
  const photoTargets = targets.filter((p) => p !== "youtube");
  let mediaAssetIds: string[] | null = null;
  if (useBrightbean && photoTargets.length > 0) {
    try {
      mediaAssetIds = await uploadSlideImages(slideRows.map((s) => s.filePath), postId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.update(posts).set({ status: "failed", error: message }).where(eq(posts.id, postId)).run();
      return { ok: false, error: message };
    }
  }

  let youtubeVideoId: string | null = null;
  let youtubeCaption = caption;
  if (targets.includes("youtube")) {
    try {
      const outPath = shortOutputPath(postOutputDir(postId));
      const variation = parseVariation(post.variation);
      const rendered = await renderSlideshowShort(slideRows.map((s) => s.filePath), outPath, postId, variation.shortBed);
      if (rendered.bed.id !== variation.shortBed) {
        db.update(posts)
          .set({ variation: { ...variation, shortBed: rendered.bed.id } })
          .where(eq(posts.id, postId))
          .run();
      }
      pruneLocalPostDir(postId, true);
      const credit = youtubeMusicCredit(rendered.bed);
      youtubeCaption = credit
        ? `${withShortsTag(caption, 4800)}\n\n${credit}`
        : withShortsTag(caption, 4800);
      youtubeVideoId = await uploadVideoFile(outPath, postId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results.youtube = { status: "failed", error: message };
      console.error(`Post #${postId} -> youtube render/upload failed: ${message}`);
    }
  }

  for (const platform of targets) {
    const platformMode = forceMode ?? publishModeFor(platform);
    try {
      if (platform === "youtube") {
        if (!youtubeVideoId) continue;
        if (!accountFor("youtube")) {
          results.youtube = { status: "failed", error: "No BrightBean youtube account" };
          continue;
        }
        const r = await publishCarouselToAccount({
          postId,
          platform: "youtube",
          title: withShortsTag(post.tiktokTitle, 100),
          caption: youtubeCaption,
          mediaAssetIds: [youtubeVideoId],
          mode: platformMode,
          scheduledAt: post.scheduledAt,
        });
        results.youtube = {
          publishId: r.brightbeanPostId,
          id: r.platformPostId,
          status: r.status,
          error: r.error,
        };
      } else if (useBrightbean && mediaAssetIds && (platform === "tiktok" || platform === "instagram" || platform === "facebook")) {
        if (platform === "tiktok") {
          console.log(`Post #${postId} -> tiktok: skipped (BrightBean TikTok is video-only)`);
          continue;
        }
        if (!accountFor(platform)) {
          results[platform] = { status: "failed", error: `No BrightBean ${platform} account` };
          continue;
        }
        const r = await publishCarouselToAccount({
          postId,
          platform,
          title: post.tiktokTitle,
          caption,
          mediaAssetIds,
          mode: platformMode,
          scheduledAt: post.scheduledAt,
        });
        results[platform] = {
          publishId: r.brightbeanPostId,
          id: r.platformPostId,
          status: r.status,
          error: r.error,
        };
      } else if (platform === "tiktok" && imageUrls.length >= 2) {
        const r = await tiktok.publishPhotos({
          title: post.tiktokTitle,
          description: caption,
          imageUrls,
        });
        results.tiktok = {
          publishId: r.publishId,
          status: r.mode === "MEDIA_UPLOAD" ? "draft_sent" : "pending",
        };
      } else if (platform === "instagram") {
        const mediaId = await instagram.publishCarousel({ caption, imageUrls });
        results.instagram = { id: mediaId, status: "published" };
      } else if (platform === "facebook") {
        const fbId = await facebook.publishPhotos({ caption, imageUrls });
        results.facebook = { id: fbId, status: "published" };
      }
      console.log(`Post #${postId} -> ${platform}: ${results[platform]?.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      results[platform] = { status: "failed", error: message };
      console.error(`Post #${postId} -> ${platform} failed: ${message}`);
    }
  }

  const anySuccess = Object.values(results).some((r) => r.status !== "failed");
  const errors = Object.entries(results)
    .filter(([, r]) => r.status === "failed")
    .map(([p, r]) => `${p}: ${r.error}`)
    .join(" | ");

  const wentLive = Object.values(results).some((r) => r.status === "published" || r.status === "pending");
  const photoOkPlatforms = VIDEO_FOLLOW_PLATFORMS.filter((p) => {
    if (p === "tiktok" && useBrightbean && accountFor("tiktok")) return true;
    return Boolean(results[p] && results[p]!.status !== "failed");
  });
  const variation = parseVariation(post.variation);
  if (photoOkPlatforms.length > 0 && !variation.videoFollowUpDone) {
    const carouselAt = post.scheduledAt && Date.parse(post.scheduledAt) > Date.now()
      ? Date.parse(post.scheduledAt)
      : Date.now();
    variation.videoFollowUpAt = new Date(carouselAt + 15 * 60 * 1000).toISOString();
    variation.videoFollowUpPlatforms = photoOkPlatforms;
  }
  db.update(posts)
    .set({
      status: anySuccess ? (wentLive ? "published" : "draft_sent") : "failed",
      publishedAt: anySuccess ? new Date().toISOString() : null,
      platformPosts: results,
      variation,
      error: errors || null,
    })
    .where(eq(posts.id, postId))
    .run();

  if (anySuccess) {
    // Keep the short 48h after post so a bad publish can be retried; expirePostedMedia deletes after that.
    pruneLocalPostDir(postId, true);
    if (r2Configured()) {
      await pruneRemotePostMedia(postId, true).catch(() => 0);
    }
    // Schedule the Short on BrightBean now (future slot) so the engine can be off afterward.
    if (variation.videoFollowUpAt && !variation.videoFollowUpDone) {
      await publishVideoFollowUp(postId);
    }
  }

  return { ok: anySuccess, results, error: errors || undefined };
}

/** Send every approved post now (all connected platforms live). */
export async function sendApprovedToDrafts(): Promise<{
  sent: number;
  failed: number;
  errors: Array<{ postId: number; error: string }>;
}> {
  const db = getDb();
  const approved = db.select().from(posts).where(eq(posts.status, "approved")).all();
  let sent = 0;
  const errors: Array<{ postId: number; error: string }> = [];
  for (const post of approved) {
    const result = await publishPost(post.id);
    if (result.ok) sent++;
    else errors.push({ postId: post.id, error: result.error ?? "unknown" });
  }
  return { sent, failed: errors.length, errors };
}

/**
 * Push approved posts that already have a future slot to BrightBean now.
 * BrightBean owns the clock after this — the local engine can be turned off.
 */
export async function handoffScheduled(): Promise<number> {
  if (!env.AUTO_PUBLISH) return 0;
  if (!brightbeanConfigured()) return 0;
  const db = getDb();
  const now = new Date().toISOString();
  const upcoming = db
    .select()
    .from(posts)
    .where(and(eq(posts.status, "approved"), gt(posts.scheduledAt, now)))
    .all();

  let sent = 0;
  for (const post of upcoming) {
    const result = await publishPost(post.id);
    if (result.ok) sent++;
  }
  return sent;
}

/** Publish all approved posts whose scheduled time has arrived. */
export async function publishDue(): Promise<number> {
  if (!env.AUTO_PUBLISH) return 0;
  const anyConfigured = configuredPlatforms().some((p) => publisherReady(p));
  if (!anyConfigured) return 0;
  if (!brightbeanConfigured() && !r2Configured()) return 0;
  const db = getDb();
  const now = new Date().toISOString();
  const due = db
    .select()
    .from(posts)
    .where(and(eq(posts.status, "approved"), lte(posts.scheduledAt, now)))
    .all();

  let published = 0;
  for (const post of due) {
    const result = await publishPost(post.id);
    if (result.ok) published++;
  }
  return published;
}

/** Short only to platforms whose carousel succeeded, ~15 min later. */
export async function publishVideoFollowUp(postId: number): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) return { ok: false, error: `Post ${postId} not found` };
  const variation = parseVariation(post.variation);
  if (variation.videoFollowUpDone) return { ok: true };
  const existing = (post.platformPosts ?? {}) as PlatformPosts;
  const targets: VideoFollowPlatform[] = (
    variation.videoFollowUpPlatforms?.length
      ? variation.videoFollowUpPlatforms
      : VIDEO_FOLLOW_PLATFORMS.filter((p) => photoSucceeded(existing[p]))
  ).filter((p) => accountFor(p));
  if (targets.length === 0) {
    variation.videoFollowUpDone = true;
    db.update(posts).set({ variation }).where(eq(posts.id, postId)).run();
    return { ok: true };
  }
  if (!brightbeanConfigured()) {
    variation.videoFollowUpDone = true;
    db.update(posts).set({ variation }).where(eq(posts.id, postId)).run();
    return { ok: false, error: "BrightBean is not connected" };
  }

  const slideRows = db.select().from(slides).where(eq(slides.postId, postId)).orderBy(asc(slides.idx)).all();
  const outPath = shortOutputPath(postOutputDir(postId));
  let videoId: string;
  try {
    const rendered = await renderSlideshowShort(slideRows.map((s) => s.filePath), outPath, postId, variation.shortBed);
    pruneLocalPostDir(postId, true);
    videoId = await uploadVideoFile(outPath, postId);
    void rendered;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }

  const prelaunch = variation.prelaunch === true;
  const caption = [prelaunch ? ensureComingSoonCaption(post.caption) : post.caption, post.hashtags]
    .filter(Boolean)
    .join("\n\n");
  let anyOk = false;
  const errors: string[] = [];
  for (const platform of targets) {
    if (!accountFor(platform)) continue;
    try {
      const r = await publishCarouselToAccount({
        postId,
        platform,
        title: post.tiktokTitle,
        caption,
        mediaAssetIds: [videoId],
        mode: "live",
        scheduledAt: variation.videoFollowUpAt ?? null,
        idempotencyKey: `remedy-${postId}-${platform}-video-v1`,
      });
      existing[platform] = {
        ...existing[platform],
        publishId: existing[platform]?.publishId,
        id: existing[platform]?.id,
        status: existing[platform]?.status ?? r.status,
        error: r.status === "failed" ? r.error : existing[platform]?.error,
      };
      if (r.status === "failed") errors.push(`${platform} video: ${r.error ?? "failed"}`);
      else anyOk = true;
      console.log(`Post #${postId} video follow-up -> ${platform}: ${r.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${platform} video: ${message}`);
      console.error(`Post #${postId} video follow-up -> ${platform} failed: ${message}`);
    }
  }
  variation.videoFollowUpDone = true;
  db.update(posts)
    .set({
      variation,
      platformPosts: existing,
      error: errors.length ? [post.error, ...errors].filter(Boolean).join(" | ") : post.error,
    })
    .where(eq(posts.id, postId))
    .run();
  return { ok: anyOk, error: errors.join(" | ") || undefined };
}

export async function publishDueVideoFollowUps(): Promise<number> {
  if (!env.AUTO_PUBLISH) return 0;
  const db = getDb();
  const rows = db
    .select()
    .from(posts)
    .where(sql`${posts.status} IN ('published','draft_sent')`)
    .all();
  let sent = 0;
  const now = Date.now();
  for (const post of rows) {
    const variation = parseVariation(post.variation);
    if (variation.videoFollowUpDone || !variation.videoFollowUpAt) continue;
    if (Date.parse(variation.videoFollowUpAt) > now) continue;
    const result = await publishVideoFollowUp(post.id);
    if (result.ok) sent++;
  }
  return sent;
}

/**
 * Refresh BrightBean children: when a draft goes live, copy platform_post_id
 * and promote our row to published so analytics + diagnosis can run.
 */
export async function resolveBrightbeanPostIds(): Promise<number> {
  if (!brightbeanConfigured()) return 0;
  const db = getDb();
  const rows = db
    .select()
    .from(posts)
    .where(sql`${posts.status} IN ('published','draft_sent','approved')`)
    .all();
  let resolved = 0;
  for (const post of rows) {
    const pp = (post.platformPosts ?? {}) as PlatformPosts;
    let changed = false;
    let anyPublished = false;
    for (const [platform, rec] of Object.entries(pp)) {
      if (!isBrightbeanPostId(rec?.publishId) || rec.status === "failed") continue;
      try {
        const remote = await fetchBrightbeanPost(rec.publishId);
        const child = (remote.platform_posts ?? [])[0];
        const childStatus = (child?.status ?? remote.status ?? "").toLowerCase();
        const platformPostId = child?.platform_post_id ? String(child.platform_post_id) : rec.id;
        const mapped =
          childStatus === "published" || Boolean(remote.published_at)
            ? "published"
            : childStatus === "failed"
              ? "failed"
              : rec.status;
        if (mapped === "published") anyPublished = true;
        if (mapped !== rec.status || platformPostId !== rec.id) {
          pp[platform as Platform] = { ...rec, id: platformPostId, status: mapped };
          changed = true;
        }
      } catch (err) {
        console.warn(
          `BrightBean status fetch failed for post #${post.id} ${platform}:`,
          err instanceof Error ? err.message.slice(0, 200) : err,
        );
      }
    }
    if (!changed) continue;
    const nextStatus = anyPublished ? "published" : post.status;
    db.update(posts)
      .set({
        platformPosts: pp,
        status: nextStatus,
        publishedAt: anyPublished ? (post.publishedAt ?? new Date().toISOString()) : post.publishedAt,
      })
      .where(eq(posts.id, post.id))
      .run();
    resolved++;
  }
  return resolved;
}

/**
 * Resolve TikTok publish jobs to public post ids (needed before metrics work).
 * Draft-mode posts only get an id after you publish them in the app.
 */
export async function resolveTikTokPostIds(): Promise<number> {
  if (brightbeanConfigured()) return 0;
  if (!publisherReady("tiktok") || !tiktok.tiktokConnected()) return 0;
  const db = getDb();
  const published = db
    .select()
    .from(posts)
    .where(sql`${posts.status} IN ('published','draft_sent')`)
    .all();
  let resolved = 0;
  for (const post of published) {
    const pp = (post.platformPosts ?? {}) as PlatformPosts;
    const tt = pp.tiktok;
    if (!tt || tt.id || !tt.publishId || tt.status === "failed") continue;
    try {
      const status = await tiktok.fetchStatus(tt.publishId);
      if (status.postId) {
        pp.tiktok = { ...tt, id: status.postId, status: "published" };
        db.update(posts).set({ platformPosts: pp }).where(eq(posts.id, post.id)).run();
        resolved++;
      } else if (status.status === "FAILED") {
        pp.tiktok = { ...tt, status: "failed", error: status.failReason ?? status.status };
        db.update(posts).set({ platformPosts: pp }).where(eq(posts.id, post.id)).run();
      }
    } catch (err) {
      console.warn(`TikTok status fetch failed for post #${post.id}:`, err instanceof Error ? err.message.slice(0, 200) : err);
    }
  }
  return resolved;
}
