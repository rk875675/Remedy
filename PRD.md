# Remedy — Product Requirements Document
**Version:** 0.4 (MVP)
**Last updated:** November 15, 2026
**Status:** Draft

---

## ⚠️ Cursor / AI Coding Rules

These rules apply to every prompt sent to Cursor. They are non-negotiable.

1. **Do not invent features.** Only build what is explicitly described in this PRD. If something is unclear, output a `// HUMAN INPUT NEEDED:` comment and stop.
2. **Do not modify working code** unless the prompt explicitly says to. If a fix requires touching something outside the stated scope, flag it and ask.
3. **Do not install new dependencies** without confirming first. List what you'd add and why, then wait.
4. **Minimal diffs only.** Change the least amount of code needed to accomplish the goal. No refactors unless asked.
5. **No placeholders replaced with real implementations** unless explicitly instructed. Placeholder videos, mock data, and stub functions stay as-is until told otherwise.
6. **Flag ambiguity, don't guess.** If the PRD doesn't cover a case, say so — don't invent behavior.
7. **Protect existing functionality.** Never change a working screen or flow as a side effect of building something new.

---

## 1. Vision

Remedy is a consumer mobile app that helps anyone with back pain — from desk workers to powerlifters to retirees — relieve and recover through structured, video-guided exercise programs personalized to their situation. The experience is clean, premium, and built around real PT expertise. It sits in the space between "Google a YouTube video" and "pay $200/hr for a PT session."

V1 is back pain only. Neck, shoulder, hip, and other areas come later.

---

## 2. The Problem

People with back pain have two bad options:
- **Too vague:** YouTube videos, Reddit posts, generic stretching guides. No structure, no progression, no accountability.
- **Too expensive/inaccessible:** In-person PT. Most people can't afford it, can't access it, or don't know when they actually need it.

There's no consumer product that gives them a real, structured program — the kind a PT would actually prescribe — in a beautiful, easy-to-use app that works whether you're 60 years old with chronic stiffness or a 28-year-old athlete who tweaked their back at the gym.

---

## 3. Target User

**Primary:** Anyone with back pain. The app is designed to serve the full spectrum through onboarding-driven personalization:

| Persona | Profile | Program focus |
|---------|---------|---------------|
| Desk worker | 30s–40s, sedentary, chronic lower back ache | Mobility, posture, core stability |
| Older adult | 55+, stiffness, limited mobility, cautious | Gentle movement, low-impact |
| Parent / active adult | 35–50, occasional flare-ups, time-constrained | Short sessions, maintenance |
| Gym-goer / athlete | 20s–30s, training-related pain, wants to stay active | Strength-based rehab, return to lifting |
| Powerlifter / serious athlete | Specific movement dysfunction, high body awareness | Performance-focused rehab |

**Not the target:** Acute injury patients who need in-person diagnosis. The late careful check advises a clinician and records the answer (see Section 5). It does not stop the funnel.

**User mindset:** "I know I should be doing something about this. I just don't know what, and I don't want to make it worse."

**Key design constraint:** The program content and UX must feel appropriate across all personas. Personalization happens through onboarding routing — not by building separate apps for each group.

---

## 4. MVP Scope

### In scope (V1)
- Onboarding questionnaire with interstitial stats/insight screens
- Back pain program only (10 to 16 weeks, length and content personalized by onboarding answers)
- Video session player (placeholder videos during development)
- Daily session tracking
- Pain check-in (before/after each session)
- Paywall + subscription (monthly + annual)
- Pet armadillo: a character the user names, which grows through five stages as sessions are completed (see §6.9)

### Out of scope (V2+)
- Neck, shoulder, hip, knee pain programs
- AI-adaptive programming
- Live coaching or messaging
- Computer vision / form feedback
- Community / social features
- Wearable integration
- Employer / insurance partnerships
- Pet extras: outfits, coins, home-screen widget, alternate app icons, rigged (Rive) animation, missed-days push notifications

---

## 5. User Flow

### Onboarding
Step order is `OB_STEPS` in `constants/onboardingFlow.ts`. Copy for each screen lives in that screen file.

**Cold open.** No progress bar. Welcome shows the curled pet and Get started. Tapping Get started records consent: the person confirms they are 17 or older, agrees to the Terms and Privacy Policy, and consents to Remedy using their back and health answers to build the plan (legal acceptances `age`, `health_consent`, `terms`, `privacy`). Meet is an Open button: the curled ball unfurls into the fully grown armadillo. Pet is naming, then an optional first name (Skip leaves the first name empty). People who already have a pet skip Meet and Pet.

**Four chapters.** A four-segment progress bar fills only inside a chapter. Chapter openers have no answer.

1. **Goals.** Opener, then the goal and "hard right now" questions, then an outlook chart cited to CMAJ 2012.
2. **Your back.** Opener, then location through intensity. The leg question is conditional.
3. **How it behaves.** Opener, then movement through the nervous-system deck, then a result beat cited to the Lancet 2023 RESTORE trial. The result is labeled a pattern check, not a diagnosis.
4. **About you.** Opener, then conditions through the careful check.

**Loader.** "Personalizing your plan" runs four rows. After the second row, a popup asks where they heard about Remedy (Instagram, TikTok, YouTube, Facebook, Google, Friend or family, Other, or Skip), stored as local `hear_about`. The popup is skipped when that value is already set.

**Plan reveal.** The plan page summarizes the profile and, when the server preview arrives, week 1. Hold to commit (about 1.1 seconds) stores `committed_at` and opens the paywall. Sign-up (Apple, Google, or email) is after the paywall. If the paywall is closed without buying, the pet says it will wait.

**Questions, in order.** Rows marked sensitive do not send the chosen option values to analytics. The step can still be recorded as viewed and completed. `onboarding_answers` is the legacy eight-field row. `user_intake` is the new JSON object (`user_intake.answers`, version 1). Pet name, first name, reminder time, attribution, commit time, and the disclaimer timestamp are local progress, not either table.

| Question | Options | Stored |
|---|---|---|
| Name your armadillo | Free text, 1 to 20 characters, plus suggestions | Local `pet_name` |
| Your first name | Free text, max 24 characters, or Skip | Local `first_name` (null if skipped) |
| What do you want most? | Less pain, day to day; Move freely again; Get back to training; Sleep without waking up sore. At least one. First tap stays index 0 | `onboarding_answers.main_goal` |
| What's hard right now? | Two pages, same step. Page 1: Getting out of bed; Bending or lifting; Sitting for long; Standing for long; Walking far. Page 2 ("Anything else?"): Stairs; Twisting or turning; Reaching overhead; Sleeping through the night; Working out or sport. Either page can be empty ("None of these"). The stored list and `pain_trigger` are written from both pages together | `user_intake.hard_now`. Also writes `onboarding_answers.pain_trigger`, derived: sitting, bending, standing (standing or walking), morning (bed), exercise. Empty derivation stores `other` |
| Where does it hurt? | Back map: upper, lower, or both ("All over") | `onboarding_answers.pain_location`: `upper`, `lower`, or `all` |
| Does it stay in one place? | Yes, the same spot; Mostly one side; It moves around; It travels into my hip or leg; I'm not sure | `user_intake.spread` |
| How long has this been going on? | Less than 2 weeks; 2 weeks to 3 months; 3 to 12 months; 1 to 5 years; More than 5 years | `user_intake.duration_detail`. Also writes `onboarding_answers.pain_duration`: under 2 weeks = `acute`, 2 weeks to 3 months = `subacute`, the rest = `chronic` |
| How did it start? | An injury or accident; Lifting or one wrong move; After surgery; During or after pregnancy; It built up over time; It just appeared one day; I'm not sure | `user_intake.onset` |
| What does it feel like? | Stiff and tight; A dull ache; Sharp or catching; Travels, tingles or goes numb. At least one | `onboarding_answers.pain_type` (`stiffness`, `ache`, `sharp`, `nerve`). If sharp or nerve is selected and duration is under 2 weeks, a note says to check with a doctor if it gets worse, and the person can keep going |
| How far down does it go? Conditional. Sensitive | Buttock or thigh, above the knee; Below the knee; All the way to the foot or toes. Shown only when spread is `leg`, pain type includes `nerve`, or conditions include sciatica. Otherwise `leg_reach` is null | `user_intake.leg_reach` |
| On a normal day, how strong is the pain? Sensitive | A clock of eleven marks, 0 at the lower left through 10 at the lower right, under the pet's question bubble. Drag follows the finger and settles on the nearest mark. A tap sends the armadillo along the ring with a short roll. Bands: None (0), Mild (1–3), Moderate (4–6), Strong (7–8), Severe (9–10). Continue stays off until a number is chosen. No helper note | `user_intake.intensity` |
| How does moving feel? | Stiff; Weak; Wobbly or unstable; Uneven, one side works harder; Unsafe, like it could go any second. Empty is allowed. The stored enum still accepts `guarded` for older rows. This screen does not offer it | `user_intake.movement_feel` |
| Which feels better? | Curling up or bending forward; Standing tall or arching back; No real difference. Flat illustrations | `user_intake.relief_direction` (`flexion`, `extension`, `neither`) |
| After a flare-up, how long until it settles? | Minutes; A few hours; By the next day; Days or longer; It doesn't really flare | `user_intake.flare_settle` |
| Which way is it heading? | Slowly better; About the same; Getting worse; Up and down | `user_intake.trend` |
| How much does it get in your way? | It doesn't; A little; Some days; Most days; A lot, every day | `user_intake.limitation` |
| Is it predictable from day to day? Sensitive | Pretty much; It varies a bit; Not at all | `user_intake.ns.predictable` |
| Can small things set it off? Sensitive | Not really; Sometimes; Yes | `user_intake.ns.small_triggers` |
| Does it flare with stress or a bad night? Sensitive | Not really; Sometimes; Yes | `user_intake.ns.stress` |
| Can just expecting it bring it on? Sensitive | Not really; Sometimes; Yes | `user_intake.ns.anticipation` |
| Do you avoid certain movements because of it? Sensitive | Not really; Sometimes; Yes | `user_intake.ns.avoidance` |
| Anything else I should know about? Sensitive | Two pages, same step. Page 1: Sciatica; Herniated or bulging disc; Arthritis; Spinal stenosis; Scoliosis. Page 2 ("And any of these?"): Fibromyalgia; Osteoporosis; Back surgery; Gave birth in the last year; Currently pregnant. Either page can be empty ("None of these"). The stored list is written from both pages together | `user_intake.conditions` |
| How old are you? Sensitive | Under 30; 30 to 44; 45 to 59; 60 to 69; 70 or older | `user_intake.age_band` |
| How much do you move in a normal week? | Mostly sitting; Lightly active; Very active. The stored enum still accepts `athlete` for older rows. This screen does not offer it | `onboarding_answers.activity_level` |
| What can you train with? | Full gym; Bands or dumbbells; Just floor space | `onboarding_answers.equipment` (`gym`, `bands_dumbbells`, `open_space`) |
| How much time can you give this? | Minutes: 15, 20, or 30. Days: 3, 4, 5, 6, or 7. A recommended tile is preselected. Answers are written on Continue, not on mount | `user_intake.minutes` and `onboarding_answers.sessions_per_week_preference` |
| When should I remind you? | In the morning (around 8:00); Around lunch (around 12:30); In the evening (around 6:30). "Not now" stores null. Then the OS permission prompt | Local `reminder_time` |
| One careful check. Sensitive | Any of: groin or inner-thigh numbness, or new bladder or bowel trouble; new or worsening weakness in a leg or foot; fever or feeling unwell with the back pain; pain after a major fall or accident; a history of cancer; unexplained weight loss; and, only if they reported surgery, back surgery in the last 3 months or not yet cleared to exercise. Empty is "None of these" | `user_intake.red_flags` (empty array if none) and `user_intake.red_flag_ack`. Also local `has_red_flag`, `safety_accepted_at`, and the `disclaimer` legal acceptance |

A selected red flag opens an advisory sheet (stronger wording if saddle numbness or new leg weakness is selected). "I'll get it checked first" stores the flags and continues. "Go back" closes the sheet. The funnel is not hard-blocked. The plan page shows a clinician note when a red flag, pregnancy, or post-surgery is set.

### Core Loop (Daily)
1. Open app → see today's session on home screen
2. Tap "Start Session" → session player launches
3. Session player: one exercise at a time, video + timer + rep/set guide
4. End of session: pain check-in (1–10 slider, before vs after)
5. Completion screen → the pet celebrates, and grows if the session crossed a stage threshold → next session preview

---

## 6. Core Features

### 6.1 Authentication
- Three sign-up options: **Sign in with Apple**, **Sign in with Google**, **Email + password**
- Shown after paywall — user sees the value and commits before creating an account
- All three handled via Supabase Auth (native Apple/Google OAuth + email provider)
- Apple Sign In is required by App Store if any other social login is offered
- Email option: standard email + password, with email verification via Resend
- No username creation — display name pulled from Apple/Google profile or set from email

### 6.2 Onboarding Questionnaire
- Full step order, questions, and options are in Section 5
- Four chapters, each with its own segment of the progress bar. No bar on the cold open, the loader, or the plan page
- Eight legacy fields stay on `onboarding_answers` (strict schema, unchanged enums). New answers are one JSON object on `user_intake` (version 1). Migration `090_intake_and_exercise_details.sql` adds that table and does not alter `onboarding_answers`
- `pain_trigger` is derived from "what's hard right now". `pain_duration` is derived from the five-way duration question (under 2 weeks = acute, 2 weeks to 3 months = subacute, longer = chronic)
- Option values for leg reach, pain intensity, the nervous-system deck, conditions, age, and the careful check are not sent to analytics

### 6.3 Programs
Back pain only. Two engines write the same plan shape. `rules_version` is 2 when v2 runs.

- **Length:** 10 to 16 weeks, one plan built up front. v2 (`programWeeks` in `lib/intake.ts`, mirrored for the edge function) starts at 10 and adds: 1 for pain lasting 3 to 12 months, 2 for 1 to 5 years, 3 for more than 5 years; 1 when irritability or sensitization is high; 1 after surgery, postpartum, or at 70 or older; 1 when the goals include getting back to training. Capped at 16. v1 reads a bucket map from assignment rules (migration 092): 10 weeks for acute and subacute, 12 for chronic. A plan snapshot keeps the length it was built with.
- **Pacing (v2):** progression follows the week number, not the share of the program. Target tier steps up at weeks 2, 3, and 5 for a build start; 2, 4, and 8 for control; 3 and 8 for calm. Calm moves to control sessions from week 3 and build sessions from week 9; control moves to build from week 4. Moderate irritability gets the full dose column from week 5 unless the trend is worse. Load tier steps up at weeks 2, 3, and 5. All of this stays under the person's tier and load caps.
- **Days per week:** the time question stores 3 to 7. If that preference is missing, the engine uses the activity-by-duration recommendation and clamps to 3..7.
- **Engine v1** (`buildPlan` in `supabase/functions/_shared/assignment/engine.ts`) is unchanged. It runs when there is no valid intake, when no `exercise_details` rows loaded, or when v2 throws. It personalizes from the eight legacy answers. It keeps the slot template, the three session types (Mobility & Relief, Stability & Core, Strength & Function), and early / mid / late phases. In the late phase the relief day is replaced by a second strength day. Each week has an intensity target from 1 to 5, and selection climbs movement-pattern ladders toward it. Reps on a held variant progress from the base toward about 1.25x, then reset when a harder variant swaps in. Strength and activation reps are capped at 15. Core isometrics stay short holds, not long continuous holds.
- **Engine v2** (`engineV2.ts`) runs only when a valid intake exists and at least one `exercise_details` row loaded. `deriveProfile` in `lib/intake.ts` (mirrored for the edge function) builds a clinical profile from the legacy answers plus the intake:
  - Irritability (low, moderate, high) from intensity, how long a flare takes to settle, small triggers, limitation, trend, sharp or nerve pain, and duration under 2 weeks.
  - Directional bias (flexion-sensitive, extension-sensitive, or neutral), marked clear, lean, or none. High sensitization plus pain that moves around clears a lean bias back to neutral.
  - Sensitization and fear of movement, each low, some, or high.
  - Radicular: none, referred, or below the knee. Leg-like means spread is `leg`, pain type includes `nerve`, or conditions include sciatica.
  - Mode: calm, control, or build, from irritability.
  - Capacity 1 to 3 and caps. Capacity starts at 1, becomes 2 when irritability is low, and 3 when irritability is low, activity is active or athlete, and limitation is none or little. Age 70 or older forces capacity to 1. Age 60 to 69 lowers a 3 to a 2. Tier cap starts at 5, then the lowest that applies: 3 at 70 or older, 4 at 60 to 69, 2 if pregnant or post-surgery, 3 if postpartum or osteoporosis. Load cap is bodyweight if pregnant, post-surgery, or any red flag is set; light if osteoporosis or postpartum and none of those apply; otherwise full.
  - Avoid tags for the whole program, and a separate set used only in the early weeks.
- **Session types.** Each week takes the first N names in a rotation, where N is days per week. Calm: A B A B A B A. Control: A B C B A C B. Build: B C A C B C A. A is Mobility & Relief, B is Stability & Core, C is Strength & Function.
- **Slot recipes,** in priority order, then displayed as prep, mobility, control, glute, hinge, legs, pull, cooldown. A: prep, control, mobility, cooldown, glute, mobility. B: prep, control, control, glute, cooldown, hinge. C: prep, hinge, legs, control, glute, pull. Upper-back pain swaps hinge for pull and legs for mobility. High relaxation, mobility, or strength emphasis, bending exposure from week 2, and calm mode reorder or drop slots. Calm mode drops legs and pull.
- **Time budget.** Chosen minutes are 15, 20, or 30, which start a session at 4, 5, or 6 slots. High irritability or fibromyalgia removes one slot, and the high-irritability dose column removes one more. The count stays between 3 and 6. Slots are then dropped or added so estimated minutes sit near the chosen budget.
- **Dose columns** are named for irritability: `high`, `moderate`, `low`. `high` is the lighter dose. A gentle start forces the `high` column for weeks 1 and 2. Gentle start is on when irritability is high, sensitization is high, fibromyalgia is set, the person is pregnant or post-surgery, any red flag is set, or duration is under 2 weeks. Isometric holds never go above 10 seconds and progress by reps. Loaded-strength reps are capped at 12.
- **Pattern ladders.** On work slots (control, glute, hinge, legs, pull), a movement pattern stays at a tier for two weeks before a harder exercise in that same pattern can replace it. In any slot, an exercise that has been held for four weeks and cannot step up rotates out for the best other fit at the same tier or harder, so long programs do not repeat the same week.
- **Exclusions** use contraindication tags on `exercise_details` (or `exercises.aggravates` when a detail row is missing). Whole program: below-knee radicular excludes neural tension; stenosis with an extension-sensitive bias excludes extension end-range and loaded extension; osteoporosis excludes loaded or end-range flexion and rotation; pregnancy excludes prone work, high abdominal pressure, and loaded flexion. Early weeks cover the directional bias, referred leg pain, postpartum abdominal pressure, post-surgery end range, balance work at 70 or older, and loaded flexion when pain is sharp or nerve-like. A tag in the whole-program set is not repeated in the early set.
- A failed `user_intake` save does not block assignment. With no intake on the server, assignment uses v1.
- Exercise catalog: 40 active exercises across bodyweight (27), bands/dumbbell (8), and gym (5) tiers, linked by movement-pattern intensity ladders
- Program designed and recorded by licensed PT partner
- **During development: placeholder videos only** (static image or looping placeholder clip). Real videos added when PT partner content is ready. No fake exercise videos. Clearly marked as placeholder in code and UI.

### Exercise library gaps
The assignable catalog covers `breathing`, `nerve_glide`, `lumbar_flexion`, `hip_abduction`, `anti_rotation`, `scapular`, and `functional`. Breathing has no video; it uses a breathing screen. Walking is in the dosing evidence and is not an exercise row. A slot with no candidate retries control patterns, then mobility and prep patterns, then the slot is skipped.

### 6.4 Session Player
- Full-screen video for each exercise
- Exercise name + sets/reps or timer displayed clearly
- "Pause" and "Skip" controls
- Rest timer between exercises
- Auto-advances to next exercise
- Exit mid-session saves progress
- Teaching copy comes from `exercise_details` (created in migration 090, seeded in `091_seed_exercise_details.sql`), loaded by `lib/exerciseDetails.ts`. A missing or failed row leaves that exercise on the previous player behavior
- A "How to do it" sheet (`components/session/ExerciseGuideSheet.tsx`) shows the name, purpose, numbered steps, where it should be felt, common mistakes, tempo, breathing, and easier and harder lines. A pill opens it during the exercise. The first time that exercise appears, the sheet opens on its own, unless a hold countdown is already running (the pill pulses once instead)
- When `per_side` is true, the dose line adds "each side"
- When a tempo line exists, it sits under the dose
- Rep exercises with a `tempo_pattern` show a pace ring (`components/session/PaceRing.tsx`): a visual loop of the phases (Move, Pause, Return when there are three). It does not count reps or advance the set. It is hidden when the pattern is empty or reduce motion is on
- The session preview lists the exercises in order under the summary: index, name, and the same dose text, including "each side". Let's go stays pinned

### 6.5 Pain Check-In
- Simple 1–10 slider: "How is your pain right now?"
- Captured before session starts and after session ends
- Stored per session for progress view later

### 6.6 Progress Tracking
- Weekly completion (e.g., "3/4 sessions this week")
- Pain trend graph (average pain score over time)
- Program progress bar (Week 2 of 12)

### 6.7 Home Screen
- Pet scene (forest green, full-bleed) as the top of the screen: the pet's name, the armadillo at its current stage and mood standing on a hill, and "N sessions until it grows"
- The day's action lives on that hill, not in a separate card: one label line (e.g. "TODAY · 18 MIN · 5 EXERCISES"), the session title, and one Start button; rest day, done-for-today, program-complete and no-plan states use the same block
- This-week card below the scene
- Quick pain summary ("Your pain is trending down 📉")
- Program progress

### 6.8 Paywall + Subscription
- $4.99/week (7-day free trial)
- $12.99/month (14-day free trial)
- $79.99/year (7-day free trial, ~$6.67/month, save 49%)
- Paywall UI + A/B experiments managed via **Superwall**
- Subscriptions processed via **Apple IAP / StoreKit** (iOS-first)
- No Stripe, no web checkout, no external purchase links for in-app premium unlocks
- The free portion is onboarding through the plan preview. The paywall is on that screen, before sign-up and before the first session.

### 6.9 Pet (Armadillo)
- **One pet per user, named by the user.** Named on the pet screen after the open reveal (1 to 20 characters, no default name). Both screens are skipped when the person already has a pet. Existing users name it from a one-time sheet on Home. Renamable from Profile.
- **Stage (1–5), server-authoritative, only ever goes up.** Driven by lifetime completed sessions: closed ball (0) → peeking out of the ball (1) → sitting (4) → standing (9) → fully grown (15). The stage is raised inside the same server operation that completes a session. Missing days never lowers it.
- **Mood, display only, derived on the client:** idle, ready (session available today), celebrating (session just completed), proud (stage-up, week complete, program complete), sleepy (rest day or late evening), stiff (missed planned days), concerned (pain score higher after a session).
- **No guilt mechanics.** The pet never gets hurt, loses progress, or dies. Its state reflects the user's consistency, not the condition of their back — no medical claims are made through the pet.
- **The app is built around the pet; it is not an add-on.** It appears on: Home (the scene that holds the day's action), onboarding question screens (a speech bubble that reacts to the answer), sign-in, session preview, both pain check-ins (it reacts as the slider moves), rest timers, session complete (with a growth moment when a stage is reached), week complete, program complete, the first-session orientation, the next-program flow, Progress (a green journey panel where the pet stands on the current week, plus the five-stage strip), Profile (beside the user's name), feedback thanks, the error screen, and reminder notification copy.
- **Not shown** over the exercise video itself.
- **Voice:** warm and a little cheeky. Used in completion and reminder copy.
- **Art:** flat 2D sticker style with a thick black outline, a striped shell that reads as a beanie, one tooth, and a plaster on the shell until it is fully grown. One transparent image per stage and mood in `assets/pet/`, animated with the core `Animated` API (breathing, bounce, crossfade). No new packages.
- **Onboarding poses.** Seventeen stage-1 drawings of the curled ball: wave, love, notes, inspect, clipboard, thinking, bell, doctor, peeking, party, alarm, zen, lifting, study, pointing, night, flag. Registered in `constants/petImages.ts` (`PET_MOODS` and `assets/pet/s1_<mood>.png`). Stages 2 to 5 have no new drawings. `POSE_FALLBACKS` maps each of those moods onto an existing one. The same files are listed under `moods` in `growth-engine/assets/pet/registry.json`.
- **Brand:** the armadillo replaces the current logo in-app (welcome, loading, splash), on the app icon, and on the website and emails. Growth-engine marketing content is unchanged until the pet is live.

---

## 7. UI & Design System

### Color Palette (Warm, Premium)
The palette follows the armadillo: the forest green of its world, the brown of its shell, the light tan of its body. Source of truth is `constants/colors.ts`.

| Role | Color | Notes |
|------|-------|-------|
| Background | Light tan (`#F6EDE0`) | Never pure white |
| Primary accent | Forest green (`#3E6B4E`) | CTAs, active states, the pet scene |
| Secondary accent | Shell brown (`#AE5636`) | Celebration, highlights |
| Surface / cards | Warm white (`#FFFFFF`) with soft shadow | Slight warmth, not clinical |
| Text primary | Dark warm gray (`#1C1C1E`) | Not pure black |
| Text secondary | Medium warm gray (`#6B6B6B`) | Subtext, labels |
| Destructive / warning | Soft amber (`#E5A020`) | Caution states |

### Design Principles
- **Warm and premium, not clinical.** Feels like a wellness app, not a hospital portal.
- **Spacious layouts.** Generous padding, nothing cramped.
- **Rounded corners throughout.** Cards, buttons, inputs — consistent radius.
- **Soft shadows** on cards — depth without harsh borders.
- **Large, readable text.** Accessible across all age groups (minimum 16px body).
- **One mascot: the armadillo.** It is the only character in the app (see §6.9). Everything around it stays clean and spacious.
- **Skeleton loaders** over spinners for loading states.
- **Animations: subtle and purposeful.** Onboarding transitions, completion celebrations — nothing gratuitous.

### Onboarding-specific UI
- Interstitial screens use **warm illustrated graphics or simple animated charts** — not stock photos
- Stats displayed large and bold (e.g. "80%" in big type, supporting text below)
- Consistent warm gradient or card background on interstitials to visually distinguish from question screens

---

## 8. Content Strategy

### PT Partner Model
- Partner with one licensed PT (ideally a creator with existing audience)
- Structure: equity stake in company (3–8%) + revenue share if they also market/distribute
- They design the programs, appear on camera, provide clinical credibility
- All content filmed once, owned by the company
- Content format: short exercise videos (30–90 seconds each), clean background, clear demo of movement with cues

### Content Specs (V1)
- **~30 total exercise videos** (29 exercises in the active catalog)
- Each video: PT on camera, clear form demo, 1–2 verbal cues, no talking head intro/outro
- Simple, clean production — good lighting, neutral background, no fancy editing needed
- Voiceover or on-screen text for key cues (e.g., "Keep your core engaged")
- See `scripts/shot_list.md` for the complete per-exercise filming guide

---

## 8. Legal & Compliance

- Position as a **fitness and wellness app**, not a medical device or treatment
- No claims of "treating," "curing," or "diagnosing" conditions
- Consent is collected on the welcome screen, on the Get started tap (see Section 5): 17 or older, Terms, Privacy Policy, and use of back and health answers to build the plan
- The disclaimer line in `constants/legalTerms.ts` (`MEDICAL_DISCLAIMER_LINE`) is accepted on the late "One careful check" screen, which records the `disclaimer` legal acceptance: "Remedy is fitness guidance, not medical advice. See a clinician if you have a serious injury or condition."
- That screen lists the red flags in Section 5, opens an advisory sheet when any are selected, stores the answers, and continues. It does not hard-block. Sharp or nerve-like pain with duration under 2 weeks shows a note on the feel screen and still lets the person continue
- Terms of Service and Privacy Policy required at signup
- Recommend a one-time review by a health law attorney before launch (~$500–1,500)
- All content created by a licensed PT — include their credentials in the app

---

## 9. Monetization

| Plan | Price | Notes |
|------|-------|-------|
| Weekly | $4.99/week | After 7-day free trial |
| Monthly | $12.99/month | After 14-day free trial |
| Annual | $79.99/year | ~$6.67/month, save 49%, after 7-day free trial |

- Paywall UI and experiments: **Superwall** (on-device paywall/entitlement UX layer)
- Subscription processing: **Apple IAP / StoreKit** (iOS-first)
- Billing source of truth: backend (Supabase) — entitlements verified server-side, not trusted from client
- No Stripe, no web checkout, no external purchase links for unlocking premium in-app
- Restore purchases must be supported (App Store requirement)
- Free trial requires no payment upfront on iOS (standard App Store trial)
- Goal: push users toward annual plan (higher LTV, lower churn)
- Show annual savings prominently on paywall
- Idempotency keys on all billing-adjacent mutations to prevent duplicate grants

---

## 10. Success Metrics (V1)

| Metric | Target (Month 3) |
|--------|-----------------|
| Downloads | 1,000+ |
| Trial → Paid conversion | > 25% |
| Day 7 retention | > 40% |
| Day 30 retention | > 20% |
| Avg pain score improvement | > 1.5 points over 4 weeks |
| Monthly revenue | $3,000+ MRR |

---

## 11. Tech Stack (Locked)

| Layer | Choice |
|-------|--------|
| Mobile app | React Native + Expo (iOS-first) |
| Local dev / testing | Expo Go |
| Auth / DB / backend | Supabase (auth, database, edge functions) |
| Rate limiting | Upstash Redis |
| Paywall / experiments | Superwall |
| iOS subscriptions | Apple IAP / StoreKit |
| Analytics | PostHog |
| Email (transactional) | Resend |
| Push notifications | Expo Notifications |
| Video hosting (dev) | Supabase Storage (placeholder videos only) |
| Video hosting (prod) | Cloudflare Stream (HLS, adaptive bitrate, auto-transcode) |

### App Identifiers
- **Bundle ID:** `com.remedyappco.ios`
- **IAP Product IDs:** `com.remedyapp.weekly`, `com.remedyapp.monthly`, `com.remedyapp.annual` (plus `.no.trial` variants)

---

## 12. Architecture Principles (Non-Negotiable)

These govern every backend and client decision. When in doubt, default to these.

**Thin client, server-authoritative backend.** Entitlements, access gates, usage, quotas, and account state live on the server. The client never defines protected state.

**No direct client calls to sensitive third parties.** All sensitive flows go: App → Supabase Edge Function → third party. Keys stay off-device. Failures are centralized.

**Graceful degraded modes.** App must handle: normal / degraded / stale / quota-hit / upstream failure / auth failure / premium-gated / abuse-limited. Never brittle all-or-nothing.

**Atomic multi-step mutations.** Granting access, logging usage, billing events — one backend operation, never split client steps that can fail halfway.

**Event history, not just snapshots.** Entitlements, usage, refunds, quota resets: reconstructable timeline. Needed for support, abuse review, analytics.

**Rollback-friendly changes.** Small scoped commits, obvious revert paths, clean git tree before risky changes.

**Idempotency on mutations.** Idempotency keys + replay-safe responses + dedupe at storage layer for all billing-adjacent and protected mutations.

**RLS at the DB layer.** User data protected by Row Level Security policies. No trusting client-supplied user IDs for authorization. Sensitive tables have no unsafe direct client writes.

---

## 13. Open Questions

- [ ] PT partner identified and deal terms agreed?
- [ ] Content production timeline and budget?
- [ ] iOS-first launch confirmed? (Android later)
- [ ] App Store Connect account set up?
- [ ] Health law attorney review scheduled?
- [x] Paywall placement — end of onboarding, after program match screen ✓
- [x] What happens when a user completes the full program? ✓ Two choices on the program-complete screen: **Build my next program** (a 6-question check-in — pain vs start, difficulty, focus, area, days/week, equipment — plus an optional note; the answers rebuild the program and move its progression level) or **Level up my current plan** (same answers, one progression level up: the weekly intensity target shifts one tier and strength/activation reps rise ~10%, capped at 15). A "worse" pain report never raises the level. Completed sessions stay in history.
- [x] Video hosting — Cloudflare Stream for production, Supabase Storage for dev placeholders ✓
- [x] Bundle ID — confirmed as `com.remedyappco.ios`

---

## 14. Launch Checklist (Pre-Launch)

- [ ] PT partner signed
- [ ] All exercise videos filmed and edited
- [ ] Onboarding questionnaire built and tested
- [ ] Both programs fully loaded into app
- [ ] Session player working end-to-end
- [ ] Apple IAP / StoreKit configured and sandbox-tested
- [ ] Superwall paywall configured and tested
- [ ] Supabase RLS policies applied to all tables
- [ ] Upstash Redis rate limiting live on all public endpoints
- [ ] Legal disclaimer + ToS + Privacy Policy live
- [ ] App Store listing (screenshots, description, keywords)
- [ ] Expo Go testing complete; TestFlight beta with 10–20 real users
- [ ] Attorney review of disclaimers and marketing copy
- [ ] PostHog events wired: onboarding completion, paywall view, trial start, conversion, session complete, pain check-in
