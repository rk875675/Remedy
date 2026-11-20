---
name: meme-make
description: Find, dissect, rewrite, build, and iterate Remedy format memes (still background + GIF cutout + caption + sound) in the Growth Engine. Use when the user asks to make memes, build a meme from a format, swap a meme's GIF, text, music, or background, make variants, find new meme formats or GIFs, or log how a meme did.
---

# Meme make

A format meme is four layers: a still **background**, a moving **GIF** cutout, a **caption**, and a **sound**.
We take a format that already went viral, keep its mechanic, and make the joke about a back-pain moment.

Everything runs from `growth-engine/`. The loop has five stages. Do them in order.

## 1. Find

Where formats come from:
- The **Formats** inbox on the phone (`#formats`). The user drops TikTok or Reel links there. That list is the source of truth (R2 `growth/format-refs.json`). Never re-add links the user deleted.
- When asked to find new ones: TikTok and Instagram searches for "pov", "how X expects", "doctor:", "me at", CapCut templates, and accounts that post overlay memes (thememesclub01, memesource060, povthatsme).

What the user has kept so far (Nov 2026): office, grocery store, Carlton at a wedding, Kermit "stretches". Real places, a famous live-action or Muppet character moving big, one caption on top. Rejected: the cartoon (Squidward), the waist-up box lift, Napoleon. Look for more of the kept shape first.

Best source so far is the top posts of overlay accounts, not TikTok search (search returns creators acting out trends, which can't be split into parts). Open `tiktok.com/@<account>`, scroll, keep posts over 100K views, and look at their covers before adding. Proven accounts: thememesclub01 (its "Me + Bestie" duo overlays hit 12M, 2.9M, 1.4M), memesource060, povthatsme. tikwm search and account endpoints return 403 now; use the browser on public pages only.

Duo overlays ("Me" and "Bestie" labels over two cutouts) map straight onto back pain: "Me" and "My back". The second character is the back. Do not name a product, a pad, or a brace.

Add finds to the inbox by writing R2 `growth/format-refs.json` (`{id: uuid, url, note, createdAt}`, newest first, max 100). Put the views and the back-pain slot idea in `note` (200 characters max).

A format qualifies when all of these are true:
- It is one of: an **overlay** (still photo, cutout, burned-in line), a **GIF** (the moving picture is the whole joke), or a **clip** (a short video with one burned-in line). A real creator talking to camera is a reference card only.
- The joke is a **slot** we can refill: "Doctor: ___ / Me:", "How ___ expects us to ___", "When you ___ and ___", "Why did I ___".
- A back-pain moment fits the slot without forcing it (standing up, bending, lifting, sleeping, sitting all day, stretches, doctor visits).
- It has real reach: 300K+ views, or the user says they like it.

## 2. Dissect into the library

Follow `.cursor/skills/meme-format-decompose/SKILL.md`. Output per format, in `apps/web/public/memes/format-library/<id>/` and `assets/memes/format-library.json`:

| Part | File | Rule |
|---|---|---|
| Background | `02-background.jpg` | Exact original photo if Lens finds it. If not, AI-fill only the cutout and caption holes (see that skill) and say so in the caption. |
| GIF | `03-motion.gif` or `gif-<name>.gif` | Transparent. From the clip (difference matte) or a Giphy sticker. |
| Hook | text part | The original line, for study only. Never posted as ours. |
| Sound | `05-audio-original-sound.mp3` | The post's sound. |

Extra GIFs that fit a format go on that format as `gif` parts labeled `GIF · <name>`. Giphy **stickers** are already transparent: search `giphy.com/search/<words>-stickers`, then download `https://media.giphy.com/media/<id>/giphy.gif`. Before adding one, look at a strip of frames on green: whole figure, clean edges, note any watermark in the caption.

Deploy with `npm run deploy` so the library shows the new parts.

## 3. Make it ours

Keep the mechanic, change the words. Every meme needs:
- **One real back-pain moment** the viewer has lived. Concrete action, not a feeling: "touch your toes", "lift with your legs", "stand up after sitting all day".
- **The slot filled with that moment** in the format's own rhythm. Doctor format: question on top, then "Me:" or "Me at ___:". Expectation format: "How your back expects you to ___".
- **A GIF whose motion is the punchline.** The line sets up an action; the GIF does the wrong version of it (Carlton at a wedding, a box lifted overhead).
- **No product on screen.** No "Remedy", no app, no claims, no "cure". The App Store line lives in the post caption only (the builder adds it).
- **Short lines.** 34 characters max per line, 1-4 lines.

Write at least five lines per format before picking. Pair each with a GIF. The user picks; do not post on our own.

## 4. Build

One spec file per meme: `assets/memes/builds/<id>.json`. Example: `doctor-legs.json`.

```json
{
  "id": "doctor-legs",
  "format": "DeNAShnIYAy",
  "variantOf": "picked-that-box",
  "changed": "gif box lift, new text",
  "background": "DeNAShnIYAy/02-background.jpg",
  "gif": { "file": "DeNAShnIYAy/gif-box-lift.gif", "x": -104, "y": 792, "width": 902 },
  "audio": { "file": "DeNAShnIYAy/05-audio-original-sound.mp3", "start": 0 },
  "seconds": 12,
  "text": [{ "lines": ["Doctor: did you lift", "with your legs?", "Me:"], "y": 140 }],
  "title": "Doctor: did you lift with your legs?",
  "caption": "Doctor: did you lift with your legs? Me:",
  "description": "Exam room, overhead box lift, the sound from that format.",
  "musicCredit": "Sound: original sound — Anthony Fuhrman",
  "results": []
}
```

Frame is 1080x1920. `gif.x`/`y` is the top-left, `width` scales it. Size a person so their height is close to anyone else in the photo and their feet land on the floor. A waist-up cutout runs off the bottom edge.

```powershell
python scripts/meme_build/build.py assets/memes/builds/<id>.json --preview   # frame at 2s -> .work/meme-build/<id>.jpg
python scripts/meme_build/build.py assets/memes/builds/<id>.json --publish   # mp4 -> output/memes, R2, Memes > Review
```

Always read the preview before publishing: text readable, GIF visible, nobody overlapping, no leftover caption or smear. The builder rejects unknown keys, missing files, and lines over 34 characters.

## Clip and GIF

Same joke rules, different picture. The moving file is the whole meme. We keep its picture and its sound, and replace the burned-in line with ours.

One spec: `assets/memes/builds/<id>.json`. `clip` is an mp4 (sound included) or a gif. A gif also needs `audio`. `cover` is a white bar, in the 1080x1920 frame, that hides their old line. `text` is the same shape as a format meme, including `"box": "white"` when the original used a white caption.

```powershell
python scripts/meme_clip/build.py assets/memes/builds/<id>.json --preview
python scripts/meme_clip/build.py assets/memes/builds/<id>.json --publish
```

Read the preview before publishing. Their old line has to be gone. No product names on screen.

## 5. Iterate

A variant changes **one** layer, so a result can be read back to it:

- **Text:** same GIF, new line. Most of the upside lives here.
- **GIF:** same line, new cutout.
- **Sound:** same meme, different trending sound.
- **Background:** same joke, another room from the library.

Name it `<base>-<what>` (for example `doctor-legs-thor`). Set `variantOf` to the base id and `changed` to the one thing that changed. Publish it to Review.

After posting, add a row to `results`: `{ "platform": "tiktok", "url": "...", "postedAt": "2026-11-02", "views": 0, "likes": 0, "shares": 0, "note": "" }`. Update views at 48 hours. A variant that beats its base by a clear margin becomes the new base. Three variants in a row that lose means the format is done for now.

## Sound

The builder burns in the format's sound so Review plays as posted. On TikTok, posting with the same sound picked in-app keeps the meme attached to the trend. Platforms can mute copyrighted audio; if that happens, swap the sound for an in-app one.

## Weekly autopost (live since Nov 2026)

One meme a day. TikTok and YouTube, both brands: @remedy.recoveries and @remedy.stories, including YouTube @remedystories. Memes only on that YouTube. Slideshows stay off it. No Facebook. No Instagram for these. The on-screen line keeps the viral caption's shape and says "back", so a stranger knows what it is. The app name stays in the post caption. Nothing weird, and no product on the video.

Two cuts of every meme that has not posted yet, and every meme generated after this. Same line, same text position. They differ by a short trim, a small zoom, a small speed change, and the font style and size. On the white cover the line is black. The meme's own sound stays. Do not swap in the slideshow music beds. Never send one file to both accounts.

- **Templates:** `assets/memes/templates.json`. Only layouts the user approved. A new format joins the rotation by adding a row here (background, GIF placement, sound, text y, scene, slot, one approved example).
- **Sunday morning** the week is 7 **new** formats: not already in the library. Same qualify rules as Find (overlay, GIF, or clip; a slot a back-pain moment fits; 300K+ views). Do not fill the week by rotating formats we already posted. Split-testing one meme is later; this week is one meme per format. The on-screen line is about the back. Do not name a pad, a brace, or a product.
- **Both brands get each meme on TikTok and YouTube.** Recoveries gets cut A. Stories gets cut B. Same line, same position, the meme's own sound. Instagram does not get the meme.
- The 5:40am autopilot posts a week that is already built. It cannot discover formats: tikwm account feeds return 403, and a plain fetch of a TikTok profile is an empty shell. Discovery is the browser on the proven accounts, Popular sort, skipping any video id already in the library.
- **Times:** weekday 5:30-9pm, weekend 10am-1pm Central. Recoveries and Stories never share a minute: at least 45 min apart, including when the window is full. Other platforms on that account follow 4-25 min after its own TikTok, with a different offset per account.
- **Daily autopilot** (5:40am) also: catches up a missed Sunday, retries posts that never reached Zernio, cancels any meme rejected in Review before it posts, and pulls views. Readout: `meme-sync` (views per variant and vs that account's median).
- Commands: `meme-week preview` (captions only), `meme-week copy=<file>` (hand-written week, same rules), `meme-week retime=<week>` (move a week onto fresh times), `meme-week force`. `MEME_AUTOPOST=false` builds and lists without scheduling.
- If the Cursor CLI session expires, captions fail and nothing posts that week: run the CLI `login` again.
