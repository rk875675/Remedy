import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, posts, slides } from "@remedy-growth/db";
import { OUTPUT_DIR, env, r2Configured } from "../config.js";
import { SLIDE_REV, slideObjectKey, postOutputDir } from "./composer.js";
import { listPrefix, deleteObject } from "../publish/r2.js";
import { shortObjectKey, shortOutputPath } from "./short.js";

/** Keep a short for review, then 48h after it posts. Delete after that — hiding does not free R2. */
export const SHORT_KEEP_AFTER_PUBLISH_MS = 48 * 60 * 60 * 1000;

export function shouldKeepShort(status: string, publishedAt: string | null, now = Date.now()): boolean {
  if (!env.EXPIRE_SHORTS) return true;
  if (status === "queued" || status === "approved") return true;
  if (status === "published" || status === "draft_sent") {
    if (!publishedAt) return false;
    const t = Date.parse(publishedAt);
    return Number.isFinite(t) && now - t < SHORT_KEEP_AFTER_PUBLISH_MS;
  }
  return false;
}

/** Phone kit + Review: keep the Short only for the current unposted queue. */
export function keepShortForReview(postId: number, status: string, completedIds: ReadonlySet<number>): boolean {
  if (completedIds.has(postId)) return false;
  return status === "queued" || status === "approved";
}

export function pruneLocalPostDir(postId: number, keepShort: boolean): string[] {
  const dir = path.join(OUTPUT_DIR, "posts", String(postId));
  if (!fs.existsSync(dir)) return [];
  const keep = new Set<string>();
  if (keepShort) {
    const short = shortOutputPath(dir);
    keep.add(path.normalize(short));
    keep.add(path.normalize(`${short}.meta.json`));
  }
  const rows = getDb().select().from(slides).where(eq(slides.postId, postId)).all();
  for (const row of rows) keep.add(path.normalize(row.filePath));
  const removed: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.normalize(path.join(dir, name));
    const currentSlide = name.startsWith("slide-") && name.includes(`-${SLIDE_REV}.`);
    if (currentSlide || keep.has(abs)) continue;
    try {
      fs.unlinkSync(abs);
      removed.push(name);
    } catch {
      // best-effort
    }
  }
  return removed;
}

/** Drop leftover slide revisions (v3…v15) across every local post folder. */
export function pruneAllLocalOutput(keepShortStatuses?: Set<number>): { posts: number; files: number } {
  const root = path.join(OUTPUT_DIR, "posts");
  if (!fs.existsSync(root)) return { posts: 0, files: 0 };
  let posts = 0;
  let files = 0;
  for (const name of fs.readdirSync(root)) {
    if (!/^\d+$/.test(name)) continue;
    const id = Number(name);
    const keepShort = keepShortStatuses ? keepShortStatuses.has(id) : true;
    const removed = pruneLocalPostDir(id, keepShort);
    if (removed.length) {
      posts++;
      files += removed.length;
    }
  }
  return { posts, files };
}

/** Keep only the current slide rev (+ optional short) on R2 for one post. */
export async function pruneRemotePostMedia(postId: number, keepShort: boolean): Promise<number> {
  const prefix = `growth/posts/${postId}/`;
  const keys = await listPrefix(prefix);
  const keep = new Set<string>();
  for (let i = 0; i < 12; i++) keep.add(slideObjectKey(postId, i));
  if (keepShort) keep.add(shortObjectKey(postId));
  let n = 0;
  for (const key of keys) {
    if (keep.has(key)) continue;
    await deleteObject(key);
    n++;
  }
  return n;
}

/** Delete the Short locally and on R2. Slides stay. */
export async function deleteShortNow(postId: number): Promise<boolean> {
  const local = deleteLocalShort(postId);
  pruneLocalPostDir(postId, false);
  let remote = false;
  if (r2Configured()) {
    try {
      await deleteObject(shortObjectKey(postId));
      remote = true;
    } catch {
      // already gone
    }
  }
  return local || remote;
}

function deleteLocalShort(postId: number): boolean {
  const dir = postOutputDir(postId);
  const short = shortOutputPath(dir);
  let removed = false;
  for (const p of [short, `${short}.meta.json`]) {
    if (!fs.existsSync(p)) continue;
    try {
      fs.unlinkSync(p);
      removed = true;
    } catch {
      // best-effort
    }
  }
  return removed;
}

/**
 * Delete shorts that are no longer needed for review or a 48h post-publish
 * window. Platforms already have the video after publish/draft — we do not
 * keep an extra copy forever.
 */
/** Slideshow shorts only. Never deletes `growth/ugc/` objects. */
export async function expirePostedMedia(now = Date.now()): Promise<{ shorts: number }> {
  if (!env.EXPIRE_SHORTS) return { shorts: 0 };
  const rows = getDb().select({ id: posts.id, status: posts.status, publishedAt: posts.publishedAt }).from(posts).all();
  let shorts = 0;
  for (const row of rows) {
    if (shouldKeepShort(row.status, row.publishedAt, now)) continue;
    if (deleteLocalShort(row.id)) shorts++;
    pruneLocalPostDir(row.id, false);
    if (r2Configured()) {
      await deleteObject(shortObjectKey(row.id)).catch(() => undefined);
      await pruneRemotePostMedia(row.id, false).catch(() => 0);
    }
  }
  return { shorts };
}
