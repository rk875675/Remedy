import fs from "node:fs/promises";
import fssync from "node:fs";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { ASSETS_DIR, env, r2Configured } from "../config.js";
import { invalidateCropConfig, slideObjectKey } from "../generation/composer.js";
import { shortObjectKey } from "../generation/short.js";

/**
 * Uploads rendered slides to a public Cloudflare R2 bucket so TikTok/Instagram
 * can pull them by HTTPS URL. Keys are deterministic (posts/<id>/slide-N.jpg),
 * so re-publishing simply overwrites.
 */

let client: AwsClient | null = null;

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function r2Fetch(endpoint: string, init: RequestInit): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      return await getClient().fetch(endpoint, init);
    } catch (err) {
      lastErr = err;
      if (attempt === 4) break;
      await sleep(600 * attempt);
    }
  }
  throw lastErr;
}

function getClient(): AwsClient {
  if (!client) {
    client = new AwsClient({
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      service: "s3",
      region: "auto",
    });
  }
  return client;
}

export function publicUrl(key: string): string {
  return `${env.R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${key}`;
}

export async function uploadBuffer(key: string, body: Buffer, contentType: string): Promise<string> {
  if (!r2Configured()) {
    throw new Error("R2 is not configured — set R2_* vars in growth-engine/.env");
  }
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
  const res = await r2Fetch(endpoint, {
    method: "PUT",
    headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=60" },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    throw new Error(`R2 upload failed (${res.status}): ${await res.text()}`);
  }
  return publicUrl(key);
}

export async function objectExists(key: string): Promise<boolean> {
  if (!r2Configured()) return false;
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
  const res = await r2Fetch(endpoint, { method: "HEAD" });
  return res.ok;
}

export async function uploadFileIfAbsent(localPath: string, key: string): Promise<string> {
  if (await objectExists(key)) return publicUrl(key);
  return uploadFile(localPath, key);
}

export async function uploadFile(localPath: string, key: string): Promise<string> {
  const body = await fs.readFile(localPath);
  const type = localPath.endsWith(".json")
    ? "application/json"
    : localPath.endsWith(".mp4")
      ? "video/mp4"
      : "image/jpeg";
  return uploadBuffer(key, body, type);
}

export async function uploadShort(postId: number, localPath: string, overwrite = false): Promise<string> {
  return overwrite ? uploadFile(localPath, shortObjectKey(postId)) : uploadFileIfAbsent(localPath, shortObjectKey(postId));
}

export async function downloadText(key: string): Promise<string | null> {
  if (!r2Configured()) return null;
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
  const res = await r2Fetch(endpoint, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 get failed (${res.status}): ${await res.text()}`);
  return res.text();
}

export async function downloadBuffer(key: string): Promise<Buffer | null> {
  if (!r2Configured()) return null;
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
  const res = await r2Fetch(endpoint, { method: "GET" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`R2 get failed (${res.status}): ${await res.text()}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function deleteObject(key: string): Promise<void> {
  if (!r2Configured()) return;
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}/${key}`;
  const res = await r2Fetch(endpoint, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw new Error(`R2 delete failed (${res.status}): ${await res.text()}`);
  }
}

export async function listPrefix(prefix: string): Promise<string[]> {
  if (!r2Configured()) return [];
  const endpoint = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${env.R2_BUCKET}?list-type=2&prefix=${encodeURIComponent(prefix)}`;
  const res = await r2Fetch(endpoint, { method: "GET" });
  if (!res.ok) throw new Error(`R2 list failed (${res.status}): ${await res.text()}`);
  const xml = await res.text();
  return [...xml.matchAll(/<Key>([^<]+)<\/Key>/g)].map((m) =>
    decodeURIComponent((m[1] ?? "").replace(/&amp;/g, "&")),
  );
}

export const SCREENSHOT_R2_PREFIX = "growth/screenshots/";
export const ILLUSTRATION_R2_PREFIX = "growth/illustrations/";

/** Delete R2 crop_* files that are not in the current local keep set. */
export async function deleteStaleR2Crops(keep: Set<string>): Promise<string[]> {
  const keys = await listPrefix(SCREENSHOT_R2_PREFIX);
  const removed: string[] = [];
  for (const key of keys) {
    const base = key.slice(SCREENSHOT_R2_PREFIX.length);
    if (!base || base.endsWith("/")) continue;
    const name = path.basename(base);
    if (!name.startsWith("crop_")) continue;
    if (keep.has(name)) continue;
    await deleteObject(key);
    removed.push(name);
  }
  return removed;
}

/** Local descriptions and assign:false win so a generate sync cannot wipe ingest. */
function mergeScreenshotMetaFromRemote(dest: string, remoteText: string): void {
  let remote: Record<string, Record<string, unknown>> = {};
  try {
    const parsed = JSON.parse(remoteText) as unknown;
    if (parsed && typeof parsed === "object") remote = parsed as Record<string, Record<string, unknown>>;
  } catch {
    return;
  }
  let local: Record<string, Record<string, unknown>> = {};
  if (fssync.existsSync(dest)) {
    try {
      const parsed = JSON.parse(fssync.readFileSync(dest, "utf-8")) as unknown;
      if (parsed && typeof parsed === "object") local = parsed as Record<string, Record<string, unknown>>;
    } catch {
      local = {};
    }
  }
  const generic = /use when this screen matches the hook/i;
  const merged: Record<string, Record<string, unknown>> = { ...remote };
  for (const [file, loc] of Object.entries(local)) {
    const rem = remote[file] ?? {};
    const locDesc = typeof loc.description === "string" ? loc.description.trim() : "";
    const remDesc = typeof rem.description === "string" ? rem.description.trim() : "";
    const description = locDesc && !generic.test(locDesc) ? locDesc : remDesc || locDesc;
    merged[file] = {
      ...rem,
      ...loc,
      ...(description ? { description } : {}),
      ...(loc.assign === false || rem.assign === false ? { assign: false } : {}),
    };
  }
  fssync.writeFileSync(dest, JSON.stringify(merged, null, 2));
}

export async function syncScreenshotsFromR2(): Promise<number> {
  if (!r2Configured()) return 0;
  const keys = await listPrefix(SCREENSHOT_R2_PREFIX);
  let n = 0;
  for (const key of keys) {
    const base = key.slice(SCREENSHOT_R2_PREFIX.length);
    if (!base || base.endsWith("/")) continue;
    if (base.startsWith("thumbs/")) continue;
    const dest = path.join(ASSETS_DIR, path.basename(base));
    if (base === "crop-config.json") {
      const text = await downloadText(key);
      if (text) {
        fssync.writeFileSync(dest, text);
        invalidateCropConfig();
      }
      continue;
    }
    if (base === "meta.json") {
      const text = await downloadText(key);
      if (text) mergeScreenshotMetaFromRemote(dest, text);
      continue;
    }
    if (fssync.existsSync(dest)) continue;
    const buf = await downloadBuffer(key);
    if (buf) {
      fssync.mkdirSync(ASSETS_DIR, { recursive: true });
      fssync.writeFileSync(dest, buf);
      n++;
    }
  }
  return n;
}

/** Upload all slides for a post; returns public URLs in slide order. */
export async function uploadSlides(postId: number, filePaths: string[], overwrite = false): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < filePaths.length; i++) {
    const key = slideObjectKey(postId, i);
    urls.push(overwrite ? await uploadFile(filePaths[i]!, key) : await uploadFileIfAbsent(filePaths[i]!, key));
  }
  return urls;
}
