/**
 * Slideshow playbook: most new decks follow what is working, the rest test something new.
 *
 * Every published Recoveries character deck is read back from its saved source
 * (output/decks/<id>.json) with its latest metrics. Each deck is described by a few
 * arms (hook kind, format, app crop, length, feeling, plus any arm its `plan` names),
 * and each arm gets a Beta posterior on "reached the top quarter of its account".
 *
 * Nothing is hard-coded as a winner. Exploit slots draw every arm by Thompson
 * sampling, so the arm most likely to be best is picked most often, runners-up still
 * get picked in proportion to their odds, and every new result moves the next plan.
 * Explore slots run the open tests in assets/playbook/tests.json, changing only the
 * tested arm, until each test has enough mature posts to call.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { analytics, getDb, posts } from "@remedy-growth/db";
import { OUTPUT_DIR, ROOT_DIR } from "../config.js";
import { deckFormat, loadDeckSource, type Deck } from "../generation/character-deck.js";
import { listBeds } from "../generation/short.js";
import { parseVariation } from "../generation/variations.js";

export const EXPLORE_SHARE = 0.2;
const MATURE_MS = 48 * 3_600_000;
const WINDOW_DAYS = 45;
/** TikTok posts under this many views at 48h were never distributed (the Nov 1-4 suppression); they say nothing about content. */
const TIKTOK_UNDISTRIBUTED = 10;
/** Every deck goes to YouTube; one a day also goes to TikTok. */
const PLATFORM_WEIGHT = { youtube: 0.75, tiktok: 0.25 } as const;
type ScoredPlatform = keyof typeof PLATFORM_WEIGHT;
/** Arms with fewer mature YouTube posts than this are only reached through explore slots. */
const MIN_SAMPLES = 3;
/** Beta prior: mean 0.25 (the top-quarter base rate), weight of four posts. */
const PRIOR = { a: 1, b: 3 } as const;

export const EXERCISE_CROPS = new Set([
  "crop_img_0465.png", "crop_img_0469.png", "crop_img_0470.png", "crop_img_0472.png", "crop_img_0473.png",
  "crop_cat_cow.png", "crop_session.png", "crop_exercise_childs_pose.png",
]);
export const PLAN_CROPS = new Set([
  "crop_session_preview.png", "crop_progress.png", "crop_progress_2.png", "crop_progress_3.png", "crop_pain_trend.png",
  "crop_img_0461.png", "crop_home_2.png", "crop_home_done.png", "crop_pain_check.png", "crop_pain_check_2.png", "crop_profile.png", "crop_home.png",
  "crop_onboard_time.png", "crop_onboard_program.png", "crop_ramp_week2.png",
]);

const MOVE = /\b(bend|bends|bending|bent|kneel|kneeling|knees|climb|climbing|twist|twists|buckl\w*|getting up|get up|getting off|stand up|standing up|lift|lifting|grabbed|carry|carrying|pick up|picking up|reach\w*|shave|socks?|tie|tying|weed\w*|mow\w*|vacuum\w*|crib|tub|toolbox|squat|sit up|off the floor|lands)\b/;
const SITUATION = /\b(desk|office|chair|sitting|calls?|commute|recliner|bed|coding|bleachers|couch|drive|driving|road trip|plane|hours? of)\b/;
const PRODUCT = /(\$\d+|\bbought\b|\bspent\b|\bcream\b|\binsoles\b|standing desk|massage gun|heating pad|ibuprofen|\bstool\b|gaming chair|\byoga\b|foam roller|\bmattress\b)/;

/** What the cover line is about. Movement = one body movement inside an ordinary task. */
export function hookKind(hook: string): string {
  const h = hook.toLowerCase();
  if (PRODUCT.test(h)) return "product";
  if (MOVE.test(h)) return "movement";
  if (SITUATION.test(h)) return "situation";
  return "other";
}

export function lengthArm(deck: Deck): string {
  const n = deck.beats.length;
  return n <= 4 ? "4" : n === 5 ? "5" : n <= 7 ? "6-7" : "8+";
}

function cropOf(deck: Deck): string {
  for (const b of deck.beats) if ("screenshot" in b) return b.screenshot;
  return "";
}

/** Arms a deck carries. `plan.arms` adds tested arms and overrides the inferred ones. */
export function armsFor(deck: Deck): Record<string, string> {
  const crop = cropOf(deck);
  const arms: Record<string, string> = {
    hookKind: hookKind(deck.hook),
    format: deckFormat(deck),
    cropKind: EXERCISE_CROPS.has(crop) ? "exercise" : PLAN_CROPS.has(crop) ? "plan" : "other",
    crop,
    length: lengthArm(deck),
    feeling: deck.feeling ?? "unset",
  };
  return { ...arms, ...(deck.plan?.arms ?? {}) };
}

/** Dimensions the planner picks. The rest (crop, feeling, any test arm) are reported and tested. */
const PLANNED: ReadonlyArray<{ dim: string; arms: readonly string[] }> = [
  { dim: "hookKind", arms: ["movement", "situation", "product", "other"] },
  { dim: "format", arms: ["single", "split", "quad"] },
  { dim: "cropKind", arms: ["exercise", "plan"] },
  { dim: "length", arms: ["4", "5", "6-7", "8+"] },
];

// ---------- tests ----------

const TestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    hypothesis: z.string().min(10),
    /** Where the idea came from: an outlier post, a study, our own data. */
    source: z.string().min(3),
    /** Arms an explore deck must carry. Keys may be planned dimensions or new ones. */
    arms: z.record(z.string(), z.string()),
    /** What the deck author has to do to honour the arms. */
    brief: z.string().min(10),
    minPosts: z.number().int().min(2).default(4),
    status: z.enum(["open", "paused", "closed"]).default("open"),
  })
  .strict();
const TestsSchema = z.object({ tests: z.array(TestSchema) }).strict();
export type PlaybookTest = z.infer<typeof TestSchema>;

export const TESTS_FILE = path.join(ROOT_DIR, "assets", "playbook", "tests.json");

export function loadTests(): PlaybookTest[] {
  if (!fs.existsSync(TESTS_FILE)) return [];
  return TestsSchema.parse(JSON.parse(fs.readFileSync(TESTS_FILE, "utf8"))).tests;
}

// ---------- observations ----------

export interface Observation {
  postId: number;
  platform: ScoredPlatform;
  at: string;
  views: number;
  likes: number;
  hit: boolean;
  arms: Record<string, string>;
  slot: "exploit" | "explore" | "unplanned";
  test: string;
  hook: string;
  bed: string;
}

function quantile(xs: number[], q: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

/** Mature Recoveries deck results on YouTube and TikTok, each marked hit when it reached its account's top quarter. */
export function loadObservations(now = Date.now()): { obs: Observation[]; thresholds: Record<ScoredPlatform, number> } {
  const db = getDb();
  const since = now - WINDOW_DAYS * 86_400_000;
  const shipped = db
    .select()
    .from(posts)
    .where(and(eq(posts.templateId, "X"), inArray(posts.status, ["published", "draft_sent"])))
    .all()
    .filter((p) => parseVariation(p.variation).zernioSlot !== "2");
  const latest = new Map<string, { views: number; likes: number }>();
  const ids = shipped.map((p) => p.id);
  if (ids.length) {
    for (const row of db.select().from(analytics).where(inArray(analytics.postId, ids)).orderBy(analytics.fetchedAt).all()) {
      latest.set(`${row.postId}:${row.platform}`, { views: row.views, likes: row.likes });
    }
  }
  const raw: Array<Omit<Observation, "hit">> = [];
  for (const post of shipped) {
    const at = Date.parse(post.scheduledAt ?? post.publishedAt ?? "");
    if (!Number.isFinite(at) || at < since || now - at < MATURE_MS) continue;
    const deck = loadDeckSource(post.id);
    if (!deck) continue;
    const variation = parseVariation(post.variation);
    for (const platform of Object.keys(PLATFORM_WEIGHT) as ScoredPlatform[]) {
      const m = latest.get(`${post.id}:${platform}`);
      if (!m) continue;
      if (platform === "tiktok" && m.views < TIKTOK_UNDISTRIBUTED) continue;
      raw.push({
        postId: post.id,
        platform,
        at: new Date(at).toISOString(),
        views: m.views,
        likes: m.likes,
        arms: { ...armsFor(deck), ...(platform === "youtube" && variation.shortBed ? { bed: variation.shortBed } : {}) },
        slot: deck.plan?.slot ?? "unplanned",
        test: deck.plan?.test ?? "",
        hook: deck.hook,
        bed: variation.shortBed ?? "",
      });
    }
  }
  const thresholds = { youtube: 0, tiktok: 0 } as Record<ScoredPlatform, number>;
  for (const p of Object.keys(PLATFORM_WEIGHT) as ScoredPlatform[]) {
    thresholds[p] = Math.max(1, quantile(raw.filter((o) => o.platform === p).map((o) => o.views), 0.75));
  }
  return { obs: raw.map((o) => ({ ...o, hit: o.views >= thresholds[o.platform] })), thresholds };
}

// ---------- posteriors ----------

export interface ArmStat {
  dim: string;
  arm: string;
  platform: ScoredPlatform;
  n: number;
  hits: number;
  medianViews: number;
  a: number;
  b: number;
  mean: number;
}

export function armStats(obs: Observation[]): ArmStat[] {
  const groups = new Map<string, Observation[]>();
  for (const o of obs) {
    for (const [dim, arm] of Object.entries(o.arms)) {
      if (!arm) continue;
      const k = `${o.platform}|${dim}|${arm}`;
      groups.set(k, [...(groups.get(k) ?? []), o]);
    }
  }
  const out: ArmStat[] = [];
  for (const [k, list] of groups) {
    const [platform, dim, arm] = k.split("|") as [ScoredPlatform, string, string];
    const hits = list.filter((o) => o.hit).length;
    const a = PRIOR.a + hits;
    const b = PRIOR.b + list.length - hits;
    out.push({ dim, arm, platform, n: list.length, hits, medianViews: quantile(list.map((o) => o.views), 0.5), a, b, mean: a / (a + b) });
  }
  return out.sort((x, y) => x.dim.localeCompare(y.dim) || y.mean - x.mean);
}

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Marsaglia-Tsang. */
function gamma(shape: number, rng: Rng): number {
  if (shape < 1) return gamma(shape + 1, rng) * Math.pow(Math.max(rng(), 1e-12), 1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(rng);
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = rng();
    if (Math.log(Math.max(u, 1e-12)) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v;
  }
}

export function sampleBeta(a: number, b: number, rng: Rng): number {
  const x = gamma(a, rng);
  return x / (x + gamma(b, rng));
}

function statFor(stats: ArmStat[], platform: ScoredPlatform, dim: string, arm: string): ArmStat {
  return stats.find((s) => s.platform === platform && s.dim === dim && s.arm === arm) ?? {
    dim, arm, platform, n: 0, hits: 0, medianViews: 0, a: PRIOR.a, b: PRIOR.b, mean: PRIOR.a / (PRIOR.a + PRIOR.b),
  };
}

/** One Thompson draw of an arm's value, weighted across platforms by how much of a deck's reach each one carries. */
function drawArm(stats: ArmStat[], dim: string, arm: string, rng: Rng): number {
  let v = 0;
  for (const p of Object.keys(PLATFORM_WEIGHT) as ScoredPlatform[]) {
    const s = statFor(stats, p, dim, arm);
    v += PLATFORM_WEIGHT[p] * sampleBeta(s.a, s.b, rng);
  }
  return v;
}

/** P(arm is best) per arm of a dimension, by Monte Carlo over the same draws the planner makes. */
export function probBest(stats: ArmStat[], dim: string, arms: readonly string[], draws = 4000, seed = 7): Record<string, number> {
  const rng = mulberry32(seed);
  const wins: Record<string, number> = Object.fromEntries(arms.map((a) => [a, 0]));
  for (let i = 0; i < draws; i++) {
    let best = arms[0]!;
    let bestV = -1;
    for (const arm of arms) {
      const v = drawArm(stats, dim, arm, rng);
      if (v > bestV) {
        bestV = v;
        best = arm;
      }
    }
    wins[best] = (wins[best] ?? 0) + 1;
  }
  return Object.fromEntries(arms.map((a) => [a, (wins[a] ?? 0) / draws]));
}

function eligible(stats: ArmStat[], dim: string, arms: readonly string[]): string[] {
  const known = arms.filter((arm) => statFor(stats, "youtube", dim, arm).n >= MIN_SAMPLES);
  return known.length ? known : [...arms];
}

// ---------- planning ----------

export interface PlanSlot {
  slot: "exploit" | "explore";
  test?: string;
  arms: Record<string, string>;
  brief: string;
}

function thompsonPick(stats: ArmStat[], dim: string, arms: readonly string[], rng: Rng): string {
  let best = arms[0]!;
  let bestV = -1;
  for (const arm of arms) {
    const v = drawArm(stats, dim, arm, rng);
    if (v > bestV) {
      bestV = v;
      best = arm;
    }
  }
  return best;
}

/** Tests ordered by how far they are from being called (mature posts plus decks already planned for them). */
function testQueue(tests: PlaybookTest[], obs: Observation[]): PlaybookTest[] {
  const open = tests.filter((t) => t.status === "open");
  const count = (id: string) => new Set(obs.filter((o) => o.test === id).map((o) => o.postId)).size;
  return open.filter((t) => count(t.id) < t.minPosts * 2).sort((a, b) => count(a.id) / a.minPosts - count(b.id) / b.minPosts);
}

/**
 * Plan `n` decks: about 80% exploit (Thompson draws per planned dimension, format included),
 * about 20% explore (one open test each, only the tested arms changed). No format floor.
 */
export function planBatch(n: number, seed = Date.now()): { slots: PlanSlot[]; stats: ArmStat[]; thresholds: Record<ScoredPlatform, number> } {
  const { obs, thresholds } = loadObservations();
  const stats = armStats(obs);
  const rng = mulberry32(seed);
  const queue = testQueue(loadTests(), obs);
  const explore = Math.min(queue.length ? Math.max(1, Math.round(n * EXPLORE_SHARE)) : 0, n);
  const slots: PlanSlot[] = [];
  for (let i = 0; i < n; i++) {
    const arms: Record<string, string> = {};
    for (const { dim, arms: options } of PLANNED) arms[dim] = thompsonPick(stats, dim, eligible(stats, dim, options), rng);
    const isExplore = i >= n - explore;
    if (!isExplore) {
      slots.push({ slot: "exploit", arms, brief: "Follow every arm; vary character, feeling and the moment itself." });
      continue;
    }
    const test = queue[(i - (n - explore)) % queue.length]!;
    slots.push({ slot: "explore", test: test.id, arms: { ...arms, ...test.arms }, brief: test.brief });
  }

  return { slots, stats, thresholds };
}

/** YouTube bed for a new Short: Thompson draw over the shipping pool, scored on YouTube only. */
export function pickShortBedByResults(seed = Date.now()): string | undefined {
  const pool = listBeds().filter((b) => b.upbeat).map((b) => b.id);
  if (pool.length === 0) return undefined;
  const { obs } = loadObservations();
  const yt = obs.filter((o) => o.platform === "youtube");
  const rng = mulberry32(seed);
  let best = pool[0]!;
  let bestV = -1;
  for (const id of pool) {
    const list = yt.filter((o) => o.bed === id);
    const hits = list.filter((o) => o.hit).length;
    const v = sampleBeta(PRIOR.a + hits, PRIOR.b + list.length - hits, rng);
    if (v > bestV) {
      bestV = v;
      best = id;
    }
  }
  return best;
}

/**
 * Which of a day's decks goes to TikTok: one Thompson draw of each deck's TikTok odds
 * over its planned arms, best draw wins. Null when none of them has a deck source.
 */
export function pickTiktokIndex(postIds: number[], seed: number): number | null {
  const decks = postIds.map((id) => loadDeckSource(id));
  if (!decks.some(Boolean)) return null;
  const stats = armStats(loadObservations().obs);
  const rng = mulberry32(seed);
  let best = -1;
  let bestV = -1;
  decks.forEach((deck, i) => {
    if (!deck) return;
    const arms = armsFor(deck);
    let v = 0;
    for (const { dim } of PLANNED) {
      const s = statFor(stats, "tiktok", dim, arms[dim] ?? "");
      v += sampleBeta(s.a, s.b, rng) / PLANNED.length;
    }
    if (v > bestV) {
      bestV = v;
      best = i;
    }
  });
  return best >= 0 ? best : null;
}

// ---------- report ----------

export interface TestResult {
  test: PlaybookTest;
  posts: number;
  hitRate: number;
  baselineHitRate: number;
  pBeatsBaseline: number;
  verdict: "running" | "winning" | "losing" | "inconclusive";
}

export function testResults(obs: Observation[], tests = loadTests()): TestResult[] {
  const yt = obs.filter((o) => o.platform === "youtube");
  const exploit = yt.filter((o) => o.slot !== "explore");
  const baseHits = exploit.filter((o) => o.hit).length;
  const rng = mulberry32(11);
  return tests.map((test) => {
    const mine = yt.filter((o) => o.test === test.id);
    const hits = mine.filter((o) => o.hit).length;
    let beats = 0;
    for (let i = 0; i < 4000; i++) {
      if (sampleBeta(PRIOR.a + hits, PRIOR.b + mine.length - hits, rng) > sampleBeta(PRIOR.a + baseHits, PRIOR.b + exploit.length - baseHits, rng)) beats++;
    }
    const p = beats / 4000;
    const verdict = mine.length < test.minPosts ? "running" : p >= 0.8 ? "winning" : p <= 0.2 ? "losing" : "inconclusive";
    return {
      test,
      posts: mine.length,
      hitRate: mine.length ? hits / mine.length : 0,
      baselineHitRate: exploit.length ? baseHits / exploit.length : 0,
      pBeatsBaseline: p,
      verdict,
    };
  });
}

export const PLAYBOOK_DIR = path.join(OUTPUT_DIR, "playbook");
