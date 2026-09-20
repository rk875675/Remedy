import { z } from "zod";
import { getDb, settings } from "@remedy-growth/db";
import { eq } from "drizzle-orm";
import { env } from "../config.js";
import { downloadText, uploadBuffer } from "./r2.js";

export const TIKTOK_OAUTH_KEY = "growth/tiktok-oauth.json";

/**
 * TikTok Content Posting API (your own developer app, $0).
 * - MEDIA_UPLOAD: pushes the carousel to your TikTok inbox as a draft; you
 *   finish it in the app (add music, tap post). Works for unaudited apps.
 * - DIRECT_POST: publishes automatically — public visibility requires your
 *   app to pass TikTok's free one-time audit; until then posts are SELF_ONLY.
 */

const API = "https://open.tiktokapis.com/v2";
const TOKENS_KEY = "tiktok_tokens";

const TokensSchema = z
  .object({
    access_token: z.string(),
    refresh_token: z.string(),
    expires_at: z.number(), // epoch ms
    open_id: z.string().default(""),
  })
  .strict();

type Tokens = z.infer<typeof TokensSchema>;

function loadTokens(): Tokens | null {
  const db = getDb();
  const row = db.select().from(settings).where(eq(settings.key, TOKENS_KEY)).get();
  if (!row) return null;
  const parsed = TokensSchema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

function saveTokens(t: Tokens): void {
  const db = getDb();
  db.insert(settings)
    .values({ key: TOKENS_KEY, value: t })
    .onConflictDoUpdate({ target: settings.key, set: { value: t, updatedAt: new Date().toISOString() } })
    .run();
}

export function tiktokConnected(): boolean {
  return loadTokens() !== null;
}

/** Wipe stored tokens so the user can re-authorize with a different account. */
export function disconnectTikTok(): void {
  const db = getDb();
  db.delete(settings).where(eq(settings.key, TOKENS_KEY)).run();
}

export function buildAuthUrl(): string {
  if (!env.TIKTOK_CLIENT_KEY) throw new Error("TIKTOK_CLIENT_KEY not set");
  const params = new URLSearchParams({
    client_key: env.TIKTOK_CLIENT_KEY,
    // Sandbox/unaudited apps reject video.publish + video.list. Drafts only need upload.
    scope: "user.info.basic,video.upload",
    response_type: "code",
    redirect_uri: env.TIKTOK_REDIRECT_URI,
    state: "remedy-growth",
  });
  return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${API}/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: env.TIKTOK_CLIENT_KEY,
      client_secret: env.TIKTOK_CLIENT_SECRET,
      ...body,
    }),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok || !data.access_token) {
    throw new Error(`TikTok token request failed (${res.status}): ${JSON.stringify(data).slice(0, 300)}`);
  }
  const tokens: Tokens = {
    access_token: String(data.access_token),
    refresh_token: String(data.refresh_token ?? ""),
    expires_at: Date.now() + Number(data.expires_in ?? 86400) * 1000,
    open_id: String(data.open_id ?? ""),
  };
  saveTokens(tokens);
  return tokens;
}

/** Exchange the OAuth code (pasted from the redirect URL) for tokens. */
export async function exchangeCode(code: string): Promise<void> {
  await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: env.TIKTOK_REDIRECT_URI,
  });
}

/** Finish connect after TikTok redirects to slide. and the code is stored in R2. */
export async function consumePendingOAuth(): Promise<boolean> {
  const raw = await downloadText(TIKTOK_OAUTH_KEY);
  if (!raw) return false;
  const parsed = JSON.parse(raw) as { code?: string };
  if (!parsed.code) return false;
  await exchangeCode(parsed.code);
  await uploadBuffer(TIKTOK_OAUTH_KEY, Buffer.from(JSON.stringify({}), "utf8"), "application/json");
  return true;
}

async function ensureAccessToken(): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) throw new Error("TikTok not connected — open the dashboard Settings tab and connect TikTok.");
  if (Date.now() < tokens.expires_at - 5 * 60_000) return tokens.access_token;
  const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
  return refreshed.access_token;
}

/** True when native OAuth can still mint an access token (inbox drafts / music). */
export async function nativeInboxReady(): Promise<boolean> {
  try {
    await ensureAccessToken();
    return true;
  } catch {
    return false;
  }
}

async function apiPost(pathname: string, token: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}${pathname}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const error = (data.error ?? {}) as Record<string, unknown>;
  if (!res.ok || (error.code && error.code !== "ok")) {
    throw new Error(`TikTok ${pathname} failed (${res.status}): ${JSON.stringify(data).slice(0, 400)}`);
  }
  return data;
}

interface CreatorInfo {
  privacyOptions: string[];
  commentDisabled: boolean;
}

async function queryCreatorInfo(token: string): Promise<CreatorInfo> {
  const data = await apiPost("/post/publish/creator_info/query/", token, {});
  const d = (data.data ?? {}) as Record<string, unknown>;
  return {
    privacyOptions: Array.isArray(d.privacy_level_options) ? (d.privacy_level_options as string[]) : [],
    commentDisabled: Boolean(d.comment_disabled),
  };
}

export interface TikTokPublishResult {
  publishId: string;
  mode: "MEDIA_UPLOAD" | "DIRECT_POST";
}

/** Publish a photo carousel (returns TikTok's publish_id for status polling). */
export async function publishPhotos(params: {
  title: string;
  description: string;
  imageUrls: string[];
}): Promise<TikTokPublishResult> {
  const token = await ensureAccessToken();
  const mode = env.TIKTOK_POST_MODE;

  const postInfo: Record<string, unknown> = {
    title: params.title.slice(0, 90),
    description: params.description.slice(0, 4000),
  };
  if (mode === "DIRECT_POST") {
    // TikTok requires honoring the creator's actual privacy options.
    const info = await queryCreatorInfo(token);
    postInfo.privacy_level = info.privacyOptions.includes("PUBLIC_TO_EVERYONE")
      ? "PUBLIC_TO_EVERYONE"
      : (info.privacyOptions[0] ?? "SELF_ONLY");
    postInfo.disable_comment = info.commentDisabled;
  }

  const data = await apiPost("/post/publish/content/init/", token, {
    media_type: "PHOTO",
    post_mode: mode,
    post_info: postInfo,
    source_info: {
      source: "PULL_FROM_URL",
      photo_images: params.imageUrls.slice(0, 35),
      photo_cover_index: 0,
    },
  });
  const d = (data.data ?? {}) as Record<string, unknown>;
  const publishId = String(d.publish_id ?? "");
  if (!publishId) throw new Error(`TikTok publish returned no publish_id: ${JSON.stringify(data).slice(0, 300)}`);
  return { publishId, mode };
}

export interface TikTokStatus {
  status: string;
  postId: string | null;
  failReason: string | null;
}

/** Poll a publish job; when live, returns the public post id. */
export async function fetchStatus(publishId: string): Promise<TikTokStatus> {
  const token = await ensureAccessToken();
  const data = await apiPost("/post/publish/status/fetch/", token, { publish_id: publishId });
  const d = (data.data ?? {}) as Record<string, unknown>;
  const ids = Array.isArray(d.publicaly_available_post_id) ? (d.publicaly_available_post_id as unknown[]) : [];
  return {
    status: String(d.status ?? "UNKNOWN"),
    postId: ids.length ? String(ids[0]) : null,
    failReason: d.fail_reason ? String(d.fail_reason) : null,
  };
}

export interface TikTokMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

/** Fetch engagement metrics for our own posts by post id (video.list scope). */
export async function queryMetrics(postIds: string[]): Promise<Record<string, TikTokMetrics>> {
  if (postIds.length === 0) return {};
  const token = await ensureAccessToken();
  const res = await fetch(
    `${API}/video/query/?fields=id,view_count,like_count,comment_count,share_count`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ filters: { video_ids: postIds.slice(0, 20) } }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const d = (data.data ?? {}) as Record<string, unknown>;
  const videos = Array.isArray(d.videos) ? (d.videos as Array<Record<string, unknown>>) : [];
  const out: Record<string, TikTokMetrics> = {};
  for (const v of videos) {
    out[String(v.id)] = {
      views: Number(v.view_count ?? 0),
      likes: Number(v.like_count ?? 0),
      comments: Number(v.comment_count ?? 0),
      shares: Number(v.share_count ?? 0),
    };
  }
  return out;
}
