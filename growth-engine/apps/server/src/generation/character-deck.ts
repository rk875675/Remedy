/**
 * Character decks (one person, one day): schema, slide rendering, and the
 * Remedy Stories A/B twin. The twin tells the same story with a different hook
 * and a clearly different look so the two accounts never post the same file.
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { eq, or } from "drizzle-orm";
import { experiments, getDb, hooks, posts, slides } from "@remedy-growth/db";
import { BRAND, OUTPUT_DIR, ROOT_DIR } from "../config.js";
import { generateJson } from "./llm.js";
import {
  postOutputDir,
  renderNativePhotoSlide,
  renderNativeScreenshotSlide,
  renderQuadSlide,
  renderSlide,
  renderSplitSlide,
  slideFileName,
  type NativeLook,
  type Quad,
} from "./composer.js";
import { CTA_REVIEW_OPTIONS, pickBestCtaOption, type CtaReviewOption } from "./hooks.js";
import { ensurePostShort } from "./index.js";
import { parseVariation, type Variation } from "./variations.js";
import { ShotSpec } from "./shots.js";
import type { SlideKind } from "./templates.js";
import { captionForNewHook, hooksClearlyDiffer, staysOnSlides, titleForNewHook } from "../learning/experiments.js";

export const PhotoBeat = z
  .object({ photo: z.string().min(1), headline: z.string().min(2), textAt: z.enum(["top", "upper", "lower"]).optional() })
  .strict();
export const ShotBeat = z.object({ screenshot: z.string().min(1), bg: z.string().min(1), headline: z.string().min(2) }).strict();
/** Split-comparison slide: two photos stacked, one sentence across both ("top line / bottom line"). */
export const SplitBeat = z
  .object({
    top: z.string().min(1),
    bottom: z.string().min(1),
    headline: z.string().regex(/\S \/ \S/, 'split headline needs " / " between its halves'),
    grade: z.enum(["contrast", "natural"]).optional(),
    /** Framing for portrait photos re-cut into a band: 0-1 down the source photo where the crop starts. */
    topY: z.number().min(0).max(1).optional(),
    bottomY: z.number().min(0).max(1).optional(),
  })
  .strict();
/** Quad slide: four photos in a 2x2 grid, one line across the middle, an optional short label per cell. */
export const QuadBeat = z
  .object({
    quad: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)]),
    headline: z.string().min(2),
    labels: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1), z.string().min(1)]).optional(),
    /** "edge" (default) puts labels at the outer edge of each cell, clear of faces; "center" puts them mid-cell. */
    labelAt: z.enum(["edge", "center"]).optional(),
    grade: z.enum(["natural", "contrast"]).optional(),
  })
  .strict();
/** The one feeling a deck is built to trigger. Stated up front so copy and photos pull the same way. */
export const DeckFeeling = z.enum(["anger", "curiosity", "mystery", "sadness", "relief", "pride"]);
export type DeckFeelingName = z.infer<typeof DeckFeeling>;
/** Which playbook slot a deck fills (src/learning/playbook.ts), so its result is read back against the plan. */
export const DeckPlan = z
  .object({
    slot: z.enum(["exploit", "explore"]),
    /** Explore slots name their test in assets/playbook/tests.json. */
    test: z.string().optional(),
    arms: z.record(z.string(), z.string()).default({}),
  })
  .strict();
export const DeckSchema = z
  .object({
    character: z.string().regex(/^[a-z]+$/),
    postId: z.number().int().optional(),
    hook: z.string().min(8),
    /** Stories A/B hook: same moment, different sentence. */
    hookB: z.string().min(8).optional(),
    feeling: DeckFeeling.optional(),
    title: z.string().min(55).max(88),
    caption: z.string().min(200),
    hashtags: z.string().regex(/#backpain/),
    // 4 = split cover + 2 photos + app slide (the result moved into the cover's bottom half).
    // 2 only for the two-slide test (cover + app slide); `_character-batch.ts` enforces which.
    beats: z.array(z.union([PhotoBeat, ShotBeat, SplitBeat, QuadBeat])).min(2).max(9),
    /** How every photo in `beats` was (or is to be) generated. `_shot-prompts.ts` compiles these into exact briefs. */
    shots: z.array(ShotSpec).optional(),
    plan: DeckPlan.optional(),
    /** "pinned-comment" (explore test only): no CTA slide; the locked CTA headline goes in the YouTube pinned comment. */
    ctaIn: z.enum(["slide", "pinned-comment"]).optional(),
  })
  .strict();
export type Deck = z.infer<typeof DeckSchema>;
export type DeckBeat = Deck["beats"][number];

/** Which slide format a deck leads with (its cover decides what the viewer sees in the feed). */
export function deckFormat(deck: Deck): "quad" | "split" | "single" {
  if (deck.beats.some((b) => "quad" in b)) return "quad";
  if (deck.beats.some((b) => "top" in b)) return "split";
  return "single";
}

/** Every photo a deck shows (quad cells, split halves, single photos), in order. */
export function deckPhotos(deck: Deck): string[] {
  return deck.beats.flatMap((b) => ("photo" in b ? [b.photo] : "top" in b ? [b.top, b.bottom] : "quad" in b ? [...b.quad] : []));
}

export const BANNED = [/\bfree\b/i, /\bremedy\b/i, /\bcured?\b/i, /\bforever\b/i, /\bphysical therapist\b/i, /\bPT\b/, /\bguarantee/i, /that'?s you/i, /\bthis is the\b/i];

export function characterDir(character: string): string {
  return path.join(ROOT_DIR, "assets", "characters", character);
}

const DECK_SOURCE_DIR = path.join(OUTPUT_DIR, "decks");

/** Post folders get pruned to slides only, so the deck source lives outside them. */
export function saveDeckSource(postId: number, deck: Deck): void {
  fs.mkdirSync(DECK_SOURCE_DIR, { recursive: true });
  fs.writeFileSync(path.join(DECK_SOURCE_DIR, `${postId}.json`), JSON.stringify({ ...deck, postId }, null, 2));
}

export function loadDeckSource(postId: number): Deck | null {
  const file = path.join(DECK_SOURCE_DIR, `${postId}.json`);
  if (!fs.existsSync(file)) return null;
  const parsed = DeckSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  return parsed.success ? parsed.data : null;
}

/** YouTube pinned comment for a pinned-comment CTA deck: the locked CTA headline plus the store link. */
export function pinnedCtaComment(postId: number): string | undefined {
  const deck = loadDeckSource(postId);
  if (deck?.ctaIn !== "pinned-comment") return undefined;
  return `${pickBestCtaOption(deck.hook).headline}\n\n${BRAND.listingName} on the App Store: ${BRAND.appStoreUrl}`;
}

/** Problems with a Stories hook, or [] when it is usable. */
export function hookBProblems(deck: Deck, hookB: string): string[] {
  const out: string[] = [];
  const split = "top" in deck.beats[0]!;
  const halves = (s: string): string[] => s.split(" / ").map((h) => h.trim());
  if (split) {
    // Split covers: the halves may share the result line, so compare the top line and cap each half.
    if (!/\S \/ \S/.test(hookB)) out.push(`hookB for a split cover needs " / ": "${hookB}"`);
    else {
      if (!hooksClearlyDiffer(halves(deck.hook)[0]!, halves(hookB)[0]!)) out.push(`hookB top line too close to hook: "${hookB}"`);
      if (halves(hookB).some((h) => h.split(/\s+/).length > 12)) out.push(`hookB half over 12 words: "${hookB}"`);
    }
  } else {
    if (!hooksClearlyDiffer(deck.hook, hookB)) out.push(`hookB too close to hook: "${hookB}"`);
    if (hookB.trim().split(/\s+/).length > 12) out.push(`hookB over 12 words: "${hookB}"`);
  }
  if (!staysOnSlides(hookB, [deck.hook, ...deck.beats.slice(1).map((b) => b.headline)])) out.push(`hookB drifts off the slides: "${hookB}"`);
  for (const re of BANNED) if (re.test(hookB)) out.push(`banned wording ${re} in hookB`);
  return out;
}

const HookBSchema = z.object({ hook: z.string().min(8) }).strict();

async function writeHookB(deck: Deck): Promise<string | null> {
  const later = deck.beats.slice(1).map((b) => `- ${b.headline}`).join("\n");
  const result = await generateJson(
    `A TikTok photo carousel told by one person about their back. Cover line:
"${deck.hook}"
The other slides:
${later}

Write ONE different cover line for an A/B test: same person, same moment, same activity, first person, lowercase, casual, 5-12 words.
Lead with a different detail or angle. Do not reuse the first three words. No emojis, no brand name, no "free", no "cure".
Return JSON: {"hook":"..."}`,
    HookBSchema,
  );
  if (!result) return null;
  return hookBProblems(deck, result.hook).length ? null : result.hook.trim();
}

/** Split covers carry "top / bottom"; captions and titles read it as one sentence. */
function spoken(hook: string): string {
  return hook.replace(" / ", ", ");
}

/** A different CTA option from the original's, still one of the locked review options. */
function ctaForTwin(hookA: string, hookB: string): CtaReviewOption {
  const a = pickBestCtaOption(hookA);
  const b = pickBestCtaOption(hookB);
  if (b.label !== a.label) return b;
  const i = CTA_REVIEW_OPTIONS.findIndex((o) => o.label === a.label);
  return CTA_REVIEW_OPTIONS[(i + 1) % CTA_REVIEW_OPTIONS.length]!;
}

/** Render every slide (beats + locked CTA) and write the slide rows. Returns slide paths. */
export async function renderDeckSlides(
  deck: Deck,
  postId: number,
  opts: {
    look: NativeLook;
    hook: string;
    cta: CtaReviewOption;
    variation: Variation;
    /** Render here instead of the post's folder and write no slide rows (previews). */
    previewDir?: string;
  },
): Promise<string[]> {
  const db = getDb();
  const record = (row: typeof slides.$inferInsert): void => {
    if (!opts.previewDir) db.insert(slides).values(row).run();
  };
  const charDir = characterDir(deck.character);
  const outDir = opts.previewDir ?? postOutputDir(postId);
  fs.mkdirSync(outDir, { recursive: true });
  // Candidates for the B twin's app-slide background: single photos, split bottoms, and the last cell of each quad.
  const photos = deck.beats.flatMap((b) => ("photo" in b ? [b.photo] : "top" in b ? [b.bottom] : "quad" in b ? [b.quad[3]] : []));
  const paths: string[] = [];
  for (let i = 0; i < deck.beats.length; i++) {
    const beat = deck.beats[i]!;
    const headline = i === 0 ? opts.hook : beat.headline;
    const out = path.join(outDir, slideFileName(i));
    if ("photo" in beat) {
      await renderNativePhotoSlide(path.join(charDir, beat.photo), headline, out, { hook: i === 0, textAt: beat.textAt ?? "top", look: opts.look });
      record({ postId, idx: i, kind: "photo_person", headline, sub: "", screenshot: null, filePath: out });
    } else if ("top" in beat) {
      await renderSplitSlide(path.join(charDir, beat.top), path.join(charDir, beat.bottom), headline, out, { hook: i === 0, look: opts.look, grade: beat.grade, topY: beat.topY, bottomY: beat.bottomY });
      record({ postId, idx: i, kind: "photo_person", headline, sub: "", screenshot: null, filePath: out });
    } else if ("quad" in beat) {
      const cells = beat.quad.map((p) => path.join(charDir, p)) as Quad<string>;
      await renderQuadSlide(cells, headline, out, { labels: beat.labels, labelAt: beat.labelAt, hook: i === 0, look: opts.look, grade: beat.grade });
      record({ postId, idx: i, kind: "photo_person", headline, sub: "", screenshot: null, filePath: out });
    } else {
      // B uses another photo from the same deck behind the app screen.
      const bg = opts.look === "B" ? (photos.find((p) => p !== beat.bg) ?? beat.bg) : beat.bg;
      await renderNativeScreenshotSlide(path.join(charDir, bg), beat.screenshot, headline, out, opts.look);
      record({ postId, idx: i, kind: "screenshot", headline, sub: "", screenshot: beat.screenshot, filePath: out });
    }
    paths.push(out);
  }
  if (deck.ctaIn === "pinned-comment") return paths;
  const ctaIdx = deck.beats.length;
  const ctaOut = path.join(outDir, slideFileName(ctaIdx));
  await renderSlide(
    { kind: "cta" as SlideKind, headline: opts.cta.headline, sub: opts.cta.sub, screenshot: opts.cta.screenshot, index: ctaIdx, total: ctaIdx + 1 },
    opts.variation,
    ctaOut,
  );
  record({ postId, idx: ctaIdx, kind: "cta", headline: opts.cta.headline, sub: opts.cta.sub, screenshot: opts.cta.screenshot, filePath: ctaOut });
  paths.push(ctaOut);
  return paths;
}

export interface TwinResult {
  ok: boolean;
  twinId?: number;
  hookB?: string;
  error?: string;
}

/**
 * Remedy Stories copy of a Recoveries character deck, kept as an A/B record.
 * It is not scheduled. Stories does not receive slideshows.
 */
export async function createCharacterTwin(postId: number, deckIn?: Deck): Promise<TwinResult> {
  const db = getDb();
  const post = db.select().from(posts).where(eq(posts.id, postId)).get();
  if (!post) return { ok: false, error: `Post ${postId} not found` };
  const variation = parseVariation(post.variation);
  if (!variation.characterId) return { ok: false, error: "Not a character deck" };
  if (variation.zernioSlot === "2" || variation.accountTwinOf) return { ok: false, error: "Already a Stories post" };
  if (variation.accountTwinId) return { ok: false, error: `Already has twin #${variation.accountTwinId}` };
  const future = post.scheduledAt ? Date.parse(post.scheduledAt) > Date.now() + 15 * 60_000 : true;
  if (!["queued", "approved"].includes(post.status) && !(post.status === "published" && future)) {
    return { ok: false, error: `Post ${postId} is ${post.status}` };
  }
  const deck = deckIn ?? loadDeckSource(postId);
  if (!deck) return { ok: false, error: "No deck source for this post" };

  let hookB = deck.hookB?.trim() ?? "";
  if (!hookB || hookBProblems(deck, hookB).length) hookB = (await writeHookB(deck)) ?? "";
  if (!hookB) return { ok: false, error: "No usable hookB (add hookB to the deck JSON)" };

  const cta = ctaForTwin(deck.hook, hookB);
  const twinVariation: Variation = {
    ...variation,
    zernioSlot: "2",
    accountTwinOf: post.id,
    ctaLayout: cta.layout,
    ctaAtmosphere: cta.atmosphere,
  };
  delete twinVariation.accountTwinId;
  delete twinVariation.shortBed;

  const parentHook = db.select().from(hooks).where(eq(hooks.id, post.hookId)).get();
  const newHook = db
    .insert(hooks)
    .values({ text: hookB, category: parentHook?.category ?? "story", formulaId: null, source: "evolved", parentHookId: post.hookId, status: "used" })
    .returning()
    .get();
  if (!newHook) return { ok: false, error: "Could not insert hookB" };

  const twin = db
    .insert(posts)
    .values({
      hookId: newHook.id,
      templateId: post.templateId,
      variation: twinVariation,
      caption: captionForNewHook(post.caption, spoken(deck.hook), spoken(hookB)),
      tiktokTitle: titleForNewHook(post.tiktokTitle, spoken(hookB)),
      hashtags: post.hashtags,
      platforms: [],
      status: post.status === "queued" ? "queued" : "approved",
      confidence: post.confidence,
      scheduledAt: null,
    })
    .returning()
    .get();
  if (!twin) return { ok: false, error: "Could not insert twin post" };

  let paths: string[];
  try {
    paths = await renderDeckSlides(deck, twin.id, { look: "B", hook: hookB, cta, variation: twinVariation });
  } catch (err) {
    db.delete(slides).where(eq(slides.postId, twin.id)).run();
    db.delete(posts).where(eq(posts.id, twin.id)).run();
    db.delete(hooks).where(eq(hooks.id, newHook.id)).run();
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  saveDeckSource(twin.id, { ...deck, hook: hookB });
  await ensurePostShort(twin.id, paths, true).catch((err) => {
    console.warn(`Stories short skipped for #${twin.id}:`, err instanceof Error ? err.message : err);
  });

  const open = db
    .select()
    .from(experiments)
    .where(or(eq(experiments.postAId, post.id), eq(experiments.postBId, post.id)))
    .all()
    .find((e) => e.status !== "cancelled");
  if (!open) {
    db.insert(experiments)
      .values({
        postAId: post.id,
        postBId: twin.id,
        dimension: "hook",
        variableDetail: {
          a: deck.hook,
          b: hookB,
          note: "Recoveries A vs Stories B: new hook plus look B (tilted, re-framed, boxed captions, other app bg and CTA). Same story.",
        },
        status: "pending",
      })
      .run();
  }
  db.update(posts).set({ variation: { ...variation, accountTwinId: twin.id } }).where(eq(posts.id, post.id)).run();
  return { ok: true, twinId: twin.id, hookB };
}

/**
 * Re-render an existing Stories twin after its Recoveries deck changed (new photos,
 * new beats). Keeps the twin's id, hook and experiment; only the slides
 * and the short are rebuilt, with the same look B and the same CTA choice.
 */
export async function refreshCharacterTwin(aPostId: number, deck: Deck): Promise<TwinResult> {
  const db = getDb();
  const a = db.select().from(posts).where(eq(posts.id, aPostId)).get();
  if (!a) return { ok: false, error: `Post ${aPostId} not found` };
  const twinId = parseVariation(a.variation).accountTwinId;
  if (!twinId) return { ok: false, error: "No twin to refresh" };
  const twin = db.select().from(posts).where(eq(posts.id, twinId)).get();
  if (!twin) return { ok: false, error: `Twin ${twinId} not found` };
  if (!["queued", "approved"].includes(twin.status)) return { ok: false, error: `Twin #${twinId} is ${twin.status}; not re-rendering a sent post` };
  const hookB = db.select().from(hooks).where(eq(hooks.id, twin.hookId)).get()?.text ?? deck.hookB ?? "";
  if (!hookB) return { ok: false, error: "Twin has no hook text" };
  const twinVariation = parseVariation(twin.variation);
  const cta = ctaForTwin(deck.hook, hookB);
  db.delete(slides).where(eq(slides.postId, twinId)).run();
  const paths = await renderDeckSlides(deck, twinId, { look: "B", hook: hookB, cta, variation: twinVariation });
  saveDeckSource(twinId, { ...deck, hook: hookB, postId: twinId });
  await ensurePostShort(twinId, paths, true).catch((err) => {
    console.warn(`Stories short skipped for #${twinId}:`, err instanceof Error ? err.message : err);
  });
  return { ok: true, twinId, hookB };
}

