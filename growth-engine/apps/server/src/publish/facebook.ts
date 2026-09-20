import { env } from "../config.js";

/**
 * Facebook Page multi-photo posts via the Graph API (your own Meta app, $0).
 * Photos are uploaded unpublished, then attached to a single feed post.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

async function graphPost(pathname: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: env.FB_PAGE_TOKEN }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.error) {
    throw new Error(`Facebook ${pathname} failed (${res.status}): ${JSON.stringify(data.error ?? data).slice(0, 400)}`);
  }
  return data;
}

/** Publish a multi-photo post to the page; returns the post id. */
export async function publishPhotos(params: { caption: string; imageUrls: string[] }): Promise<string> {
  const photoIds: string[] = [];
  for (const url of params.imageUrls) {
    const photo = await graphPost(`/${env.FB_PAGE_ID}/photos`, { url, published: "false" });
    photoIds.push(String(photo.id));
  }
  const body: Record<string, string> = { message: params.caption };
  photoIds.forEach((id, i) => {
    body[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });
  const post = await graphPost(`/${env.FB_PAGE_ID}/feed`, body);
  return String(post.id);
}

export interface FbMetrics {
  likes: number;
  comments: number;
  shares: number;
}

export async function fetchMetrics(postId: string): Promise<FbMetrics> {
  const qs = new URLSearchParams({
    fields: "shares,likes.summary(true),comments.summary(true)",
    access_token: env.FB_PAGE_TOKEN,
  });
  const res = await fetch(`${GRAPH}/${postId}?${qs}`);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.error) {
    throw new Error(`Facebook metrics failed (${res.status}): ${JSON.stringify(data.error ?? data).slice(0, 300)}`);
  }
  const likes = (data.likes as Record<string, unknown> | undefined)?.summary as Record<string, unknown> | undefined;
  const comments = (data.comments as Record<string, unknown> | undefined)?.summary as Record<string, unknown> | undefined;
  const shares = data.shares as Record<string, unknown> | undefined;
  return {
    likes: Number(likes?.total_count ?? 0),
    comments: Number(comments?.total_count ?? 0),
    shares: Number(shares?.count ?? 0),
  };
}
