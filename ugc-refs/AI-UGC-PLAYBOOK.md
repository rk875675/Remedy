# Remedy AI UGC playbook

Fast path to generate and finish an AI UGC ad. Do not invent a new concept in this file.

**Do not edit this playbook unless the user explicitly says to.**

**Tool:** Dreamina, model **Seedance 2.5**, Omni reference.  
**Edit:** CapCut desktop (free). CapCut comes **after** the raw UGC is locked.

---

## Prompt hard rules — from most important to least

- Best AI videos are not micromanaging every milisecond of it w a super long description, but just long enough clear, structured prompt. overstuffing a scene or part of the video w too much info will confuse model.
- With the previous rule, that includes giving the AI (SOME but not all) creative freedom - incoprtate this by having emotion in parenthesis(). ex: (pain, comedy, shocked), (relieved, found solution — "just do this instead"), etc.
- Use **CUT TO** (if you want a cut) or **NEXT PART**. Do not timestamp parts (no `0–3s`).
- **emphazise the do not change `@Image2`.** Repeat it whenever the screen is on camera. 
- **Whole body stays in frame** unless video describes otherwise
- **Never** write `as a video` on the phone overlay - just say image 2.
- Seedance will not read the screenshot. If he should do that exercise, name it in the prompt.
- Do not write “no music,” “blurry phone,” or “small move.”
- DO WRITE "no talking or speech anytime" unless video needs it
---

## Dreamina settings

Check the bar **before** send. Prompt text does not override the dropdown.
remind me to for correct settings specfically the 9:16 + time + no audio + anything else when giving me the prompt


- Model: **Dreamina Seedance 2.5**
- Reference: **Omni**
- Ratio: **9:16**
- Resolution: **480P**
- Audio: **off** unless the prompt needs speech
- Duration: pick what the story needs (limit **30s**). Confirm credits on the send bar.

Observed Dreamina credits (12s run: **204** at 480P, **444** at 720P). Other lengths are that rate × seconds:

| Length | 480P | 720P |
|---|---|---|
| 10s | ~170 | ~370 |
| 12s | 204 | 444 |
| 15s | ~255 | ~555 |
| 20s | ~340 | ~740 |
| 30s | ~510 | ~1110 |

Generate at **480P**. If you will run the take as a **Meta ad**, optionally remake that same prompt at **720P**.

---

## Assets

Stills live in `ugc-refs/`. `@Image1` is the person. `@Image2` is the app screen for **this** ad — pick the screenshot that matches the exercise/story. Attach the refs you need for that gen. 

---

## Example prompt (structure only)

Not a template to paste forever. Pattern: refs → format → wide-shot rule → beats with `CUT TO` and emotions. Swap the story, duration, and `@Image2` file per ad.

```
@Image1 is the man. Same face, same hair, same navy polo.

@Image2 is the iPhone screen. Do not change @Image2. When he shows the phone, the screen is exactly @Image2.

Vertical phone video, 9:16, cheap tripod, eye-level, living room.

Wide shot. His whole body stays in frame.

He sits in an office chair and does a huge, stupid lower-back twist to "crack" it (trying too hard, showing off). It goes wrong and he falls out of the chair onto the floor (pain, comedy, shocked). Keep him in frame.

CUT TO him looking at the camera, shaking his head (like that was a bad idea, cringing).

CUT TO him sitting, glancing at his iPhone, then angling it toward the camera so the screen is big and readable (relieved, the solution — "just do this instead"). The screen is exactly @Image2.

CUT TO him on the floor doing the same stretch as the phone screen (calm, following along dont overdo range of motion). Small phone overlay on the side showing exactly @Image2. He is the main subject. Whole body in frame. Do not put a phone in the foreground.

No talking or speech anytime.
```

---

## CapCut

Only after the raw UGC is finalized.

**Before any clicks:** collaborate on which edits this ad gets (captions, SFX, freeze, music, stickers). Do not assume the last ad’s stack.

Then walk through CapCut one step at a time.

### Recommended menu (pick per ad)

| Edit | Where it usually goes | Notes |
|---|---|---|
| Hook caption | First beat / problem | One line, white + black stroke. Joke or warning only — no medical claims. |
| Error / fail SFX | Impact or “wrong” moment | Sounds → `error` / `wrong`. One hit. |
| Freeze + grey + X sticker | Right after the fail, on a readable still | Split → Freeze **0.4–0.5s** → saturation 0 → red X. Drop the freeze if it looks cheap; keep the SFX. |
| Music | After the hook, not under the fail | **Audio → Music**, **Commercial / For business** only if it will run as an ad. Volume ~20–30%. |
| Idea / ding SFX | Product / phone-show beat | Sounds → `idea` / `ding`. Optional lightbulb sticker. |
| Success ding | Last 0.5s | Different sound than the idea ding. |
| End card | Last frame | Optional `Download Remedy`. |

**Two music variants:** both tracks on the timeline, same in-point. Mute one, export, swap mute, export.

**Ads:** do not bake trending/radio songs. Platform sounds cannot start mid-clip, so if the hook must stay silent, music is added here.

**Organic + trending sound:** export a no-music version (keep SFX). In-app audio starts at 0:00 and will cover a silent hook.

### Export (every time)

- Ratio: **9:16**
- Resolution: **1080×1920** (not “Adapted”, not 1920×1080)
- Frame rate: 30
- Format: MP4
- Watermark off

If an export already has black bars, crop the bars only — measure the content box first; do not guess.

---

## Legal (ads)

- Soft claims only (“plan,” “today’s session”). No invented outcomes.
- If it runs as an ad, label it synthetic / AI-generated per the platform.
- Do not present the AI person as a real patient.

---

## File map

| What | Where |
|---|---|
| This playbook | `ugc-refs/AI-UGC-PLAYBOOK.md` |
| Example prompt | `ugc-refs/seedance-final-prompt.txt` |
| Stills / refs | `ugc-refs/` |
| Raw clips | `ugc-refs/clips/` |
| Finished exports | `Downloads/AI UGC/` |
