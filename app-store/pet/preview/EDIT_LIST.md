# Preview video draft: edit list (HELD, not uploaded)

File: `remedy-pet-preview-draft.mp4`. 886x1920 (6.5-inch portrait), 30 fps, H.264 High, silent stereo AAC track, 25.4 s. Rebuild with `python app-store/pet/preview/build_preview.py`. Sources are in `growth-engine/assets/screenshots/` (1206x2622, 60 fps), scaled and cropped 6 px.

Real in-app footage only. Starts on "Name your armadillo". No Home opening shot. No pain-check screens, no outcome-claim screens, no rating pop-up, no Control Center or recording start/stop UI.

| # | Source | From - to (s) | Length | Content |
|---|---|---|---|---|
| 1 | rec_onboarding_welcome_grow.mp4 | 1.2 - 5.0 | 3.8 | Name your armadillo (starts after the slide-in, 1.2 s) |
| 2 | rec_onboarding_welcome_grow.mp4 | 5.0 - 9.5 | 4.5 | "Every session, it uncurls a little" stage preview |
| 3 | rec_session_done_home.mp4 | 8.0 - 13.0 | 5.0 | Cat-Cow, armadillo coaching |
| 4 | rec_session_done_home.mp4 | 27.0 - 30.5 | 3.5 | Glute Bridge, "I am here. Keep going." |
| 5 | rec_session_done_home.mp4 | 47.0 - 50.0 | 3.0 | Bird Dog with coaching bubble |
| 6 | rec_poke_to_angry.mp4 | 3.0 - 6.5 | 3.5 | Poked, rolls into a ball |
| 7 | rec_session_done_home.mp4 | 68.5 - 69.6 + 1.0 hold | 2.1 | Home, "You're good for today", armadillo reading; last clean frame held 1.0 s |

Cut frames at 0.1 s from the end of `rec_session_done_home.mp4` (checked):
- 67.0 - 67.2 s: "Ready for next week" screen (not used).
- 67.4 - 68.3 s: an "Enjoying Remedy?" rating pop-up fades in and out over Home (not used; the earlier draft's last shot started at 68.0 and caught the end of it).
- 68.4 - 69.7 s: clean Home. Used 68.5 - 69.6.
- 69.8 s onward: Control Center from the swipe-up (not used).

Other boundaries checked, first and last frame of every shot and a frame on each side of every cut: no pop-up, keyboard glitch, slide transition, recording indicator pill or Control Center. Shot 1 starts at 1.2 s because the naming screen is still sliding in at 1.0 s. The status bar in the recordings is the real phone (time and Dynamic Island); check that the clock and carrier are acceptable.

Deliberately excluded from the recordings:
- Every pain-check screen (7, 8, 9, 10 in `rec_session_done_home`, `rec_session_to_pain9`, `rec_grow_complete`), and the end-of-session pain 1 to 3 screens.
- "Your back is stronger than it feels" and "50% less pain" screens in `rec_onboarding_welcome_grow` (t > 10 s).
- "Ready for next week" screen, Session Complete stats card (pain change numbers), the rating pop-up, the iOS Control Center frames at the end of `rec_grow_complete` and `rec_session_done_home`.
- The opening Home shot (owner removed it; not used anywhere else).

Notes: plain cuts, no transitions, overlays or music. App Store preview must be 15 to 30 s (25.4 s). The demo user is "John" and the pet "Arnie" (owner confirmed fine).
