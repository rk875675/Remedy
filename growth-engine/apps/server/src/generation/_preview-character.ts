import path from "node:path";
import fs from "node:fs";
import { asc, eq } from "drizzle-orm";
import { getDb, posts, slides } from "@remedy-growth/db";
import { OUTPUT_DIR, ROOT_DIR } from "../config.js";
import { renderNativePhotoSlide, renderNativeScreenshotSlide, renderSlide } from "./composer.js";
import { parseVariation } from "./variations.js";
import type { SlideKind } from "./templates.js";

/** Preview only: one character per slideshow, native photo slides, real app + locked CTA slides from the post. */
type Beat = { photo: string; headline: string; sub: string; textAt: "top" | "upper" | "lower" } | { fromSlideIdx: number };

const DECKS: Array<{ name: string; postId: number; character: string; beats: Beat[] }> = [
  {
    name: "dana-238",
    postId: 238,
    character: "dana",
    beats: [
      { photo: "hook-couch-wince.jpg", headline: "Can't stand up without your hands? Do this.", sub: "", textAt: "lower" },
      { photo: "chair-hands-push.jpg", headline: "That's you, hands pushing off the chair.", sub: "Your legs and hips did not do the stand.", textAt: "lower" },
      { photo: "chair-arms-crossed.jpg", headline: "Stand five times with hands off the chair.", sub: "Arms crossed. Feet flat. Push through the heels. Sit back slow.", textAt: "lower" },
      { photo: "couch-stand-easy.jpg", headline: "Do it after every long sit.", sub: "Five slow stands. That's the whole set.", textAt: "lower" },
      { fromSlideIdx: 4 },
      { fromSlideIdx: 5 },
    ],
  },
  {
    name: "marcus-236",
    postId: 236,
    character: "marcus",
    beats: [
      { photo: "hook-laundry-wince.jpg", headline: "Why your back hurts when you bend.", sub: "", textAt: "top" },
      { photo: "bend-rounded.jpg", headline: "That is you, rounding to pick it up.", sub: "Hips stay locked. Your low back takes it.", textAt: "top" },
      { photo: "bend-hinge.jpg", headline: "Push your hips back when you bend.", sub: "Soft knees. Long spine. The back stays quiet.", textAt: "top" },
      { photo: "carry-close.jpg", headline: "Keep what you lift close to you.", sub: "A far reach makes the low back do it.", textAt: "lower" },
      { fromSlideIdx: 5 },
      { fromSlideIdx: 7 },
    ],
  },
];

const db = getDb();
for (const deck of DECKS) {
  const post = db.select().from(posts).where(eq(posts.id, deck.postId)).get();
  if (!post) throw new Error(`Post ${deck.postId} missing`);
  const variation = parseVariation(post.variation);
  const rows = db.select().from(slides).where(eq(slides.postId, deck.postId)).orderBy(asc(slides.idx)).all();
  const outDir = path.join(OUTPUT_DIR, "previews", "character-test", deck.name);
  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < deck.beats.length; i++) {
    const beat = deck.beats[i]!;
    const out = path.join(outDir, `slide-${i + 1}.jpg`);
    if ("photo" in beat) {
      await renderNativePhotoSlide(path.join(ROOT_DIR, "assets", "characters", deck.character, beat.photo), beat.headline, out, { hook: i === 0, textAt: beat.textAt });
    } else {
      const row = rows.find((r) => r.idx === beat.fromSlideIdx);
      if (!row) throw new Error(`Post ${deck.postId} has no slide ${beat.fromSlideIdx}`);
      if (row.kind === "screenshot" && row.screenshot) {
        const bg = path.join(ROOT_DIR, "assets", "characters", deck.character, "anchor.jpg");
        await renderNativeScreenshotSlide(bg, row.screenshot, row.headline, out);
        console.log(out);
        continue;
      }
      await renderSlide(
        { kind: row.kind as SlideKind, headline: row.headline, sub: row.sub, screenshot: row.screenshot, index: i, total: deck.beats.length },
        variation,
        out,
      );
    }
    console.log(out);
  }
}
