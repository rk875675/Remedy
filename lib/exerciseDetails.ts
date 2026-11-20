import AsyncStorage from '@react-native-async-storage/async-storage';
import { z } from 'zod';

import { supabase } from './supabase';

/**
 * Teaching row for one exercise. The table is added by migration 090 and may
 * be missing from the linked database and from `Database` types. Every public
 * function here fails soft: a missing table, a bad payload, or a storage
 * error leaves the session player on its existing path.
 */
export const exerciseDetailSchema = z
  .object({
    exercise_id: z.string().uuid(),
    slug: z.string(),
    per_side: z.boolean(),
    steps: z.array(z.string()),
    feel: z.string().nullable(),
    mistakes: z.array(z.string()),
    tempo: z.string().nullable(),
    tempo_pattern: z.array(z.number().int()),
    breathing: z.string().nullable(),
    easier: z.string().nullable(),
    harder: z.string().nullable(),
    purpose: z.string().nullable(),
  })
  .strict();

export type ExerciseDetail = z.infer<typeof exerciseDetailSchema>;

const DETAIL_COLUMNS =
  'exercise_id, slug, per_side, steps, feel, mistakes, tempo, tempo_pattern, breathing, easier, harder, purpose';

type DetailsQueryResult = {
  data: unknown;
  error: { message: string } | null;
};

type DetailsTable = {
  select: (columns: string) => {
    in: (column: 'exercise_id', values: readonly string[]) => PromiseLike<DetailsQueryResult>;
  };
};

/**
 * `exercise_details` is not on the generated `Database` type yet. The cast is
 * confined here so a missing relation is only a failed request, not a crash.
 */
function exerciseDetailsTable(): DetailsTable {
  const from = supabase.from as unknown as (table: 'exercise_details') => DetailsTable;
  return from('exercise_details');
}

/** null = looked up, no usable row. Absent = not fetched yet. */
const cache = new Map<string, ExerciseDetail | null>();

function filled(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}

/** True when the row has something to put in the guide sheet. */
export function hasGuideContent(detail: ExerciseDetail): boolean {
  return (
    detail.steps.some((step) => step.trim().length > 0) ||
    filled(detail.feel) ||
    detail.mistakes.some((item) => item.trim().length > 0) ||
    filled(detail.tempo) ||
    filled(detail.breathing) ||
    filled(detail.easier) ||
    filled(detail.harder) ||
    filled(detail.purpose)
  );
}

/**
 * Labels for a rep pace ring. One phase or an empty pattern has no ring.
 * Two phases are Out / Back. Three are Move / Pause / Return. Longer
 * patterns stay generic.
 */
export function pacePhaseLabels(pattern: readonly number[]): readonly string[] | null {
  if (pattern.length < 2) return null;
  if (pattern.some((seconds) => !Number.isInteger(seconds) || seconds < 0)) return null;
  if (pattern.length === 2) return ['Out', 'Back'];
  if (pattern.length === 3) return ['Move', 'Pause', 'Return'];
  return pattern.map((_, index) => `Phase ${index + 1}`);
}

export function guideSeenStorageKey(exerciseId: string): string {
  return `remedy.exerciseGuideSeen.${exerciseId}`;
}

export async function readGuideSeen(exerciseId: string): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(guideSeenStorageKey(exerciseId));
    return value !== null;
  } catch {
    return false;
  }
}

export async function markGuideSeen(exerciseId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(guideSeenStorageKey(exerciseId), '1');
  } catch {
    // Closing the sheet still dismisses it. A failed write only means the
    // next visit may offer the guide again.
  }
}

async function fetchAndCache(ids: readonly string[]): Promise<void> {
  let data: unknown;
  let error: { message: string } | null;
  try {
    const response = await exerciseDetailsTable().select(DETAIL_COLUMNS).in('exercise_id', ids);
    data = response.data;
    error = response.error;
  } catch {
    return;
  }
  if (error || !Array.isArray(data)) return;

  const parsed = new Map<string, ExerciseDetail>();
  for (const row of data) {
    const result = exerciseDetailSchema.safeParse(row);
    if (!result.success) continue;
    parsed.set(result.data.exercise_id, result.data);
  }
  for (const id of ids) {
    cache.set(id, parsed.get(id) ?? null);
  }
}

/**
 * One request for the ids that are not cached. Failures and missing rows
 * come back as an empty lookup for those ids. Successful misses are cached
 * so a session does not refetch a table that has no row.
 */
export async function loadExerciseDetails(
  ids: readonly string[],
): Promise<ReadonlyMap<string, ExerciseDetail>> {
  const unique = [...new Set(ids)];
  const missing = unique.filter((id) => !cache.has(id));
  if (missing.length > 0) {
    try {
      await fetchAndCache(missing);
    } catch {
      // fetchAndCache already swallows request failures. This guards the caller.
    }
  }
  const out = new Map<string, ExerciseDetail>();
  for (const id of unique) {
    const row = cache.get(id);
    if (row) out.set(id, row);
  }
  return out;
}
