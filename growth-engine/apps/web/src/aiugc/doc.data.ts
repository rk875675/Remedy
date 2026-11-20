import type { DocBlock } from "./types";

export const DOC_TITLE: string = "AI UGC Format Database";
export const DOC_UPDATED: string = "Updated Nov 12, 2026. Every format is proven by real videos with 100k+ views (counts checked Nov 12, 2026). Built for Remedy, Lindsey, and the armadillo.";

export const DOC_BLOCKS: DocBlock[] = [
  {
    title: "How to use this",
    items: [
      "Pick a format from the index. Open its master link and watch it once.",
      "Every entry has the same parts: proof links with view counts, why it works, the original shot by shot, and the Remedy version (script, shots, armadillo beat, caption, effort).",
      "To make one, run the ai-video-workflow skill: Nano Banana still, Kling 4 motion, ElevenLabs voice if it talks, local edit.",
      "Frames, transcripts and the downloaded reference for every video are in growth-engine/output/ugc-research/videos/<slug>/.",
    ],
  },
  {
    title: "Ground rules for every format",
    items: [
      "Every post carries the platform AI label.",
      "Back-pain lines are personal narrative. No outcome promises, no \"fixed my back\", no pain numbers, no diagnosis, no self-treatment.",
      "The armadillo never gets hurt, sick, or dies, and never guilt-trips. Cheeky is fine: it waits, it is smug when you show up, it sleeps on rest days, it is stiff after missed days.",
      "No AI-generated exercise reps. Any move on screen is a clip of the real app exercise video.",
      "Real app features only: the 5-week program, the daily session, the pain check-in slider (the armadillo reacts as it moves), naming the armadillo, its 5 stages (0, 1, 4, 9 and 15 sessions), its moods, the progress screen. No chat, no shared pet, no outfits or coins.",
      "Copy the mechanic, the timing and the framing. Never the creator's face, voice or exact words.",
      "Angry or sulking only comes from poking him (\"Fine. I am leaving.\", he rolls off, he comes back). Sad or angry never follows a missed session.",
      "Never show a before and an after pain number together. The slider recordings show numbers, so cut to the armadillo's bubble instead.",
      "Nothing with the armadillo goes public until the pet build is live in the App Store. Make it and hold it.",
      "The armadillo on screen is the real pet art or a real screen recording. Never a real-life plush or toy version, in any format. A 3D animated armadillo comes later, not for now.",
    ],
  },
  {
    title: "Why the armadillo (the BitePal play)",
    intro: "BitePal is a calorie tracker, one of the most saturated categories on the App Store, and it reportedly prints $100k+ a month because a raccoon reacts to every meal you log. Its real accounts are @bitepal.app on TikTok and @bitepal_app on Instagram. Finch (self care), Duolingo (language), Focus Friend (focus timer), Pengu, Voidpet, Study Bunny and Tolan run the same play: a boring habit gets a character you want to show up for. Remedy is the back-training version. The mascot formats (M) and the AI character formats (A) are the ones only a mascot app can run, so they come first.",
    items: [],
  },
  {
    title: "Start here: the first 10 to make",
    items: [
      "1. M1 · Pet told me to, then the pet is proud. 29.2M on Finch, two Kling shots and one app screen.",
      "2. M3 · Growth-stage reveal. 30.3M on Duolingo, and the five stages already exist in the app.",
      "3. H3 · The app talks back. 16.1M on Pingo; ours is the armadillo reacting as she moves the pain slider.",
      "4. H1 · Paragraph on your face. 4.0M on Bloom, the cheapest format here, four scripts already written.",
      "5. A1 · Armadillo selfie vlog. 16.9M on a Yeti series; numbered parts bring people back.",
      "6. A3 · First day on the job. 2.8M on the puppy version and 148M on the cat-chef cousin, one character, one prop.",
      "7. M2 · Pet reacts. BitePal's own format, face hook then the armadillo reacting in the app.",
      "8. H2 · Why is this so hard, then the card. 31.9M on Airlearn.",
      "9. N6 · Stretch flow, app in the tag. 16.6M on Bend, the closest organic match to our niche.",
      "10. A2 · Doorbell cam. 245M ceiling, 8 seconds, one locked shot.",
    ],
  },
  {
    title: "Assets ready to use",
    items: [
      "Recording: rec_poke_to_angry.mp4 10s — poke Arnie: \"Okay, that is a lot of poking\" → \"Fine. I am leaving.\" → curls into a ball. → M4, M8, H3-style reaction, a new \"don't poke him\" meme.",
      "Recording: rec_poke_roll_away.mp4 20s — poke until he rolls off screen (\"…rolling. Bye\"). → M8 payoff, M4.",
      "Recording: rec_grow_complete.mp4 30s — home → session preview → pain slider → exercises flash by too fast to use → \"Session Complete!\" → \"Arnie grew!\". Use the complete screen only. Do not use the exercise stretch.",
      "Recording: rec_bird_dog.mov 17s — pain check, then Bird Dog playing at full speed, then a rest timer. Use 4.35s–11.0s (the exercise only). The M1 exercise beat.",
      "Recording: rec_session_done_home.mp4 70s, rec_session_to_pain9.mp4 90s — full session paths. → H4/H10 receipts, N3/N5.",
      "Recording: rec_onboarding_welcome_grow.mp4 15s — welcome + growth preview through the stages. → M3 (stage reveal), M6.",
      "Recording: rec_home_ball.mp4 1.7s, rec_splash_launch.mp4 1.1s — intro/outro stingers.",
      "Stills: M1 pet told me to: home_arnie_standing.png (asks), session-complete frames from rec_grow_complete.",
      "Stills: M2 pet reacts: pain_check_before_* (bubble reacts), crop_pain_check*.",
      "Stills: M3 growth reveal: s1_idle → s2_ready → s3_happy → s4_proud → s5_celebrating, or rec_onboarding_welcome_grow.",
      "Stills: M4/M8 feelings, poke: home_angry*.png, home_poke_lot.png, s*_angry, s*_sad.",
      "Stills: M5 silent pet screen: home_reading.png, home_reading_page.png, s*_reading, bed.png.",
      "Stills: M7 pet in text / H1: s*_sleepy, s*_stiff, s*_rest as end stickers.",
      "Stills: H2 so-hard card / H12 slideshow: exercise_*.png, session_preview_w2s3.png, workout_days_sheet.png.",
      "Stills: H3 app talks back: pain_check_before_2/5/9/10.png (bubble only; never show a before/after pair).",
      "Stills: H7 score reveal: progress.png, ramp_week2_hold.png (\"Ready for next week?\"), stage counts.",
      "Stills: H13/H14 and onboarding hooks: onboard_hard_bend.png, onboard_goal_relief.png, onboard_moving_stiff.png, onboard_program_top.png.",
      "Stills: N-formats: exercise_bird_dog/cat_cow/childs_pose/glute_bridge/squat.png (the move is always the app clip), coach/cheer stickers as end card.",
      "Rule: Pain slider recordings show numbers (10→5 before, 2→4 after). Use the bubble reacting while the slider moves; never place a before and after number together.",
      "Rule: If there is no good app demo recording, do not use a bad one. Ask for a new recording of that exercise.",
      "Rule: Angry/sad moods exist. Use angry only for the poking bit (cheeky, he leaves, then comes back). Never tie sad or angry to missed sessions.",
      "Rule: Launch plan (marketing/pet-launch-plan.md): no public pet content until the pet build is live; do not have Kling redraw the pet (keep the PNGs).",
      "Rule: Owner rule (Nov 13): Lindsey's room comes from a frame of a real creator's video shot in the same position (blur the person out), passed as a second image reference. Never let Nano Banana invent the room, and never use stock, listing or Reddit room photos.",
      "Rule: Owner rule (Nov 13): never a real-life plush or toy armadillo, in any format. A 3D animated armadillo comes later, not for now (test still parked in output/ai-ads/pet-3d-test/animated.png).",
    ],
  },
  {
    title: "Researched and rejected",
    items: [
      "Plush left in a puddle or a trash can (Duolingo, 66.9M, https://www.tiktok.com/@duolingo/video/7322213798037687598) and the fake mascot death (Duolingo, 26.1M, https://www.tiktok.com/@duolingo/video/7470561342009707822). The biggest mascot numbers, but the armadillo never gets hurt. M9 keeps the plush and drops the harm.",
      "AI character ASMR (fruit faces, 21.4M, https://www.tiktok.com/@asmrai_ai/video/7529618781782560005). The joke is a face eating a piece of itself. No armadillo version.",
      "DIY clinical procedures: self-traction (727k, https://www.tiktok.com/@markhuntsingerpt/video/7202749149589179694) and \"sciatica relief starts with decompression\" (1.7M, https://www.tiktok.com/@physicaltherapysession/video/7653622201882578192). The views come from a relief promise and a hands-on move.",
      "Chat with a character (Tipsy Chat, 131M, https://www.tiktok.com/@megumisbubble/video/7574139514407357718) and result-on-screen filters (Kapi Cam, 110M, https://www.tiktok.com/@kaocoffe/video/7532256412861353223). Remedy has no chat and no photo output.",
      "Co-parent a pet with someone (Pengu, Widgetable). Remedy has no shared pet.",
      "Brand reach that looks paid: Sweat (8.3M views, 14.9k likes, https://www.tiktok.com/@sweatapp/video/7575062184430963979) and Ladder, whose big posts need Hilary Duff.",
      "Looked for and not found above 100k: pain-scale before and after, couple skits, older-woman app testimonials (WalkFit, Reverse Health), AI street interviews.",
    ],
  },
  {
    title: "Accounts to watch",
    items: [
      "Mascot apps: @bitepal.app, @finchcare, @duolingo, @voidpet, @pengu_app, @hankgreen1 (Focus Friend), @catzy_app, plus BitePal creators @healthyjenna, @nourishwithlex, @smarttips25, @logandglow.",
      "AI characters: @yetivloglife, @bigfootvlogs, @nessiebereal, @rachelthecatlovers, @hellskittenofficial, @fluffie_the_pom, @officialdogpack (Instagram), @espanol.w.lola, @grannyspills.",
      "App UGC farms: @lifewithliaj and @doseofelizabethh (Bloom), @sharongambu (Cal AI), @learnwithshrimpik (Airlearn), @tooned.ai (Pingo AI), @renaee.xo_ (Cheaterbuster), @jahmaiprayerlock0 (Prayer Lock), @prezloves (Vent Now), @shane.swerve (Swerve), @saafiir_ (Umax), @strongermobile (Stronger), @screentimejesus (BePresent).",
      "Back-pain niche: @osteotiaofficial, @dr.dan_dpt, @theptinitiative, @theprehabguys, @bendwithsofia, @calliegualy, @karolinajelgin, @movementbydavid, @lowbackability, @moveu.",
    ],
  },
  {
    title: "Prompt rules kept from the old tab",
    items: [
      "ex:",
      "Static locked-off shot, UGC iPhone footage of a confident American man in his bedroom. He stays still, mouth moving naturally as he speaks, direct eye contact with camera, no camera movement. He has SUPER high energy as this is for a youtube video. The man says:",
      "\"so weak follicles wake back up and stay in the growth phase longer instead of shedding early.\"",
      "Pace: SUPER High energy, confident tone. Fast pacing. Smiling at the camera, he seems very friendly. One take, no jump cuts. Same avatar, same location, same camera framing. Do not recompose the shot",
    ],
  },
];
