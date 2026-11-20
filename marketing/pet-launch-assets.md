# Pet launch: assets inventory and preview video shot list

Held. Nothing here is live.

## Ready now (made or found)
- App Store frames, 8 at 1284 x 2778: `app-store/pet/export/remedy-pet-*.png`. Built by `python app-store/pet/build_pet_frames.py` from `app-store/pet/img/` (copies of the new screenshots). The live set in `app-store/export/` is untouched.
- Listing copy: `app-store/pet/listing.md`, limits checked with `python app-store/pet/check_listing.py`.
- Avatars: `marketing/pet/avatars/` (4 squares).
- Engine groundwork (held, flag off): `growth-engine/assets/pet/` (art copy plus `registry.json`), `growth-engine/assets/pet-formats/formats.json`, `growth-engine/assets/playbook/tests.pet.held.json` (paused tests, not read by the planner), `growth-engine/apps/server/src/generation/pet-formats.ts`, `_pet-preview.ts`.
- Previews to look at: `growth-engine/output/pet-held/previews/` (`pet-mad-meme/`, `pet-stage-reveal/` with `_contact.jpg`, `pet-mood-sheet/`).
- Screen recordings already in `growth-engine/assets/screenshots/`: `rec_splash_launch`, `rec_onboarding_welcome_grow`, `rec_home_ball`, `rec_poke_to_angry`, `rec_poke_roll_away`, `rec_session_done_home`, `rec_session_to_pain9`, `rec_grow_complete` (all .mp4).
- Scripts, captions, bios: `marketing/pet/launch-week-bank.md`.

## Still needed
- App Store screenshots: the owner is redoing these himself; `app-store/pet/export/` is a reference only.
- App icon: decided and locked by the owner (new iOS build with the icon is done).
- Preview video: DONE as a held draft, owner approved the direction. `app-store/pet/preview/remedy-pet-preview-draft.mp4` (886x1920, 30 fps, H.264, silent AAC, 25.4 s). Starts on "Name your armadillo", ends on Home "You're good for today" with no swipe-up, Control Center or rating pop-up. Shots and timestamps: `app-store/pet/preview/EDIT_LIST.md`. Not uploaded.
- Pinterest: pet sticker corner for pins (`growth-engine/scripts/render-pins.ts`), not built (touches the live pin renderer).
- Pet wordmark lockup (pet plus "Remedy"): owner decision first.
