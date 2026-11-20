import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, posts, slides } from "@remedy-growth/db";
import { parseVariation } from "../generation/variations.js";
import { renderSlideshowShort, youtubeMusicCredit, type ShortBed } from "../generation/short.js";
import {
  fetchZernioPost,
  replaceZernioPost,
  uploadSlideImages,
  uploadVideoFile,
  type ZernioKeySlot,
} from "./zernio.js";
import { zernioRefs, type PlatformPosts } from "./index.js";
import type { Platform } from "../config.js";

interface RemotePost {
  title?: string;
  content?: string;
  scheduledFor?: string | null;
  status?: string;
}

function slidePaths(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((name) => /^slide-\d+\.jpg$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0]) - Number(b.match(/\d+/)?.[0]))
    .map((name) => path.join(dir, name));
}

function withMusicCredit(content: string, bed: ShortBed): string {
  const credit = youtubeMusicCredit(bed);
  if (!credit) return content;
  const stripped = content.replace(/\n*Music:[\s\S]*$/, "").trim();
  return stripped.includes(credit) ? stripped : `${stripped}\n\n${credit}`;
}

/**
 * Swap the images on an already-scheduled Zernio post. Keeps the time,
 * title, and caption. YouTube gets a new Short rendered from the same slides.
 */
export async function reskinScheduledPost(
  postId: number,
  dir: string,
  opts: { characterId?: string; updateSlides?: boolean } = {},
): Promise<number> {
  const files = slidePaths(dir);
  if (files.length < 2) throw new Error(`No slide-N.jpg files in ${dir}`);
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) throw new Error(`Post ${postId} not found`);
  const pp = (post.platformPosts ?? {}) as PlatformPosts;

  const shortPath = path.join(dir, "short.mp4");
  const rendered = await renderSlideshowShort(files, shortPath, postId, parseVariation(post.variation).shortBed);
  console.log(`#${postId} short: ${rendered.bed.title}`);

  let swapped = 0;
  for (const [platform, rec] of Object.entries(pp) as [Platform, PlatformPosts[Platform]][]) {
    if (!rec) continue;
    for (const ref of zernioRefs(rec)) {
      const remote = (await fetchZernioPost(ref.publishId, ref.keySlot)) as RemotePost;
      if ((remote.status ?? "").toLowerCase() === "published") {
        console.warn(`#${postId} ${platform} already live — skipped`);
        continue;
      }
      if (!remote.scheduledFor) {
        console.warn(`#${postId} ${platform} has no scheduled time — skipped`);
        continue;
      }
      const video = platform === "youtube";
      const urls = video
        ? [await uploadVideoFile(shortPath, ref.keySlot)]
        : await uploadSlideImages(files, ref.keySlot);
      await replaceZernioPost(ref.publishId, ref.keySlot as ZernioKeySlot, {
        title: remote.title ?? post.tiktokTitle,
        content: video ? withMusicCredit(remote.content ?? "", rendered.bed) : (remote.content ?? ""),
        mediaItems: urls.map((url) => ({ type: video ? "video" : "image", url })),
        scheduledFor: remote.scheduledFor,
      });
      swapped++;
      console.log(`#${postId} ${platform} @${rec.accountHandle ?? ref.keySlot} media replaced (${urls.length})`);
    }
  }

  if (opts.characterId) {
    const variation = parseVariation(post.variation);
    db.update(posts)
      .set({ variation: { ...variation, characterId: opts.characterId, shortBed: rendered.bed.id } })
      .where(eq(posts.id, postId))
      .run();
  }
  const meta = path.join(dir, "slides.json");
  if (opts.updateSlides !== false && fs.existsSync(meta)) {
    const rows = JSON.parse(fs.readFileSync(meta, "utf8")) as Array<{ kind: string; headline: string; sub?: string; screenshot?: string | null }>;
    db.delete(slides).where(eq(slides.postId, postId)).run();
    rows.forEach((row, idx) => {
      db.insert(slides)
        .values({
          postId,
          idx,
          kind: row.kind,
          headline: row.headline,
          sub: row.sub ?? "",
          screenshot: row.screenshot ?? null,
          filePath: files[idx] ?? files[0]!,
        })
        .run();
    });
  }
  return swapped;
}
