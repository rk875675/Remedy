/**
 * @remedyrecoveries Instagram goes curated (Nov 1). Lists every Instagram post the
 * engine made for that handle, split into live and still scheduled, and pulls the
 * Instagram links of the live ones so they can be archived in the app.
 *
 *   npx tsx src/publish/_ig-curate.ts --plan
 *   npx tsx src/publish/_ig-curate.ts --apply     delete only the Instagram leg of the
 *                                                 scheduled ones (TikTok / YouTube / Facebook
 *                                                 stay); backs up to output/ig-curate/
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb, posts, slides } from "@remedy-growth/db";
import { OUTPUT_DIR } from "../config.js";
import { cancelZernioPost, fetchZernioPost, type ZernioKeySlot } from "./zernio.js";

const HANDLE = "remedyrecoveries";
const OUT = path.join(OUTPUT_DIR, "ig-curate");

interface IgRecord {
  publishId?: string;
  keySlot?: ZernioKeySlot;
  accountHandle?: string;
  status?: string;
  id?: string;
  url?: string;
}

interface Row {
  postId: number;
  at: string;
  cover: string;
  headline: string;
  ig: IgRecord;
  zernioStatus: string;
  url: string;
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  fs.mkdirSync(OUT, { recursive: true });
  const db = getDb();
  const now = Date.now();
  const rows: Row[] = [];

  for (const p of db.select().from(posts).all()) {
    const pp = (p.platformPosts ?? {}) as Record<string, IgRecord>;
    const ig = pp.instagram;
    if (!ig || (ig.accountHandle ?? HANDLE) !== HANDLE) continue;
    const first = db.select().from(slides).where(eq(slides.postId, p.id)).all().sort((a, b) => a.idx - b.idx)[0];
    let zernioStatus = "";
    let url = ig.url ?? "";
    if (ig.publishId) {
      try {
        const z = await fetchZernioPost(ig.publishId, ig.keySlot);
        zernioStatus = z.status;
        const child = z.platforms.find((c) => (c.platform ?? "").toLowerCase().includes("instagram"));
        url = child?.platformPostUrl ?? url;
        if (child?.status) zernioStatus = child.status;
      } catch (e) {
        zernioStatus = `error: ${(e as Error).message.slice(0, 80)}`;
      }
    }
    rows.push({
      postId: p.id,
      at: p.scheduledAt ?? p.publishedAt ?? "",
      cover: first?.filePath ?? "",
      headline: first?.headline ?? "",
      ig,
      zernioStatus,
      url,
    });
  }

  rows.sort((a, b) => b.at.localeCompare(a.at));
  const isLive = (r: Row) => r.zernioStatus === "published" || (Date.parse(r.at) <= now && !/scheduled|pending/i.test(r.zernioStatus));
  const live = rows.filter(isLive);
  const scheduled = rows.filter((r) => !isLive(r));

  console.log(`@${HANDLE} Instagram: ${live.length} live, ${scheduled.length} scheduled`);
  for (const r of scheduled) console.log(`  scheduled #${r.postId} ${r.at.slice(0, 16)} [${r.zernioStatus}] ${r.headline.slice(0, 60)}`);

  fs.writeFileSync(path.join(OUT, "live.json"), JSON.stringify(live, null, 1));
  fs.writeFileSync(path.join(OUT, "scheduled.json"), JSON.stringify(scheduled, null, 1));
  await contactSheet(live, path.join(OUT, "live-newest-first.jpg"));
  if (scheduled.length) await contactSheet(scheduled, path.join(OUT, "scheduled.jpg"));
  fs.writeFileSync(
    path.join(OUT, "archive-checklist.html"),
    checklistHtml(live),
  );

  if (!apply) return;
  const backup = path.join(OUT, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  fs.writeFileSync(backup, JSON.stringify(scheduled, null, 1));
  for (const r of scheduled) {
    if (!r.ig.publishId) continue;
    if (Date.parse(r.at) - now < 10 * 60_000) {
      console.log(`  skip #${r.postId}: goes live within 10 min`);
      continue;
    }
    await cancelZernioPost(r.ig.publishId, r.ig.keySlot);
    const row = db.select().from(posts).where(eq(posts.id, r.postId)).get();
    if (!row) continue;
    const pp = { ...((row.platformPosts ?? {}) as Record<string, unknown>) };
    delete pp.instagram;
    const platforms = ((row.platforms ?? []) as string[]).filter((p) => p !== "instagram");
    db.update(posts).set({ platformPosts: pp, platforms }).where(eq(posts.id, r.postId)).run();
    console.log(`  removed Instagram leg of #${r.postId}`);
  }
  console.log(`backup: ${backup}`);
}

async function contactSheet(list: Row[], file: string): Promise<void> {
  const W = 216, H = 270, cols = 6;
  const rowsN = Math.ceil(list.length / cols);
  const comps: sharp.OverlayOptions[] = [];
  for (let i = 0; i < list.length; i++) {
    const r = list[i]!;
    const left = (i % cols) * W, top = Math.floor(i / cols) * H;
    if (r.cover && fs.existsSync(r.cover)) comps.push({ input: await sharp(r.cover).resize(W, H, { fit: "cover" }).toBuffer(), left, top });
    const label = `${i + 1} · #${r.postId} · ${r.at.slice(5, 10)}`;
    comps.push({
      input: Buffer.from(`<svg width="${W}" height="28"><rect width="${W}" height="28" fill="black" opacity="0.8"/><text x="6" y="20" font-size="17" font-family="Arial" fill="#ffd400">${label}</text></svg>`),
      left,
      top,
    });
  }
  await sharp({ create: { width: W * cols, height: Math.max(1, rowsN) * H, channels: 3, background: "#1a1a1a" } })
    .composite(comps)
    .jpeg({ quality: 82 })
    .toFile(file);
}

function checklistHtml(live: Row[]): string {
  const items = live
    .map((r, i) => {
      const link = r.url ? `<a href="${r.url}">${r.url}</a>` : "(no link; find it by date on the grid)";
      return `<li><label><input type="checkbox"> ${i + 1}. ${r.at.slice(0, 10)} · #${r.postId} · ${r.headline.replace(/</g, "&lt;").slice(0, 70)}</label><br>${link}</li>`;
    })
    .join("\n");
  return `<!doctype html><meta name="viewport" content="width=device-width"><title>Archive @${HANDLE}</title>
<style>body{font:15px -apple-system,Segoe UI,sans-serif;max-width:640px;margin:24px auto;padding:0 12px}li{margin:0 0 14px}a{word-break:break-all}</style>
<h1>Archive @${HANDLE}</h1><p>${live.length} posts, newest first. Open each, ••• → Archive.</p><ol style="list-style:none;padding:0">${items}</ol>`;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
