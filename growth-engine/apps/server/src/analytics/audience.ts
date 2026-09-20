/**
 * Channel audience (follower) history.
 *
 * BrightBean is the source. Each pull writes a snapshot per connected
 * account. A post freezes `followersAtPublish` on its first measurement
 * so later growth cannot make early posts look like duds.
 */

import { getDb, settings, accountSnapshots, posts } from "@remedy-growth/db";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { brightbeanConfigured, fetchAccountAnalytics, loadBrightbeanCache } from "../publish/brightbean.js";
import { configuredPlatforms } from "../config.js";

const AUDIENCE_KEY = "audience";

const AudienceRowSchema = z
  .object({
    platform: z.string(),
    accountId: z.string().optional().default(""),
    followers: z.number().int().nonnegative(),
    followerDelta: z.number().nullable().optional().default(null),
    views: z.number().int().nonnegative().optional().default(0),
    available: z.boolean().optional().default(true),
    unavailableReason: z.string().nullable().optional().default(null),
    fetchedAt: z.string(),
  })
  .strict();

const AudienceCacheSchema = z
  .object({
    platforms: z.array(AudienceRowSchema),
    refreshedAt: z.string(),
  })
  .strict();

export type AudienceRow = z.infer<typeof AudienceRowSchema>;
export type AudienceCache = z.infer<typeof AudienceCacheSchema>;

export function loadAudience(): AudienceCache | null {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, AUDIENCE_KEY)).get();
  if (!row) return null;
  const parsed = AudienceCacheSchema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

function writeAudience(cache: AudienceCache): void {
  const db = getDb();
  db.insert(settings)
    .values({ key: AUDIENCE_KEY, value: cache })
    .onConflictDoUpdate({ target: settings.key, set: { value: cache, updatedAt: new Date().toISOString() } })
    .run();
}

/** Latest known follower count for a mapped platform (tiktok / instagram / facebook). */
export function latestFollowers(platform: string): number {
  const cache = loadAudience();
  const row = cache?.platforms.find((p) => p.platform === platform);
  if (row && row.followers > 0) return row.followers;
  const db = getDb();
  const snap = db
    .select()
    .from(accountSnapshots)
    .where(eq(accountSnapshots.platform, platform))
    .orderBy(desc(accountSnapshots.fetchedAt))
    .get();
  return snap?.followers ?? 0;
}

/** Primary-platform followers for a post (TikTok first, then the largest known). */
export function followersForPlatforms(platforms: string[]): number {
  const preferred = ["tiktok", "instagram", "facebook", "youtube"];
  for (const p of preferred) {
    if (platforms.includes(p)) {
      const n = latestFollowers(p);
      if (n > 0) return n;
    }
  }
  return Math.max(0, ...platforms.map((p) => latestFollowers(p)));
}

/**
 * Freeze publish-era followers on first measurement. Later pulls reuse the
 * frozen value so a 40-follower post is never judged against a 4,000-follower era.
 */
export function freezeFollowersAtPublish(postId: number, currentFollowers: number): number {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) return currentFollowers;
  if (post.followersAtPublish > 0) return post.followersAtPublish;
  if (currentFollowers <= 0) return 0;
  db.update(posts).set({ followersAtPublish: currentFollowers }).where(eq(posts.id, postId)).run();
  return currentFollowers;
}

export async function pullAccountAudience(): Promise<AudienceCache | null> {
  if (!brightbeanConfigured()) return loadAudience();
  const cache = loadBrightbeanCache();
  const platforms = [...new Set([
    ...configuredPlatforms(),
    ...(loadBrightbeanCache()?.accounts.map((a) => a.mapped) ?? []),
  ])];
  const rows: AudienceRow[] = [];
  const db = getDb();

  const bbAccounts = loadBrightbeanCache()?.accounts ?? [];
  for (const platform of platforms) {
    const account =
      bbAccounts.find((a) => a.mapped === platform && a.status === "connected") ??
      bbAccounts.find((a) => a.mapped === platform);
    if (!account) continue;
    try {
      const a = await fetchAccountAnalytics(account.id);
      const fetchedAt = new Date().toISOString();
      const mapped = account.mapped;
      db.insert(accountSnapshots)
        .values({
          platform: mapped,
          accountId: account.id,
          followers: a.followers,
          followerDelta: a.followerDelta,
          views: a.views,
          raw: a.raw,
          fetchedAt,
        })
        .run();
      rows.push({
        platform: mapped,
        accountId: account.id,
        followers: a.followers,
        followerDelta: a.followerDelta,
        views: a.views,
        available: a.available,
        unavailableReason: a.unavailableReason,
        fetchedAt,
      });
    } catch (err) {
      console.warn(
        `BrightBean account analytics failed for ${platform}:`,
        err instanceof Error ? err.message.slice(0, 200) : err,
      );
      const prev = loadAudience()?.platforms.find((p) => p.platform === platform);
      if (prev) rows.push(prev);
    }
  }

  // Keep any cached platforms we didn't refresh this pass.
  const seen = new Set(rows.map((r) => r.platform));
  for (const prev of loadAudience()?.platforms ?? []) {
    if (!seen.has(prev.platform)) rows.push(prev);
  }

  if (rows.length === 0 && cache) {
    console.log("Audience pull: no BrightBean account analytics this pass.");
    return loadAudience();
  }

  const next: AudienceCache = { platforms: rows, refreshedAt: new Date().toISOString() };
  writeAudience(next);
  const parts = rows.map((r) => `${r.platform}:${r.followers || "?"}`).join(", ");
  console.log(`Audience: ${parts || "none"} (BrightBean).`);
  return next;
}
