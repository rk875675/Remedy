/**
 * Nov 3 cadence cut. Safe to re-run.
 *
 *   npx tsx src/publish/_cut-cadence.ts           show what would change
 *   npx tsx src/publish/_cut-cadence.ts --apply   cancel the extras, then schedule the cross-posts
 *
 * TikTok @remedy.recoveries keeps 1 meme + 1 slideshow per day.
 * TikTok @remedy.stories keeps the meme only. Slideshows do not go to Stories.
 * Instagram @remedy.stories keeps its own grid (`assets/ig/stories`), not the Recoveries cross-post.
 * Facebook and YouTube @remedystories lose every future post.
 * YouTube @remedyrecoveries and the curated Instagram are left alone.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env, OUTPUT_DIR, ROOT_DIR } from "../config.js";
import { IG_DIR, IgCarouselsSchema, IgPlanSchema } from "../generation/ig-static.js";
import { loadMemePlans } from "../memes/week.js";
import { cancelZernioPost, loadZernioCache, publishToAccount, uploadMediaFile, zernioKeys, type ZernioKeySlot } from "./zernio.js";

const TZ = "America/Chicago";
const LEAD_MS = 10 * 60_000;
const GAP_MS = 45 * 60_000;
const CROSS_FILE = path.join(IG_DIR, "crossposted.json");

const PostSchema = z
  .object({
    _id: z.string(),
    status: z.string().optional(),
    scheduledFor: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    platforms: z
      .array(z.object({ accountId: z.union([z.string(), z.object({ _id: z.string() }).passthrough()]).optional(), status: z.string().optional() }).passthrough())
      .default([]),
  })
  .passthrough();

const ListSchema = z.object({ posts: z.array(PostSchema).default([]), pagination: z.object({ pages: z.number().optional() }).passthrough().optional() }).passthrough();

interface Row {
  id: string;
  slot: ZernioKeySlot;
  at: number;
  account: string;
  kind: "meme" | "slide" | "ig" | "cross" | "stories" | "other";
  text: string;
}

function chicagoDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: TZ });
}

function chicagoHour(ms: number): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return h + m / 60;
}

async function listScheduled(slot: ZernioKeySlot, key: string): Promise<z.infer<typeof PostSchema>[]> {
  const base = env.ZERNIO_BASE_URL.replace(/\/$/, "");
  const out: z.infer<typeof PostSchema>[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${base}/posts?status=scheduled&limit=100&page=${page}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`key ${slot} /posts -> ${res.status}`);
    const data = ListSchema.parse(await res.json());
    out.push(...data.posts);
    if (page >= (data.pagination?.pages ?? 1) || data.posts.length === 0) break;
  }
  return out;
}

function memeIds(): Set<string> {
  const ids = new Set<string>();
  for (const plan of loadMemePlans()) {
    for (const day of plan.days) for (const post of day.posts) for (const row of post.scheduled) if (row.zernioPostId) ids.add(row.zernioPostId);
  }
  return ids;
}

function storiesIds(): Set<string> {
  const file = path.join(IG_DIR, "stories", "posted.json");
  if (!fs.existsSync(file)) return new Set();
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, { zernioPostId?: string }>;
  return new Set(Object.values(raw).map((p) => p.zernioPostId).filter((id): id is string => Boolean(id)));
}

function igIds(): Set<string> {
  const raw = JSON.parse(fs.readFileSync(path.join(IG_DIR, "posted.json"), "utf8")) as Record<string, { zernioPostId?: string }>;
  return new Set(Object.values(raw).map((p) => p.zernioPostId).filter((id): id is string => Boolean(id)));
}

function paused(account: string): boolean {
  return account.startsWith("facebook:") || account === "youtube:remedystories";
}

function capped(account: string): boolean {
  return account === "tiktok:remedy.recoveries" || account === "tiktok:remedy.stories" || account === "instagram:remedy.stories";
}

function furthest(rows: Row[], anchor: number | null): Row {
  if (anchor === null) return rows.slice().sort((a, b) => a.at - b.at)[0]!;
  return rows.slice().sort((a, b) => Math.abs(b.at - anchor) - Math.abs(a.at - anchor))[0]!;
}

function decide(rows: Row[], now: number): { keep: Row[]; cancel: Row[] } {
  const keep: Row[] = [];
  const cancel: Row[] = [];
  const future = rows.filter((r) => r.at > now + LEAD_MS);
  const byAccount = new Map<string, Row[]>();
  for (const r of future) byAccount.set(r.account, [...(byAccount.get(r.account) ?? []), r]);
  for (const [account, list] of byAccount) {
    if (paused(account)) {
      cancel.push(...list);
      continue;
    }
    if (!capped(account)) {
      keep.push(...list);
      continue;
    }
    if (account === "instagram:remedy.stories") {
      keep.push(...list.filter((r) => r.kind === "stories"));
      cancel.push(...list.filter((r) => r.kind !== "stories"));
      continue;
    }
    const branded = list.filter((r) => r.kind === "cross" || r.kind === "ig");
    if (account.startsWith("tiktok:")) cancel.push(...branded);
    else keep.push(...branded);
    const schedulable = list.filter((r) => r.kind !== "cross" && r.kind !== "ig");
    const byDay = new Map<string, Row[]>();
    for (const r of schedulable) byDay.set(chicagoDay(r.at), [...(byDay.get(chicagoDay(r.at)) ?? []), r]);
    for (const [day, dayRows] of byDay) {
      const past = rows.filter((r) => r.account === account && chicagoDay(r.at) === day && r.at <= now);
      const memeAlready = past.some((r) => r.kind === "meme");
      const slideAlready = past.some((r) => r.kind === "slide");
      const memes = dayRows.filter((r) => r.kind === "meme");
      const slides = dayRows.filter((r) => r.kind === "slide");
      const rest = dayRows.filter((r) => r.kind !== "meme" && r.kind !== "slide");
      const keepMeme = account !== "instagram:remedy.stories";
      const keepSlide = account === "tiktok:remedy.recoveries";
      if (keepMeme && !memeAlready && memes.length) keep.push(furthest(memes, null));
      cancel.push(...memes.filter((r) => !keep.includes(r)));
      if (keepSlide && !slideAlready && slides.length) {
        const memeAt = keep.find((r) => r.account === account && r.kind === "meme" && chicagoDay(r.at) === day)?.at ?? null;
        keep.push(furthest(slides, memeAt));
      }
      cancel.push(...slides.filter((r) => !keep.includes(r)));
      cancel.push(...rest);
    }
  }
  return { keep, cancel };
}

interface CrossItem {
  id: string;
  at: string;
  caption: string;
  files: string[];
}

function crossItems(): CrossItem[] {
  const schedule = z.object({ tz: z.string(), items: z.array(z.object({ at: z.string(), kind: z.enum(["static", "carousel"]), id: z.string() }).strict()) }).strict().parse(
    JSON.parse(fs.readFileSync(path.join(IG_DIR, "schedule.json"), "utf8")),
  );
  const plan = IgPlanSchema.parse(JSON.parse(fs.readFileSync(path.join(IG_DIR, "plan.json"), "utf8")));
  const carousels = IgCarouselsSchema.parse(JSON.parse(fs.readFileSync(path.join(IG_DIR, "carousels.json"), "utf8")));
  const todayKey = chicagoDay(Date.now());
  const tomorrow = chicagoDay(Date.parse(`${todayKey}T18:00:00Z`) + 24 * 3_600_000);
  const byDay = new Map<string, typeof schedule.items>();
  for (const item of schedule.items) {
    const day = chicagoDay(Date.parse(item.at));
    if (day < tomorrow) continue;
    byDay.set(day, [...(byDay.get(day) ?? []), item]);
  }
  const out: CrossItem[] = [];
  for (const items of byDay.values()) {
    const ranked = items.slice().sort((a, b) => rank(a, plan) - rank(b, plan));
    const pick = ranked[0]!;
    if (pick.kind === "static") {
      const i = plan.posts.findIndex((p) => p.id === pick.id);
      const post = plan.posts[i];
      if (!post) throw new Error(`static ${pick.id} missing from plan`);
      const file = path.join(OUTPUT_DIR, "ig", `${String(i + 1).padStart(2, "0")}-${pick.id}.jpg`);
      out.push({ id: pick.id, at: pick.at, caption: post.caption, files: [file] });
    } else {
      const c = carousels.carousels.find((x) => x.id === pick.id);
      if (!c) throw new Error(`carousel ${pick.id} missing`);
      const files = c.slides.map((_, n) => path.join(OUTPUT_DIR, "ig", "c", pick.id, `slide-${n + 1}.jpg`));
      out.push({ id: pick.id, at: pick.at, caption: c.caption, files });
    }
  }
  return out;
}

function rank(item: { kind: string; id: string }, plan: z.infer<typeof IgPlanSchema>): number {
  if (item.kind === "carousel") return 1;
  const post = plan.posts.find((p) => p.id === item.id);
  return post?.kind === "still" ? 0 : 2;
}

function place(preferred: number, taken: number[], day: string): number {
  for (let extra = 0; extra <= 14 * 60; extra += 20) {
    for (const sign of extra === 0 ? [1] : [1, -1]) {
      const at = preferred + sign * extra * 60_000;
      if (chicagoDay(at) !== day) continue;
      const hour = chicagoHour(at);
      if (hour < 8 || hour > 21.5) continue;
      if (at < Date.now() + LEAD_MS) continue;
      if (taken.some((t) => Math.abs(t - at) < GAP_MS)) continue;
      return at;
    }
  }
  return preferred;
}

function readCross(): Record<string, Record<string, { zernioPostId: string; at: string }>> {
  if (!fs.existsSync(CROSS_FILE)) return {};
  return JSON.parse(fs.readFileSync(CROSS_FILE, "utf8")) as Record<string, Record<string, { zernioPostId: string; at: string }>>;
}

function markMemesCancelled(ids: Set<string>): number {
  let n = 0;
  const dir = path.join(ROOT_DIR, "assets", "memes", "weeks");
  for (const plan of loadMemePlans()) {
    let dirty = false;
    for (const day of plan.days) for (const post of day.posts) for (const row of post.scheduled) {
      if (row.zernioPostId && ids.has(row.zernioPostId) && row.status !== "cancelled") {
        row.status = "cancelled";
        dirty = true;
        n++;
      }
    }
    if (dirty) fs.writeFileSync(path.join(dir, `${plan.weekStart}.json`), `${JSON.stringify(plan, null, 2)}\n`);
  }
  return n;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const accounts = new Map((loadZernioCache()?.accounts ?? []).map((a) => [a.id, `${a.mapped}:${a.handle}`]));
  const memes = memeIds();
  const ig = igIds();
  const stories = storiesIds();
  const cross = new Set(Object.values(readCross()).flatMap((row) => Object.values(row).map((p) => p.zernioPostId)));
  const rows: Row[] = [];
  for (const { slot, key } of zernioKeys()) {
    for (const p of await listScheduled(slot, key)) {
      const acc = p.platforms[0]?.accountId;
      const accId = typeof acc === "string" ? acc : (acc?._id ?? "");
      const account = accounts.get(accId) ?? accId;
      const kind = memes.has(p._id) ? "meme" : stories.has(p._id) ? "stories" : cross.has(p._id) ? "cross" : ig.has(p._id) ? "ig" : "slide";
      rows.push({
        id: p._id,
        slot,
        at: Date.parse(p.scheduledFor ?? ""),
        account,
        kind,
        text: (p.title || p.content || "").replace(/\s+/g, " ").slice(0, 60),
      });
    }
  }

  const { keep, cancel } = decide(rows, Date.now());
  console.log(`cancel ${cancel.length}, keep ${keep.length}`);
  const by = new Map<string, number>();
  for (const r of cancel) by.set(r.account, (by.get(r.account) ?? 0) + 1);
  for (const [account, n] of [...by].sort()) console.log(`  cancel ${n.toString().padStart(3)}  ${account}`);

  console.log("\nInstagram @remedy.stories uses its own grid. Recoveries posts are not copied there.");

  if (!apply) {
    console.log("\nDry run. Pass --apply to cancel and schedule.");
    return;
  }
  for (const r of cancel) {
    await cancelZernioPost(r.id, r.slot);
    console.log(`cancelled ${r.account} ${chicagoDay(r.at)} ${r.kind} ${r.id}`);
  }
  const marked = markMemesCancelled(new Set(cancel.map((r) => r.id)));
  console.log(`meme plan rows marked cancelled: ${marked}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
