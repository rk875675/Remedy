import { getDb, ugcAnalytics, ugcVideos } from "@remedy-growth/db";
import { eq, inArray } from "drizzle-orm";
import { latestFollowers } from "../analytics/audience.js";
import { engagementRate } from "../analytics/store.js";
import { fetchPostAnalytics, isBrightbeanPostId } from "../publish/brightbean.js";
import type { PlatformPosts } from "../publish/index.js";

const MATURE_MS = 48 * 60 * 60 * 1000;

export async function pullUgcAnalytics(): Promise<{ pulled: number; errors: number }> {
  const db = getDb();
  const shipped = db
    .select()
    .from(ugcVideos)
    .where(inArray(ugcVideos.status, ["published", "scheduled"]))
    .all();
  let pulled = 0;
  let errors = 0;
  for (const video of shipped) {
    const pp = (video.platformPosts ?? {}) as PlatformPosts;
    const seen = new Set<string>();
    for (const [platform, rec] of Object.entries(pp)) {
      if (!isBrightbeanPostId(rec?.publishId) || seen.has(rec.publishId)) continue;
      seen.add(rec.publishId);
      try {
        const m = await fetchPostAnalytics(rec.publishId);
        if (!m) continue;
        const followers = latestFollowers(platform);
        db.insert(ugcAnalytics)
          .values({
            ugcVideoId: video.id,
            platform,
            views: m.views,
            likes: m.likes,
            comments: m.comments,
            shares: m.shares,
            saves: m.saves,
            engagementRate: engagementRate(m),
            followers,
            raw: m,
          })
          .run();
        pulled++;
      } catch (err) {
        errors++;
        console.warn(
          `UGC metrics failed for ${video.uuid} ${platform}:`,
          err instanceof Error ? err.message.slice(0, 200) : err,
        );
      }
    }
  }
  diagnoseUgc();
  if (pulled || errors) console.log(`UGC analytics: ${pulled} snapshots, ${errors} errors.`);
  return { pulled, errors };
}

function latestViews(videoId: number): number {
  const rows = getDb()
    .select()
    .from(ugcAnalytics)
    .where(eq(ugcAnalytics.ugcVideoId, videoId))
    .all();
  const byPlatform = new Map<string, number>();
  for (const row of rows) byPlatform.set(row.platform, row.views);
  return [...byPlatform.values()].reduce((n, v) => n + v, 0);
}

/** Rank mature UGC vs median views. Isolated from slideshow diagnosis. */
export function diagnoseUgc(): number {
  const db = getDb();
  const published = db.select().from(ugcVideos).where(eq(ugcVideos.status, "published")).all();
  const mature = published.filter((v) => {
    const t = v.publishedAt ? Date.parse(v.publishedAt) : 0;
    return t > 0 && Date.now() - t >= MATURE_MS;
  });
  if (mature.length < 2) return 0;
  const scored = mature.map((v) => ({ v, views: latestViews(v.id) })).sort((a, b) => a.views - b.views);
  const mid = Math.floor(scored.length / 2);
  const median =
    scored.length % 2 === 0
      ? (scored[mid - 1]!.views + scored[mid]!.views) / 2
      : scored[mid]!.views;
  if (median <= 0) return 0;
  let n = 0;
  for (const { v, views } of scored) {
    const diagnosis = views >= median * 1.5 ? "winner" : views <= median * 0.5 ? "dud" : "typical";
    if (v.diagnosis === diagnosis) continue;
    db.update(ugcVideos)
      .set({ diagnosis, diagnosedAt: new Date().toISOString() })
      .where(eq(ugcVideos.id, v.id))
      .run();
    n++;
  }
  return n;
}
