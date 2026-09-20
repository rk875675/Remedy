import { getDb, learnings, hookFormulas, signals } from "@remedy-growth/db";
import { and, desc, eq } from "drizzle-orm";
import { summariesFor } from "./summaries.js";
import { ratingWeight, ratingsMap, RATING_START } from "./ratings.js";

export interface DimensionContext {
  prefer: string[];
  avoid: string[];
}

export interface HookContext extends DimensionContext {
  /** Insights from concluded A/B experiments on the hook dimension. */
  experimentInsights: string[];
}

export interface TemplateContext {
  weights: Record<string, number>;
  avoid: string[];
}

export interface AssetContext {
  preferScreenshots: string[];
  preferSVGs: string[];
  avoid: string[];
}

export interface TimingContext {
  bestHours: number[];
}

export interface KnowledgeContext {
  // Per-dimension contexts — each generation subsystem consumes only its own.
  hook: HookContext;
  copy: DimensionContext;
  layout: DimensionContext;
  template: TemplateContext;
  asset: AssetContext;
  visual: DimensionContext;
  music: DimensionContext;
  shotScale: DimensionContext;
  timing: TimingContext;
  // Legacy fields still consumed by existing prompts and pickers.
  rules: string[];
  failures: string[];
  formulaScores: Record<number, number>;
  bestScreenshots: string[];
  templateWeights: Partial<Record<string, number>>;
  bestHours: number[];
  /** Pre-formatted block injected into every LLM prompt. */
  promptBlock: string;
}

/** Always injected. Layout/mix constraints — not performance guesses. */
export const HARD_CONSTRAINTS = [
  "Headline and sub must never share the same vertical space. Sub starts below the last headline line with a clear gap. Overlap = failed slide.",
  "Prefer user crop_* screenshots over full screens. Match the crop description (what it shows + when to use it) to the slide.",
  "About 98% of new carousels use a visual on slide 1 (SVG illustration or photoreal person). About 45% of new carousels use a photoreal person as the cover. Person posts are always 6–10 slides. If a person is on the cover, also place a person on a later slide (2nd / 3rd / 4th / 5th or a combo) — never only the title, never every slide. The rest of visual covers are SVGs. Text-only hooks stay a tiny test slice.",
  "Screenshot size is a tested factor (contained / medium / large / bleed). contained keeps plates above REMEDY. large and bleed may occupy the wordmark zone — when they do, the REMEDY letters are omitted on that slide (never overlaid on the plate). Headline and screenshot still cannot overlap.",
  "Never say Remedy is free, a free app, a free download, or 'Get Remedy free'. Remedy is a paid App Store app. 'Pain-free' is fine. CTA should be 'Get Remedy — link in bio.'",
  "Every slide after the hook must continue that hook's specific promise. Generic app-feature copy that could follow any hook is a failed carousel.",
  "Every new carousel is 6–10 slides. Never 3, 4, or 5. Reviewer rejects short carousels as too short / no story. Person-cover posts are never shorter than 6. Extra slides must advance the same hook argument — never pad with generic app-feature copy.",
  "Teach the hook in the body (mistake, swap, tip, why it fails). The app is at most one late proof slide — never the plot, and never slide 2 unless the hook was about a missing plan / YouTube / playlists. Slide 1 stays a hook, not a lecture title or tip list.",
  "Last-slide CTA is locked. Do not edit or invent CTA layouts, headlines, subs, atmospheres, or screenshots. Pick only from the existing 7 review options. Screenshots are only progress.png, img_0525.png, img_0539.png, img_0540.png — never a library crop. Change CTA only when the user explicitly asks.",
];

const PROMPT_RULE_CAP = 6;
const PROMPT_FAILURE_CAP = 4;

function normalizeRule(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tooSimilar(a: string, b: string): boolean {
  const na = normalizeRule(a);
  const nb = normalizeRule(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  return (na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) / Math.max(na.length, nb.length) >= 0.65;
}

/** prefer/avoid lists for one dimension, from summaries first. Raw analytics signals never leak here. */
function dimensionContext(dimension: "hook" | "copy" | "layout" | "template" | "asset" | "visual" | "music" | "shot_scale"): DimensionContext {
  const db = getDb();
  const prefer = summariesFor(dimension, "prefer", 5)
    .filter((s) => s.confidence >= 40)
    .map((s) => s.summary);
  const avoid = summariesFor(dimension, "avoid", 5)
    .filter((s) => s.confidence >= 40)
    .map((s) => s.summary);
  // Human rejects can fill avoid until a summary exists. Diagnosis/A/B must wait for summaries.
  if (avoid.length < 3) {
    const raw = db
      .select()
      .from(signals)
      .where(and(eq(signals.dimension, dimension), eq(signals.direction, "avoid"), eq(signals.source, "manual_reject")))
      .orderBy(desc(signals.score), desc(signals.createdAt))
      .limit(5)
      .all()
      .map((s) => s.content)
      .filter((c) => !avoid.some((a) => tooSimilar(a, c)));
    avoid.push(...raw.slice(0, 3 - avoid.length));
  }
  return { prefer, avoid };
}

/** Experiment-sourced insights for a dimension (strongest evidence there is). */
function experimentInsights(dimension: string): string[] {
  const db = getDb();
  return db
    .select()
    .from(signals)
    .where(and(eq(signals.dimension, dimension as "hook"), eq(signals.source, "experiment")))
    .orderBy(desc(signals.createdAt))
    .limit(8)
    .all()
    .filter((s) => s.score >= 2)
    .slice(0, 4)
    .map((s) => s.content);
}

/**
 * Assemble the accumulated knowledge base into a context object used by
 * hook generation, template selection, screenshot picking, and scheduling.
 */
export function getKnowledgeContext(): KnowledgeContext {
  const db = getDb();

  const rules = db
    .select()
    .from(learnings)
    .where(eq(learnings.kind, "rule"))
    .orderBy(desc(learnings.score))
    .limit(12)
    .all()
    .map((l) => l.content);

  const failures = db
    .select()
    .from(learnings)
    .where(eq(learnings.kind, "failure"))
    .orderBy(desc(learnings.createdAt))
    .limit(8)
    .all()
    .map((l) => l.content);

  const formulaScores: Record<number, number> = {};
  const formulaRatings = ratingsMap("formula");
  for (const f of db.select().from(hookFormulas).all()) {
    const rated = formulaRatings[String(f.id)];
    formulaScores[f.id] = rated != null ? (rated - RATING_START) / 10 : f.score;
  }

  const bestScreenshotRows = db
    .select()
    .from(learnings)
    .where(eq(learnings.kind, "best_screenshot"))
    .orderBy(desc(learnings.score))
    .limit(4)
    .all();
  const bestScreenshots = bestScreenshotRows
    .map((l) => {
      const data = l.data as { screenshot?: string } | null;
      return data?.screenshot ?? null;
    })
    .filter((s): s is string => s !== null);

  const templateWeights: Partial<Record<string, number>> = {};
  for (const [id, score] of Object.entries(ratingsMap("template"))) {
    templateWeights[id] = ratingWeight(score);
  }
  for (const l of db.select().from(learnings).where(eq(learnings.kind, "best_template")).all()) {
    const data = l.data as { template?: string } | null;
    if (data?.template) {
      templateWeights[data.template] = Math.max(templateWeights[data.template] ?? ratingWeight(RATING_START), ratingWeight(50 + l.score));
    }
  }

  const bestHours: number[] = [];
  for (const l of db
    .select()
    .from(learnings)
    .where(eq(learnings.kind, "best_time"))
    .orderBy(desc(learnings.score))
    .limit(12)
    .all()) {
    const data = l.data as { hour?: number } | null;
    if (typeof data?.hour === "number") bestHours.push(data.hour);
  }

  // Keep every row in the DB. Only inject a compact slice so the prompt stays sharp.
  const promptRules = rules
    .filter((r) => !HARD_CONSTRAINTS.some((h) => tooSimilar(h, r)))
    .slice(0, PROMPT_RULE_CAP);
  const promptFailures = failures.slice(0, PROMPT_FAILURE_CAP);

  const promptBlock = [
    `Hard constraints (never break):\n${HARD_CONSTRAINTS.map((r) => `- ${r}`).join("\n")}`,
    promptRules.length ? `Top performance signals (full history stays in Engine):\n${promptRules.map((r) => `- ${r}`).join("\n")}` : "",
    promptFailures.length
      ? `Recent flops to avoid repeating (hook text + why):\n${promptFailures.map((f) => `- ${f}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  // Per-dimension contexts from structured signals + summaries.
  const hookBase = dimensionContext("hook");
  const hook: HookContext = { ...hookBase, experimentInsights: experimentInsights("hook") };
  const copy = dimensionContext("copy");
  const layout = dimensionContext("layout");
  const visual = dimensionContext("visual");

  const template: TemplateContext = {
    weights: Object.fromEntries(
      Object.entries(templateWeights).filter((e): e is [string, number] => typeof e[1] === "number"),
    ),
    avoid: dimensionContext("template").avoid,
  };

  const assetBase = dimensionContext("asset");
  const preferSVGs = db
    .select()
    .from(signals)
    .where(and(eq(signals.dimension, "asset"), eq(signals.direction, "prefer"), eq(signals.category, "winning_svg")))
    .orderBy(desc(signals.score))
    .limit(4)
    .all()
    .map((s) => (s.data as { svg?: string } | null)?.svg ?? null)
    .filter((s): s is string => s !== null);
  const asset: AssetContext = {
    preferScreenshots: bestScreenshots,
    preferSVGs,
    avoid: assetBase.avoid,
  };

  return {
    hook,
    copy,
    layout,
    template,
    asset,
    visual,
    music: dimensionContext("music"),
    shotScale: dimensionContext("shot_scale"),
    timing: { bestHours },
    rules,
    failures,
    formulaScores,
    bestScreenshots,
    templateWeights,
    bestHours,
    promptBlock,
  };
}

/**
 * Compact dimension-scoped prompt block. Injected into the LLM prompt of the
 * subsystem that owns the dimension (hooks -> hook, carousel copy -> copy, ...).
 */
export function dimensionPromptBlock(label: string, ctx: DimensionContext, extra: string[] = []): string {
  const parts: string[] = [];
  if (ctx.prefer.length) parts.push(`${label} — do more of:\n${ctx.prefer.map((p) => `- ${p}`).join("\n")}`);
  if (ctx.avoid.length) parts.push(`${label} — never repeat these mistakes:\n${ctx.avoid.map((a) => `- ${a}`).join("\n")}`);
  if (extra.length) parts.push(`${label} — proven by A/B experiments:\n${extra.map((e) => `- ${e}`).join("\n")}`);
  return parts.join("\n\n");
}

/** Upsert a keyed learning row (best_time / best_template / best_screenshot). */
export function upsertLearning(
  kind: "best_time" | "best_template" | "best_screenshot",
  key: string,
  content: string,
  data: Record<string, unknown>,
  score: number,
): void {
  const db = getDb();
  const payload = { ...data, key };
  const existing = db
    .select()
    .from(learnings)
    .where(eq(learnings.kind, kind))
    .all()
    .find((l) => (l.data as { key?: string } | null)?.key === key);
  if (existing) {
    db.update(learnings)
      .set({ content, data: payload, score, updatedAt: new Date().toISOString() })
      .where(eq(learnings.id, existing.id))
      .run();
  } else {
    db.insert(learnings).values({ kind, content, data: payload, score }).run();
  }
}

export function addFailure(content: string, data: Record<string, unknown>): void {
  const db = getDb();
  db.insert(learnings).values({ kind: "failure", content, data, score: 0 }).run();
}

export function addRule(content: string, score = 1): void {
  const db = getDb();
  const existing = db.select().from(learnings).where(eq(learnings.kind, "rule")).all();
  const match = existing.find((l) => l.content === content || tooSimilar(l.content, content));
  if (match) {
    if (score > match.score) {
      db.update(learnings)
        .set({ score, updatedAt: new Date().toISOString() })
        .where(eq(learnings.id, match.id))
        .run();
    }
    return;
  }
  db.insert(learnings).values({ kind: "rule", content, score }).run();
}
