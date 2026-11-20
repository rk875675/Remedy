---
name: meme-format-decompose
description: Split a TikTok/CapCut overlay meme into its exact original background photo and a clean transparent GIF of the moving character, for the Growth Engine Memes library. Use when the user asks to add a format to memes, extract/cut out the GIF, find the exact background, or fix a format's parts.
---

# Meme format decompose

CapCut overlay memes = **still photo** + **moving cutout** (green-screen character) + **burned-in hook text**.
The right outputs are the **original photo found online** (never rebuilt/inpainted) and the **character cut
against that photo** (difference matte). Generic segmentation (rembg) grabs props and emoji; do not ship it.

Everything runs from `growth-engine/`. Work files live in `.work/meme-decompose/<id>/` (gitignored).

## Steps

1. **Start** (new link or existing id):
   ```powershell
   python scripts/import-format-study.py "<tiktok url>" --hook "<hook text>"   # new: adds catalog entry
   python scripts/meme_decompose/run.py <format-id>                           # existing
   ```
   Exit 3 = expected: it built the exact-pixel plate and wrote Lens query crops to
   `apps/web/public/memes/format-library/<id>/_verify/lens_query_*.jpg`.

2. **Publish the crops** so Lens can fetch them: `npm run deploy`. Note the `https://<hash>.remedy-growth.pages.dev` URL.

3. **Lens each crop** (start with `lens_query_full.jpg`, then `_lower`, `_right`, `_left` until verified):
   - `browser_navigate` to `https://lens.google.com/uploadbyurl?url=<deploy url>/memes/format-library/<id>/_verify/lens_query_full.jpg`
   - `browser_cdp` → `Runtime.evaluate` with `returnByValue: true, awaitPromise: true` and the exact `LENS_JS`
     string from `scripts/meme_decompose/lens_harvest.py`. The response is saved to a file; note its path.

4. **Verify**: `python scripts/meme_decompose/find_bg.py .work/meme-decompose/<id> <dump1.json> [<dump2.json> ...]`
   - Exit 0 = `VERIFIED <url> (WxH, inliers N)`. Continue.
   - Exit 2 = right photo but smaller than the video. Find a bigger copy (open the page in `bg_matches.json`,
     try other Lens crops), pass it with `--url <img url>`.
   - Exit 1 = no match. Lens the other crops and rerun with all dumps. Do **not** substitute a "similar" image.

5. **Finish**: `python scripts/meme_decompose/run.py <format-id>` → mattes, runs gates, publishes
   `02-background.jpg` + `03-motion.gif`, updates `assets/memes/format-library.json`.
   Exit 4 = a gate failed; read the message, do not publish by hand.

6. **Look before deploying**: read `_verify/qa_motion_on_green.jpg` (character only: no shelves, fruit,
   text, emoji, no green holes in clothing) and `02-background.jpg` (no text, no character). Then `npm run deploy`.

## What "verified" means (don't loosen)

- Background: SIFT + RANSAC homography vs the recovered plate, ≥ 40 inliers, ≥ 25% inlier ratio, mean
  error ≤ 12, covers the frame, and at least video resolution. Unrelated stock photos score < 15 inliers.
- GIF: recomposite MAE ≤ 2.5, hook text/emoji leak ≤ 0.2%, < 24 MB (Pages limit).

## Don't

- Don't inpaint or median-rebuild a background and call it the original.
- Don't use rembg/segmentation output as the GIF; it is only a fallback for clips with a moving background.
- Don't use templates.meme / stock green screens / CapCut previews as substitutes.
- Don't put work files under `apps/web/public` (everything there deploys).

## When Lens has no exact photo

Some rooms only exist with the caption or a person burned in (office, exam room). Then, and only then:

1. Build the cleanest plate from the clip (`plate.py`, or the most-common color per pixel across frames) and a white-on-black mask of just the caption strokes and the leftover person.
2. Inpaint with Nano Banana 2.1 on Higgsfield (`is_inpaint: true`, the plate as `image_references`, the mask as `mask`, 2k, thinking `high`). Prompt: fill only the masked pixels to match the room, no text, no new objects.
3. Resize the result to the plate size (if the output aspect differs, align it with a SIFT homography first) and paste **only** the dilated mask pixels onto the plate. Every other pixel stays original.
4. Look at full frame and close crops for ghost letters and smears. Do a second small pass on leftovers instead of widening the first mask.
5. Caption the part "Original photo. Only the ___ was filled, matched to ___."

## When the background moves (rare)

If `plate_report.json` `known_fraction` < 0.4 or `qa_background_vs_plate.jpg` shows a different scene, the
background is video, not a still. Stop and tell the user; this pipeline assumes a still photo.
