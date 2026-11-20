/**
 * Re-cut already-scheduled character decks (an A post and its Stories twin B) into
 * split-comparison decks. No new photos: the cover photo goes on top, the result photo on
 * the bottom, and the cover line becomes "<original hook> / <result line>". The hook text in
 * the hooks table, the caption, title, time and experiment link all stay as they are.
 *
 *   npx tsx src/generation/_split-convert.ts --plan                    validate every pair, write nothing
 *   npx tsx src/generation/_split-convert.ts --preview                 render covers + contact sheets only
 *   npx tsx src/generation/_split-convert.ts --apply 319,320           convert these pairs (A ids) live
 *   npx tsx src/generation/_split-convert.ts --rollback 319,320        restore the originals
 *
 * Every apply backs the pair up first (slide files, slide rows, deck sources, remote media).
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb, posts, slides } from "@remedy-growth/db";
import { OUTPUT_DIR } from "../config.js";
import { renderSplitSlide, postOutputDir } from "./composer.js";
import {
  BANNED,
  DeckSchema,
  characterDir,
  hookBProblems,
  loadDeckSource,
  renderDeckSlides,
  saveDeckSource,
  type Deck,
} from "./character-deck.js";
import { CTA_REVIEW_OPTIONS } from "./hooks.js";
import { parseVariation } from "./variations.js";
import { reskinScheduledPost } from "../publish/reskin.js";
import { zernioRefs, type PlatformPosts } from "../publish/index.js";
import { fetchZernioPost, replaceZernioPost, type ZernioKeySlot } from "../publish/zernio.js";
import { uploadSlides } from "../publish/r2.js";
import type { Platform } from "../config.js";

/** A ids, chosen for a clear before/after and spread across characters and days. */
const PAIRS = [
  316, 319, 320, // andre
  325, 330, // chris
  332, 345, // dana
  347, 358, // jess
  362, 368, // linda
  376, 384, // marcus
  390, 394, 398, // maria
  403, 409, 413, // priya
  422, 426, 428, // ray
  436, 440, 442, // sam
];

/**
 * Where each half's crop starts (0-1 down the portrait source photo). The photos were shot
 * 3:4 and a half is a landscape band, so the default saliency crop sometimes lands on ceiling
 * or clips the person. Picked by eye from the review sheets; unset = default crop.
 */
const FRAME: Record<number, { topY?: number; bottomY?: number }> = {
  316: { topY: 0.3 },
  319: { topY: 0.28 },
  320: { topY: 0.45, bottomY: 0.5 },
  325: { topY: 0.29, bottomY: 0.48 },
  330: { topY: 0.27 },
  332: { topY: 0.3 },
  345: { topY: 0.27 },
  347: { topY: 0.5, bottomY: 0.5 },
  358: { topY: 0.28, bottomY: 0.4 },
  362: { topY: 0.32, bottomY: 0.2 },
  368: { topY: 0.38 },
  376: { bottomY: 0.5 },
  384: { bottomY: 0.35 },
  390: { topY: 0.24, bottomY: 0.2 },
  394: { topY: 0.5 },
  398: { topY: 0.19, bottomY: 0.35 },
  403: { topY: 0.07, bottomY: 0.3 },
  409: { topY: 0.24, bottomY: 0.3 },
  413: { topY: 0.4, bottomY: 0.4 },
  422: { topY: 0.2, bottomY: 0.52 },
  426: { topY: 0.29 },
  428: { topY: 0.42, bottomY: 0.42 },
  436: { topY: 0.33 },
  440: { bottomY: 0.35 },
  442: { topY: 0.26 },
};

const ROOT = path.join(OUTPUT_DIR, "split-convert");
const MIN_LEAD_MS = 3 * 60 * 60_000;
const MAX_HALF_WORDS = 12;

type PostRow = typeof posts.$inferSelect;

interface Plan {
  a: PostRow;
  b: PostRow;
  newA: Deck;
  newB: Deck;
  splitA: string;
  splitB: string;
  problems: string[];
}

function words(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

function buildPlan(aId: number): Plan | { error: string } {
  const db = getDb();
  const a = db.select().from(posts).where(eq(posts.id, aId)).get();
  if (!a) return { error: `#${aId} not found` };
  const bId = parseVariation(a.variation).accountTwinId;
  if (!bId) return { error: `#${aId} has no Stories twin` };
  const b = db.select().from(posts).where(eq(posts.id, bId)).get();
  if (!b) return { error: `twin #${bId} not found` };

  const problems: string[] = [];
  for (const p of [a, b]) {
    if (p.status !== "published") problems.push(`#${p.id} is ${p.status}, expected published (scheduled remotely)`);
    if (!p.scheduledAt || Date.parse(p.scheduledAt) < Date.now() + MIN_LEAD_MS) problems.push(`#${p.id} goes live within 3h (${p.scheduledAt ?? "unscheduled"})`);
  }

  const deckA = loadDeckSource(aId);
  const deckB = loadDeckSource(bId);
  if (!deckA || !deckB) return { error: `#${aId}/#${bId} missing deck source` };
  const cover = deckA.beats[0]!;
  const result = deckA.beats[deckA.beats.length - 1]!;
  if (!("photo" in cover) || !("photo" in result)) return { error: `#${aId} cover/result is not a photo beat (already converted?)` };
  if (cover.photo === result.photo) return { error: `#${aId} cover and result are the same photo` };

  const resultLine = result.headline.trim();
  const splitA = `${deckA.hook.trim()} / ${resultLine}`;
  const splitB = `${deckB.hook.trim()} / ${resultLine}`;
  const beats = [
    { top: cover.photo, bottom: result.photo, headline: splitA, grade: "contrast" as const, ...FRAME[aId] },
    ...deckA.beats.slice(1, -1),
  ];
  const newA = DeckSchema.parse({ ...deckA, hook: splitA, hookB: splitB, beats });
  const newB = DeckSchema.parse({ ...deckB, hook: splitB, hookB: splitB, beats });

  for (const [label, line] of [["A", splitA], ["B", splitB]] as const) {
    for (const half of line.split(" / ")) {
      if (words(half) > MAX_HALF_WORDS) problems.push(`${label} half over ${MAX_HALF_WORDS} words: "${half}"`);
    }
    for (const re of BANNED) if (re.test(line)) problems.push(`${label} banned wording ${re}`);
  }
  problems.push(...hookBProblems(newA, splitB));
  if (!newA.beats.some((x) => "screenshot" in x)) problems.push("no app slide");

  return { a, b, newA, newB, splitA, splitB, problems };
}

async function contactSheet(files: string[], out: string, cols: number, w = 270): Promise<void> {
  const h = Math.round(w * 1.25);
  const rows = Math.ceil(files.length / cols);
  const tiles = await Promise.all(
    files.map(async (f, i) => ({
      input: await sharp(f).resize(w, h).jpeg({ quality: 80 }).toBuffer(),
      left: (i % cols) * w,
      top: Math.floor(i / cols) * h,
    })),
  );
  await sharp({ create: { width: cols * w, height: rows * h, channels: 3, background: "#111111" } })
    .composite(tiles)
    .jpeg({ quality: 85 })
    .toFile(out);
}

async function preview(plans: Array<Plan & { aId: number }>): Promise<void> {
  const dir = path.join(ROOT, "preview");
  fs.mkdirSync(dir, { recursive: true });
  const aFiles: string[] = [];
  const bFiles: string[] = [];
  for (const p of plans) {
    const beat = p.newA.beats[0]!;
    if (!("top" in beat)) continue;
    const charDir = characterDir(p.newA.character);
    const fa = path.join(dir, `${p.aId}-A.jpg`);
    const fb = path.join(dir, `${p.aId}-B.jpg`);
    const frame = { grade: beat.grade, topY: beat.topY, bottomY: beat.bottomY };
    await renderSplitSlide(path.join(charDir, beat.top), path.join(charDir, beat.bottom), p.splitA, fa, { hook: true, look: "A", ...frame });
    await renderSplitSlide(path.join(charDir, beat.top), path.join(charDir, beat.bottom), p.splitB, fb, { hook: true, look: "B", ...frame });
    aFiles.push(fa);
    bFiles.push(fb);
  }
  // A handful of covers (re-checking a few ids) get bigger tiles.
  const few = aFiles.length <= 6;
  const per = few ? 6 : 8;
  for (let i = 0; i < aFiles.length; i += per) {
    await contactSheet(aFiles.slice(i, i + per), path.join(dir, `sheet-A-${i / per + 1}.jpg`), few ? 3 : 4, few ? 360 : 270);
    await contactSheet(bFiles.slice(i, i + per), path.join(dir, `sheet-B-${i / per + 1}.jpg`), few ? 3 : 4, few ? 360 : 270);
  }
  console.log(`Previews in ${dir}`);
}

/** Per pair: both source photos with a 0-1 ruler, next to the current A cover render. */
async function review(plans: Array<Plan & { aId: number }>): Promise<void> {
  const dir = path.join(ROOT, "review");
  fs.mkdirSync(dir, { recursive: true });
  const H = 360;
  const rows: Buffer[] = [];
  const tile = async (file: string): Promise<{ buf: Buffer; w: number }> => {
    const base = await sharp(file).rotate().resize({ height: H }).toBuffer({ resolveWithObject: true });
    const ticks = Array.from({ length: 10 }, (_, i) => {
      const y = Math.round((i / 10) * H);
      return `<line x1="0" y1="${y}" x2="14" y2="${y}" stroke="#ff0" stroke-width="2"/><text x="17" y="${y + 11}" font-size="12" font-family="Arial" fill="#ff0" stroke="#000" stroke-width="0.6">${(i / 10).toFixed(1)}</text>`;
    }).join("");
    const svg = Buffer.from(`<svg width="${base.info.width}" height="${H}" xmlns="http://www.w3.org/2000/svg">${ticks}</svg>`);
    return { buf: await sharp(base.data).composite([{ input: svg }]).jpeg({ quality: 82 }).toBuffer(), w: base.info.width };
  };
  const ids: number[] = [];
  for (const p of plans) {
    const beat = p.newA.beats[0]!;
    if (!("top" in beat)) continue;
    const charDir = characterDir(p.newA.character);
    const a = await tile(path.join(charDir, beat.top));
    const b = await tile(path.join(charDir, beat.bottom));
    const cur = path.join(ROOT, "preview", `${p.aId}-A.jpg`);
    const c = await sharp(cur).resize({ height: H }).toBuffer({ resolveWithObject: true });
    const label = Buffer.from(`<svg width="60" height="${H}" xmlns="http://www.w3.org/2000/svg"><text x="4" y="24" font-size="22" font-family="Arial" font-weight="bold" fill="#fff">${p.aId}</text></svg>`);
    const width = 60 + a.w + 6 + b.w + 6 + c.info.width;
    rows.push(
      await sharp({ create: { width, height: H, channels: 3, background: "#222" } })
        .composite([
          { input: label, left: 0, top: 0 },
          { input: a.buf, left: 60, top: 0 },
          { input: b.buf, left: 60 + a.w + 6, top: 0 },
          { input: c.data, left: 60 + a.w + 6 + b.w + 6, top: 0 },
        ])
        .jpeg({ quality: 85 })
        .toBuffer(),
    );
    ids.push(p.aId);
  }
  for (let i = 0; i < rows.length; i += 4) {
    const chunk = rows.slice(i, i + 4);
    const metas = await Promise.all(chunk.map((r) => sharp(r).metadata()));
    const width = Math.max(...metas.map((m) => m.width ?? 0));
    await sharp({ create: { width, height: chunk.length * (H + 4), channels: 3, background: "#000" } })
      .composite(chunk.map((input, j) => ({ input, left: 0, top: j * (H + 4) })))
      .jpeg({ quality: 85 })
      .toFile(path.join(dir, `review-${i / 4 + 1}.jpg`));
    console.log(`review-${i / 4 + 1}.jpg: ${ids.slice(i, i + 4).join(", ")}`);
  }
}

interface Remote {
  platform: Platform;
  publishId: string;
  keySlot: ZernioKeySlot;
  post: Record<string, unknown>;
}

async function fetchRemotes(post: PostRow): Promise<Remote[]> {
  const out: Remote[] = [];
  const pp = (post.platformPosts ?? {}) as PlatformPosts;
  for (const [platform, rec] of Object.entries(pp) as [Platform, PlatformPosts[Platform]][]) {
    if (!rec) continue;
    for (const ref of zernioRefs(rec)) {
      const post2 = (await fetchZernioPost(ref.publishId, ref.keySlot)) as Record<string, unknown>;
      out.push({ platform, publishId: ref.publishId, keySlot: ref.keySlot as ZernioKeySlot, post: post2 });
    }
  }
  return out;
}

function backupDir(id: number): string {
  return path.join(ROOT, "backup", String(id));
}

async function backup(post: PostRow): Promise<void> {
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
  const db = getDb();
  fs.writeFileSync(path.join(dir, "slides.json"), JSON.stringify(db.select().from(slides).where(eq(slides.postId, post.id)).all(), null, 2));
  const deck = loadDeckSource(post.id);
  if (deck) fs.writeFileSync(path.join(dir, "deck.json"), JSON.stringify(deck, null, 2));
  fs.writeFileSync(path.join(dir, "post.json"), JSON.stringify({ id: post.id, status: post.status, scheduledAt: post.scheduledAt, variation: post.variation }, null, 2));
  const remotes = await fetchRemotes(post);
  fs.writeFileSync(path.join(dir, "remote.json"), JSON.stringify(remotes, null, 2));
  fs.writeFileSync(path.join(dir, "done.json"), JSON.stringify({ at: new Date().toISOString() }));
}

function ctaFor(post: PostRow) {
  const v = parseVariation(post.variation);
  return { v, cta: CTA_REVIEW_OPTIONS.find((o) => o.layout === v.ctaLayout && o.atmosphere === v.ctaAtmosphere) };
}

function log(line: Record<string, unknown>): void {
  fs.mkdirSync(ROOT, { recursive: true });
  fs.appendFileSync(path.join(ROOT, "log.jsonl"), `${JSON.stringify({ at: new Date().toISOString(), ...line })}\n`);
}

/** Render one post's new deck, write its slide rows, and swap the live Zernio media. */
async function convertPost(post: PostRow, deck: Deck, look: "A" | "B", hook: string): Promise<void> {
  const { v, cta } = ctaFor(post);
  if (!cta) throw new Error(`#${post.id} CTA ${v.ctaLayout}/${v.ctaAtmosphere} is not a locked review option`);
  const db = getDb();
  const dir = postOutputDir(post.id);
  const before = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^slide-\d+-/.test(f)) : [];
  db.delete(slides).where(eq(slides.postId, post.id)).run();
  const files = await renderDeckSlides(deck, post.id, { look, hook, cta, variation: v });
  // Old decks had one more slide; drop its stale file.
  const keep = new Set(files.map((f) => path.basename(f)));
  for (const f of before) if (!keep.has(f)) fs.rmSync(path.join(dir, f), { force: true });

  const staging = path.join(ROOT, "staging", String(post.id));
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  files.forEach((f, i) => fs.copyFileSync(f, path.join(staging, `slide-${i + 1}.jpg`)));
  const swapped = await reskinScheduledPost(post.id, staging, { updateSlides: false });
  if (swapped === 0) throw new Error(`#${post.id} no remote post was updated`);
  await uploadSlides(post.id, files, true);
  const shortLocal = path.join(dir, "short.mp4");
  if (fs.existsSync(path.join(staging, "short.mp4"))) fs.copyFileSync(path.join(staging, "short.mp4"), shortLocal);
  log({ event: "converted", postId: post.id, look, slides: files.length, remotes: swapped });
}

async function verify(post: PostRow, expectImages: number, backupRemotes: Remote[]): Promise<string[]> {
  const issues: string[] = [];
  for (const old of backupRemotes) {
    const now = (await fetchZernioPost(old.publishId, old.keySlot)) as Record<string, unknown>;
    const items = (now.mediaItems ?? []) as unknown[];
    const want = old.platform === "youtube" ? 1 : expectImages;
    if (items.length !== want) issues.push(`#${post.id} ${old.platform}: ${items.length} media items, expected ${want}`);
    if (now.scheduledFor !== old.post.scheduledFor) issues.push(`#${post.id} ${old.platform}: time changed ${String(old.post.scheduledFor)} -> ${String(now.scheduledFor)}`);
    if (now.content !== old.post.content && old.platform !== "youtube") issues.push(`#${post.id} ${old.platform}: caption changed`);
    if (now.title !== old.post.title) issues.push(`#${post.id} ${old.platform}: title changed`);
    if (String(now.status).toLowerCase() === "published") issues.push(`#${post.id} ${old.platform}: already published`);
  }
  return issues;
}

async function apply(plans: Array<Plan & { aId: number }>): Promise<void> {
  for (const p of plans) {
    const bad = p.problems.filter((x) => !x.startsWith("note:"));
    if (bad.length) {
      console.error(`#${p.aId} skipped: ${bad.join(" | ")}`);
      continue;
    }
    console.log(`\n=== pair #${p.a.id} + #${p.b.id} (${p.newA.character}) ===`);
    console.log(`A: ${p.splitA}\nB: ${p.splitB}`);
    await backup(p.a);
    await backup(p.b);
    const remoteA = JSON.parse(fs.readFileSync(path.join(backupDir(p.a.id), "remote.json"), "utf8")) as Remote[];
    const remoteB = JSON.parse(fs.readFileSync(path.join(backupDir(p.b.id), "remote.json"), "utf8")) as Remote[];
    const live = [...remoteA, ...remoteB].filter((r) => String(r.post.status).toLowerCase() === "published");
    if (live.length) {
      console.error(`#${p.aId} skipped: ${live.length} remote post(s) already live`);
      continue;
    }
    await convertPost(p.a, p.newA, "A", p.splitA);
    await convertPost(p.b, p.newB, "B", p.splitB);
    saveDeckSource(p.a.id, p.newA);
    saveDeckSource(p.b.id, p.newB);
    const issues = [
      ...(await verify(p.a, p.newA.beats.length + 1, remoteA)),
      ...(await verify(p.b, p.newB.beats.length + 1, remoteB)),
    ];
    if (issues.length) {
      console.error(`VERIFY FAILED:\n  ${issues.join("\n  ")}`);
      log({ event: "verify_failed", pair: p.a.id, issues });
      process.exitCode = 1;
      return;
    }
    console.log(`#${p.a.id} + #${p.b.id} converted and verified (${p.newA.beats.length + 1} slides each)`);
  }
}

async function rollback(ids: number[]): Promise<void> {
  const db = getDb();
  for (const aId of ids) {
    const a = db.select().from(posts).where(eq(posts.id, aId)).get();
    const bId = a ? parseVariation(a.variation).accountTwinId : undefined;
    for (const id of [aId, bId]) {
      if (!id) continue;
      const dir = backupDir(id);
      if (!fs.existsSync(path.join(dir, "done.json"))) {
        console.warn(`#${id} has no backup`);
        continue;
      }
      const post = db.select().from(posts).where(eq(posts.id, id)).get();
      if (!post) continue;
      // Remote: old media URLs, copy, title and time straight from the backup.
      const remotes = JSON.parse(fs.readFileSync(path.join(dir, "remote.json"), "utf8")) as Remote[];
      for (const r of remotes) {
        const media = (r.post.mediaItems ?? []) as Array<{ type: "image" | "video"; url: string }>;
        await replaceZernioPost(r.publishId, r.keySlot, {
          title: String(r.post.title ?? post.tiktokTitle),
          content: String(r.post.content ?? ""),
          mediaItems: media.map((m) => ({ type: m.type, url: m.url })),
          scheduledFor: String(r.post.scheduledFor),
        });
      }
      // Local: files, slide rows, deck source.
      const out = postOutputDir(id);
      for (const f of fs.existsSync(out) ? fs.readdirSync(out) : []) fs.rmSync(path.join(out, f), { force: true });
      fs.mkdirSync(out, { recursive: true });
      for (const f of fs.readdirSync(path.join(dir, "files"))) fs.copyFileSync(path.join(dir, "files", f), path.join(out, f));
      db.delete(slides).where(eq(slides.postId, id)).run();
      const rows = JSON.parse(fs.readFileSync(path.join(dir, "slides.json"), "utf8")) as Array<typeof slides.$inferInsert>;
      for (const row of rows) db.insert(slides).values(row).run();
      const deck = DeckSchema.parse(JSON.parse(fs.readFileSync(path.join(dir, "deck.json"), "utf8")));
      saveDeckSource(id, deck);
      const restored = rows.map((r) => r.filePath).filter((f) => fs.existsSync(f));
      await uploadSlides(id, restored, true);
      log({ event: "rolled_back", postId: id });
      console.log(`#${id} restored (${rows.length} slides)`);
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0];
  const idArg = args[1] && !args[1].startsWith("--") ? args[1] : "";
  const ids = idArg ? idArg.split(",").map(Number) : PAIRS;
  if (mode === "--rollback") return rollback(ids);

  const plans: Array<Plan & { aId: number }> = [];
  for (const id of ids) {
    const p = buildPlan(id);
    if ("error" in p) {
      console.error(`#${id}: ${p.error}`);
      continue;
    }
    plans.push({ ...p, aId: id });
  }
  if (mode === "--plan") {
    let ok = 0;
    for (const p of plans) {
      const flag = p.problems.length ? "XX" : "ok";
      if (!p.problems.length) ok++;
      console.log(`${flag} #${p.aId}/#${p.b.id} ${p.newA.character.padEnd(7)} ${p.a.scheduledAt?.slice(5, 16)}  ${p.splitA}\n${" ".repeat(32)}B: ${p.splitB}`);
      for (const x of p.problems) console.log(`     ! ${x}`);
    }
    console.log(`\n${ok}/${plans.length} pairs clean`);
    return;
  }
  if (mode === "--preview") return preview(plans);
  if (mode === "--review") return review(plans);
  if (mode === "--apply") return apply(plans);
  console.log("usage: --plan | --preview | --review | --apply [ids] | --rollback [ids]");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

