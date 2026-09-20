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
- **Clothing coverage (always):** Include `"wearing a fitted high-neck long-sleeve moisture-wicking workout top and full-length leggings"` on every generation. Do not leave clothing unspecified — Kling defaults to a sports bra which shows cleavage. This one line is required on all future and regen prompts.

### Timing (from Glute Bridge gold standard) — HARD RULES, not suggestions
- **Total timed movement ≤ 8 seconds.** Sum of all phase counts (up + hold + down + pauses + rep 2…) must be **≤ 8s**. Not hold-only — the whole exercise clock.
- **If 2 reps would push past 8s → use 1 rep.** Never pad with long holds to fill a 15s Kling slot.
- Example fits: 2s down + 1s hold + 2s up + 1s pause + same again ≈ 2 reps under 8s. Stretch: 2s into + 4s hold + 2s out = 8s, **1 rep**.
- **Every rep is slow and controlled** — every phase gets an explicit second count (e.g. "over 2 full seconds"), never just "slowly."
- **Pauses/holds are literal.** Spell out `"holds completely still for N full seconds"` — keep N small so the total stays ≤ 8s.
- `"identical timing each rep"` on every multi-rep prompt.
- `"No rushing, clean pauses."` + `"Only N reps total, no additional reps"` on every prompt, every time.
- Generate in batches → review all → one fix round (saves credits).

### Range of motion — HARD RULE (Kling always undershoots)
Kling consistently produces **shallow / half ROM** and often **fails to lock out** (leg press, presses, hinges, squats). Over-specify every time:
- State the **start AND finish** end positions in concrete anatomy — both matter.
- For presses / extensions: explicitly say **"fully locks out"** / **"legs fully straight"** / **"hips fully extended"** at the top (unless the exercise clinically soft-locks).
- Add **overshoot cues**: `"full complete range of motion from start to finish"`, `"complete end range"`, `"not a partial rep"`.
- Add **NOT** exclusions: `"NOT a tiny push"`, `"NOT stopping short of lockout"`, `"NOT a half movement"`.
- **Prefer full ROM over long pauses.** Cut holds/pauses to 0–1s if needed so the move-in + full lockout + move-out still fit in the ≤8s total. Never shorten the ROM to save time.
- Exception: Banded RDL only — don't overshoot past ~120°; still keep soft knees.

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
| Half-rep / shallow ROM / no lockout | **Always.** Spell start→finish, say `"fully locks out"`, `"full complete ROM from start to finish"`, `"NOT stopping short of lockout"`. Shrink pauses before shrinking ROM |
| Arms/hands wrong | Always specify hand position (e.g. squat: `"hands clasped together in front of chest"`). Never default to "arms at sides" unless that's the real form |
| Kling opens facing camera | Expected with generic start-frame refs — trim the intro; or use a start frame already in side-profile start pose |
| Kling identity | Say `"reference woman linked Elara"` in the prompt (Subject Binding) — do not describe appearance |
| Pause quality | End timing block with `"No rushing, clean pauses."` |
| Exercise label | Lead with `"{Name} : "` then the prompt body. Do **not** end with `"Exercise is called…"`. |
| Clip too long / complex | Drop to **1 rep** (one side only). Never force 2 reps on stretches, single-leg, or multi-step moves |
| Total time over 8s | **All phase seconds summed ≤ 8s.** Over budget → cut to 1 rep and shorten holds — never 8s holds plus move-in/out |
| Loaded / equipment moves | **Start already in the exercise start position with equipment in hands / on body** — no walk-up, no pickup from floor, no setup. Setup eats the clip and cuts the rep short (KB deadlift lesson) |
| Cleavage / exposed chest | Always specify `"wearing a fitted high-neck long-sleeve moisture-wicking workout top and full-length leggings"` — Kling's default clothing is a sports bra. Required on every prompt. |

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

### ⛔→🔄 Clamshell — `clamshell`
**Status:** Retrying (2026-08-19) — v3 prompt adds clothing coverage + all v2 form fixes. Kling 3.0 is stronger on human motion than prior attempts. If it still melts, revert to Pexels.

**Confirmed failures:**
- Luma + Kling text/image-to-video: feet separate / pelvis rolls / becomes leg lift.
- Kling Motion Control with YT motion ref + Elara: anatomy melt / pose ignore.

**Clinical form (catalog + shot list):**
- Side-lying, **hips stacked**, knees bent ~90°, **feet stay together** (in contact).
- **Top knee rotates open** at the hip (external rotation) — small range, like opening a clamshell.
- Pelvis does **not** roll backward. Top hip stays over bottom hip.
- **NOT:** circular leg swing, kicking, bicycling, or separating the feet.

**Locked prompt (v3 — use this):**
> Clamshell : Pure 90-degree side profile, static camera. Neutral relaxed face, no expressions, no smiling. Reference woman linked Elara — wearing a fitted high-neck long-sleeve moisture-wicking workout top and full-length leggings. Lying on her side on a grey yoga mat, hips stacked directly on top of each other, knees bent at 90 degrees and stacked, feet pressed firmly together. Her feet stay in contact throughout the entire movement — feet never separate, ever. She very slowly opens her top knee upward over 2 full seconds like a clamshell opening — the knee rotates outward at the hip while the feet remain pressed together, the pelvis stays completely still and does NOT roll backward, the top hip stays directly over the bottom hip. She holds completely still at the top open position for 2 full seconds, then very slowly lowers her top knee back down over 2 full seconds until the knees are stacked again. Pauses 1 full second at the bottom. Repeats the exact same movement a second time with identical timing. Only 2 reps total, no additional reps. NOT a circular leg swing, NOT a kick, NOT separating the feet. No rushing, clean pauses. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Kling settings:** Subject Binding = Elara · 1080p · 10s · 16:9 · Multi-Shot OFF · Audio OFF. Trim any facing-camera intro.

---

### 🔄 Banded Clamshell — `banded_clamshell`
**Status:** New v1 prompt (2026-08-19) — mirrors Clamshell v3 with band above knees and clothing coverage. Retry Kling; if motion still fails, match outcome of bodyweight Clamshell.

**Clinical form:** Same as Clamshell with a light loop resistance band positioned just above both knees adding external-rotation resistance.

**Locked prompt (v1):**
> Banded Clamshell : Pure 90-degree side profile, static camera. Neutral relaxed face, no expressions, no smiling. Reference woman linked Elara — wearing a fitted high-neck long-sleeve moisture-wicking workout top and full-length leggings. Lying on her side on a grey yoga mat, a light loop resistance band positioned just above both knees, hips stacked directly on top of each other, knees bent at 90 degrees and stacked, feet pressed firmly together. Her feet stay in contact throughout the entire movement — feet never separate, ever. She very slowly opens her top knee upward against the band resistance over 2 full seconds — the knee rotates outward at the hip while the feet remain pressed together, the pelvis stays completely still and does NOT roll backward, the top hip stays directly over the bottom hip. She holds completely still at the top open position for 2 full seconds, then very slowly lowers her top knee back down over 2 full seconds against the band until the knees are stacked again. Pauses 1 full second at the bottom. Repeats the exact same movement a second time with identical timing. Only 2 reps total, no additional reps. NOT a circular leg swing, NOT a kick, NOT separating the feet. No rushing, clean pauses. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Kling settings:** Subject Binding = Elara · 1080p · 10s · 16:9 · Multi-Shot OFF · Audio OFF.

---

### ⬜ Open-Book Rotation — `open_book_rotation`
**Status:** Ready to send

**Clinical form (shot list):** Side-lying, knees stacked and bent ~90° (like resting position), both arms extended forward together at shoulder height, palms together. Top arm sweeps open and rotates across/back until it reaches (or approaches) the mat behind her, trunk rotates with it, eyes follow the top hand. Knees stay stacked together and don't move — only the upper trunk/arm rotates. Rep-based (2 reps = 1 per side), ~10s target.

**Locked prompt:**
> Thoracic rotation exercise, 45-degree angle from the head, static camera. Neutral relaxed face, no expressions, no smiling. Woman lying on her side on a grey yoga mat, knees stacked together and bent at 90 degrees, hips stacked. Both arms extended forward at shoulder height, palms together. Rep 1 only: she very slowly opens her top arm across her body and rotates her upper trunk and head over 3 full seconds, following her hand with her eyes, until her top arm and shoulder blade reach toward the mat behind her. Her knees stay stacked together and completely still the entire time — only her upper body rotates. She holds completely still in the open position for 2 full seconds, then very slowly rotates back over 3 full seconds until her palms meet again. Only 1 rep on this side, no additional reps. No rushing. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Note:** Send as 2 separate short generations (left rotation, right rotation) rather than one clip with a mid-clip side-switch — cleaner for a symmetric rotation and avoids the "reposition" step reading awkwardly on camera.

---

### ⬜ Side Plank (Knees) — `side_plank_knees`
**Status:** Ready to send — hold-based, use extend feature for true 10s hold. v2 adds clothing coverage.

**Clinical form (shot list, McGill dosing):** Side-lying, forearm down, knees bent and stacked. Lifts hips off the mat into a straight line from ear through shoulder, hip, and knee. Holds ~10 seconds (real duration, not compressed), then lowers with control. No hip sag.

**Locked prompt (v2 — clothing added):**
> Side plank exercise, 45-degree front-side angle, static camera. Neutral relaxed face, no expressions, no smiling. Reference woman linked Elara — wearing a fitted high-neck long-sleeve moisture-wicking workout top and full-length leggings. Lying on her side on a grey yoga mat, propped up on her forearm which is directly under her shoulder, knees bent and stacked on top of each other. She very slowly lifts her hips off the mat over 2 full seconds until her body forms one straight line from her ear through her shoulder, hip, and knee — full deep range, hips high, NOT a tiny lift, no sagging. She holds this exact position completely still for 4 full seconds, motionless, hips lifted and in line. Then she very slowly lowers her hips back down to the mat over 2 full seconds. Only 1 hold, no additional reps. No rushing, clean pauses. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Note:** 2s up + 4s hold + 2s down = 8s total. 1 hold only.

---

### ⬜ Side Plank (Full) — `side_plank_full`
**Status:** Ready to send — hold-based, same treatment as Side Plank (Knees). v2 adds clothing coverage.

**Clinical form (shot list, McGill dosing):** Side-lying, legs straight, feet stacked, forearm down. Lifts hips into a straight line from ankles through shoulders (full-body line, not just knees-to-shoulder). Holds ~10 seconds, lowers with control.

**Locked prompt (v2 — clothing added):**
> Side plank exercise, full body straight line, 45-degree front-side angle, static camera. Neutral relaxed face, no expressions, no smiling. Reference woman linked Elara — wearing a fitted high-neck long-sleeve moisture-wicking workout top and full-length leggings. Lying on her side on a grey yoga mat, propped up on her forearm directly under her shoulder, legs fully extended straight and feet stacked on top of each other. She very slowly lifts her hips off the mat over 2 full seconds until her entire body forms one straight line from her ankles through her hips and shoulders — full deep range, hips high, NOT a tiny lift, no sagging, legs stay straight. She holds this exact position completely still for 4 full seconds, motionless, hips lifted, feet stacked. Then she very slowly lowers her hips back down to the mat over 2 full seconds. Only 1 hold, no additional reps. No rushing, clean pauses. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Note:** 2s up + 4s hold + 2s down = 8s total. 1 hold only.

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

### ✅ Bodyweight Hip Hinge — `hip_hinge`
**Status:** Done (in PT videos folder). Wire to DB later with full batch.

**Clinical form (shot list):** Standing hip hinge; hips back, flat back, soft knees (NOT a squat). Hands on thighs.

**Learnings from generate:**
- Even with `"120 degrees to the floor"`, Kling still undershot ROM → future prompts must overshoot depth language harder (see global ROM rule).
- User pattern locked: Elara subject ref, clean pauses, exercise name at end.

**Locked prompt (v1 — as generated; regen only if needed with stronger ROM):**
> Pure 90-degree side profile, static camera. Neutral relaxed face, no expressions, no smiling. Reference woman linked Elara — standing on a grey yoga mat in side profile, feet hip-width apart, soft knees, hands resting lightly on the fronts of her thighs. She very slowly hinges at the hips over 3 full seconds, pushing her hips backward and leaning her torso forward while keeping her back flat and neutral — NOT a squat, knees stay soft but do not bend deeply. She stops when her torso is 120 degrees to the floor, hands still on her thighs. She holds completely still at the bottom for 1 full second, then very slowly drives her hips forward to stand tall over 3 full seconds back to the starting position. Pauses 1 full second at the top. Repeats the exact same hip hinge a second time with identical timing and depth. Only 2 reps total, no additional reps. No rushing, clean pauses. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion. Exercise is called Bodyweight Hip Hinge

**Kling settings:** Subject Binding = Elara · no end frame · Multi-Shot OFF · Native Audio OFF · **1080p · 10s · 16:9 · 1**. Trim any facing-camera intro after export.

---

### ⬜ Supine Hamstring Stretch — `hamstring_stretch`
**Status:** Ready — 1 rep, total timed ≤ 8s, over-specified ROM

**Clinical form:** Supine; one knee bent foot flat; other leg held behind thigh and straightened toward ceiling to a gentle stretch.

**Locked prompt (v2 — ≤8s total: 2+4+2):**
> Pure 90-degree side profile, static camera. Neutral relaxed face, no expressions, no smiling. Reference woman linked Elara — lying on her back on a grey yoga mat in side profile. Left knee bent with left foot flat on the mat. Right leg raised high, both hands holding firmly behind the right thigh. She very slowly straightens the right knee over 2 full seconds through a full deep range of motion until the right leg is completely straight, knee locked out, foot pointed toward the ceiling at the absolute end of her available stretch — NOT a soft bent knee, NOT a partial straighten, NOT stopping early halfway. She holds completely still in this full end-range stretch for 4 full seconds, then very slowly bends the right knee back over 2 full seconds. Only 1 rep on this leg, no additional reps, no switching sides. No rushing, clean pauses. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion. Exercise is called Supine Hamstring Stretch

**Kling settings:** Elara · 1080p · **10s** · 16:9 · Multi-Shot OFF · Audio OFF.

---

### 🔄 Banded Romanian Deadlift — `banded_rdl`
**Status:** v2 prompt (2026-08-19) — fixes knees-too-straight and ROM-too-deep failures from v1. Clothing coverage added.

**Previous failures:**
- v1: knees locked straight throughout — needs explicit constant soft-bend language.
- v1: torso went past horizontal (too deep) — this exercise only, cap at roughly parallel (NOT past).

**Clinical form (shot list + catalog):**
- Standing hip hinge; band under feet, ends held at hip height.
- **Soft slight knee bend throughout** — never lock out, never squat.
- Hinge until torso ~parallel to floor (not past horizontal) — feel hamstring tension.
- Flat neutral back throughout.

**Locked prompt (v2 — use this):**
> Banded Romanian Deadlift : Pure 90-degree side profile, static camera. Neutral relaxed face, no expressions, no smiling. Reference woman linked Elara — wearing a fitted high-neck long-sleeve moisture-wicking workout top and full-length leggings. Standing on a grey yoga mat in side profile, feet hip-width apart, standing on a looped resistance band, holding both ends of the band in her hands at hip height. Soft slight bend in both knees maintained throughout the entire movement — knees must never lock straight and never deeply bend; this soft bend is constant from start to finish on both reps. She very slowly hinges at the hips over 3 full seconds, pushing her hips backward and sliding her hands down the front of her thighs while keeping her back completely flat and neutral — NOT a squat, NOT rounding the spine. She stops when her torso is roughly parallel to the floor — a full but moderate RDL depth, NOT tilting the torso past horizontal, NOT touching the floor. She holds completely still at this bottom position for 1 full second, then very slowly drives her hips forward over 3 full seconds to return to standing fully upright. Pauses 1 full second at the top. Repeats the exact same hinge a second time with identical timing and identical constant soft-knee position. Only 2 reps total, no additional reps. No rushing, clean pauses. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Kling settings:** Subject Binding = Elara · 1080p · 10s · 16:9 · Multi-Shot OFF · Audio OFF. Trim facing-camera intro if present.

---

### 🔄 Back Extension (45°) — `back_extension_45`
**Status:** Retry v1 (2026-08-19) — previous AI attempts failed entirely. New prompt describes the bench clearly, starts at the extended (top) position, clothing coverage added. If Kling still cannot render the machine, use Pexels placeholder.

**Clinical form (shot list):**
- On 45° hyperextension bench, thighs on the angled pads, feet anchored under foot pegs, arms crossed over chest.
- Start: body forms one straight neutral line (extended/top position).
- Lower: hinge at hips with flat neutral back down to ~90° hip angle (torso toward floor).
- Raise: extend back up to neutral straight line — **do NOT hyperextend past neutral**.

**Locked prompt (v1 — 1 rep, 3+1+3+1 = 8s):**
> Back Extension (45°) : Pure 90-degree side profile, static camera. Neutral relaxed face, no expressions, no smiling. Reference woman linked Elara — wearing a fitted high-neck long-sleeve moisture-wicking workout top and full-length leggings. Positioned face-down in a 45-degree hyperextension bench: thighs resting on the padded thigh support, feet secured under the foot pegs, arms crossed over her chest. She starts in the extended position — her entire body forms one completely straight neutral line from her head through her hips and down to her ankles, hips and lower back fully extended. She very slowly hinges forward at the hips over 3 full seconds, lowering her torso toward the floor while keeping her back flat and neutral — NOT rounding — until her torso reaches roughly 90 degrees to her legs. She holds completely still at the bottom for 1 full second, then very slowly drives back up through the hips over 3 full seconds, raising her torso until her body returns to one perfectly straight neutral line — NOT hyperextending or arching past neutral, just straight. Pauses 1 full second at the top. Only 1 rep total, no additional reps. No rushing, clean pauses. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Kling settings:** Subject Binding = Elara · 1080p · 10s · 16:9 · Multi-Shot OFF · Audio OFF. If the bench renders incorrectly, do not retry — use Pexels.

---

### 🔄 Leg Press — `leg_press`
**Status:** v2 prompt (2026-08-19) — v1 failed to lock out (stopped short). Hardened lockout language. Clothing coverage added.

**Previous failure:**
- v1: legs never reached full extension at the top — always stopped at ~130° knee angle.
- Fix: explicit "legs FULLY straight, knees completely locked out" + NOT exclusions + prefer full ROM over any pause.

**Clinical form (shot list):**
- Seated in leg press machine, back on reclined pad, feet flat shoulder-width on the platform above.
- Push platform to full leg extension (straight knees) — full foot contact, drive through mid-foot.
- Lower slowly until knees approach chest (deep bend, stop before lumbar rounding).

**Locked prompt (v2 — use this):**
> Leg Press : Pure 90-degree side profile, static camera. Neutral relaxed face, no expressions, no smiling. Reference woman linked Elara — wearing a fitted high-neck long-sleeve moisture-wicking workout top and full-length leggings. Seated in a leg press machine in side profile — back reclined against the padded backrest, feet flat and shoulder-width apart on the large platform, knees deeply bent pointing toward her chest. She very slowly presses the platform away from her over 3 full seconds through a full complete range of motion — legs extend all the way until both knees are completely straight and fully locked out, legs fully extended, NOT stopping at 90 degrees, NOT stopping at 130 degrees, NOT a half press, knees must be fully straight at the top. She holds this fully-extended locked-out position completely still for 1 full second, then very slowly bends her knees to lower the platform back over 3 full seconds until her knees return to the deep starting position near her chest. Pauses 1 full second at the bottom. Repeats the exact same full-ROM press a second time with identical timing and full lockout. Only 2 reps total, no additional reps. Full complete range of motion from start to finish. No rushing, clean pauses. Clean white studio background, soft even lighting. Physical therapy demonstration. Photorealistic, smooth motion.

**Kling settings:** Subject Binding = Elara · 1080p · 10s · 16:9 · Multi-Shot OFF · Audio OFF.

---

## Exercises not yet attempted

Use `shot_list.md` + catalog `instructions` as source of truth.  
**Before prompting:** if movement is hard to describe in one unambiguous sentence, ask user to review draft prompt.

| # | Exercise | File | Risk notes |
|---|---|---|---|
| 5 | Supine Figure-4 Stretch | `figure_4_stretch` | ⛔ AI failed — crossed-leg + pull too complex; skip for now (with Clamshell) |
| 6 | Supine Hamstring Stretch | `hamstring_stretch` | Medium risk — one leg up; other bent |
| 14–30 | Standing / bands / gym | various | Prefer simplest bilateral standing/seated first; equipment later |

---

## Changelog

| Date | Exercise | Change |
|---|---|---|
| 2026-08-19 | (global) | **HARD: clothing coverage required on every prompt** — add `"wearing a fitted high-neck long-sleeve moisture-wicking workout top and full-length leggings"` to prevent Kling's default sports-bra clothing from showing cleavage |
| 2026-08-19 | Banded RDL | v2: soft-knee language hardened ("soft slight bend constant from start to finish"); ROM capped at parallel (NOT past horizontal); clothing added |
| 2026-08-19 | Back Extension (45°) | Retry v1: detailed bench description, starts at extended top position, clothing added; 1 rep (3+1+3+1=8s) — 2 reps would be 16s; if bench renders wrong → Pexels |
| 2026-08-19 | Leg Press | v2: full-lockout language tripled ("completely straight", "fully locked out", "NOT stopping at 130°", "NOT a half press"); clothing added |
| 2026-08-19 | Clamshell | v3: unmarked "dead" — retrying with Kling 3.0; all v2 form fixes kept; clothing coverage added |
| 2026-08-19 | Banded Clamshell | v1 first attempt: mirrors Clamshell v3 with band above knees; clothing coverage added |
| 2026-08-19 | Side Plank (Knees) | v2: clothing coverage added to existing locked prompt |
| 2026-08-19 | Side Plank (Full) | v2: clothing coverage added to existing locked prompt |
| 2026-07-19 | Bodyweight Hip Hinge | Done in PT videos; wire later. Numeric 120° still undershot → harden global ROM overshoot rule |
| 2026-07-19 | (global) | HARD: Kling always truncates ROM — overspecify end position + "full deep ROM" + NOT half/partial |
| 2026-07-19 | (global) | HARD: **total timed movement ≤ 8s** (sum of all phases); over budget → 1 rep + shorter holds |
| 2026-07-19 | (global) | Kling prompt pattern: `{Name} : ` lead-in + Elara ref + ROM overshoot + `No rushing, clean pauses.` (no trailing exercise name) |
| 2026-07-19 | Supine Hamstring Stretch | v2: 2s+4s+2s = 8s total, 1 rep, aggressive ROM |
| 2026-07-19 | Supine Figure-4 Stretch | ⛔ AI failed — too complex; skip with Clamshell; prefer simplest bilateral/seated next |
| 2026-07-19 | Thoracic Extension (Chair) | Queued as easiest remaining — seated, one-plane |
| 2026-07-19 | Side Plank (Knees) | ⛔ AI weak — hands fiddling, not a clean plank; skip for now with Figure-4/Clamshell |
| 2026-07-19 | Banded RDL | Knees too straight (need clearer soft bend); ROM overshot too deep on THIS move only — cap nearer 120°, do not weaken global ROM rule for other exercises |
| 2026-07-19 | Kettlebell Deadlift | Clip cut at top before rep finished — start already holding equipment in start pose; no floor pickup |
| 2026-07-28 | Kettlebell Deadlift | FLAG later: `new_kettlebell_deadlift.mp4` in PT folder — needs trim/center before upload+wire |
| 2026-07-28 | Back Extension (45°) | Ref v2: first 4s + deshake + mild center crop (`back_extension_45_ref_1rep.mp4`); prompt hard-locks static camera |
| 2026-07-19 | Leg Press | Failed to fully lock out — harden lockout language; prefer full ROM over pauses within 8s budget |
| 2026-07-19 | Back Extension (45°) | ⛔ AI failed hard — skip for now |
| 2026-07-09 | Bodyweight Squat | Kling v1: good identity/motion; shallow ROM + hands-at-sides + facing-cam intro. v2: below-parallel depth, hands clasped, 2 reps / 10s |
| 2026-07-09 | (global) | Added ROM depth rule, hand-position rule, Kling start-frame trim rule; clarified 1-rep = free-tier smoke test only |
| 2026-07-09 | (global) | Codified hard rules: 2 reps/~10s for rep-based moves, real-time literal pauses/holds, hold-based stretches use extend feature instead of compressing |
| 2026-07-09 | Single-Leg Glute Bridge | Confirmed done via skill test run ("Prone Leg Raise"); needs file moved into repo |
| 2026-07-09 | Open-Book Rotation, Side Plank (Knees), Side Plank (Full) | Added full locked prompts, ready to send |
| 2026-07-08 | Single-Leg Glute Bridge | v2: 2 reps only, switch legs rep 2, neutral face |
| 2026-07-08 | Clamshell | v2: pure side profile, neutral face, feet together, NOT circle/kick |
| 2026-07-08 | (global) | Created doc; added accuracy rule + ask-user-before-guessing |
