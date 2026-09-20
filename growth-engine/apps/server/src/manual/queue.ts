import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, posts, settings } from "@remedy-growth/db";
import { deleteShortNow } from "../generation/storage.js";

const KEY = "manual_posting";

const ManualPostingSchema = z
  .object({
    currentPostId: z.number().int().nullable(),
    completedIds: z.array(z.number().int()),
  })
  .strict();

export type ManualPosting = z.infer<typeof ManualPostingSchema>;

export function loadManualPosting(): ManualPosting {
  const row = getDb().select().from(settings).where(eq(settings.key, KEY)).get();
  const parsed = ManualPostingSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { currentPostId: null, completedIds: [] };
}

export function saveManualPosting(value: ManualPosting): ManualPosting {
  const next = ManualPostingSchema.parse({
    currentPostId: value.currentPostId,
    completedIds: [...new Set(value.completedIds)].sort((a, b) => a - b),
  });
  getDb()
    .insert(settings)
    .values({ key: KEY, value: next, updatedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: next, updatedAt: new Date().toISOString() },
    })
    .run();
  return next;
}

export function approvedReadyIds(completedIds: number[]): number[] {
  return getDb()
    .select()
    .from(posts)
    .where(eq(posts.status, "approved"))
    .all()
    .filter((p) => !completedIds.includes(p.id))
    .map((p) => p.id);
}

export function pickRandomReadyId(completedIds: number[], excludeId?: number | null): number | null {
  const ready = approvedReadyIds(completedIds);
  const pool = excludeId != null ? ready.filter((id) => id !== excludeId) : ready;
  const pickFrom = pool.length > 0 ? pool : ready;
  if (pickFrom.length === 0) return null;
  return pickFrom[Math.floor(Math.random() * pickFrom.length)]!;
}

export function syncManualCurrent(): ManualPosting {
  const state = loadManualPosting();
  if (state.currentPostId != null && !state.completedIds.includes(state.currentPostId)) {
    const row = getDb().select().from(posts).where(eq(posts.id, state.currentPostId)).get();
    if (row && (row.status === "approved" || row.status === "queued")) {
      return state;
    }
  }
  state.currentPostId = pickRandomReadyId(state.completedIds);
  return saveManualPosting(state);
}

/** Replace "This post" with a different approved reel. */
export function reshuffleManualCurrent(): ManualPosting {
  const state = loadManualPosting();
  state.currentPostId = pickRandomReadyId(state.completedIds, state.currentPostId);
  return saveManualPosting(state);
}

/** Mark posted-by-hand so Send now / BrightBean will not pick it, then drop the Short. */
export async function completeManualPost(postId?: number): Promise<ManualPosting> {
  const state = loadManualPosting();
  const id = postId ?? state.currentPostId;
  if (id == null) return syncManualCurrent();
  if (!state.completedIds.includes(id)) state.completedIds.push(id);
  const row = getDb().select().from(posts).where(eq(posts.id, id)).get();
  if (row && row.status !== "published") {
    getDb()
      .update(posts)
      .set({
        status: "published",
        publishedAt: row.publishedAt ?? new Date().toISOString(),
        error: null,
      })
      .where(eq(posts.id, id))
      .run();
  }
  state.currentPostId = pickRandomReadyId(state.completedIds);
  const saved = saveManualPosting(state);
  await deleteShortNow(id);
  return saved;
}

export function setManualCurrent(postId: number): ManualPosting {
  const state = loadManualPosting();
  state.currentPostId = postId;
  return saveManualPosting(state);
}

export function initManualQueue(alreadyPostedIds: number[]): ManualPosting {
  const state = loadManualPosting();
  for (const id of alreadyPostedIds) {
    if (!state.completedIds.includes(id)) state.completedIds.push(id);
  }
  saveManualPosting(state);
  return syncManualCurrent();
}
