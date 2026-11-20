# Pet launch plan: moving Remedy marketing to the armadillo

Status (Nov 14, updated after the preview video feedback): the offline, held parts are built and the owner has made the CTA, naming and price decisions (see "Status update" below). Nothing is live, scheduled or uploaded. website/, the app and the locked CTA files are untouched.

## Status update (Nov 14)

Scheduled-post check (Nov 14 to Nov 18, 37 posts across 6 accounts): all OK. Every post's media is already uploaded and hosted on media.zernio.com (69 files, all respond and are non-trivial in size). I looked at every one: old look, old CTA slide, no pet or new-UI screenshot mixed in. The four locked screenshots and `growth-engine/assets/screenshots/icon.png` (used by the CTA) are unchanged. Risk that remains: the library crops (`crop_*.png`) were replaced in place under the same filenames, so any re-render of an old deck would pull the new UI. Do not run `_rerender-scheduled.ts`, `_split-convert.ts`, `_ig-main.ts --apply` or a deck rebuild on existing items before launch. Guard added: `PET_UI_LIVE` (default false) makes `listAssignableScreenshots()` return nothing, so auto-assignment and the LLM screenshot catalog cannot pick pet-era crops (or the new "Arnie" descriptions) before launch. Generation is already paused (`GENERATE_ENABLED=false`) and the autopilot only hands off posts that are already built.

Done (held, nothing live):
- App Store pack: 8 pet-era frames `app-store/pet/export/`, listing draft `app-store/pet/listing.md` (limits checked), build and check scripts.
- Engine groundwork behind `PET_CONTENT_ENABLED=false`: art registry, 3 format definitions, paused `mascot` tests, renderer `pet-formats.ts`, samples in `growth-engine/output/pet-held/previews/`.
- Scripts, caption and hook bank, bios, 4 avatar squares: `marketing/pet/`.
- Asset inventory and preview shot list: `marketing/pet-launch-assets.md`.

Held for launch: switching avatars and bios, uploading to App Store Connect, copying `tests.pet.held.json` into `tests.json`, any posting of pet content.

Decided by the owner (Nov 14):
- Locked CTA screenshots: YES, replace with pet-era screenshots, but later, as the held task in section 6 ("Held task A"). The CTA files are still locked and unchanged today.
- Demo user "John" and pet "Arnie" in screenshots and frames: fine.
- Device pass of the session pet: done. New iOS build with the new icon: done. App icon: decided and locked (no longer open).
- App Store screenshots: the owner is redoing them himself in another tab. `app-store/pet/export/` stays as a reference only.
- Prices are not a concern for this plan (owner). `app-store/pet/listing.md` carries the figures from `docs/APPLE.md` and `PRD.md`.
- Full-height Progress screenshot: the owner says one exists (should show "Week 2 of 4" at the top). See Held task A for where it needs to be.

Preview video: held draft built and liked by the owner, `app-store/pet/preview/remedy-pet-preview-draft.mp4` (886x1920, 30 fps, H.264, silent AAC, 25.4 s, real in-app footage only). Revised Nov 14: starts on "Name your armadillo" (the opening Home shot is removed), and the end no longer includes the swipe-up, Control Center or the rating pop-up (ends on a clean Home frame, held 1 s). Edit list: `app-store/pet/preview/EDIT_LIST.md`.

What's left:
- Needs an owner decision: confirm app name stays "Remedy: Back Pain Relief"; confirm the pet-plus-Remedy lockup; approve copying `tests.pet.held.json` into `tests.json` at launch.
- Needs the app live: switch avatars and bios, flip `PET_UI_LIVE` and `PET_CONTENT_ENABLED`, post pet content, run the playbook baseline, execute Held task A (CTA swap), Pinterest and Instagram pet variants.
- Needs owner action: redo the App Store screenshots (his, in another tab); upload everything to App Store Connect; give the explicit go for Held task A; put the full-height Progress screenshot in `growth-engine/assets/screenshots/` (see Held task A); approve the final preview video.

Gate: all live marketing content stays as it is until the pet build is live on the App Store (PRD.md section 6.9). Everything below marked "prep" is work done offline and held back. No invented stats, testimonials or medical claims anywhere. The pet never promises anything about anyone's back.

---

## 1. What exists today

Channels (from .cursor/rules/growth-engine.mdc):
- YouTube Shorts @remedyrecoveries: 3-8 slideshows a day. Main volume.
- TikTok @remedy.recoveries: 1 slideshow plus 2 memes a day. TikTok @remedy.stories: memes only.
- Instagram @remedyrecoveries: curated grid (static a day plus 1-2 carousels), `growth-engine/assets/ig/schedule.json`, posted via `src/publish/_ig-main.ts`. Instagram @remedy.stories: its own grid in `assets/ig/stories`.
- Facebook and YouTube @remedystories are paused. Pinterest has renders (`growth-engine/assets/pins`, `scripts/render-pins.ts`) but no live cadence documented.
- Publishing goes through Zernio (`src/publish/zernio.ts`) and R2. Autopilot task runs 6:40am daily (`scripts/autopilot.ps1`). Meme Week runs Sundays 8pm (`scripts/meme-week.ps1`).

Formats:
- Character decks (single, split, quad): 12 AI characters in `growth-engine/assets/characters/`, built per `.cursor/skills/character-deck-build/SKILL.md`. Ends in the locked CTA slide.
- Format memes: background plus transparent GIF plus caption plus sound, from `assets/memes/format-library.json` (`meme-make`, `meme-format-decompose` skills).
- IG statics and carousels (`src/generation/ig-static.ts`), 8 Meta statics (`assets/statics/`), IG stories.
- Founder talking heads (Mino Lee, Austin Georgas): `scripter` and `edit` skills, Google Doc 16FqQ9Yi...
- AI video ads with the Lindsey character: `ai-video-workflow` skill, Kling 4.0 on Higgsfield, output in `growth-engine/output/ai-ads/`.

What performs: there is little data. `growth-engine/output/ig-perf.json` has 37 Instagram posts with 229 total views and a max of 25. The playbook (`src/learning/playbook.ts`, `_playbook.ts`) picks arms by Thompson sampling and defines a hit as top quarter of the account in the last 45 days, so it needs a fresh run to say what works. I did not run it. Plan: run `npx tsx src/learning/_playbook.ts` (read-only report) before launch and treat anything it says as directional only. The memes skill records overlay and duo formats (thememesclub01 duos at 12M, 2.9M, 1.4M views) as reference-account results, not ours.

What references the old brand:
- App Store: `app-store/img/icon.png` (spine on green), all frames in `app-store/screenshot-map.md`, `app-store/export/remedy-01..08` and `remedy-header-3840x1646.png`, `app-store/frames.html`, `export_frames.py`, `render_header.py`.
- Locked CTA screenshots (old app UI): `progress.png`, `img_0525.png`, `img_0539.png`, `img_0540.png`. Also every `crop_*` file in `growth-engine/assets/screenshots/` (home, session, progress, pain_check, profile).
- Brand marks: `assets/brand/logo.png`, `website/assets/logo*.png`, `apple-touch-icon`, `favicon.png`, `og-1200.png`, `supabase/email-templates/layout.mjs`, wordmark in `ig-static.ts`.
- Copy: website `index.md`, `how.md`, `faq.md`, `llms.txt`, `llms-full.txt`; deck/CTA copy in `src/generation/hooks.ts` (`CTA_COPY_POOL`).
- Characters: the 12 people plus Lindsey are all human; none are tied to the old logo, so they stay usable.
- Skills: `scripter` and `ai-video-workflow` assume human-only stars and never mention a mascot.

---

## 2. Positioning

Story: Remedy is the back-pain program that comes with a roommate. You adopt a small armadillo, you name it, and it starts curled in a ball because it is wary of everything, like a back that has stopped trusting movement. Every session you finish, it uncurls a little: peeking out, sitting, standing, fully grown. It never shrinks and never gets punished, so a missed week costs you nothing. It is cheeky, sleeps in a bed at night, naps in the afternoon ("five more minutes"), reads a book upside down, stretches, sulks if you poke it too much, and is on your side. The real work is still the 5-week video-guided program. The pet is the reason to open the app.

Claims to avoid: that the pet or the app heals, fixes or treats a back, any "results" numbers, any before/after for the user's body. The pet reflects consistency, not the condition of the back (PRD 6.9).

Hook angles that fit formats already running (overlay memes, POV decks, quad/split decks, talking-head, statics):
1. "My armadillo is mad at me" (angry mood from poking). Meme overlay, slot: "Me: one more poke. Him:".
2. "Day 1 vs day 15": the stage-reveal carousel. Ball to fully grown, with lifetime-session thresholds 0/1/4/9/15 as slides.
3. "He sleeps in a bed. I sleep in a position I will regret." Relatable-body meme with the pet as the contrast.
4. "Five more minutes" (pet nap line) paired with the human version: staying on the couch with a stiff back.
5. "POV: your pet is more flexible than you." POV cover (matches the `pov-cover` test in `assets/playbook/tests.json`).
6. "It reads a book upside down and still has better posture." Light, shareable still.
7. "Name your armadillo": comment prompt using the Suggest-a-name list (Biscuit, Pebble, Waffles, Dumpling in `constants/petOnboardingLines.ts`). Engagement hook, no claim.
8. "I got a pet that only grows if I show up." Honest mechanic description, nothing about pain outcomes. Fits founder talking-head.

---

## 3. What changes, by surface, in priority order

Effort: S under half a day, M 1-3 days, L a week or more.

### A. App Store listing (highest priority, hard deadline)
1. Icon: swap `app-store/img/icon.png` for an armadillo-on-forest-green icon. Source from `assets/pet/` (the S4 or S5 idle or happy, outline on #3E6B4E). Needs a clean 1024 square with no transparency. Effort S. App icon is also in the app itself (separate task).
2. Screenshots (OWNER: redoing these himself; `app-store/pet/export/` is a reference only): reshoot on device from the pet build. New frame set in `app-store/frames.html` plus `export_frames.py` and the 8-frame export. Suggested order: pet meeting screen ("Name your armadillo"), Home pet scene, session, stage strip on Progress, pain check, workout days. Rewrite headlines in `screenshot-map.md`. Old headline "A stronger back starts here." can stay if the owner likes it. Effort M. Also fix known issues in the map: display name "Name" on home, pain at 10 on check-in.
3. Header/feature image: rebuild `app-store/render_header.py` output (`remedy-header-3840x1646.png`) around the pet. Effort S.
4. Subtitle, description, keywords, promo text: no listing copy exists in the repo (only a checklist in PRD.md line 362). Draft new copy in `app-store/listing.md` (new file, prep). Lead with the real product (video-guided back-pain program, 5 weeks), mention the pet as the companion. No medical claims, no result numbers. Effort S. Do not invent a rating or user count.
5. Preview video (held draft built: `app-store/pet/preview/remedy-pet-preview-draft.mp4`, see EDIT_LIST.md; original idea: screen recording of onboarding naming, one session, a stage-up moment. Use the pet-voiced lines verbatim. Effort M. Shot on device; no AI footage needed.)
6. Keep age rating, privacy and legal fields unchanged. Entity text stays Kumar Holdings LLC.

### B. Growth-engine formats

Keep working as-is (no pet required, no old-brand content except the CTA slide): character decks with locked CTA (see section 4), POV and relatable-moment decks, IG founder carousels, format memes that are about a back-pain moment. Hold the CTA slide untouched.

Need pet variants:
- IG statics/carousels (`src/generation/ig-static.ts`, `assets/ig/carousels.json`): swap the "small REMEDY mark" for the pet mark once the owner approves a pet wordmark (decision 6). Add one closing slide type that shows a pet sticker plus a store line, as an ordinary closing slide, not the locked CTA. Effort M.
- Pins (`scripts/render-pins.ts`, `assets/pins/`): add a pet corner sticker. Effort S.
- Stories grid (`assets/ig/stories`, `_ig-stories.ts`): pet stickers on top of existing photos. Effort S.

New pet-native formats worth testing (register each as an explore test in `assets/playbook/tests.json`, one hypothesis each, minPosts 4):
1. Pet meme: "my armadillo is mad at me" overlay, using `s*_angry.png` as the moving layer. Add as a format in `format-library.json` through `meme-make`. Own art, so no GIF licensing issues. Effort M.
2. Stage-reveal carousel: five slides, S1 ball to S5 grown, caption names the session count. Effort M.
3. Mood meme sheets: sad, sleepy, reading, stretching mapped to relatable back-pain captions. Effort S per sheet.
4. Pet voice-line slides: screenshot of a real pet speech bubble from the app as the hook slide. Effort S.
5. "Name him" comment-driven posts. Effort S.
Do not mix pet and human characters on the same slide until one test shows it works.

Engine changes needed (all deferred, owner approval required because they touch growth-engine/): a `pet` asset folder reference and a pet-aware slide layer in `shots.ts`/`composer.ts`, `format-library` entries, and playbook arm `mascot: yes/no` so the learning loop can compare. Effort L total, split across the items above.

### C. Talking-head scripts (`scripter`, `edit` skills)
- Keep the study-based founder format unchanged. Add the pet only as a 2-second outro card or a sticker on the app screen recording. No change to the edit skill's rule that captions and header stay burned in.
- Script sentence "I built a pet that grows when you finish a session" is a product description, allowed. No claims.
- Update `.cursor/skills/scripter/SKILL.md` with a "pet mention" checklist only after owner sign-off. Effort S.

### D. Video ads (Kling/Higgsfield, `ai-video-workflow`)
- Lindsey ads keep their format. Add a B-roll step: phone screen showing the pet scene, recorded from the device (not AI-generated UI). Effort M.
- Pet-only ads: 5-8 second animated stills from `assets/pet/` (stage reveal, sleepy-to-stretching). Keep the pet a flat 2D sticker, as in the app. Do not ask Kling to redraw the pet; model drift will break the stable face. Compose in a local editor. Effort M.
- Platform AI label stays on every Lindsey post. No results language.

### E. Pinterest and Instagram statics
- See B. Priority order: IG main grid first (curated), then Pins. Pet stickers on photos, never a pet in a photo of a real body part.

### F. Profile pictures and bios
- Switch avatars to the pet after launch: @remedyrecoveries, @remedy.recoveries, @remedy.stories, YouTube. One square from `assets/pet/` on forest green. Effort S.
- Bio line draft: "Back pain program with an armadillo. Name him, grow him." Link to the App Store. Effort S.
- Update `website/assets/logo*.png`, `favicon.png`, `og-1200.png` when the website switches (separate PRD task).

### G. Email
- `supabase/email-templates/layout.mjs` and `push.mjs`: add the pet to header and footer, voice lines in transactional copy. Resend templates stay plain. Effort S-M, ships with the app update, not before.

---

## 4. Owner decisions

1. Do old live posts that show old app screens get removed? Recommended: no. Leave them, they are history, and removing posts costs reach.
2. Pause or continue the daily posting at launch? Recommended: continue; only add pet content as extra explore slots (20% rule) for the first 30 days.
3. Which pet name for marketing? The user names their own pet. Recommended: no fixed name; call it "your armadillo" and let users name it.
4. Pet in AI ads: should Lindsey and the pet appear together? Recommended: not for now; run separate tests first.
5. Pet wordmark/logo: keep "Remedy" wordmark next to the pet, or pet only? Recommended: pet plus "Remedy" word, so the brand name is not lost.
6. Subtitle/description lead: product-first or pet-first? Recommended: product-first, pet as the second line.
7. Release gating: any pre-launch teaser (pet sticker posts) before approval? Recommended: no public pet content until the build is live, per PRD. Teaser art is prepared but held.
8. Review-gate for new engine features (mascot arm, pet layer in `composer.ts`): approve now so the work can be built offline? Recommended: yes, behind a flag, nothing scheduled until launch.
9. Old brand assets (spine logo, `assets/brand/logo.png`): archive or delete? Recommended: archive; leave the files, stop using them.

---

Decided: replace the four locked CTA screenshots later (Held task A below). Test names John and Arnie are fine. App icon is locked. Prices are not a concern here. The owner redoes the App Store screenshot previews.

---

## 5. Assets

Reuse from `assets/pet/`: 5 stages with ready, idle, happy, sad, angry, celebrating, concerned, proud, reading, sleepy, stiff, stretching art (`s1_*` to `s5_*`), plus `bed.png`. Reuse the pet voice lines in `constants/petOnboardingLines.ts` and `constants/petMoodLines.ts` verbatim for captions and speech bubbles. Palette: forest green #3E6B4E, terracotta #AE5636, tan #F6EDE0.

Must be newly made:
- Device screenshots from the pet build (6-8 frames, 6.9-inch and 6.5-inch sizes, clean demo account, mid-range pain value, real display name).
- New library `crop_*` screenshots for the engine, uploaded by the owner through the Images Crop tab (the rules forbid agent-made crops).
- App icon 1024.
- 15-30s preview video.
- Pet-on-green avatar square and a header image.
- Stage-reveal and mood sticker sheets (compose from existing PNGs, no new drawing).
- A cheeky "mad" meme overlay with transparent background (use `s2_angry` to `s5_angry`).
- Missing art to check: poked-too-much sequence and night/afternoon nap scenes are only partly in `assets/pet/`; confirm with the owner before promising these in content.

---

## 6. Sequencing

Pre-launch (before App Store approval, nothing public):
1. Run the read-only playbook report to know today's baseline. Record it in `marketing/pet-baseline.md` (new file).
2. Listing copy, avatars and preview video draft are done and held. Owner redoes the screenshot previews.
3. Prepare 10 pet memes and 3 stage-reveal carousels offline in a held folder; not queued in the scheduler.
4. Prepare engine changes behind a flag (done; approved with the flag). Do not run `schedule` or `_ig-main.ts --apply`.
5. Held task A (below): prepare the CTA swap; execute only on the owner's explicit go.

Held task A: replace the four locked CTA screenshots with pet-era ones (owner said yes on Nov 14; do NOT start until he says go in a message that names the files)

Why it is bigger than four files: `CTA_REVIEW_OPTIONS` in `growth-engine/apps/server/src/generation/hooks.ts` uses `progress.png` in 4 options (Phone mornings, Phone tomorrow, Phone bend, Diagonal mental), `img_0525.png` in Bleed 50%, `img_0539.png` in Bleed plan, `img_0540.png` in Bleed flares. All 7 options are touched. The CTA row also uses `growth-engine/assets/screenshots/icon.png` (the old spine icon), which should become the armadillo icon (`assets/icon.png`). The old files are untracked in git (`git ls-files` shows none), so there is no history to recover them from: back them up first.

What the four show today and the proposed replacement (all candidates are 1206x2622, same aspect as the old full screens, in `growth-engine/assets/screenshots/`):

| Locked file | Shows today (old app) | Proposed replacement | Why |
|---|---|---|---|
| `progress.png` (470x1024, low-res) | Progress: Week 4 of 5 ring, showing up, pain trend | The full-height Progress screenshot ("Week 2 of 4" at the top, stage strip below). Fallback until it is in the library: `home_arnie_standing.png` | Same phone aspect, much sharper than the old 470 px file, armadillo journey and stage strip, no pain numbers. Used by 4 options so it carries the most weight. I could not find the full-height file in `growth-engine/assets/screenshots/` (only the crops `crop_progress*.png`); the only full Progress image in the repo is `website/assets/screens/progress.webp` (470x966, Week 2 of 4), which is the old file's resolution. The owner needs to drop the full-resolution PNG into the library (suggested name `progress_full.png`) |
| `img_0525.png` | "50% less pain ... within about 6 weeks" bar chart | `home_reading.png` | That old screen is an outcome claim; the replacement says "You're good for today", fits the rest topics (rest, couch, lie down). Do not re-create the 50% screen |
| `img_0539.png` | "Building your plan" progress list | `onboard_building.png` (or `onboard_building_eyes.png`) | Same screen in the new app, armadillo "supervising"; same bleed crop |
| `img_0540.png` | "Lower Back Pain Relief Program" plan screen | `onboard_time_15_4.png` | Same role as the old screen: a plan card (Focus: Lower back, Length: 5 weeks) plus a simple choice, with the armadillo bubble. No outcome line anywhere on it. Not `onboard_program.png` ("So bending ever is easy again", not allowed) and no longer `onboard_commit.png`. Fallback with no outcome text: `onboard_equipment_gym.png` |

Layouts and code to re-check: phone (progress.png), bleed (the three bleed files; `BLEED_CROP` in `composer.ts` is keyed per filename, and `loadCtaBleed0525` is hard-coded to the old title-plus-chart layout), diagonal (progress.png). Re-check the three atmospheres (field, dusk, haze) against the new screens (pet screens are green-heavy at the top; contrast with the green field), headline text clear of the phone, and the store row with the new icon.

Exact steps when he gives the go:
1. Confirm the go message names the CTA files (project rule 11).
2. Back up the four old files and `icon.png` to `growth-engine/assets/screenshots/_locked-old/` (copy, do not move).
3. Copy the chosen new screenshots over the four filenames (keep the names so `CTA_SHOT_LOCKED`, `resolveCtaScreenshot`, rule 11 and every saved post spec keep working). Update their entries in `growth-engine/assets/screenshots/meta.json`.
4. Copy `assets/icon.png` over `growth-engine/assets/screenshots/icon.png`.
5. Edit `composer.ts`: new `BLEED_CROP` values per file, replace or remove the `loadCtaBleed0525` special case, and bump `CTA_CACHE` (currently `cta49`) so cached CTAs are rebuilt. Do not bump `SLIDE_REV` unless re-rendering scheduled posts.
6. Render all 7 options on 2 sample headlines into `growth-engine/output/pet-held/cta/` (a one-off preview script, or `cta-review` if he names it, since `cta-review` queues posts). Look at every one at full size.
7. Owner approves the 7. Fix and re-render until he does.
8. Set `PET_UI_LIVE=true` only after the app is live. Scheduled posts keep their already-rendered CTA; re-render those only if he asks (`_rerender-scheduled.ts --plan`, preview, canary one).
9. Update the CTA notes in `.cursor/rules/growth-engine.mdc` and `project.mdc` (file names stay the same, descriptions change) when he approves.

Launch week (build live):
- Day 0: App Store icon, screenshots, listing, preview video live. Avatars and bios switch. Email template and website update ship with the app.
- Day 1-3: announce with founder talking head (pet-as-outro) plus the first pet meme on TikTok @remedy.recoveries and the IG main grid.
- Day 4-7: stage-reveal carousel, "name your armadillo" prompt, 2 pet memes. All other slots unchanged.

First 30 days:
- 20% of slots are pet explore tests (existing playbook rule). Week 2: drop the weakest of the five formats. Week 3: promote the winner to exploit. Week 4: confirm the CTA swap from Held task A is in place and read its early results.
- Pet content in B-roll of the Lindsey ads from week 2 only if the first pet tests are not worse than baseline.

Measurement (existing tools only):
- Growth-engine: `_playbook.ts`, per-arm hit rate and median views, with a new arm `mascot`.
- PostHog: installs and onboarding events by source, specifically the pet-naming screen completion rate and session-1 completion rate, plus any referral/UTM property already attached to App Store links (check with `read-data-schema` before relying on it).
- Superwall: paywall views and trial starts by campaign/placement. Do not attribute causation to the pet with these small volumes.
- App Store Connect: product page views and conversion before and after the screenshot swap.
- Baselines are thin (see section 1), so read results as directional and require at least 4 posts per test (existing `minPosts`).

---

## 7. Risks

- Reach is tiny (max 25 views per IG post), so tests will be noisy. Do not conclude from one post.
- Locked CTA still shows old UI. Mismatch between the last slide and the new app on launch day. Mitigation: Held task A in section 6.
- Medical-claim drift: pet captions like "my back is fixed" or "he heals". Mitigation: run `copy-audit` and review every pet caption against the voice rules.
- Meme formats with third-party GIFs. Pet memes use own art only; any viral-format overlay keeps the existing meme-make licensing rules.
- AI redraw of the pet breaks the stable face. Use the PNGs, never regenerate.
- App Store rejection for icon or listing mismatch with screenshots. Keep listing and screenshots in step with what the build shows.
- Pet art gaps (nap, poke sequence) could force promised content to wait.
- Solo-founder load: three new formats plus listing work in the same week. Mitigation: ship listing first, formats second, cut the least promising format by week 3.
- Shipping engine changes touching `composer.ts`/`shots.ts` could break scheduled posts. Mitigation: flag, preview with `schedule-preview 7`, canary one post.
