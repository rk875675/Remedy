import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, settings } from "@remedy-growth/db";
import { env, platformConfigured, type Platform } from "../config.js";

/**
 * Zernio (https://zernio.com) is the publisher for TikTok / Instagram / Facebook /
 * YouTube. API keys live ONLY in ZERNIO_API_KEY / ZERNIO_API_KEY_2 / ZERNIO_API_KEY_3 / ZERNIO_API_KEY_4
 * (growth-engine/.env, gitignored). One key per Zernio login. Keys are never stored
 * in the database, never returned by an API route, and are redacted from every error.
 */

const ACCOUNTS_KEY = "zernio_accounts";

export type CarouselPlatform = Platform;

// ---------- schemas (strict where we own the shape, passthrough for the API) ----------

const ApiAccountSchema = z
  .object({
    _id: z.string(),
    platform: z.string(),
    username: z.string().optional().default(""),
    displayName: z.string().optional().default(""),
    isActive: z.boolean().optional().default(true),
    enabled: z.boolean().optional().default(true),
    needsReconnection: z.boolean().optional().default(false),
    platformStatus: z.string().optional().default("active"),
    followersCount: z.number().nullable().optional(),
    profileId: z.union([z.string(), z.object({ _id: z.string(), name: z.string().optional() }).passthrough()]).optional(),
  })
  .passthrough();

const AccountsResponseSchema = z.object({ accounts: z.array(ApiAccountSchema).default([]) }).passthrough();

const CachedAccountSchema = z
  .object({
    id: z.string(),
    platform: z.string(),
    mapped: z.enum(["tiktok", "instagram", "facebook", "youtube"]),
    name: z.string(),
    handle: z.string(),
    status: z.string(),
    profileId: z.string(),
    /** Which env key owns this account: ZERNIO_API_KEY is "1". The key itself is never stored. */
    keySlot: z.enum(["1", "2", "3", "4"]).default("1"),
  })
  .strict();

const CachedAccountsSchema = z
  .object({
    accounts: z.array(CachedAccountSchema),
    refreshedAt: z.string(),
    keyNotes: z.array(z.object({ slot: z.enum(["1", "2", "3", "4"]), error: z.string() }).strict()).default([]),
  })
  .strict();

const PlatformChildSchema = z
  .object({
    platform: z.string().optional(),
    accountId: z.union([z.string(), z.object({ _id: z.string() }).passthrough()]).optional(),
    status: z.string().optional(),
    platformPostId: z.string().nullable().optional(),
    platformPostUrl: z.string().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
  })
  .passthrough();

const PostSchema = z
  .object({
    _id: z.string(),
    status: z.string().optional().default(""),
    scheduledFor: z.string().nullable().optional(),
    publishedAt: z.string().nullable().optional(),
    platforms: z.array(PlatformChildSchema).optional().default([]),
  })
  .passthrough();

const PostEnvelopeSchema = z.object({ post: PostSchema }).passthrough();

const PresignSchema = z.object({ uploadUrl: z.string().url(), publicUrl: z.string().url() }).passthrough();

const AnalyticsBlockSchema = z
  .object({
    impressions: z.number().optional().default(0),
    reach: z.number().optional().default(0),
    likes: z.number().optional().default(0),
    comments: z.number().optional().default(0),
    shares: z.number().optional().default(0),
    saves: z.number().optional().default(0),
    views: z.number().optional().default(0),
  })
  .passthrough();

const PostAnalyticsSchema = z
  .object({
    status: z.string().optional().default(""),
    analytics: AnalyticsBlockSchema.optional(),
    platformAnalytics: z.array(z.object({ analytics: AnalyticsBlockSchema.optional() }).passthrough()).optional().default([]),
  })
  .passthrough();

const FollowerStatsSchema = z
  .object({
    accounts: z
      .array(
        z
          .object({
            _id: z.string(),
            currentFollowers: z.number().nullable().optional(),
            growth: z.number().nullable().optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export type ZernioAccount = z.infer<typeof CachedAccountSchema>;
export type ZernioCache = z.infer<typeof CachedAccountsSchema>;
export type ZernioKeySlot = ZernioAccount["keySlot"];

// ---------- config / settings cache ----------

/** Configured logins only. Slot "1" is ZERNIO_API_KEY. The key string never leaves this module. */
export function zernioKeys(): { slot: ZernioKeySlot; key: string }[] {
  const raw: Array<[ZernioKeySlot, string]> = [
    ["1", env.ZERNIO_API_KEY],
    ["2", env.ZERNIO_API_KEY_2],
    ["3", env.ZERNIO_API_KEY_3],
    ["4", env.ZERNIO_API_KEY_4],
  ];
  return raw.flatMap(([slot, value]) => {
    const key = value.trim();
    return key ? [{ slot, key }] : [];
  });
}

export function getZernioKey(): string {
  return zernioKeys()[0]?.key ?? "";
}

export function zernioConfigured(): boolean {
  return zernioKeys().length > 0;
}

function keyForSlot(slot?: ZernioKeySlot): string {
  const keys = zernioKeys();
  if (!slot) {
    const key = keys[0]?.key ?? "";
    if (!key) throw new Error("Zernio is not configured — set ZERNIO_API_KEY in growth-engine/.env.");
    return key;
  }
  const found = keys.find((k) => k.slot === slot);
  if (!found) throw new Error(`Zernio key slot ${slot} is empty. Set ZERNIO_API_KEY${slot === "1" ? "" : `_${slot}`} in growth-engine/.env.`);
  return found.key;
}

function baseUrl(): string {
  return env.ZERNIO_BASE_URL.replace(/\/$/, "");
}

function readCache(): ZernioCache | null {
  const row = getDb().select().from(settings).where(eq(settings.key, ACCOUNTS_KEY)).get();
  if (!row) return null;
  const parsed = CachedAccountsSchema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

function writeCache(value: ZernioCache): void {
  getDb()
    .insert(settings)
    .values({ key: ACCOUNTS_KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date().toISOString() } })
    .run();
}

export function loadZernioCache(): ZernioCache | null {
  return readCache();
}

export function mapZernioPlatform(raw: string): ZernioAccount["mapped"] | null {
  const p = raw.toLowerCase();
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("instagram")) return "instagram";
  if (p.includes("facebook") || p === "fb") return "facebook";
  if (p.includes("youtube")) return "youtube";
  return null;
}

function isConnected(a: ZernioAccount): boolean {
  return a.status === "connected";
}

/** True for a `ZERNIO_CURATED` account: posted by hand, never by the engine. */
export function isCuratedAccount(a: { mapped: string; handle: string }): boolean {
  const key = `${a.mapped}:${a.handle.trim().toLowerCase()}`;
  return env.ZERNIO_CURATED.split(",").some((s) => s.trim().toLowerCase() === key);
}

/**
 * Connected accounts the engine may publish to, one per handle. A handle linked
 * on two logins (Instagram on key 4 is the same @remedyrecoveries as key 1) keeps
 * the earlier key so the later login can be Facebook-only. Curated accounts are left out.
 */
export function accountsFor(platform: CarouselPlatform): ZernioAccount[] {
  const cache = readCache();
  if (!cache) return [];
  const seen = new Set<string>();
  const accounts = cache.accounts
    .filter((a) => a.mapped === platform && isConnected(a) && !isCuratedAccount(a))
    .sort((a, b) => a.keySlot.localeCompare(b.keySlot));
  return accounts.filter((a) => {
    const handle = a.handle.trim().toLowerCase();
    if (seen.has(handle)) return false;
    seen.add(handle);
    return true;
  });
}

export type AccountGroup = "1" | "2";

/**
 * "2" when the handle is the second brand (default: contains "stories").
 * Key slot is not the brand — one brand can sit on more than one Zernio login.
 */
export function accountGroup(account: { handle: string }): AccountGroup {
  const needle = env.ZERNIO_SECOND_HANDLE.trim().toLowerCase();
  if (!needle) return "1";
  return account.handle.toLowerCase().includes(needle) ? "2" : "1";
}

/** Primary account for a platform: first connected, else first known. */
export function accountFor(platform: CarouselPlatform): ZernioAccount | null {
  const cache = readCache();
  if (!cache) return null;
  return (
    cache.accounts.find((a) => a.mapped === platform && isConnected(a)) ??
    cache.accounts.find((a) => a.mapped === platform) ??
    null
  );
}

/** True when Zernio can publish this platform, or native keys are set. */
export function publisherReady(p: Platform): boolean {
  if (zernioConfigured()) {
    const cache = readCache();
    if (!cache) return true;
    return cache.accounts.some((a) => a.mapped === p);
  }
  return platformConfigured(p);
}

export function zernioPublicStatus(): {
  configured: boolean;
  connected: boolean;
  accounts: Array<ZernioAccount & { group: AccountGroup }>;
  youtubeConnected: boolean;
  refreshedAt: string | null;
  publisher: "zernio" | "native";
  keyCount: number;
  keys: Array<{ slot: ZernioKeySlot; configured: boolean; accounts: number; error: string | null }>;
  secondHandle: string;
} {
  const cache = readCache();
  const configured = zernioConfigured();
  const keys = (["1", "2", "3", "4"] as const).map((slot) => {
    const on = zernioKeys().some((k) => k.slot === slot);
    const accounts = cache?.accounts.filter((a) => a.keySlot === slot).length ?? 0;
    const error = cache?.keyNotes.find((n) => n.slot === slot)?.error ?? null;
    return { slot, configured: on, accounts, error };
  });
  return {
    configured,
    connected: Boolean(configured && cache?.accounts.some(isConnected)),
    accounts: (cache?.accounts ?? []).map((a) => ({ ...a, group: accountGroup(a) })),
    youtubeConnected: Boolean(cache?.accounts.some((a) => a.mapped === "youtube" && isConnected(a))),
    refreshedAt: cache?.refreshedAt ?? null,
    publisher: configured ? "zernio" : "native",
    keyCount: zernioKeys().length,
    keys,
    secondHandle: env.ZERNIO_SECOND_HANDLE.trim(),
  };
}

// ---------- HTTP ----------

function redactSecrets(text: string): string {
  return text.replace(/sk_[A-Za-z0-9_-]{16,}/g, "sk_[redacted]");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function zFetch(pathname: string, init: RequestInit = {}, slot?: ZernioKeySlot): Promise<Response> {
  const key = keyForSlot(slot);
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${key}`);
  if (init.body && typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const url = `${baseUrl()}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  let res = await fetch(url, { ...init, headers });
  // Free tier is 60 req/min; back off on 429 and retry a couple of times.
  for (let attempt = 1; res.status === 429 && attempt <= 3; attempt++) {
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep((Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 5 * attempt) * 1000);
    res = await fetch(url, { ...init, headers });
  }
  return res;
}

async function zJson<T>(
  pathname: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  init: RequestInit = {},
  okStatuses: number[] = [200, 201],
  slot?: ZernioKeySlot,
): Promise<T> {
  const res = await zFetch(pathname, init, slot);
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  if (!okStatuses.includes(res.status)) {
    throw new Error(redactSecrets(`Zernio ${pathname} failed (${res.status}): ${text.slice(0, 400)}`));
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(redactSecrets(`Zernio ${pathname} returned an unexpected shape: ${parsed.error.message.slice(0, 200)}`));
  }
  return parsed.data;
}

// ---------- accounts ----------

export async function refreshZernioAccounts(): Promise<ZernioCache> {
  const keys = zernioKeys();
  if (keys.length === 0) throw new Error("Zernio is not configured — set ZERNIO_API_KEY in growth-engine/.env.");
  const accounts: ZernioAccount[] = [];
  const keyNotes: ZernioCache["keyNotes"] = [];
  for (const { slot } of keys) {
    try {
      const data = await zJson("/accounts", AccountsResponseSchema, {}, [200], slot);
      for (const a of data.accounts) {
        const mapped = mapZernioPlatform(a.platform);
        if (!mapped) continue;
        const healthy = a.isActive && a.enabled && !a.needsReconnection && a.platformStatus === "active";
        accounts.push({
          id: a._id,
          platform: a.platform,
          mapped,
          name: a.displayName || a.username || a.platform,
          handle: a.username,
          status: healthy ? "connected" : a.needsReconnection ? "needs_reconnection" : a.platformStatus || "inactive",
          profileId: typeof a.profileId === "string" ? a.profileId : (a.profileId?._id ?? ""),
          keySlot: slot,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      keyNotes.push({ slot, error: message.slice(0, 300) });
    }
  }
  if (accounts.length === 0 && keyNotes.length > 0) {
    throw new Error(keyNotes.map((n) => `key ${n.slot}: ${n.error}`).join(" | "));
  }
  const cache: ZernioCache = { accounts, refreshedAt: new Date().toISOString(), keyNotes };
  writeCache(cache);
  return cache;
}

// ---------- media ----------

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  return "image/jpeg";
}

/** Upload a local file to that login's media store; returns a public HTTPS URL for posts. */
export async function uploadMediaFile(filePath: string, slot?: ZernioKeySlot): Promise<string> {
  const contentType = mimeFor(filePath);
  const presign = await zJson(
    "/media/presign",
    PresignSchema,
    { method: "POST", body: JSON.stringify({ filename: path.basename(filePath), contentType }) },
    [200, 201],
    slot,
  );
  const buf = await fs.readFile(filePath);
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const put = await fetch(presign.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: new Uint8Array(buf),
    });
    if (put.ok) return presign.publicUrl;
    lastErr = `${put.status} ${(await put.text()).slice(0, 160)}`;
    await sleep(800 * attempt);
  }
  throw new Error(redactSecrets(`Zernio media upload failed: ${lastErr}`));
}

export async function uploadSlideImages(slidePaths: string[], slot?: ZernioKeySlot): Promise<string[]> {
  const urls: string[] = [];
  for (const p of slidePaths) urls.push(await uploadMediaFile(p, slot));
  return urls;
}

export async function uploadVideoFile(filePath: string, slot?: ZernioKeySlot): Promise<string> {
  return uploadMediaFile(filePath, slot);
}

// ---------- publish ----------

export interface ZernioPublishResult {
  zernioPostId: string;
  status: "draft_sent" | "pending" | "published" | "failed";
  platformPostId?: string;
  error?: string;
  keySlot: ZernioKeySlot;
  accountId: string;
  handle: string;
}

function mapChildStatus(status: string, mode: "drafts" | "live"): ZernioPublishResult["status"] {
  const s = status.toLowerCase();
  if (s === "failed") return "failed";
  if (s === "published") return "published";
  if (s === "scheduled" || s === "publishing" || s === "pending") return mode === "drafts" ? "draft_sent" : "pending";
  if (mode === "drafts") return "draft_sent";
  return "pending";
}

const CONTENT_LIMITS: Record<Platform, number> = {
  tiktok: 2000,
  instagram: 2200,
  facebook: 60_000,
  youtube: 5000,
};

export async function publishToAccount(params: {
  platform: CarouselPlatform;
  /** Explicit account; defaults to the primary account for the platform. */
  accountId?: string;
  title: string;
  caption: string;
  mediaUrls: string[];
  mediaKind: "images" | "video";
  mode: "drafts" | "live";
  scheduledAt: string | null;
  idempotencyKey: string;
  /** YouTube only: posted and pinned as the first comment. */
  firstComment?: string;
}): Promise<ZernioPublishResult> {
  const account = params.accountId
    ? (readCache()?.accounts.find((a) => a.id === params.accountId) ?? null)
    : accountFor(params.platform);
  if (!account) throw new Error(`No Zernio ${params.platform} account connected.`);
  if (account.status !== "connected") {
    throw new Error(`Zernio ${params.platform} account @${account.handle} is ${account.status} — reconnect it in the Zernio dashboard.`);
  }

  const body: Record<string, unknown> = {
    content: params.caption.slice(0, CONTENT_LIMITS[params.platform]),
    title: params.title.slice(0, params.platform === "youtube" ? 100 : 255),
    mediaItems: params.mediaUrls.map((url) => ({ type: params.mediaKind === "video" ? "video" : "image", url })),
    platforms: [
      {
        platform: params.platform,
        accountId: account.id,
        ...(params.platform === "youtube" && params.firstComment ? { platformSpecificData: { firstComment: params.firstComment } } : {}),
      },
    ],
  };

  if (params.platform === "tiktok") {
    body.tiktokSettings = {
      privacy_level: "PUBLIC_TO_EVERYONE",
      allow_comment: true,
      allow_duet: params.mediaKind === "video",
      allow_stitch: params.mediaKind === "video",
      commercial_content_type: "none",
      content_preview_confirmed: true,
      express_consent_given: true,
      media_type: params.mediaKind === "video" ? "video" : "photo",
      ...(params.mediaKind === "images" ? { auto_add_music: true } : {}),
    };
  }
  if (params.platform === "youtube") body.visibility = "public";

  if (params.mode === "drafts") {
    body.isDraft = true;
  } else if (params.scheduledAt && Date.parse(params.scheduledAt) > Date.now() + 60_000) {
    body.scheduledFor = new Date(params.scheduledAt).toISOString();
  } else {
    body.publishNow = true;
  }

  // 207 = created but a platform rejected it; the failure is in platforms[].errorMessage.
  const created = await zJson(
    "/posts",
    PostEnvelopeSchema,
    { method: "POST", body: JSON.stringify(body), headers: { "Idempotency-Key": params.idempotencyKey.slice(0, 255) } },
    [200, 201, 207],
    account.keySlot,
  );
  const post = created.post;
  const child = post.platforms[0];
  const status = mapChildStatus(child?.status ?? post.status, params.mode);
  const error = child?.errorMessage ?? undefined;
  return {
    zernioPostId: post._id,
    status,
    platformPostId: child?.platformPostId ? String(child.platformPostId) : undefined,
    error: status === "failed" ? (error ?? "Zernio reported failure with no message") : undefined,
    keySlot: account.keySlot,
    accountId: account.id,
    handle: account.handle,
  };
}

const ZERNIO_ID_RE = /^[0-9a-f]{24}$/i;

/** Zernio post ids are 24-char hex ObjectIds — skip leftover native TikTok/inbox ids. */
export function isZernioPostId(id: string | undefined): id is string {
  return Boolean(id && ZERNIO_ID_RE.test(id));
}

export async function fetchZernioPost(zernioPostId: string, slot?: ZernioKeySlot) {
  const res = await zJson(`/posts/${zernioPostId}`, PostEnvelopeSchema, {}, [200], slot);
  return res.post;
}

const ScheduledPageSchema = z
  .object({
    posts: z.array(PostSchema).default([]),
    pagination: z.object({ pages: z.number().optional() }).passthrough().optional(),
  })
  .passthrough();

/** Scheduled posts on one Zernio login, newest pages first until the list ends. */
export async function listScheduledPosts(slot: ZernioKeySlot): Promise<Array<z.infer<typeof PostSchema>>> {
  const out: Array<z.infer<typeof PostSchema>> = [];
  for (let page = 1; page <= 20; page++) {
    const data = await zJson(`/posts?status=scheduled&limit=100&page=${page}`, ScheduledPageSchema, {}, [200], slot);
    out.push(...data.posts);
    if (page >= (data.pagination?.pages ?? 1) || data.posts.length === 0) break;
  }
  return out;
}

/** Replace copy and media on a scheduled post without changing its time. */
export async function replaceZernioPost(
  zernioPostId: string,
  slot: ZernioKeySlot,
  body: {
    title: string;
    content: string;
    mediaItems: Array<{ type: "image" | "video"; url: string }>;
    scheduledFor: string;
  },
): Promise<void> {
  const res = await zFetch(`/posts/${zernioPostId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }, slot);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(redactSecrets(`Zernio update post failed (${res.status}): ${text.slice(0, 300)}`));
  }
}

/** Change the title on a scheduled post. Sends only the title so the media stays. */
export async function updateZernioTitle(zernioPostId: string, title: string, slot?: ZernioKeySlot) {
  return zJson(`/posts/${zernioPostId}`, PostEnvelopeSchema, {
    method: "PUT",
    body: JSON.stringify({ title: title.slice(0, 100) }),
  }, [200], slot);
}

/** Re-time a scheduled post. Uses the login that created it. */
export async function updateZernioScheduledAt(zernioPostId: string, scheduledAt: string, slot?: ZernioKeySlot) {
  return zJson(`/posts/${zernioPostId}`, PostEnvelopeSchema, {
    method: "PUT",
    body: JSON.stringify({ scheduledFor: new Date(scheduledAt).toISOString() }),
  }, [200], slot);
}

/** Delete a not-yet-published post so it will not go live. */
export async function cancelZernioPost(zernioPostId: string, slot?: ZernioKeySlot): Promise<void> {
  const res = await zFetch(`/posts/${zernioPostId}`, { method: "DELETE" }, slot);
  if (!res.ok && res.status !== 404) {
    throw new Error(redactSecrets(`Zernio delete post failed (${res.status}): ${(await res.text()).slice(0, 200)}`));
  }
}

// ---------- analytics ----------

export interface ZernioMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

/** Null while Zernio is still syncing (202) or the post failed everywhere (424). */
export async function fetchPostAnalytics(zernioPostId: string, slot?: ZernioKeySlot): Promise<ZernioMetrics | null> {
  const res = await zFetch(`/analytics?postId=${encodeURIComponent(zernioPostId)}`, {}, slot);
  if (res.status === 202 || res.status === 424) return null;
  const text = await res.text();
  if (!res.ok) throw new Error(redactSecrets(`Zernio analytics failed (${res.status}): ${text.slice(0, 300)}`));
  const parsed = PostAnalyticsSchema.safeParse(text ? JSON.parse(text) : {});
  if (!parsed.success) throw new Error(redactSecrets(`Zernio analytics shape: ${parsed.error.message.slice(0, 200)}`));
  const a = parsed.data.analytics ?? parsed.data.platformAnalytics.find((p) => p.analytics)?.analytics;
  if (!a) return null;
  return {
    views: a.views || a.impressions || a.reach,
    likes: a.likes,
    comments: a.comments,
    shares: a.shares,
    saves: a.saves,
  };
}

export interface ZernioAccountAnalytics {
  platform: string;
  accountId: string;
  followers: number;
  followerDelta: number | null;
  views: number;
  available: boolean;
  unavailableReason: string | null;
  raw: unknown;
}

/** Channel-level follower count — the era denominator for learning. */
export async function fetchAccountAnalytics(accountId: string, slot?: ZernioKeySlot): Promise<ZernioAccountAnalytics> {
  const keySlot = slot ?? readCache()?.accounts.find((a) => a.id === accountId)?.keySlot;
  const data = await zJson(`/accounts/follower-stats?accountIds=${encodeURIComponent(accountId)}`, FollowerStatsSchema, {}, [200], keySlot);
  const row = data.accounts.find((a) => a._id === accountId);
  const platform = readCache()?.accounts.find((a) => a.id === accountId)?.mapped ?? "";
  return {
    platform,
    accountId,
    followers: Math.max(0, Math.round(row?.currentFollowers ?? 0)),
    followerDelta: typeof row?.growth === "number" ? row.growth : null,
    views: 0,
    available: Boolean(row),
    unavailableReason: row ? null : "No follower stats returned for this account yet",
    raw: data,
  };
}
