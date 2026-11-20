---
name: edit
description: >-
  Finish a Remedy talking-head the way the approved edits were done (mistake,
  band). Use when the user says "use the edit skill" or "edit skill", or asks
  to edit, recut, or finish a talking-head, founder video, or Reel, or names
  Mino Lee. Captions and the header stay as burned in. Not for PT exercise crops.
---

# Edit

Follow these steps in order. Do not skip one, do not write your own pipeline, and do not guess a number that a script can measure. Both approved edits were made exactly this way.

His captions and header are already burned in. Never burn words, and never cover either one. His voice is the track: no music.

## Inputs

- **The take:** the newest `.MP4`/`.mov` in the OneDrive root (`%OneDrive%`). These are 1080x1920, 30 fps.
- **The script:** the numbered tab in Google Doc `16FqQ9YiidQwNAEpGFA7D_VtOBOxfpOyQ12TbgKH1WHk`. Read its Source (the study), On screen, and Teleprompter sections.
- **The slug:** one short word for the video (for example `band`). Everything is named after it.

## Step 1. Set up the work folder

The work folder is `c:\Users\rkuma\remedy\.edit-work\<slug>\`. It is local and never inside OneDrive.

1. Copy into it `reference/transcribe.py`, `reference/measure.py`, and the three files from `reference/band/` (`build_assets.py`, `render.py`, `check.py`).
2. Set `VIDEO` at the top of `build_assets.py` to the take's path.

`reference/band/` is the latest approved edit; start from it. `reference/mistake/` is the earlier approved edit; take the 0–10 scale from it when the video needs one (see Step 4).

## Step 2. Transcribe

`python transcribe.py "<take>"` writes `words.json` and `words.txt` (one word per line with start and end times).

He changes lines while filming, so **every time in this edit comes from `words.txt`**, and card text uses the words he actually said, not the doc's.

## Step 3. Measure the frame

`python measure.py "<take>"` prints three things:

- **Caption y range.** This changes from take to take: the band take was 1149–1214, the mistake take 1268–1321.
- **When the header goes away.**
- **`BOX_TOP`.** That is the caption bottom plus about 90 px. Put it in `build_assets.py`.

Never copy `BOX_TOP` from an older edit. Putting the box 250 px under the captions, down on his hands, is exactly what made a cut get rejected.

## Step 4. Plan the cards

Turn the tab's On screen plan into this list, in this order:

| # | Card | Comes in on | Goes out |
|---|---|---|---|
| 0 | **Hook visual** | already up on frame 0 (start `-0.3`) | end of the hook line |
| 1 | **Paper** | the first word of the study line ("A trial…", "This trial…") | end of the setup line |
| 2 | **Group 1 row** | the word naming what group 1 did | when row 2 comes in, plus 0.15 s |
| 3 | **Groups, both rows** | the first word of group 2 ("the other") | end of the groups line |
| 4 | **Animated result card** | the line that sets up the number ("Over the next 100 days", "Four weeks later") | end of the line that reacts to the result ("That's a crazy difference") |

Cards 2 and 3 overlap and card 3 has `rise=False`, so the new row crossfades in instead of the card coming in again.

**Hook visual.** The first frame must show a real thing, not text.

- If the take opens on an object he holds up or a clip he filmed, that is the hook; skip card 0.
- Otherwise, use one real photo of the thing the hook names, for example a group stretching on mats for "a yoga class won't…".
- Get it from Unsplash, using only photos marked "Free to use under the Unsplash License". Search `unsplash.com/s/photos/<topic>?license=free`, then download from `https://images.unsplash.com/<photo-id>?w=1600&q=85&fm=jpg`.
- Put the photographer and the photo URL in a comment next to `HOOK_PHOTO`.
- It renders full-bleed in the box, 920x560, with rounded corners (`hook_card`).

**Paper.** Use a PubMed heading screenshot (Step 5). Never use a crop from a journal's own site; it came out too small to read.

**Groups.** Each row is a numbered circle (green for group 1, black for group 2) plus a short label in his words, Segoe UI Bold 52.

**Animated result card.** Whenever he says numbers out loud, the card acts them out on his words. Pick the one that fits:

- **Counts, "X of N" (`dots_card`, band).** One dot per person, 18 per row.
  - Row 1 comes in empty. Its X dots light up one by one, starting on the word X, with one soft click each; then the "X of N" label shows.
  - Row 2 crossfades in on the word that names group 2, then lights its dots the same way on its number.
  - The group that did better is green; the other is black.
  - The title is a short phrase for what was counted, in his words.
- **A 0–10 rating (`scale_card`, mistake).** The cells fill dark from "zero" to "10", one soft click per cell. It stays full while he talks. When he names the result, it drains back down to the answer, which turns green with `settle.mp3`.

Space the clicks about 0.1–0.17 s apart, so stretch the fill window past the spoken number if you need to. Ten clicks in half a second sounds like a buzz.

Never use a full-screen black card, an app screenshot (unless he asks), more than one stock photo, a low-resolution crop, handwritten sheets, memes, AI stills, or anything that asks him to act hurt.

## Step 5. PubMed heading screenshot

Use the browser tool.

1. Open `https://pubmed.ncbi.nlm.nih.gov/?term=<first author + title words>`. If there is one match, it goes straight to the article; check `h1.heading-title`.
2. Run this with `Runtime.evaluate`. It leaves only the heading (the type tag, journal, title, and authors):

```js
(()=>{const h=document.querySelector('#full-view-heading');
h.querySelectorAll('.affiliations, .identifiers, .full-text-links-list, .extended-article-details, .full-view-affiliations, .item-list').forEach(e=>e.remove());
let n=h; while(n&&n!==document.body){const p=n.parentElement; if(p)[...p.children].forEach(c=>{if(c!==n)c.style.display='none'}); n=p;}
document.querySelectorAll('*').forEach(e=>{const s=getComputedStyle(e); if((s.position==='fixed'||s.position==='sticky')&&!e.contains(h))e.style.display='none'});
window.scrollTo(0,0);})()
```

3. Take a screenshot, copy it to `previews/pubmed_<slug>.png`, and set `PUBMED_CROP` so it keeps the tag line through the author lines and drops "Affiliations".
4. Open the crop and check that the title is sharp and not clipped on the right.

## Step 6. Fill in the tables

You change only two things:

- **In `build_assets.py`:** `VIDEO`, `BOX_TOP`, `PUBMED`/`PUBMED_CROP`, `HOOK_PHOTO`, the group labels, `DOT_ROWS` (label, total, count, color), the dots title, and the preview times in `main()`.
- **In `render.py`:** the `CUT_A = build_cut(...)` call. Every number in it is a word start or end time from `words.txt`.

Zoom pushes go in the `pushes=` list. Use exactly three, on these lines:

| Push | Starts on | Holds until | Amount | Extra |
|---|---|---|---|---|
| The result | the first word of the big number | the end of that line | 0.07 | `center_y=1300` (a card is up) |
| The lesson | the first word of the line that says what it means | the end of that line | 0.06 | — |
| The ask | the first word of the Remedy line | the last word before the end | 0.05 | `ease_out=0.45` |

`center_y=1300` anchors the zoom to the bottom of the frame, so the captions move up and away from the card. Use it on any push while a card is up. Never push on the hook or the study setup. Pushes make no sound.

Sounds are built by `build_cut` from the card times, so you never place them by hand. Every sound is a standard Mixkit file in `sfx/` (Mixkit License):

| Moment | File | Gain |
|---|---|---|
| A card comes in | `card-in.mp3` | 0.11 |
| A row is added | `box-check.mp3` | 0.14 |
| Each dot or cell lights | `soft-click.mp3` | 0.05 |
| The animation lands on its answer | `settle.mp3` | 0.13 |
| A static results card comes in | `result.mp3` | 0.09 |

- No sound plays at frame 0 or on an exit.
- Never use a synthesized tone, a whoosh, a riser, a noise sweep, a bass hit, or the app chime.
- The mix in `render.py` (silence trim, 9 kHz lowpass, `amix normalize=0`) keeps them about 15 dB under his voice. Do not change it.

## Step 7. Preview gate

1. Run `python build_assets.py`. It saves each card on a real frame at its time, plus `previews/contact_sheet.jpg`.
2. Look at it yourself first. Check that no card covers a caption, the gap between the caption bottom and the card is about 90 px, and the paper is readable.
3. Images in chat do not show up for him, so open the sheet on his screen with `Start-Process previews\contact_sheet.jpg`.
4. Ask him to approve it, and **stop until he does.**

Do not render before he approves.

## Step 8. Render and check

1. Run `python render.py`. It makes `<slug>.mp4` in the work folder, in about a minute.
2. Set `TIMES` in `check.py` to one time inside every card, one during each animation, and one in each push. Run it, look at `check_sheet.jpg`, then open it for him with `Start-Process`.
3. Check all of these:
   - Frame 0 shows the hook visual, and the header is untouched.
   - No card ever covers a caption, even during a push.
   - The dots or cells light on the spoken number.
   - There are exactly three pushes.

## Step 9. Deliver one file

1. Run `Copy-Item <work>\<slug>.mp4 "$env:OneDrive\<slug>.mp4" -Force`. It goes in the OneDrive root, the same level as Apps and Desktop, never in a subfolder.
2. Run `explorer.exe /select,"$env:OneDrive\<slug>.mp4"`.

One cut only: no second account, no alternate timing. Previews, audio, frames, and check sheets stay in the work folder. Nothing else goes in OneDrive.
