/**
 * Dimension summaries — the aggregated "what works / what to avoid" layer.
 *
 * Signals are the raw evidence; summaries are what generation and the
 * dashboard actually consume. A summary appears once a dimension+category
 * accumulates enough evidence (SUMMARY_MIN_EVIDENCE signals), and its
 * confidence grows with evidence count and total score.
 */

import { getDb, signals, dimensionSummaries, SIGNAL_DIMENSIONS, type SignalDimension } from "@remedy-growth/db";
import { and, desc, eq } from "drizzle-orm";

/** Signals needed in one dimension+category before a summary is created. */
const SUMMARY_MIN_EVIDENCE = 3;
/** Two agreeing A/B results, or one large-sample win (score >= 3). */
const EXPERIMENT_MIN_EVIDENCE = 2;
const EXPERIMENT_STRONG_SCORE = 3;

function confidenceFor(evidenceCount: number, totalScore: number, hasExperiment: boolean): number {
  const base = Math.min(evidenceCount * 12, 60) + Math.min(totalScore * 4, 25);
  return Math.min(100, Math.round(base + (hasExperiment ? 15 : 0)));
}

function enoughEvidence(group: Array<{ source: string; score: number }>, hasExperiment: boolean): boolean {
  if (hasExperiment) {
    if (group.length >= EXPERIMENT_MIN_EVIDENCE) return true;
    return group.some((s) => s.score >= EXPERIMENT_STRONG_SCORE);
  }
  return group.length >= SUMMARY_MIN_EVIDENCE;
}

/**
 * Recompute summaries for one dimension (or all). Groups signals by
 * category+direction; the representative summary text is the highest-score,
 * most recent signal content.
 */
export function refreshSummaries(dimension?: SignalDimension): void {
  const db = getDb();
  const dims = dimension ? [dimension] : [...SIGNAL_DIMENSIONS];

  for (const dim of dims) {
    const rows = db
      .select()
      .from(signals)
      .where(eq(signals.dimension, dim))
      .orderBy(desc(signals.score), desc(signals.createdAt))
      .all();

    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.category}|${row.direction}`;
      const list = groups.get(key) ?? [];
      list.push(row);
      groups.set(key, list);
    }

    for (const [key, group] of groups) {
      const [category, direction] = key.split("|") as [string, "prefer" | "avoid"];
      const hasExperiment = group.some((s) => s.source === "experiment");
      if (!enoughEvidence(group, hasExperiment)) continue;

      const totalScore = group.reduce((sum, s) => sum + s.score, 0);
      const confidence = confidenceFor(group.length, totalScore, hasExperiment);
      // Ordered by score desc, createdAt desc — first row is the representative insight.
      const summary = group[0]!.content;

      const existing = db
        .select()
        .from(dimensionSummaries)
        .where(
          and(
            eq(dimensionSummaries.dimension, dim),
            eq(dimensionSummaries.category, category),
            eq(dimensionSummaries.direction, direction),
          ),
        )
        .get();

      if (existing) {
        db.update(dimensionSummaries)
          .set({ summary, evidenceCount: group.length, confidence, updatedAt: new Date().toISOString() })
          .where(eq(dimensionSummaries.id, existing.id))
          .run();
      } else {
        db.insert(dimensionSummaries)
          .values({ dimension: dim, category, direction, summary, evidenceCount: group.length, confidence })
          .run();
      }
    }
  }
}

export interface SummaryRow {
  dimension: SignalDimension;
  category: string;
  direction: "prefer" | "avoid";
  summary: string;
  evidenceCount: number;
  confidence: number;
}

/** Summaries for one dimension, highest confidence first. */
export function summariesFor(dimension: SignalDimension, direction?: "prefer" | "avoid", limit = 6): SummaryRow[] {
  const db = getDb();
  const rows = db
    .select()
    .from(dimensionSummaries)
    .where(
      direction
        ? and(eq(dimensionSummaries.dimension, dimension), eq(dimensionSummaries.direction, direction))
        : eq(dimensionSummaries.dimension, dimension),
    )
    .orderBy(desc(dimensionSummaries.confidence))
    .limit(limit)
    .all();
  return rows.map((r) => ({
    dimension: r.dimension as SignalDimension,
    category: r.category,
    direction: r.direction as "prefer" | "avoid",
    summary: r.summary,
    evidenceCount: r.evidenceCount,
    confidence: r.confidence,
  }));
}

/** All summaries across dimensions for the dashboard. */
export function allSummaries(): SummaryRow[] {
  const db = getDb();
  return db
    .select()
    .from(dimensionSummaries)
    .orderBy(desc(dimensionSummaries.confidence))
    .all()
    .map((r) => ({
      dimension: r.dimension as SignalDimension,
      category: r.category,
      direction: r.direction as "prefer" | "avoid",
      summary: r.summary,
      evidenceCount: r.evidenceCount,
      confidence: r.confidence,
    }));
}
