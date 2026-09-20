import { getDb, ugcVideos } from "@remedy-growth/db";
import { eq, inArray } from "drizzle-orm";

const HOLD_STATUSES = ["approved", "scheduled", "published"] as const;

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const next = new Date(y!, (m ?? 1) - 1, (d ?? 1) + days);
  return dateKey(next);
}

function atClockOnDate(source: Date, key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const out = new Date(source.getTime());
  out.setFullYear(y!, (m ?? 1) - 1, d ?? 1);
  return out;
}

function takenDaysForCreator(creatorId: number): Set<string> {
  const db = getDb();
  const rows = db
    .select()
    .from(ugcVideos)
    .where(inArray(ugcVideos.status, [...HOLD_STATUSES]))
    .all()
    .filter((v) => v.creatorId === creatorId);
  const taken = new Set<string>();
  for (const row of rows) {
    const when = row.scheduledAt || row.publishedAt;
    if (!when) continue;
    taken.add(dateKey(new Date(when)));
  }
  return taken;
}

/** 1 UGC/day per creator. First free slot is now+1h; extras land on later calendar days at that clock. */
export function assignUgcSchedule(creatorId?: number): number {
  const db = getDb();
  const waiting = db
    .select()
    .from(ugcVideos)
    .where(eq(ugcVideos.status, "approved"))
    .all()
    .filter((v) => (creatorId == null || v.creatorId === creatorId) && !v.scheduledAt)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (waiting.length === 0) return 0;

  const plusHour = new Date(Date.now() + 60 * 60 * 1000);
  let assigned = 0;
  const grouped = new Map<number, typeof waiting>();
  for (const video of waiting) {
    const list = grouped.get(video.creatorId) ?? [];
    list.push(video);
    grouped.set(video.creatorId, list);
  }

  for (const [cid, videos] of grouped) {
    const taken = takenDaysForCreator(cid);
    for (const video of videos) {
      let key = dateKey(plusHour);
      while (taken.has(key)) key = addDaysKey(key, 1);
      const when = key === dateKey(plusHour) ? plusHour : atClockOnDate(plusHour, key);
      db.update(ugcVideos)
        .set({ status: "scheduled", scheduledAt: when.toISOString(), error: null })
        .where(eq(ugcVideos.id, video.id))
        .run();
      taken.add(key);
      assigned++;
    }
  }
  return assigned;
}
