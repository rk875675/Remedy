/**
 * Instagram @remedy.stories grid. Does not touch TikTok.
 *
 *   npx tsx src/publish/_ig-stories.ts --plan     render and print the schedule
 *   npx tsx src/publish/_ig-stories.ts --apply    upload and schedule what is not up yet
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { OUTPUT_DIR } from "../config.js";
import { renderStoriesPost, STORIES_DIR, StoriesPlanSchema } from "../generation/ig-stories.js";
import { accountGroup, loadZernioCache, publishToAccount, uploadMediaFile } from "./zernio.js";

const MIN_LEAD_MS = 10 * 60_000;
const OUT = path.join(OUTPUT_DIR, "ig-stories");
const POSTED_FILE = path.join(STORIES_DIR, "posted.json");

const ScheduleSchema = z
  .object({
    tz: z.string(),
    items: z.array(z.object({ at: z.string().datetime({ offset: true }), id: z.string().min(1) }).strict()),
  })
  .strict();
const PostedSchema = z.record(z.string(), z.object({ zernioPostId: z.string(), at: z.string() }).strict());

function readPosted(): z.infer<typeof PostedSchema> {
  if (!fs.existsSync(POSTED_FILE)) return {};
  return PostedSchema.parse(JSON.parse(fs.readFileSync(POSTED_FILE, "utf8")));
}

function account() {
  const acct = loadZernioCache()?.accounts.find((a) => a.mapped === "instagram" && accountGroup(a) === "2");
  if (!acct) throw new Error("Instagram @remedy.stories is not in the Zernio cache.");
  if (acct.status !== "connected") throw new Error(`@${acct.handle} is ${acct.status} in Zernio.`);
  return acct;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const plan = StoriesPlanSchema.parse(JSON.parse(fs.readFileSync(path.join(STORIES_DIR, "plan.json"), "utf8")));
  const schedule = ScheduleSchema.parse(JSON.parse(fs.readFileSync(path.join(STORIES_DIR, "schedule.json"), "utf8")));
  const byId = new Map(plan.posts.map((p) => [p.id, p]));
  fs.mkdirSync(OUT, { recursive: true });
  const posted = readPosted();
  const files = new Map<string, string>();
  for (const item of schedule.items) {
    const post = byId.get(item.id);
    if (!post) throw new Error(`${item.id} is not in the Stories plan`);
    const file = path.join(OUT, `${item.id}.jpg`);
    fs.writeFileSync(file, await renderStoriesPost(post));
    files.set(item.id, file);
  }
  console.log(`rendered ${files.size} to ${OUT}`);

  const acct = account();
  console.log(`@${acct.handle} (${acct.id})\n`);
  for (const item of schedule.items) {
    const post = byId.get(item.id)!;
    const file = files.get(item.id)!;
    const when = new Date(item.at).toLocaleString("en-US", { timeZone: schedule.tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const tag = `${when.padEnd(28)} ${item.id.padEnd(16)} ${post.line}`;
    if (posted[item.id]) {
      console.log(`${tag}  already scheduled`);
      continue;
    }
    if (Date.parse(item.at) < Date.now() + MIN_LEAD_MS) {
      console.log(`${tag}  SKIP: time has passed`);
      continue;
    }
    if (!apply) {
      console.log(tag);
      continue;
    }
    const hash = createHash("sha1").update(fs.readFileSync(file)).digest("hex").slice(0, 10);
    const url = await uploadMediaFile(file, acct.keySlot);
    const res = await publishToAccount({
      platform: "instagram",
      accountId: acct.id,
      title: post.line.slice(0, 120),
      caption: post.caption,
      mediaUrls: [url],
      mediaKind: "images",
      mode: "live",
      scheduledAt: item.at,
      idempotencyKey: `ig-stories-${item.id}-${hash}`,
    });
    if (res.status === "failed") throw new Error(`${item.id}: ${res.error}`);
    posted[item.id] = { zernioPostId: res.zernioPostId, at: item.at };
    fs.writeFileSync(POSTED_FILE, `${JSON.stringify(posted, null, 2)}\n`);
    console.log(`${tag}  scheduled ${res.zernioPostId}`);
  }
  if (!apply) console.log("\nDry run. Pass --apply to schedule on Instagram only.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
