import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;

/** Reusable hook patterns ("formulas") that hooks are generated from. */
export const hookFormulas = sqliteTable("hook_formulas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  category: text("category").notNull(),
  /** Template with {placeholders}, e.g. "Still waking up with {pain}?" */
  template: text("template").notNull(),
  score: real("score").notNull().default(0),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  seeded: integer("seeded", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now),
});

/** Concrete hook texts, generated or evolved from winners. */
export const hooks = sqliteTable("hooks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  formulaId: integer("formula_id").references(() => hookFormulas.id),
  category: text("category").notNull().default("problem_solution"),
  /** generated = fresh from LLM, evolved = variation of a winner, seed = hand-written */
  source: text("source", { enum: ["generated", "evolved", "seed"] }).notNull().default("generated"),
  parentHookId: integer("parent_hook_id"),
  status: text("status", { enum: ["candidate", "used", "winner", "loser"] }).notNull().default("candidate"),
  score: real("score").notNull().default(0),
  createdAt: text("created_at").notNull().default(now),
});

/** A carousel post: hook + template + variation + caption, moving through the pipeline. */
export const posts = sqliteTable("posts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  hookId: integer("hook_id")
    .notNull()
    .references(() => hooks.id),
  templateId: text("template_id").notNull(),
  /** JSON: the seeded visual variation parameters used to render slides */
  variation: text("variation", { mode: "json" }).notNull(),
  caption: text("caption").notNull(),
  tiktokTitle: text("tiktok_title").notNull(),
  hashtags: text("hashtags").notNull().default(""),
  /** JSON string[] of platforms this post targets */
  platforms: text("platforms", { mode: "json" }).notNull(),
  status: text("status", {
    enum: ["draft", "queued", "approved", "rejected", "draft_sent", "published", "failed"],
  })
    .notNull()
    .default("draft"),
  /** 0-100: how confident the system is this will perform (grows with the knowledge base) */
  confidence: real("confidence").notNull().default(50),
  scheduledAt: text("scheduled_at"),
  publishedAt: text("published_at"),
  /** JSON map: platform -> { id?, publishId?, status, error? } from direct publishers */
  platformPosts: text("platform_posts", { mode: "json" }),
  diagnosis: text("diagnosis", {
    enum: ["winner", "weak_cta", "weak_hook", "dud", "typical"],
  }),
  diagnosedAt: text("diagnosed_at"),
  /** Follower count on the primary platform when this post first got measured. Frozen so later growth doesn't rewrite history. */
  followersAtPublish: integer("followers_at_publish").notNull().default(0),
  error: text("error"),
  createdAt: text("created_at").notNull().default(now),
});

/** Individual rendered slides belonging to a post. */
export const slides = sqliteTable("slides", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id),
  idx: integer("idx").notNull(),
  kind: text("kind").notNull(),
  headline: text("headline").notNull().default(""),
  sub: text("sub").notNull().default(""),
  screenshot: text("screenshot"),
  filePath: text("file_path").notNull(),
});

/** Per-post per-platform performance snapshots pulled from Upload-Post. */
export const analytics = sqliteTable("analytics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postId: integer("post_id")
    .notNull()
    .references(() => posts.id),
  platform: text("platform").notNull(),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  engagementRate: real("engagement_rate").notNull().default(0),
  /** Channel followers on this platform at snapshot time (copied from the post's frozen publish-era count). */
  followers: integer("followers").notNull().default(0),
  raw: text("raw", { mode: "json" }),
  fetchedAt: text("fetched_at").notNull().default(now),
});

/** BrightBean channel snapshots — follower count over time, used as the era denominator. */
export const accountSnapshots = sqliteTable("account_snapshots", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  platform: text("platform").notNull(),
  accountId: text("account_id").notNull().default(""),
  followers: integer("followers").notNull().default(0),
  followerDelta: real("follower_delta"),
  views: integer("views").notNull().default(0),
  raw: text("raw", { mode: "json" }),
  fetchedAt: text("fetched_at").notNull().default(now),
});

/** Accumulated knowledge: rules, failures, best times/templates/screenshots. */
export const learnings = sqliteTable("learnings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", {
    enum: ["rule", "failure", "best_time", "best_template", "best_screenshot"],
  }).notNull(),
  content: text("content").notNull(),
  /** JSON payload with structured data backing the learning */
  data: text("data", { mode: "json" }),
  score: real("score").notNull().default(0),
  createdAt: text("created_at").notNull().default(now),
  updatedAt: text("updated_at").notNull().default(now),
});

/** Simple key-value settings store (posting schedule, platform toggles, etc). */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

/** Learning dimensions — every signal and summary is scoped to exactly one. */
export const SIGNAL_DIMENSIONS = ["hook", "copy", "layout", "template", "asset", "visual", "timing", "music", "shot_scale"] as const;
export type SignalDimension = (typeof SIGNAL_DIMENSIONS)[number];

/**
 * The atomic unit of learning. Every piece of feedback — a classified manual
 * rejection, a concluded A/B experiment, an analytics diagnosis — becomes one
 * structured signal scoped to a dimension + category.
 */
export const signals = sqliteTable("signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dimension: text("dimension", { enum: SIGNAL_DIMENSIONS }).notNull(),
  /** Short slug within the dimension, e.g. "generic_hook", "text_overlap". */
  category: text("category").notNull(),
  source: text("source", {
    enum: ["manual_reject", "experiment", "diagnosis", "rule_promotion", "migration"],
  }).notNull(),
  /** prefer = do more of this; avoid = do less of this. */
  direction: text("direction", { enum: ["prefer", "avoid"] }).notNull().default("avoid"),
  /** Human-readable insight, e.g. "Short punchy hooks outperform question hooks". */
  content: text("content").notNull(),
  /** JSON payload with structured evidence backing the signal */
  data: text("data", { mode: "json" }),
  score: real("score").notNull().default(1),
  postId: integer("post_id").references(() => posts.id),
  createdAt: text("created_at").notNull().default(now),
});

/** Aggregated "what works / what to avoid" per dimension+category, derived from signals. */
export const dimensionSummaries = sqliteTable("dimension_summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dimension: text("dimension", { enum: SIGNAL_DIMENSIONS }).notNull(),
  category: text("category").notNull(),
  direction: text("direction", { enum: ["prefer", "avoid"] }).notNull(),
  summary: text("summary").notNull(),
  evidenceCount: integer("evidence_count").notNull().default(0),
  /** 0-100: grows with evidence count and score consistency. */
  confidence: real("confidence").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(now),
});

/**
 * Learning cycle rounds. The engine alternates phases:
 * diversity (long — test as many untested combos as possible) ->
 * ab_test (short — A/B the best parts) -> learnings rolled up -> next
 * diversity round. Repeat forever.
 */
export const rounds = sqliteTable("rounds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** Cycle counter: diversity round N and its A/B phase share the number. */
  number: integer("number").notNull(),
  phase: text("phase", { enum: ["diversity", "ab_test"] }).notNull(),
  status: text("status", { enum: ["active", "concluded"] }).notNull().default("active"),
  /** Diversity: shipped posts to conclude. A/B: experiments to conclude. */
  target: integer("target").notNull().default(12),
  startedAt: text("started_at").notNull().default(now),
  concludedAt: text("concluded_at"),
  /** JSON rollup written at conclusion: what was tested, winners, signals gathered. */
  summary: text("summary", { mode: "json" }),
});

/** 0–100 running score for templates / formulas / screenshots. One post nudges; it never crowns or kills. */
export const assetRatings = sqliteTable("asset_ratings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  dimension: text("dimension", { enum: ["template", "formula", "hook_category", "screenshot", "svg", "youtube_music", "shot_scale"] }).notNull(),
  key: text("key").notNull(),
  score: real("score").notNull().default(50),
  samples: integer("samples").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(now),
});

/** A/B experiment: two posts differing in exactly one dimension. */
export const experiments = sqliteTable("experiments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  postAId: integer("post_a_id")
    .notNull()
    .references(() => posts.id),
  postBId: integer("post_b_id")
    .notNull()
    .references(() => posts.id),
  /** The single dimension that was varied between A and B. */
  dimension: text("dimension", { enum: SIGNAL_DIMENSIONS }).notNull(),
  /** JSON: { a: <value in post A>, b: <value in post B>, note?: string } */
  variableDetail: text("variable_detail", { mode: "json" }).notNull(),
  status: text("status", { enum: ["pending", "active", "concluded", "cancelled"] })
    .notNull()
    .default("pending"),
  winner: text("winner", { enum: ["a", "b", "tie"] }),
  /** Percentage lift of the winner over the loser on the composite score. */
  liftPct: real("lift_pct"),
  /** JSON: per-post views/engagement comparison at conclusion time. */
  resultData: text("result_data", { mode: "json" }),
  createdAt: text("created_at").notNull().default(now),
  concludedAt: text("concluded_at"),
});

/** A UGC contributor (e.g. Sohan). Separate from slideshow posts. */
export const ugcCreators = sqliteTable("ugc_creators", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().default(""),
  createdAt: text("created_at").notNull().default(now),
});

export const UGC_VIDEO_STATUSES = [
  "uploaded",
  "pending_review",
  "approved",
  "rejected",
  "scheduled",
  "published",
  "failed",
] as const;
export type UgcVideoStatus = (typeof UGC_VIDEO_STATUSES)[number];

/** A creator-uploaded video. Not a slideshow post. */
export const ugcVideos = sqliteTable("ugc_videos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uuid: text("uuid").notNull().unique(),
  creatorId: integer("creator_id")
    .notNull()
    .references(() => ugcCreators.id),
  r2Key: text("r2_key").notNull(),
  filePath: text("file_path").notNull().default(""),
  fileName: text("file_name").notNull().default(""),
  mimeType: text("mime_type").notNull().default("video/mp4"),
  byteSize: integer("byte_size").notNull().default(0),
  durationSec: integer("duration_sec"),
  title: text("title").notNull(),
  caption: text("caption").notNull(),
  status: text("status", { enum: UGC_VIDEO_STATUSES }).notNull().default("pending_review"),
  scheduledAt: text("scheduled_at"),
  publishedAt: text("published_at"),
  platformPosts: text("platform_posts", { mode: "json" }),
  diagnosis: text("diagnosis", { enum: ["winner", "typical", "dud"] }),
  diagnosedAt: text("diagnosed_at"),
  rejectReason: text("reject_reason"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(now),
});

/** Per-UGC-video per-platform performance snapshots. Isolated from slideshow analytics. */
export const ugcAnalytics = sqliteTable("ugc_analytics", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ugcVideoId: integer("ugc_video_id")
    .notNull()
    .references(() => ugcVideos.id),
  platform: text("platform").notNull(),
  views: integer("views").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  engagementRate: real("engagement_rate").notNull().default(0),
  followers: integer("followers").notNull().default(0),
  raw: text("raw", { mode: "json" }),
  fetchedAt: text("fetched_at").notNull().default(now),
});
