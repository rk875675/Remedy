import { getDb, posts, slides } from "@remedy-growth/db";
import { and, eq, gt, lte, asc, sql } from "drizzle-orm";
import { env, configuredPlatforms, r2Configured, type Platform } from "../config.js";
import { postOutputDir } from "../generation/composer.js";
import { ensureComingSoonCaption } from "../generation/hooks.js";
import { pinnedCtaComment } from "../generation/character-deck.js";
import { parseVariation } from "../generation/variations.js";
import { renderSlideshowShort, shortOutputPath, youtubeMusicCredit } from "../generation/short.js";
import { pruneLocalPostDir, pruneRemotePostMedia } from "../generation/storage.js";
import { uploadSlides } from "./r2.js";
import { platformScheduledAt } from "./scheduler.js";
import * as tiktok from "./tiktok.js";
import * as instagram from "./instagram.js";
import * as facebook from "./facebook.js";
import {
  accountGroup,
  accountsFor,
  fetchZernioPost,
  isZernioPostId,
  publishToAccount,
  publisherReady,
  uploadSlideImages,
  uploadVideoFile,
  zernioConfigured,
  type AccountGroup,
  type ZernioKeySlot,
} from "./zernio.js";

export interface AccountCopy {
  accountId: string;
  handle: string;
  keySlot: ZernioKeySlot;
  publishId?: string;
  id?: string;
  status: "published" | "draft_sent" | "pending" | "failed";
  error?: string;
}

export interface PlatformPostRecord {
  /** Public post/media id once known (used for analytics) */
  id?: string;
  /** TikTok publish job id (resolved to a post id later via status polling) */
  publishId?: string;
  /** Zernio login that created publishId. "1" is ZERNIO_API_KEY. */
  keySlot?: ZernioKeySlot;
  accountId?: string;
  accountHandle?: string;
  status: "published" | "draft_sent" | "pending" | "failed";
  error?: string;
  /** Other accounts on the same platform (a second Zernio login). */
  copies?: AccountCopy[];
}

export type PlatformPosts = Partial<Record<Platform, PlatformPostRecord>>;

export type PublishMode = "drafts" | "live";

/** Every Zernio post id stored on a platform record, including extra accounts. */
export function zernioRefs(rec: PlatformPostRecord | undefined): Array<{ publishId: string; keySlot?: ZernioKeySlot }> {
  if (!rec) return [];
  const refs: Array<{ publishId: string; keySlot?: ZernioKeySlot }> = [];
  if (rec.publishId) refs.push({ publishId: rec.publishId, keySlot: rec.keySlot });
  for (const copy of rec.copies ?? []) {
    if (copy.publishId && copy.publishId !== rec.publishId) refs.push({ publishId: copy.publishId, keySlot: copy.keySlot });
  }
  return refs;
}

function foldAccountCopies(copies: AccountCopy[]): PlatformPostRecord {
  const lead = copies.find((c) => c.status !== "failed") ?? copies[0];
  const failed = copies.filter((c) => c.status === "failed");
  return {
    publishId: lead?.publishId,
    id: lead?.id,
    keySlot: lead?.keySlot,
    accountId: lead?.accountId,
    accountHandle: lead?.handle,
    status: lead?.status ?? "failed",
    error: failed.length ? failed.map((f) => `@${f.handle || f.accountId}: ${f.error ?? "failed"}`).join(" | ") : undefined,
    copies: copies.length > 1 ? copies : undefined,
  };
}

/** Main brand unless this post is the second-account hook twin. */
export function groupForVariation(variation: unknown): AccountGroup {
  return parseVariation(variation).zernioSlot === "2" ? "2" : "1";
}

function slotsFor(platforms: Platform[], group?: AccountGroup): ZernioKeySlot[] {
  const slots = new Set<ZernioKeySlot>();
  for (const platform of platforms) {
    for (const account of accountsFor(platform)) {
      if (group && accountGroup(account) !== group) continue;
      slots.add(account.keySlot);
    }
  }
  return [...slots];
}

/** Send one carousel or video to every connected account in this brand. Omit group for UGC (all accounts). */
export async function publishEveryAccount(params: {
  platform: Platform;
  postId: number;
  title: string;
  caption: string;
  mediaBySlot: Map<ZernioKeySlot, string[]>;
  uploadErrors: Map<ZernioKeySlot, string>;
  mediaKind: "images" | "video";
  mode: PublishMode;
  scheduledAt: string | null;
  kind: string;
  idempotencyPrefix?: string;
  /** "1" main brand, "2" second-account hook twin. */
  group?: AccountGroup;
  firstComment?: string;
}): Promise<PlatformPostRecord> {
  const accounts = accountsFor(params.platform).filter((a) => !params.group || accountGroup(a) === params.group);
  if (accounts.length === 0) {
    const which = params.group === "2" ? "second-account" : params.group === "1" ? "main" : "";
    return { status: "failed", error: `No ${which ? `${which} ` : ""}Zernio ${params.platform} account` };
  }
  const copies: AccountCopy[] = [];
  for (const account of accounts) {
    const uploadError = params.uploadErrors.get(account.keySlot);
    const mediaUrls = params.mediaBySlot.get(account.keySlot);
    if (uploadError || !mediaUrls?.length) {
      copies.push({
        accountId: account.id,
        handle: account.handle,
        keySlot: account.keySlot,
        status: "failed",
        error: uploadError ?? "Media upload missing for this Zernio login",
      });
      continue;
    }
    try {
      const r = await publishToAccount({
        platform: params.platform,
        accountId: account.id,
        title: params.title,
        caption: params.caption,
        mediaUrls,
        mediaKind: params.mediaKind,
        mode: params.mode,
        scheduledAt: params.scheduledAt,
  idempotencyKey: `${params.idempotencyPrefix ?? `remedy-${params.postId}`}-${params.platform}-${account.id}-${params.kind}-v1`,
        firstComment: params.firstComment,
      });
      copies.push({
        accountId: account.id,
        handle: account.handle,
        keySlot: r.keySlot,
        publishId: r.zernioPostId,
        id: r.platformPostId,
        status: r.status,
        error: r.error,
      });
      console.log(`Post #${params.postId} -> ${params.platform} @${account.handle} (key ${account.keySlot}): ${r.status}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      copies.push({
        accountId: account.id,
        handle: account.handle,
        keySlot: account.keySlot,
        status: "failed",
        error: message,
      });
      console.error(`Post #${params.postId} -> ${params.platform} @${account.handle} failed: ${message}`);
    }
  }
  return foldAccountCopies(copies);
}

export async function uploadPerSlot(
  slots: ZernioKeySlot[],
  upload: (slot: ZernioKeySlot) => Promise<string[]>,
): Promise<{ urls: Map<ZernioKeySlot, string[]>; errors: Map<ZernioKeySlot, string> }> {
  const urls = new Map<ZernioKeySlot, string[]>();
  const errors = new Map<ZernioKeySlot, string>();
  for (const slot of slots) {
    try {
      urls.set(slot, await upload(slot));
    } catch (err) {
      errors.set(slot, err instanceof Error ? err.message : String(err));
    }
  }
  return { urls, errors };
}

export function defaultPublishMode(): PublishMode {
  return env.LIVE_PUBLISH ? "live" : "drafts";
}

/** All Zernio platforms go live. */
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
    if (p === "youtube") return zernioConfigured();
    if (!zernioConfigured() && p !== "tiktok" && !env.LIVE_PUBLISH) return false;
    return true;
  });
}

/** Publish a single post's carousel through Zernio (native TikTok/IG/FB APIs only as a fallback). */
export async function publishPost(
  postId: number,
  opts?: { mode?: PublishMode; retryFailed?: boolean },
): Promise<{ ok: boolean; results?: PlatformPosts; error?: string }> {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) return { ok: false, error: `Post ${postId} not found` };
  if (groupForVariation(post.variation) === "2") {
    if (post.status !== "published") {
      db.update(posts).set({ scheduledAt: null, platforms: [] }).where(eq(posts.id, postId)).run();
    }
    return { ok: false, error: "Stories does not receive slideshows" };
  }
  const existing = (post.platformPosts ?? {}) as PlatformPosts;
  if ((post.status === "published" || post.status === "draft_sent") && !opts?.retryFailed) {
    return { ok: false, error: "Already sent" };
  }

  const slideRows = db.select().from(slides).where(eq(slides.postId, postId)).orderBy(asc(slides.idx)).all();
  if (slideRows.length < 2) return { ok: false, error: "Carousels need at least 2 slides" };

  const useZernio = zernioConfigured();
  if (!useZernio && !r2Configured()) {
    return { ok: false, error: "Set ZERNIO_API_KEY in growth-engine/.env, or set R2_* so native APIs can pull slide URLs." };
  }

  // Zernio gets slides through its own media store; R2 is only needed by the native fallback.
  let imageUrls: string[] = [];
  if (!useZernio && r2Configured()) {
    try {
      imageUrls = await uploadSlides(postId, slideRows.map((s) => s.filePath), true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      db.update(posts).set({ status: "failed", error: message }).where(eq(posts.id, postId)).run();
      return { ok: false, error: message };
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
  if (useZernio) {
    const group = groupForVariation(post.variation);
    targets = targets.filter((p) => accountsFor(p).some((a) => accountGroup(a) === group));
    targets = targets.filter((p) => p !== "facebook");
    if (group === "2") targets = targets.filter((p) => p !== "youtube");
  }
  if (targets.length === 0) {
    const hint = useZernio
      ? "Zernio has no connected TikTok / Instagram / Facebook / YouTube account on this API key"
      : forceMode === "drafts" || !env.LIVE_PUBLISH
        ? "Set ZERNIO_API_KEY (or native TikTok) — native Instagram/Facebook have no draft inbox"
        : "No configured platforms for this post — set ZERNIO_API_KEY in growth-engine/.env";
    return { ok: false, error: hint };
  }

  const results: PlatformPosts = opts?.retryFailed ? { ...existing } : {};
  const group = groupForVariation(post.variation);
  const photoTargets = targets.filter((p) => p !== "youtube");
  const slidePaths = slideRows.map((s) => s.filePath);
  let slideMedia: { urls: Map<ZernioKeySlot, string[]>; errors: Map<ZernioKeySlot, string> } = {
    urls: new Map(),
    errors: new Map(),
  };
  if (useZernio && photoTargets.length > 0) {
    slideMedia = await uploadPerSlot(slotsFor(photoTargets, group), (slot) => uploadSlideImages(slidePaths, slot));
    if (slideMedia.urls.size === 0) {
      const message = [...slideMedia.errors.values()][0] ?? "Zernio slide upload failed";
      db.update(posts).set({ status: "failed", error: message }).where(eq(posts.id, postId)).run();
      return { ok: false, error: message };
    }
  }

  let youtubeCaption = caption;
  let youtubeMedia: { urls: Map<ZernioKeySlot, string[]>; errors: Map<ZernioKeySlot, string> } = {
    urls: new Map(),
    errors: new Map(),
  };
  if (targets.includes("youtube") && useZernio) {
    try {
      const outPath = shortOutputPath(postOutputDir(postId));
      const variation = parseVariation(post.variation);
      const rendered = await renderSlideshowShort(slidePaths, outPath, postId, variation.shortBed);
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
      youtubeMedia = await uploadPerSlot(slotsFor(["youtube"], group), (slot) => uploadVideoFile(outPath, slot).then((url) => [url]));
      if (youtubeMedia.urls.size === 0) {
        const message = [...youtubeMedia.errors.values()][0] ?? "YouTube upload failed";
        results.youtube = { status: "failed", error: message };
        console.error(`Post #${postId} -> youtube upload failed: ${message}`);
      }
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
        if (results.youtube?.status === "failed" && youtubeMedia.urls.size === 0) continue;
        results.youtube = await publishEveryAccount({
          platform: "youtube",
          postId,
          title: withShortsTag(post.tiktokTitle, 100),
          caption: youtubeCaption,
          mediaBySlot: youtubeMedia.urls,
          uploadErrors: youtubeMedia.errors,
          mediaKind: "video",
          mode: platformMode,
          scheduledAt: platformScheduledAt(post.scheduledAt, postId, "youtube"),
          kind: "short",
          group,
          firstComment: pinnedCtaComment(postId),
        });
      } else if (useZernio && (platform === "tiktok" || platform === "instagram" || platform === "facebook")) {
        results[platform] = await publishEveryAccount({
          platform,
          postId,
          title: post.tiktokTitle,
          caption,
          mediaBySlot: slideMedia.urls,
          uploadErrors: slideMedia.errors,
          mediaKind: "images",
          mode: platformMode,
          scheduledAt: platformScheduledAt(post.scheduledAt, postId, platform),
          kind: "carousel",
          group,
        });
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
  const fresh = db.select().from(posts).where(eq(posts.id, postId)).get();
  const variation = parseVariation(fresh?.variation ?? post.variation);
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
 * Push approved posts that already have a future slot to Zernio now.
 * Zernio owns the clock after this — the local engine can be turned off.
 */
export async function handoffScheduled(): Promise<number> {
  if (!env.AUTO_PUBLISH) return 0;
  if (!zernioConfigured()) return 0;
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
  if (!zernioConfigured() && !r2Configured()) return 0;
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

/** Slideshow video is YouTube-only. Older rows may still have a follow-up flag; never send it. */
export async function publishVideoFollowUp(postId: number): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) return { ok: false, error: `Post ${postId} not found` };
  const variation = parseVariation(post.variation);
  if (!variation.videoFollowUpDone) {
    variation.videoFollowUpDone = true;
    variation.videoFollowUpPlatforms = [];
    db.update(posts).set({ variation }).where(eq(posts.id, postId)).run();
  }
  return { ok: true };
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
 * Refresh Zernio posts: when a scheduled post goes live, copy platformPostId
 * and promote our row to published so analytics + diagnosis can run.
 */
export async function resolveZernioPostIds(): Promise<number> {
  if (!zernioConfigured()) return 0;
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
      if (!rec) continue;
      for (const ref of zernioRefs(rec)) {
        if (!isZernioPostId(ref.publishId)) continue;
        try {
          const remote = await fetchZernioPost(ref.publishId, ref.keySlot);
          const child = remote.platforms.find((c) => c.platform === platform) ?? remote.platforms[0];
          const childStatus = (child?.status ?? remote.status ?? "").toLowerCase();
          const platformPostId = child?.platformPostId ? String(child.platformPostId) : undefined;
          const mapped: AccountCopy["status"] =
            childStatus === "published" || Boolean(remote.publishedAt)
              ? "published"
              : childStatus === "failed"
                ? "failed"
                : "pending";
          if (mapped === "published") anyPublished = true;
          const current = pp[platform as Platform];
          if (!current) continue;
          if (ref.publishId === current.publishId) {
            if (mapped !== current.status || (platformPostId && platformPostId !== current.id)) {
              pp[platform as Platform] = { ...current, id: platformPostId ?? current.id, status: mapped === "pending" ? current.status : mapped };
              changed = true;
            }
          } else if (current.copies) {
            const nextCopies = current.copies.map((copy) => {
              if (copy.publishId !== ref.publishId) return copy;
              if (mapped === "pending" || (mapped === copy.status && platformPostId === copy.id)) return copy;
              changed = true;
              return { ...copy, id: platformPostId ?? copy.id, status: mapped };
            });
            pp[platform as Platform] = { ...current, copies: nextCopies };
          }
        } catch (err) {
          console.warn(
            `Zernio status fetch failed for post #${post.id} ${platform}:`,
            err instanceof Error ? err.message.slice(0, 200) : err,
          );
        }
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
  if (zernioConfigured()) return 0;
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
