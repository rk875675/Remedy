# Launch-week bank: scripts, hooks, captions, bios (HELD)

Status: drafts only. Nothing here is posted or scheduled. Everything waits for the pet build to be live on the App Store. No stats, no testimonials, no medical claims. The pet never promises anything about a back. Lines quoted from the pet are real in-app lines (`constants/petMoodLines.ts`, `constants/petOnboardingLines.ts`).

The `scripter` skill (`.cursor/skills/scripter/SKILL.md`) is built around a real study. These three are product scripts with no study and no result claim, so the study rules do not apply. Doc tab, if used: next empty numbered tab in doc 16FqQ9YiidQwNAEpGFA7D_VtOBOxfpOyQ12TbgKH1WHk. Founder takes and edit follow the `edit` skill unchanged (his captions and header stay as burned in; the pet appears only as an outro card or on the screen recording).

## Script A: "I built a pet" (launch day)

Source: none. Product description only.
Hook movement: holds the phone up to camera with the pet on Home, then lowers it.
On screen: `my back app has a pet`
Teleprompter:
I built a back exercise app, and I gave it a pet.
It is an armadillo. You name it, and it starts curled up in a ball.
Every session you finish, it uncurls a little more.
It never shrinks. If you skip a day, it just waits.
That is the whole idea. Show up, and the armadillo grows.
Post title: my back app has a pet
Caption: Name yours when you open the app. Mine sulks if I poke it too much.
Visuals: `rec_home_ball.mp4`, `rec_grow_complete.mp4` (screen recordings), stage strip crop.

## Script B: "Why an armadillo" (day 3)

Source: none. Opinion and story, no claim.
Hook movement: looks at the pet on the phone, then back at camera, a small shrug.
On screen: `why an armadillo`
Teleprompter:
People ask why the pet is an armadillo.
When your back hurts, you tend to curl up and brace for everything.
So the pet starts that way, in a ball.
Then it opens up one stage at a time, as you do sessions.
It is a small reason to open the app on a day you do not feel like it.
Post title: why the app pet is an armadillo
Caption: Five stages, and a lot of opinions in the last one.
Note: keep it a story about the design. Do not say the pet or the app fixes anything.

## Script C: "It got mad at me" (day 5)

Source: none. Demo of an app behaviour.
Hook movement: pokes the phone screen, then flinches at the pet's reply.
On screen: `do not poke him`
Teleprompter:
I poked my app pet too many times.
First it warns me.
Then it gets mad.
Then it rolls away. I had to apologise.
I am not sure what that says about me.
Post title: i got told off by my app
Caption: Screen recording is real. Poke at your own risk.
Visuals: `rec_poke_to_angry.mp4`, `rec_poke_roll_away.mp4`.

## Hook and caption lines (for decks, memes, statics)

Hook angles from `marketing/pet-launch-plan.md`, in feed voice (lowercase, one concrete detail, no em dashes):

Memes (own art, formats in `growth-engine/assets/pet-formats/formats.json`):
- me: poking it one more time / my armadillo: I am NOT amused.
- me: it is just a tiny poke / my armadillo: Rude. Just rude.
- me at 3pm, asking for a rest day / my armadillo: Five more minutes.
- me: skipped a day / my armadillo: [sits there, waiting]
- the armadillo reads its book upside down and still looks calmer than me

Stage-reveal captions:
- he starts curled up and not sure about you yet
- one session, one eye out
- four sessions and he is sitting up
- nine sessions and he is standing
- fifteen sessions and he is fully grown
- name yours in the app

Relatable pairings (human moment on top, pet underneath; keeps the existing movement-moment style):
- my back plans every bend. the armadillo plans every nap.
- he sleeps in a bed. i sleep in a position i will regret.
- he stretches like it is easy.

Comment prompts (no claims): `what would you name him`, `what mood is yours today`. Names in the app suggest list: Biscuit, Pebble, Waffles, Dumpling.

Caption rules from `.cursor/rules/growth-engine.mdc`: one natural sentence, one concrete detail, a little dry humor, no lists of three, no "not X but Y", no em dashes, no slogans.

## Avatars and bios (files only)

Avatars: `marketing/pet/avatars/` (1080 x 1080, built by `marketing/pet/build_avatars.py`). Recommended: `avatar-happy-green.png` for all five handles. `avatar-ball-tan.png` is the teaser variant.

Handles: YouTube @remedyrecoveries, TikTok @remedy.recoveries, TikTok @remedy.stories, Instagram @remedyrecoveries, Instagram @remedy.stories.

Bios (Instagram limit 150, TikTok 80). All draft, all say what the app is and nothing about results:
- IG @remedyrecoveries (about 95): `Back exercise app with an armadillo. Name him, grow him. Educational, not medical care.`
- IG @remedy.stories (about 70): `Small back moments. And one armadillo.`
- TikTok @remedy.recoveries (under 80): `Back exercises + an armadillo. Name yours.`
- TikTok @remedy.stories (under 80): `Back moments, armadillo moods.`
- YouTube channel description: `Short back exercise sessions and the stories around them. The Remedy app comes with an armadillo that grows as you finish sessions. Educational exercise guidance, not medical care.`

Link: the live App Store page, `https://apps.apple.com/us/app/remedy-back-pain-relief/id6813745106` (from `website/llms.txt`). Confirm the link in bio before switching.

Switch order on launch day: App Store assets first, then avatars and bios, then the first post.
