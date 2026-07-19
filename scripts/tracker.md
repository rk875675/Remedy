# Exercise Video Tracker

Status: ✅ done | 🔄 in progress | ⬜ todo  
Method: **Luma** (primary) | **YT** (YouTube → rembg pipeline, legacy)

Catalog v3 (migration 031): **30 assignable exercises** — 19 bodyweight, 6 bands/dumbbells, 5 gym.  
Cut (do NOT film): Pelvic Tilt, Knee-to-Chest, Supine Trunk Rotation, Standing Back Extension, Prone Hip Extension.

**Prompts & iteration notes:** `scripts/luma_notes.md` (copy prompts from there — don't reprompt from scratch)

**Luma workflow (locked from v1 batch):**
- Upload character reference image every time (no appearance text in prompt)
- Side profile, static camera, grey yoga mat, white studio, soft even lighting
- First frame = start position at rest
- **Neutral face, no expressions** (reduces bad-AI read)
- Explicit second counts + "holds completely still" + "identical timing each rep" + "No rushing"
- Cap reps low (~2 per clip) — 3+ reps causes rushed endings
- Silent clips — no voiceover, no on-screen text
- Generate in batches; review all before re-running (saves credits)
- **Prompts must be clinically accurate** — if movement is ambiguous, ask user to review before generating

**Catalog v3 dosing to reflect in prompts:**
- Bird Dog / Side Planks: **10-second holds** per rep (McGill protocol)
- Dead Bug: **3-second lowers**, alternate sides
- Stretches: **20–30 sec holds** per side
- Loaded exercises: controlled tempo, no rushing

---

## Progress: 7 / 30 done

| Done | Exercise | File Name | Method | Notes |
|---|---|---|---|---|
| ✅ | McKenzie Press-Up | `mckenzie_press_up` | YT | YouTube+rembg test; consider Luma redo |
| ✅ | Cat-Cow Stretch | `cat_cow` | Luma | |
| ✅ | Bird Dog | `bird_dog` | Luma | ⚠️ may need regen for 10s holds (catalog v3) |
| ✅ | Dead Bug | `dead_bug` | Luma | |
| ✅ | Glute Bridge | `glute_bridge` | Luma | Gold-standard prompt template |
| ✅ | Child's Pose Hold | `childs_pose` | Luma | |
| ✅ | Single-Leg Glute Bridge | `single_leg_glute_bridge` | Luma (skill) | Done via skill test run; file needs moving into `scripts/output/` |

---

## Tier 1 — Floor (Prone)
| # | Exercise | File Name | Method | Status |
|---|---|---|---|---|
| 1 | McKenzie Press-Up | `mckenzie_press_up` | YT | ✅ |

## Tier 1 — Floor (Supine)
| # | Exercise | File Name | Method | Status |
|---|---|---|---|---|
| 2 | Dead Bug | `dead_bug` | Luma | ✅ |
| 3 | Glute Bridge | `glute_bridge` | Luma | ✅ |
| 4 | Single-Leg Glute Bridge | `single_leg_glute_bridge` | Luma | ✅ |
| 5 | Supine Figure-4 Stretch | `figure_4_stretch` | Luma | ⬜ |
| 6 | Supine Hamstring Stretch | `hamstring_stretch` | Luma | ⬜ |

## Tier 1 — Floor (Side-Lying)
| # | Exercise | File Name | Method | Status |
|---|---|---|---|---|
| 7 | Clamshell | `clamshell` | Pexels / hire later | ⛔ AI dead (I2V + Motion Control failed); placeholder or film |
| 8 | Open-Book Rotation | `open_book_rotation` | Luma | ⬜ |
| 9 | Side Plank (Knees) | `side_plank_knees` | Luma | ⬜ |
| 10 | Side Plank (Full) | `side_plank_full` | Luma | ⬜ |

## Tier 1 — All Fours
| # | Exercise | File Name | Method | Status |
|---|---|---|---|---|
| 11 | Cat-Cow Stretch | `cat_cow` | Luma | ✅ |
| 12 | Bird Dog | `bird_dog` | Luma | ✅ |
| 13 | Child's Pose Hold | `childs_pose` | Luma | ✅ |

## Tier 1 — Standing
| # | Exercise | File Name | Method | Status |
|---|---|---|---|---|
| 14 | Hip Flexor Stretch (Half-Kneeling) | `hip_flexor_stretch` | Luma | ⬜ |
| 15 | Bodyweight Hip Hinge | `hip_hinge` | Luma | ⬜ |
| 16 | Bodyweight Squat | `bodyweight_squat` | Kling | 🔄 v2 regen (see luma_notes) |
| 17 | Single-Leg RDL (Bodyweight) | `single_leg_rdl` | Luma | ⬜ |
| 18 | Split Squat | `split_squat` | Luma | ⬜ |

## Tier 1 — Seated
| # | Exercise | File Name | Method | Status |
|---|---|---|---|---|
| 19 | Thoracic Extension (Chair) | `thoracic_extension_chair` | Luma | ⬜ |

## Tier 2 — Bands / Dumbbells
| # | Exercise | File Name | Method | Status |
|---|---|---|---|---|
| 20 | Banded Clamshell | `banded_clamshell` | Luma | ⬜ |
| 21 | Banded Row | `banded_row` | Luma | ⬜ |
| 22 | Banded Romanian Deadlift | `banded_rdl` | Luma | ⬜ |
| 23 | Dumbbell Romanian Deadlift | `dumbbell_rdl` | Luma | ⬜ |
| 24 | Goblet Squat | `goblet_squat` | Luma | ⬜ |
| 25 | Suitcase Carry | `suitcase_carry` | Luma | ⬜ |

## Tier 3 — Gym
| # | Exercise | File Name | Method | Status |
|---|---|---|---|---|
| 26 | Barbell Hip Thrust | `barbell_hip_thrust` | Luma | ⬜ |
| 27 | Seated Cable Row | `seated_cable_row` | Luma | ⬜ |
| 28 | Leg Press | `leg_press` | Luma | ⬜ |
| 29 | Kettlebell Deadlift | `kettlebell_deadlift` | Luma | ⬜ |
| 30 | Back Extension (45°) | `back_extension_45` | Luma | ⬜ |

---

## After export
Save each clip as `scripts/output/{file_name}.mp4`, then upload to Supabase Storage `videos/exercises/`.
