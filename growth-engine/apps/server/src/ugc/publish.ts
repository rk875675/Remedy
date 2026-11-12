import fs from "node:fs";
import path from "node:path";
import { getDb, ugcVideos } from "@remedy-growth/db";
import { and, eq, lte } from "drizzle-orm";
import { OUTPUT_DIR, r2Configured, type Platform } from "../config.js";
import { downloadBuffer } from "../publish/r2.js";
import {
  accountsFor,
  publisherReady,
  uploadVideoFile,
  zernioConfigured,
  type ZernioKeySlot,
} from "../publish/zernio.js";
import { publishEveryAccount, uploadPerSlot, type PlatformPosts } from "../publish/index.js";
import { withShortsIfNeeded } from "./caption.js";
import { creatorById } from "./store.js";

const UGC_PLATFORMS: Platform[] = ["tiktok", "instagram", "facebook", "youtube"];

function ugcTargets(): Platform[] {
  return UGC_PLATFORMS.filter((p) => publisherReady(p));
}

async function ensureLocalFile(video: typeof ugcVideos.$inferSelect): Promise<string> {
  if (video.filePath && fs.existsSync(video.filePath)) return video.filePath;
  if (!r2Configured()) throw new Error("UGC video file is not on this machine and R2 is not configured.");
  const buf = await downloadBuffer(video.r2Key);
  if (!buf) throw new Error("UGC video is missing from R2.");
  const ext = path.extname(video.r2Key) || ".mp4";
  const dest = path.join(OUTPUT_DIR, "ugc", `${video.uuid}${ext}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  getDb().update(ugcVideos).set({ filePath: dest }).where(eq(ugcVideos.id, video.id)).run();
  return dest;
}

export async function publishUgcVideo(uuid: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const video = db.select().from(ugcVideos).where(eq(ugcVideos.uuid, uuid)).get();
  if (!video) return { ok: false, error: "UGC video not found" };
  if (video.status === "published") return { ok: false, error: "Already published" };
  if (!zernioConfigured()) return { ok: false, error: "Set ZERNIO_API_KEY in growth-engine/.env to post UGC." };

  const targets = ugcTargets();
  if (targets.length === 0) {
    return { ok: false, error: "No Zernio TikTok / Instagram / Facebook / YouTube account connected." };
  }

  let filePath: string;
  try {
    filePath = await ensureLocalFile(video);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.update(ugcVideos).set({ status: "failed", error: message }).where(eq(ugcVideos.id, video.id)).run();
    return { ok: false, error: message };
  }

  let mediaBySlot: Map<ZernioKeySlot, string[]>;
  let uploadErrors: Map<ZernioKeySlot, string>;
  try {
    const slots = [...new Set(targets.flatMap((p) => accountsFor(p).map((a) => a.keySlot)))];
    const uploaded = await uploadPerSlot(slots, (slot) => uploadVideoFile(filePath, slot).then((url) => [url]));
    mediaBySlot = uploaded.urls;
    uploadErrors = uploaded.errors;
    if (mediaBySlot.size === 0) throw new Error([...uploadErrors.values()][0] ?? "Zernio video upload failed");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    db.update(ugcVideos).set({ status: "failed", error: message }).where(eq(ugcVideos.id, video.id)).run();
    return { ok: false, error: message };
  }

  const title = withShortsIfNeeded(video.title, video.durationSec, 100);
  const caption = withShortsIfNeeded(video.caption, video.durationSec, 10_000);
  const results: PlatformPosts = {};

  for (const platform of targets) {
    results[platform] = await publishEveryAccount({
      platform,
      postId: video.id,
      title,
      caption,
      mediaBySlot,
      uploadErrors,
      mediaKind: "video",
      mode: "live",
      scheduledAt: video.scheduledAt,
      kind: "ugc",
      idempotencyPrefix: `remedy-ugc-${video.uuid}`,
    });
  }

  const anySuccess = Object.values(results).some((r) => r.status !== "failed");
  const errors = Object.entries(results)
    .filter(([, r]) => r.status === "failed")
    .map(([p, r]) => `${p}: ${r.error}`)
    .join(" | ");
  db.update(ugcVideos)
    .set({
      status: anySuccess ? "published" : "failed",
      publishedAt: anySuccess ? new Date().toISOString() : null,
      platformPosts: results,
      error: errors || null,
    })
    .where(eq(ugcVideos.id, video.id))
    .run();
  const creator = creatorById(video.creatorId);
  console.log(`UGC ${video.uuid} (${creator?.slug ?? "?"}) published: ${anySuccess ? "ok" : errors}`);
  return { ok: anySuccess, error: errors || undefined };
}

export async function publishDueUgc(): Promise<number> {
  const db = getDb();
  const due = db
    .select()
    .from(ugcVideos)
    .where(and(eq(ugcVideos.status, "scheduled"), lte(ugcVideos.scheduledAt, new Date().toISOString())))
    .all();
  let n = 0;
  for (const video of due) {
    const result = await publishUgcVideo(video.uuid);
    if (result.ok) n++;
  }
  return n;
}
