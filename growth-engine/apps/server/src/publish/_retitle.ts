/** Rewrite scheduled slideshow titles so they name the audience, not the scene. */
import { getDb, hooks, posts } from "@remedy-growth/db";
import { eq } from "drizzle-orm";
import { audienceFor } from "../generation/hooks.js";
import { zernioRefs, type PlatformPosts } from "./index.js";
import { fetchZernioPost, updateZernioTitle, type ZernioKeySlot } from "./zernio.js";

const apply = process.argv.includes("--apply");
const now = Date.now();
const db = getDb();
const rows = db
  .select()
  .from(posts)
  .all()
  .filter((p) => p.scheduledAt && Date.parse(p.scheduledAt) > now + 10 * 60_000);

const counts = new Map<string, number>();
const used = new Map<string, number>();
let changed = 0;
let checkedMedia = false;

const planned = rows
  .map((post) => {
    const hook = db.select().from(hooks).where(eq(hooks.id, post.hookId)).get();
    const hookText = hook?.text ?? post.tiktokTitle;
    const fromHook = audienceFor(hookText);
    const audience = fromHook.key === "fallback" ? audienceFor(`${hookText}\n${post.caption.slice(0, 280)}`) : fromHook;
    return { post, audience };
  })
  .sort((a, b) => a.post.id - b.post.id);

for (const { post, audience } of planned) {
  const slot = used.get(audience.key) ?? 0;
  used.set(audience.key, slot + 1);
  const next = audience.titles[slot % audience.titles.length]!;
  counts.set(next, (counts.get(next) ?? 0) + 1);
  if (!apply) {
    if (next === post.tiktokTitle) continue;
    changed++;
    console.log(`#${post.id}\n  ${post.tiktokTitle}\n  ${next}`);
    continue;
  }
  if (next === post.tiktokTitle) continue;
  changed++;
  db.update(posts).set({ tiktokTitle: next }).where(eq(posts.id, post.id)).run();
  const pp = (post.platformPosts ?? {}) as PlatformPosts;
  for (const [platform, rec] of Object.entries(pp)) {
    for (const ref of zernioRefs(rec)) {
      const title = platform === "youtube" && !/shorts/i.test(next) ? `${next} #Shorts` : next;
      const before = await fetchZernioPost(ref.publishId, ref.keySlot as ZernioKeySlot).catch((err: Error) => {
        if (err.message.includes("404")) return null;
        throw err;
      });
      if (!before || before.status === "published") continue;
      const mediaBefore = (before as { mediaItems?: unknown[] }).mediaItems?.length ?? -1;
      await updateZernioTitle(ref.publishId, title, ref.keySlot as ZernioKeySlot);
      if (!checkedMedia) {
        const after = await fetchZernioPost(ref.publishId, ref.keySlot as ZernioKeySlot);
        const mediaAfter = (after as { mediaItems?: unknown[] }).mediaItems?.length ?? -1;
        const newTitle = (after as { title?: string }).title ?? "";
        if (mediaBefore > 0 && mediaAfter !== mediaBefore) {
          throw new Error(`title update dropped media on ${ref.publishId} (${mediaBefore} -> ${mediaAfter})`);
        }
        console.log(`checked ${ref.publishId}: media ${mediaBefore} -> ${mediaAfter}, title "${newTitle}"`);
        checkedMedia = true;
      }
    }
  }
}

console.log(`\n${changed} of ${rows.length} titles change`);
for (const [title, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${n.toString().padStart(3)}  ${title}`);
if (!apply) console.log("\nDry run. Pass --apply to update the database and Zernio.");
