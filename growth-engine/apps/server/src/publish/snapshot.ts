import fs from "node:fs";
import { getDb, posts, slides, hooks, hookFormulas, learnings, analytics, signals, experiments, ugcVideos } from "@remedy-growth/db";
import { desc, eq, asc } from "drizzle-orm";
import { ASSETS_DIR, BRAND, env, r2Configured } from "../config.js";
import { MUSIC_CUES, parseVariation, shotScaleLabel } from "../generation/variations.js";
import { assignSchedule, effectiveDailyCap, rampCap } from "./scheduler.js";
import { learnFromReject } from "../learning/classify.js";
import { allSummaries } from "../learning/summaries.js";
import { allRatings } from "../learning/ratings.js";
import { listExperiments, experimentPartner, createVariant } from "../learning/experiments.js";
import { buildInReviewShorts } from "../generation/index.js";
import { getAssetUsage } from "../generation/diversity.js";
import { resolveBed } from "../generation/short.js";
import { getCycleState } from "../learning/rounds.js";
import { TEMPLATES } from "../generation/templates.js";
import { postOutputDir, slideObjectKey, SLIDE_REV, CTA_CACHE } from "../generation/composer.js";
import { shortObjectKey, shortOutputPath } from "../generation/short.js";
import { keepShortForReview, pruneRemotePostMedia } from "../generation/storage.js";
import { uploadBuffer, uploadShort, uploadSlides, downloadText, publicUrl, objectExists, SCREENSHOT_R2_PREFIX, ILLUSTRATION_R2_PREFIX } from "./r2.js";
import { defaultScreenshotDescription, isCroppedScreenshot, listLocalScreenshots, readScreenshotMeta, screenshotPath } from "../generation/screenshots.js";
import { persistThumb } from "../generation/thumbs.js";
import { allIllustrationAssets, ensureIllustrationManifest, illustrationFilePath, illustrationFit, illustrationMime, isIllustrationEnabled } from "../generation/illustrations.js";
import { syncLibraryOverridesFromR2 } from "../generation/library-overrides.js";
import { completeManualPost, syncManualCurrent } from "../manual/queue.js";
import path from "node:path";
import { buildAuthUrl, consumePendingOAuth, tiktokConnected } from "./tiktok.js";
import { brightbeanPublicStatus, publisherReady } from "./brightbean.js";
import { loadAudience } from "../analytics/audience.js";
import { listUgcSnapshot, ugcInsightsPayload, insertUploadedVideo, videoByUuid } from "../ugc/store.js";
import { applyLibraryToVideos, loadLibrary } from "../ugc/library.js";
import { assignUgcSchedule } from "../ugc/schedule.js";

export const DASHBOARD_KEY = "growth/dashboard.json";
export const PENDING_KEY = "growth/pending.json";

export interface PendingAction {
  type: "approve" | "reject" | "create_variant" | "build_shorts" | "ugc_upload" | "ugc_approve" | "ugc_reject" | "ugc_caption" | "manual_complete";
  postId?: number;
  at: string;
  reason?: string;
  /** For create_variant: which dimension to test (omit for auto/least-tested). */
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

function publicSlideUrl(postId: number, idx: number, cacheBust?: string): string {
  const extra = cacheBust ? `&c=${cacheBust}` : "";
  return `${publicUrl(slideObjectKey(postId, idx))}?v=${SLIDE_REV}${extra}`;
}

function slideOwnerFromPath(filePath: string, fallback: number): number {
  const m = filePath.replace(/\\/g, "/").match(/posts\/(\d+)\//);
  return m ? Number(m[1]) : fallback;
}

export async function applyPendingFromR2(): Promise<number> {
  if (!r2Configured()) return 0;
  const raw = await downloadText(PENDING_KEY);
  if (!raw) return 0;
  const parsed = JSON.parse(raw) as { actions?: PendingAction[] };
  const actions = parsed.actions ?? [];
  if (actions.length === 0) return 0;

  const db = getDb();
  let applied = 0;
  for (const action of actions) {
    if (action.type === "build_shorts") {
      if (!env.GENERATE_ENABLED) continue;
      const result = await buildInReviewShorts();
      applied += result.built + result.reused;
      continue;
    }
    if (action.type === "ugc_upload" && action.uuid && action.creatorSlug && action.r2Key) {
      insertUploadedVideo({
        uuid: action.uuid,
        creatorSlug: action.creatorSlug,
        r2Key: action.r2Key,
        filePath: "",
        fileName: action.fileName ?? "",
        mimeType: action.mimeType ?? "video/mp4",
        byteSize: action.byteSize ?? 0,
        durationSec: action.durationSec ?? null,
        title: action.title,
        caption: action.caption,
      });
      applied++;
      continue;
    }
    if (action.type === "manual_complete") {
      await completeManualPost(action.postId);
      applied++;
      continue;
    }
    if (action.uuid && (action.type === "ugc_approve" || action.type === "ugc_reject" || action.type === "ugc_caption")) {
      const video = videoByUuid(action.uuid);
      if (!video) continue;
      if (action.type === "ugc_caption") {
        db.update(ugcVideos)
          .set({
            title: action.title?.trim() || video.title,
            caption: action.caption?.trim() || video.caption,
          })
          .where(eq(ugcVideos.id, video.id))
          .run();
        applied++;
        continue;
      }
      if (action.type === "ugc_reject") {
        db.update(ugcVideos)
          .set({ status: "rejected", rejectReason: action.reason?.trim() || null })
          .where(eq(ugcVideos.id, video.id))
          .run();
        applied++;
        continue;
      }
      if (video.status !== "pending_review" && video.status !== "uploaded" && video.status !== "approved") continue;
      db.update(ugcVideos)
        .set({
          status: "approved",
          title: action.title?.trim() || video.title,
          caption: action.caption?.trim() || video.caption,
          rejectReason: null,
          error: null,
        })
        .where(eq(ugcVideos.id, video.id))
        .run();
      assignUgcSchedule(video.creatorId);
      applied++;
      continue;
    }
    const postId = action.postId;
    if (!postId) continue;
    const post = db.select().from(posts).where(eq(posts.id, postId)).get();
    if (!post) continue;
    if (action.type === "create_variant") {
      // A/B variant requested from the cloud dashboard — generate it here on the PC engine.
      const result = await createVariant(postId, action.dimension).catch((err) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : String(err),
      }));
      if (result.ok) applied++;
      else console.warn(`Cloud variant request for post #${action.postId} failed: ${result.error}`);
      continue;
    }
    if (post.status !== "queued") continue;
    if (action.type === "approve") {
      db.update(posts).set({ status: "approved" }).where(eq(posts.id, post.id)).run();
      applied++;
    } else {
      db.update(posts).set({ status: "rejected" }).where(eq(posts.id, post.id)).run();
      // Rejecting either side of an open A/B pair cancels the experiment.
      const partner = experimentPartner(post.id);
      if (partner) {
        db.update(experiments).set({ status: "cancelled" }).where(eq(experiments.id, partner.experimentId)).run();
        console.log(`Experiment #${partner.experimentId} cancelled — post #${post.id} rejected from cloud.`);
      }
      const hook = db.select().from(hooks).where(eq(hooks.id, post.hookId)).get();
      if (hook) {
        await learnFromReject({
          postId: post.id,
          hookId: hook.id,
          hookText: hook.text,
          formulaId: hook.formulaId,
          templateId: post.templateId,
          reason: action.reason ?? "",
        }).catch((err) => console.warn("Feedback classification failed:", err instanceof Error ? err.message : err));
      }
      applied++;
    }
  }
  if (applied) assignSchedule();
  await uploadBuffer(PENDING_KEY, Buffer.from(JSON.stringify({ actions: [] }), "utf8"), "application/json");
  return applied;
}

export async function publishDashboardSnapshot(): Promise<string | null> {
  if (!r2Configured()) return null;
  await applyPendingFromR2().catch((err) => {
    console.warn(`Pending sync skipped: ${err instanceof Error ? err.message : err}`);
  });
  ensureIllustrationManifest();
  const libraryOverrides = await syncLibraryOverridesFromR2();
  await consumePendingOAuth().catch((err) => {
    console.warn("TikTok OAuth consume skipped:", err instanceof Error ? err.message : err);
  });
  if (env.GENERATE_ENABLED) {
    await buildInReviewShorts().catch((err) => {
      console.warn("Short preview build skipped:", err instanceof Error ? err.message : err);
    });
  }

  const db = getDb();
  const allPosts = db.select().from(posts).orderBy(desc(posts.createdAt)).limit(200).all();
  const allHooks = db.select().from(hooks).orderBy(desc(hooks.score), desc(hooks.createdAt)).limit(400).all();
  const allLearnings = db.select().from(learnings).orderBy(desc(learnings.updatedAt)).limit(200).all();
  const allFormulas = db.select().from(hookFormulas).orderBy(desc(hookFormulas.score)).all();
  const pendingRaw = await downloadText(PENDING_KEY);
  const pendingCount = pendingRaw
    ? ((JSON.parse(pendingRaw) as { actions?: unknown[] }).actions ?? []).length
    : 0;
  const manual = syncManualCurrent();
  const completedSet = new Set(manual.completedIds);
  const mapped: Array<
    (typeof allPosts)[number] & {
      prelaunch: boolean;
      hookText: string;
      hookSource: string;
      music: string;
      musicCue: string;
      experiment: { experimentId: number; partnerId: number; dimension: string } | null;
      shortUrl: string | null;
      shortBed: string | null;
      shortBedLabel: string | null;
      shotScale: string;
      shotScaleLabel: string;
      ctaLayout: string | null;
      ctaReview: boolean;
      slides: Array<(typeof slides.$inferSelect) & { url: string }>;
      analytics: Array<typeof analytics.$inferSelect>;
    }
  > = [];
  for (const post of allPosts) {
    const slideRows = db.select().from(slides).where(eq(slides.postId, post.id)).orderBy(asc(slides.idx)).all();
    const existing = slideRows.filter((s) => fs.existsSync(s.filePath));
    const inReview = post.status === "queued" || post.status === "approved";
    const template = TEMPLATES[post.templateId];
    const variation = parseVariation(post.variation, Boolean(template?.preferMusic));
    const prelaunch = variation.prelaunch === true;
    const keepShort = keepShortForReview(post.id, post.status, completedSet);
    // Published slides are already on R2 from send — don't HEAD/re-upload 200 posts.
    // Current phone-kit posts re-upload so the one Review slide still has the files.
    if ((inReview || keepShort) && existing.length) {
      const own = existing.filter((s) => slideOwnerFromPath(s.filePath, post.id) === post.id);
      if (own.length) await uploadSlides(post.id, own.map((s) => s.filePath), prelaunch);
    }
    const shortPath = shortOutputPath(postOutputDir(post.id));
    let shortUrl: string | null = null;
    if (keepShort) {
      if (inReview && fs.existsSync(shortPath)) {
        await uploadShort(post.id, shortPath, prelaunch).catch(() => "");
        shortUrl = publicUrl(shortObjectKey(post.id));
      } else if (await objectExists(shortObjectKey(post.id))) {
        shortUrl = publicUrl(shortObjectKey(post.id));
      }
      if (shortUrl && prelaunch) shortUrl = `${shortUrl}?c=prelaunch`;
    }
    if (env.EXPIRE_SHORTS) await pruneRemotePostMedia(post.id, keepShort).catch(() => 0);
    const hook = db.select().from(hooks).where(eq(hooks.id, post.hookId)).get();
    const latestAnalytics = db
      .select()
      .from(analytics)
      .where(eq(analytics.postId, post.id))
      .orderBy(desc(analytics.fetchedAt))
      .limit(8)
      .all();
    const bed = resolveBed(variation.shortBed);
    mapped.push({
      ...post,
      prelaunch,
      hookText: hook?.text ?? "",
      hookSource: hook?.source ?? "generated",
      music: variation.music,
      musicCue: MUSIC_CUES[variation.music],
      shortBed: variation.shortBed ?? null,
      shortBedLabel: !variation.shortBed || variation.shortBed === "silent" || variation.shortBed === "none" || bed?.id === "silent"
        ? "No sound"
        : bed ? `${bed.title} (${bed.mood})` : variation.shortBed,
      shotScale: variation.shotScale,
      shotScaleLabel: shotScaleLabel(variation.shotScale),
      ctaLayout: variation.ctaLayout ?? null,
      ctaReview: variation.ctaReview === true,
      shortUrl,
      experiment: experimentPartner(post.id),
      slides: slideRows.map((s) => ({
        ...s,
        url: publicSlideUrl(
          slideOwnerFromPath(s.filePath, post.id),
          s.idx,
          variation.ctaReview ? CTA_CACHE : prelaunch ? `${CTA_CACHE}-prelaunch` : undefined,
        ),
      })),
      analytics: latestAnalytics,
    });
  }

  const statusCounts = Object.entries(
    mapped.reduce<Record<string, number>>((acc, p) => {
      acc[p.status] = (acc[p.status] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([status, count]) => ({ status, count }));

  const diagnosisCounts = Object.entries(
    mapped.reduce<Record<string, number>>((acc, p) => {
      if (p.diagnosis) acc[p.diagnosis] = (acc[p.diagnosis] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([diagnosis, count]) => ({ diagnosis, count }));

  const pipeline = [
    { id: "queued", label: "Review queue", count: mapped.filter((p) => p.status === "queued").length },
    { id: "approved", label: "Approved", count: mapped.filter((p) => p.status === "approved").length },
    { id: "draft_sent", label: "TikTok drafts", count: mapped.filter((p) => p.status === "draft_sent").length },
    { id: "published", label: "Published", count: mapped.filter((p) => p.status === "published").length },
    { id: "rejected", label: "Rejected / learned", count: mapped.filter((p) => p.status === "rejected").length },
    { id: "failed", label: "Failed", count: mapped.filter((p) => p.status === "failed").length },
  ];

  const templates = Object.values(TEMPLATES).map((t) => {
    const used = mapped.filter((p) => p.templateId === t.id);
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      slideKinds: t.slides.map((s) => s.kind),
      preferMusic: Boolean(t.preferMusic),
      used: used.length,
      approved: used.filter((p) => ["approved", "draft_sent", "published"].includes(p.status)).length,
      rejected: used.filter((p) => p.status === "rejected").length,
    };
  });

  const calendar = mapped
    .filter((p) => p.scheduledAt)
    .sort((a, b) => String(a.scheduledAt).localeCompare(String(b.scheduledAt)))
    .map((p) => ({
      id: p.id,
      hookText: p.hookText,
      templateId: p.templateId,
      status: p.status,
      scheduledAt: p.scheduledAt,
    }));

  const cropPath = path.join(ASSETS_DIR, "crop-config.json");
  const metaPath = path.join(ASSETS_DIR, "meta.json");
  let cropConfig: Record<string, { skipTopPct: number; cropHPct: number }> = {};
  try {
    if (fs.existsSync(cropPath)) {
      cropConfig = JSON.parse(fs.readFileSync(cropPath, "utf-8")) as Record<string, { skipTopPct: number; cropHPct: number }>;
    }
  } catch { /* ignore */ }
  const shotMeta = readScreenshotMeta();

  const screenshotFiles = listLocalScreenshots().filter(
    (file) => !libraryOverrides.deletedScreenshots.includes(file),
  );
  for (const file of screenshotFiles) {
    const local = screenshotPath(file);
    const ext = path.extname(file).toLowerCase();
    const type = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    await uploadBuffer(`${SCREENSHOT_R2_PREFIX}${file}`, fs.readFileSync(local), type);
    await persistThumb(file, local).catch(() => {});
  }
  if (fs.existsSync(cropPath)) {
    await uploadBuffer(
      `${SCREENSHOT_R2_PREFIX}crop-config.json`,
      fs.readFileSync(cropPath),
      "application/json",
    );
  }
  if (fs.existsSync(metaPath)) {
    await uploadBuffer(
      `${SCREENSHOT_R2_PREFIX}meta.json`,
      fs.readFileSync(metaPath),
      "application/json",
    );
  }

  // Mirror the full illustration catalog (including rejected) so the cloud
  // SVGs tab can reject/enable without the PC engine.
  const illustrationAssets = allIllustrationAssets();
  for (const asset of illustrationAssets) {
    const key = `${ILLUSTRATION_R2_PREFIX}${asset.file}`;
    if (await objectExists(key)) continue;
    await uploadBuffer(key, fs.readFileSync(illustrationFilePath(asset)), illustrationMime(asset.file));
  }

  let insights: {
    summaries: ReturnType<typeof allSummaries>;
    experiments: ReturnType<typeof listExperiments>;
    coverage: ReturnType<typeof getAssetUsage> | null;
    signals: Array<typeof signals.$inferSelect>;
    cycle: ReturnType<typeof getCycleState> | null;
    ratings: ReturnType<typeof allRatings>;
  } = { summaries: [], experiments: [], coverage: null, signals: [], cycle: null, ratings: [] };
  try {
    insights = {
      summaries: allSummaries(),
      experiments: listExperiments(50),
      coverage: getAssetUsage(),
      signals: db.select().from(signals).orderBy(desc(signals.createdAt)).limit(100).all(),
      cycle: getCycleState(),
      ratings: allRatings(),
    };
  } catch (err) {
    console.warn("Insights snapshot section failed:", err instanceof Error ? err.message : err);
  }

  const snapshot = {
    updatedAt: new Date().toISOString(),
    engine: "cloud" as const,
    pendingCount,
    posts: mapped,
    hooks: allHooks,
    formulas: allFormulas,
    learnings: allLearnings,
    insights,
    templates,
    pipeline,
    calendar,
    summary: {
      statusCounts,
      diagnosisCounts,
      topPosts: mapped
        .filter((p) => p.status === "published" || p.status === "draft_sent")
        .slice(0, 10),
      totalPublished: mapped.filter((p) => p.status === "published").length,
      pendingCount,
    },
    screenshots: screenshotFiles.map((file) => ({
      file,
      skipTopPct: cropConfig[file]?.skipTopPct ?? 0.09,
      cropHPct: cropConfig[file]?.cropHPct ?? 0.45,
      exists: true,
      url: publicUrl(`${SCREENSHOT_R2_PREFIX}${file}`),
      description: shotMeta[file]?.description ?? defaultScreenshotDescription(file),
      cropped: isCroppedScreenshot(file, shotMeta[file]),
      source: shotMeta[file]?.source,
    })),
    illustrations: illustrationAssets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      description: asset.description,
      source: asset.source,
      license: asset.license,
      themes: asset.themes,
      fit: illustrationFit(asset),
      enabled: isIllustrationEnabled(asset),
      url: publicUrl(`${ILLUSTRATION_R2_PREFIX}${asset.file}`),
    })),
    settings: {
      postsPerDay: env.POSTS_PER_DAY,
      generateAt: `4:30 AM ${env.CRON_TZ}`,
      platforms: env.PLATFORMS,
      autoPublish: env.AUTO_PUBLISH,
      autoAssignSchedule: env.AUTO_ASSIGN_SCHEDULE,
      livePublish: env.LIVE_PUBLISH,
      autoApproveConfidence: env.AUTO_APPROVE_CONFIDENCE,
      llmProvider: env.LLM_PROVIDER,
      todayCap: effectiveDailyCap(),
      rampCap: rampCap(),
      rampStartDate: env.RAMP_START_DATE,
      generateEnabled: env.GENERATE_ENABLED,
      analyticsEnabled: env.ANALYTICS_ENABLED,
      learningEnabled: env.LEARNING_ENABLED,
      expireShorts: env.EXPIRE_SHORTS,
      tiktokPostMode: env.TIKTOK_POST_MODE,
      r2Configured: true,
      tiktokAppConfigured: publisherReady("tiktok"),
      tiktokConnected: brightbeanPublicStatus().accounts.some((a) => a.mapped === "tiktok") || tiktokConnected(),
      tiktokNativeConnected: tiktokConnected(),
      tiktokNativeAppConfigured: Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET),
      tiktokAuthUrl: env.TIKTOK_CLIENT_KEY ? buildAuthUrl() : "",
      appStoreUrl: BRAND.appStoreUrl,
      instagramConfigured: publisherReady("instagram"),
      facebookConfigured: publisherReady("facebook"),
      youtubeConfigured: publisherReady("youtube"),
      geminiConfigured: Boolean(env.GEMINI_API_KEY),
      brightbean: brightbeanPublicStatus(),
      audience: loadAudience(),
      snapshotOnly: true,
      pendingCount,
      prelaunch: env.PRELAUNCH,
      manualPosting: manual,
    },
    ugc: await (async () => {
      try {
        const pack = listUgcSnapshot();
        const lib = await loadLibrary().catch(() => ({ folders: [], clips: {} }));
        return {
          ...pack,
          folders: lib.folders,
          videos: applyLibraryToVideos(pack.videos, lib),
          insights: ugcInsightsPayload(),
        };
      } catch (err) {
        console.warn("UGC snapshot section failed:", err instanceof Error ? err.message : err);
        return { creators: [], videos: [], folders: [], pendingReview: 0, insights: { videos: [], whatWorked: [], diagnosisCounts: [], published: 0, pendingReview: 0 } };
      }
    })(),
  };

  const url = await uploadBuffer(
    DASHBOARD_KEY,
    Buffer.from(JSON.stringify(snapshot), "utf8"),
    "application/json",
  );
  console.log(`Dashboard snapshot published: ${url}`);
  return url;
}
