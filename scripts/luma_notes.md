# Exercise Video Generation Notes (was Luma — switching to Kling)

Living doc for prompts, iteration history, and locked learnings.  
**Tracker:** `scripts/tracker.md` · **Clinical spec:** `scripts/shot_list.md` · **DB instructions:** `supabase/migrations/024_exercise_catalog_v2.sql`

**⚠️ 2026-07-09: Switching primary tool from Luma to Kling AI (3.0).** Reason: hit Luma's $30/mo Plus-tier credit limit after only 6 clips (math checks out — ~660 credits/10s clip against a ~3,600 credit pool), and Luma's human-motion realism was the likely root cause of the clamshell failure. Kling 3.0 is consistently rated stronger for photorealistic human motion at a similar or lower price point, with a much larger effective clip budget per dollar and native 15s clips (no more "extend" workaround for 10s holds). All prompt-accuracy, timing, and "NOT ___" exclusion rules below are tool-agnostic and carry over as-is. Tool-specific mechanics (character reference method, clip length, credit cost) are called out below where they differ.

**Kling-specific adjustments:**
- Character reference: use Kling's **Subject Binding** / multi-image reference (Omni) instead of Luma's single-image upload — same principle (no appearance text in prompt), stronger consistency mechanism.
- **Start frame ≠ guaranteed start pose.** Uploading Elara as the start frame locks identity, but Kling may still open with her facing the camera / standing idle before the exercise begins. Don't fight that in the prompt — generate the exercise clean, then **trim the facing-camera intro** in edit. Prefer a start-frame image that already shows the exercise start pose (side profile, hands in position) when you have one; otherwise trim.
- Clip length: Kling supports **15s native**. Free-tier 5s tests = **1 rep only** (too short for 2 controlled reps). Production clips: use **10s** for 2-rep movements. Side Plank 10s holds: try native 15s first.
- Retry clamshell on Kling first, per the plan already logged below, before assuming it's still blocked.
- Re-verify credit cost per clip on Kling's actual pricing page before batching — don't assume the numbers above, pricing pages change.

---

## Rules (always apply)

### Prompt accuracy
- Descriptions must match **real PT form** from `shot_list.md` and catalog `instructions` — never guess anatomy or movement if unclear.
- If an exercise is ambiguous or hard to describe precisely, **stop and ask the user to review** before writing a prompt.
- When Luma misreads a movement, add explicit **"NOT a ___"** exclusions (see McKenzie, Clamshell below).

### Character & camera
- Upload **character reference** every generation — no appearance text in prompt.
- **Neutral face always:** relaxed, no smiling, no expressions, eyes soft/downward. Reduces "bad AI" read.
- **Static camera.** Grey yoga mat, white studio, soft even lighting.
- **First frame = start position at rest** (app may use frame 1 as thumbnail).
- **Silent** — no voiceover, no on-screen text.

### Timing (from Glute Bridge gold standard) — HARD RULES, not suggestions
- **Rep-based exercises (bridges, clamshell, rotations, squats, etc.):** always **2 reps total** (or 1 rep per side), targeting **~10 seconds of total clip length**. Never ask for 3+ reps — the model rushes and drops the hold/pause. **1-rep prompts are only for short free-tier smoke tests (5s)** — production always uses 2 reps on a 10s clip.
- **Every rep is slow and controlled, no exceptions** — every phase (up / open / hinge / etc.) gets an explicit second count (e.g. "over 3 full seconds"), never just "slowly."
- **Pauses/holds are literal, real-time durations, not a beat.** Always spell out `"holds completely still for N full seconds"` and `"pauses N full seconds"` at the named position — the model must actually sit there motionless for that duration, not imply it and cut away. If a prompt just says "pause" with no second count, that's a bug in the prompt — fix it before sending.
- `"identical timing each rep"` on every multi-rep prompt.
- `"No rushing"` + `"Only N reps total, no additional reps"` on every prompt, every time.
- **Hold-based stretches/isometrics (Child's Pose, Figure-4, Hamstring Stretch, Side Plank):** these follow real clinical hold durations (can be 10–30s), not the 2-rep/10s rule — use Luma's extend feature to reach the true duration rather than compressing the hold to fit a short clip. Never shorten a clinical hold time just to fit the clip length.
- Generate in batches → review all → one fix round (saves credits).

### Rep count vs clip length
- Luma ~10s single-generation clips: **prefer 2 reps** (or 1 rep per side) over 3+, for rep-based movements.
- Asking for 3+ identical slow reps often causes reps 2–3 to rush with no pauses — confirmed failure mode, don't retry it.
- Alternate sides in separate reps (e.g. rep 1 left leg, rep 2 right leg) — not multiple reps same side unless stretch/hold.
- For hold-based exercises needing >10s (e.g. 10s McGill holds ×2, or 20–30s stretch holds), use the extend feature to get the real duration — confirmed working (Child's Pose ran 30–40s this way).

---

## Global learnings (all exercises)

| Issue | Fix |
|---|---|
| Movement too fast | Add explicit second counts; reduce rep count to 2 |
| No pause at top | `"holds completely still for N full seconds"` |
| Extra rushed reps at end | `"Only 2 reps total, no additional reps after rep 2"` |
| Confused with similar exercise | Lead with clinical name + `"NOT a push-up / NOT a kick"` |
| Face looks uncanny | `"neutral relaxed face, no expressions, no smiling"` |
| Wrong camera | Use `"pure 90-degree side profile"` — avoid `"facing the camera"` on side-lying work |
| Half-rep / shallow ROM | Explicit depth: `"thighs just below parallel to the floor"` (or exercise-specific depth). Never leave ROM vague — models default short |
| Arms/hands wrong | Always specify hand position (e.g. squat: `"hands clasped together in front of chest"`). Never default to "arms at sides" unless that's the real form |
| Kling opens facing camera | Expected with generic start-frame refs — trim the intro; or use a start frame already in side-profile start pose |

---

## Per-exercise notes

### ✅ Glute Bridge — `glute_bridge`
**Status:** Approved (gold-standard template)

**What worked:** 3s up · 3s hold · 3s down · 1s bottom pause · 3 reps · side profile.

**Locked prompt:**
> Side profile view, static camera. Woman lying on her back on a grey yoga mat, knees bent, feet flat on the mat hip-width apart. She very slowly drives through her heels to lift her hips upward over 3 full seconds, reaches the top position with body forming a straight line from shoulders to knees, holds completely still at the top for 3 full seconds, then very slowly lowers her hips back down to the mat over 3 full seconds. Pauses 1 second at the bottom. Repeats this exact same movement 3 times with identical timing and control each rep. Each rep takes approximately 9 seconds total. No rushing. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

---

### ✅ Single-Leg Glute Bridge — `single_leg_glute_bridge`
**Status:** Done — generated via the pt-exercise-demo skill test run (was labeled "Prone Leg Raise" there; same movement/prompt as this entry). Ran clean end-to-end. File lives outside the repo for now — drop it into `scripts/output/single_leg_glute_bridge.mp4` and upload to Supabase Storage `videos/exercises/` per the "After export" step in `tracker.md`.

**Clinical form (catalog):**
- Supine, one knee bent foot flat, other leg extended straight.
- Drive through planted heel; lift hips to straight line shoulders → knee.
- Hips stay level — no twisting.

**Iteration 1 — problems:**
- ✅ Rep 1: perfect pace, form, hold.
- ❌ Reps 2–3: rushed, no control, no pause at top.
- ❌ Stayed on same leg — should **switch legs** on rep 2.

**Iteration 2 — fixes:**
- **Only 2 reps total** (stops cramming extra rushed reps).
- Rep 1 = left planted / right extended → Rep 2 = **switch** to right planted / left extended.
- Explicit pause between reps while she repositions legs.
- Same 3s up · 3s hold · 3s down · 1s pause timing as Glute Bridge.

**Locked prompt (v2 — use this):**
> Side profile view, static camera. Neutral relaxed face, no expressions, no smiling. Woman lying on her back on a grey yoga mat. Rep 1 only: left knee bent with foot flat on the mat, right leg extended straight at a 45-degree angle. She very slowly drives through her left heel to lift her hips over 3 full seconds until her body forms a straight line from shoulders to left knee, holds completely still at the top for 3 full seconds, then very slowly lowers over 3 full seconds. Pauses 1 second at the bottom with hips on the mat. She then slowly repositions: switches so right knee is bent foot flat and left leg extends straight at 45 degrees. Rep 2 only: repeats the exact same slow movement on the right leg with identical 3-second up, 3-second hold, 3-second down, and 1-second pause timing. Hips stay level throughout, no twisting. Only 2 reps total, one per leg, no additional reps. No rushing. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

---

### ⛔ Clamshell — `clamshell`
**Status:** Dead for AI (2026-07-11). Use Pexels placeholder or hire/film later. Do NOT burn more credits on this.

**Confirmed failures:**
- Luma + Kling text/image-to-video: feet separate / pelvis rolls / becomes leg lift.
- Kling Motion Control with YT motion ref + Elara: anatomy melt / pose ignore. Side-lying start still helped image-gen but motion transfer failed.
- Decision: skip. Finish easy exercises via normal Video Generation. Revisit clamshell only with real footage.

**Clinical form (catalog + shot list):**
- Side-lying, **hips stacked**, knees bent ~90°, **feet stay together** (in contact).
- **Top knee rotates open** at the hip (external rotation) — small range, like opening a clamshell.
- Pelvis does **not** roll backward. Top hip stays over bottom hip.
- **NOT:** circular leg swing, kicking, bicycling, or separating the feet.

**Iteration 1 — problems:**
- ❌ Face making expressions → looks like bad AI.
- ❌ Camera too head-on — should be **more sideways** (pure side profile).
- ❌ Top leg moves in a **circle** instead of knee opening up/down with feet connected.

**Iteration 2 — fixes:**
- `"pure 90-degree side profile"` — body perpendicular to camera, face in profile not toward lens.
- `"neutral relaxed face, no expressions"`.
- Feet `"pressed together and never separate"`.
- Top knee opens up and closes down — feet stay connected; NOT a circular leg swing.
- 2 reps only, slow 2s open · 2s hold · 2s close.

---

### ⬜ Open-Book Rotation — `open_book_rotation`
**Status:** Ready to send

**Clinical form (shot list):** Side-lying, knees stacked and bent ~90° (like resting position), both arms extended forward together at shoulder height, palms together. Top arm sweeps open and rotates across/back until it reaches (or approaches) the mat behind her, trunk rotates with it, eyes follow the top hand. Knees stay stacked together and don't move — only the upper trunk/arm rotates. Rep-based (2 reps = 1 per side), ~10s target.

**Locked prompt:**
> Thoracic rotation exercise, 45-degree angle from the head, static camera. Neutral relaxed face, no expressions, no smiling. Woman lying on her side on a grey yoga mat, knees stacked together and bent at 90 degrees, hips stacked. Both arms extended forward at shoulder height, palms together. Rep 1 only: she very slowly opens her top arm across her body and rotates her upper trunk and head over 3 full seconds, following her hand with her eyes, until her top arm and shoulder blade reach toward the mat behind her. Her knees stay stacked together and completely still the entire time — only her upper body rotates. She holds completely still in the open position for 2 full seconds, then very slowly rotates back over 3 full seconds until her palms meet again. Only 1 rep on this side, no additional reps. No rushing. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Note:** Send as 2 separate short generations (left rotation, right rotation) rather than one clip with a mid-clip side-switch — cleaner for a symmetric rotation and avoids the "reposition" step reading awkwardly on camera.

---

### ⬜ Side Plank (Knees) — `side_plank_knees`
**Status:** Ready to send — hold-based, use extend feature for true 10s hold

**Clinical form (shot list, McGill dosing):** Side-lying, forearm down, knees bent and stacked. Lifts hips off the mat into a straight line from ear through shoulder, hip, and knee. Holds ~10 seconds (real duration, not compressed), then lowers with control. No hip sag.

**Locked prompt:**
> Side plank exercise, 45-degree front-side angle, static camera. Neutral relaxed face, no expressions, no smiling. Woman lying on her side on a grey yoga mat, propped up on her forearm which is directly under her shoulder, knees bent and stacked on top of each other. She very slowly lifts her hips off the mat over 2 full seconds until her body forms one straight line from her ear through her shoulder, hip, and knee — no sagging at the hips. She holds this exact position completely still for 10 full seconds, motionless, hips lifted and in line. Then she very slowly lowers her hips back down to the mat over 2 full seconds. Only 1 hold, no additional reps. No rushing. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Note:** This is a ~14s+ total clip (2s up + 10s hold + 2s down) — needs the extend feature past Luma's default single-gen length. Generate left side and right side as two separate clips.

---

### ⬜ Side Plank (Full) — `side_plank_full`
**Status:** Ready to send — hold-based, same treatment as Side Plank (Knees)

**Clinical form (shot list, McGill dosing):** Side-lying, legs straight, feet stacked, forearm down. Lifts hips into a straight line from ankles through shoulders (full-body line, not just knees-to-shoulder). Holds ~10 seconds, lowers with control.

**Locked prompt:**
> Side plank exercise, full body straight line, 45-degree front-side angle, static camera. Neutral relaxed face, no expressions, no smiling. Woman lying on her side on a grey yoga mat, propped up on her forearm directly under her shoulder, legs fully extended straight and feet stacked on top of each other. She very slowly lifts her hips off the mat over 2 full seconds until her entire body forms one straight line from her ankles through her hips and shoulders — no sagging at the hips, legs stay straight the whole time. She holds this exact position completely still for 10 full seconds, motionless, hips lifted, feet stacked. Then she very slowly lowers her hips back down to the mat over 2 full seconds. Only 1 hold, no additional reps. No rushing. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Note:** Same ~14s+ clip length as Side Plank (Knees) — use extend feature. Generate left/right as separate clips.

---

### 🔄 Bodyweight Squat — `bodyweight_squat`
**Status:** Kling iteration 2 — regen (identity/motion good; ROM shallow; hands wrong; 1-rep was free-tier only)

**Clinical form (shot list):** Chest tall, weight mid-foot, knees track over toes. Hands clasped in front of chest (stabilizing). Depth: thighs just below parallel — normal ROM, not a half-squat, not ATG.

**Iteration 1 (Kling free, 5s) — problems:**
- ✅ Identity + overall motion looked great.
- ❌ Shallow ROM (half-rep) — must spell out `"thighs just below parallel"`.
- ❌ Hands at sides (prompt error) — should be clasped in front of chest.
- ❌ Opened facing camera before turning to side profile — trim intro; don't burn credits fighting it.
- ❌ 1 rep only because free tier was 5s — production = **2 reps on 10s**.

**Locked prompt (v2 — use this):**
> Pure 90-degree side profile, static camera. Neutral relaxed face, no expressions, no smiling. Woman standing on a grey yoga mat in side profile, feet shoulder-width apart, hands clasped together in a ball in front of her chest for balance. She very slowly bends her knees and hips to lower into a squat over 2 full seconds until her thighs are just below parallel to the floor — full normal squat depth, not a half squat, not an extreme deep squat. Chest stays tall, weight in mid-foot, knees tracking over toes. She holds completely still at the bottom for 1 full second, then very slowly stands back up over 2 full seconds to the starting position. Pauses 1 full second at the top. Repeats the exact same squat a second time with identical timing and depth. Only 2 reps total, no additional reps. No rushing. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Kling settings:** start frame = Elara · no end frame · Multi-Shot OFF · Native Audio OFF · **1080p · 10s · 16:9 · 1**. Trim any facing-camera intro after export.

---

### ✅ Cat-Cow — `cat_cow`
**Status:** Approved

**Notes:** 3s cow · 2s hold · 3s cat · 2s hold · 3 cycles. Side profile.

---

### ✅ Dead Bug — `dead_bug`
**Status:** Approved (catalog v3 wants 3s lowers — verify on review; may regen later)

**Notes:** Tabletop start; opposite arm + leg lower together; low back flat.

---

### ✅ Bird Dog — `bird_dog`
**Status:** Approved (⚠️ catalog v3 now doses **10s holds** — may need regen)

**Notes:** v1 prompt used 3s hold. Catalog v3: 3 sets × 5 reps × **10s hold**. Flag for regen when batching stability exercises.

---

### ✅ Child's Pose — `childs_pose`
**Status:** Approved

**Notes:** Slow lower · 6s hold · slow return · 1 cycle (+ optional repeat).

---

### ✅ McKenzie Press-Up — `mckenzie_press_up`
**Status:** Done via YouTube+rembg (legacy); Luma regen optional

**Luma learnings (if regen):**
- Must say `"NOT a push-up"`, `"hips never leave the mat"`, `"lumbar extension rehabilitation"`.
- Runway Gen-4 Turbo failed; Luma untested for this specific movement.

---

## Exercises not yet attempted

Use `shot_list.md` + catalog `instructions` as source of truth.  
**Before prompting:** if movement is hard to describe in one unambiguous sentence, ask user to review draft prompt.

| # | Exercise | File | Risk notes |
|---|---|---|---|
| 5 | Supine Figure-4 Stretch | `figure_4_stretch` | Hold-based; ankle cross + pull — confirm form with user |
| 6 | Supine Hamstring Stretch | `hamstring_stretch` | One leg up; other bent — angle matters |
| 14–30 | Standing / bands / gym | various | Equipment props; ask user on ambiguous form |

---

## Changelog

| Date | Exercise | Change |
|---|---|---|
| 2026-07-09 | Bodyweight Squat | Kling v1: good identity/motion; shallow ROM + hands-at-sides + facing-cam intro. v2: below-parallel depth, hands clasped, 2 reps / 10s |
| 2026-07-09 | (global) | Added ROM depth rule, hand-position rule, Kling start-frame trim rule; clarified 1-rep = free-tier smoke test only |
| 2026-07-09 | (global) | Codified hard rules: 2 reps/~10s for rep-based moves, real-time literal pauses/holds, hold-based stretches use extend feature instead of compressing |
| 2026-07-09 | Single-Leg Glute Bridge | Confirmed done via skill test run ("Prone Leg Raise"); needs file moved into repo |
| 2026-07-09 | Open-Book Rotation, Side Plank (Knees), Side Plank (Full) | Added full locked prompts, ready to send |
| 2026-07-08 | Single-Leg Glute Bridge | v2: 2 reps only, switch legs rep 2, neutral face |
| 2026-07-08 | Clamshell | v2: pure side profile, neutral face, feet together, NOT circle/kick |
| 2026-07-08 | (global) | Created doc; added accuracy rule + ask-user-before-guessing |
