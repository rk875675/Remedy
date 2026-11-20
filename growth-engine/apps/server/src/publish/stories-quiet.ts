/**
 * Stories does not receive engine slideshows or other generated photo posts.
 * Cancels those future Zernio posts on every Stories account.
 * Leaves TikTok @remedy.stories memes, and the Stories Instagram grid (`assets/ig/stories/posted.json`).
 * Instagram @remedy.stories memes are cancelled here too; meme-sync records that in the week plan.
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { getDb, posts, ugcVideos } from "@remedy-growth/db";
import { z } from "zod";
import { IG_DIR } from "../generation/ig-static.js";
import { parseVariation } from "../generation/variations.js";
import { loadMemePlans } from "../memes/week.js";
import {
  accountGroup,
  cancelZernioPost,
  listScheduledPosts,
  loadZernioCache,
  refreshZernioAccounts,
  type ZernioKeySlot,
} from "./zernio.js";

const PostedSchema = z.record(z.string(), z.object({ zernioPostId: z.string() }).passthrough());
const CrossSchema = z.record(
  z.string(),
  z.record(z.string(), z.object({ zernioPostId: z.string() }).passthrough()),
);

/** Curated grid posts that are allowed to stay on Instagram @remedy.stories. */
function curatedKeepIds(): Set<string> {
  const ids = new Set<string>();
  const postedPath = path.join(IG_DIR, "posted.json");
  const crossPath = path.join(IG_DIR, "crossposted.json");
  if (fs.existsSync(postedPath)) {
    const posted = PostedSchema.parse(JSON.parse(fs.readFileSync(postedPath, "utf8")));
    for (const row of Object.values(posted)) ids.add(row.zernioPostId);
  }
  if (fs.existsSync(crossPath)) {
    const cross = CrossSchema.parse(JSON.parse(fs.readFileSync(crossPath, "utf8")));
    for (const row of Object.values(cross)) {
      const ig = row["instagram:remedy.stories"];
      if (ig) ids.add(ig.zernioPostId);
    }
  }
  const storiesPath = path.join(IG_DIR, "stories", "posted.json");
  if (fs.existsSync(storiesPath)) {
    const stories = PostedSchema.parse(JSON.parse(fs.readFileSync(storiesPath, "utf8")));
    for (const row of Object.values(stories)) ids.add(row.zernioPostId);
  }
  return ids;
}

const CopySchema = z.object({ publishId: z.string().optional() }).passthrough();
const PlatformRecordSchema = z.object({ publishId: z.string().optional(), copies: z.array(CopySchema).optional() }).passthrough();
const PlatformMapSchema = z.record(z.string(), PlatformRecordSchema);

function idsIn(raw: unknown): string[] {
  const parsed = PlatformMapSchema.safeParse(raw ?? {});
  if (!parsed.success) return [];
  const ids: string[] = [];
  for (const rec of Object.values(parsed.data)) {
    if (rec.publishId) ids.push(rec.publishId);
    for (const copy of rec.copies ?? []) if (copy.publishId) ids.push(copy.publishId);
  }
  return ids;
}

function accountIdOf(post: { platforms: Array<{ accountId?: string | { _id?: string } }> }): string {
  const acc = post.platforms[0]?.accountId;
  if (typeof acc === "string") return acc;
  return acc?._id ?? "";
}

export async function quietStoriesSlideshows(): Promise<number> {
  await refreshZernioAccounts().catch((err) => console.warn("Zernio refresh failed:", err instanceof Error ? err.message : err));
  const cache = loadZernioCache();
  if (!cache) throw new Error("No Zernio accounts cached");

  const curatedIds = curatedKeepIds();
  const memeIds = new Set<string>();
  for (const plan of loadMemePlans()) {
    for (const day of plan.days) for (const post of day.posts) for (const row of post.scheduled) if (row.zernioPostId) memeIds.add(row.zernioPostId);
  }
  const ugcIds = new Set<string>();
  for (const video of getDb().select().from(ugcVideos).all()) {
    const parsed = PlatformMapSchema.safeParse(video.platformPosts ?? {});
    if (!parsed.success) throw new Error(`UGC ${video.uuid} platformPosts: ${parsed.error.message}`);
    for (const id of idsIn(parsed.data)) ugcIds.add(id);
  }

  const byId = new Map(cache.accounts.map((a) => [a.id, a]));
  let cancelled = 0;
  const seen = new Set<string>();
  for (const slot of [...new Set(cache.accounts.map((a) => a.keySlot))] as ZernioKeySlot[]) {
    let page: Awaited<ReturnType<typeof listScheduledPosts>>;
    try {
      page = await listScheduledPosts(slot);
    } catch (err) {
      console.warn(`Stories quiet: list key ${slot} failed: ${err instanceof Error ? err.message : err}`);
      continue;
    }
    for (const post of page) {
      if (seen.has(post._id)) continue;
      seen.add(post._id);
      const account = byId.get(accountIdOf(post));
      if (!account || accountGroup(account) !== "2") continue;
      if (ugcIds.has(post._id) || curatedIds.has(post._id)) continue;
      if (memeIds.has(post._id) && account.mapped !== "instagram") continue;
      const when = Date.parse(post.scheduledFor ?? "");
      if (Number.isFinite(when) && when < Date.now() + 60_000) continue;
      const status = (post.status ?? "").toLowerCase();
      const child = (post.platforms[0]?.status ?? "").toLowerCase();
      if (status === "published" || child === "published" || post.publishedAt) continue;
      try {
        await cancelZernioPost(post._id, slot);
        cancelled++;
        const kind = memeIds.has(post._id) ? "meme" : "slideshow";
        console.log(`cancelled ${kind} ${account.mapped}:${account.handle} ${post.scheduledFor ?? ""} ${post._id}`);
      } catch (err) {
        console.warn(`cancel failed ${post._id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  const db = getDb();
  for (const post of db.select().from(posts).all()) {
    if (parseVariation(post.variation).zernioSlot !== "2" || post.status === "published") continue;
    const platforms = (post.platforms ?? []) as string[];
    if (!post.scheduledAt && platforms.length === 0) continue;
    db.update(posts).set({ scheduledAt: null, platforms: [] }).where(eq(posts.id, post.id)).run();
  }
  return cancelled;
}
