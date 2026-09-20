---
name: pt-video-crop-center
description: >-
  Crop and center the subject in Remedy PT exercise videos using a computed
  (measured, verified) crop instead of manual trial-and-error. Use whenever the
  user asks to crop, center, zoom, re-frame, or fix framing on an exercise/PT
  video, or mentions a video looking "off-center," "too zoomed in," or with the
  subject cut off.
---

# PT Video Crop & Center

## Why this exists

Manual crop sweeps (guess an x/y offset → extract a preview frame → look → guess
again) fail on these videos because **the subject moves during the rep** (hinge,
squat, thrust, lift). A crop that looks centered on frame 1 can clip her head or
feet at the extreme of the rep. Past attempts on this repo did dozens of blind
parameter sweeps per video (see `scripts/output/_video_audit/kb_*.jpg` for the
history) and still shipped bad crops, because nothing measured the subject's
actual position across the *whole* clip or verified the result before calling it
done.

This skill replaces guessing with measurement:
1. Sample frames across the **entire clip duration**, not just the first frame.
2. Run background-removal (`rembg`) on each sample to get the subject's real
   pixel bounding box.
3. **Union** those boxes — this is the full range-of-motion envelope the crop
   must contain.
4. Compute the crop mathematically from that envelope + padding.
5. Apply it, then **re-measure the actual output** and refuse to declare success
   if anything is clipped.

All tooling is in `scripts/crop_center.py` (repo deps only: `rembg`, `opencv-python`,
`Pillow`, `numpy`, `ffmpeg` — already installed in this repo, do not install anything
new without asking first per project rules).

## Workflow — follow every step, every video

```
Progress:
- [ ] 1. Locate source video + confirm which exercise/file
- [ ] 2. Run `analyze` (--samples 20 minimum, covers full clip)
- [ ] 3. Read the *_contact_src.jpg contact sheet — sanity-check rembg actually
         found the subject (red box) in every tile, and note edge_warnings
- [ ] 4. Decide padding / whether a forced --ar is actually needed (usually not —
         see "Choosing padding and AR" below)
- [ ] 5. Run `apply`
- [ ] 6. Run `verify`
- [ ] 7. Read the *_contact_cropped.jpg — this is the real gate, not the exit code
- [ ] 8. If verify fails or the contact sheet looks wrong, fix the INPUT (padding,
         AR, or accept a documented source limitation) and go back to step 5.
         Never hand-tune x/y offsets directly — recompute from the measurement.
- [ ] 9. Only after both automated verify passes AND the contact sheet looks right
         to the eye: replace the file / hand off for upload.
```

### Step 2 — analyze

```bash
python .cursor/skills/pt-video-crop-center/scripts/crop_center.py analyze "<source.mp4>" --samples 20 --pad 0.15
```
Writes `<name>_report.json` and `<name>_contact_src.jpg` next to the source (in a
`_crop_audit/` folder by default, override with `--out`).

### Step 3 — read the contact sheet

Actually open the `_contact_src.jpg` image (use the Read tool). Every tile should
show a red box tightly hugging the subject. If a tile says "NO DETECTION" or the
red box is clearly wrong (grabbed background/shadow instead of the person), **stop**
— rembg isn't reading this video reliably (e.g. very low contrast, heavy motion
blur, cluttered background). Don't proceed to a computed crop; fall back to manual
frame-by-frame review for that one video and say so.

Also read the printed `edge_warnings` / `fit_warning`. If the subject already
touches a source frame edge (e.g. feet cut at the bottom in the *source* footage),
there is no way to add padding on that side without inventing pixels — cropping
software cannot fix a too-tight original recording. Don't try to force it.
If `edge_warnings` mentions a baked-in letterbox/pillarbox margin, that's a real
black region in the source pixels (not a player artifact) — the crop is already
clamped to exclude it, nothing further to do.

### Step 4 — choosing padding and AR

- **Default: let `--ar` default to `20:13` (~1.538). Do not omit it.** The app's
  real video player (`app/session/[id].tsx`) renders the video in a container
  sized `width=SCREEN_WIDTH, height=SCREEN_WIDTH*0.65` with `contentFit="cover"`.
  `cover` scales the video up until it fills that box and crops whatever
  overflows — so if the crop's own aspect ratio doesn't already match ~1.538,
  the player does *additional*, uncontrolled cropping on top of ours. A tight
  portrait crop (subject filling most of the frame) looks perfect in the
  contact sheet and then looks "way too zoomed in" on device, because `cover`
  had to blow it up to fill the landscape box and cropped away most of the
  height to do it. This happened for real — see the "way too zoomed in" batch
  fixed in this repo's history. **Only pass `--ar none`** for a one-off export
  that will genuinely not go through that player.
- `analyze` also auto-detects baked-in black letterbox/pillarbox margins (some
  Kling source clips have real black pixels at the edges, not a player
  artifact) and clamps the crop to exclude them — this is automatic, no flag
  needed. Check `edge_warnings` in the printed output / report.json for
  `has_letterbox` if a video looks like it's not filling the frame horizontally
  or vertically in the *source*.
- `--pad` (default `0.15`) is fraction of the subject's measured bbox size added
  as margin on each side. Increase (e.g. `0.25`) if a video still feels tight;
  decrease (e.g. `0.08`) for a tighter close-up shot. Because `--ar` is coupled
  by default, increasing pad mostly grows the frame around the subject on the
  *short* axis (usually vertical, since our subjects are tall/narrow and 20:13
  is landscape) — that's expected. Never tune this by re-running ffmpeg with
  hand-picked x/y — always go through `analyze` again so the union bbox math is
  redone.

### Step 5 — apply

```bash
python .cursor/skills/pt-video-crop-center/scripts/crop_center.py apply "<name>_report.json" --out "<name>_cropped.mp4"
```

### Step 6 — verify (the actual gate)

```bash
python .cursor/skills/pt-video-crop-center/scripts/crop_center.py verify "<name>_cropped.mp4" "<name>_report.json"
```
Re-samples the *cropped* output at the same relative timestamps, re-runs rembg,
and fails (non-zero exit + prints exact timestamp/edge) if the subject's margin
from any edge drops below `--min-margin` (default 3% of frame dimension) at any
sampled point.

**Reading a FAIL correctly:** a fail with **exactly 0px margin** on an axis that
`analyze` already flagged in `edge_warnings` (subject touching a *source* edge)
means the crop is as good as the source allows — not clipped, just tight. A fail
with a **negative** margin, or on an axis with no edge_warning, means something is
actually cut off — that's a real bug, go back and fix padding/AR.

### Step 7 — the human/visual gate

Read `<name>_contact_cropped.jpg`. This is mandatory — the numeric verify check
can pass while the framing still looks bad (e.g. subject too small/too large in
frame, awkward crop of equipment). Confirm by eye:
- Subject fully visible, roughly centered, at every sampled timestamp (not just
  the first frame — scan the whole grid).
- Consistent margin around her at the ROM extremes (deepest bend, full lockout,
  etc.), not just at rest.
- No cut-off limbs/equipment (kettlebell, dumbbell) that are part of the exercise.

Only after this passes: hand off the cropped file for upload (Supabase Storage /
Cloudflare Stream) per `scripts/tracker.md`'s "After export" step.

## Script reference

`scripts/crop_center.py` — see its module docstring (`--help` on any subcommand)
for full flag list. Three subcommands: `analyze`, `apply`, `verify`. Never write a
one-off ffmpeg crop command by hand for these videos — always go through this
tool so every crop is measured and every result is re-verified the same way.
