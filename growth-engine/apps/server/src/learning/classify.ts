/**
 * Feedback auto-classification.
 *
 * When the reviewer rejects a post with a free-text reason, an LLM classifies
 * it into a dimension + category + actionable insight so it can be routed to
 * the right generation subsystem instead of piling into a flat checklist.
 * Falls back to a keyword heuristic when no LLM is available.
 */

import { z } from "zod";
import { getDb, signals, slides, hooks, hookFormulas, SIGNAL_DIMENSIONS, type SignalDimension } from "@remedy-growth/db";
import { and, asc, eq, sql } from "drizzle-orm";
import { generateJson } from "../generation/llm.js";
import { refreshSummaries } from "./summaries.js";
import { addFailure } from "./knowledge.js";

const FeedbackClassificationSchema = z
  .object({
    dimension: z.enum(SIGNAL_DIMENSIONS),
    category: z.string().min(2).max(40),
    severity: z.enum(["minor", "major", "critical"]),
    actionable_insight: z.string().min(5).max(200),
    applies_to: z.enum(["this_post", "this_template", "all_posts"]),
  })
  .strict();

export type FeedbackClassification = z.infer<typeof FeedbackClassificationSchema>;

const SEVERITY_SCORE: Record<FeedbackClassification["severity"], number> = {
  minor: 1,
  major: 2,
  critical: 4,
};

/** Keyword fallback when the LLM is unavailable — coarse but keeps signals structured. */
function heuristicClassification(reason: string): FeedbackClassification {
  const r = reason.toLowerCase();
  let dimension: SignalDimension = "hook";
  let category = "weak_hook";
  if (/too small|too big|too large|tiny|huge|shot scale|screenshot size|covers? remedy|covers? footer|bleed/.test(r)) {
    dimension = "shot_scale";
    category = "screenshot_size";
  } else if (/overlap|cut ?off|spacing|position|footer|covered|behind|on top/.test(r)) {
    dimension = "layout";
    category = "layout_bug";
  } else if (/screenshot|crop|image|photo|svg|illustration|picture/.test(r)) {
    dimension = "asset";
    category = "wrong_asset";
  } else if (/color|background|font|style|ugly|look|theme/.test(r)) {
    dimension = "visual";
    category = "style_issue";
  } else if (/flow|follow the hook|mismatch|generic|doesn'?t (make sense|tie|connect|follow|match)|didn'?t (follow|match|connect)|after the hook|rest of the|body slides|slides don/.test(r)) {
    dimension = "copy";
    category = "hook_mismatch";
  } else if (/template|structure|order|too many|too few|too short|too long/.test(r)) {
    dimension = "template";
    category = "template_fit";
  } else if (/caption|copy|sub|headline|wording|text says|typo|grammar/.test(r)) {
    dimension = "copy";
    category = "copy_quality";
  } else if (/time|hour|schedule/.test(r)) {
    dimension = "timing";
    category = "timing_issue";
  } else if (/music|soundtrack|bed|audio|song|track/.test(r)) {
    dimension = "music";
    category = "youtube_bed";
  }
  return {
    dimension,
    category,
    severity: "major",
    actionable_insight: reason.slice(0, 200),
    applies_to: "all_posts",
  };
}

export interface ClassifyContext {
  postId: number;
  hookText: string;
  templateId: string;
  slideKinds: string[];
  slideHeadlines?: string[];
}

/** Classify free-text rejection feedback into a structured dimension + category. */
export async function classifyFeedback(reason: string, ctx: ClassifyContext): Promise<FeedbackClassification> {
  const prompt = `You classify reviewer feedback for an automated TikTok carousel generator.
The reviewer REJECTED a post and wrote why. Route the feedback to the right subsystem.

Post context:
- Hook (slide 1 text): "${ctx.hookText}"
- Template: ${ctx.templateId} (slides: ${ctx.slideKinds.join(" → ")})
${ctx.slideHeadlines?.length ? `- Body headlines: ${ctx.slideHeadlines.map((h, i) => `${i + 1}. ${h}`).join(" | ")}` : ""}

Reviewer feedback: "${reason}"

Dimensions (pick exactly one):
- hook: the slide-1 hook text is weak, generic, off-tone, or overused. Only pick this if the opener itself is the problem.
- copy: slide headlines/subs/caption wording, OR the body does not continue/pay off the hook (generic app slides after a specific opener). Use category "hook_mismatch" when the rest of the carousel could follow any hook.
- layout: rendering/positioning bugs — overlap, cutoff text, spacing, elements covering each other
- template: wrong carousel structure — slide order, count, or template choice for this content
- asset: wrong/bad screenshot, crop, SVG or illustration choice
- visual: styling — colors, backgrounds, fonts, overall look
- timing: scheduling/posting-time concerns
- music: YouTube Short soundtrack / bed (not TikTok — those posts are silent)
- shot_scale: screenshot too small/large, covering REMEDY, or the size experiment looking wrong

category: a short snake_case slug describing the specific issue (e.g. "hook_mismatch", "generic_hook", "text_overlap", "wrong_crop"). Reuse an obvious existing name when possible.
severity: minor (cosmetic), major (hurts the post), critical (must never happen again).
actionable_insight: rewrite the feedback as a generalized instruction for future generation. Not "this post was bad" but "avoid X / prefer Y". Max 200 chars.
applies_to: this_post (one-off), this_template (specific to template ${ctx.templateId}), all_posts (a general rule).

Return JSON: {"dimension":"...","category":"...","severity":"...","actionable_insight":"...","applies_to":"..."}`;

  const result = await generateJson(prompt, FeedbackClassificationSchema);
  return result ?? heuristicClassification(reason);
}

export interface AddSignalInput {
  dimension: SignalDimension;
  category: string;
  source: "manual_reject" | "experiment" | "diagnosis" | "rule_promotion";
  direction: "prefer" | "avoid";
  content: string;
  data?: Record<string, unknown>;
  score?: number;
  postId?: number;
}

/** Insert a structured signal and refresh the affected dimension's summaries. */
export function addSignal(input: AddSignalInput): void {
  const db = getDb();
  db.insert(signals)
    .values({
      dimension: input.dimension,
      category: input.category,
      source: input.source,
      direction: input.direction,
      content: input.content,
      data: input.data ?? null,
      score: input.score ?? 1,
      postId: input.postId ?? null,
    })
    .run();
  refreshSummaries(input.dimension);
}

/** Classify rejection feedback, store the signal, and return the classification. */
export async function recordRejectionFeedback(
  reason: string,
  ctx: ClassifyContext,
): Promise<FeedbackClassification> {
  const classification = await classifyFeedback(reason, ctx);
  addSignal({
    dimension: classification.dimension,
    category: classification.category,
    source: "manual_reject",
    direction: "avoid",
    content: classification.actionable_insight,
    data: {
      rawReason: reason,
      severity: classification.severity,
      appliesTo: classification.applies_to,
      hookText: ctx.hookText,
      templateId: ctx.templateId,
    },
    score: SEVERITY_SCORE[classification.severity],
    postId: ctx.postId,
  });
  return classification;
}

function rejectSlideDigest(postId: number): { slideKinds: string[]; slideHeadlines: string[]; bodyLine: string } {
  const rows = getDb().select().from(slides).where(eq(slides.postId, postId)).orderBy(asc(slides.idx)).all();
  const slideKinds = rows.map((s) => s.kind);
  const slideHeadlines = rows.map((s) => s.headline);
  const bodyLine = rows
    .filter((s) => s.kind !== "hook" && s.kind !== "cta")
    .map((s) => `${s.idx + 1}[${s.kind}] ${s.headline}`)
    .join(" · ");
  return { slideKinds, slideHeadlines, bodyLine };
}

function penalizeHook(hookId: number, formulaId: number | null): void {
  const db = getDb();
  const hook = db.select().from(hooks).where(eq(hooks.id, hookId)).get();
  if (!hook) return;
  db.update(hooks).set({ score: hook.score - 0.5 }).where(eq(hooks.id, hook.id)).run();
  if (formulaId) {
    db.update(hookFormulas)
      .set({ losses: sql`${hookFormulas.losses} + 1`, score: sql`${hookFormulas.score} - 0.3` })
      .where(eq(hookFormulas.id, formulaId))
      .run();
  }
}

/** Record a reviewer reject so the next generate sees it. Hook score only drops when the hook itself is the problem. */
export async function learnFromReject(input: {
  postId: number;
  hookId: number;
  hookText: string;
  formulaId: number | null;
  templateId: string;
  reason: string;
}): Promise<{ dimension: string; category: string }> {
  const { slideKinds, slideHeadlines, bodyLine } = rejectSlideDigest(input.postId);
  const reason = input.reason.trim();
  const failureMsg = reason
    ? `Rejected by reviewer: "${input.hookText}" (template ${input.templateId}). Body: ${bodyLine || "n/a"}. Reason: ${reason}`
    : `Rejected by reviewer: "${input.hookText}" (template ${input.templateId}). Body: ${bodyLine || "n/a"}.`;
  addFailure(failureMsg, {
    hookId: input.hookId,
    postId: input.postId,
    templateId: input.templateId,
    reason: "manual_reject",
    reviewerNote: reason || undefined,
  });

  const ctx: ClassifyContext = {
    postId: input.postId,
    hookText: input.hookText,
    templateId: input.templateId,
    slideKinds,
    slideHeadlines,
  };

  if (reason) {
    const cls = await recordRejectionFeedback(reason, ctx);
    if (cls.dimension === "hook") penalizeHook(input.hookId, input.formulaId);
    return { dimension: cls.dimension, category: cls.category };
  }

  addSignal({
    dimension: "copy",
    category: "rejected_unspecified",
    source: "manual_reject",
    direction: "avoid",
    content: `Rejected carousel (no reason). Hook "${input.hookText}" then: ${bodyLine || "no body"}. Do not repeat this hook+body pairing — body slides must continue the hook.`,
    data: { hookId: input.hookId, templateId: input.templateId, slideHeadlines },
    score: 1,
    postId: input.postId,
  });
  return { dimension: "copy", category: "rejected_unspecified" };
}

/** Count how many signals exist for a dimension+category (used for rule promotion). */
export function signalCount(dimension: SignalDimension, category: string): number {
  const db = getDb();
  return db
    .select()
    .from(signals)
    .where(and(eq(signals.dimension, dimension), eq(signals.category, category)))
    .all().length;
}
