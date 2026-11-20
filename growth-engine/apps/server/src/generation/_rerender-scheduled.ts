/**
 * Re-render every already-scheduled character post (Recoveries A and Stories B) with the
 * current renderer, from its saved deck source, and swap the media on its Zernio posts in
 * place. Same photos, same hook, caption, title, time, CTA option and experiment link; only
 * the slide images (and the YouTube Short built from them) change.
 *
 *   npx tsx src/generation/_rerender-scheduled.ts --plan                 list what would change, write nothing
 *   npx tsx src/generation/_rerender-scheduled.ts --preview [ids]        render to output/rerender/preview only
 *   npx tsx src/generation/_rerender-scheduled.ts --apply [ids|all]      back up, re-render, swap, verify
 *   npx tsx src/generation/_rerender-scheduled.ts --rollback <ids>       restore the backed-up originals
 *
 * Skips posts that go live within 3 hours, posts with any platform already live, posts whose
 * CTA is not a locked review option, and posts already re-rendered at this SLIDE_REV.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb, posts, slides } from "@remedy-growth/db";
import { OUTPUT_DIR, type Platform } from "../config.js";
import { SLIDE_REV, postOutputDir } from "./composer.js";
import { DeckSchema, loadDeckSource, renderDeckSlides, saveDeckSource, type Deck } from "./character-deck.js";
import { CTA_REVIEW_OPTIONS } from "./hooks.js";
import { parseVariation } from "./variations.js";
import { reskinScheduledPost } from "../publish/reskin.js";
import { zernioRefs, type PlatformPosts } from "../publish/index.js";
import { fetchZernioPost, replaceZernioPost, type ZernioKeySlot } from "../publish/zernio.js";
import { uploadSlides } from "../publish/r2.js";

const ROOT = path.join(OUTPUT_DIR, "rerender");
const MIN_LEAD_MS = 3 * 60 * 60_000;

type PostRow = typeof posts.$inferSelect;
interface Remote {
  platform: Platform;
  publishId: string;
  keySlot: ZernioKeySlot;
  post: Record<string, unknown>;
}
interface Plan {
  post: PostRow;
  deck: Deck;
  look: "A" | "B";
  cta: (typeof CTA_REVIEW_OPTIONS)[number];
}

function log(line: Record<string, unknown>): void {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.appendFileSync(path.join(ROOT, "log.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), rev: SLIDE_REV, ...line })}\n`);
}

function doneIds(): Set<number> {
  const file = path.join(ROOT, "log.jsonl");
  if (!fs.existsSync(file)) return new Set();
  const out = new Set<number>();
  for (const line of fs.readFileSync(file, "utf8").split("\n").filter(Boolean)) {
    const row = JSON.parse(line) as { event?: string; postId?: number; rev?: string };
    if (row.rev !== SLIDE_REV || typeof row.postId !== "number") continue;
    if (row.event === "rerendered") out.add(row.postId);
    if (row.event === "rolled_back") out.delete(row.postId);
  }
  return out;
}

function plan(ids: number[] | null): { plans: Plan[]; skipped: string[] } {
  const db = getDb();
  const done = doneIds();
  const rows = db.select().from(posts).all().filter((p) => (ids ? ids.includes(p.id) : true));
  const plans: Plan[] = [];
  const skipped: string[] = [];
  for (const post of rows) {
    const v = parseVariation(post.variation);
    if (!v.characterId || post.status !== "published") continue;
    if (!post.scheduledAt || Date.parse(post.scheduledAt) < Date.now() - 60_000) continue; // already went out
    if (Date.parse(post.scheduledAt) < Date.now() + MIN_LEAD_MS) {
      skipped.push(`#${post.id} goes live within 3h (${post.scheduledAt})`);
      continue;
    }
    if (done.has(post.id)) {
      skipped.push(`#${post.id} already re-rendered at ${SLIDE_REV}`);
      continue;
    }
    const deck = loadDeckSource(post.id);
    if (!deck) {
      skipped.push(`#${post.id} has no deck source`);
      continue;
    }
    const cta = CTA_REVIEW_OPTIONS.find((o) => o.layout === v.ctaLayout && o.atmosphere === v.ctaAtmosphere);
    if (!cta) {
      skipped.push(`#${post.id} CTA ${v.ctaLayout}/${v.ctaAtmosphere} is not a locked review option`);
      continue;
    }
    plans.push({ post, deck, look: v.accountTwinOf != null ? "B" : "A", cta });
  }
  plans.sort((a, b) => Date.parse(a.post.scheduledAt!) - Date.parse(b.post.scheduledAt!));
  return { plans, skipped };
}

async function fetchRemotes(post: PostRow): Promise<Remote[]> {
  const out: Remote[] = [];
  const pp = (post.platformPosts ?? {}) as PlatformPosts;
  for (const [platform, rec] of Object.entries(pp) as [Platform, PlatformPosts[Platform]][]) {
    if (!rec) continue;
    for (const ref of zernioRefs(rec)) {
      out.push({ platform, publishId: ref.publishId, keySlot: ref.keySlot as ZernioKeySlot, post: (await fetchZernioPost(ref.publishId, ref.keySlot)) as Record<string, unknown> });
    }
  }
  return out;
}

const backupDir = (id: number): string => path.join(ROOT, "backup", String(id));

async function backup(post: PostRow, remotes: Remote[]): Promise<void> {
  const dir = backupDir(post.id);
  if (fs.existsSync(path.join(dir, "done.json"))) return; // never overwrite a finished backup
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, "files"), { recursive: true });
  const src = postOutputDir(post.id);
  if (fs.existsSync(src)) {
    for (const f of fs.readdirSync(src)) {
      const full = path.join(src, f);
      if (fs.statSync(full).isFile()) fs.copyFileSync(full, path.join(dir, "files", f));
    }
  }
  fs.writeFileSync(path.join(dir, "slides.json"), JSON.stringify(getDb().select().from(slides).where(eq(slides.postId, post.id)).all(), null, 2));
  const deck = loadDeckSource(post.id);
  if (deck) fs.writeFileSync(path.join(dir, "deck.json"), JSON.stringify(deck, null, 2));
  fs.writeFileSync(path.join(dir, "remote.json"), JSON.stringify(remotes, null, 2));
  fs.writeFileSync(path.join(dir, "done.json"), JSON.stringify({ at: new Date().toISOString() }));
}

async function verify(post: PostRow, expectImages: number, before: Remote[]): Promise<string[]> {
  const issues: string[] = [];
  for (const old of before) {
    const now = (await fetchZernioPost(old.publishId, old.keySlot)) as Record<string, unknown>;
    const items = (now.mediaItems ?? []) as unknown[];
    const want = old.platform === "youtube" ? 1 : expectImages;
    if (items.length !== want) issues.push(`#${post.id} ${old.platform}: ${items.length} media items, expected ${want}`);
    if (now.scheduledFor !== old.post.scheduledFor) issues.push(`#${post.id} ${old.platform}: time changed`);
    if (now.title !== old.post.title) issues.push(`#${post.id} ${old.platform}: title changed`);
    if (old.platform !== "youtube" && now.content !== old.post.content) issues.push(`#${post.id} ${old.platform}: caption changed`);
  }
  return issues;
}

async function rerender(p: Plan): Promise<void> {
  const { post, deck, look, cta } = p;
  const remotes = await fetchRemotes(post);
  if (!remotes.length) throw new Error(`#${post.id} has no Zernio posts`);
  const live = remotes.filter((r) => String(r.post.status).toLowerCase() === "published");
  if (live.length) {
    console.warn(`#${post.id} skipped: ${live.map((r) => r.platform).join(",")} already live`);
    return;
  }
  await backup(post, remotes);
  const db = getDb();
  const dir = postOutputDir(post.id);
  const before = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^slide-\d+/.test(f)) : [];
  db.delete(slides).where(eq(slides.postId, post.id)).run();
  const files = await renderDeckSlides(deck, post.id, { look, hook: deck.hook, cta, variation: parseVariation(post.variation) });
  const keep = new Set(files.map((f) => path.basename(f)));
  for (const f of before) if (!keep.has(f)) fs.rmSync(path.join(dir, f), { force: true });

  const staging = path.join(ROOT, "staging", String(post.id));
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  files.forEach((f, i) => fs.copyFileSync(f, path.join(staging, `slide-${i + 1}.jpg`)));
  const swapped = await reskinScheduledPost(post.id, staging, { updateSlides: false });
  if (swapped === 0) throw new Error(`#${post.id} no remote post was updated`);
  await uploadSlides(post.id, files, true);
  if (fs.existsSync(path.join(staging, "short.mp4"))) fs.copyFileSync(path.join(staging, "short.mp4"), path.join(dir, "short.mp4"));
  saveDeckSource(post.id, deck);

  const issues = await verify(post, files.length, remotes);
  if (issues.length) {
    log({ event: "verify_failed", postId: post.id, issues });
    throw new Error(`VERIFY FAILED\n  ${issues.join("\n  ")}`);
  }
  log({ event: "rerendered", postId: post.id, look, slides: files.length, remotes: swapped });
  console.log(`#${post.id} ${look} ${deck.character} re-rendered, ${swapped} remote(s) swapped and verified`);
}

async function preview(plans: Plan[]): Promise<void> {
  const out = path.join(ROOT, "preview");
  fs.mkdirSync(out, { recursive: true });
  const W = 180;
  const H = 225;
  const rows: Buffer[] = [];
  for (const p of plans) {
    const files = await renderDeckSlides(p.deck, p.post.id, { look: p.look, hook: p.deck.hook, cta: p.cta, variation: parseVariation(p.post.variation), previewDir: path.join(out, String(p.post.id)) });
    const tiles = await Promise.all(files.map(async (f, i) => ({ input: await sharp(f).resize(W, H).toBuffer(), left: i * W, top: 0 })));
    rows.push(await sharp({ create: { width: 7 * W, height: H, channels: 3, background: "#111" } }).composite(tiles).jpeg({ quality: 82 }).toBuffer());
    console.log(`#${p.post.id} ${p.look} ${p.deck.character}: ${files.length} slides`);
  }
  for (let i = 0; i < rows.length; i += 6) {
    const chunk = rows.slice(i, i + 6);
    await sharp({ create: { width: 7 * W, height: chunk.length * (H + 4), channels: 3, background: "#000" } })
      .composite(chunk.map((input, j) => ({ input, left: 0, top: j * (H + 4) })))
      .jpeg({ quality: 85 })
      .toFile(path.join(out, `sheet-${String(i / 6 + 1).padStart(2, "0")}.jpg`));
  }
  console.log(`Sheets in ${out}`);
}

async function rollback(ids: number[]): Promise<void> {
  const db = getDb();
  for (const id of ids) {
    const dir = backupDir(id);
    if (!fs.existsSync(path.join(dir, "done.json"))) {
      console.warn(`#${id} has no backup`);
      continue;
    }
    const remotes = JSON.parse(fs.readFileSync(path.join(dir, "remote.json"), "utf8")) as Remote[];
    for (const r of remotes) {
      const media = (r.post.mediaItems ?? []) as Array<{ type: "image" | "video"; url: string }>;
      await replaceZernioPost(r.publishId, r.keySlot, {
        title: String(r.post.title ?? ""),
        content: String(r.post.content ?? ""),
        mediaItems: media.map((m) => ({ type: m.type, url: m.url })),
        scheduledFor: String(r.post.scheduledFor),
      });
    }
    const out = postOutputDir(id);
    for (const f of fs.existsSync(out) ? fs.readdirSync(out) : []) fs.rmSync(path.join(out, f), { force: true });
    fs.mkdirSync(out, { recursive: true });
    for (const f of fs.readdirSync(path.join(dir, "files"))) fs.copyFileSync(path.join(dir, "files", f), path.join(out, f));
    db.delete(slides).where(eq(slides.postId, id)).run();
    const rows = JSON.parse(fs.readFileSync(path.join(dir, "slides.json"), "utf8")) as Array<typeof slides.$inferInsert>;
    for (const row of rows) db.insert(slides).values(row).run();
    if (fs.existsSync(path.join(dir, "deck.json"))) saveDeckSource(id, DeckSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, "deck.json"), "utf8"))));
    await uploadSlides(id, rows.map((r) => r.filePath).filter((f) => fs.existsSync(f)), true);
    log({ event: "rolled_back", postId: id });
    console.log(`#${id} restored (${rows.length} slides)`);
  }
}

async function main(): Promise<void> {
  const [mode, idArg] = process.argv.slice(2);
  const ids = idArg && idArg !== "all" ? idArg.split(",").map(Number) : null;
  if (mode === "--rollback") {
    if (!ids) throw new Error("--rollback needs ids");
    return rollback(ids);
  }
  const { plans, skipped } = plan(ids);
  for (const s of skipped) console.log(`  skip ${s}`);
  if (mode === "--plan") {
    for (const p of plans) console.log(`#${p.post.id} ${p.look} ${p.deck.character.padEnd(7)} ${p.post.scheduledAt?.slice(0, 16)} ${p.deck.beats.length + 1} slides  ${p.deck.hook}`);
    console.log(`\n${plans.length} post(s) to re-render, ${skipped.length} skipped.`);
    return;
  }
  if (mode === "--preview") return preview(plans);
  if (mode === "--apply") {
    let ok = 0;
    let streak = 0;
    for (const p of plans) {
      // rerender() is safe to repeat: the first backup is kept and a retry redoes every platform.
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          await rerender(p);
          ok++;
          streak = 0;
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes("VERIFY FAILED")) {
            console.error(`#${p.post.id} ${msg}`);
            log({ event: "failed", postId: p.post.id, error: msg });
            process.exitCode = 1;
            return;
          }
          const transient = /fetch failed|\(5\d\d\)|ECONNRESET|ETIMEDOUT|429/.test(msg);
          if (transient && attempt < 4) {
            console.warn(`#${p.post.id} attempt ${attempt} failed (${msg}); retrying in ${attempt * 30}s`);
            await new Promise((r) => setTimeout(r, attempt * 30_000));
            continue;
          }
          console.error(`#${p.post.id} FAILED: ${msg}`);
          log({ event: "failed", postId: p.post.id, error: msg });
          process.exitCode = 1;
          if (++streak >= 3) {
            console.error("3 posts in a row failed; stopping. Re-run --apply all to resume.");
            return;
          }
          break;
        }
      }
    }
    console.log(`\n${ok}/${plans.length} re-rendered.`);
    return;
  }
  console.log("usage: --plan | --preview [ids] | --apply [ids|all] | --rollback <ids>");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
