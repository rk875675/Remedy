/**
 * Build character decks (one person, one day) from deck JSON files.
 *
 *   npx tsx src/generation/_character-batch.ts <dir> [--check] [--approve] [--only <prefix>] [--no-twin]
 *
 * --check validates only. Without it, each deck becomes a post (or re-renders
 * `postId` in place), plus its Remedy Stories A/B twin unless --no-twin.
 * Beats may be single photos, splits (top/bottom) or quads (2x2). Hard rules
 * fail the batch; soft notes (·) print and let it run.
 * Rules live in .cursor/rules/growth-engine.mdc.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb, hooks, posts, slides } from "@remedy-growth/db";
import { ASSETS_DIR, OUTPUT_DIR, configuredPlatforms } from "../config.js";
import { ensureAppStoreCaption, isSloganLine, lacksConcreteDetail, pickBestCtaOption } from "./hooks.js";
import { ensurePostShort } from "./index.js";
import { makeVariation, parseVariation } from "./variations.js";
import {
  BANNED,
  DeckSchema,
  characterDir,
  createCharacterTwin,
  deckFormat,
  hookBProblems,
  refreshCharacterTwin,
  renderDeckSlides,
  saveDeckSource,
  type Deck,
} from "./character-deck.js";
import { photoFileProblems } from "./shots.js";
import { loadTests, pickShortBedByResults } from "../learning/playbook.js";

const APP_CROPS = new Set([
  "crop_home.png", "crop_home_2.png", "crop_home_poke.png", "crop_home_angry.png", "crop_home_angry_enough.png",
  "crop_home_not_amused.png", "crop_home_reading.png", "crop_home_reading_page.png",
  "crop_session_preview.png", "crop_img_0461.png",
  "crop_cat_cow.png", "crop_session.png", "crop_img_0465.png", "crop_img_0470.png", "crop_img_0473.png",
  "crop_exercise_childs_pose.png", "crop_img_0469.png", "crop_img_0472.png",
  "crop_progress.png", "crop_progress_2.png", "crop_progress_3.png", "crop_pain_trend.png",
  "crop_pain_check.png", "crop_pain_check_2.png", "crop_profile.png", "crop_home_done.png", "crop_ramp_week2.png",
  "crop_onboard_hear.png", "crop_onboard_belief.png", "crop_onboard_recognize.png",
  "crop_onboard_goal_pain.png", "crop_onboard_goal_mobility.png", "crop_onboard_activity.png",
  "crop_onboard_worse.png", "crop_onboard_gym.png", "crop_onboard_time.png", "crop_onboard_commit.png",
  "crop_onboard_building.png", "crop_onboard_building_eyes.png", "crop_onboard_program.png",
]);
/** Crops that show dev placeholder text. None of the current crops do. */
const PLACEHOLDER_CROPS = new Set<string>();

/** Deck formats. The mix is set by the playbook, not a fixed target. */
const FORMATS = ["quad", "split", "single"] as const;

const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;
const SHOUTING = /\b[A-Z]{4,}\b/;

/** Soft notes: printed, never fatal. Things the research says cost reach a little, not rules. */
function notes(deck: Deck, file: string): string[] {
  const out: string[] = [];
  const n = words(deck.hook.replace(" / ", " "));
  if (n < 5) out.push(`hook is ${n} words; 6-10 word covers did best (short ones under-perform a little)`);
  if (/\?\s*$/.test(deck.hook)) out.push("hook is a question; statements beat questions 48% to 39% in the carousel study");
  if (!deck.feeling) out.push('no "feeling" set (anger | curiosity | mystery | sadness | relief | pride)');
  if (!deck.postId && !deck.plan) out.push('no "plan" slot; take one from src/learning/_playbook.ts --plan so the result is read back');
  for (const beat of deck.beats) {
    if ("screenshot" in beat && PLACEHOLDER_CROPS.has(beat.screenshot)) out.push(`${beat.screenshot} shows placeholder text ("Name"); prefer another crop`);
    if ("screenshot" in beat || "quad" in beat) continue;
    const halves = "top" in beat ? beat.headline.split(" / ") : [beat.headline];
    for (const half of halves) if (lacksConcreteDetail(half)) out.push(`nothing to picture in "${half}" (no number, time, object, place, or body part)`);
  }
  if (deck.shots) {
    const byFile = new Map(deck.shots.map((s) => [s.file, s]));
    for (const p of beatPhotos(deck)) if (!byFile.has(p.file)) out.push(`${p.file} has no entry in "shots" (how was it made?)`);
    const withPerson = deck.shots.filter((s) => s.person !== "none").length;
    if (withPerson === 0) out.push("no shot has a person in it; faces and people lift likes and comments (research in growth-engine.mdc), use some");
    const quadCells = deck.beats.filter((b) => "quad" in b).flatMap((b) => ("quad" in b ? b.quad : []));
    const quadPeople = quadCells.filter((c) => (byFile.get(c)?.person ?? "none") !== "none").length;
    if (quadCells.length && quadPeople < quadCells.length / 4) out.push(`only ${quadPeople} of ${quadCells.length} quad cells have the person; the reference decks run about half`);
  }
  return out.map((p) => `${path.basename(file)}: ${p}`);
}

type Slot = "portrait" | "landscape" | "any";
/** Every photo a deck renders, with the orientation its slot needs ("any" = blurred app-slide background). */
function beatPhotos(deck: Deck): Array<{ file: string; slot: Slot }> {
  const out: Array<{ file: string; slot: Slot }> = [];
  for (const beat of deck.beats) {
    if ("quad" in beat) for (const c of beat.quad) out.push({ file: c, slot: "portrait" });
    else if ("top" in beat) out.push({ file: beat.top, slot: "landscape" }, { file: beat.bottom, slot: "landscape" });
    else if ("photo" in beat) out.push({ file: beat.photo, slot: "portrait" });
    else out.push({ file: beat.bg, slot: "any" });
  }
  return out;
}

/** Hard photo checks: file exists, right orientation for its slot, big enough, matches its shot spec. */
async function photoProblems(deck: Deck, file: string): Promise<string[]> {
  const out: string[] = [];
  const charDir = characterDir(deck.character);
  const byFile = new Map((deck.shots ?? []).map((s) => [s.file, s]));
  for (const p of beatPhotos(deck)) {
    const abs = path.join(charDir, p.file);
    if (!fs.existsSync(abs)) continue; // reported by problems()
    const spec = byFile.get(p.file);
    if (spec) {
      const landscapeSpec = spec.aspect === "16:9" || spec.aspect === "4:3";
      if (p.slot !== "any" && landscapeSpec !== (p.slot === "landscape")) out.push(`${p.file} is a ${p.slot} slot but its shot is ${spec.aspect}`);
      out.push(...(await photoFileProblems(abs, spec.aspect)));
      continue;
    }
    const meta = await sharp(abs).metadata();
    const w = meta.width ?? 0;
    const h = meta.height ?? 0;
    if (Math.min(w, h) < 700) out.push(`${p.file} is ${w}x${h}; need at least 700px on the short side`);
    if (p.slot === "portrait" && w / h > 0.95) out.push(`${p.file} is ${w}x${h}, a portrait slot needs a taller-than-wide photo`);
    if (p.slot === "landscape" && w / h < 1.2) out.push(`${p.file} is ${w}x${h}, a split half needs a wider-than-tall photo`);
  }
  return out.map((m) => `${path.basename(file)}: ${m}`);
}

function problems(deck: Deck, file: string): string[] {
  const out: string[] = [];
  const charDir = characterDir(deck.character);
  if (!fs.existsSync(path.join(charDir, "anchor.jpg"))) out.push(`no anchor for ${deck.character}`);
  // New decks go through the shots engine; decks rebuilt from before it (postId set) may not have shots yet.
  if (!deck.postId) {
    if (!deck.shots?.length) out.push('new decks need a "shots" array (one per photo); see the character-deck-build skill');
    else {
      const specced = new Set(deck.shots.map((s) => s.file));
      for (const p of beatPhotos(deck)) if (!specced.has(p.file)) out.push(`${p.file} has no entry in "shots"`);
    }
  }
  if (deck.plan?.slot === "explore") {
    const test = loadTests().find((t) => t.id === deck.plan?.test);
    if (!test) out.push(`explore deck names test "${deck.plan.test ?? ""}", which is not in assets/playbook/tests.json`);
    else for (const [dim, arm] of Object.entries(test.arms)) if (deck.plan.arms[dim] !== arm) out.push(`test ${test.id} needs plan.arms.${dim} = "${arm}"`);
  }
  const first = deck.beats[0]!;
  if (!("photo" in first) && !("top" in first) && !("quad" in first)) out.push("slide 1 must be a photo, a split, or a quad");
  else if (first.headline !== deck.hook) out.push("slide 1 headline must equal hook");
  if ("top" in first && !deck.hookB) out.push('a split deck needs a hookB with " / " between its halves');
  if (deck.hookB) out.push(...hookBProblems(deck, deck.hookB));
  if (SHOUTING.test(deck.hook)) out.push(`no all-caps words in the hook: "${deck.hook}"`);
  // Split hooks are capped per half (10 words) in the beat loop below.
  if (!deck.hook.includes(" / ") && words(deck.hook) > 14) out.push(`hook over 14 words: "${deck.hook}"`);
  // Explore-only exceptions to the one-app-slide and locked-CTA rules, keyed on the planned arm.
  const twoSlide = deck.plan?.arms.structure === "two-slide";
  const pinned = deck.plan?.arms.cta === "pinned-comment";
  if (pinned !== (deck.ctaIn === "pinned-comment")) out.push('ctaIn "pinned-comment" and plan.arms.cta "pinned-comment" go together');
  if ((twoSlide || pinned) && deck.plan?.slot !== "explore") out.push("two-slide and pinned-comment decks are explore tests only");
  if (!twoSlide && deck.beats.length < 4) out.push(`need at least 4 beats, got ${deck.beats.length}`);
  const shots = deck.beats.filter((b) => "screenshot" in b);
  const shotIdx = deck.beats.findIndex((b) => "screenshot" in b);
  if (pinned) {
    if (shots.length !== 0) out.push(`a pinned-comment deck has no app slide, got ${shots.length}`);
  } else if (twoSlide) {
    if (deck.beats.length !== 2 || shotIdx !== 1) out.push("a two-slide deck is exactly a cover then the app slide");
  } else {
    if (shots.length !== 1) out.push(`need exactly one app slide, got ${shots.length}`);
    if (shotIdx >= 0 && shotIdx < 2) out.push("app slide must not be slide 1 or 2");
  }
  const quads = deck.beats.filter((b) => "quad" in b).length;
  if (quads > 3) out.push(`at most 3 quad slides per deck, got ${quads}`);
  const seen = new Set<string>();
  deck.beats.forEach((beat, i) => {
    const halves = "top" in beat ? beat.headline.split(" / ") : [beat.headline];
    const limit = halves.length > 1 || "quad" in beat ? 10 : 12;
    for (const half of halves) {
      if (words(half) > limit) out.push(`headline over ${limit} words: "${half}"`);
      if (i > 0 && isSloganLine(half)) out.push(`slogan shape (poster line), rewrite as a moment or a count: "${half}"`);
    }
    for (const re of BANNED) if (re.test(beat.headline)) out.push(`banned wording ${re} in "${beat.headline}"`);
    if ("quad" in beat) {
      for (const cell of beat.quad) {
        if (!fs.existsSync(path.join(charDir, cell))) out.push(`missing photo ${cell}`);
        if (seen.has(cell)) out.push(`photo used twice: ${cell}`);
        seen.add(cell);
      }
      for (const label of beat.labels ?? []) {
        if (words(label) > 5) out.push(`quad label over 5 words: "${label}"`);
        for (const re of BANNED) if (re.test(label)) out.push(`banned wording ${re} in label "${label}"`);
      }
      return;
    }
    if ("top" in beat) {
      if (halves.length !== 2) out.push(`split headline needs exactly one " / ": "${beat.headline}"`);
      for (const half of [beat.top, beat.bottom]) {
        if (!fs.existsSync(path.join(charDir, half))) out.push(`missing photo ${half}`);
        if (seen.has(half)) out.push(`photo used twice: ${half}`);
        seen.add(half);
      }
      return;
    }
    const img = "photo" in beat ? beat.photo : beat.bg;
    if (!fs.existsSync(path.join(charDir, img))) out.push(`missing photo ${img}`);
    if ("photo" in beat) {
      if (seen.has(beat.photo)) out.push(`photo used twice: ${beat.photo}`);
      seen.add(beat.photo);
    } else {
      if (!APP_CROPS.has(beat.screenshot)) out.push(`app crop not allowed: ${beat.screenshot}`);
      if (!fs.existsSync(path.join(ASSETS_DIR, beat.screenshot))) out.push(`crop file missing: ${beat.screenshot}`);
    }
  });
  for (const re of BANNED.slice(0, 7)) if (re.test(deck.caption) || re.test(deck.title)) out.push(`banned wording ${re} in title/caption`);
  return out.map((p) => `${path.basename(file)}: ${p}`);
}

async function build(deck: Deck, approve: boolean): Promise<number> {
  const db = getDb();
  const cta = pickBestCtaOption(deck.hook);
  const platforms = [...new Set([...configuredPlatforms(), "youtube"])];
  const status = approve ? "approved" : "queued";

  let postId = deck.postId;
  if (postId && db.select().from(posts).where(eq(posts.id, postId)).get()) {
    const existing = db.select().from(posts).where(eq(posts.id, postId)).get()!;
    const variation = { ...parseVariation(existing.variation), characterId: deck.character, ctaLayout: cta.layout, ctaAtmosphere: cta.atmosphere };
    db.update(posts)
      .set({ variation, caption: ensureAppStoreCaption(deck.caption), tiktokTitle: deck.title, hashtags: deck.hashtags, status, scheduledAt: null, error: null })
      .where(eq(posts.id, postId))
      .run();
    db.delete(slides).where(eq(slides.postId, postId)).run();
  } else {
    const variation = makeVariation({ hasScreenshots: true });
    variation.prelaunch = false;
    variation.ctaLayout = cta.layout;
    variation.ctaAtmosphere = cta.atmosphere;
    variation.zernioSlot = "1";
    variation.characterId = deck.character;
    variation.shortBed = pickShortBedByResults();
    const hook = db.insert(hooks).values({ text: deck.hook, category: "story", formulaId: null, source: "seed", status: "used" }).returning().get();
    if (!hook) throw new Error(`hook insert failed: ${deck.hook}`);
    const post = db
      .insert(posts)
      .values({
        hookId: hook.id,
        templateId: "X",
        variation,
        caption: ensureAppStoreCaption(deck.caption),
        tiktokTitle: deck.title,
        hashtags: deck.hashtags,
        platforms,
        status,
        confidence: 50,
      })
      .returning()
      .get();
    if (!post) throw new Error("post insert failed");
    postId = post.id;
  }

  const variation = parseVariation(db.select().from(posts).where(eq(posts.id, postId)).get()!.variation);
  const paths = await renderDeckSlides(deck, postId, { look: "A", hook: deck.hook, cta, variation });
  saveDeckSource(postId, deck);
  await ensurePostShort(postId, paths, true);
  await writeSheet(paths, `${postId}-${deck.character}.jpg`);
  return postId;
}

/** Format shares across the deck library after this batch, against the targets in growth-engine.mdc. */
function formatShareLine(batch: Deck[]): string {
  const dir = path.join(OUTPUT_DIR, "decks");
  const saved = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  const counts = { quad: 0, split: 0, single: 0 };
  let total = 0;
  for (const f of saved) {
    const parsed = DeckSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));
    if (!parsed.success) continue;
    total++;
    counts[deckFormat(parsed.data)]++;
  }
  for (const d of batch.filter((d) => !d.postId)) {
    total++;
    counts[deckFormat(d)]++;
  }
  const inBatch = { quad: 0, split: 0, single: 0 };
  for (const d of batch) inBatch[deckFormat(d)]++;
  const parts = FORMATS.map((k) => {
    const pct = total ? Math.round((100 * counts[k]) / total) : 0;
    return `${k} ${inBatch[k]} in batch, ${pct}% of library`;
  });
  const feelings = batch.map((d) => d.feeling ?? "unset");
  const spread = [...new Set(feelings)].map((f) => `${f} ${feelings.filter((x) => x === f).length}`).join(", ");
  return `Formats: ${parts.join(" · ")}. Feelings in batch: ${spread}.`;
}

async function writeSheet(paths: string[], name: string): Promise<void> {
  const W = 216;
  const H = 270;
  const tiles = await Promise.all(paths.map((p) => sharp(p).resize(W, H).toBuffer()));
  const sheetDir = path.join(OUTPUT_DIR, "previews", "character-batch");
  fs.mkdirSync(sheetDir, { recursive: true });
  await sharp({ create: { width: W * tiles.length, height: H, channels: 3, background: "#000" } })
    .composite(tiles.map((input, i) => ({ input, left: i * W, top: 0 })))
    .jpeg({ quality: 82 })
    .toFile(path.join(sheetDir, name));
}

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--only");
if (!dir) throw new Error("Usage: _character-batch.ts <dir> [--check] [--approve] [--only <prefix>] [--no-twin]");
const check = args.includes("--check");
const approve = args.includes("--approve");
const twins = !args.includes("--no-twin");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;

const files = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".json") && (!only || f.startsWith(only)))
  .sort()
  .map((f) => path.join(dir, f));
const decks: Array<{ file: string; deck: Deck }> = [];
const errors: string[] = [];
const softNotes: string[] = [];
for (const file of files) {
  const parsed = DeckSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    errors.push(`${path.basename(file)}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    continue;
  }
  errors.push(...problems(parsed.data, file));
  errors.push(...(await photoProblems(parsed.data, file)));
  softNotes.push(...notes(parsed.data, file));
  decks.push({ file, deck: parsed.data });
}
const hookCounts = new Map<string, number>();
for (const { deck } of decks) {
  for (const h of [deck.hook, deck.hookB].filter((x): x is string => Boolean(x))) {
    hookCounts.set(h.toLowerCase(), (hookCounts.get(h.toLowerCase()) ?? 0) + 1);
  }
}
for (const [hook, n] of hookCounts) if (n > 1) errors.push(`hook used ${n} times: "${hook}"`);
const missingB = decks.filter((d) => !d.deck.hookB).length;

console.log(`${files.length} deck file(s), ${errors.length} problem(s).${missingB ? ` ${missingB} without hookB (Stories twin will try the LLM).` : ""}`);
console.log(formatShareLine(decks.map((d) => d.deck)));
for (const e of errors) console.log(`  ✗ ${e}`);
for (const n of softNotes) console.log(`  · ${n}`);
if (errors.length) process.exit(1);
if (check) process.exit(0);

for (const { file, deck } of decks) {
  const id = await build(deck, approve);
  console.log(`#${id} ${deck.character} ${approve ? "approved" : "queued"} (${deck.beats.length + (deck.ctaIn === "pinned-comment" ? 0 : 1)} slides) ← ${path.basename(file)}`);
  if (!twins) continue;
  const hasTwin = Boolean(parseVariation(getDb().select().from(posts).where(eq(posts.id, id)).get()?.variation).accountTwinId);
  const twin = hasTwin ? await refreshCharacterTwin(id, deck) : await createCharacterTwin(id, deck);
  if (twin.ok) {
    const sheetPaths = getDb().select().from(slides).where(eq(slides.postId, twin.twinId!)).all().sort((a, b) => a.idx - b.idx).map((s) => s.filePath);
    await writeSheet(sheetPaths, `${twin.twinId}-${deck.character}-B.jpg`);
    console.log(`  Stories B #${twin.twinId}${hasTwin ? " re-rendered" : ""}: "${twin.hookB}"`);
  } else {
    console.warn(`  Stories B skipped for #${id}: ${twin.error}`);
  }
}
