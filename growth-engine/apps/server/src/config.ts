import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const here = path.dirname(fileURLToPath(import.meta.url));
/** growth-engine/ root */
export const ROOT_DIR = path.join(here, "..", "..", "..");
export const ASSETS_DIR = path.join(ROOT_DIR, "assets", "screenshots");
export const OUTPUT_DIR = path.join(ROOT_DIR, "output");
export const WEB_DIST_DIR = path.join(ROOT_DIR, "apps", "web", "dist");

dotenv.config({ path: path.join(ROOT_DIR, ".env") });

const boolStr = (def: string) =>
  z
    .string()
    .default(def)
    .transform((v) => v.toLowerCase() === "true");

const EnvSchema = z
  .object({
    // --- Text generation ---
    LLM_PROVIDER: z.enum(["cursor", "gemini", "none"]).default("cursor"),
    CURSOR_AGENT_BIN: z.string().default("agent"),
    /** Comma-separated model list — one is picked at random per call. */
    CURSOR_MODEL: z.string().default("auto"),
    GEMINI_API_KEY: z.string().default(""),
    GEMINI_MODEL: z.string().default("gemini-2.5-flash"),

    // --- LLM rate limiting (defense-in-depth behind the studio password gate) ---
    LLM_MAX_PER_MINUTE: z.coerce.number().int().min(1).max(60).default(4),
    LLM_MAX_PER_HOUR: z.coerce.number().int().min(1).max(500).default(30),
    LLM_MAX_PER_DAY: z.coerce.number().int().min(1).max(5000).default(200),
    LLM_MAX_CONCURRENT: z.coerce.number().int().min(1).max(10).default(2),

    // --- Slide hosting (Cloudflare R2, S3-compatible) ---
    R2_ACCOUNT_ID: z.string().default(""),
    R2_ACCESS_KEY_ID: z.string().default(""),
    R2_SECRET_ACCESS_KEY: z.string().default(""),
    R2_BUCKET: z.string().default(""),
    R2_PUBLIC_BASE_URL: z.string().default(""),

    // --- TikTok (your own developer app) ---
    TIKTOK_CLIENT_KEY: z.string().default(""),
    TIKTOK_CLIENT_SECRET: z.string().default(""),
    TIKTOK_REDIRECT_URI: z.string().default(""),
    /** MEDIA_UPLOAD = drafts you finish in the app; DIRECT_POST needs TikTok's audit */
    TIKTOK_POST_MODE: z.enum(["MEDIA_UPLOAD", "DIRECT_POST"]).default("MEDIA_UPLOAD"),

    // --- Instagram / Facebook (Meta Graph API) — unused when BrightBean is connected ---
    IG_USER_ID: z.string().default(""),
    IG_ACCESS_TOKEN: z.string().default(""),
    FB_PAGE_ID: z.string().default(""),
    FB_PAGE_TOKEN: z.string().default(""),

    // --- BrightBean Studio (hosted publisher for TikTok / IG / FB / YouTube) ---
    BRIGHTBEAN_TOKEN: z.string().default(""),
    BRIGHTBEAN_BASE_URL: z.string().default("https://studio.brightbean.xyz"),

    // --- Behavior ---
    PLATFORMS: z.string().default("tiktok,instagram,facebook"),
    // youtube is added automatically when BrightBean has a YouTube account.
    POSTS_PER_DAY: z.coerce.number().int().min(1).max(50).default(10),
    /** Warm-up ramp: "day:cap" pairs, e.g. "1:2,8:5,15:10". Needs RAMP_START_DATE. */
    RAMP_SCHEDULE: z.string().default("1:2,8:5,15:10"),
    /** ISO date the ramp starts counting from (e.g. 2026-08-22). Empty = ramp off. */
    RAMP_START_DATE: z.string().default(""),
    /** New slideshows / remakes / A/B variants. Off until you say generate. Ramp date does not turn this on. */
    GENERATE_ENABLED: boolStr("false"),
    /**
     * Coming-soon last slide + caption (no App Store URL). Keep true until
     * the app is for sale, then flip to false so new posts get the store CTA.
     */
    PRELAUNCH: boolStr("true"),
    /** Delete shorts 48h after publish. Off until you start posting. */
    EXPIRE_SHORTS: boolStr("false"),
    /** BrightBean / platform metric pulls. Off until posting is measurable. */
    ANALYTICS_ENABLED: boolStr("false"),
    /** Diagnosis, experiments, summaries, evolve. Off with analytics for now. */
    LEARNING_ENABLED: boolStr("false"),
    /** When true, cron sends approved posts at their scheduled slot (drafts or live, depending on LIVE_PUBLISH). */
    AUTO_PUBLISH: boolStr("false"),
    /** When true, cron fills empty slots on every approved post. Keep off so only hand-set times send. */
    AUTO_ASSIGN_SCHEDULE: boolStr("false"),
    /**
     * Native Instagram/Facebook only (no BrightBean): they go live immediately,
     * so they stay off until this is true. BrightBean IG/FB/YouTube always go
     * live. TikTok is always a draft so you can add a sound in the app.
     */
    LIVE_PUBLISH: boolStr("false"),
    AUTO_APPROVE_CONFIDENCE: z.coerce.number().min(0).max(101).default(101),
    DISABLE_CRON: boolStr("false"),
    /** IANA timezone for the 4:30 AM generate cron (machine local if unset). */
    CRON_TZ: z.string().default("America/Chicago"),
    NOTIFY_WEBHOOK_URL: z.string().default(""),
    PORT: z.coerce.number().int().default(3000),

    /** Comma-separated operator emails. Empty = anyone who is not a listed creator is operator. */
    UGC_OPERATOR_EMAILS: z.string().default(""),
    /** "slug:email" pairs, e.g. sohan:sohan@example.com */
    UGC_CREATORS: z.string().default(""),
    /** Shared studio password. Empty = no login gate (local dev default). */
    STUDIO_PASSWORD: z.string().default(""),
  })
  .strict();

const parsed = EnvSchema.safeParse(
  Object.fromEntries(Object.keys(EnvSchema.shape).map((k) => [k, process.env[k]])),
);

if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

export const SUPPORTED_PLATFORMS = ["tiktok", "instagram", "facebook", "youtube"] as const;
export type Platform = (typeof SUPPORTED_PLATFORMS)[number];

export function configuredPlatforms(): Platform[] {
  return env.PLATFORMS.split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is Platform => (SUPPORTED_PLATFORMS as readonly string[]).includes(p));
}

/** Conservative per-24h caps (TikTok's Direct Post cap is ~15/day/creator). */
export const PLATFORM_DAILY_CAPS: Record<Platform, number> = {
  tiktok: 15,
  instagram: 50,
  facebook: 25,
  youtube: 50,
};

/** Native platform keys only. Prefer `publisherReady()` from publish/brightbean.ts. */
export function platformConfigured(p: Platform): boolean {
  switch (p) {
    case "tiktok":
      return Boolean(env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET);
    case "instagram":
      return Boolean(env.IG_USER_ID && env.IG_ACCESS_TOKEN);
    case "facebook":
      return Boolean(env.FB_PAGE_ID && env.FB_PAGE_TOKEN);
    case "youtube":
      return false; // video-only; BrightBean YouTube via publisherReady()
  }
}

export function brightbeanEnvToken(): string {
  return env.BRIGHTBEAN_TOKEN.trim();
}

export function r2Configured(): boolean {
  return Boolean(
    env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_PUBLIC_BASE_URL,
  );
}

export const GENERATE_PAUSED_MESSAGE =
  "Generate is paused. No new slideshows, remakes, or A/B variants until you turn GENERATE_ENABLED on. The ramp date does not turn generate on.";

export const EXPIRE_SHORTS_PAUSED_MESSAGE =
  "Short expiry is off until you start posting. Existing shorts stay on disk and R2.";

export const ANALYTICS_PAUSED_MESSAGE =
  "Analytics is paused. No BrightBean pulls until ANALYTICS_ENABLED=true.";

export const LEARNING_PAUSED_MESSAGE =
  "Learning is paused. No diagnosis or evolve until LEARNING_ENABLED=true.";

/** Brand configuration for Remedy — drives copy generation and slide styling. */
export const BRAND = {
  appName: "Remedy",
  tagline: "A stronger back starts here.",
  niche: "back pain rehab",
  audience:
    "people with chronic or recurring back pain who sit a lot, have tried stretches/YouTube/TikTok without a plan, and do not want to pay $150 a PT visit just to get a structured program",
  valueProps: [
    "A program, not a playlist — same movements, in order, for weeks. Not a 3-exercise reel",
    "Personalized from your answers — not a generic stretch list, not hundreds a visit",
    "Video-guided, every rep — follow along with real exercise videos",
    "Fits your schedule — 15 minutes, not an hour for PT",
    "Get back to training / sitting / living — not become a yoga person",
  ],
  painPoints: [
    "paying hundreds a visit just to get a structured PT plan",
    "YouTube and TikTok playlists that aren't yours and aren't a program",
    "stretch-only, rest-and-wait, and mattress shopping that keep you stuck",
    "back pain is huge and nobody treats it like a plan",
    "desk-job ache, gym-bro flare, or 'this started at 20' — no that's-me program",
  ],
  appStoreUrl: "https://apps.apple.com/app/id6813745106",
  cta: "Download Remedy on the App Store — link in bio",
  colors: {
    green: "#33663f",
    greenDark: "#264d2f",
    cream: "#f7f2e9",
    dark: "#1c1c1e",
    text: "#1c1c1e",
    textOnDark: "#ffffff",
  },
  /** Screenshot filename -> what it is + when to use it */
  screenshots: {
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
    "img_0528.png": "Onboarding: main goal options (unselected). Prefer img_0529 when the slide needs a filled answer.",
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
  } as Record<string, string>,
} as const;
