/**
 * Follower-aware, luck-aware scoring.
 *
 * Raw views lie while the account is growing: a template that got 80 views
 * at 40 followers is not worse than one that got 800 at 4,000. Every
 * comparison here is either views-per-follower (when we know the era) or
 * same-week peers (when we don't).
 *
 * A single post is never a verdict. Diagnosis can label a post; only
 * replicated, large-enough gaps become generation rules.
 */

export const MATURE_HOURS = 48;
export const MIN_COHORT = 8;
export const WINNER_REACH_MULT = 1.5;
export const DUD_REACH_MULT = 0.5;
export const REPLICATE_N = 3;
/** Posts whose follower counts differ by more than this factor are different eras. */
export const FOLLOWER_BAND = 3;
/** When follower count is unknown, posts this many days apart are still "same era". */
export const ERA_DAYS = 14;

export type Verdict = "winner" | "weak_cta" | "weak_hook" | "dud" | "typical";

export interface ScoredPost {
  postId: number;
  hookId: number;
  templateId: string;
  views: number;
  engagementRate: number;
  followers: number;
  /** views / max(followers, 1) when followers known; raw views otherwise. */
  reach: number;
  publishedAt: string | null;
  publishedHour: number | null;
  ageHours: number;
  mature: boolean;
}

export function hoursSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return (now - t) / 3_600_000;
}

export function isMature(publishedAt: string | null | undefined, now = Date.now()): boolean {
  return hoursSince(publishedAt, now) >= MATURE_HOURS;
}

/** Views per follower. Followers=0 means "era unknown" — reach falls back to raw views. */
export function reachScore(views: number, followers: number): number {
  if (followers > 0) return views / followers;
  return views;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  if (lo === hi) return sorted[lo]!;
  return sorted[lo]! * (hi - i) + sorted[hi]! * (i - lo);
}

/** Same-era peers: follower count within FOLLOWER_BAND, or same calendar window if unknown. */
export function sameEra(a: ScoredPost, b: ScoredPost): boolean {
  if (a.followers > 0 && b.followers > 0) {
    const lo = Math.min(a.followers, b.followers);
    const hi = Math.max(a.followers, b.followers);
    return hi / Math.max(lo, 1) <= FOLLOWER_BAND;
  }
  if (!a.publishedAt || !b.publishedAt) return true;
  const da = Date.parse(a.publishedAt);
  const db = Date.parse(b.publishedAt);
  if (!Number.isFinite(da) || !Number.isFinite(db)) return true;
  return Math.abs(da - db) <= ERA_DAYS * 86_400_000;
}

export function cohortFor(post: ScoredPost, all: ScoredPost[]): ScoredPost[] {
  const peers = all.filter((p) => p.mature && sameEra(post, p));
  return peers.length >= MIN_COHORT ? peers : all.filter((p) => p.mature);
}

/**
 * Strong-gap 2x2. Mid-pack posts stay "typical" — luck, timing, and the
 * algorithm explain most of that band.
 */
export function classifyConservative(post: ScoredPost, cohort: ScoredPost[]): Verdict {
  if (cohort.length < MIN_COHORT) return "typical";
  const reaches = cohort.map((p) => p.reach);
  const engs = cohort.map((p) => p.engagementRate);
  const medReach = median(reaches);
  const q25r = quantile(reaches, 0.25);
  const q75r = quantile(reaches, 0.75);
  const q25e = quantile(engs, 0.25);
  const q75e = quantile(engs, 0.75);

  const highReach = post.reach >= q75r && post.reach >= WINNER_REACH_MULT * Math.max(medReach, 1e-9);
  const lowReach = post.reach <= q25r && post.reach <= DUD_REACH_MULT * Math.max(medReach, 1e-9);
  const highEng = post.engagementRate >= q75e;
  const lowEng = post.engagementRate <= q25e;

  if (highReach && highEng) return "winner";
  if (lowReach && lowEng) return "dud";
  if (highEng && lowReach) return "weak_hook";
  if (highReach && lowEng) return "weak_cta";
  return "typical";
}

/** Lift needed to call an A/B — scales up when either side has almost no views. */
export function experimentTieThreshold(viewsA: number, viewsB: number): number {
  const floor = Math.min(viewsA, viewsB);
  if (floor < 50) return 0.8;
  if (floor < 200) return 0.4;
  return 0.2;
}

export const LEARNING_POLICY = {
  matureHours: MATURE_HOURS,
  minCohort: MIN_COHORT,
  winnerMultiple: WINNER_REACH_MULT,
  dudMultiple: DUD_REACH_MULT,
  replicateN: REPLICATE_N,
  followerBand: FOLLOWER_BAND,
  eraDays: ERA_DAYS,
} as const;
