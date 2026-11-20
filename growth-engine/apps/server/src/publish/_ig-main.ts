/**
 * Schedules the curated @remedyrecoveries Instagram feed on Zernio from
 * assets/ig/schedule.json. Renders come from `_ig-statics.ts` (output/ig/).
 * Zernio post ids are kept in assets/ig/posted.json so --apply is safe to re-run.
 *
 *   npx tsx src/publish/_ig-main.ts --plan          check every item (files, captions, times, account)
 *   npx tsx src/publish/_ig-main.ts --apply         upload + schedule everything not yet scheduled
 *   npx tsx src/publish/_ig-main.ts --status        Zernio status of every scheduled item
 *   npx tsx src/publish/_ig-main.ts --cancel <id>   remove one scheduled item (static or carousel id)
 *   npx tsx src/publish/_ig-main.ts --page          rebuild apps/web/public/ig/ (the schedule preview page, @remedy.stories included)
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { OUTPUT_DIR, ROOT_DIR } from "../config.js";
import { IG_DIR, IgCarouselsSchema, IgPlanSchema, renderGridPreview } from "../generation/ig-static.js";
import { STORIES_DIR, StoriesPlanSchema } from "../generation/ig-stories.js";
import { cancelZernioPost, fetchZernioPost, loadZernioCache, publishToAccount, uploadMediaFile } from "./zernio.js";

const HANDLE = "remedyrecoveries";
const MIN_LEAD_MS = 10 * 60_000;

const ScheduleSchema = z
  .object({
    tz: z.string(),
    items: z.array(
      z.object({ at: z.string().datetime({ offset: true }), kind: z.enum(["static", "carousel"]), id: z.string().min(1) }).strict(),
    ),
  })
  .strict();

const PostedSchema = z.record(
  z.string(),
  z.object({ zernioPostId: z.string(), at: z.string(), kind: z.enum(["static", "carousel"]), scheduledOn: z.string() }).strict(),
);
type Posted = z.infer<typeof PostedSchema>;

const POSTED_FILE = path.join(IG_DIR, "posted.json");

function readPosted(): Posted {
  if (!fs.existsSync(POSTED_FILE)) return {};
  return PostedSchema.parse(JSON.parse(fs.readFileSync(POSTED_FILE, "utf8")));
}

function writePosted(p: Posted): void {
  fs.writeFileSync(POSTED_FILE, JSON.stringify(p, null, 2) + "\n");
}

interface Item {
  at: string;
  kind: "static" | "carousel";
  id: string;
  files: string[];
  caption: string;
  founder: boolean;
}

function resolveItems(): Item[] {
  const schedule = ScheduleSchema.parse(JSON.parse(fs.readFileSync(path.join(IG_DIR, "schedule.json"), "utf8")));
  const plan = IgPlanSchema.parse(JSON.parse(fs.readFileSync(path.join(IG_DIR, "plan.json"), "utf8")));
  const carousels = IgCarouselsSchema.parse(JSON.parse(fs.readFileSync(path.join(IG_DIR, "carousels.json"), "utf8")));
  const out = path.join(OUTPUT_DIR, "ig");

  const seen = new Set<string>();
  const items = schedule.items.map((s): Item => {
    if (seen.has(s.id)) throw new Error(`${s.id} is scheduled twice`);
    seen.add(s.id);
    if (s.kind === "static") {
      const i = plan.posts.findIndex((p) => p.id === s.id);
      if (i < 0) throw new Error(`static ${s.id} is not in plan.json`);
      const file = path.join(out, `${String(i + 1).padStart(2, "0")}-${s.id}.jpg`);
      return { ...s, files: [file], caption: plan.posts[i]!.caption, founder: false };
    }
    const c = carousels.carousels.find((x) => x.id === s.id);
    if (!c) throw new Error(`carousel ${s.id} is not in carousels.json`);
    const files = c.slides.map((_, n) => path.join(out, "c", s.id, `slide-${n + 1}.jpg`));
    const founder = c.slides.some((x) => x.kind === "still" && Boolean(x.shot?.person?.startsWith("rahul")));
    return { ...s, files, caption: c.caption, founder };
  });
  for (const it of items) for (const f of it.files) if (!fs.existsSync(f)) throw new Error(`${it.id}: missing render ${f} (run _ig-statics.ts)`);
  return items.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function renderHash(files: string[]): string {
  const h = createHash("sha1");
  for (const f of files) h.update(fs.readFileSync(f));
  return h.digest("hex").slice(0, 10);
}

function account() {
  const acct = loadZernioCache()?.accounts.find((a) => a.mapped === "instagram" && a.handle.toLowerCase() === HANDLE);
  if (!acct) throw new Error(`@${HANDLE} Instagram is not in the Zernio cache — refresh accounts first.`);
  if (acct.status !== "connected") throw new Error(`@${HANDLE} is ${acct.status} in Zernio.`);
  return acct;
}

function local(at: string, tz: string): string {
  return new Date(at).toLocaleString("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const StoriesScheduleSchema = z
  .object({ tz: z.string(), items: z.array(z.object({ at: z.string().datetime({ offset: true }), id: z.string().min(1) }).strict()) })
  .strict();
const StoriesPostedSchema = z.record(z.string(), z.object({ zernioPostId: z.string(), at: z.string() }).strict());

async function storiesSection(web: string, v: number, tz: string): Promise<string> {
  const read = (f: string): unknown => JSON.parse(fs.readFileSync(path.join(STORIES_DIR, f), "utf8"));
  const plan = StoriesPlanSchema.parse(read("plan.json"));
  const schedule = StoriesScheduleSchema.parse(read("schedule.json"));
  const posted = fs.existsSync(path.join(STORIES_DIR, "posted.json")) ? StoriesPostedSchema.parse(read("posted.json")) : {};
  const dir = path.join(web, "stories");
  fs.mkdirSync(dir, { recursive: true });
  const rows: string[] = [];
  for (const item of [...schedule.items].sort((a, b) => Date.parse(a.at) - Date.parse(b.at))) {
    const post = plan.posts.find((p) => p.id === item.id);
    if (!post) throw new Error(`${item.id} is not in the Stories plan`);
    const src = path.join(OUTPUT_DIR, "ig-stories", `${item.id}.jpg`);
    if (!fs.existsSync(src)) throw new Error(`${item.id}: missing render ${src} (run _ig-stories.ts --plan)`);
    await sharp(src).resize(720).jpeg({ quality: 82 }).toFile(path.join(dir, `${item.id}.jpg`));
    rows.push(
      `<article><div class="meta"><b>${local(item.at, tz)}</b> <i>${posted[item.id] ? "scheduled" : "not scheduled"}</i></div>` +
        `<div class="one"><img src="stories/${item.id}.jpg?v=${v}" loading="lazy"></div>` +
        `<p>${esc(post.caption).replace(/\n/g, "<br>")}</p></article>`,
    );
  }
  return `<h1 id="stories">@remedy.stories</h1><p>${rows.length} posts, all times Central.</p>${rows.join("")}`;
}

async function buildPage(items: Item[], posted: Posted, tz: string): Promise<void> {
  const web = path.join(ROOT_DIR, "apps", "web", "public", "ig");
  fs.mkdirSync(web, { recursive: true });
  for (const e of fs.readdirSync(web)) fs.rmSync(path.join(web, e), { recursive: true, force: true });
  const v = Date.now();
  const small = (src: string, dst: string) => sharp(src).resize(720).jpeg({ quality: 82 }).toFile(dst);

  const covers = items.map((it) => it.files[0]!);
  await renderGridPreview([...covers].reverse(), path.join(web, "grid.jpg"));

  const days = new Map<string, Item[]>();
  for (const it of items) {
    const day = new Date(it.at).toLocaleDateString("en-US", { timeZone: tz, weekday: "long", month: "short", day: "numeric" });
    days.set(day, [...(days.get(day) ?? []), it]);
  }

  const sections: string[] = [];
  for (const [day, list] of days) {
    const rows: string[] = [];
    for (const it of list) {
      const dir = path.join(web, it.id);
      fs.mkdirSync(dir, { recursive: true });
      const imgs: string[] = [];
      for (const [n, f] of it.files.entries()) {
        await small(f, path.join(dir, `${n + 1}.jpg`));
        imgs.push(`<img src="${it.id}/${n + 1}.jpg?v=${v}" loading="lazy">`);
      }
      const time = new Date(it.at).toLocaleTimeString("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
      const label = it.kind === "static" ? "Static" : `Carousel, ${it.files.length} slides${it.founder ? ", founder" : ""}`;
      const status = posted[it.id] ? "scheduled" : "not scheduled";
      rows.push(
        `<article><div class="meta"><b>${time}</b> <span>${label}</span> <i>${status}</i></div>` +
          `<div class="${it.kind === "static" ? "one" : "strip"}">${imgs.join("")}</div>` +
          `<p>${esc(it.caption).replace(/\n/g, "<br>")}</p></article>`,
      );
    }
    sections.push(`<h2>${day} <small>${list.length} posts</small></h2>${rows.join("")}`);
  }

  const statics = items.filter((i) => i.kind === "static").length;
  const stories = await storiesSection(web, v, tz);
  const day = (at: string) => new Date(at).toLocaleDateString("en-US", { timeZone: tz, month: "short", day: "numeric" });
  const first = day(items[0]!.at);
  const last = day(items[items.length - 1]!.at);
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Instagram schedule</title>
<style>body{font:15px -apple-system,Segoe UI,sans-serif;max-width:620px;margin:0 auto;padding:16px;background:#FAF7F4;color:#1C1C1E}
img{display:block;border-radius:4px}h1{font-size:21px;margin:8px 0 4px}h2{font-size:17px;margin:36px 0 10px;border-top:1px solid #e5ded6;padding-top:16px}h2 small{font-weight:400;color:#888}
.grid{width:100%}article{margin:0 0 26px}.meta{margin:0 0 8px;color:#444}.meta span{margin-left:6px}.meta i{float:right;color:#2F5440;font-style:normal;font-size:13px}
.one img{width:100%}.strip{display:flex;gap:6px;overflow-x:auto;scroll-snap-type:x mandatory}.strip img{width:78%;flex:none;scroll-snap-align:start}
p{color:#444;margin:8px 2px}details{margin:14px 0}</style>
<h1>@remedyrecoveries, ${first} to ${last}</h1>
<p>${items.length} posts: ${statics} statics (one a day) and ${items.length - statics} carousels, all times Central. Scheduled on Zernio; nothing needs to be posted by hand. The three pinned posts stay on top. <a href="#stories">@remedy.stories is below.</a></p>
<details open><summary>Grid on ${last} (newest top-left, below the pins)</summary><img class="grid" src="grid.jpg?v=${v}"></details>
${sections.join("\n")}
${stories}`;
  fs.writeFileSync(path.join(web, "index.html"), html, "utf8");
  console.log(`wrote ${web} (${items.length} items)`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const items = resolveItems();
  const posted = readPosted();
  const tz = "America/Chicago";

  if (args.includes("--page")) {
    await buildPage(items, posted, tz);
    return;
  }

  const acct = account();

  if (args.includes("--cancel")) {
    const id = args[args.indexOf("--cancel") + 1];
    const rec = id ? posted[id] : undefined;
    if (!id || !rec) throw new Error(`Nothing scheduled for ${id ?? "(no id)"}`);
    await cancelZernioPost(rec.zernioPostId, acct.keySlot);
    delete posted[id];
    writePosted(posted);
    console.log(`cancelled ${id} (${rec.zernioPostId})`);
    return;
  }

  if (args.includes("--status")) {
    for (const it of items) {
      const rec = posted[it.id];
      if (!rec) {
        console.log(`${local(it.at, tz).padEnd(24)} ${it.id.padEnd(22)} not scheduled`);
        continue;
      }
      const p = await fetchZernioPost(rec.zernioPostId, acct.keySlot);
      const child = p.platforms[0];
      console.log(`${local(it.at, tz).padEnd(24)} ${it.id.padEnd(22)} ${child?.status ?? p.status}${child?.errorMessage ? ` — ${child.errorMessage}` : ""}`);
    }
    return;
  }

  const apply = args.includes("--apply");
  console.log(`@${acct.handle} (${acct.id}, key slot ${acct.keySlot}) — ${items.length} items\n`);
  for (const it of items) {
    const tag = `${local(it.at, tz).padEnd(24)} ${it.kind.padEnd(9)} ${it.id.padEnd(22)} ${String(it.files.length).padStart(2)} img`;
    if (posted[it.id]) {
      console.log(`${tag}  already scheduled (${posted[it.id]!.zernioPostId})`);
      continue;
    }
    if (Date.parse(it.at) < Date.now() + MIN_LEAD_MS) {
      console.log(`${tag}  SKIP: time has passed`);
      continue;
    }
    if (!apply) {
      console.log(tag);
      continue;
    }
    const urls: string[] = [];
    for (const f of it.files) urls.push(await uploadMediaFile(f, acct.keySlot));
    const res = await publishToAccount({
      platform: "instagram",
      accountId: acct.id,
      title: it.caption.split("\n")[0]!.slice(0, 120),
      caption: it.caption,
      mediaUrls: urls,
      mediaKind: "images",
      mode: "live",
      scheduledAt: it.at,
      idempotencyKey: `ig-main-${it.id}-${renderHash(it.files)}`,
    });
    if (res.status === "failed") throw new Error(`${it.id}: ${res.error}`);
    posted[it.id] = { zernioPostId: res.zernioPostId, at: it.at, kind: it.kind, scheduledOn: new Date().toISOString() };
    writePosted(posted);
    console.log(`${tag}  scheduled ${res.zernioPostId} (${res.status})`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
