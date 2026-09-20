import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, settings } from "@remedy-growth/db";
import { brightbeanEnvToken, env, platformConfigured, type Platform } from "../config.js";

const TOKEN_KEY = "brightbean_token";
const ACCOUNTS_KEY = "brightbean_accounts";

const TokenRowSchema = z.object({ token: z.string().min(8) }).strict();

const AccountSchema = z
  .object({
    id: z.string(),
    platform: z.string(),
    account_name: z.string().optional().default(""),
    account_handle: z.string().optional().default(""),
    connection_status: z.string().optional().default(""),
  })
  .passthrough();

const MeSchema = z
  .object({
    workspace_name: z.string().optional().default(""),
    permissions: z.array(z.string()).optional().default([]),
    allowlisted_accounts: z.array(AccountSchema).optional().default([]),
  })
  .passthrough();

const AccountsSchema = z
  .object({
    accounts: z.array(AccountSchema).optional().default([]),
  })
  .passthrough();

const MediaSchema = z.object({ id: z.string() }).passthrough();

const PlatformChildSchema = z
  .object({
    id: z.string().optional(),
    social_account_id: z.string().optional(),
    platform: z.string().optional(),
    status: z.string().optional(),
    platform_post_id: z.string().optional().nullable(),
  })
  .passthrough();

const PostResponseSchema = z
  .object({
    id: z.string(),
    status: z.string().optional().default(""),
    scheduled_at: z.string().nullable().optional(),
    published_at: z.string().nullable().optional(),
    platform_posts: z.array(PlatformChildSchema).optional().default([]),
  })
  .passthrough();

const CachedAccountSchema = z
  .object({
    id: z.string(),
    platform: z.string(),
    mapped: z.enum(["tiktok", "instagram", "facebook", "youtube"]),
    name: z.string(),
    handle: z.string(),
    status: z.string(),
  })
  .strict();

const CachedAccountsSchema = z
  .object({
    workspaceName: z.string(),
    permissions: z.array(z.string()),
    accounts: z.array(CachedAccountSchema),
    refreshedAt: z.string(),
  })
  .strict();

export type BrightbeanAccount = z.infer<typeof CachedAccountSchema>;
export type BrightbeanCache = z.infer<typeof CachedAccountsSchema>;
export type CarouselPlatform = Platform;

function baseUrl(): string {
  return env.BRIGHTBEAN_BASE_URL.replace(/\/$/, "");
}

function readSetting<T>(key: string, schema: z.ZodType<T>): T | null {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, key)).get();
  if (!row) return null;
  const parsed = schema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

function writeSetting(key: string, value: unknown): void {
  const db = getDb();
  db.insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date().toISOString() } })
    .run();
}

function deleteSetting(key: string): void {
  const db = getDb();
  db.delete(settings).where(eq(settings.key, key)).run();
}

export function getBrightbeanToken(): string {
  const fromEnv = brightbeanEnvToken();
  if (fromEnv) return fromEnv;
  return readSetting(TOKEN_KEY, TokenRowSchema)?.token ?? "";
}

export function brightbeanConfigured(): boolean {
  return getBrightbeanToken().length > 0;
}

export function loadBrightbeanCache(): BrightbeanCache | null {
  return readSetting(ACCOUNTS_KEY, CachedAccountsSchema);
}

export function mapBrightbeanPlatform(raw: string): BrightbeanAccount["mapped"] | null {
  const p = raw.toLowerCase();
  if (p.includes("tiktok")) return "tiktok";
  if (p.includes("instagram")) return "instagram";
  if (p.includes("facebook") || p === "fb") return "facebook";
  if (p.includes("youtube")) return "youtube";
  return null;
}

function toCached(accounts: Array<{
  id: string;
  platform: string;
  account_name?: string;
  account_handle?: string;
  connection_status?: string;
}>): BrightbeanAccount[] {
  const out: BrightbeanAccount[] = [];
  for (const a of accounts) {
    const mapped = mapBrightbeanPlatform(a.platform);
    if (!mapped) continue;
    out.push({
      id: a.id,
      platform: a.platform,
      mapped,
      name: a.account_name || a.account_handle || a.platform,
      handle: a.account_handle || "",
      status: a.connection_status || "unknown",
    });
  }
  return out;
}

export function accountFor(platform: CarouselPlatform): BrightbeanAccount | null {
  const cache = loadBrightbeanCache();
  if (!cache) return null;
  return (
    cache.accounts.find((a) => a.mapped === platform && a.status === "connected") ??
    cache.accounts.find((a) => a.mapped === platform) ??
    null
  );
}

/** True when BrightBean can publish this carousel platform, or native keys are set. */
export function publisherReady(p: Platform): boolean {
  if (brightbeanConfigured()) {
    const cache = loadBrightbeanCache();
    if (!cache) return true;
    return cache.accounts.some((a) => a.mapped === p);
  }
  return platformConfigured(p);
}

function redactSecrets(text: string): string {
  return text.replace(/bb_studio_[A-Za-z0-9_-]+/g, "bb_studio_[redacted]");
}

export function tokenHint(): string | null {
  return getBrightbeanToken() ? "set" : null;
}

export function brightbeanPublicStatus(): {
  configured: boolean;
  connected: boolean;
  workspace: string;
  permissions: string[];
  accounts: BrightbeanAccount[];
  tokenHint: string | null;
  youtubeConnected: boolean;
  publisher: "brightbean" | "native";
} {
  const cache = loadBrightbeanCache();
  const configured = brightbeanConfigured();
  const connected = Boolean(configured && cache && cache.accounts.some((a) => a.status === "connected"));
  return {
    configured,
    connected,
    workspace: cache?.workspaceName ?? "",
    permissions: cache?.permissions ?? [],
    accounts: cache?.accounts ?? [],
    tokenHint: tokenHint(), // never includes any key characters
    youtubeConnected: Boolean(cache?.accounts.some((a) => a.mapped === "youtube")),
    publisher: configured ? "brightbean" : "native",
  };
}

async function bbFetch(pathname: string, init: RequestInit = {}): Promise<Response> {
  const token = getBrightbeanToken();
  if (!token) throw new Error("BrightBean not connected — paste an API key in Settings.");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const url = `${baseUrl()}/api/v1${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  let res = await fetch(url, { ...init, headers });
  if (res.status === 404) {
    const alt = url.includes("/?") ? url.replace("/?", "?") : url.replace(/\/$/, "");
    if (alt !== url) res = await fetch(alt, { ...init, headers });
  }
  return res;
}

async function bbJson<T>(pathname: string, schema: z.ZodType<T>, init: RequestInit = {}): Promise<T> {
  const res = await bbFetch(pathname, init);
  const text = await res.text();
  let data: unknown = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  if (!res.ok) {
    throw new Error(redactSecrets(`BrightBean ${pathname} failed (${res.status}): ${text.slice(0, 400)}`));
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new Error(redactSecrets(`BrightBean ${pathname} returned an unexpected shape: ${parsed.error.message.slice(0, 200)}`));
  }
  return parsed.data;
}

export async function refreshBrightbeanAccounts(): Promise<BrightbeanCache> {
  const me = await bbJson("/me/", MeSchema);
  let accounts = me.allowlisted_accounts ?? [];
  if (accounts.length === 0) {
    const res = await bbFetch("/accounts/");
    const text = await res.text();
    if (!res.ok) throw new Error(redactSecrets(`BrightBean /accounts/ failed (${res.status}): ${text.slice(0, 300)}`));
    const raw: unknown = text ? JSON.parse(text) : {};
    const asObject = AccountsSchema.safeParse(raw);
    const asArray = z.array(AccountSchema).safeParse(raw);
    if (asObject.success && (asObject.data.accounts ?? []).length) accounts = asObject.data.accounts ?? [];
    else if (asArray.success) accounts = asArray.data;
  }
  const cache: BrightbeanCache = {
    workspaceName: me.workspace_name ?? "",
    permissions: me.permissions ?? [],
    accounts: toCached(accounts),
    refreshedAt: new Date().toISOString(),
  };
  writeSetting(ACCOUNTS_KEY, cache);
  return cache;
}

const ConnectSchema = z.object({ token: z.string().min(12) }).strict();

export async function connectBrightbean(rawToken: string): Promise<BrightbeanCache> {
  const parsed = ConnectSchema.safeParse({ token: rawToken.trim() });
  if (!parsed.success) throw new Error("Paste the BrightBean API key (starts with bb_studio_).");
  const token = parsed.data.token;
  if (!token.startsWith("bb_studio_")) {
    throw new Error("That does not look like a BrightBean key (expected bb_studio_…).");
  }
  writeSetting(TOKEN_KEY, { token });
  try {
    return await refreshBrightbeanAccounts();
  } catch (err) {
    deleteSetting(TOKEN_KEY);
    deleteSetting(ACCOUNTS_KEY);
    throw err;
  }
}

export function disconnectBrightbean(): void {
  deleteSetting(TOKEN_KEY);
  deleteSetting(ACCOUNTS_KEY);
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".mp4") return "video/mp4";
  if (ext === ".mov") return "video/quicktime";
  return "image/jpeg";
}

export async function uploadSlideImages(slidePaths: string[], postId: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const filePath = slidePaths[i]!;
    const buf = await fs.readFile(filePath);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)], { type: mimeFor(filePath) }), path.basename(filePath));
    form.append("title", `Remedy #${postId} slide ${i + 1}`);
    form.append("tags", "remedy,carousel");
    form.append("idempotency_key", `remedy-${postId}-slide-${i}`);
    const media = await bbJson("/media/", MediaSchema, { method: "POST", body: form });
    ids.push(media.id);
  }
  return ids;
}

export async function uploadVideoFile(
  filePath: string,
  postId: number,
  opts?: { title?: string; tags?: string; idempotencyKey?: string },
): Promise<string> {
  const buf = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buf)], { type: mimeFor(filePath) }), path.basename(filePath));
  form.append("title", opts?.title ?? `Remedy #${postId} Short`);
  form.append("tags", opts?.tags ?? "remedy,short,youtube");
  form.append("idempotency_key", opts?.idempotencyKey ?? `remedy-${postId}-short-v1`);
  const media = await bbJson("/media/", MediaSchema, { method: "POST", body: form });
  return media.id;
}

export interface BrightbeanPublishResult {
  brightbeanPostId: string;
  status: "draft_sent" | "pending" | "published" | "failed";
  platformPostId?: string;
  error?: string;
}

function mapChildStatus(status: string, mode: "drafts" | "live"): BrightbeanPublishResult["status"] {
  const s = status.toLowerCase();
  if (s === "failed") return "failed";
  if (s === "published") return "published";
  if (s === "scheduled" || s === "publishing") return "pending";
  if (mode === "drafts") return "draft_sent";
  return "pending";
}

export async function publishCarouselToAccount(params: {
  postId: number;
  platform: CarouselPlatform;
  title: string;
  caption: string;
  mediaAssetIds: string[];
  mode: "drafts" | "live";
  scheduledAt: string | null;
  idempotencyKey?: string;
}): Promise<BrightbeanPublishResult> {
  const account = accountFor(params.platform);
  if (!account) throw new Error(`No BrightBean ${params.platform} account on this API key.`);
  if (account.status && account.status !== "connected") {
    throw new Error(`BrightBean ${params.platform} is ${account.status} — reconnect it in BrightBean Studio.`);
  }

  const action = params.mode === "live" ? "schedule" : "draft";
  const scheduledAt =
    action === "schedule"
      ? params.scheduledAt && Date.parse(params.scheduledAt) > Date.now()
        ? params.scheduledAt
        : new Date(Date.now() + 120_000).toISOString()
      : undefined;

  const body: Record<string, unknown> = {
    social_account_id: account.id,
    caption: params.caption.slice(0, 10_000),
    title: params.title.slice(0, 255),
    media_asset_ids: params.mediaAssetIds,
    action,
    idempotency_key: params.idempotencyKey ?? `remedy-${params.postId}-${params.platform}-v1`,
  };
  if (scheduledAt) body.scheduled_at = scheduledAt;

  const created = await bbJson("/posts/", PostResponseSchema, {
    method: "POST",
    body: JSON.stringify(body),
  });
  const child = (created.platform_posts ?? [])[0];
  const status = mapChildStatus(child?.status ?? created.status ?? "", params.mode);
  const platformPostId = child?.platform_post_id ? String(child.platform_post_id) : undefined;
  return {
    brightbeanPostId: created.id,
    status,
    platformPostId,
  };
}

const MetricTileSchema = z
  .object({
    key: z.string(),
    value: z.number().optional(),
  })
  .passthrough();

const PostAnalyticsSchema = z
  .object({
    platform_posts: z
      .array(
        z
          .object({
            platform: z.string().optional(),
            metric_tiles: z.array(MetricTileSchema).optional().default([]),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

export interface BrightbeanMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** BrightBean post ids are UUIDs — skip leftover native TikTok/inbox ids. */
export function isBrightbeanPostId(id: string | undefined): id is string {
  return Boolean(id && UUID_RE.test(id));
}

export async function fetchBrightbeanPost(brightbeanPostId: string) {
  return bbJson(`/posts/${brightbeanPostId}/`, PostResponseSchema);
}

/** Re-time a scheduled BrightBean post (no-op if already publishing/published). */
export async function updateBrightbeanScheduledAt(brightbeanPostId: string, scheduledAt: string) {
  return bbJson(`/posts/${brightbeanPostId}/`, PostResponseSchema, {
    method: "PATCH",
    body: JSON.stringify({ scheduled_at: scheduledAt }),
  });
}

/** Scheduled → draft so it will not go live. */
export async function cancelBrightbeanPost(brightbeanPostId: string) {
  return bbJson(`/posts/${brightbeanPostId}/cancel`, PostResponseSchema, { method: "POST" });
}

function tileNumber(tile: { key: string; value?: number } & Record<string, unknown>): number {
  if (typeof tile.value === "number" && Number.isFinite(tile.value)) return tile.value;
  const raw = tile.value;
  if (typeof raw === "string" && raw !== "" && Number.isFinite(Number(raw))) return Number(raw);
  const series = tile.series;
  if (Array.isArray(series) && series.length > 0) {
    const last = series[series.length - 1];
    if (typeof last === "number" && Number.isFinite(last)) return last;
    if (last && typeof last === "object" && typeof (last as { value?: unknown }).value === "number") {
      return (last as { value: number }).value;
    }
  }
  return 0;
}

function tilesToMetrics(tiles: Array<{ key: string; value?: number } & Record<string, unknown>>): BrightbeanMetrics {
  const num = (...needles: string[]): number => {
    for (const needle of needles) {
      const tile = tiles.find((t) => {
        const k = t.key.toLowerCase();
        return k === needle || k.includes(needle);
      });
      if (tile) return tileNumber(tile);
    }
    return 0;
  };
  return {
    views: num("views", "video_views", "plays", "impressions", "reach"),
    likes: num("likes", "reactions"),
    comments: num("comments"),
    shares: num("shares"),
    saves: num("saves", "favorites"),
  };
}

export async function fetchPostAnalytics(brightbeanPostId: string): Promise<BrightbeanMetrics | null> {
  const data = await bbJson(`/analytics/posts/${brightbeanPostId}/`, PostAnalyticsSchema);
  const children = data.platform_posts ?? [];
  const tiles = children.flatMap((p) => p.metric_tiles ?? []);
  if (tiles.length === 0) return null;
  return tilesToMetrics(tiles);
}

const DerivedMetricSchema = z
  .object({
    key: z.string(),
    label: z.string().optional(),
    value: z.number().optional(),
    delta: z.number().optional(),
    series: z.array(z.number()).optional(),
  })
  .passthrough();

const AccountAnalyticsSchema = z
  .object({
    account_id: z.string().optional(),
    platform: z.string().optional(),
    analytics_available: z.boolean().optional(),
    hero_metrics: z.array(DerivedMetricSchema).optional().default([]),
    follower_growth: DerivedMetricSchema.nullable().optional(),
    captured_at: z.string().nullable().optional(),
  })
  .passthrough();

const FOLLOWER_KEYS = ["followers", "follower_count", "subscribers", "subscriber_count", "fans"];

function metricNumber(m: { key: string; value?: number; series?: number[] }): number {
  if (typeof m.value === "number" && Number.isFinite(m.value) && m.value > 0) return Math.round(m.value);
  const series = m.series;
  if (Array.isArray(series) && series.length > 0) {
    const last = series[series.length - 1];
    if (typeof last === "number" && Number.isFinite(last) && last > 0) return Math.round(last);
  }
  return 0;
}

export interface BrightbeanAccountAnalytics {
  platform: string;
  accountId: string;
  followers: number;
  followerDelta: number | null;
  views: number;
  available: boolean;
  unavailableReason: string | null;
  raw: unknown;
}

function isAbsoluteFollowerMetric(key: string, label?: string): boolean {
  const k = `${key} ${label ?? ""}`.toLowerCase();
  if (k.includes("new follow") || k === "follows" || k.includes("net follow")) return false;
  return FOLLOWER_KEYS.some((n) => k.includes(n));
}

/** Channel-level KPIs. Followers are the era denominator for learning. */
export async function fetchAccountAnalytics(accountId: string): Promise<BrightbeanAccountAnalytics> {
  const data = await bbJson(`/analytics/accounts/${accountId}?days=30`, AccountAnalyticsSchema);
  const heroes = data.hero_metrics ?? [];
  const growth = data.follower_growth ?? null;
  const followerHero = heroes.find((h) => isAbsoluteFollowerMetric(h.key, typeof h.label === "string" ? h.label : undefined));
  const viewsHero = heroes.find((h) => {
    const k = h.key.toLowerCase();
    return k === "views" || k.includes("video_views") || k.includes("impressions");
  });
  let followers = followerHero ? metricNumber(followerHero) : 0;
  // IG (and some others) put the current count on follower_growth when key is "followers".
  if (followers === 0 && growth && isAbsoluteFollowerMetric(growth.key)) {
    followers = metricNumber(growth);
  }
  const growthIsDelta = Boolean(growth && !isAbsoluteFollowerMetric(growth.key));
  return {
    platform: data.platform ?? "",
    accountId,
    followers,
    followerDelta: growthIsDelta && typeof growth?.value === "number"
      ? growth.value
      : typeof growth?.delta === "number"
        ? growth.delta
        : null,
    views: viewsHero ? metricNumber(viewsHero) : 0,
    available: data.analytics_available !== false,
    unavailableReason: typeof data.unavailable_reason === "string" ? data.unavailable_reason : null,
    raw: data,
  };
}
