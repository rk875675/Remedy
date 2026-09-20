import { getDb, posts, analytics, hooks, hookFormulas, slides } from "@remedy-growth/db";
import { desc, eq } from "drizzle-orm";
import { screenshotStem } from "../generation/screenshots.js";
import { getIllustration, svgIdsForSlides } from "../generation/illustrations.js";
import { upsertLearning } from "./knowledge.js";
import { addSignal } from "./classify.js";
import { nudgeAssetsFromPost, nudgeYoutubeMusic, nudgeShotScale } from "./ratings.js";
import {
  LEARNING_POLICY,
  REPLICATE_N,
  classifyConservative,
  cohortFor,
  hoursSince,
  isMature,
  reachScore,
  type ScoredPost,
  type Verdict,
} from "./normalize.js";

export type Diagnosis = Verdict;

interface PostRow {
  id: number;
  hookId: number;
  templateId: string;
  status: string;
  publishedAt: string | null;
  diagnosis: string | null;
  followersAtPublish: number;
}

/** Latest analytics snapshot per published post. Drafts are never judged. */
function collectPerformance(): ScoredPost[] {
  const db = getDb();
  const shipped = db.select().from(posts).where(eq(posts.status, "published")).all();
  const out: ScoredPost[] = [];
  for (const post of shipped) {
    const scored = scorePublishedPost(post);
    if (scored) out.push(scored);
  }
  return out;
}

function collectYoutubePerformance(): ScoredPost[] {
  const db = getDb();
  const shipped = db.select().from(posts).where(eq(posts.status, "published")).all();
  const out: ScoredPost[] = [];
  for (const post of shipped) {
    const scored = scorePublishedPost(post, "youtube");
    if (scored) out.push(scored);
  }
  return out;
}

function scorePublishedPost(post: PostRow, platform?: string): ScoredPost | null {
  const db = getDb();
  const rows = db
    .select()
    .from(analytics)
    .where(eq(analytics.postId, post.id))
    .orderBy(desc(analytics.fetchedAt))
    .all();
  if (rows.length === 0) return null;
  const latestByPlatform = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    if (platform && r.platform !== platform) continue;
    if (!latestByPlatform.has(r.platform)) latestByPlatform.set(r.platform, r);
  }
  if (latestByPlatform.size === 0) return null;
  let views = 0;
  let engagement = 0;
  let snapFollowers = 0;
  for (const r of latestByPlatform.values()) {
    views += r.views;
    engagement += r.likes + r.comments + r.shares + r.saves;
    if (r.platform === "tiktok" && r.followers > 0) snapFollowers = r.followers;
    else if (snapFollowers === 0) snapFollowers = r.followers;
  }
  const followers = post.followersAtPublish > 0 ? post.followersAtPublish : snapFollowers;
  return {
    postId: post.id,
    hookId: post.hookId,
    templateId: post.templateId,
    views,
    engagementRate: views > 0 ? engagement / views : 0,
    followers,
    reach: reachScore(views, followers),
    publishedAt: post.publishedAt,
    publishedHour: post.publishedAt ? new Date(post.publishedAt).getHours() : null,
    ageHours: hoursSince(post.publishedAt),
    mature: isMature(post.publishedAt),
  };
}

export interface DiagnosisResult {
  diagnosed: number;
  watching: number;
  winners: number[];
  duds: number[];
  typical: number[];
  matrix: Record<Diagnosis, number>;
  policy: typeof LEARNING_POLICY;
  note: string;
}

/**
 * Label mature published posts against same-era peers. Mid-pack stays
 * "typical". Generation rules are only written after REPLICATE_N
 * independent posts agree, with a real effect size — one unlucky carousel
 * never bans a template, hook style, or screenshot.
 */
export function runDiagnosis(): DiagnosisResult {
  const result: DiagnosisResult = {
    diagnosed: 0,
    watching: 0,
    winners: [],
    duds: [],
    typical: [],
    matrix: { winner: 0, weak_cta: 0, weak_hook: 0, dud: 0, typical: 0 },
    policy: LEARNING_POLICY,
    note: "",
  };

  const all = collectPerformance();
  const ytAll = collectYoutubePerformance();
  const mature = all.filter((p) => p.mature);
  result.watching = all.length - mature.length;
  const canLabel = mature.length >= LEARNING_POLICY.minCohort;
  const db = getDb();

  for (const p of mature) {
    const cohort = cohortFor(p, all);
    const diagnosis = canLabel ? classifyConservative(p, cohort) : null;
    const prev = db
      .select({ diagnosis: posts.diagnosis, diagnosedAt: posts.diagnosedAt, variation: posts.variation })
      .from(posts)
      .where(eq(posts.id, p.postId))
      .get();
    const seed = (prev?.variation as { seed?: number; illustrationIds?: string[] } | null)?.seed ?? null;
    const storedIds = (prev?.variation as { illustrationIds?: string[] } | null)?.illustrationIds;
    // Nudge ratings once when the post first matures. Nudge again only if the label actually changes.
    const firstLook = !prev?.diagnosedAt;
    const labelChanged = Boolean(canLabel && prev?.diagnosis && prev.diagnosis !== diagnosis);
    if (firstLook || labelChanged) {
      nudgeAssetsFromPost(p, cohort, seed, storedIds);
      const yt = ytAll.find((x) => x.postId === p.postId);
      const bed = (prev?.variation as { shortBed?: string } | null)?.shortBed;
      if (yt) nudgeYoutubeMusic(yt, cohortFor(yt, ytAll), bed);
      const scale = (prev?.variation as { shotScale?: string } | null)?.shotScale;
      nudgeShotScale(p, cohort, scale);
    }
    if (diagnosis) {
      result.matrix[diagnosis]++;
      result.diagnosed++;
      if (diagnosis === "winner") result.winners.push(p.postId);
      else if (diagnosis === "dud") result.duds.push(p.postId);
      else if (diagnosis === "typical") result.typical.push(p.postId);
      db.update(posts)
        .set({ diagnosis, diagnosedAt: new Date().toISOString() })
        .where(eq(posts.id, p.postId))
        .run();
    } else if (firstLook) {
      db.update(posts).set({ diagnosedAt: new Date().toISOString() }).where(eq(posts.id, p.postId)).run();
    }
  }

  if (!canLabel) {
    promoteYoutubeBeds(ytAll);
    result.note = `Watching: ${mature.length} mature published posts (need ${LEARNING_POLICY.minCohort}+, each ${LEARNING_POLICY.matureHours}h old). ${result.watching} still ripening. Ratings can nudge; no winner/dud labels yet.`;
    console.log(result.note);
    return result;
  }

  promoteReplicatedPatterns(all);
  promoteYoutubeBeds(ytAll);
  result.note = `Diagnosed ${result.diagnosed} mature posts (${result.watching} watching): ${result.matrix.winner} winners, ${result.matrix.typical} typical, ${result.matrix.weak_cta} weak-CTA, ${result.matrix.weak_hook} weak-hook, ${result.matrix.dud} duds. Ratings move a few points per post; rules only after ${REPLICATE_N} agreeing posts.`;
  console.log(result.note);
  return result;
}

interface AttrAcc {
  key: string;
  winners: ScoredPost[];
  duds: ScoredPost[];
}

function bump(map: Map<string, AttrAcc>, key: string, p: ScoredPost, verdict: Diagnosis): void {
  const acc = map.get(key) ?? { key, winners: [], duds: [] };
  if (verdict === "winner") acc.winners.push(p);
  if (verdict === "dud") acc.duds.push(p);
  map.set(key, acc);
}

/**
 * Only attributes with REPLICATE_N independent posts on the same side, and
 * a mean-reach gap vs the whole mature set, become knowledge.
 */
function promoteReplicatedPatterns(all: ScoredPost[]): void {
  const db = getDb();
  const mature = all.filter((p) => p.mature);
  const hookById = new Map(db.select().from(hooks).all().map((h) => [h.id, h]));
  const byHookCat = new Map<string, AttrAcc>();
  const byFormula = new Map<string, AttrAcc>();
  const byTemplate = new Map<string, AttrAcc>();
  const byScreenshot = new Map<string, AttrAcc>();
  const bySvg = new Map<string, AttrAcc>();
  const byShotScale = new Map<string, AttrAcc>();
  const byHour = new Map<string, AttrAcc>();

  for (const p of mature) {
    const cohort = cohortFor(p, all);
    const v = classifyConservative(p, cohort);
    const hook = hookById.get(p.hookId);
    if (hook) {
      bump(byHookCat, hook.category, p, v);
      if (hook.formulaId) bump(byFormula, String(hook.formulaId), p, v);
    }
    bump(byTemplate, p.templateId, p, v);
    const scale = (db.select({ variation: posts.variation }).from(posts).where(eq(posts.id, p.postId)).get()
      ?.variation as { shotScale?: string } | null)?.shotScale;
    if (scale) bump(byShotScale, scale, p, v);
    if (p.publishedHour !== null) bump(byHour, String(p.publishedHour), p, v);
    const slideRows = db.select().from(slides).where(eq(slides.postId, p.postId)).all();
    const seen = new Set<string>();
    for (const s of slideRows) {
      if (!s.screenshot) continue;
      const stem = screenshotStem(s.screenshot);
      if (seen.has(stem)) continue;
      seen.add(stem);
      bump(byScreenshot, stem, p, v);
    }
    const rawVar = db.select({ variation: posts.variation }).from(posts).where(eq(posts.id, p.postId)).get()?.variation as
      | { seed?: number; illustrationIds?: string[] }
      | null;
    for (const id of svgIdsForSlides(rawVar?.seed, rawVar?.illustrationIds, slideRows)) {
      bump(bySvg, id, p, v);
    }
  }

  const overallReach = mean(mature.map((p) => p.reach));

  for (const acc of byHookCat.values()) {
    maybePromote("hook", `category:${acc.key}`, `"${acc.key}" hooks`, acc, overallReach, (dir, n, ratio) => {
      addSignal({
        dimension: "hook",
        category: dir === "prefer" ? "winning_category" : "dud_category",
        source: "diagnosis",
        direction: dir,
        content:
          dir === "prefer"
            ? `"${acc.key}" hooks beat the same-era pack on ${n} posts (${ratio.toFixed(1)}x reach). Prefer this mechanic — still keep testing others.`
            : `"${acc.key}" hooks lagged the same-era pack on ${n} posts (${ratio.toFixed(1)}x reach). Don't drop the mechanic; just stop overweighting it.`,
        data: { category: acc.key, n, ratio },
        score: 2,
      });
    });
  }

  for (const acc of byFormula.values()) {
    const formula = db.select().from(hookFormulas).where(eq(hookFormulas.id, Number(acc.key))).get();
    maybePromote("formula", acc.key, formula?.name ?? `formula ${acc.key}`, acc, overallReach, (dir, n, ratio) => {
      if (!formula) return;
      if (dir === "prefer") {
        db.update(hookFormulas)
          .set({ wins: acc.winners.length, score: Math.min(5, 1 + ratio) })
          .where(eq(hookFormulas.id, formula.id))
          .run();
      } else {
        db.update(hookFormulas)
          .set({ losses: acc.duds.length, score: Math.max(-2, 1 - 0.4 * ratio) })
          .where(eq(hookFormulas.id, formula.id))
          .run();
      }
      addSignal({
        dimension: "hook",
        category: "formula",
        source: "diagnosis",
        direction: dir,
        content: `Hook formula "${formula.name}" ${dir === "prefer" ? "outperformed" : "underperformed"} across ${n} same-era posts (${ratio.toFixed(1)}x reach).`,
        data: { formulaId: formula.id, n, ratio },
        score: 2,
      });
    });
  }

  for (const acc of byTemplate.values()) {
    maybePromote("template", acc.key, `template ${acc.key}`, acc, overallReach, (dir, n, ratio) => {
      if (dir === "prefer") {
        upsertLearning(
          "best_template",
          `template-${acc.key}`,
          `Template ${acc.key} produced ${n} same-era winners (${ratio.toFixed(1)}x reach) — prefer it, don't use it exclusively.`,
          { template: acc.key, n, ratio },
          n,
        );
      }
      addSignal({
        dimension: "template",
        category: dir === "prefer" ? "winning_template" : "lagging_template",
        source: "diagnosis",
        direction: dir,
        content:
          dir === "prefer"
            ? `Template ${acc.key} won ${n} times in the same follower era (${ratio.toFixed(1)}x reach). Weight it up; keep shipping the others.`
            : `Template ${acc.key} lagged on ${n} same-era posts (${ratio.toFixed(1)}x reach). Don't retire it from one bad week — just stop favoring it.`,
        data: { template: acc.key, n, ratio },
        score: 2,
      });
    });
  }

  for (const acc of byShotScale.values()) {
    maybePromote("shot_scale", acc.key, acc.key, acc, overallReach, (dir, n, ratio) => {
      addSignal({
        dimension: "shot_scale",
        category: dir === "prefer" ? "winning_shot_scale" : "lagging_shot_scale",
        source: "diagnosis",
        direction: dir,
        content:
          dir === "prefer"
            ? `Screenshot size "${acc.key}" beat same-era peers on ${n} posts (${ratio.toFixed(1)}x reach). Weight it up; keep testing the others.`
            : `Screenshot size "${acc.key}" lagged same-era peers on ${n} posts (${ratio.toFixed(1)}x reach). Don't retire it — stop overweighting it.`,
        data: { shotScale: acc.key, n, ratio },
        score: 2,
      });
    });
  }

  for (const acc of byScreenshot.values()) {
    maybePromote("asset", acc.key, acc.key, acc, overallReach, (dir, n, ratio) => {
      if (dir === "prefer") {
        upsertLearning(
          "best_screenshot",
          `shot-${acc.key}`,
          `${acc.key} showed up in ${n} same-era winners (${ratio.toFixed(1)}x reach). Prefer when the slide matches.`,
          { screenshot: acc.key, n, ratio },
          n,
        );
      }
      addSignal({
        dimension: "asset",
        category: dir === "prefer" ? "winning_screenshot" : "lagging_screenshot",
        source: "diagnosis",
        direction: dir,
        content:
          dir === "prefer"
            ? `Screenshot ${acc.key} appeared in ${n} same-era winners (${ratio.toFixed(1)}x reach). Prefer it when the copy matches.`
            : `Screenshot ${acc.key} showed up in ${n} same-era laggards. That is not proof the crop is bad — only stop auto-preferring it.`,
        data: { screenshot: acc.key, n, ratio },
        score: 2,
      });
    });
  }

  for (const acc of bySvg.values()) {
    const asset = getIllustration(acc.key);
    const label = asset ? `${asset.source} · ${asset.name}` : acc.key;
    maybePromote("asset", `svg:${acc.key}`, label, acc, overallReach, (dir, n, ratio) => {
      addSignal({
        dimension: "asset",
        category: dir === "prefer" ? "winning_svg" : "lagging_svg",
        source: "diagnosis",
        direction: dir,
        content:
          dir === "prefer"
            ? `Illustration ${label} appeared in ${n} same-era winners (${ratio.toFixed(1)}x reach). Prefer this kit when the slide is an SVG.`
            : `Illustration ${label} showed up in ${n} same-era laggards. Stop auto-preferring it — do not ban the whole kit.`,
        data: { svg: acc.key, source: asset?.source, n, ratio },
        score: 2,
      });
    });
  }

  for (const acc of byHour.values()) {
    maybePromote("timing", acc.key, `${acc.key}:00`, acc, overallReach, (dir, n, ratio) => {
      if (dir !== "prefer") return;
      upsertLearning(
        "best_time",
        `hour-${acc.key}`,
        `Posts around ${acc.key}:00 produced ${n} same-era winners (${ratio.toFixed(1)}x reach).`,
        { hour: Number(acc.key), n, ratio },
        n,
      );
    });
  }

  // One confirmed winner hook can be evolved — that's exploration, not a ban.
  markWinnerHooks(mature, all);
}

/** YouTube beds are judged from YouTube analytics only. */
function promoteYoutubeBeds(ytAll: ScoredPost[]): void {
  const ytMature = ytAll.filter((p) => p.mature);
  if (ytMature.length < LEARNING_POLICY.minCohort) return;
  const db = getDb();
  const byBed = new Map<string, AttrAcc>();
  const overallReach = mean(ytMature.map((p) => p.reach));
  for (const p of ytMature) {
    const v = classifyConservative(p, cohortFor(p, ytAll));
    const row = db.select({ variation: posts.variation }).from(posts).where(eq(posts.id, p.postId)).get();
    const bed = (row?.variation as { shortBed?: string } | null)?.shortBed;
    if (bed) bump(byBed, bed, p, v);
  }
  for (const acc of byBed.values()) {
    maybePromote("music", acc.key, acc.key, acc, overallReach, (dir, n, ratio) => {
      addSignal({
        dimension: "music",
        category: dir === "prefer" ? "winning_bed" : "lagging_bed",
        source: "diagnosis",
        direction: dir,
        content:
          dir === "prefer"
            ? `YouTube bed "${acc.key}" beat same-era YouTube peers on ${n} posts (${ratio.toFixed(1)}x reach). Weight it up; keep testing other moods.`
            : `YouTube bed "${acc.key}" lagged same-era YouTube peers on ${n} posts (${ratio.toFixed(1)}x reach). Don't retire it — stop overweighting it.`,
        data: { bed: acc.key, n, ratio, platform: "youtube" },
        score: 2,
      });
    });
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function maybePromote(
  _kind: string,
  _key: string,
  _label: string,
  acc: AttrAcc,
  overallReach: number,
  write: (dir: "prefer" | "avoid", n: number, ratio: number) => void,
): void {
  const winMean = mean(acc.winners.map((p) => p.reach));
  const dudMean = mean(acc.duds.map((p) => p.reach));
  const baseline = Math.max(overallReach, 1e-9);

  if (acc.winners.length >= REPLICATE_N && winMean / baseline >= 1.4) {
    write("prefer", acc.winners.length, winMean / baseline);
  }
  if (acc.duds.length >= REPLICATE_N && dudMean / baseline <= 0.6) {
    write("avoid", acc.duds.length, dudMean / baseline);
  }
}

function markWinnerHooks(mature: ScoredPost[], all: ScoredPost[]): void {
  const db = getDb();
  for (const p of mature) {
    if (classifyConservative(p, cohortFor(p, all)) !== "winner") continue;
    const hook = db.select().from(hooks).where(eq(hooks.id, p.hookId)).get();
    if (!hook || hook.status === "winner") continue;
    db.update(hooks).set({ status: "winner", score: hook.score + 1 }).where(eq(hooks.id, hook.id)).run();
  }
}

/** @deprecated kept so older call sites compiling against classify() still typecheck. */
export function classify(views: number, engagementRate: number, medViews: number, medEng: number): Diagnosis {
  const highViews = views >= Math.max(medViews, 1);
  const highEng = engagementRate >= Math.max(medEng, 0.001);
  if (highViews && highEng) return "winner";
  if (highViews && !highEng) return "weak_cta";
  if (!highViews && highEng) return "weak_hook";
  return "dud";
}
