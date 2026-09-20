const DASHBOARD_KEY = "growth/dashboard.json";
const PENDING_KEY = "growth/pending.json";
const UGC_LIBRARY_KEY = "growth/ugc-library.json";
const TIKTOK_OAUTH_KEY = "growth/tiktok-oauth.json";
const LIBRARY_OVERRIDES_KEY = "growth/library-overrides.json";
const RATE_LIMIT_KEY = "growth/rate-limits.json";

interface R2Object {
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
}

interface R2Bucket {
  get(key: string): Promise<R2Object | null>;
  put(
    key: string,
    value: string | ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<unknown>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ objects: Array<{ key: string }> }>;
}

// ---------------------------------------------------------------------------
// Edge rate limiter — R2-backed daily + hourly write caps.
// The studio password cookie is the primary gate; this is defense-in-depth.
// ---------------------------------------------------------------------------

const WRITE_LIMIT_PER_HOUR = 60;
const WRITE_LIMIT_PER_DAY = 300;

interface RateBucket {
  date: string;
  hour: number;
  hourCount: number;
  dayCount: number;
}

async function checkWriteLimit(bucket: R2Bucket): Promise<string | null> {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const hourNum = now.getUTCHours();

  let state: RateBucket = { date: dateStr, hour: hourNum, hourCount: 0, dayCount: 0 };
  try {
    const obj = await bucket.get(RATE_LIMIT_KEY);
    if (obj) {
      const saved = JSON.parse(await obj.text()) as RateBucket;
      if (saved.date === dateStr) {
        state = saved;
        if (state.hour !== hourNum) {
          state.hour = hourNum;
          state.hourCount = 0;
        }
      }
    }
  } catch { /* fresh state on any read error */ }

  if (state.dayCount >= WRITE_LIMIT_PER_DAY) return "Daily write limit reached. Try again tomorrow.";
  if (state.hourCount >= WRITE_LIMIT_PER_HOUR) return "Hourly write limit reached. Slow down.";

  state.hourCount++;
  state.dayCount++;
  await bucket.put(RATE_LIMIT_KEY, JSON.stringify(state), {
    httpMetadata: { contentType: "application/json" },
  }).catch(() => {});
  return null;
}

interface LibraryOverrides {
  rejectedIllustrations: string[];
  deletedScreenshots: string[];
}

interface DashIllustration {
  id: string;
  source?: string;
  fit?: string;
  enabled?: boolean;
  [key: string]: unknown;
}

interface DashScreenshot {
  file: string;
  [key: string]: unknown;
}

interface Env {
  SLIDES: R2Bucket;
  UGC_OPERATOR_EMAILS?: string;
  UGC_CREATORS?: string;
  /** Shared studio password (Pages secret). Empty/unset = gate disabled. */
  STUDIO_PASSWORD?: string;
}

// ---------------------------------------------------------------------------
// Studio password gate — shared password, long-lived HMAC session cookie.
// Token: ok.exp.b64url(hmac("ok|exp")).
// ---------------------------------------------------------------------------

const SESSION_COOKIE = "studio_session";
const SESSION_TTL_SECONDS = 180 * 24 * 60 * 60; // ~180 days

const textEncoder = new TextEncoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array | null {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacSha256(secret: string, payload: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload)));
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Constant-time-ish string compare via SHA-256 digests. */
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(a)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(b)),
  ]);
  return bytesEqual(new Uint8Array(da), new Uint8Array(db));
}

async function signSession(secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sig = await hmacSha256(secret, `ok|${exp}`);
  return `ok.${exp}.${b64urlEncode(sig)}`;
}

async function verifySession(token: string, secret: string): Promise<boolean> {
  const [mark, expStr, sigB64] = token.split(".");
  if (mark !== "ok" || !expStr || !sigB64) return false;
  const sig = b64urlDecode(sigB64);
  if (!sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = await hmacSha256(secret, `ok|${exp}`);
  return bytesEqual(expected, sig);
}

function readCookie(request: Request, name: string): string {
  const raw = request.headers.get("Cookie") ?? "";
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return "";
}

function sessionCookieHeader(token: string, maxAge: number): string {
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

interface PendingAction {
  type: "approve" | "reject" | "create_variant" | "build_shorts" | "ugc_upload" | "ugc_approve" | "ugc_reject" | "ugc_caption" | "manual_complete";
  postId?: number;
  at: string;
  reason?: string;
  dimension?: "hook" | "template" | "asset" | "visual" | "music" | "shot_scale";
  uuid?: string;
  creatorSlug?: string;
  r2Key?: string;
  title?: string;
  caption?: string;
  fileName?: string;
  mimeType?: string;
  byteSize?: number;
  durationSec?: number | null;
}

function parseCreatorMap(raw: string): Array<{ slug: string; email: string }> {
  const out: Array<{ slug: string; email: string }> = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    const colon = trimmed.indexOf(":");
    if (colon <= 0) continue;
    const slug = trimmed.slice(0, colon).trim().toLowerCase();
    const email = trimmed.slice(colon + 1).trim().toLowerCase();
    if (slug && email) out.push({ slug, email });
  }
  return out;
}

function resolveCloudIdentity(request: Request, env: Env): { email: string; role: "operator" | "creator"; creatorSlug: string | null } {
  const email = (
    request.headers.get("Cf-Access-Authenticated-User-Email") ??
    request.headers.get("cf-access-authenticated-user-email") ??
    ""
  ).trim().toLowerCase();
  const creators = parseCreatorMap(env.UGC_CREATORS ?? "");
  const matched = email ? creators.find((c) => c.email === email) : undefined;
  if (matched) return { email, role: "creator", creatorSlug: matched.slug };
  const operators = (env.UGC_OPERATOR_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (operators.length > 0 && email && !operators.includes(email)) {
    return { email, role: "creator", creatorSlug: null };
  }
  return { email, role: "operator", creatorSlug: null };
}

interface DashUgcVideo {
  uuid: string;
  creatorSlug: string;
  creatorName: string;
  title: string;
  caption: string;
  status: string;
  fileName: string;
  byteSize: number;
  durationSec: number | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  diagnosis: string | null;
  rejectReason: string | null;
  error: string | null;
  createdAt: string;
  fileUrl: string;
  analytics: unknown[];
}

interface DashUgcFolder {
  id: string;
  name: string;
  creatorSlug: string;
  createdAt: string;
  coverUuid: string | null;
}

interface DashUgcClipMeta {
  folderId: string | null;
  clipTitle: string;
}

interface DashUgcLibrary {
  folders: DashUgcFolder[];
  clips: Record<string, DashUgcClipMeta>;
}

interface DashUgc {
  creators: Array<{ slug: string; displayName: string }>;
  videos: Array<DashUgcVideo & { clipTitle?: string; folderId?: string | null }>;
  folders?: DashUgcFolder[];
  pendingReview: number;
  insights?: unknown;
}

function ugcCreatorName(slug: string): string {
  if (slug === "sohan") return "Sohan";
  if (slug === "ai") return "AI";
  return slug[0] ? slug[0].toUpperCase() + slug.slice(1) : slug;
}

const DEFAULT_UGC_CREATORS: DashUgc["creators"] = [
  { slug: "sohan", displayName: "Sohan" },
  { slug: "ai", displayName: "AI" },
];

function dashUgc(dash: Dashboard): DashUgc {
  const raw = (dash as Dashboard & { ugc?: DashUgc }).ugc;
  const base: DashUgc =
    raw && Array.isArray(raw.videos)
      ? raw
      : { creators: [...DEFAULT_UGC_CREATORS], videos: [], pendingReview: 0 };
  const slugs = new Set((base.creators ?? []).map((c) => c.slug));
  const creators = [...(base.creators ?? [])];
  for (const c of DEFAULT_UGC_CREATORS) {
    if (!slugs.has(c.slug)) creators.push(c);
  }
  return { ...base, creators };
}

const UGC_COPY_VARIANTS: ReadonlyArray<{ title: string; caption: string }> = [
  {
    title: "Improve your back pain",
    caption: "Remedy is a back pain rehab app. Follow-along exercises that help you improve. Get it — link in bio.",
  },
  {
    title: "Treat back pain at home",
    caption: "A rehab app built to treat back pain — not random stretches. Open Remedy and start. Link in bio.",
  },
  {
    title: "Rehab for backpain",
    caption: "backpain rehab on your phone. Remedy walks you through each exercise. Link in bio.",
  },
];

function clipTitleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || "Untitled clip";
}

function emptyLibrary(): DashUgcLibrary {
  return { folders: [], clips: {} };
}

function normalizeLibrary(raw: unknown): DashUgcLibrary {
  if (!raw || typeof raw !== "object") return emptyLibrary();
  const o = raw as Partial<DashUgcLibrary>;
  const folders = Array.isArray(o.folders)
    ? o.folders.filter((f): f is DashUgcFolder => Boolean(f && typeof f.id === "string" && typeof f.name === "string"))
    : [];
  const clips: Record<string, DashUgcClipMeta> = {};
  if (o.clips && typeof o.clips === "object") {
    for (const [uuid, meta] of Object.entries(o.clips)) {
      if (!meta || typeof meta !== "object") continue;
      clips[uuid] = {
        folderId: typeof meta.folderId === "string" ? meta.folderId : null,
        clipTitle: typeof meta.clipTitle === "string" ? meta.clipTitle : "",
      };
    }
  }
  return { folders, clips };
}

async function readLibrary(bucket: R2Bucket): Promise<DashUgcLibrary> {
  try {
    const obj = await bucket.get(UGC_LIBRARY_KEY);
    if (!obj) return emptyLibrary();
    return normalizeLibrary(JSON.parse(await obj.text()));
  } catch {
    return emptyLibrary();
  }
}

async function writeLibrary(bucket: R2Bucket, lib: DashUgcLibrary): Promise<void> {
  await bucket.put(UGC_LIBRARY_KEY, JSON.stringify(normalizeLibrary(lib)), {
    httpMetadata: { contentType: "application/json" },
  });
}

function refreshCover(lib: DashUgcLibrary, folderId: string): void {
  const folder = lib.folders.find((f) => f.id === folderId);
  if (!folder) return;
  const members = Object.entries(lib.clips)
    .filter(([, c]) => c.folderId === folderId)
    .map(([uuid]) => uuid);
  if (folder.coverUuid && members.includes(folder.coverUuid)) return;
  folder.coverUuid = members[0] ?? null;
}

function applyLibrary(ugc: DashUgc, lib: DashUgcLibrary): DashUgc {
  const folders = lib.folders.length > 0 ? lib.folders : (ugc.folders ?? []);
  return {
    ...ugc,
    folders,
    videos: ugc.videos.map((v) => {
      const meta = lib.clips[v.uuid];
      return {
        ...v,
        clipTitle: meta?.clipTitle?.trim() || v.clipTitle || clipTitleFromFileName(v.fileName),
        folderId: meta?.folderId ?? v.folderId ?? null,
      };
    }),
  };
}

function defaultUgcCopy(seed: string): { title: string; caption: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return UGC_COPY_VARIANTS[h % UGC_COPY_VARIANTS.length];
}

function writeUgc(dash: Dashboard, ugc: DashUgc): void {
  ugc.pendingReview = ugc.videos.filter((v) => v.status === "pending_review" || v.status === "uploaded").length;
  (dash as Dashboard & { ugc: DashUgc }).ugc = ugc;
}

interface DashPost {
  id: number;
  status: string;
  publishedAt?: string | null;
  shortUrl?: string | null;
  ctaReview?: boolean;
}

interface ManualPosting {
  currentPostId: number | null;
  completedIds: number[];
}

interface Dashboard {
  updatedAt: string;
  posts: DashPost[];
  settings?: { manualPosting?: ManualPosting; [key: string]: unknown };
  summary: {
    statusCounts: Array<{ status: string; count: number }>;
    diagnosisCounts: Array<{ diagnosis: string; count: number }>;
    topPosts: DashPost[];
    totalPublished: number;
  };
  [key: string]: unknown;
}

function advanceManual(dash: Dashboard, postId: number): ManualPosting {
  const prev = dash.settings?.manualPosting ?? { currentPostId: null, completedIds: [] };
  const completedIds = [...new Set([...prev.completedIds, postId])].sort((a, b) => a - b);
  const post = dash.posts.find((p) => p.id === postId);
  if (post) {
    post.status = "published";
    post.publishedAt = post.publishedAt ?? new Date().toISOString();
    post.shortUrl = null;
  }
  const ready = dash.posts
    .filter((p) => p.status === "approved" && !completedIds.includes(p.id))
    .map((p) => p.id);
  const currentPostId = ready.length ? ready[Math.floor(Math.random() * ready.length)]! : null;
  const state = { currentPostId, completedIds };
  dash.settings = { ...dash.settings, manualPosting: state };
  return state;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function readDashboard(bucket: R2Bucket): Promise<Dashboard | null> {
  const obj = await bucket.get(DASHBOARD_KEY);
  if (!obj) return null;
  return JSON.parse(await obj.text()) as Dashboard;
}

function recount(dash: Dashboard): void {
  const counts: Record<string, number> = {};
  for (const p of dash.posts) counts[p.status] = (counts[p.status] ?? 0) + 1;
  dash.summary.statusCounts = Object.entries(counts).map(([status, count]) => ({ status, count }));
  dash.updatedAt = new Date().toISOString();
}

async function writeDashboard(bucket: R2Bucket, dash: Dashboard): Promise<void> {
  recount(dash);
  await bucket.put(DASHBOARD_KEY, JSON.stringify(dash), { httpMetadata: { contentType: "application/json" } });
}

async function readOverrides(bucket: R2Bucket): Promise<LibraryOverrides> {
  const obj = await bucket.get(LIBRARY_OVERRIDES_KEY);
  if (!obj) return { rejectedIllustrations: [], deletedScreenshots: [] };
  try {
    const parsed = JSON.parse(await obj.text()) as Partial<LibraryOverrides>;
    return {
      rejectedIllustrations: Array.isArray(parsed.rejectedIllustrations) ? parsed.rejectedIllustrations : [],
      deletedScreenshots: Array.isArray(parsed.deletedScreenshots) ? parsed.deletedScreenshots : [],
    };
  } catch {
    return { rejectedIllustrations: [], deletedScreenshots: [] };
  }
}

async function writeOverrides(bucket: R2Bucket, next: LibraryOverrides): Promise<void> {
  await bucket.put(LIBRARY_OVERRIDES_KEY, JSON.stringify(next), {
    httpMetadata: { contentType: "application/json" },
  });
}

async function pushPending(bucket: R2Bucket, action: PendingAction): Promise<void> {
  const obj = await bucket.get(PENDING_KEY);
  const current = obj ? (JSON.parse(await obj.text()) as { actions: PendingAction[] }) : { actions: [] };
  current.actions = current.actions ?? [];
  current.actions.push(action);
  await bucket.put(PENDING_KEY, JSON.stringify(current), { httpMetadata: { contentType: "application/json" } });
}

async function dropPendingForUuid(bucket: R2Bucket, uuid: string): Promise<void> {
  const obj = await bucket.get(PENDING_KEY);
  if (!obj) return;
  const current = JSON.parse(await obj.text()) as { actions: PendingAction[] };
  current.actions = (current.actions ?? []).filter((a) => a.uuid !== uuid);
  await bucket.put(PENDING_KEY, JSON.stringify(current), { httpMetadata: { contentType: "application/json" } });
}

export const onRequest = async (context: { request: Request; env: Env; params: { path?: string | string[] } }): Promise<Response> => {
  const url = new URL(context.request.url);
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  const bucket = context.env.SLIDES;
  const method = context.request.method;

  if (method === "GET" && parts[0] === "tiktok" && parts[1] === "callback") {
    const oauthCode = url.searchParams.get("code");
    const error = url.searchParams.get("error") ?? url.searchParams.get("error_description");
    if (error) {
      return new Response(`TikTok said no: ${error}`, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    if (!oauthCode) {
      return new Response("Missing ?code= from TikTok. Close this tab and try Connect again.", {
        status: 400,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    await bucket.put(TIKTOK_OAUTH_KEY, JSON.stringify({ code: oauthCode, at: new Date().toISOString() }), {
      httpMetadata: { contentType: "application/json" },
    });
    return new Response(
      `<!doctype html><html><body style="font-family:system-ui;background:#f7f2e9;color:#1c1917;padding:48px;max-width:480px">
        <h1 style="color:#33663f">TikTok authorized</h1>
        <p>You can close this tab. On your PC the engine will finish connecting, then those 4 posts can go to drafts.</p>
        <p><a href="/" style="color:#33663f">Back to the studio</a></p>
      </body></html>`,
      { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }
  if (method === "GET" && parts[0] === "health") {
    return json({ ok: true, engine: "cloud", snapshotOnly: true });
  }

  const studioPassword = (context.env.STUDIO_PASSWORD ?? "").trim();

  if (method === "POST" && parts[0] === "auth" && parts[1] === "login") {
    if (!studioPassword) return json({ ok: true, authRequired: false });
    const blocked = await checkWriteLimit(bucket);
    if (blocked) return json({ ok: false, error: blocked }, 429);
    const body = (await context.request.json().catch(() => ({}))) as { password?: string };
    const password = typeof body.password === "string" ? body.password : "";
    if (!password || !(await safeEqual(password, studioPassword))) {
      return json({ ok: false, error: "Wrong password." }, 401);
    }
    const token = await signSession(studioPassword);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookieHeader(token, SESSION_TTL_SECONDS),
      },
    });
  }

  if (method === "POST" && parts[0] === "auth" && parts[1] === "logout") {
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "Set-Cookie": sessionCookieHeader("", 0),
      },
    });
  }

  const sessionOk = studioPassword
    ? await verifySession(readCookie(context.request, SESSION_COOKIE), studioPassword)
    : true;
  if (studioPassword && !sessionOk) {
    return json({ ok: false, error: "auth_required" }, 401);
  }

  const me = resolveCloudIdentity(context.request, context.env);
  if (method === "GET" && parts[0] === "me") {
    return json({ email: me.email, role: me.role, creatorSlug: me.creatorSlug, engine: "cloud" });
  }
  if (method === "GET" && parts[0] === "ugc" && parts[1] === "insights") {
    const dash = await readDashboard(bucket);
    return json(dashUgc(dash ?? { updatedAt: "", posts: [], summary: { statusCounts: [], diagnosisCounts: [], topPosts: [], totalPublished: 0 } }).insights ?? { videos: [], whatWorked: [], diagnosisCounts: [], published: 0, pendingReview: 0 });
  }
  if (method === "GET" && parts[0] === "ugc" && !parts[1]) {
    const dash = await readDashboard(bucket);
    const ugc = dashUgc(dash ?? { updatedAt: "", posts: [], summary: { statusCounts: [], diagnosisCounts: [], topPosts: [], totalPublished: 0 } });
    const lib = await readLibrary(bucket);
    return json(applyLibrary(ugc, lib));
  }
  if (method === "GET" && parts[0] === "slides" && parts[1] && parts[2] && !parts[3]) {
    const id = Number(parts[1]);
    const idx = Number(parts[2]);
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(idx) || idx < 0 || idx > 20) {
      return json({ ok: false, error: "Bad id" }, 400);
    }
    const n = idx + 1;
    let obj = await bucket.get(`growth/posts/${id}/v20/slide-${n}.jpg`);
    if (!obj) {
      const listed = await bucket.list({ prefix: `growth/posts/${id}/` });
      const hit = listed.objects.find((o) => o.key.endsWith(`/slide-${n}.jpg`));
      if (hit) obj = await bucket.get(hit.key);
    }
    if (!obj) return json({ ok: false, error: "Slide not found" }, 404);
    const download = url.searchParams.get("download") === "1";
    const name = `remedy-${id}-slide-${String(n).padStart(2, "0")}.jpg`;
    return new Response(await obj.arrayBuffer(), {
      headers: {
        "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg",
        "Content-Disposition": download ? `attachment; filename="${name}"` : `inline; filename="${name}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }
  if (method === "GET" && parts[0] === "shorts" && parts[1] && !parts[2] && parts[1] !== "build") {
    const id = Number(parts[1]);
    if (!Number.isFinite(id) || id <= 0) return json({ ok: false, error: "Bad id" }, 400);
    const obj = await bucket.get(`growth/posts/${id}/short.mp4`);
    if (!obj) return json({ ok: false, error: "Short not found" }, 404);
    const download = url.searchParams.get("download") === "1";
    return new Response(await obj.arrayBuffer(), {
      headers: {
        "Content-Type": obj.httpMetadata?.contentType ?? "video/mp4",
        "Content-Disposition": download
          ? `attachment; filename="remedy-${id}-short.mp4"`
          : `inline; filename="remedy-${id}-short.mp4"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }
  if (method === "GET" && parts[0] === "ugc" && parts[1] === "videos" && parts[3] === "file" && parts[2]) {
    const dash = await readDashboard(bucket);
    const video = dashUgc(dash ?? { updatedAt: "", posts: [], summary: { statusCounts: [], diagnosisCounts: [], topPosts: [], totalPublished: 0 } }).videos.find((v) => v.uuid === parts[2]);
    const key = video ? `growth/ugc/${video.creatorSlug}/${video.uuid}.mp4` : `growth/ugc/sohan/${parts[2]}.mp4`;
    let obj = await bucket.get(key);
    if (!obj && video) {
      const mov = await bucket.get(`growth/ugc/${video.creatorSlug}/${video.uuid}.mov`);
      obj = mov;
    }
    if (!obj) return json({ ok: false, error: "Not found" }, 404);
    const download = url.searchParams.get("download") === "1";
    const ext = video?.fileName.toLowerCase().endsWith(".mov") ? ".mov" : ".mp4";
    const name = `remedy-ugc-${parts[2]}${ext}`;
    return new Response(await obj.arrayBuffer(), {
      headers: {
        "Content-Type": obj.httpMetadata?.contentType ?? "video/mp4",
        "Content-Disposition": download ? `attachment; filename="${name}"` : `inline; filename="${name}"`,
        "Cache-Control": "private, max-age=60",
      },
    });
  }
  if (method === "GET" && parts[0] === "snapshot") {
    const dash = await readDashboard(bucket);
    if (!dash) return json({ ok: false, error: "No snapshot yet" }, 404);
    return json(dash);
  }
  if (method === "GET" && parts[0] === "queue") {
    const dash = await readDashboard(bucket);
    return json((dash?.posts ?? []).filter((p) => p.status === "queued"));
  }
  if (method === "GET" && parts[0] === "posts") {
    const dash = await readDashboard(bucket);
    const status = url.searchParams.get("status");
    const rows = dash?.posts ?? [];
    return json(status ? rows.filter((p) => p.status === status) : rows);
  }
  if (method === "GET" && parts[0] === "hooks") {
    const dash = await readDashboard(bucket);
    return json((dash as { hooks?: unknown[] } | null)?.hooks ?? []);
  }
  if (method === "GET" && parts[0] === "learnings") {
    const dash = await readDashboard(bucket);
    return json((dash as { learnings?: unknown[] } | null)?.learnings ?? []);
  }
  if (method === "GET" && parts[0] === "summary") {
    const dash = await readDashboard(bucket);
    return json(dash?.summary ?? { statusCounts: [], diagnosisCounts: [], topPosts: [], totalPublished: 0 });
  }
  if (method === "GET" && parts[0] === "settings") {
    const dash = await readDashboard(bucket);
    return json({ snapshotOnly: true, ...((dash as { settings?: object } | null)?.settings ?? {}) });
  }
  if (method === "GET" && parts[0] === "formulas") {
    const dash = await readDashboard(bucket);
    return json((dash as { formulas?: unknown[] } | null)?.formulas ?? []);
  }
  if (method === "GET" && parts[0] === "templates") {
    const dash = await readDashboard(bucket);
    return json((dash as { templates?: unknown[] } | null)?.templates ?? []);
  }

  interface DashInsights {
    summaries?: unknown[];
    experiments?: unknown[];
    coverage?: unknown;
    signals?: Array<{ dimension?: string }>;
    cycle?: unknown;
  }

  if (method === "GET" && parts[0] === "insights") {
    const dash = await readDashboard(bucket);
    const insights = ((dash as { insights?: DashInsights } | null)?.insights ?? {}) as DashInsights;
    if (parts[1] === "summaries") return json(insights.summaries ?? []);
    if (parts[1] === "experiments") return json(insights.experiments ?? []);
    if (parts[1] === "coverage") return json(insights.coverage ?? { screenshots: [], svgs: [], templates: [], formulas: [], cold: { screenshots: [], svgs: [], templates: [] } });
    if (parts[1] === "cycle") return json(insights.cycle ?? null);
    if (parts[1] === "signals") {
      const dimension = url.searchParams.get("dimension");
      const all = insights.signals ?? [];
      return json(dimension ? all.filter((s) => s.dimension === dimension) : all);
    }
    return json({ ok: false, error: "Not found" }, 404);
  }
  if (method === "GET" && parts[0] === "experiments") {
    const dash = await readDashboard(bucket);
    return json(((dash as { insights?: DashInsights } | null)?.insights?.experiments ?? []));
  }

  // All write operations go through the rate limiter
  if (method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
    const blocked = await checkWriteLimit(bucket);
    if (blocked) return json({ ok: false, error: blocked }, 429);
    const ugcWrite = parts[0] === "ugc";
    if (!ugcWrite && me.role !== "operator") {
      return json({ ok: false, error: "This action is for the studio operator." }, 403);
    }
  }

  if (method === "POST" && parts[0] === "ugc" && parts[1] === "videos" && !parts[2]) {
    const form = await context.request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ ok: false, error: "Choose a video to upload." }, 400);
    if (file.size > 100 * 1024 * 1024) return json({ ok: false, error: "Video is too large (100MB max)." }, 400);
    const mime = file.type || "video/mp4";
    if (!["video/mp4", "video/quicktime"].includes(mime) && !/\.(mp4|mov)$/i.test(file.name)) {
      return json({ ok: false, error: "Upload an mp4 or mov." }, 400);
    }
    const requested = typeof form.get("creatorSlug") === "string" ? String(form.get("creatorSlug")).trim().toLowerCase() : "sohan";
    const slug = me.role === "creator" ? (me.creatorSlug ?? "") : requested || "sohan";
    if (!slug) return json({ ok: false, error: "Your account is not mapped to a UGC creator." }, 403);
    if (me.role === "creator" && slug !== me.creatorSlug) {
      return json({ ok: false, error: "You can only upload to your own tab." }, 403);
    }
    const uuid = typeof form.get("uuid") === "string" && form.get("uuid") ? String(form.get("uuid")) : crypto.randomUUID();
    const ext = file.name.toLowerCase().endsWith(".mov") || mime === "video/quicktime" ? "mov" : "mp4";
    const r2Key = `growth/ugc/${slug}/${uuid}.${ext}`;
    const bytes = await file.arrayBuffer();
    await bucket.put(r2Key, bytes, {
      httpMetadata: { contentType: mime === "video/quicktime" ? "video/quicktime" : "video/mp4" },
    });
    const stored = await bucket.get(r2Key);
    if (!stored) return json({ ok: false, error: "Upload did not land. Try again." }, 500);
    const { title, caption } = defaultUgcCopy(uuid);
    const video: DashUgcVideo = {
      uuid,
      creatorSlug: slug,
      creatorName: ugcCreatorName(slug),
      title,
      caption,
      status: "pending_review",
      fileName: file.name,
      byteSize: file.size,
      durationSec: null,
      scheduledAt: null,
      publishedAt: null,
      diagnosis: null,
      rejectReason: null,
      error: null,
      createdAt: new Date().toISOString(),
      fileUrl: `/api/ugc/videos/${uuid}/file`,
      analytics: [],
      clipTitle: clipTitleFromFileName(file.name),
      folderId: null,
    };
    const lib = await readLibrary(bucket);
    lib.clips[uuid] = { folderId: null, clipTitle: clipTitleFromFileName(file.name) };
    await writeLibrary(bucket, lib);
    const dash = await readDashboard(bucket);
    if (dash) {
      const ugc = dashUgc(dash);
      if (!ugc.videos.some((v) => v.uuid === uuid)) ugc.videos.unshift(video);
      writeUgc(dash, ugc);
      await writeDashboard(bucket, dash);
    }
    await pushPending(bucket, {
      type: "ugc_upload",
      uuid,
      creatorSlug: slug,
      r2Key,
      title,
      caption,
      fileName: file.name,
      mimeType: mime,
      byteSize: file.size,
      at: new Date().toISOString(),
    });
    return json({ ok: true, video });
  }

  if (method === "POST" && parts[0] === "ugc" && parts[1] === "folders" && !parts[2]) {
    const body = (await context.request.json().catch(() => ({}))) as { name?: string; creatorSlug?: string };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    const creatorSlug = body.creatorSlug === "ai" ? "ai" : body.creatorSlug === "sohan" ? "sohan" : "";
    if (!name) return json({ ok: false, error: "Name the folder." }, 400);
    if (!creatorSlug) return json({ ok: false, error: "Pick Sohan or AI." }, 400);
    const lib = await readLibrary(bucket);
    const folder: DashUgcFolder = {
      id: crypto.randomUUID(),
      name,
      creatorSlug,
      createdAt: new Date().toISOString(),
      coverUuid: null,
    };
    lib.folders.unshift(folder);
    await writeLibrary(bucket, lib);
    return json({ ok: true, folder });
  }

  if (method === "PATCH" && parts[0] === "ugc" && parts[1] === "folders" && parts[2] && !parts[3]) {
    const body = (await context.request.json().catch(() => ({}))) as { name?: string };
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
    if (!name) return json({ ok: false, error: "Name the folder." }, 400);
    const lib = await readLibrary(bucket);
    const folder = lib.folders.find((f) => f.id === parts[2]);
    if (!folder) return json({ ok: false, error: "Folder not found" }, 404);
    folder.name = name;
    await writeLibrary(bucket, lib);
    return json({ ok: true, folder });
  }

  if (method === "DELETE" && parts[0] === "ugc" && parts[1] === "folders" && parts[2] && !parts[3]) {
    const lib = await readLibrary(bucket);
    const before = lib.folders.length;
    lib.folders = lib.folders.filter((f) => f.id !== parts[2]);
    for (const clip of Object.values(lib.clips)) {
      if (clip.folderId === parts[2]) clip.folderId = null;
    }
    if (lib.folders.length === before) return json({ ok: false, error: "Folder not found" }, 404);
    await writeLibrary(bucket, lib);
    return json({ ok: true });
  }

  if (method === "POST" && parts[0] === "ugc" && parts[1] === "videos" && parts[2] && parts[3] === "organize") {
    const body = (await context.request.json().catch(() => ({}))) as { folderId?: string | null; clipTitle?: string };
    const lib = await readLibrary(bucket);
    const dash = await readDashboard(bucket);
    const ugc = dashUgc(dash ?? { updatedAt: "", posts: [], summary: { statusCounts: [], diagnosisCounts: [], topPosts: [], totalPublished: 0 } });
    const video = ugc.videos.find((v) => v.uuid === parts[2]);
    if (!video) return json({ ok: false, error: "Not found" }, 404);
    const current = lib.clips[video.uuid] ?? { folderId: video.folderId ?? null, clipTitle: video.clipTitle || clipTitleFromFileName(video.fileName) };
    const nextFolderId = body.folderId === undefined ? current.folderId : body.folderId;
    if (nextFolderId && !lib.folders.some((f) => f.id === nextFolderId)) {
      return json({ ok: false, error: "Folder not found" }, 404);
    }
    const nextTitle =
      typeof body.clipTitle === "string" && body.clipTitle.trim()
        ? body.clipTitle.trim().slice(0, 80)
        : current.clipTitle || clipTitleFromFileName(video.fileName);
    const prevFolder = current.folderId;
    lib.clips[video.uuid] = { folderId: nextFolderId ?? null, clipTitle: nextTitle };
    if (nextFolderId) {
      const folder = lib.folders.find((f) => f.id === nextFolderId);
      if (folder && !folder.coverUuid) folder.coverUuid = video.uuid;
    }
    if (prevFolder && prevFolder !== nextFolderId) refreshCover(lib, prevFolder);
    if (nextFolderId) refreshCover(lib, nextFolderId);
    await writeLibrary(bucket, lib);
    return json({ ok: true });
  }

  if (method === "POST" && parts[0] === "ugc" && parts[1] === "videos" && parts[2] && (parts[3] === "approve" || parts[3] === "reject" || parts[3] === "caption")) {
    if (me.role !== "operator") return json({ ok: false, error: "This action is for the studio operator." }, 403);
    const dash = await readDashboard(bucket);
    if (!dash) return json({ ok: false, error: "No snapshot yet" }, 400);
    const ugc = dashUgc(dash);
    const video = ugc.videos.find((v) => v.uuid === parts[2]);
    if (!video) return json({ ok: false, error: "Not found" }, 404);
    const body = (await context.request.json().catch(() => ({}))) as { title?: string; caption?: string; reason?: string };
    if (typeof body.title === "string" && body.title.trim()) video.title = body.title.trim().slice(0, 255);
    if (typeof body.caption === "string" && body.caption.trim()) video.caption = body.caption.trim().slice(0, 10_000);
    if (parts[3] === "approve") {
      video.status = "approved";
      video.rejectReason = null;
      await pushPending(bucket, { type: "ugc_approve", uuid: video.uuid, title: video.title, caption: video.caption, at: new Date().toISOString() });
    } else if (parts[3] === "reject") {
      video.status = "rejected";
      video.rejectReason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : null;
      await pushPending(bucket, { type: "ugc_reject", uuid: video.uuid, reason: video.rejectReason ?? undefined, at: new Date().toISOString() });
    } else {
      await pushPending(bucket, { type: "ugc_caption", uuid: video.uuid, title: video.title, caption: video.caption, at: new Date().toISOString() });
    }
    writeUgc(dash, ugc);
    await writeDashboard(bucket, dash);
    return json({ ok: true, video });
  }

  if (method === "DELETE" && parts[0] === "ugc" && parts[1] === "videos" && parts[2] && !parts[3]) {
    if (me.role !== "operator") return json({ ok: false, error: "This action is for the studio operator." }, 403);
    const dash = await readDashboard(bucket);
    const ugc = dashUgc(dash ?? { updatedAt: "", posts: [], summary: { statusCounts: [], diagnosisCounts: [], topPosts: [], totalPublished: 0 } });
    const video = ugc.videos.find((v) => v.uuid === parts[2]);
    const slug = video?.creatorSlug ?? "sohan";
    await bucket.delete(`growth/ugc/${slug}/${parts[2]}.mp4`).catch(() => undefined);
    await bucket.delete(`growth/ugc/${slug}/${parts[2]}.mov`).catch(() => undefined);
    if (dash) {
      ugc.videos = ugc.videos.filter((v) => v.uuid !== parts[2]);
      writeUgc(dash, ugc);
      await writeDashboard(bucket, dash);
    }
    await dropPendingForUuid(bucket, parts[2]);
    return json({ ok: true });
  }

  if (method === "POST" && parts[0] === "manual" && parts[1] === "complete") {
    const body = (await context.request.json().catch(() => ({}))) as { postId?: number };
    const postId = body.postId;
    if (typeof postId !== "number" || !Number.isFinite(postId) || postId <= 0) {
      return json({ ok: false, error: "postId is required" }, 400);
    }
    const dash = await readDashboard(bucket);
    if (!dash) return json({ ok: false, error: "No snapshot yet" }, 400);
    const post = dash.posts.find((p) => p.id === postId);
    if (!post) return json({ ok: false, error: "Post not found" }, 404);
    const state = advanceManual(dash, postId);
    await bucket.delete(`growth/posts/${postId}/short.mp4`).catch(() => undefined);
    await pushPending(bucket, { type: "manual_complete", postId, at: new Date().toISOString() });
    await writeDashboard(bucket, dash);
    return json({ ok: true, ...state });
  }

  if (method === "POST" && parts[0] === "posts" && parts[2] === "approve") {
    const id = Number(parts[1]);
    const dash = await readDashboard(bucket);
    if (!dash) return json({ ok: false, error: "No snapshot yet" }, 400);
    const post = dash.posts.find((p) => p.id === id);
    if (!post || post.status !== "queued") return json({ ok: false, error: "Not in queue" }, 400);
    post.status = "approved";
    await pushPending(bucket, { type: "approve", postId: id, at: new Date().toISOString() });
    await writeDashboard(bucket, dash);
    return json({ ok: true });
  }

  if (method === "POST" && parts[0] === "posts" && parts[2] === "reject") {
    const id = Number(parts[1]);
    const dash = await readDashboard(bucket);
    if (!dash) return json({ ok: false, error: "No snapshot yet" }, 400);
    const post = dash.posts.find((p) => p.id === id);
    if (!post || post.status !== "queued") return json({ ok: false, error: "Not in queue" }, 400);
    const body = await context.request.json().catch(() => ({})) as { reason?: string };
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : undefined;
    post.status = "rejected";
    await pushPending(bucket, { type: "reject", postId: id, at: new Date().toISOString(), reason });
    await writeDashboard(bucket, dash);
    return json({ ok: true });
  }

  if (method === "POST" && parts[0] === "queue" && parts[1] === "approve-all") {
    const dash = await readDashboard(bucket);
    if (!dash) return json({ ok: false, error: "No snapshot yet" }, 400);
    let approved = 0;
    for (const post of dash.posts) {
      if (post.status !== "queued" || post.ctaReview) continue;
      post.status = "approved";
      await pushPending(bucket, { type: "approve", postId: post.id, at: new Date().toISOString() });
      approved++;
    }
    await writeDashboard(bucket, dash);
    return json({ ok: true, approved });
  }

  if (method === "POST" && parts[0] === "experiments" && !parts[1]) {
    const body = (await context.request.json().catch(() => ({}))) as { postId?: number; dimension?: PendingAction["dimension"] };
    if (typeof body.postId !== "number") return json({ ok: false, error: "postId is required" }, 400);
    const dash = await readDashboard(bucket);
    const post = dash?.posts.find((p) => p.id === body.postId);
    if (!post) return json({ ok: false, error: "Post not found in snapshot" }, 404);
    return json({ ok: false, error: "Generate is paused. No A/B variants until Rahul turns generate back on." }, 403);
  }

  if (method === "POST" && parts[0] === "shorts" && parts[1] === "build") {
    return json({ ok: false, error: "Generate is paused. Shorts stay as-is until posting starts." }, 403);
  }

  if (method === "POST" && (parts[0] === "generate" || parts[0] === "queue" || parts[0] === "analytics" || parts[0] === "cycle")) {
    return json({ ok: false, error: "Generate is paused. This action needs the PC engine after you turn generate back on." }, 503);
  }

  const SCREENSHOT_PREFIX = "growth/screenshots/";
  const SCREENSHOT_META_KEY = `${SCREENSHOT_PREFIX}meta.json`;
  const SKIP_SHOT_FILES = new Set(["crop-config.json", "meta.json", "icon.png", "library-overrides.json"]);
  const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
  const DEFAULT_DESCRIPTIONS: Record<string, string> = {
    "home.png": "Home: today's session + week days. Use for start-today / weekly plan.",
    "session.png": "Session: glute-bridge video + 14 reps. Use for in-app exercise proof.",
    "cat_cow.png": "Session: cat-cow stretch video. Use for guided stretch proof.",
    "progress.png": "Progress: week 4/5 + pain trend. Use for recovery tracking.",
    "pain_check.png": "Pain check: 1–10 slider. Use for check-in / before-session.",
    "workout_days.png": "Workout days + reminder. Use for schedule / habit slides.",
    "session_preview.png": "Preview: 19 min, 5 exercises. Use for session length / plan.",
    "profile.png": "Profile: stats + plan. Use for personal progress / identity.",
    "profile_original.png": "Profile original, full screen. Use if you need the uncropped profile.",
    "img_0460.png": "Splash: Remedy + back pain relief. Use for brand / first-impression.",
    "img_0461.png": "Workout days picker + session list. Use for schedule / 3-day plan.",
    "img_0462.png": "Progress: pain trend + activity bars. Use for recovery proof.",
    "img_0463.png": "Your Program: pain, goal, days. Use for tailored-plan proof.",
    "img_0464.jpeg": "Stretch reminders on, every 30 min. Use for reminder / habit.",
    "crop_home.png": "Crop: today's session card + Start Session. Use for start-today CTA, not the full home screen.",
    "crop_home_2.png": "Crop: weekly sessions, completed and not completed and in progress. Use for accountability and tracking session completed",
    "crop_img_0461.png": "Crop: workout days picker + 3-session plan. Use for detailed schedule close-up.",
    "crop_img_0462.png": "Crop: pain trends. Use for recovery proof close-up.",
    "crop_img_0462_2.png": "Crop: activity bars. Use for accountability/tracking",
    "crop_img_0462_4.png": "Crop: pain trend + activity bars. Use for recovery proof close-up + accountability + visual display",
    "crop_img_0465.png": "Crop: single-leg glute bridge video. Use for exercise close-up.",
    "crop_img_0469.png": "Crop: thoracic extension on chair. Use for desk/mobility close-up.",
    "crop_img_0470.png": "Crop: bird dog hold. Use for core/stability close-up.",
    "crop_img_0472.png": "Crop: barbell hip thrust. Use for gym strength close-up.",
    "crop_img_0473.png": "Crop: bodyweight squat. Use for no-equipment close-up.",
    "crop_cat_cow.png": "Crop: cat-cow video player. Use for guided stretch close-up.",
    "crop_pain_check.png": "Crop: 1–10 pain slider. Use for check-in close-up.",
    "crop_profile.png": "Crop: profile stats + plan. Use only when the slide is about identity + plan. has a bit of reminders as well",
    "crop_progress.png": "Crop: week ring Use for visual tracking of weekly progress",
    "crop_progress_2.png": "Crop: larger week ring + weekly completions. Use as a larger accountability/tracking ss",
    "crop_progress_3.png": "Crop: accountability/weekly session completed. use for accountability",
    "crop_session.png": "Crop: exercise video + reps counter. Use for in-app form proof.",
    "crop_session_preview.png": "Crop: session preview Use for plan/length close-up of a session - displays minutes, exercises, focus,etc",
    "img_0465.png": "Session: single-leg glute bridge. Use for exercise video proof.",
    "img_0466.png": "Session: goblet squat + dumbbell. Use for gym exercise proof.",
    "img_0467.png": "Session: child's pose hold timer. Use for stretch / cool-down.",
    "img_0469.png": "Session: thoracic extension on chair. Use for desk / mobility.",
    "img_0470.png": "Session: bird dog hold. Use for core / stability proof.",
    "img_0471.png": "Session: dead bug, 10 reps. Use for core exercise proof.",
    "img_0472.png": "Session: barbell hip thrust. Use for gym strength proof.",
    "img_0473.png": "Session: bodyweight squat. Use for no-equipment exercise.",
    "img_0475.png": "Session: kettlebell deadlift. Use for gym hinge / lift.",
    "img_0476.png": "Session: kettlebell deadlift (alt). Use for gym hinge / lift.",
    "img_0477.png": "Session: split squat, 10 reps. Use for single-leg strength.",
    "img_0524.png": "Founder: 4 in 5 people get back pain. Use for lifetime-stat / why-we-built slides.",
    "img_0525.png": "Education: 50% less pain in ~6 weeks chart. Use for research / hope / timeline.",
    "img_0526.png": "Onboarding: where did you hear about us. Use for first-touch / discovery.",
    "img_0527.png": "Onboarding: have you tried to fix it before. Use for stretch-failed / YouTube-failed.",
    "img_0528.png": "Onboarding: main goal options (unselected). Prefer img_0529.",
    "img_0529.png": "Onboarding: main goal selected (pain + mobility). Use for tailored / personal plan.",
    "img_0530.png": "Onboarding: where is your back pain (lower selected). Use for tailored / not-generic.",
    "img_0531.png": "Onboarding: how long you've had it (3–12 months). Use for chronic / personal plan.",
    "img_0532.png": "Onboarding: how long you've had it (unselected). Prefer img_0531.",
    "img_0533.png": "Onboarding: pain type (stiff / ache / sharp). Use for personalization / mobility.",
    "img_0534.png": "Onboarding: activity level (desk / light / lifting). Use for desk-worker plan.",
    "img_0535.png": "Onboarding: what makes pain worse (unselected). Prefer img_0536.",
    "img_0536.png": "Onboarding: what makes pain worse (standing + mornings). Use for flare / sitting.",
    "img_0537.png": "Onboarding: equipment (gym / bands / floor). Use for no-gym / gym plan.",
    "img_0538.png": "Onboarding: 15 min + 4 days per week. Use for schedule / fits-your-life.",
    "img_0539.png": "Onboarding: building your plan. Use for personalization moment / analyzing answers.",
    "img_0540.png": "Onboarding: your matched Lower Back Pain Relief Program. Use for tailored-plan proof.",
  };

  function autoDescription(file: string, cropped: boolean, source?: string): string {
    const known = DEFAULT_DESCRIPTIONS[file];
    if (known) return known;
    if (cropped) {
      const src = (DEFAULT_DESCRIPTIONS[source ?? ""] ?? source ?? "screenshot").split(". Use")[0].trim();
      return `Crop: ${src}. Use for a close-up of that screen.`.slice(0, 160);
    }
    const stem = file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
    return `${stem}. Use when this screen matches the hook.`.slice(0, 160);
  }

  interface ShotMeta {
    description?: string;
    cropped?: boolean;
    source?: string;
    assign?: boolean;
  }
  const NEVER_ASSIGN = new Set(["img_0528.png", "img_0532.png", "img_0535.png"]);

  function safeScreenshotName(raw: string): string {
    const base = raw.split(/[/\\]/).pop()?.toLowerCase() ?? `upload_${Date.now()}.png`;
    const dot = base.lastIndexOf(".");
    const ext = dot >= 0 ? base.slice(dot) : ".png";
    const stem = (dot >= 0 ? base.slice(0, dot) : base).replace(/[^a-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
    return `${stem || `upload_${Date.now()}`}${IMAGE_EXT.has(ext) ? ext : ".png"}`;
  }

  async function readShotMeta(): Promise<Record<string, ShotMeta>> {
    const obj = await bucket.get(SCREENSHOT_META_KEY);
    if (!obj) return {};
    try {
      const parsed = JSON.parse(await obj.text()) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, ShotMeta>) : {};
    } catch {
      return {};
    }
  }

  async function writeShotMeta(meta: Record<string, ShotMeta>): Promise<void> {
    await bucket.put(SCREENSHOT_META_KEY, JSON.stringify(meta, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
  }

  async function patchDashScreenshots(mutator: (shots: DashScreenshot[]) => DashScreenshot[]): Promise<void> {
    const dash = await readDashboard(bucket);
    if (!dash) return;
    const shots = ((dash as { screenshots?: DashScreenshot[] }).screenshots ?? []);
    (dash as { screenshots?: DashScreenshot[] }).screenshots = mutator(shots);
    await writeDashboard(bucket, dash);
  }

  if (method === "GET" && parts[0] === "assets" && parts[1] === "screenshots" && !parts[2]) {
    const dash = await readDashboard(bucket);
    const fromSnap = (dash as { screenshots?: DashScreenshot[] } | null)?.screenshots;
    if (fromSnap?.length) return json(fromSnap);
    const listed = await bucket.list({ prefix: SCREENSHOT_PREFIX });
    const cropObj = await bucket.get(`${SCREENSHOT_PREFIX}crop-config.json`);
    const crop = cropObj ? (JSON.parse(await cropObj.text()) as Record<string, { skipTopPct: number; cropHPct: number }>) : {};
    const meta = await readShotMeta();
    const overrides = await readOverrides(bucket);
    const deleted = new Set(overrides.deletedScreenshots);
    const files = listed.objects
      .map((o) => o.key.slice(SCREENSHOT_PREFIX.length))
      .filter((file) => file && !SKIP_SHOT_FILES.has(file) && IMAGE_EXT.has(`.${file.split(".").pop()?.toLowerCase() ?? ""}`) && !deleted.has(file));
    return json(
      files.map((file) => {
        const entry = meta[file];
        const cropped = Boolean(entry?.cropped) || file.startsWith("crop_");
        return {
          file,
          skipTopPct: cropped ? 0 : (crop[file]?.skipTopPct ?? 0.09),
          cropHPct: cropped ? 1 : (crop[file]?.cropHPct ?? 0.45),
          exists: true,
          url: `https://slides.remedyrecoveries.com/growth/screenshots/${encodeURIComponent(file)}`,
          description: entry?.description || autoDescription(file, cropped, entry?.source),
          cropped,
          source: entry?.source,
        };
      }),
    );
  }

  if (method === "GET" && parts[0] === "assets" && parts[1] === "raw" && parts[2]) {
    const file = safeScreenshotName(parts[2]);
    const obj = await bucket.get(`${SCREENSHOT_PREFIX}${file}`);
    if (!obj) return json({ ok: false, error: "Not found" }, 404);
    const type = obj.httpMetadata?.contentType ?? "image/png";
    return new Response(await obj.arrayBuffer(), {
      headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" },
    });
  }

  if (method === "POST" && parts[0] === "assets" && parts[1] === "screenshots" && parts[3] === "meta" && parts[2]) {
    const file = safeScreenshotName(parts[2]);
    const body = (await context.request.json()) as { description?: unknown };
    if (typeof body.description !== "string" || body.description.length > 160) {
      return json({ ok: false, error: "Description must be 160 characters or less." }, 400);
    }
    const description = body.description.trim();
    const meta = await readShotMeta();
    meta[file] = { ...meta[file], description };
    await writeShotMeta(meta);
    await patchDashScreenshots((shots) =>
      shots.map((s) => (s.file === file ? { ...s, description } : s)),
    );
    return json({ ok: true, file, description });
  }

  if (method === "POST" && parts[0] === "assets" && parts[1] === "screenshots" && !parts[2]) {
    const form = await context.request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ ok: false, error: "Choose a photo to upload." }, 400);
    if (file.size > 12 * 1024 * 1024) return json({ ok: false, error: "Photo is too large (12MB max)." }, 400);
    const name = safeScreenshotName(typeof form.get("name") === "string" ? String(form.get("name")) : file.name);
    const cropped = form.get("cropped") === "1";
    const descriptionRaw = form.get("description");
    const sourceRaw = form.get("source");
    const source = typeof sourceRaw === "string" ? safeScreenshotName(sourceRaw) : undefined;
    const typed = typeof descriptionRaw === "string" ? descriptionRaw.trim().slice(0, 160) : "";
    const description = typed || autoDescription(name, cropped, source);
    await bucket.put(`${SCREENSHOT_PREFIX}${name}`, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "image/png" },
    });
    const thumb = form.get("thumb");
    if (thumb instanceof File) {
      const stem = name.replace(/\.[^.]+$/, "");
      await bucket.put(`${SCREENSHOT_PREFIX}thumbs/${stem}.jpg`, await thumb.arrayBuffer(), {
        httpMetadata: { contentType: "image/jpeg" },
      });
    }
    if (cropped) {
      const cropObj = await bucket.get(`${SCREENSHOT_PREFIX}crop-config.json`);
      const crop = cropObj ? (JSON.parse(await cropObj.text()) as Record<string, { skipTopPct: number; cropHPct: number }>) : {};
      crop[name] = { skipTopPct: 0, cropHPct: 1 };
      await bucket.put(`${SCREENSHOT_PREFIX}crop-config.json`, JSON.stringify(crop, null, 2), {
        httpMetadata: { contentType: "application/json" },
      });
    }
    const meta = await readShotMeta();
    meta[name] = {
      ...meta[name],
      description,
      ...(cropped ? { cropped: true, source } : {}),
      ...(NEVER_ASSIGN.has(name) ? { assign: false } : {}),
    };
    await writeShotMeta(meta);
    const overrides = await readOverrides(bucket);
    if (overrides.deletedScreenshots.includes(name)) {
      await writeOverrides(bucket, {
        ...overrides,
        deletedScreenshots: overrides.deletedScreenshots.filter((f) => f !== name),
      });
    }
    await patchDashScreenshots((shots) => {
      if (shots.some((s) => s.file === name)) return shots;
      return [
        ...shots,
        {
          file: name,
          description,
          cropped,
          source,
          exists: true,
          skipTopPct: cropped ? 0 : 0.09,
          cropHPct: cropped ? 1 : 0.45,
          url: `https://slides.remedyrecoveries.com/growth/screenshots/${encodeURIComponent(name)}`,
        },
      ];
    });
    return json({ ok: true, file: name });
  }

  if (method === "GET" && parts[0] === "assets" && parts[1] === "crop-config") {
    const obj = await bucket.get(`${SCREENSHOT_PREFIX}crop-config.json`);
    return json(obj ? JSON.parse(await obj.text()) : {});
  }

  if (method === "POST" && parts[0] === "assets" && parts[1] === "crop-config") {
    const body = await context.request.json();
    await bucket.put(`${SCREENSHOT_PREFIX}crop-config.json`, JSON.stringify(body, null, 2), {
      httpMetadata: { contentType: "application/json" },
    });
    return json({ ok: true });
  }

  if (method === "GET" && parts[0] === "assets" && parts[1] === "illustrations") {
    const dash = await readDashboard(bucket);
    const overrides = await readOverrides(bucket);
    const rejected = new Set(overrides.rejectedIllustrations);
    const items = ((dash as { illustrations?: DashIllustration[] } | null)?.illustrations ?? []).map((item) => ({
      ...item,
      fit: item.fit ?? (item.source === "illlustrations.co" || item.source === "Remedy flat" ? "scene" : "figure"),
      enabled: !rejected.has(item.id),
    }));
    return json(items);
  }

  if (method === "POST" && parts[0] === "assets" && parts[1] === "illustrations" && parts[3] === "enabled") {
    const id = decodeURIComponent(parts[2] ?? "");
    if (!id) return json({ ok: false, error: "Missing illustration id" }, 400);
    const body = (await context.request.json()) as { enabled?: boolean };
    if (typeof body.enabled !== "boolean") return json({ ok: false, error: "enabled must be boolean" }, 400);
    const dash = await readDashboard(bucket);
    const known = ((dash as { illustrations?: DashIllustration[] } | null)?.illustrations ?? []).some((i) => i.id === id);
    if (!known && dash) {
      return json({ ok: false, error: "Unknown illustration" }, 404);
    }
    const overrides = await readOverrides(bucket);
    const rejected = new Set(overrides.rejectedIllustrations);
    if (body.enabled) rejected.delete(id);
    else rejected.add(id);
    await writeOverrides(bucket, { ...overrides, rejectedIllustrations: [...rejected] });
    if (dash) {
      const illustrations = ((dash as { illustrations?: DashIllustration[] }).illustrations ?? []).map((item) =>
        item.id === id ? { ...item, enabled: body.enabled } : item,
      );
      (dash as { illustrations?: DashIllustration[] }).illustrations = illustrations;
      await writeDashboard(bucket, dash);
    }
    return json({ ok: true, id, enabled: body.enabled });
  }

  if (method === "DELETE" && parts[0] === "assets" && parts[1] === "screenshots" && parts[2]) {
    const file = safeScreenshotName(parts[2]);
    await bucket.delete(`${SCREENSHOT_PREFIX}${file}`);
    await bucket.delete(`${SCREENSHOT_PREFIX}thumbs/${file.replace(/\.[^.]+$/, "")}.jpg`);
    const overrides = await readOverrides(bucket);
    const deleted = new Set(overrides.deletedScreenshots);
    deleted.add(file);
    await writeOverrides(bucket, { ...overrides, deletedScreenshots: [...deleted] });
    const meta = await readShotMeta();
    if (meta[file]) {
      delete meta[file];
      await writeShotMeta(meta);
    }
    await patchDashScreenshots((shots) => shots.filter((s) => s.file !== file));
    return json({ ok: true });
  }

  return json({ ok: false, error: "Not found" }, 404);
};
