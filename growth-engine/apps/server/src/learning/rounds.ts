/**
 * Learning cycle — the explore/exploit rhythm of the engine.
 *
 * The engine alternates two phases, forever:
 *
 *   DIVERSITY (long, most important): generation aggressively targets
 *   untested combinations — cold templates, cold SVGs, cold screenshots,
 *   unused color/style combos. Nothing has to be tested immediately;
 *   whatever ships is recorded, and the NEXT diversity round targets
 *   whatever is still cold. Concludes after `target` shipped posts.
 *
 *   AB_TEST (short): the best parts of the diversity round get A/B
 *   tested — variants are auto-created from top approved posts, one
 *   dimension changed at a time. Concludes when its experiments finish
 *   (or the phase times out).
 *
 * At each conclusion the round writes a rollup (what was tested, what
 * won, what's still cold) and the next phase starts automatically.
 */

import {
  getDb,
  posts,
  slides,
  hooks,
  signals,
  rounds,
  experiments,
} from "@remedy-growth/db";
import { asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getAssetUsage, allStyleCombos, shippedStyleComboUsage, type AssetCoverage } from "../generation/diversity.js";
import { parseVariation } from "../generation/variations.js";
import { effectiveDailyCap } from "../publish/scheduler.js";
import { loadAudience, type AudienceCache } from "../analytics/audience.js";
import { LEARNING_POLICY } from "./normalize.js";
import { createVariant, listExperiments } from "./experiments.js";
import { refreshSummaries } from "./summaries.js";

/** Full-pace destinations (once daily cap hits 10). Warmup scales down from these. */
const DIVERSITY_AT_FULL = 40;
const AB_AT_FULL = 15;
const FULL_PACE_CAP = 10;
/** A/B phase gives up waiting after this many days and moves on. */
const AB_MAX_DAYS = 21;

/**
 * Round size tracks the account warmup. At 2/day a diversity round is ~8
 * posts (4 days); at 10/day it is 40 (30–50) and A/B is 15 experiments
 * (10–20 posts). Never shrink an in-flight round — only grow if the cap rose.
 */
export function phaseTargets(dailyCap = effectiveDailyCap()): { diversity: number; ab: number; dailyCap: number } {
  const cap = Math.max(1, dailyCap);
  const scale = Math.min(1, cap / FULL_PACE_CAP);
  const diversity = Math.min(50, Math.max(8, Math.round(DIVERSITY_AT_FULL * scale)));
  const ab = Math.min(20, Math.max(2, Math.round(AB_AT_FULL * scale)));
  return { diversity, ab, dailyCap: cap };
}

const SHIPPED = ["published", "draft_sent"] as const;

export type RoundRow = typeof rounds.$inferSelect;

/** Keep the in-flight target aligned with the daily cap. Shrink only if nothing has shipped yet. */
function growTargetIfNeeded(round: RoundRow): RoundRow {
  const { diversity, ab } = phaseTargets();
  const desired = round.phase === "diversity" ? diversity : ab;
  if (desired === round.target) return round;
  if (desired < round.target) {
    const shipped = roundPosts(round).filter((p) => (SHIPPED as readonly string[]).includes(p.status)).length;
    if (shipped > 0) return round;
  }
  const db = getDb();
  db.update(rounds).set({ target: desired }).where(eq(rounds.id, round.id)).run();
  console.log(`Learning cycle: round #${round.number} ${round.phase} target ${round.target} → ${desired}.`);
  return { ...round, target: desired };
}

/** The active round — creates diversity round #1 if none exists yet. */
export function currentRound(): RoundRow {
  const db = getDb();
  const active = db.select().from(rounds).where(eq(rounds.status, "active")).orderBy(desc(rounds.id)).get();
  if (active) return growTargetIfNeeded(active);
  const { diversity } = phaseTargets();
  const created = db
    .insert(rounds)
    .values({ number: 1, phase: "diversity", target: diversity })
    .returning()
    .get();
  if (!created) throw new Error("Could not create initial round");
  console.log(`Learning cycle: started diversity round #1 (target ${diversity}).`);
  return created;
}

/** Posts created during this round. */
function roundPosts(round: RoundRow) {
  const db = getDb();
  return db.select().from(posts).where(gte(posts.createdAt, round.startedAt)).orderBy(asc(posts.id)).all();
}

export interface RoundCoverage {
  /** Shipped posts created during this round. */
  shippedThisRound: number;
  target: number;
  /** Asset names first shipped during this round (newly tested). */
  newlyTested: { templates: string[]; screenshots: string[]; svgs: string[]; formulas: string[]; styleCombos: string[]; music: string[]; shotScales: string[] };
  /** All-time tested vs total, per asset type. */
  allTime: {
    templates: { tested: number; total: number };
    screenshots: { tested: number; total: number };
    svgs: { tested: number; total: number };
    formulas: { tested: number; total: number };
    styleCombos: { tested: number; total: number };
    music: { tested: number; total: number };
    shotScales: { tested: number; total: number };
  };
  /** Still-cold asset names (never shipped) — next diversity round's targets. */
  stillCold: { templates: string[]; screenshots: string[]; svgs: string[]; styleCombos: string[]; music: string[]; shotScales: string[] };
}

/** Coverage report for a round: what got its first test, what's still cold. */
export function roundCoverage(round: RoundRow, usageArg?: AssetCoverage): RoundCoverage {
  const db = getDb();
  const usage = usageArg ?? getAssetUsage();
  const inRound = roundPosts(round);
  const shippedInRound = inRound.filter((p) => (SHIPPED as readonly string[]).includes(p.status));
  const shippedIdsInRound = new Set(shippedInRound.map((p) => p.id));

  // Assets used by shipped posts BEFORE this round (to detect "first shipped this round").
  const priorShipped = db
    .select()
    .from(posts)
    .where(inArray(posts.status, [...SHIPPED]))
    .all()
    .filter((p) => p.createdAt < round.startedAt);
  const priorTemplates = new Set(priorShipped.map((p) => p.templateId));
  const priorCombos = new Set(priorShipped.map((p) => {
    const v = parseVariation(p.variation);
    return `${v.background}/${v.textStyle}/${v.layout}`;
  }));
  const priorIds = new Set(priorShipped.map((p) => p.id));
  const allSlides = db.select().from(slides).all();
  const priorScreens = new Set(allSlides.filter((s) => s.screenshot && priorIds.has(s.postId)).map((s) => s.screenshot as string));
  const hookById = new Map(db.select().from(hooks).all().map((h) => [h.id, h]));
  const priorFormulas = new Set(
    priorShipped.map((p) => hookById.get(p.hookId)?.formulaId).filter((f): f is number => typeof f === "number"),
  );

  const newTemplates = [...new Set(shippedInRound.map((p) => p.templateId))].filter((t) => !priorTemplates.has(t));
  const newCombos = [...new Set(shippedInRound.map((p) => {
    const v = parseVariation(p.variation);
    return `${v.background}/${v.textStyle}/${v.layout}`;
  }))].filter((c) => !priorCombos.has(c));
  const newScreens = [...new Set(
    allSlides.filter((s) => s.screenshot && shippedIdsInRound.has(s.postId)).map((s) => s.screenshot as string),
  )].filter((s) => !priorScreens.has(s));
  const newFormulas = [...new Set(
    shippedInRound.map((p) => hookById.get(p.hookId)?.formulaId).filter((f): f is number => typeof f === "number"),
  )].filter((f) => !priorFormulas.has(f)).map(String);
  const priorBeds = new Set(
    priorShipped.map((p) => parseVariation(p.variation).shortBed).filter((b): b is string => Boolean(b)),
  );
  const newBeds = [...new Set(
    shippedInRound.map((p) => parseVariation(p.variation).shortBed).filter((b): b is string => Boolean(b)),
  )].filter((b) => !priorBeds.has(b));
  const priorScales = new Set(priorShipped.map((p) => parseVariation(p.variation).shotScale));
  const newScales = [...new Set(shippedInRound.map((p) => parseVariation(p.variation).shotScale))].filter(
    (s) => !priorScales.has(s),
  );
  // SVG novelty is derived from the coverage report (cold = never shipped).
  const svgTested = usage.svgs.filter((s) => !s.cold);

  const comboUsage = shippedStyleComboUsage();
  const combosAll = allStyleCombos();
  const coldCombos = combosAll.filter((c) => !comboUsage.has(c));

  return {
    shippedThisRound: shippedInRound.length,
    target: round.target,
    newlyTested: {
      templates: newTemplates,
      screenshots: newScreens,
      svgs: [], // per-round SVG attribution needs render-time tracking; all-time cold list below covers the gap
      formulas: newFormulas,
      styleCombos: newCombos,
      music: newBeds,
      shotScales: newScales,
    },
    allTime: {
      templates: { tested: usage.templates.filter((t) => !t.cold).length, total: usage.templates.length },
      screenshots: { tested: usage.screenshots.filter((s) => !s.cold).length, total: usage.screenshots.length },
      svgs: { tested: svgTested.length, total: usage.svgs.length },
      formulas: { tested: usage.formulas.filter((f) => !f.cold).length, total: usage.formulas.length },
      styleCombos: { tested: comboUsage.size, total: combosAll.length },
      music: { tested: (usage.music ?? []).filter((m) => !m.cold).length, total: (usage.music ?? []).length },
      shotScales: { tested: (usage.shotScales ?? []).filter((s) => !s.cold).length, total: (usage.shotScales ?? []).length },
    },
    stillCold: {
      templates: usage.templates.filter((t) => t.cold).map((t) => t.name),
      screenshots: usage.screenshots.filter((s) => s.cold).map((s) => s.name),
      svgs: usage.svgs.filter((s) => s.cold).map((s) => s.name),
      styleCombos: coldCombos.slice(0, 30),
      music: (usage.music ?? []).filter((m) => m.cold).map((m) => m.name),
      shotScales: (usage.shotScales ?? []).filter((s) => s.cold).map((s) => s.name),
    },
  };
}

export interface RoundRollup {
  phase: "diversity" | "ab_test";
  shipped: number;
  newlyTested: RoundCoverage["newlyTested"];
  signalsGathered: number;
  topPosts: Array<{ postId: number; hook: string; diagnosis: string | null }>;
  experimentResults: Array<{ id: number; dimension: string; winner: string | null; liftPct: number | null }>;
}

function buildRollup(round: RoundRow): RoundRollup {
  const db = getDb();
  const coverage = roundCoverage(round);
  const inRound = roundPosts(round);
  const hookById = new Map(db.select().from(hooks).all().map((h) => [h.id, h]));

  const signalCount = db
    .select()
    .from(signals)
    .where(gte(signals.createdAt, round.startedAt))
    .all().length;

  const top = inRound
    .filter((p) => p.diagnosis === "winner" || ((SHIPPED as readonly string[]).includes(p.status) && p.diagnosis !== "dud"))
    .slice(0, 5)
    .map((p) => ({ postId: p.id, hook: hookById.get(p.hookId)?.text ?? "", diagnosis: p.diagnosis }));

  const exps = db
    .select()
    .from(experiments)
    .where(gte(experiments.createdAt, round.startedAt))
    .all()
    .map((e) => ({ id: e.id, dimension: e.dimension as string, winner: e.winner, liftPct: e.liftPct }));

  return {
    phase: round.phase,
    shipped: coverage.shippedThisRound,
    newlyTested: coverage.newlyTested,
    signalsGathered: signalCount,
    topPosts: top,
    experimentResults: exps,
  };
}

export interface AdvanceResult {
  advanced: boolean;
  from?: string;
  to?: string;
  variantsCreated: number;
  note: string;
}

/**
 * Phase state machine — called from the daily cycle (and manually via API).
 *
 * diversity: conclude at `target` shipped posts -> start ab_test phase.
 * ab_test:   auto-create variants from top approved posts until AB_TARGET
 *            experiments exist for this phase; conclude when all its
 *            experiments finish (or the phase times out) -> next diversity round.
 */
export async function advanceRounds(force = false): Promise<AdvanceResult> {
  const db = getDb();
  const round = currentRound();
  let variantsCreated = 0;

  if (round.phase === "diversity") {
    const coverage = roundCoverage(round);
    if (!force && coverage.shippedThisRound < round.target) {
      return {
        advanced: false,
        variantsCreated: 0,
        note: `Diversity round #${round.number}: ${coverage.shippedThisRound}/${round.target} shipped.`,
      };
    }
    const rollup = buildRollup(round);
    db.update(rounds)
      .set({ status: "concluded", concludedAt: new Date().toISOString(), summary: rollup })
      .where(eq(rounds.id, round.id))
      .run();
    refreshSummaries();
    db.insert(rounds).values({ number: round.number, phase: "ab_test", target: phaseTargets().ab }).run();
    console.log(`Learning cycle: diversity round #${round.number} concluded (${rollup.shipped} shipped) -> A/B phase.`);
    return {
      advanced: true,
      from: `diversity #${round.number}`,
      to: `ab_test #${round.number}`,
      variantsCreated: 0,
      note: `Diversity round #${round.number} done — A/B phase started.`,
    };
  }

  // ab_test phase: top up experiments, then wait for them to conclude.
  const phaseExps = db.select().from(experiments).where(gte(experiments.createdAt, round.startedAt)).all();
  const live = phaseExps.filter((e) => e.status !== "cancelled");

  if (live.length < round.target) {
    variantsCreated = await createPhaseVariants(round, round.target - live.length);
  }

  const ageDays = (Date.now() - new Date(round.startedAt).getTime()) / 86_400_000;
  const allDone = live.length > 0 && live.every((e) => e.status === "concluded");
  const timedOut = ageDays > AB_MAX_DAYS;

  if (!force && !allDone && !timedOut) {
    const running = live.filter((e) => e.status === "pending" || e.status === "active").length;
    return {
      advanced: false,
      variantsCreated,
      note: `A/B phase #${round.number}: ${live.filter((e) => e.status === "concluded").length}/${round.target} concluded, ${running} running${variantsCreated ? `, ${variantsCreated} variant(s) just created` : ""}.`,
    };
  }

  const rollup = buildRollup(round);
  db.update(rounds)
    .set({ status: "concluded", concludedAt: new Date().toISOString(), summary: rollup })
    .where(eq(rounds.id, round.id))
    .run();
  refreshSummaries();
  db.insert(rounds).values({ number: round.number + 1, phase: "diversity", target: phaseTargets().diversity }).run();
  console.log(`Learning cycle: A/B phase #${round.number} concluded -> diversity round #${round.number + 1}.`);
  return {
    advanced: true,
    from: `ab_test #${round.number}`,
    to: `diversity #${round.number + 1}`,
    variantsCreated,
    note: `A/B phase #${round.number} done${timedOut && !allDone ? " (timed out)" : ""} — diversity round #${round.number + 1} started with all learnings applied.`,
  };
}

/** Auto-create A/B variants from the best approved/queued posts not yet in an experiment. */
async function createPhaseVariants(round: RoundRow, howMany: number): Promise<number> {
  const db = getDb();
  const candidates = db
    .select()
    .from(posts)
    .where(inArray(posts.status, ["approved", "queued"]))
    .orderBy(desc(posts.confidence), desc(posts.id))
    .all();
  let created = 0;
  for (const post of candidates) {
    if (created >= howMany) break;
    const result = await createVariant(post.id); // auto: least-tested dimension
    if (result.ok) {
      created++;
      console.log(`A/B phase #${round.number}: auto-created variant #${result.variantPostId} of post #${post.id} (${result.dimension}).`);
    }
  }
  return created;
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
    dailyCap: number;
    warmup: boolean;
    fullPaceTargets: { diversity: number; ab: number };
  };
  history: Array<{
    number: number;
    phase: string;
    startedAt: string;
    concludedAt: string | null;
    summary: RoundRollup | null;
  }>;
  audience: AudienceCache | null;
  policy: typeof LEARNING_POLICY;
  howItWorks: string[];
}

/** Full cycle state for the dashboard. */
export function getCycleState(): CycleState {
  const db = getDb();
  const round = currentRound();
  const coverage = roundCoverage(round);

  let progress: number;
  let progressLabel: string;
  if (round.phase === "diversity") {
    progress = Math.min(1, coverage.shippedThisRound / Math.max(1, round.target));
    progressLabel = `${coverage.shippedThisRound}/${round.target} posts shipped`;
  } else {
    const phaseExps = listExperiments(100).filter((e) => e.createdAt >= round.startedAt && e.status !== "cancelled");
    const done = phaseExps.filter((e) => e.status === "concluded").length;
    progress = Math.min(1, done / Math.max(1, round.target));
    progressLabel = `${done}/${round.target} experiments concluded`;
  }

  const history = db
    .select()
    .from(rounds)
    .where(eq(rounds.status, "concluded"))
    .orderBy(desc(rounds.id))
    .limit(12)
    .all()
    .map((r) => ({
      number: r.number,
      phase: r.phase,
      startedAt: r.startedAt,
      concludedAt: r.concludedAt,
      summary: (r.summary as RoundRollup | null) ?? null,
    }));

  const { dailyCap, diversity, ab } = phaseTargets();
  const warmup = dailyCap < FULL_PACE_CAP;

  return {
    current: {
      number: round.number,
      phase: round.phase,
      startedAt: round.startedAt,
      target: round.target,
      progress,
      progressLabel,
      coverage,
      dailyCap,
      warmup,
      fullPaceTargets: { diversity: DIVERSITY_AT_FULL, ab: AB_AT_FULL },
    },
    history,
    audience: loadAudience(),
    policy: LEARNING_POLICY,
    howItWorks: [
      warmup
        ? `Account warmup: ${dailyCap}/day. Diversity is ${diversity} posts (~${Math.ceil(diversity / dailyCap)} days). A/B is ${ab} experiments. At 10/day this becomes ${DIVERSITY_AT_FULL} / ${AB_AT_FULL}.`
        : `Full pace: ${dailyCap}/day. Diversity is ${diversity} posts (~${Math.ceil(diversity / dailyCap)} days). A/B is ${ab} experiments.`,
      "Diversity round: generation targets untested templates, screenshots, SVGs, screenshot sizes, and color/style combos. Ships until the target is hit.",
      "A/B phase: the best posts get one-change variants, posted 24-48h apart. A pair is judged only after both are 48h old, on views-per-follower — not raw views.",
      "Analytics come from BrightBean. A post is never judged until it is live and 48h old. Winners/duds need a top/bottom-quartile gap vs the same follower era (early 40-follower posts are never compared to later 4,000-follower posts). Mid-pack is 'typical' — luck, not a rule.",
      "Each template, hook style, and screenshot has a 0–100 rating starting at 50. One post moves it a few points either way — never enough to crown or cripple it. Hard rules still need 3 agreeing same-era posts. Your manual rejects teach immediately.",
    ],
  };
}
