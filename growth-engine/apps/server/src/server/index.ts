import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Context, Next } from "hono";
import cron from "node-cron";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getDb, posts, slides, hooks, learnings, settings, analytics, signals, experiments as experimentsTable, SIGNAL_DIMENSIONS, ugcVideos } from "@remedy-growth/db";
import { and, desc, eq, asc, sql } from "drizzle-orm";
import { BRAND, env, ASSETS_DIR, OUTPUT_DIR, WEB_DIST_DIR, platformConfigured, r2Configured, GENERATE_PAUSED_MESSAGE, ANALYTICS_PAUSED_MESSAGE, LEARNING_PAUSED_MESSAGE } from "../config.js";
import { buildInReviewShorts, generateBatch } from "../generation/index.js";
import { completeManualPost, syncManualCurrent } from "../manual/queue.js";
import { ctaLayoutLabel, parseVariation, shotScaleLabel } from "../generation/variations.js";
import { resolveBed } from "../generation/short.js";
import { llmRateStats } from "../generation/llm.js";
import { publishPost, publishDue, handoffScheduled, publishDueVideoFollowUps, sendApprovedToDrafts } from "../publish/index.js";
import { emailFromHeaders, resolveIdentity } from "../ugc/role.js";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, passwordMatches, signSessionToken, verifySessionToken } from "./auth.js";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import {
  creatorById,
  creatorBySlug,
  insertUploadedVideo,
  listUgcSnapshot,
  toPublicVideo,
  ugcInsightsPayload,
  ugcObjectKey,
  videoByUuid,
} from "../ugc/store.js";
import { assignUgcSchedule } from "../ugc/schedule.js";
import { publishDueUgc } from "../ugc/publish.js";
import { defaultUgcCopy } from "../ugc/caption.js";
import {
  applyLibraryToVideos,
  createFolder,
  deleteFolder,
  ensureClipTitle,
  loadLibrary,
  organizeClip,
  renameFolder,
} from "../ugc/library.js";
import { assignSchedule, effectiveDailyCap, rampCap } from "../publish/scheduler.js";
import { buildAuthUrl, disconnectTikTok, exchangeCode, tiktokConnected } from "../publish/tiktok.js";
import {
  brightbeanPublicStatus,
  connectBrightbean,
  disconnectBrightbean,
  publisherReady,
  refreshBrightbeanAccounts,
} from "../publish/brightbean.js";
import { pullAnalytics } from "../analytics/pull.js";
import { runDiagnosis } from "../learning/diagnosis.js";
import { runDailyCycle } from "../cron/daily-cycle.js";
import { addRule } from "../learning/knowledge.js";
import { learnFromReject } from "../learning/classify.js";
import { allSummaries } from "../learning/summaries.js";
import { allRatings } from "../learning/ratings.js";
import {
  createVariant,
  concludeExperiments,
  experimentPartner,
  listExperiments,
  TESTABLE_DIMENSIONS,
  type TestableDimension,
} from "../learning/experiments.js";
import { getAssetUsage, getColdAssets } from "../generation/diversity.js";
import { getCycleState, advanceRounds } from "../learning/rounds.js";
import { publishDashboardSnapshot } from "../publish/snapshot.js";
import { invalidateCropConfig, slideFileName } from "../generation/composer.js";
import {
  autoScreenshotDescription,
  defaultScreenshotDescription,
  isAllowedScreenshotFile,
  isCroppedScreenshot,
  listLocalScreenshots,
  readScreenshotMeta,
  sanitizeScreenshotName,
  screenshotPath,
  writeScreenshotMeta,
  type ScreenshotMeta,
} from "../generation/screenshots.js";
import { allIllustrationAssets, ensureIllustrationManifest, getIllustration, illustrationFilePath, illustrationFit, illustrationMime, illustrationPreviewSvg, isIllustrationEnabled, isPhotoAsset, setIllustrationEnabled } from "../generation/illustrations.js";
import { markScreenshotDeleted, syncLibraryOverridesFromR2, unmarkScreenshotDeleted } from "../generation/library-overrides.js";
import { SCREENSHOT_R2_PREFIX, deleteObject, downloadBuffer, publicUrl, syncScreenshotsFromR2, uploadBuffer } from "../publish/r2.js";
import { deleteThumb, persistThumb } from "../generation/thumbs.js";
import sharp from "sharp";

// ---------------------------------------------------------------------------
// HTTP-level endpoint rate limiter (second layer behind the studio password gate)
// ---------------------------------------------------------------------------

interface EndpointBucket {
  timestamps: number[];
  maxPerMinute: number;
  maxPerHour: number;
}

const endpointBuckets = new Map<string, EndpointBucket>();

function httpRateLimit(
  tag: string,
  maxPerMinute: number,
  maxPerHour: number,
): (c: Context, next: Next) => Promise<Response | void> {
  if (!endpointBuckets.has(tag)) {
    endpointBuckets.set(tag, { timestamps: [], maxPerMinute, maxPerHour });
  }
  return async (c: Context, next: Next) => {
    const bucket = endpointBuckets.get(tag)!;
    const now = Date.now();
    const oneHourAgo = now - 3_600_000;
    bucket.timestamps = bucket.timestamps.filter((t) => t > oneHourAgo);

    const lastMinute = bucket.timestamps.filter((t) => t > now - 60_000).length;
    if (lastMinute >= bucket.maxPerMinute) {
      console.warn(`HTTP rate limit [${tag}]: ${lastMinute}/${bucket.maxPerMinute} per minute`);
      return c.json({ ok: false, error: "Too many requests — try again in a minute." }, 429);
    }
    if (bucket.timestamps.length >= bucket.maxPerHour) {
      console.warn(`HTTP rate limit [${tag}]: ${bucket.timestamps.length}/${bucket.maxPerHour} per hour`);
      return c.json({ ok: false, error: "Hourly limit reached — slow down." }, 429);
    }

    bucket.timestamps.push(now);
    await next();
  };
}

function syncSnapshot(): void {
  publishDashboardSnapshot().catch((err) => console.warn("Snapshot sync failed:", err instanceof Error ? err.message : err));
}

const app = new Hono();
app.use("/api/*", cors());

// Studio password gate. Skipped entirely when STUDIO_PASSWORD is unset (local default).
const AUTH_PUBLIC_PATHS = new Set(["/api/health", "/api/auth/login", "/api/auth/logout"]);

app.use("/api/*", async (c, next) => {
  if (!env.STUDIO_PASSWORD) {
    await next();
    return;
  }
  const pathName = new URL(c.req.url).pathname;
  if (c.req.method === "OPTIONS" || AUTH_PUBLIC_PATHS.has(pathName) || pathName.startsWith("/api/tiktok/callback")) {
    await next();
    return;
  }
  if (!sessionOk(c)) {
    return c.json({ ok: false, error: "auth_required" }, 401);
  }
  await next();
});

app.post("/api/auth/login", httpRateLimit("auth-login", 5, 30), async (c) => {
  if (!env.STUDIO_PASSWORD) return c.json({ ok: true, authRequired: false });
  const body = (await c.req.json().catch(() => ({}))) as { password?: string };
  const password = typeof body.password === "string" ? body.password : "";
  if (!password || !passwordMatches(password, env.STUDIO_PASSWORD)) {
    return c.json({ ok: false, error: "Wrong password." }, 401);
  }
  setCookie(c, SESSION_COOKIE, signSessionToken(env.STUDIO_PASSWORD), {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    maxAge: SESSION_TTL_SECONDS,
    // Local server runs on plain http; Secure would drop the cookie there.
    secure: new URL(c.req.url).protocol === "https:",
  });
  return c.json({ ok: true });
});

app.post("/api/auth/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

function sessionOk(c: Context): boolean {
  if (!env.STUDIO_PASSWORD) return true;
  return verifySessionToken(getCookie(c, SESSION_COOKIE) ?? "", env.STUDIO_PASSWORD);
}

function identityOf(c: Context) {
  return resolveIdentity(emailFromHeaders(c.req.raw.headers), env.UGC_OPERATOR_EMAILS, env.UGC_CREATORS);
}

function operatorDenied(c: Context): Response | null {
  if (identityOf(c).role === "operator") return null;
  return c.json({ ok: false, error: "This action is for the studio operator." }, 403);
}

const OPERATOR_WRITE_PREFIXES = [
  "/api/posts/",
  "/api/queue/",
  "/api/generate",
  "/api/analytics/",
  "/api/diagnose",
  "/api/cycle/",
  "/api/learnings/",
  "/api/shorts/",
  "/api/experiments",
  "/api/rounds/",
  "/api/settings",
  "/api/manual",
  "/api/brightbean/",
  "/api/tiktok/",
  "/api/assets/",
];

app.use("/api/*", async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS") {
    await next();
    return;
  }
  const pathName = new URL(c.req.url).pathname;
  if (pathName.startsWith("/api/ugc/")) {
    await next();
    return;
  }
  if (OPERATOR_WRITE_PREFIXES.some((p) => pathName === p || pathName.startsWith(p))) {
    const denied = operatorDenied(c);
    if (denied) return denied;
  }
  await next();
});

app.get("/api/health", (c) => c.json({ ok: true, engine: "live", snapshotOnly: false }));

app.get("/api/me", (c) => {
  const me = identityOf(c);
  return c.json({
    email: me.email,
    role: me.role,
    creatorSlug: me.creatorSlug,
    engine: "live",
  });
});

function slideUrl(filePath: string): string {
  const rel = path.relative(path.join(OUTPUT_DIR, "posts"), filePath).split(path.sep).join("/");
  return `/slides/${rel}`;
}

function postWithSlides(post: typeof posts.$inferSelect) {
  const db = getDb();
  const slideRows = db.select().from(slides).where(eq(slides.postId, post.id)).orderBy(asc(slides.idx)).all();
  const hook = db.select().from(hooks).where(eq(hooks.id, post.hookId)).get();
  const latestAnalytics = db
    .select()
    .from(analytics)
    .where(eq(analytics.postId, post.id))
    .orderBy(desc(analytics.fetchedAt))
    .limit(8)
    .all();
  const variation = parseVariation(post.variation);
  const bed = resolveBed(variation.shortBed);
  return {
    ...post,
    hookText: hook?.text ?? "",
    hookSource: hook?.source ?? "generated",
    experiment: experimentPartner(post.id),
    shortBed: variation.shortBed ?? null,
    shortBedLabel: !variation.shortBed || variation.shortBed === "silent" || variation.shortBed === "none" || bed?.id === "silent"
      ? "No sound"
      : bed ? `${bed.title} (${bed.mood})` : variation.shortBed,
    shotScale: variation.shotScale,
    shotScaleLabel: shotScaleLabel(variation.shotScale),
    ctaLayout: variation.ctaLayout ?? null,
    ctaLayoutLabel: ctaLayoutLabel(variation.ctaLayout),
    ctaReview: variation.ctaReview === true,
    prelaunch: variation.prelaunch === true,
    shortUrl: fs.existsSync(path.join(OUTPUT_DIR, "posts", String(post.id), "short.mp4"))
      ? `/slides/${post.id}/short.mp4`
      : null,
    slides: slideRows.map((s) => ({ ...s, url: slideUrl(s.filePath) })),
    analytics: latestAnalytics,
  };
}

// ---- Queue & posts ----

app.get("/api/queue", (c) => {
  const db = getDb();
  const queued = db.select().from(posts).where(eq(posts.status, "queued")).orderBy(desc(posts.confidence)).all();
  return c.json(queued.map(postWithSlides));
});

app.get("/api/posts", (c) => {
  const db = getDb();
  const status = c.req.query("status");
  const rows = status
    ? db.select().from(posts).where(eq(posts.status, status as typeof posts.$inferSelect.status)).orderBy(desc(posts.createdAt)).limit(100).all()
    : db.select().from(posts).orderBy(desc(posts.createdAt)).limit(100).all();
  return c.json(rows.map(postWithSlides));
});

app.post("/api/posts/:id/approve", (c) => {
  const db = getDb();
  const id = Number(c.req.param("id"));
  db.update(posts).set({ status: "approved" }).where(and(eq(posts.id, id), eq(posts.status, "queued"))).run();
  assignSchedule();
  syncSnapshot();
  return c.json({ ok: true });
});

app.post("/api/posts/:id/reject", async (c) => {
  const db = getDb();
  const id = Number(c.req.param("id"));
  const post = db.select().from(posts).where(eq(posts.id, id)).get();
  if (!post || post.status !== "queued") return c.json({ ok: false, error: "Not in queue" }, 400);

  const body = await c.req.json().catch(() => ({})) as { reason?: string };
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) : "";

  db.update(posts).set({ status: "rejected" }).where(eq(posts.id, id)).run();

  // Rejecting either side of an open A/B pair cancels the experiment right away.
  const partner = experimentPartner(id);
  if (partner) {
    db.update(experimentsTable).set({ status: "cancelled" }).where(eq(experimentsTable.id, partner.experimentId)).run();
    console.log(`Experiment #${partner.experimentId} cancelled — post #${id} rejected.`);
  }

  const hook = db.select().from(hooks).where(eq(hooks.id, post.hookId)).get();
  if (hook) {
    // Classify in the background so the reject response stays fast.
    learnFromReject({
      postId: post.id,
      hookId: hook.id,
      hookText: hook.text,
      formulaId: hook.formulaId,
      templateId: post.templateId,
      reason,
    })
      .then((cls) => {
        console.log(`Reject #${post.id} classified: ${cls.dimension}/${cls.category}`);
        syncSnapshot();
      })
      .catch((err) => console.warn("Feedback classification failed:", err instanceof Error ? err.message : err));
  }

  syncSnapshot();
  return c.json({ ok: true, learned: true });
});

app.post("/api/queue/approve-all", (c) => {
  const db = getDb();
  const queued = db.select().from(posts).where(eq(posts.status, "queued")).all();
  let approved = 0;
  for (const post of queued) {
    if (parseVariation(post.variation).ctaReview) continue;
    db.update(posts).set({ status: "approved" }).where(eq(posts.id, post.id)).run();
    approved++;
  }
  const scheduled = assignSchedule();
  syncSnapshot();
  return c.json({ ok: true, approved, scheduled });
});

app.post("/api/posts/:id/publish", httpRateLimit("publish", 5, 30), async (c) => {
  const id = Number(c.req.param("id"));
  const result = await publishPost(id);
  return c.json(result, result.ok ? 200 : 400);
});

app.post("/api/queue/send-drafts", httpRateLimit("send-drafts", 3, 12), async (c) => {
  const result = await sendApprovedToDrafts();
  syncSnapshot();
  return c.json({ ok: result.failed === 0, ...result }, result.sent > 0 || result.failed === 0 ? 200 : 400);
});

// ---- Generation / pipeline triggers (rate-limited) ----

const GenerateBodySchema = z.object({ count: z.number().int().min(1).max(30).optional() }).strict();

app.post("/api/generate", httpRateLimit("generate", 2, 10), async (c) => {
  if (!env.GENERATE_ENABLED) return c.json({ ok: false, error: GENERATE_PAUSED_MESSAGE }, 403);
  const body = GenerateBodySchema.safeParse(await c.req.json().catch(() => ({})));
  const count = body.success ? (body.data.count ?? env.POSTS_PER_DAY) : env.POSTS_PER_DAY;
  await syncLibraryOverridesFromR2().catch(() => {});
  const generated = await generateBatch(count);
  syncSnapshot();
  return c.json({ ok: true, generated: generated.length, posts: generated });
});

app.post("/api/analytics/pull", httpRateLimit("analytics-pull", 3, 15), async (c) => {
  if (!env.ANALYTICS_ENABLED) return c.json({ ok: false, error: ANALYTICS_PAUSED_MESSAGE, pulled: 0 }, 403);
  const result = await pullAnalytics();
  return c.json(result);
});

app.post("/api/diagnose", httpRateLimit("diagnose", 2, 10), (c) => {
  if (!env.LEARNING_ENABLED) return c.json({ ok: false, error: LEARNING_PAUSED_MESSAGE }, 403);
  const result = runDiagnosis();
  return c.json(result);
});

app.post("/api/cycle/run", httpRateLimit("cycle-run", 1, 4), async (c) => {
  const report = await runDailyCycle();
  return c.json(report);
});

// ---- LLM usage stats (visible in Settings) ----

app.get("/api/llm-stats", (c) => c.json(llmRateStats()));

// ---- Dashboard data ----

app.get("/api/summary", (c) => {
  const db = getDb();
  const statusCounts = db
    .select({ status: posts.status, count: sql<number>`count(*)` })
    .from(posts)
    .groupBy(posts.status)
    .all();
  const diagnosisCounts = db
    .select({ diagnosis: posts.diagnosis, count: sql<number>`count(*)` })
    .from(posts)
    .where(sql`${posts.diagnosis} IS NOT NULL`)
    .groupBy(posts.diagnosis)
    .all();

  const published = db.select().from(posts).where(eq(posts.status, "published")).all();
  const topPosts = published
    .map((p) => {
      const latest = db
        .select()
        .from(analytics)
        .where(eq(analytics.postId, p.id))
        .orderBy(desc(analytics.fetchedAt))
        .limit(4)
        .all();
      const views = latest.reduce((sum, a) => sum + a.views, 0);
      const engagement = latest.reduce((sum, a) => sum + a.likes + a.comments + a.shares + a.saves, 0);
      return { ...postWithSlides(p), totalViews: views, totalEngagement: engagement };
    })
    .sort((a, b) => b.totalViews - a.totalViews)
    .slice(0, 10);

  return c.json({
    statusCounts,
    diagnosisCounts,
    topPosts,
    totalPublished: published.length,
  });
});

app.get("/api/hooks", (c) => {
  const db = getDb();
  const rows = db.select().from(hooks).orderBy(desc(hooks.score), desc(hooks.createdAt)).limit(400).all();
  return c.json(rows);
});

app.get("/api/learnings", (c) => {
  const db = getDb();
  const rows = db.select().from(learnings).orderBy(desc(learnings.updatedAt)).limit(200).all();
  return c.json(rows);
});

app.post("/api/learnings/rule", async (c) => {
  const body = (await c.req.json()) as { content?: string; score?: number };
  if (!body.content) return c.json({ ok: false, error: "content is required" }, 400);
  addRule(body.content.slice(0, 500), body.score ?? 1);
  syncSnapshot();
  return c.json({ ok: true });
});

// ---- A/B experiments ----

const CreateExperimentSchema = z
  .object({
    postId: z.number().int().positive(),
    dimension: z.enum(TESTABLE_DIMENSIONS).optional(),
  })
  .strict();

app.post("/api/shorts/build", httpRateLimit("shorts-build", 1, 8), async (c) => {
  if (!env.GENERATE_ENABLED) return c.json({ ok: false, error: GENERATE_PAUSED_MESSAGE }, 403);
  const result = await buildInReviewShorts();
  syncSnapshot();
  return c.json({ ok: true, ...result });
});

app.post("/api/experiments", httpRateLimit("experiments", 4, 20), async (c) => {
  const body = CreateExperimentSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ ok: false, error: "Body must be { postId, dimension? }" }, 400);
  const result = await createVariant(body.data.postId, body.data.dimension as TestableDimension | undefined);
  if (result.ok) syncSnapshot();
  return c.json(result, result.ok ? 200 : 400);
});

app.get("/api/experiments", (c) => c.json(listExperiments(100)));

app.post("/api/experiments/conclude", httpRateLimit("experiments-conclude", 2, 10), (c) => {
  const result = concludeExperiments();
  syncSnapshot();
  return c.json({ ok: true, ...result });
});

// ---- Insights (structured learning) ----

app.get("/api/insights/summaries", (c) => c.json(allSummaries()));
app.get("/api/insights/ratings", (c) => c.json(allRatings()));

app.get("/api/insights/experiments", (c) => c.json(listExperiments(100)));

app.get("/api/insights/coverage", (c) => {
  return c.json({ ...getAssetUsage(), cold: getColdAssets() });
});

app.get("/api/insights/cycle", (c) => c.json(getCycleState()));

app.post("/api/rounds/advance", httpRateLimit("rounds-advance", 2, 10), async (c) => {
  const result = await advanceRounds(true);
  syncSnapshot();
  return c.json({ ok: true, ...result });
});

app.get("/api/insights/signals", (c) => {
  const db = getDb();
  const dimension = c.req.query("dimension");
  const limit = Math.min(Number(c.req.query("limit") ?? "50") || 50, 200);
  const valid = (SIGNAL_DIMENSIONS as readonly string[]).includes(dimension ?? "");
  const rows = valid
    ? db.select().from(signals).where(eq(signals.dimension, dimension as (typeof SIGNAL_DIMENSIONS)[number])).orderBy(desc(signals.createdAt)).limit(limit).all()
    : db.select().from(signals).orderBy(desc(signals.createdAt)).limit(limit).all();
  return c.json(rows);
});

// ---- Settings ----

const SettingsBodySchema = z.record(z.unknown());
const SECRET_SETTING_KEYS = new Set(["tiktok_tokens", "brightbean_token"]);

function settingsPayload(): Record<string, unknown> {
  const db = getDb();
  const rows = db.select().from(settings).all();
  const bb = brightbeanPublicStatus();
  const out: Record<string, unknown> = {
    postsPerDay: env.POSTS_PER_DAY,
    generateAt: `4:30 AM ${env.CRON_TZ}`,
    platforms: env.PLATFORMS,
    autoPublish: env.AUTO_PUBLISH,
    livePublish: env.LIVE_PUBLISH,
    autoApproveConfidence: env.AUTO_APPROVE_CONFIDENCE,
    llmProvider: env.LLM_PROVIDER,
    todayCap: effectiveDailyCap(),
    rampCap: rampCap(),
    rampStartDate: env.RAMP_START_DATE,
    generateEnabled: env.GENERATE_ENABLED,
    analyticsEnabled: env.ANALYTICS_ENABLED,
    learningEnabled: env.LEARNING_ENABLED,
    autoAssignSchedule: env.AUTO_ASSIGN_SCHEDULE,
    expireShorts: env.EXPIRE_SHORTS,
    tiktokPostMode: env.TIKTOK_POST_MODE,
    r2Configured: r2Configured(),
    tiktokAppConfigured: publisherReady("tiktok"),
    tiktokConnected: bb.accounts.some((a) => a.mapped === "tiktok") || tiktokConnected(),
    tiktokNativeConnected: tiktokConnected(),
    tiktokNativeAppConfigured: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
    tiktokAuthUrl: env.TIKTOK_CLIENT_KEY ? buildAuthUrl() : "",
    instagramConfigured: publisherReady("instagram"),
    facebookConfigured: publisherReady("facebook"),
    youtubeConfigured: publisherReady("youtube"),
    geminiConfigured: Boolean(env.GEMINI_API_KEY),
    appStoreUrl: BRAND.appStoreUrl,
    brightbean: bb,
    audience: rows.find((r) => r.key === "audience")?.value ?? null,
    prelaunch: env.PRELAUNCH,
    manualPosting: syncManualCurrent(),
  };
  for (const row of rows) {
    if (!SECRET_SETTING_KEYS.has(row.key)) out[row.key] = row.value;
  }
  return out;
}

app.get("/api/settings", (c) => {
  return c.json(settingsPayload());
});

app.put("/api/settings", async (c) => {
  const body = SettingsBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ ok: false, error: "Invalid body" }, 400);
  const db = getDb();
  for (const [key, value] of Object.entries(body.data)) {
    if (SECRET_SETTING_KEYS.has(key)) continue;
    db.insert(settings)
      .values({ key, value })
      .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date().toISOString() } })
      .run();
  }
  return c.json({ ok: true });
});

const BrightbeanConnectSchema = z.object({ token: z.string().min(12) }).strict();

app.post("/api/brightbean/connect", async (c) => {
  const body = BrightbeanConnectSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ ok: false, error: "Body must be { token }" }, 400);
  try {
    const cache = await connectBrightbean(body.data.token);
    syncSnapshot();
    return c.json({ ok: true, workspace: cache.workspaceName, accounts: cache.accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "BrightBean connect failed";
    return c.json({ ok: false, error: message.replace(/bb_studio_[A-Za-z0-9_-]+/g, "bb_studio_[redacted]") }, 400);
  }
});

app.post("/api/brightbean/refresh", async (c) => {
  try {
    const cache = await refreshBrightbeanAccounts();
    syncSnapshot();
    return c.json({ ok: true, workspace: cache.workspaceName, accounts: cache.accounts });
  } catch (err) {
    const message = err instanceof Error ? err.message : "BrightBean refresh failed";
    return c.json({ ok: false, error: message.replace(/bb_studio_[A-Za-z0-9_-]+/g, "bb_studio_[redacted]") }, 400);
  }
});

app.post("/api/brightbean/disconnect", (c) => {
  disconnectBrightbean();
  syncSnapshot();
  return c.json({ ok: true });
});

// ---- TikTok OAuth (one-time connect) ----

app.get("/api/tiktok/auth-url", (c) => {
  if (!platformConfigured("tiktok")) {
    return c.json({ ok: false, error: "Set TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET in .env first" }, 400);
  }
  return c.json({ ok: true, url: buildAuthUrl() });
});

const TikTokCodeSchema = z.object({ code: z.string().min(4) }).strict();

app.post("/api/tiktok/exchange", async (c) => {
  const body = TikTokCodeSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ ok: false, error: "Body must be { code: string }" }, 400);
  try {
    await exchangeCode(body.data.code.trim());
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 400);
  }
});

app.get("/api/tiktok/callback", async (c) => {
  const code = c.req.query("code");
  if (!code) return c.text("Missing ?code= from TikTok. Go back to Settings and try Connect again.", 400);
  try {
    await exchangeCode(code.trim());
    return c.text("TikTok connected. You can close this tab and go back to the dashboard.");
  } catch (err) {
    return c.text(err instanceof Error ? err.message : String(err), 400);
  }
});

app.post("/api/tiktok/disconnect", (c) => {
  disconnectTikTok();
  return c.json({ ok: true });
});

// ---- Screenshot crop tuning + phone upload ----

const CROP_CONFIG_PATH = path.join(ASSETS_DIR, "crop-config.json");

interface CropParam { skipTopPct: number; cropHPct: number }

function readCropConfig(): Record<string, CropParam> {
  try {
    if (fs.existsSync(CROP_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CROP_CONFIG_PATH, "utf-8")) as Record<string, CropParam>;
    }
  } catch { /* fall through */ }
  return {};
}

async function persistCropConfig(body: Record<string, CropParam>): Promise<void> {
  fs.writeFileSync(CROP_CONFIG_PATH, JSON.stringify(body, null, 2));
  invalidateCropConfig();
  if (r2Configured()) {
    await uploadBuffer(
      `${SCREENSHOT_R2_PREFIX}crop-config.json`,
      Buffer.from(JSON.stringify(body, null, 2), "utf8"),
      "application/json",
    );
  }
}

const ScreenshotMetaBody = z.object({ description: z.string().max(160) }).strict();

async function persistScreenshotMeta(meta: Record<string, ScreenshotMeta>): Promise<void> {
  writeScreenshotMeta(meta);
  if (r2Configured()) {
    await uploadBuffer(
      `${SCREENSHOT_R2_PREFIX}meta.json`,
      Buffer.from(JSON.stringify(meta, null, 2), "utf8"),
      "application/json",
    );
  }
}

function screenshotPayload(file: string, config: Record<string, CropParam>, meta: Record<string, ScreenshotMeta>) {
  const entry = meta[file];
  const cropped = isCroppedScreenshot(file, entry);
  return {
    file,
    skipTopPct: cropped ? 0 : (config[file]?.skipTopPct ?? 0.09),
    cropHPct: cropped ? 1 : (config[file]?.cropHPct ?? 0.45),
    exists: true,
    url: `/api/assets/raw/${encodeURIComponent(file)}`,
    description: entry?.description || autoScreenshotDescription(file, { cropped, source: entry?.source }),
    cropped,
    source: entry?.source,
  };
}

app.get("/api/assets/crop-config", (c) => {
  return c.json(readCropConfig());
});

app.post("/api/assets/crop-config", async (c) => {
  const body = await c.req.json() as Record<string, CropParam>;
  await persistCropConfig(body);
  return c.json({ ok: true });
});

app.get("/api/assets/screenshots", async (c) => {
  await syncLibraryOverridesFromR2().catch(() => 0);
  await syncScreenshotsFromR2().catch(() => 0);
  const config = readCropConfig();
  const meta = readScreenshotMeta();
  return c.json(listLocalScreenshots().map((file) => screenshotPayload(file, config, meta)));
});

app.get("/api/assets/raw/:file", (c) => {
  const file = c.req.param("file");
  if (!isAllowedScreenshotFile(file)) return c.text("Not found", 404);
  const srcPath = screenshotPath(file);
  if (!fs.existsSync(srcPath)) return c.text("Not found", 404);
  const ext = path.extname(file).toLowerCase();
  const type = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  return new Response(new Uint8Array(fs.readFileSync(srcPath)), {
    headers: { "Content-Type": type, "Cache-Control": "no-store" },
  });
});

app.post("/api/assets/screenshots", async (c) => {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ ok: false, error: "Choose a photo to upload." }, 400);
  if (file.size > 12 * 1024 * 1024) return c.json({ ok: false, error: "Photo is too large (12MB max)." }, 400);
  const name = sanitizeScreenshotName(typeof form.get("name") === "string" ? String(form.get("name")) : file.name);
  const dest = screenshotPath(name);
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    await sharp(buf).rotate().png().toFile(dest);
  } catch {
    return c.json({ ok: false, error: "Could not read that photo. Try PNG or JPEG." }, 400);
  }
  const cropped = form.get("cropped") === "1";
  const descriptionRaw = form.get("description");
  const sourceRaw = form.get("source");
  const source = typeof sourceRaw === "string" ? sanitizeScreenshotName(sourceRaw) : undefined;
  const typed = typeof descriptionRaw === "string" ? descriptionRaw.trim().slice(0, 160) : "";
  const description = typed || autoScreenshotDescription(name, { cropped, source });
  const config = readCropConfig();
  config[name] = cropped ? { skipTopPct: 0, cropHPct: 1 } : (config[name] ?? { skipTopPct: 0.09, cropHPct: 0.45 });
  await persistCropConfig(config);
  const meta = readScreenshotMeta();
  meta[name] = {
    ...meta[name],
    description,
    ...(cropped ? { cropped: true, source } : {}),
  };
  await persistScreenshotMeta(meta);
  if (r2Configured()) {
    await uploadBuffer(`${SCREENSHOT_R2_PREFIX}${name}`, fs.readFileSync(dest), "image/png");
  }
  await persistThumb(name, dest).catch(() => {});
  await unmarkScreenshotDeleted(name);
  return c.json({ ok: true, file: name });
});

app.post("/api/assets/screenshots/:file/meta", async (c) => {
  const file = path.basename(c.req.param("file"));
  if (!isAllowedScreenshotFile(file)) return c.json({ ok: false, error: "Not a screenshot" }, 400);
  const parsed = ScreenshotMetaBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ ok: false, error: "Description must be 160 characters or less." }, 400);
  const meta = readScreenshotMeta();
  meta[file] = { ...meta[file], description: parsed.data.description.trim() };
  await persistScreenshotMeta(meta);
  syncSnapshot();
  return c.json({ ok: true, file, description: meta[file]?.description ?? "" });
});

app.get("/api/assets/illustrations", async (c) => {
  ensureIllustrationManifest();
  await syncLibraryOverridesFromR2().catch(() => 0);
  return c.json(
    allIllustrationAssets().map((asset) => ({
      id: asset.id,
      name: asset.name,
      description: asset.description,
      source: asset.source,
      license: asset.license,
      themes: asset.themes,
      fit: illustrationFit(asset),
      enabled: isIllustrationEnabled(asset),
      svg: isPhotoAsset(asset) ? undefined : illustrationPreviewSvg(asset, false),
      url: isPhotoAsset(asset) ? `/api/assets/illustrations/${asset.id}/file` : undefined,
    })),
  );
});

app.get("/api/assets/illustrations/:id/file", async (c) => {
  const asset = getIllustration(c.req.param("id"));
  if (!asset || !isPhotoAsset(asset)) return c.json({ error: "Not found" }, 404);
  const filePath = illustrationFilePath(asset);
  if (!fs.existsSync(filePath)) return c.json({ error: "Not found" }, 404);
  return new Response(new Uint8Array(fs.readFileSync(filePath)), {
    headers: { "Content-Type": illustrationMime(asset.file), "Cache-Control": "no-store" },
  });
});

/** Reject or re-enable an illustration. Applies to the next render/generate. */
app.post("/api/assets/illustrations/:id/enabled", async (c) => {
  const id = c.req.param("id");
  const body = (await c.req.json()) as { enabled?: boolean };
  if (typeof body.enabled !== "boolean") return c.json({ ok: false, error: "enabled must be boolean" }, 400);
  const entry = await setIllustrationEnabled(id, body.enabled);
  if (!entry) return c.json({ ok: false, error: "Unknown illustration" }, 404);
  syncSnapshot();
  return c.json({ ok: true, id: entry.id, enabled: body.enabled });
});

app.delete("/api/assets/screenshots/:file", async (c) => {
  const file = path.basename(c.req.param("file"));
  if (!isAllowedScreenshotFile(file)) return c.json({ ok: false, error: "Not a deletable screenshot" }, 400);
  const local = screenshotPath(file);
  // Delete from R2 first — otherwise syncScreenshotsFromR2 restores the file.
  try {
    await deleteObject(`${SCREENSHOT_R2_PREFIX}${file}`);
  } catch (err) {
    return c.json({ ok: false, error: `R2 delete failed: ${err instanceof Error ? err.message : err}` }, 502);
  }
  if (fs.existsSync(local)) fs.unlinkSync(local);
  await deleteThumb(file).catch(() => {});
  await markScreenshotDeleted(file);
  const config = readCropConfig();
  if (config[file]) {
    delete config[file];
    await persistCropConfig(config);
  }
  const meta = readScreenshotMeta();
  if (meta[file]) {
    delete meta[file];
    await persistScreenshotMeta(meta);
  }
  syncSnapshot();
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Crop requests — engine asks for specific cropped screenshots, user fulfills
// ---------------------------------------------------------------------------
const CROP_REQUESTS_PATH = path.join(ASSETS_DIR, "crop-requests.json");

interface CropRequest {
  id: string;
  sourceFile: string;
  description: string;
  createdAt: string;
  fulfilled: boolean;
  fulfilledFile?: string;
}

function readCropRequests(): CropRequest[] {
  try {
    if (fs.existsSync(CROP_REQUESTS_PATH)) {
      return JSON.parse(fs.readFileSync(CROP_REQUESTS_PATH, "utf-8")) as CropRequest[];
    }
  } catch { /* ignore */ }
  return [];
}

function writeCropRequests(requests: CropRequest[]): void {
  fs.writeFileSync(CROP_REQUESTS_PATH, JSON.stringify(requests, null, 2));
}

app.get("/api/assets/crop-requests", (c) => {
  return c.json(readCropRequests());
});

app.post("/api/assets/crop-requests", async (c) => {
  const body = (await c.req.json()) as { sourceFile?: string; description?: string };
  if (!body.sourceFile || !body.description) {
    return c.json({ ok: false, error: "sourceFile and description are required" }, 400);
  }
  const requests = readCropRequests();
  const id = `cr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  requests.push({
    id,
    sourceFile: body.sourceFile,
    description: body.description.slice(0, 200),
    createdAt: new Date().toISOString(),
    fulfilled: false,
  });
  writeCropRequests(requests);
  syncSnapshot();
  return c.json({ ok: true, id });
});

app.post("/api/assets/crop-requests/:id/fulfill", async (c) => {
  const reqId = c.req.param("id");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ ok: false, error: "Upload a cropped image." }, 400);
  if (file.size > 12 * 1024 * 1024) return c.json({ ok: false, error: "Photo is too large (12MB max)." }, 400);

  const requests = readCropRequests();
  const req = requests.find((r) => r.id === reqId);
  if (!req) return c.json({ ok: false, error: "Request not found" }, 404);

  const name = sanitizeScreenshotName(typeof form.get("name") === "string" ? String(form.get("name")) : `crop_${req.sourceFile}`);
  const dest = screenshotPath(name);
  const buf = Buffer.from(await file.arrayBuffer());
  try {
    await sharp(buf).rotate().png().toFile(dest);
  } catch {
    return c.json({ ok: false, error: "Could not read that photo. Try PNG or JPEG." }, 400);
  }

  const config = readCropConfig();
  config[name] = { skipTopPct: 0, cropHPct: 1 };
  await persistCropConfig(config);

  const meta = readScreenshotMeta();
  meta[name] = { description: req.description, cropped: true, source: req.sourceFile };
  await persistScreenshotMeta(meta);

  if (r2Configured()) {
    await uploadBuffer(`${SCREENSHOT_R2_PREFIX}${name}`, fs.readFileSync(dest), "image/png");
  }
  await persistThumb(name, dest).catch(() => {});
  await unmarkScreenshotDeleted(name);

  req.fulfilled = true;
  req.fulfilledFile = name;
  writeCropRequests(requests);
  syncSnapshot();
  return c.json({ ok: true, file: name });
});

app.delete("/api/assets/crop-requests/:id", (c) => {
  const reqId = c.req.param("id");
  const requests = readCropRequests().filter((r) => r.id !== reqId);
  writeCropRequests(requests);
  syncSnapshot();
  return c.json({ ok: true });
});

/** GET /api/assets/preview/:file?skipTopPct=0.09&cropHPct=0.45 — returns JPEG crop preview */
app.get("/api/assets/preview/:file", async (c) => {
  const file = c.req.param("file");
  if (!isAllowedScreenshotFile(file)) return c.text("Not found", 404);
  const skipTopPct = Math.max(0, Math.min(0.3,  Number(c.req.query("skipTopPct") ?? "0.09")));
  const cropHPct   = Math.max(0.05, Math.min(1, Number(c.req.query("cropHPct")   ?? "0.45")));
  const srcPath = screenshotPath(file);
  if (!fs.existsSync(srcPath)) return c.text("Not found", 404);

  const targetW = 480;
  const wide     = await sharp(srcPath).resize({ width: targetW }).png().toBuffer();
  const wideMeta = await sharp(wide).metadata();
  const fullH    = wideMeta.height ?? targetW * 2;
  const skipTop  = Math.round(fullH * skipTopPct);
  const cropH    = Math.min(Math.round(fullH * cropHPct), fullH - skipTop);
  const preview  = await sharp(wide)
    .extract({ left: 0, top: skipTop, width: targetW, height: Math.max(1, cropH) })
    .jpeg({ quality: 82 })
    .toBuffer();

  return new Response(new Uint8Array(preview), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
  });
});

// ---- UGC (isolated from slideshow posts) ----

const UGC_MAX_BYTES = 100 * 1024 * 1024;
const UGC_MIME = new Set(["video/mp4", "video/quicktime"]);

function extForUgc(fileName: string, mime: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === ".mp4" || ext === ".mov") return ext.slice(1);
  return mime === "video/quicktime" ? "mov" : "mp4";
}

app.get("/api/ugc", async (c) => {
  const pack = listUgcSnapshot();
  const lib = await loadLibrary();
  return c.json({
    ...pack,
    folders: lib.folders,
    videos: applyLibraryToVideos(pack.videos, lib),
  });
});
app.get("/api/ugc/insights", (c) => c.json(ugcInsightsPayload()));

const FolderCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    creatorSlug: z.enum(["sohan", "ai"]),
  })
  .strict();
const FolderRenameSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const OrganizeSchema = z
  .object({
    folderId: z.string().uuid().nullable().optional(),
    clipTitle: z.string().trim().max(80).optional(),
  })
  .strict();

app.post("/api/ugc/folders", async (c) => {
  const body = FolderCreateSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ ok: false, error: "Name the folder." }, 400);
  const folder = await createFolder(body.data.name, body.data.creatorSlug);
  return c.json({ ok: true, folder });
});

app.patch("/api/ugc/folders/:id", async (c) => {
  const body = FolderRenameSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ ok: false, error: "Name the folder." }, 400);
  const folder = await renameFolder(c.req.param("id"), body.data.name);
  if (!folder) return c.json({ ok: false, error: "Folder not found" }, 404);
  return c.json({ ok: true, folder });
});

app.delete("/api/ugc/folders/:id", async (c) => {
  const ok = await deleteFolder(c.req.param("id"));
  if (!ok) return c.json({ ok: false, error: "Folder not found" }, 404);
  return c.json({ ok: true });
});

app.post("/api/ugc/videos/:uuid/organize", async (c) => {
  const uuid = c.req.param("uuid");
  const video = videoByUuid(uuid);
  if (!video) return c.json({ ok: false, error: "Not found" }, 404);
  const body = OrganizeSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ ok: false, error: "Invalid body" }, 400);
  if (body.data.folderId) {
    const lib = await loadLibrary();
    if (!lib.folders.some((f) => f.id === body.data.folderId)) {
      return c.json({ ok: false, error: "Folder not found" }, 404);
    }
  }
  await organizeClip({
    uuid,
    fileName: video.fileName,
    folderId: body.data.folderId,
    clipTitle: body.data.clipTitle,
  });
  return c.json({ ok: true });
});

app.post("/api/ugc/videos", httpRateLimit("ugc-upload", 20, 80), async (c) => {
  const me = identityOf(c);
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ ok: false, error: "Choose a video to upload." }, 400);
  if (file.size > UGC_MAX_BYTES) return c.json({ ok: false, error: "Video is too large (100MB max)." }, 400);
  const mime = file.type || "video/mp4";
  if (!UGC_MIME.has(mime) && !/\.(mp4|mov)$/i.test(file.name)) {
    return c.json({ ok: false, error: "Upload an mp4 or mov." }, 400);
  }
  const requestedSlug = typeof form.get("creatorSlug") === "string" ? String(form.get("creatorSlug")).trim().toLowerCase() : "sohan";
  const slug = me.role === "creator" ? (me.creatorSlug ?? "") : requestedSlug || "sohan";
  if (!slug) return c.json({ ok: false, error: "Your account is not mapped to a UGC creator." }, 403);
  if (me.role === "creator" && slug !== me.creatorSlug) {
    return c.json({ ok: false, error: "You can only upload to your own tab." }, 403);
  }
  const creator = creatorBySlug(slug);
  if (!creator) return c.json({ ok: false, error: "Unknown creator." }, 404);

  const uuid = typeof form.get("uuid") === "string" && form.get("uuid") ? String(form.get("uuid")) : crypto.randomUUID();
  const ext = extForUgc(file.name, mime);
  const r2Key = ugcObjectKey(slug, uuid, ext);
  const dest = path.join(OUTPUT_DIR, "ugc", `${uuid}.${ext}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(dest, buf);
  if (r2Configured()) {
    await uploadBuffer(r2Key, buf, mime === "video/quicktime" ? "video/quicktime" : "video/mp4");
  }
  const copy = defaultUgcCopy(uuid);
  if (!fs.existsSync(dest) || fs.statSync(dest).size !== buf.length) {
    return c.json({ ok: false, error: "Upload did not land on disk. Try again." }, 500);
  }
  const video = insertUploadedVideo({
    uuid,
    creatorSlug: slug,
    r2Key,
    filePath: dest,
    fileName: file.name,
    mimeType: mime,
    byteSize: file.size,
    title: copy.title,
    caption: copy.caption,
  });
  const clipTitle = await ensureClipTitle(uuid, file.name);
  syncSnapshot();
  return c.json({ ok: true, video: { ...video, clipTitle, folderId: null } });
});

app.get("/api/ugc/videos/:uuid/file", async (c) => {
  const uuid = c.req.param("uuid");
  const video = videoByUuid(uuid);
  if (!video) return c.json({ ok: false, error: "Not found" }, 404);
  const download = c.req.query("download") === "1";
  const ext = path.extname(video.fileName || video.r2Key || ".mp4") || ".mp4";
  const name = `remedy-ugc-${uuid}${ext.startsWith(".") ? ext : `.${ext}`}`;
  const disposition = download ? `attachment; filename="${name}"` : `inline; filename="${name}"`;
  if (video.filePath && fs.existsSync(video.filePath)) {
    const body = fs.readFileSync(video.filePath);
    const type = video.mimeType || "video/mp4";
    return new Response(new Uint8Array(body), {
      headers: { "Content-Type": type, "Content-Disposition": disposition, "Cache-Control": "private, max-age=60" },
    });
  }
  const buf = await downloadBuffer(video.r2Key);
  if (!buf) return c.json({ ok: false, error: "File missing" }, 404);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": video.mimeType || "video/mp4", "Content-Disposition": disposition, "Cache-Control": "private, max-age=60" },
  });
});

const UgcCaptionSchema = z
  .object({
    title: z.string().max(255).optional(),
    caption: z.string().max(10_000).optional(),
    reason: z.string().max(200).optional(),
  })
  .strict();

app.post("/api/ugc/videos/:uuid/caption", async (c) => {
  const denied = operatorDenied(c);
  if (denied) return denied;
  const video = videoByUuid(c.req.param("uuid"));
  if (!video) return c.json({ ok: false, error: "Not found" }, 404);
  const body = UgcCaptionSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ ok: false, error: "Invalid body" }, 400);
  getDb()
    .update(ugcVideos)
    .set({
      title: body.data.title?.trim() || video.title,
      caption: body.data.caption?.trim() || video.caption,
    })
    .where(eq(ugcVideos.id, video.id))
    .run();
  syncSnapshot();
  const updated = videoByUuid(video.uuid)!;
  const owner = creatorById(updated.creatorId);
  return c.json({ ok: true, video: owner ? toPublicVideo(updated, owner) : null });
});

app.post("/api/ugc/videos/:uuid/approve", async (c) => {
  const denied = operatorDenied(c);
  if (denied) return denied;
  const video = videoByUuid(c.req.param("uuid"));
  if (!video) return c.json({ ok: false, error: "Not found" }, 404);
  if (video.status !== "pending_review" && video.status !== "uploaded" && video.status !== "approved") {
    return c.json({ ok: false, error: "This video is not waiting for review." }, 400);
  }
  const body = UgcCaptionSchema.safeParse(await c.req.json().catch(() => ({})));
  const title = body.success ? body.data.title?.trim() : undefined;
  const caption = body.success ? body.data.caption?.trim() : undefined;
  getDb()
    .update(ugcVideos)
    .set({
      status: "approved",
      title: title || video.title,
      caption: caption || video.caption,
      rejectReason: null,
      error: null,
    })
    .where(eq(ugcVideos.id, video.id))
    .run();
  assignUgcSchedule(video.creatorId);
  syncSnapshot();
  const updated = videoByUuid(video.uuid)!;
  const owner = creatorById(updated.creatorId);
  return c.json({ ok: true, video: owner ? toPublicVideo(updated, owner) : null });
});

app.delete("/api/ugc/videos/:uuid", async (c) => {
  const denied = operatorDenied(c);
  if (denied) return denied;
  const video = videoByUuid(c.req.param("uuid"));
  if (!video) return c.json({ ok: false, error: "Not found" }, 404);
  if (video.filePath && fs.existsSync(video.filePath)) fs.unlinkSync(video.filePath);
  if (r2Configured() && video.r2Key) await deleteObject(video.r2Key).catch(() => undefined);
  getDb().delete(ugcVideos).where(eq(ugcVideos.id, video.id)).run();
  syncSnapshot();
  return c.json({ ok: true });
});

app.post("/api/ugc/videos/:uuid/reject", async (c) => {
  const denied = operatorDenied(c);
  if (denied) return denied;
  const video = videoByUuid(c.req.param("uuid"));
  if (!video) return c.json({ ok: false, error: "Not found" }, 404);
  const body = UgcCaptionSchema.safeParse(await c.req.json().catch(() => ({})));
  const reason = body.success ? body.data.reason?.trim() ?? "" : "";
  getDb()
    .update(ugcVideos)
    .set({ status: "rejected", rejectReason: reason || null })
    .where(eq(ugcVideos.id, video.id))
    .run();
  syncSnapshot();
  const updated = videoByUuid(video.uuid)!;
  const owner = creatorById(updated.creatorId);
  return c.json({ ok: true, video: owner ? toPublicVideo(updated, owner) : null });
});

// ---- Static: rendered slides + web dashboard ----

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function serveFile(absPath: string): Response | null {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return null;
  const ext = path.extname(absPath).toLowerCase();
  const body = fs.readFileSync(absPath);
  return new Response(new Uint8Array(body), {
    headers: { "Content-Type": MIME[ext] ?? "application/octet-stream", "Cache-Control": "no-cache" },
  });
}

const ManualCompleteSchema = z.object({ postId: z.number().int().positive() }).strict();

app.post("/api/manual/complete", async (c) => {
  const denied = operatorDenied(c);
  if (denied) return denied;
  const body = ManualCompleteSchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ ok: false, error: "postId is required" }, 400);
  const state = await completeManualPost(body.data.postId);
  syncSnapshot();
  return c.json({ ok: true, ...state });
});

app.get("/api/slides/:id/:idx", (c) => {
  const id = Number(c.req.param("id"));
  const idx = Number(c.req.param("idx"));
  if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(idx) || idx < 0 || idx > 20) {
    return c.json({ ok: false, error: "Bad id" }, 400);
  }
  const file = path.join(OUTPUT_DIR, "posts", String(id), slideFileName(idx));
  const root = path.join(OUTPUT_DIR, "posts", String(id));
  if (!file.startsWith(root) || !fs.existsSync(file)) return c.json({ ok: false, error: "Slide not found" }, 404);
  const download = c.req.query("download") === "1";
  const body = fs.readFileSync(file);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "image/jpeg",
      "Content-Disposition": download
        ? `attachment; filename="remedy-${id}-slide-${String(idx + 1).padStart(2, "0")}.jpg"`
        : `inline; filename="remedy-${id}-slide-${String(idx + 1).padStart(2, "0")}.jpg"`,
      "Cache-Control": "private, max-age=60",
    },
  });
});

app.get("/api/shorts/:id", (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isFinite(id) || id <= 0) return c.json({ ok: false, error: "Bad id" }, 400);
  const file = path.join(OUTPUT_DIR, "posts", String(id), "short.mp4");
  const root = path.join(OUTPUT_DIR, "posts");
  if (!file.startsWith(root) || !fs.existsSync(file)) return c.json({ ok: false, error: "Short not found" }, 404);
  const download = c.req.query("download") === "1";
  const body = fs.readFileSync(file);
  return new Response(new Uint8Array(body), {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": download
        ? `attachment; filename="remedy-${id}-short.mp4"`
        : `inline; filename="remedy-${id}-short.mp4"`,
      "Cache-Control": "private, max-age=60",
    },
  });
});

app.get("/slides/*", (c) => {
  const rel = c.req.path.replace(/^\/slides\//, "");
  const abs = path.join(OUTPUT_DIR, "posts", rel);
  // Prevent path traversal
  if (!abs.startsWith(path.join(OUTPUT_DIR, "posts"))) return c.notFound();
  return serveFile(abs) ?? c.notFound();
});

app.get("/*", (c) => {
  const rel = c.req.path === "/" ? "index.html" : c.req.path.slice(1);
  const abs = path.join(WEB_DIST_DIR, rel);
  if (abs.startsWith(WEB_DIST_DIR)) {
    const file = serveFile(abs);
    if (file) return file;
  }
  // SPA fallback
  const index = serveFile(path.join(WEB_DIST_DIR, "index.html"));
  return index ?? c.text("Dashboard not built yet. Run: npm run build:web", 404);
});

// ---- Cron ----

if (!env.DISABLE_CRON) {
  // Daily cycle at 4:30 AM local: pull -> diagnose -> evolve -> generate 10 (if queue is clear)
  cron.schedule(
    "30 4 * * *",
    () => {
      runDailyCycle().catch((err) => console.error("Daily cycle failed:", err));
    },
    { timezone: env.CRON_TZ },
  );
  // Publisher: hand future slots to BrightBean now; send anything already due.
  cron.schedule(
    "*/15 * * * *",
    () => {
      assignSchedule();
      handoffScheduled().catch((err) => console.error("handoffScheduled failed:", err));
      publishDue().catch((err) => console.error("publishDue failed:", err));
      publishDueVideoFollowUps().catch((err) => console.error("video follow-up failed:", err));
      publishDueUgc().catch((err) => console.error("publishDueUgc failed:", err));
    },
    { timezone: env.CRON_TZ },
  );
  console.log(
    `Cron registered: daily cycle @ 4:30 ${env.CRON_TZ}${env.GENERATE_ENABLED ? " (generate if queue is clear)" : " (generate PAUSED)"}, publisher every 15 min.`,
  );
}

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`Remedy Growth Engine running at http://localhost:${info.port}`);
  syncLibraryOverridesFromR2()
    .then(() => refreshBrightbeanAccounts().catch(() => null))
    .then(() => handoffScheduled().catch((err) => console.error("startup handoff failed:", err)))
    .then(() => publishDue().catch((err) => console.error("startup publishDue failed:", err)))
    .then(() => syncSnapshot())
    .catch((err) => console.warn("Startup sync failed:", err instanceof Error ? err.message : err));
});
