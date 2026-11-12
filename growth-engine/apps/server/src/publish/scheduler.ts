import { getDb, posts } from "@remedy-growth/db";
import { and, eq, isNull, gte, sql } from "drizzle-orm";
import { env, configuredPlatforms, PLATFORM_DAILY_CAPS, type Platform } from "../config.js";
import { parseVariation } from "../generation/variations.js";
import { experimentPartner } from "../learning/experiments.js";
import { pickTiktokIndex } from "../learning/playbook.js";

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
  d.setHours(hour, minute, Math.floor(Math.random() * 50), 0);
  return d;
}

function daySeed(forDate: Date, salt: number): number {
  return (Math.imul(dayKey(forDate), 2654435761 | 0) ^ salt) >>> 0;
}

function seededInt(forDate: Date, salt: number, min: number, max: number): number {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  return lo + Math.floor(mulberry32(daySeed(forDate, salt))() * (hi - lo + 1));
}

/** Today's post count per account (TikTok + YouTube). Same answer all day, different each day. */
export function dailyTarget(forDate = new Date()): number {
  return seededInt(forDate, 0x51ed, env.DAILY_POSTS_MIN, env.DAILY_POSTS_MAX);
}

/** How many of today's posts also go to the Instagram / Facebook feeds. Slideshows no longer use this: one post a day keeps TikTok and Instagram, and Facebook is paused. */
export function feedTarget(forDate = new Date()): number {
  return seededInt(forDate, 0xfeed, env.FEED_POSTS_MIN, env.FEED_POSTS_MAX);
}

/**
 * Pick `count` local times inside a day-shifted window. Gaps between posts
 * are random but never under the minimum, so the day never looks clockwork.
 */
export function computeSlots(count: number, forDate = new Date()): Date[] {
  if (count <= 0) return [];
  const rng = mulberry32(daySeed(forDate, 0));
  // Busy days use the full 8am–10pm window so the gaps stay wide.
  const wide = count >= 6;
  const startHour = wide ? WINDOW.earliest : WINDOW.earliest + Math.floor(rng() * 3);
  const endHour = wide ? WINDOW.latest : WINDOW.latest - Math.floor(rng() * 3);
  const startMin = startHour * 60 + Math.floor(rng() * 40);
  const endMin = endHour * 60 - 20;
  const span = Math.max(90, endMin - startMin);
  const desiredGap = count <= 3 ? 150 : count <= 5 ? 110 : 95;
  const minGap = Math.min(desiredGap, Math.floor((span / count) * 0.9));

  // Spread the leftover time randomly across the gaps.
  const slack = Math.max(0, span - (count - 1) * minGap);
  const weights = Array.from({ length: count + 1 }, () => 0.2 + rng());
  const total = weights.reduce((a, b) => a + b, 0);
  const picks: number[] = [];
  let t = startMin + (slack * weights[0]!) / total;
  for (let i = 0; i < count; i++) {
    if (i > 0) t += minGap + (slack * weights[i]!) / total;
    const m = Math.min(endMin, Math.round(t));
    picks.push(m % 5 === 0 ? m + 1 + Math.floor(rng() * 3) : m);
  }

  return picks.map((m) => atLocal(forDate, Math.floor(m / 60), m % 60));
}

/** `k` indices out of `n`, one from each even chunk, so feed posts spread across the day. */
function spreadPick(n: number, k: number, rng: () => number): Set<number> {
  if (k >= n) return new Set(Array.from({ length: n }, (_, i) => i));
  const picked = new Set<number>();
  for (let i = 0; i < k; i++) {
    const lo = Math.floor((i * n) / k);
    const hi = Math.floor(((i + 1) * n) / k);
    picked.add(lo + Math.floor(rng() * Math.max(1, hi - lo)));
  }
  return picked;
}

/** The day's one TikTok deck: the playbook's TikTok draw when the decks have sources, else a spread pick. */
function tiktokPick(postIds: number[], day: Date): Set<number> {
  const rng = mulberry32(daySeed(day, 0xf1ed));
  const best = postIds.length ? pickTiktokIndex(postIds, Math.floor(rng() * 2 ** 31)) : null;
  return best === null ? spreadPick(postIds.length, 1, rng) : new Set([best]);
}

const PLATFORM_SALT: Record<Platform, number> = { tiktok: 0, instagram: 11, facebook: 23, youtube: 37 };

/** Each platform goes out a few minutes after TikTok, never on the same minute. */
export function platformScheduledAt(iso: string | null, postId: number, platform: Platform): string | null {
  if (!iso || platform === "tiktok") return iso;
  const rng = mulberry32(Math.imul(postId, 977) + PLATFORM_SALT[platform]);
  const offsetMs = (4 + Math.floor(rng() * 22)) * 60_000 + Math.floor(rng() * 50) * 1000;
  return new Date(Date.parse(iso) + offsetMs).toISOString();
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

/** The tightest cap for a day: that day's random target, ramp, platform hard caps, POSTS_PER_DAY. */
export function effectiveDailyCap(forDate = new Date()): number {
  const platforms = configuredPlatforms();
  const platformCap = platforms.length ? Math.min(...platforms.map((p) => PLATFORM_DAILY_CAPS[p])) : env.POSTS_PER_DAY;
  return Math.min(env.POSTS_PER_DAY, platformCap, rampCap(forDate), dailyTarget(forDate));
}

export interface ScheduleAssignment {
  postId: number;
  scheduledAt: string;
  platforms: Platform[];
}

function isTwin(variation: unknown): boolean {
  return parseVariation(variation).zernioSlot === "2";
}

/**
 * Plan times for approved-but-unscheduled posts across the next `days` days.
 * Each day gets its own random count and its own Instagram/Facebook picks,
 * counting posts already scheduled or sent that day. Writes nothing.
 */
export function planSchedule(days = 1, now = new Date()): ScheduleAssignment[] {
  const db = getDb();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const booked = db
    .select()
    .from(posts)
    .where(
      and(
        sql`${posts.status} IN ('approved','published','draft_sent')`,
        gte(sql`COALESCE(${posts.scheduledAt}, ${posts.publishedAt})`, todayStart.toISOString()),
      ),
    )
    .all()
    .filter((p) => !isTwin(p.variation));

  const queue = db
    .select()
    .from(posts)
    .where(and(eq(posts.status, "approved"), isNull(posts.scheduledAt)))
    .all()
    .filter((p) => !isTwin(p.variation));

  const out: ScheduleAssignment[] = [];
  let next = 0;
  for (let d = 0; d < days && next < queue.length; d++) {
    const day = new Date(todayStart);
    day.setDate(day.getDate() + d);
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const onDay = booked.filter((p) => {
      const t = Date.parse(p.scheduledAt ?? p.publishedAt ?? "");
      return t >= day.getTime() && t < dayEnd.getTime();
    });
    const plannedOnDay = out.filter((a) => {
      const t = Date.parse(a.scheduledAt);
      return t >= day.getTime() && t < dayEnd.getTime();
    });
    const cap = effectiveDailyCap(day);
    const used = onDay.length + plannedOnDay.length;
    if (used >= cap) continue;

    const takenTimes = [
      ...onDay.map((p) => Date.parse(p.scheduledAt ?? p.publishedAt ?? "")),
      ...plannedOnDay.map((a) => Date.parse(a.scheduledAt)),
    ];
    const free = computeSlots(cap, day)
      .filter((s) => s.getTime() > now.getTime() + 10 * 60_000)
      .filter((s) => !takenTimes.some((t) => Math.abs(t - s.getTime()) < 45 * 60_000))
      .slice(0, cap - used);
    if (free.length === 0) continue;

    const batch = queue.slice(next, next + free.length);
    next += batch.length;
    const socialUsed =
      onDay.some((p) => ((p.platforms ?? []) as Platform[]).includes("tiktok")) ||
      plannedOnDay.some((a) => a.platforms.includes("tiktok"));
    const socialPicks = socialUsed ? new Set<number>() : tiktokPick(batch.map((p) => p.id), day);

    batch.forEach((post, i) => {
      let slot = free[i]!;
      // A/B experiment posts anchor to their partner: partner time + 24-36h.
      const partner = experimentPartner(post.id);
      if (partner) {
        const partnerRow = db.select().from(posts).where(eq(posts.id, partner.partnerId)).get();
        const anchor = partnerRow?.publishedAt ?? partnerRow?.scheduledAt;
        if (anchor) {
          const abTime = new Date(anchor).getTime() + AB_MIN_GAP_MS + Math.floor(Math.random() * AB_MAX_EXTRA_MS);
          slot = new Date(Math.max(abTime, now.getTime() + 60_000));
        }
      }
      const listed = (post.platforms ?? []) as Platform[];
      const platforms = listed.filter((p) => {
        if (p === "facebook") return false;
        if ((p === "tiktok" || p === "instagram") && !socialPicks.has(i)) return false;
        return true;
      });
      out.push({ postId: post.id, scheduledAt: slot.toISOString(), platforms });
    });
  }
  return out;
}

/**
 * Assign scheduled times to approved-but-unscheduled posts for the next `days`
 * days. Posts that skip the feeds lose Instagram/Facebook from their platforms.
 */
export function assignSchedule(days = 1): number {
  if (!env.AUTO_ASSIGN_SCHEDULE) return 0;
  const db = getDb();
  const plan = planSchedule(days);
  for (const a of plan) {
    db.update(posts)
      .set({ scheduledAt: a.scheduledAt, platforms: a.platforms })
      .where(eq(posts.id, a.postId))
      .run();
  }
  syncAccountTwinTimes();
  return plan.length;
}

/**
 * Stories does not receive slideshows. Twins stay in the database for the
 * experiment record, with no time and no platforms, so nothing hands them to Zernio.
 */
function syncAccountTwinTimes(): void {
  const db = getDb();
  const approved = db.select().from(posts).where(eq(posts.status, "approved")).all();
  for (const post of approved) {
    const variation = parseVariation(post.variation);
    if (variation.zernioSlot !== "2" || !variation.accountTwinOf) continue;
    const platforms = (post.platforms ?? []) as Platform[];
    if (!post.scheduledAt && platforms.length === 0) continue;
    db.update(posts).set({ scheduledAt: null, platforms: [] }).where(eq(posts.id, post.id)).run();
  }
}
