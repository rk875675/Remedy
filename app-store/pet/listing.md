# App Store listing draft: pet era (HELD)

Status: draft only. Not uploaded to App Store Connect. Product first, armadillo as the hook. No medical claims, no result numbers, no ratings or user counts. Check the limits with `python app-store/pet/check_listing.py`.

Rules followed: educational exercise guidance, not medical care (matches `website/llms.txt` and the in-app disclaimer). The pet never promises anything about a back.

Prices checked Nov 14: `docs/APPLE.md`, `PRD.md` and `website/` all list $4.99/week (7-day trial), $12.99/month (14-day trial) and $79.99/year (7-day trial). The owner confirmed $12.99 and $79.99. Prices are not in app code (the paywall is Superwall; product ids are in `lib/analytics/purchaseErrors.ts`), so confirm the weekly price and trial lengths in App Store Connect before upload. The program length wording ("4 to 6 weeks") is from `website/llms.txt`.

## App name (30 max)
Remedy: Back Pain Relief

Keep the name unchanged: it is the indexed name and the live listing id is stable. The armadillo goes in the subtitle, icon and screenshots.

## Subtitle (30 max)
Back exercises + an armadillo

Alternates:
- Short sessions. One armadillo.
- Exercises with a tiny coach

## Promotional text (170 max)
Adopt an armadillo and name it. Finish a session and watch it uncurl. Short, video-guided back exercises, planned around you.

## Keywords (100 max, comma separated, no spaces)
back pain,lower back,stretching,exercise,mobility,core,posture,desk,rehab,strength,pet,armadillo

## Description (4000 max)
Remedy is a back exercise program with an armadillo in your corner.

You answer a few questions about your back, your week and your equipment. Remedy builds a structured program of short, video-guided sessions around your answers, with a quick pain check-in before and after each one.

Then there is the armadillo. You name it, and it starts out curled in a ball. Every session you finish, it uncurls a little more: peeking out, sitting up, standing, and finally fully grown. It never shrinks. If you miss a day, it just waits for you. It is warm, a bit cheeky, and always on your side.

What you get
- A structured program built from your answers, with short sessions that fit your week
- Clear video demonstrations for every exercise
- Pain check-ins before and after each session, so you can see how you feel over time
- Workout days you pick, and reminders in your armadillo's voice
- An armadillo that reacts to you: it cheers, naps, reads, stretches, and gets grumpy if you poke it too much
- Progress you can see: five growth stages, one for every milestone of sessions you finish

How it works
1. Tell us about your back and your goals.
2. Name your armadillo.
3. Do your sessions on the days you pick.
4. Watch your armadillo grow as you keep showing up.

Remedy offers educational exercise guidance and is not medical care. It does not diagnose, treat or cure any condition. Talk to a doctor or physical therapist before starting a new exercise program, and stop if something hurts.

Subscription
Remedy is free to download. A subscription unlocks the full program: $4.99 per week (7-day free trial), $12.99 per month (14-day free trial) or $79.99 per year (7-day free trial), US prices, where a trial is offered. Plans auto-renew until cancelled. A free trial converts to a paid subscription unless you cancel at least 24 hours before it ends. Payment is charged to your Apple ID. Manage or cancel any time in your Apple ID account settings.

Terms of Use: https://remedyrecoveries.com/terms
Privacy Policy: https://remedyrecoveries.com/privacy
Questions: social@remedyrecoveries.com

## What's new (4000 max)
Meet your armadillo.

Remedy now comes with a pet. Name it when you start, and watch it uncurl through five stages as you finish sessions. It never shrinks, and it never holds a missed day against you.

- A new armadillo helper on Home, in onboarding and in every session
- It coaches you through each exercise and cheers you on between sets
- It sleeps in a bed at night, naps in the afternoon, and gets grumpy if you poke it too much
- New app icon and a fresh look
- Fixes and polish

## Review notes for the screenshot set
- `app-store/pet/export/remedy-pet-*.png` (1284 x 2778). Frame 7 uses `crop_progress_2` whose demo data reads "Week 2 of 4" next to "fully grown"; recapture with a consistent demo account before upload.
- Screens show the demo user "John" and a pet named Arnie. A user-named pet is fine; confirm the demo name is the one you want in the store.
- Left out on purpose: the week-2 ramp screen (it shows a pain-drop number), the onboarding program screen ("bending ever is easy again" reads as an outcome promise), and any pain 9 or 10 screen.

## Preview video
Held draft: `app-store/pet/preview/remedy-pet-preview-draft.mp4` (886x1920, 30 fps, H.264, silent AAC, 25.4 s). Edit list: `app-store/pet/preview/EDIT_LIST.md`.
