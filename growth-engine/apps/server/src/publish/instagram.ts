import { env } from "../config.js";

/**
 * Instagram Graph API carousel publishing (your own Meta app, $0).
 * Requires an Instagram professional account and a long-lived access token
 * (valid ~60 days — regenerate in the Meta dashboard when it expires).
 * Carousels support 2-10 images.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

async function graphPost(pathname: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`${GRAPH}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: env.IG_ACCESS_TOKEN }),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.error) {
    throw new Error(`Instagram ${pathname} failed (${res.status}): ${JSON.stringify(data.error ?? data).slice(0, 400)}`);
  }
  return data;
}

async function graphGet(pathname: string, params: Record<string, string>, token: string): Promise<Record<string, unknown>> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}${pathname}?${qs}`);
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || data.error) {
    throw new Error(`Graph GET ${pathname} failed (${res.status}): ${JSON.stringify(data.error ?? data).slice(0, 400)}`);
  }
  return data;
}

/** Publish an image carousel; returns the IG media id. */
export async function publishCarousel(params: { caption: string; imageUrls: string[] }): Promise<string> {
  const urls = params.imageUrls.slice(0, 10); // IG carousel max is 10 children
  if (urls.length < 2) throw new Error("Instagram carousels need at least 2 images");

  const children: string[] = [];
  for (const url of urls) {
    const item = await graphPost(`/${env.IG_USER_ID}/media`, {
      image_url: url,
      is_carousel_item: "true",
    });
    children.push(String(item.id));
  }

  const container = await graphPost(`/${env.IG_USER_ID}/media`, {
    media_type: "CAROUSEL",
    children: children.join(","),
    caption: params.caption.slice(0, 2200),
  });

  const published = await graphPost(`/${env.IG_USER_ID}/media_publish`, {
    creation_id: String(container.id),
  });
  return String(published.id);
}

export interface IgMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
}

/** Fetch metrics for a published IG media id. */
export async function fetchMetrics(mediaId: string): Promise<IgMetrics> {
  const basic = await graphGet(`/${mediaId}`, { fields: "like_count,comments_count" }, env.IG_ACCESS_TOKEN);
  let views = 0;
  let shares = 0;
  let saves = 0;
  try {
    const insights = await graphGet(
      `/${mediaId}/insights`,
      { metric: "views,reach,saved,shares" },
      env.IG_ACCESS_TOKEN,
    );
    const rows = Array.isArray(insights.data) ? (insights.data as Array<Record<string, unknown>>) : [];
    for (const row of rows) {
      const name = String(row.name);
      const values = Array.isArray(row.values) ? (row.values as Array<Record<string, unknown>>) : [];
      const value = Number(values[0]?.value ?? 0);
      if (name === "views") views = value;
      else if (name === "reach" && views === 0) views = value;
      else if (name === "saved") saves = value;
      else if (name === "shares") shares = value;
    }
  } catch (err) {
    // Insights can lag or be unavailable for new accounts; basic counts still work.
    console.warn("IG insights unavailable:", err instanceof Error ? err.message.slice(0, 200) : err);
  }
  return {
    views,
    likes: Number(basic.like_count ?? 0),
    comments: Number(basic.comments_count ?? 0),
    shares,
    saves,
  };
}
