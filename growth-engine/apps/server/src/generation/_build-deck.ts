import fs from "node:fs";
import path from "node:path";
import { asc, eq } from "drizzle-orm";
import { getDb, posts, slides } from "@remedy-growth/db";
import { OUTPUT_DIR, ROOT_DIR } from "../config.js";
import { renderNativePhotoSlide, renderNativeScreenshotSlide, renderSlide } from "./composer.js";
import { parseVariation } from "./variations.js";
import type { SlideKind } from "./templates.js";

interface PhotoBeat { photo: string; headline: string; sub: string; textAt: "top" | "upper" | "lower" }
interface ShotBeat { screenshot: string; headline: string; sub: string }
interface CtaBeat { cta: true }
type Beat = PhotoBeat | ShotBeat | CtaBeat;

const deckPath = process.argv[2];
if (!deckPath) throw new Error("Usage: tsx _build-deck.ts <deck.json>");
const deck = JSON.parse(fs.readFileSync(deckPath, "utf8")) as {
  name: string;
  postId: number;
  character: string;
  beats: Beat[];
};
const db = getDb();
const post = db.select().from(posts).where(eq(posts.id, deck.postId)).get();
if (!post) throw new Error(`Post ${deck.postId} missing`);
const variation = parseVariation(post.variation);
const cta = db.select().from(slides).where(eq(slides.postId, deck.postId)).orderBy(asc(slides.idx)).all().find((s) => s.kind === "cta");
const outDir = path.join(OUTPUT_DIR, "previews", "character-test", deck.name);
fs.mkdirSync(outDir, { recursive: true });
const anchor = path.join(ROOT_DIR, "assets", "characters", deck.character, "anchor.jpg");
const slidesOut: Array<{ kind: string; headline: string; sub: string; screenshot?: string | null }> = [];

for (let i = 0; i < deck.beats.length; i++) {
  const beat = deck.beats[i]!;
  const out = path.join(outDir, `slide-${i + 1}.jpg`);
  if ("photo" in beat) {
    await renderNativePhotoSlide(path.join(ROOT_DIR, "assets", "characters", deck.character, beat.photo), beat.headline, out, { hook: i === 0, textAt: beat.textAt });
    slidesOut.push({ kind: "photo_person", headline: beat.headline, sub: "" });
  } else if ("screenshot" in beat) {
    await renderNativeScreenshotSlide(anchor, beat.screenshot, beat.headline, out);
    slidesOut.push({ kind: "screenshot", headline: beat.headline, sub: "", screenshot: beat.screenshot });
  } else {
    if (!cta) throw new Error(`Post ${deck.postId} has no CTA slide`);
    await renderSlide(
      { kind: "cta" as SlideKind, headline: cta.headline, sub: cta.sub, screenshot: cta.screenshot, index: i, total: deck.beats.length },
      variation,
      out,
    );
    slidesOut.push({ kind: "cta", headline: cta.headline, sub: cta.sub, screenshot: cta.screenshot });
  }
  console.log(out);
}
fs.writeFileSync(path.join(outDir, "slides.json"), JSON.stringify(slidesOut, null, 2));
