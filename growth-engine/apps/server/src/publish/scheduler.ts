import { getDb, posts } from "@remedy-growth/db";
import { and, eq, isNull, gte, sql } from "drizzle-orm";
import { env, configuredPlatforms, PLATFORM_DAILY_CAPS } from "../config.js";
import { getKnowledgeContext } from "../learning/knowledge.js";
import { experimentPartner } from "../learning/experiments.js";

/** A/B pair posts go out 24-48h apart — far enough to not look like spam, close enough to compare. */
const AB_MIN_GAP_MS = 24 * 3_600_000;
const AB_MAX_EXTRA_MS = 12 * 3_600_000;

/** Earliest / latest local hour we will ever schedule (inclusive start, exclusive end). */
const WINDOW = { earliest: 8, latest: 22 };

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dayKey(d: Date): number {
  return d.getFullYear() * 10_000 + (d.getMonth() + 1) * 100 + d.getDate();
}

function atLocal(forDate: Date, hour: number, minute: number): Date {
  const d = new Date(forDate);
  d.setHours(hour, minute, Math.floor(Math.random() * 40), 0);
  return d;
}

/**
 * Pick `count` local times inside a day-shifted window. Times change every
 * day and keep a minimum gap so the account never posts on a clockwork pattern.
 */
export function computeSlots(count: number, forDate = new Date()): Date[] {
  if (count <= 0) return [];
  const rng = mulberry32((dayKey(forDate) * 2654435761) >>> 0);
  // Slide the window a bit each day (e.g. 8–21 one day, 10–20 the next).
  const startHour = WINDOW.earliest + Math.floor(rng() * 3); // 8–10
  const endHour = WINDOW.latest - Math.floor(rng() * 3); // 20–22
  const startMin = startHour * 60 + Math.floor(rng() * 40);
  const endMin = endHour * 60 - 20;
  const span = Math.max(90, endMin - startMin);
  const minGap = count <= 2 ? 150 : count <= 5 ? 90 : 55;

  const knowledge = getKnowledgeContext();
  const preferred = knowledge.bestHours.filter((h) => h >= startHour && h < endHour);
  const picks: number[] = [];

  const tryAdd = (minuteOfDay: number): boolean => {
    const clamped = Math.min(endMin, Math.max(startMin, minuteOfDay));
    if (picks.some((p) => Math.abs(p - clamped) < minGap)) return false;
    picks.push(clamped);
    return true;
  };

  // Soft bias toward learned hours, then fill with random times.
  for (const hour of preferred) {
    if (picks.length >= count) break;
    const jitter = Math.floor(rng() * 70) - 20;
    tryAdd(hour * 60 + jitter);
  }
  let guard = 0;
  while (picks.length < count && guard++ < 80) {
    tryAdd(startMin + Math.floor(rng() * span));
  }
  // Last resort: even spread with leftover jitter so we still return `count`.
  if (picks.length < count) {
    for (let i = 0; i < count; i++) {
      const t = startMin + Math.round((span * (i + 0.3 + rng() * 0.4)) / Math.max(count, 1));
      if (!picks.some((p) => Math.abs(p - t) < minGap)) picks.push(t);
      if (picks.length >= count) break;
    }
  }

  return picks
    .slice(0, count)
    .sort((a, b) => a - b)
    .map((m) => atLocal(forDate, Math.floor(m / 60), m % 60));
}

/**
 * Warm-up ramp cap for today. RAMP_SCHEDULE is "day:cap" pairs (e.g.
 * "1:2,8:5,15:10"): from day 1 post 2/day, from day 8 post 5/day, from day 15
 * post 10/day. Day counting starts at RAMP_START_DATE; empty date = ramp off.
 */
/** Parse YYYY-MM-DD as a local calendar date (avoid UTC off-by-one). */
function parseLocalDate(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function rampCap(today = new Date()): number {
  if (!env.RAMP_START_DATE) return env.POSTS_PER_DAY;
  const start = parseLocalDate(env.RAMP_START_DATE) ?? new Date(env.RAMP_START_DATE);
  if (Number.isNaN(start.getTime())) return env.POSTS_PER_DAY;
  const todayLocal = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startLocal = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const dayNumber = Math.floor((todayLocal.getTime() - startLocal.getTime()) / 86_400_000) + 1;
  if (dayNumber < 1) return 0; // ramp hasn't started yet

  let cap = 0;
  for (const pair of env.RAMP_SCHEDULE.split(",")) {
    const [dayStr, capStr] = pair.split(":");
    const day = Number(dayStr);
    const value = Number(capStr);
    if (Number.isFinite(day) && Number.isFinite(value) && dayNumber >= day) {
      cap = value;
    }
  }
  return Math.min(cap || env.POSTS_PER_DAY, env.POSTS_PER_DAY);
}

/** The tightest daily cap: ramp, then platform hard caps, then POSTS_PER_DAY. */
export function effectiveDailyCap(): number {
  const platforms = configuredPlatforms();
  const platformCap = platforms.length ? Math.min(...platforms.map((p) => PLATFORM_DAILY_CAPS[p])) : env.POSTS_PER_DAY;
  return Math.min(env.POSTS_PER_DAY, platformCap, rampCap());
}

/**
 * Assign scheduled times to approved-but-unscheduled posts, respecting the
 * per-platform daily caps (counting posts already scheduled/published today).
 */
export function assignSchedule(): number {
  if (!env.AUTO_ASSIGN_SCHEDULE) return 0;
  const db = getDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const usedToday = db
    .select({ count: sql<number>`count(*)` })
    .from(posts)
    .where(
      and(
        sql`${posts.status} IN ('approved','published','draft_sent')`,
        gte(sql`COALESCE(${posts.scheduledAt}, ${posts.publishedAt})`, todayStart.toISOString()),
      ),
    )
    .get();

  const cap = effectiveDailyCap();
  const remaining = Math.max(0, cap - (usedToday?.count ?? 0));
  if (remaining === 0) return 0;

  const unscheduled = db
    .select()
    .from(posts)
    .where(and(eq(posts.status, "approved"), isNull(posts.scheduledAt)))
    .limit(remaining)
    .all();
  if (unscheduled.length === 0) return 0;

  const now = new Date();
  const slots = computeSlots(unscheduled.length).filter((s) => s.getTime() > now.getTime());
  // If we're late in the day and slots have passed, push remaining posts to tomorrow.
  while (slots.length < unscheduled.length) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const extra = computeSlots(unscheduled.length - slots.length, tomorrow);
    slots.push(...extra);
  }

  unscheduled.forEach((post, i) => {
    let slot = slots[i]!;

    // A/B experiment posts anchor to their partner: partner time + 24-36h.
    const partner = experimentPartner(post.id);
    if (partner) {
      const partnerRow = db.select().from(posts).where(eq(posts.id, partner.partnerId)).get();
      const anchor = partnerRow?.publishedAt ?? partnerRow?.scheduledAt;
      if (anchor) {
        const anchorTime = new Date(anchor).getTime();
        const abTime = anchorTime + AB_MIN_GAP_MS + Math.floor(Math.random() * AB_MAX_EXTRA_MS);
        slot = new Date(Math.max(abTime, now.getTime() + 60_000));
      }
    }

    db.update(posts)
      .set({ scheduledAt: slot.toISOString() })
      .where(eq(posts.id, post.id))
      .run();
  });
  return unscheduled.length;
}
