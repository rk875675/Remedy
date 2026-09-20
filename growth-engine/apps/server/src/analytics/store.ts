import { getDb, analytics } from "@remedy-growth/db";

export interface Metrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

export function engagementRate(m: Metrics): number {
  if (m.views <= 0) return 0;
  return (m.likes + m.comments + m.shares + m.saves) / m.views;
}

/** Persist one platform snapshot for a post. */
export function saveMetrics(postId: number, platform: string, m: Metrics, raw: unknown, followers = 0): void {
  const db = getDb();
  db.insert(analytics)
    .values({
      postId,
      platform,
      views: m.views,
      likes: m.likes,
      comments: m.comments,
      shares: m.shares,
      saves: m.saves,
      engagementRate: engagementRate(m),
      followers,
      raw,
    })
    .run();
}

/** Best-effort extraction of metrics from Upload-Post's per-platform payloads. */
export function extractMetrics(obj: unknown): Metrics {
  const o = (obj ?? {}) as Record<string, unknown>;
  const num = (...keys: string[]): number => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string" && v !== "" && Number.isFinite(Number(v))) return Number(v);
    }
    return 0;
  };
  return {
    views: num("views", "impressions", "view_count", "play_count"),
    likes: num("likes", "like_count", "digg_count"),
    comments: num("comments", "comment_count"),
    shares: num("shares", "share_count"),
    saves: num("saves", "save_count", "favorites"),
  };
}
