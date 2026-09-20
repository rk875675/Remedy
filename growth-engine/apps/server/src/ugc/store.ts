import { getDb, ugcAnalytics, ugcCreators, ugcVideos } from "@remedy-growth/db";
import { desc, eq } from "drizzle-orm";
import { env } from "../config.js";
import { parseCreatorMap } from "./role.js";
import { defaultUgcCopy } from "./caption.js";

export function ugcObjectKey(slug: string, uuid: string, ext = "mp4"): string {
  return `growth/ugc/${slug}/${uuid}.${ext}`;
}

export function ensureCreatorsFromEnv(): void {
  const db = getDb();
  const fromEnv = parseCreatorMap(env.UGC_CREATORS);
  const wanted = new Map<string, string>([
    ["sohan", ""],
    ["ai", ""],
  ]);
  for (const c of fromEnv) wanted.set(c.slug, c.email);

  for (const [slug, email] of wanted) {
    const displayName = slug === "sohan" ? "Sohan" : slug === "ai" ? "AI" : slug[0]!.toUpperCase() + slug.slice(1);
    const existing = db.select().from(ugcCreators).where(eq(ugcCreators.slug, slug)).get();
    if (!existing) {
      db.insert(ugcCreators).values({ slug, displayName, email }).run();
    } else if (email && existing.email !== email) {
      db.update(ugcCreators).set({ email }).where(eq(ugcCreators.id, existing.id)).run();
    }
  }
}

export function creatorBySlug(slug: string) {
  ensureCreatorsFromEnv();
  return getDb().select().from(ugcCreators).where(eq(ugcCreators.slug, slug)).get() ?? null;
}

export function creatorById(id: number) {
  return getDb().select().from(ugcCreators).where(eq(ugcCreators.id, id)).get() ?? null;
}

export function videoByUuid(uuid: string) {
  return getDb().select().from(ugcVideos).where(eq(ugcVideos.uuid, uuid)).get() ?? null;
}

export interface UgcVideoPublic {
  id: number;
  uuid: string;
  creatorSlug: string;
  creatorName: string;
  title: string;
  caption: string;
  status: string;
  fileName: string;
  byteSize: number;
  durationSec: number | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  diagnosis: string | null;
  rejectReason: string | null;
  error: string | null;
  createdAt: string;
  fileUrl: string;
  clipTitle?: string;
  folderId?: string | null;
  analytics: Array<{
    platform: string;
    views: number;
    likes: number;
    comments: number;
    shares: number;
    saves: number;
    engagementRate: number;
    fetchedAt: string;
  }>;
  platformPosts: unknown;
}

function latestAnalytics(videoId: number) {
  const rows = getDb()
    .select()
    .from(ugcAnalytics)
    .where(eq(ugcAnalytics.ugcVideoId, videoId))
    .orderBy(desc(ugcAnalytics.fetchedAt))
    .limit(16)
    .all();
  const seen = new Set<string>();
  const latest: typeof rows = [];
  for (const row of rows) {
    if (seen.has(row.platform)) continue;
    seen.add(row.platform);
    latest.push(row);
  }
  return latest;
}

export function toPublicVideo(
  video: typeof ugcVideos.$inferSelect,
  creator: typeof ugcCreators.$inferSelect,
): UgcVideoPublic {
  return {
    id: video.id,
    uuid: video.uuid,
    creatorSlug: creator.slug,
    creatorName: creator.displayName,
    title: video.title,
    caption: video.caption,
    status: video.status,
    fileName: video.fileName,
    byteSize: video.byteSize,
    durationSec: video.durationSec,
    scheduledAt: video.scheduledAt,
    publishedAt: video.publishedAt,
    diagnosis: video.diagnosis,
    rejectReason: video.rejectReason,
    error: video.error,
    createdAt: video.createdAt,
    fileUrl: `/api/ugc/videos/${video.uuid}/file`,
    analytics: latestAnalytics(video.id).map((a) => ({
      platform: a.platform,
      views: a.views,
      likes: a.likes,
      comments: a.comments,
      shares: a.shares,
      saves: a.saves,
      engagementRate: a.engagementRate,
      fetchedAt: a.fetchedAt,
    })),
    platformPosts: video.platformPosts ?? null,
  };
}

export function listUgcSnapshot(): {
  creators: Array<{ slug: string; displayName: string }>;
  videos: UgcVideoPublic[];
  pendingReview: number;
} {
  ensureCreatorsFromEnv();
  const db = getDb();
  const creators = db.select().from(ugcCreators).all();
  const byId = new Map(creators.map((c) => [c.id, c]));
  const videos = db.select().from(ugcVideos).orderBy(desc(ugcVideos.createdAt)).limit(200).all();
  const mapped = videos
    .map((v) => {
      const creator = byId.get(v.creatorId);
      return creator ? toPublicVideo(v, creator) : null;
    })
    .filter((v): v is UgcVideoPublic => v !== null);
  return {
    creators: creators.map((c) => ({ slug: c.slug, displayName: c.displayName })),
    videos: mapped,
    pendingReview: mapped.filter((v) => v.status === "pending_review" || v.status === "uploaded").length,
  };
}

export function insertUploadedVideo(params: {
  uuid: string;
  creatorSlug: string;
  r2Key: string;
  filePath: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  durationSec?: number | null;
  title?: string;
  caption?: string;
}): UgcVideoPublic {
  const creator = creatorBySlug(params.creatorSlug);
  if (!creator) throw new Error(`Unknown UGC creator ${params.creatorSlug}`);
  const existing = videoByUuid(params.uuid);
  if (existing) return toPublicVideo(existing, creator);
  const copy = defaultUgcCopy(params.uuid);
  const db = getDb();
  db.insert(ugcVideos)
    .values({
      uuid: params.uuid,
      creatorId: creator.id,
      r2Key: params.r2Key,
      filePath: params.filePath,
      fileName: params.fileName,
      mimeType: params.mimeType,
      byteSize: params.byteSize,
      durationSec: params.durationSec ?? null,
      title: params.title?.trim() || copy.title,
      caption: params.caption?.trim() || copy.caption,
      status: "pending_review",
    })
    .run();
  const row = videoByUuid(params.uuid);
  if (!row) throw new Error("UGC insert failed");
  return toPublicVideo(row, creator);
}

export function ugcInsightsPayload() {
  const { videos } = listUgcSnapshot();
  const published = videos.filter((v) => v.status === "published" || v.status === "scheduled");
  const totals = videos.map((v) => {
    const views = v.analytics.reduce((n, a) => n + a.views, 0);
    const likes = v.analytics.reduce((n, a) => n + a.likes, 0);
    const comments = v.analytics.reduce((n, a) => n + a.comments, 0);
    const shares = v.analytics.reduce((n, a) => n + a.shares, 0);
    const saves = v.analytics.reduce((n, a) => n + a.saves, 0);
    return { ...v, views, likes, comments, shares, saves, engagement: likes + comments + shares + saves };
  });
  const ranked = [...totals].sort((a, b) => b.views - a.views || b.engagement - a.engagement);
  const whatWorked = ranked.filter((v) => v.views > 0).slice(0, 5);
  const diagnosisCounts = Object.entries(
    videos.reduce<Record<string, number>>((acc, v) => {
      if (v.diagnosis) acc[v.diagnosis] = (acc[v.diagnosis] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([diagnosis, count]) => ({ diagnosis, count }));
  return {
    videos: totals,
    whatWorked,
    diagnosisCounts,
    published: published.length,
    pendingReview: videos.filter((v) => v.status === "pending_review").length,
  };
}
