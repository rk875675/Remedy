import { getDb, posts } from "@remedy-growth/db";
import { inArray } from "drizzle-orm";
import { saveMetrics } from "./store.js";
import { freezeFollowersAtPublish, latestFollowers, pullAccountAudience } from "./audience.js";
import { resolveBrightbeanPostIds, resolveTikTokPostIds, type PlatformPosts } from "../publish/index.js";
import * as tiktok from "../publish/tiktok.js";
import * as instagram from "../publish/instagram.js";
import * as facebook from "../publish/facebook.js";
import { brightbeanConfigured, fetchPostAnalytics, isBrightbeanPostId, publisherReady } from "../publish/brightbean.js";
import { pullUgcAnalytics } from "../ugc/analytics.js";

const MEASURED_STATUSES = ["published", "draft_sent"] as const;

export interface PullResult {
  pulled: number;
  errors: number;
  audience: Awaited<ReturnType<typeof pullAccountAudience>>;
}

/**
 * Pull channel audience first (BrightBean), then per-post metrics.
 * Audience is recorded even when nothing has shipped yet — that's the
 * baseline later posts will be judged against.
 */
export async function pullAnalytics(): Promise<PullResult> {
  const db = getDb();
  const audience = await pullAccountAudience();

  if (brightbeanConfigured()) await resolveBrightbeanPostIds();
  else await resolveTikTokPostIds();

  const shipped = db.select().from(posts).where(inArray(posts.status, [...MEASURED_STATUSES])).all();
  let pulled = 0;
  let errors = 0;

  if (brightbeanConfigured()) {
    for (const post of shipped) {
      const pp = (post.platformPosts ?? {}) as PlatformPosts;
      const seen = new Set<string>();
      for (const [platform, rec] of Object.entries(pp)) {
        if (!isBrightbeanPostId(rec?.publishId) || seen.has(rec.publishId)) continue;
        seen.add(rec.publishId);
        try {
          const m = await fetchPostAnalytics(rec.publishId);
          if (!m) continue;
          const era = freezeFollowersAtPublish(post.id, latestFollowers(platform));
          saveMetrics(post.id, platform, m, m, era);
          pulled++;
        } catch (err) {
          errors++;
          console.warn(`BrightBean metrics failed for post #${post.id} ${platform}:`, err instanceof Error ? err.message.slice(0, 200) : err);
        }
      }
    }
    console.log(`Analytics pull complete: ${pulled} snapshots saved, ${errors} errors.`);
    await pullUgcAnalytics().catch((err) => {
      console.warn("UGC analytics pull failed:", err instanceof Error ? err.message : err);
    });
    return { pulled, errors, audience };
  }

  const tiktokIds: Array<{ postId: number; id: string }> = [];
  for (const post of shipped) {
    const pp = (post.platformPosts ?? {}) as PlatformPosts;
    if (pp.tiktok?.id) tiktokIds.push({ postId: post.id, id: pp.tiktok.id });
  }
  if (tiktokIds.length > 0 && publisherReady("tiktok")) {
    try {
      const metrics = await tiktok.queryMetrics(tiktokIds.map((t) => t.id));
      const eraDefault = latestFollowers("tiktok");
      for (const { postId, id } of tiktokIds) {
        const m = metrics[id];
        if (m) {
          const era = freezeFollowersAtPublish(postId, eraDefault);
          saveMetrics(postId, "tiktok", { views: m.views, likes: m.likes, comments: m.comments, shares: m.shares, saves: 0 }, m, era);
          pulled++;
        }
      }
    } catch (err) {
      errors++;
      console.warn("TikTok metrics pull failed:", err instanceof Error ? err.message.slice(0, 200) : err);
    }
  }

  for (const post of shipped) {
    const pp = (post.platformPosts ?? {}) as PlatformPosts;

    if (pp.instagram?.id && publisherReady("instagram")) {
      try {
        const m = await instagram.fetchMetrics(pp.instagram.id);
        const era = freezeFollowersAtPublish(post.id, latestFollowers("instagram"));
        saveMetrics(post.id, "instagram", m, m, era);
        pulled++;
      } catch (err) {
        errors++;
        console.warn(`IG metrics failed for post #${post.id}:`, err instanceof Error ? err.message.slice(0, 200) : err);
      }
    }

    if (pp.facebook?.id && publisherReady("facebook")) {
      try {
        const m = await facebook.fetchMetrics(pp.facebook.id);
        const era = freezeFollowersAtPublish(post.id, latestFollowers("facebook"));
        saveMetrics(post.id, "facebook", { views: 0, likes: m.likes, comments: m.comments, shares: m.shares, saves: 0 }, m, era);
        pulled++;
      } catch (err) {
        errors++;
        console.warn(`FB metrics failed for post #${post.id}:`, err instanceof Error ? err.message.slice(0, 200) : err);
      }
    }
  }

  console.log(`Analytics pull complete: ${pulled} snapshots saved, ${errors} errors.`);
  await pullUgcAnalytics().catch((err) => {
    console.warn("UGC analytics pull failed:", err instanceof Error ? err.message : err);
  });
  return { pulled, errors, audience };
}
