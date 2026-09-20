export interface Slide {
  id: number;
  idx: number;
  kind: string;
  headline: string;
  sub: string;
  screenshot: string | null;
  url: string;
}

export interface AnalyticsRow {
  platform: string;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  fetchedAt: string;
}

export const APP_STORE_URL = "https://apps.apple.com/app/id6813745106";

export interface ExperimentRef {
  experimentId: number;
  partnerId: number;
  dimension: string;
}

export interface Post {
  id: number;
  hookText: string;
  hookSource: string;
  templateId: string;
  music?: string;
  musicCue?: string;
  variation?: { music?: string };
  caption: string;
  tiktokTitle: string;
  hashtags: string;
  platforms: string[];
  status: string;
  confidence: number;
  scheduledAt: string | null;
  publishedAt: string | null;
  diagnosis: string | null;
  createdAt: string;
  /** Coming-soon last slide + caption (no App Store URL). */
  prelaunch?: boolean;
  shortUrl?: string | null;
  shortBed?: string | null;
  shortBedLabel?: string | null;
  shotScale?: string | null;
  shotScaleLabel?: string | null;
  ctaLayout?: "phone" | "phone_soon" | "bleed" | "plate" | "copy_first" | "diagonal" | null;
  ctaLayoutLabel?: string | null;
  ctaReview?: boolean;
  slides: Slide[];
  analytics: AnalyticsRow[];
  totalViews?: number;
  totalEngagement?: number;
  /** Set when this post is one side of an open A/B experiment. */
  experiment?: ExperimentRef | null;
}

export interface Hook {
  id: number;
  text: string;
  category: string;
  source: string;
  status: string;
  score: number;
  createdAt: string;
}

export interface Formula {
  id: number;
  name: string;
  category: string;
  template: string;
  score: number;
  wins: number;
  losses: number;
  notes: string | null;
}

export interface Learning {
  id: number;
  kind: string;
  content: string;
  score: number;
  updatedAt: string;
}

export interface TemplateStat {
  id: string;
  name: string;
  description: string;
  slideKinds: string[];
  preferMusic?: boolean;
  used: number;
  approved: number;
  rejected: number;
}

export interface PipelineStep {
  id: string;
  label: string;
  count: number;
}

export interface CalendarItem {
  id: number;
  hookText: string;
  templateId: string;
  status: string;
  scheduledAt: string | null;
}

export interface Summary {
  statusCounts: Array<{ status: string; count: number }>;
  diagnosisCounts: Array<{ diagnosis: string; count: number }>;
  topPosts: Post[];
  totalPublished: number;
  pendingCount?: number;
}

// ---- Structured learning (Insights tab) ----

export const SIGNAL_DIMENSIONS = ["hook", "copy", "layout", "template", "asset", "visual", "timing", "music", "shot_scale"] as const;
export type SignalDimension = (typeof SIGNAL_DIMENSIONS)[number];
export const TESTABLE_DIMENSIONS = ["hook", "template", "asset", "visual", "music", "shot_scale"] as const;
export type TestableDimension = (typeof TESTABLE_DIMENSIONS)[number];

export interface DimensionSummary {
  dimension: SignalDimension;
  category: string;
  direction: "prefer" | "avoid";
  summary: string;
  evidenceCount: number;
  confidence: number;
}

export interface Signal {
  id: number;
  dimension: SignalDimension;
  category: string;
  source: string;
  direction: "prefer" | "avoid";
  content: string;
  score: number;
  postId: number | null;
  createdAt: string;
}

export interface Experiment {
  id: number;
  postAId: number;
  postBId: number;
  dimension: string;
  variableDetail: { a: string; b: string } | null;
  status: "pending" | "active" | "concluded" | "cancelled";
  winner: "a" | "b" | "tie" | null;
  liftPct: number | null;
  createdAt: string;
  concludedAt: string | null;
  postAStatus: string;
  postBStatus: string;
  hookAText: string;
  hookBText: string;
}

export interface AssetStat {
  name: string;
  totalUses: number;
  publishedUses: number;
  views: number;
  reach?: number;
  cold: boolean;
}

export interface AssetCoverage {
  screenshots: AssetStat[];
  svgs: AssetStat[];
  templates: AssetStat[];
  formulas: Array<AssetStat & { id: number; category: string }>;
  music?: AssetStat[];
  shotScales?: AssetStat[];
  cold?: { screenshots: string[]; svgs: string[]; templates: string[] };
}

export interface RoundCoverage {
  shippedThisRound: number;
  target: number;
  newlyTested: { templates: string[]; screenshots: string[]; svgs: string[]; formulas: string[]; styleCombos: string[]; music?: string[]; shotScales?: string[] };
  allTime: {
    templates: { tested: number; total: number };
    screenshots: { tested: number; total: number };
    svgs: { tested: number; total: number };
    formulas: { tested: number; total: number };
    styleCombos: { tested: number; total: number };
    music?: { tested: number; total: number };
    shotScales?: { tested: number; total: number };
  };
  stillCold: { templates: string[]; screenshots: string[]; svgs: string[]; styleCombos: string[]; music?: string[]; shotScales?: string[] };
}

export interface RoundRollup {
  phase: "diversity" | "ab_test";
  shipped: number;
  newlyTested: RoundCoverage["newlyTested"];
  signalsGathered: number;
  topPosts: Array<{ postId: number; hook: string; diagnosis: string | null }>;
  experimentResults: Array<{ id: number; dimension: string; winner: string | null; liftPct: number | null }>;
}

export interface CycleState {
  current: {
    number: number;
    phase: "diversity" | "ab_test";
    startedAt: string;
    target: number;
    progress: number;
    progressLabel: string;
    coverage: RoundCoverage;
    dailyCap?: number;
    warmup?: boolean;
    fullPaceTargets?: { diversity: number; ab: number };
  };
  history: Array<{
    number: number;
    phase: string;
    startedAt: string;
    concludedAt: string | null;
    summary: RoundRollup | null;
  }>;
  audience?: {
    platforms: Array<{
      platform: string;
      followers: number;
      followerDelta: number | null;
      fetchedAt: string;
      available?: boolean;
      unavailableReason?: string | null;
    }>;
    refreshedAt: string;
  } | null;
  policy?: {
    matureHours: number;
    minCohort: number;
    winnerMultiple: number;
    dudMultiple: number;
    replicateN: number;
    followerBand: number;
    eraDays: number;
  };
  howItWorks: string[];
}

export interface AssetRating {
  dimension: "template" | "formula" | "hook_category" | "screenshot" | "svg" | "youtube_music" | "shot_scale";
  key: string;
  score: number;
  samples: number;
  updatedAt: string;
}

export interface InsightsData {
  summaries: DimensionSummary[];
  experiments: Experiment[];
  coverage: AssetCoverage | null;
  signals: Signal[];
  cycle?: CycleState | null;
  ratings?: AssetRating[];
}

export interface BrightbeanAccount {
  id: string;
  platform: string;
  mapped: "tiktok" | "instagram" | "facebook" | "youtube";
  name: string;
  handle: string;
  status: string;
}

export interface BrightbeanStatus {
  configured: boolean;
  connected: boolean;
  workspace: string;
  permissions: string[];
  accounts: BrightbeanAccount[];
  tokenHint: string | null;
  youtubeConnected: boolean;
  publisher: "brightbean" | "native";
}

export interface Settings {
  postsPerDay: number;
  generateAt?: string;
  platforms: string;
  autoPublish: boolean;
  livePublish: boolean;
  autoApproveConfidence: number;
  llmProvider: string;
  todayCap: number;
  rampCap: number;
  rampStartDate: string;
  generateEnabled?: boolean;
  analyticsEnabled?: boolean;
  learningEnabled?: boolean;
  expireShorts?: boolean;
  tiktokPostMode: string;
  r2Configured: boolean;
  tiktokAppConfigured: boolean;
  tiktokConnected: boolean;
  tiktokNativeConnected?: boolean;
  tiktokNativeAppConfigured?: boolean;
  instagramConfigured: boolean;
  facebookConfigured: boolean;
  youtubeConfigured?: boolean;
  geminiConfigured: boolean;
  snapshotOnly?: boolean;
  pendingCount?: number;
  tiktokAuthUrl?: string;
  brightbean?: BrightbeanStatus;
  audience?: CycleState["audience"];
  prelaunch?: boolean;
  manualPosting?: { currentPostId: number | null; completedIds: number[] };
  [key: string]: unknown;
}

export interface ScreenshotAsset {
  file: string;
  skipTopPct: number;
  cropHPct: number;
  exists: boolean;
  url?: string;
  description?: string;
  cropped?: boolean;
  source?: string;
}

export const DEFAULT_SCREENSHOT_DESCRIPTIONS: Record<string, string> = {
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
};

/** Crop copy for a source screenshot — never the same sentence as the full SS. */
export const CROP_FROM_SOURCE: Record<string, string> = {
  "home.png": "Crop: today's session card + Start Session. Use for start-today CTA, not the full home screen.",
  "session.png": "Crop: exercise video + reps counter. Use for in-app form proof.",
  "cat_cow.png": "Crop: cat-cow video player. Use for guided stretch close-up.",
  "progress.png": "Crop: week ring + pain trend. Use for recovery proof close-up.",
  "pain_check.png": "Crop: 1–10 pain slider. Use for check-in close-up.",
  "workout_days.png": "Crop: workout days + reminder toggle. Use for schedule close-up.",
  "session_preview.png": "Crop: 19 min + exercise list. Use for plan/length close-up.",
  "profile.png": "Crop: profile stats + plan. Use only when the slide is about identity/progress.",
  "profile_original.png": "Crop: full profile. Use only if you need the uncropped profile close-up.",
  "img_0460.png": "Crop: Remedy splash wordmark. Use for brand close-up.",
  "img_0461.png": "Crop: workout days picker + 3-session plan. Use for schedule close-up.",
  "img_0462.png": "Crop: pain trend + activity bars. Use for recovery proof close-up.",
  "img_0463.png": "Crop: Your Program — pain, goal, days. Use for tailored-plan close-up.",
  "img_0464.jpeg": "Crop: stretch reminders on, every 30 min. Use for reminder close-up.",
  "img_0465.png": "Crop: single-leg glute bridge video. Use for exercise close-up.",
  "img_0466.png": "Crop: goblet squat + dumbbell. Use for gym exercise close-up.",
  "img_0467.png": "Crop: child's pose hold timer. Use for stretch close-up.",
  "img_0469.png": "Crop: thoracic extension on chair. Use for desk/mobility close-up.",
  "img_0470.png": "Crop: bird dog hold. Use for core/stability close-up.",
  "img_0471.png": "Crop: dead bug, 10 reps. Use for core exercise close-up.",
  "img_0472.png": "Crop: barbell hip thrust. Use for gym strength close-up.",
  "img_0473.png": "Crop: bodyweight squat. Use for no-equipment close-up.",
  "img_0475.png": "Crop: kettlebell deadlift. Use for gym hinge close-up.",
  "img_0476.png": "Crop: kettlebell deadlift (alt). Use for gym hinge close-up.",
  "img_0477.png": "Crop: split squat, 10 reps. Use for single-leg close-up.",
};

export function cropDescriptionFor(sourceFile: string, sourceDescription?: string): string {
  const mapped = CROP_FROM_SOURCE[sourceFile];
  if (mapped) return mapped;
  const what = (sourceDescription || DEFAULT_SCREENSHOT_DESCRIPTIONS[sourceFile] || sourceFile)
    .split(". Use")[0]
    .replace(/^(Crop:\s*)/i, "")
    .trim();
  return `Crop: ${what}. Use for a close-up of that UI, not the full screenshot.`.slice(0, 160);
}

export function autoScreenshotDescription(
  file: string,
  opts?: { cropped?: boolean; source?: string; sourceDescription?: string },
): string {
  if (opts?.cropped) {
    const named = DEFAULT_SCREENSHOT_DESCRIPTIONS[file];
    if (named && named.startsWith("Crop:")) return named;
    return cropDescriptionFor(opts.source ?? "", opts.sourceDescription);
  }
  const known = DEFAULT_SCREENSHOT_DESCRIPTIONS[file];
  if (known) return known;
  const stem = file.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return `${stem}. Use when this screen matches the hook.`.slice(0, 160);
}

export interface IllustrationAsset {
  id: string;
  name: string;
  description: string;
  source: string;
  license: string;
  themes: string[];
  /** scene = full-canvas tile; figure = transparent doodle; photo = photoreal person */
  fit?: "scene" | "figure" | "photo";
  /** false = rejected; only enabled assets are used on new slides */
  enabled?: boolean;
  /** Inline framed preview (live engine mode) */
  svg?: string;
  /** R2-hosted raw SVG (cloud snapshot mode) */
  url?: string;
}

export interface StudioMe {
  email: string;
  role: "operator" | "creator";
  creatorSlug: string | null;
  engine?: "live" | "cloud";
  /** True when the studio password gate wants a login before anything loads. */
  authRequired?: boolean;
}

export interface UgcVideo {
  id?: number;
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
  clipTitle?: string;
  folderId?: string | null;
  analytics: AnalyticsRow[];
}

export interface UgcFolder {
  id: string;
  name: string;
  creatorSlug: string;
  createdAt: string;
  coverUuid: string | null;
}

export interface UgcInsights {
  videos: Array<UgcVideo & { views: number; likes: number; comments: number; shares: number; saves: number; engagement: number }>;
  whatWorked: Array<UgcVideo & { views: number }>;
  diagnosisCounts: Array<{ diagnosis: string; count: number }>;
  published: number;
  pendingReview: number;
}

export interface UgcSnapshot {
  creators: Array<{ slug: string; displayName: string }>;
  videos: UgcVideo[];
  folders?: UgcFolder[];
  pendingReview: number;
  insights?: UgcInsights;
}

export interface DashboardSnapshot {
  updatedAt: string;
  engine?: "live" | "cloud";
  pendingCount?: number;
  posts: Post[];
  hooks: Hook[];
  formulas?: Formula[];
  learnings: Learning[];
  insights?: InsightsData;
  templates?: TemplateStat[];
  pipeline?: PipelineStep[];
  calendar?: CalendarItem[];
  screenshots?: ScreenshotAsset[];
  illustrations?: IllustrationAsset[];
  summary: Summary;
  settings: Settings;
  ugc?: UgcSnapshot;
}

export const PUBLIC_ASSET_BASE = "https://slides.remedyrecoveries.com";
export const SNAPSHOT_URL = `${PUBLIC_ASSET_BASE}/growth/dashboard.json`;

function withBust(base: string, bust?: number): string {
  if (bust == null) return base;
  return `${base}${base.includes("?") ? "&" : "?"}t=${bust}`;
}

export function shotSrc(entry: { file: string; url?: string }, bust?: number): string {
  const base = entry.url
    ? entry.url
    : `${PUBLIC_ASSET_BASE}/growth/screenshots/${encodeURIComponent(entry.file)}`;
  return withBust(base, bust);
}

export function shotThumbSrc(entry: { file: string }, bust?: number): string {
  const stem = entry.file.replace(/\.[^.]+$/, "");
  return withBust(`${PUBLIC_ASSET_BASE}/growth/screenshots/thumbs/${encodeURIComponent(`${stem}.jpg`)}`, bust);
}

let snapshotCache: DashboardSnapshot | null = null;
let snapshotFetchedAt = 0;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function tryApi<T>(fn: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback();
  }
}

export async function loadSnapshot(force = false): Promise<DashboardSnapshot> {
  if (!force && snapshotCache && Date.now() - snapshotFetchedAt < 15_000) return snapshotCache;
  let data: DashboardSnapshot | null = null;
  try {
    const local = await fetch("/api/snapshot", { cache: "no-store" });
    if (local.ok) data = await json<DashboardSnapshot>(local);
  } catch {
    /* try public URL */
  }
  if (!data) {
    const res = await fetch(`${SNAPSHOT_URL}?t=${Date.now()}`, { cache: "no-store" });
    data = await json<DashboardSnapshot>(res);
  }
  snapshotCache = data;
  snapshotFetchedAt = Date.now();
  return data;
}

export const api = {
  snapshot: () => loadSnapshot(true),
  me: (): Promise<StudioMe> =>
    fetch("/api/me", { credentials: "include" })
      .then(async (r): Promise<StudioMe> => {
        if (r.status === 401) {
          return { email: "", role: "operator", creatorSlug: null, authRequired: true };
        }
        return json<StudioMe>(r);
      })
      .catch((): StudioMe => ({ email: "", role: "operator", creatorSlug: null })),
  login: async (password: string): Promise<{ ok: boolean; error?: string }> => {
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ password }),
    }).catch(() => null);
    if (!r) return { ok: false, error: "Network error — try again." };
    const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (r.ok && data.ok) return { ok: true };
    return { ok: false, error: data.error ?? `Login failed (${r.status}).` };
  },
  logout: () =>
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).then((r) => json<{ ok: boolean }>(r)),
  health: () =>
    fetch("/api/health").then((r) => json<{ ok: boolean; engine: "live" | "cloud"; snapshotOnly?: boolean }>(r)),
  queue: () =>
    tryApi(
      () => fetch("/api/queue").then((r) => json<Post[]>(r)),
      async () => (await loadSnapshot()).posts.filter((p) => p.status === "queued"),
    ),
  posts: (status?: string) =>
    tryApi(
      () => fetch(`/api/posts${status ? `?status=${status}` : ""}`).then((r) => json<Post[]>(r)),
      async () => {
        const all = (await loadSnapshot()).posts;
        return status ? all.filter((p) => p.status === status) : all;
      },
    ),
  approve: (id: number) =>
    fetch(`/api/posts/${id}/approve`, { method: "POST" }).then((r) => json<{ ok: boolean; error?: string }>(r)),
  reject: (id: number, reason?: string) =>
    fetch(`/api/posts/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    }).then((r) => json<{ ok: boolean; error?: string }>(r)),
  approveAll: () =>
    fetch("/api/queue/approve-all", { method: "POST" }).then((r) => json<{ ok: boolean; approved: number }>(r)),
  sendDrafts: () =>
    fetch("/api/queue/send-drafts", { method: "POST" }).then((r) =>
      json<{ ok: boolean; sent: number; failed: number; errors: Array<{ postId: number; error: string }> }>(r),
    ),
  publish: (id: number) => fetch(`/api/posts/${id}/publish`, { method: "POST" }).then((r) => json<{ ok: boolean; error?: string }>(r)),
  completeManual: (postId: number) =>
    fetch("/api/manual/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
    }).then((r) => json<{ ok: boolean; currentPostId: number | null; completedIds: number[]; error?: string }>(r)),
  generate: (count?: number) =>
    fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(count ? { count } : {}),
    }).then((r) => json<{ ok: boolean; generated: number }>(r)),
  pullAnalytics: () => fetch("/api/analytics/pull", { method: "POST" }).then((r) => json<{ pulled: number }>(r)),
  runCycle: () => fetch("/api/cycle/run", { method: "POST" }).then((r) => json<Record<string, number>>(r)),
  summary: () =>
    tryApi(
      () => fetch("/api/summary").then((r) => json<Summary>(r)),
      async () => (await loadSnapshot()).summary,
    ),
  hooks: () =>
    tryApi(
      () => fetch("/api/hooks").then((r) => json<Hook[]>(r)),
      async () => (await loadSnapshot()).hooks,
    ),
  learnings: () =>
    tryApi(
      () => fetch("/api/learnings").then((r) => json<Learning[]>(r)),
      async () => (await loadSnapshot()).learnings,
    ),
  insightSummaries: () =>
    tryApi(
      () => fetch("/api/insights/summaries").then((r) => json<DimensionSummary[]>(r)),
      async () => (await loadSnapshot()).insights?.summaries ?? [],
    ),
  ratings: () =>
    tryApi(
      () => fetch("/api/insights/ratings").then((r) => json<AssetRating[]>(r)),
      async () => (await loadSnapshot()).insights?.ratings ?? [],
    ),
  experiments: () =>
    tryApi(
      () => fetch("/api/insights/experiments").then((r) => json<Experiment[]>(r)),
      async () => (await loadSnapshot()).insights?.experiments ?? [],
    ),
  coverage: () =>
    tryApi(
      () => fetch("/api/insights/coverage").then((r) => json<AssetCoverage>(r)),
      async () =>
        (await loadSnapshot()).insights?.coverage ?? { screenshots: [], svgs: [], templates: [], formulas: [] },
    ),
  cycle: () =>
    tryApi(
      () => fetch("/api/insights/cycle").then((r) => json<CycleState | null>(r)),
      async () => (await loadSnapshot()).insights?.cycle ?? null,
    ),
  signals: (dimension?: string) =>
    tryApi(
      () => fetch(`/api/insights/signals?limit=100${dimension ? `&dimension=${dimension}` : ""}`).then((r) => json<Signal[]>(r)),
      async () => {
        const all = (await loadSnapshot()).insights?.signals ?? [];
        return dimension ? all.filter((s) => s.dimension === dimension) : all;
      },
    ),
  createVariant: (postId: number, dimension?: TestableDimension) =>
    fetch("/api/experiments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dimension ? { postId, dimension } : { postId }),
    }).then((r) =>
      json<{ ok: boolean; error?: string; experimentId?: number; variantPostId?: number; dimension?: string; queued?: boolean; note?: string }>(r),
    ),
  buildShorts: () =>
    fetch("/api/shorts/build", { method: "POST" }).then((r) =>
      json<{ ok: boolean; built?: number; reused?: number; queued?: boolean; error?: string; note?: string }>(r),
    ),
  settings: () =>
    tryApi(
      () => fetch("/api/settings").then((r) => json<Settings>(r)),
      async () => (await loadSnapshot()).settings,
    ),
  tiktokAuthUrl: () => fetch("/api/tiktok/auth-url").then((r) => json<{ ok: boolean; url?: string; error?: string }>(r)),
  tiktokExchange: (code: string) =>
    fetch("/api/tiktok/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).then((r) => json<{ ok: boolean; error?: string }>(r)),
  tiktokDisconnect: () =>
    fetch("/api/tiktok/disconnect", { method: "POST" }).then((r) => json<{ ok: boolean }>(r)),
  brightbeanConnect: (token: string) =>
    fetch("/api/brightbean/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then((r) => json<{ ok: boolean; error?: string; workspace?: string; accounts?: BrightbeanAccount[] }>(r)),
  brightbeanRefresh: () =>
    fetch("/api/brightbean/refresh", { method: "POST" }).then((r) =>
      json<{ ok: boolean; error?: string; workspace?: string; accounts?: BrightbeanAccount[] }>(r),
    ),
  brightbeanDisconnect: () =>
    fetch("/api/brightbean/disconnect", { method: "POST" }).then((r) => json<{ ok: boolean }>(r)),

  screenshots: () =>
    tryApi(
      () => fetch("/api/assets/screenshots").then((r) => json<ScreenshotAsset[]>(r)),
      async () => (await loadSnapshot()).screenshots ?? [],
    ),
  cropConfig: () =>
    fetch("/api/assets/crop-config").then((r) => json<Record<string, { skipTopPct: number; cropHPct: number }>>(r)),
  saveCropConfig: (config: Record<string, { skipTopPct: number; cropHPct: number }>) =>
    fetch("/api/assets/crop-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }).then((r) => json<{ ok: boolean }>(r)),
  saveScreenshotMeta: (file: string, description: string) =>
    fetch(`/api/assets/screenshots/${encodeURIComponent(file)}/meta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    }).then((r) => json<{ ok: boolean; file?: string; description?: string; error?: string }>(r)),
  uploadScreenshot: (
    file: File,
    opts?: { name?: string; description?: string; cropped?: boolean; source?: string; thumb?: Blob },
  ) => {
    const body = new FormData();
    const name = opts?.name ?? file.name;
    body.append("file", file, name);
    body.append("name", name);
    if (opts?.description) body.append("description", opts.description);
    if (opts?.cropped) body.append("cropped", "1");
    if (opts?.source) body.append("source", opts.source);
    if (opts?.thumb) body.append("thumb", opts.thumb, "thumb.jpg");
    return fetch("/api/assets/screenshots", { method: "POST", body }).then((r) =>
      json<{ ok: boolean; file?: string; error?: string }>(r),
    );
  },
  illustrations: () =>
    tryApi(
      () => fetch("/api/assets/illustrations").then((r) => json<IllustrationAsset[]>(r)),
      async () => (await loadSnapshot()).illustrations ?? [],
    ),
  setIllustrationEnabled: (id: string, enabled: boolean) =>
    fetch(`/api/assets/illustrations/${encodeURIComponent(id)}/enabled`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    }).then((r) => json<{ ok: boolean; error?: string }>(r)),
  deleteScreenshot: (file: string) =>
    fetch(`/api/assets/screenshots/${encodeURIComponent(file)}`, { method: "DELETE" }).then((r) =>
      json<{ ok: boolean; error?: string }>(r),
    ),
  cropRequests: () =>
    fetch("/api/assets/crop-requests").then((r) => json<CropRequest[]>(r)),
  createCropRequest: (sourceFile: string, description: string) =>
    fetch("/api/assets/crop-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceFile, description }),
    }).then((r) => json<{ ok: boolean; id?: string; error?: string }>(r)),
  fulfillCropRequest: (id: string, file: File, name?: string) => {
    const body = new FormData();
    body.append("file", file, name ?? file.name);
    if (name) body.append("name", name);
    return fetch(`/api/assets/crop-requests/${encodeURIComponent(id)}/fulfill`, {
      method: "POST",
      body,
    }).then((r) => json<{ ok: boolean; file?: string; error?: string }>(r));
  },
  deleteCropRequest: (id: string) =>
    fetch(`/api/assets/crop-requests/${encodeURIComponent(id)}`, { method: "DELETE" }).then((r) =>
      json<{ ok: boolean; error?: string }>(r),
    ),
  ugc: () =>
    tryApi(
      () => fetch("/api/ugc", { credentials: "include" }).then((r) => json<UgcSnapshot>(r)),
      async () =>
        (await loadSnapshot()).ugc ?? {
          creators: [
            { slug: "sohan", displayName: "Sohan" },
            { slug: "ai", displayName: "AI" },
          ],
          videos: [],
          pendingReview: 0,
        },
    ),
  ugcInsights: () =>
    tryApi(
      () => fetch("/api/ugc/insights", { credentials: "include" }).then((r) => json<UgcInsights>(r)),
      async () =>
        (await loadSnapshot()).ugc?.insights ?? {
          videos: [],
          whatWorked: [],
          diagnosisCounts: [],
          published: 0,
          pendingReview: 0,
        },
    ),
  uploadUgc: (file: File, opts?: { creatorSlug?: string; uuid?: string }) => {
    const body = new FormData();
    body.append("file", file, file.name);
    if (opts?.creatorSlug) body.append("creatorSlug", opts.creatorSlug);
    if (opts?.uuid) body.append("uuid", opts.uuid);
    return fetch("/api/ugc/videos", { method: "POST", body, credentials: "include" }).then((r) =>
      json<{ ok: boolean; video?: UgcVideo; error?: string }>(r),
    );
  },
  approveUgc: (uuid: string, title?: string, caption?: string) =>
    fetch(`/api/ugc/videos/${encodeURIComponent(uuid)}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, caption }),
    }).then((r) => json<{ ok: boolean; video?: UgcVideo; error?: string }>(r)),
  rejectUgc: (uuid: string, reason?: string) =>
    fetch(`/api/ugc/videos/${encodeURIComponent(uuid)}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reason }),
    }).then((r) => json<{ ok: boolean; video?: UgcVideo; error?: string }>(r)),
  captionUgc: (uuid: string, title: string, caption: string) =>
    fetch(`/api/ugc/videos/${encodeURIComponent(uuid)}/caption`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ title, caption }),
    }).then((r) => json<{ ok: boolean; video?: UgcVideo; error?: string }>(r)),
  createUgcFolder: (name: string, creatorSlug: string) =>
    fetch("/api/ugc/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, creatorSlug }),
    }).then((r) => json<{ ok: boolean; folder?: UgcFolder; error?: string }>(r)),
  renameUgcFolder: (id: string, name: string) =>
    fetch(`/api/ugc/folders/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name }),
    }).then((r) => json<{ ok: boolean; folder?: UgcFolder; error?: string }>(r)),
  deleteUgcFolder: (id: string) =>
    fetch(`/api/ugc/folders/${encodeURIComponent(id)}`, {
      method: "DELETE",
      credentials: "include",
    }).then((r) => json<{ ok: boolean; error?: string }>(r)),
  organizeUgc: (uuid: string, body: { folderId?: string | null; clipTitle?: string }) =>
    fetch(`/api/ugc/videos/${encodeURIComponent(uuid)}/organize`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body),
    }).then((r) => json<{ ok: boolean; error?: string }>(r)),
  rawUrl: (file: string) => `/api/assets/raw/${encodeURIComponent(file)}`,
  previewUrl: (file: string, skipTopPct: number, cropHPct: number) =>
    `/api/assets/preview/${encodeURIComponent(file)}?skipTopPct=${skipTopPct.toFixed(3)}&cropHPct=${cropHPct.toFixed(3)}`,
};

export interface CropRequest {
  id: string;
  sourceFile: string;
  description: string;
  createdAt: string;
  fulfilled: boolean;
  fulfilledFile?: string;
}
