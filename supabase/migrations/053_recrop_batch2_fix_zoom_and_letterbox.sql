-- Re-crop pass #2 (pt-video-crop-center skill, now fixed to default the crop's
-- aspect ratio to 20:13 — matching app/session/[id].tsx's real video container
-- (width=SCREEN_WIDTH, height=SCREEN_WIDTH*0.65) — and to auto-detect/exclude
-- baked-in black letterbox margins). Root cause of "way too zoomed in": crops
-- were previously left at whatever AR the subject's bbox produced (often tight
-- portrait), and contentFit="cover" inside the fixed-AR landscape container then
-- had to scale the video up and hard-crop most of its height to fill the box.
--
-- All 14 of the 15 videos in this pass were uploaded to the SAME storage key
-- they already used (Storage content overwritten in place), so no video_url
-- change needed for: Barbell Hip Thrust, Bodyweight Hip Hinge, Bodyweight
-- Squat, Cat-Cow Stretch, Child's Pose Hold, Dead Bug, Dumbbell Romanian
-- Deadlift, Goblet Squat, Kettlebell Deadlift, Side Plank (Full), Single-Leg
-- Romanian Deadlift, Split Squat, Standing Hip Flexor Stretch, Suitcase Carry.
--
-- Bird Dog is the one exception: its storage object (exercises/
-- bird_dog_from_misnamed_catcow.mp4, wired by migration 050 from a parallel
-- session) is orphaned (no storage.objects metadata row — `rm` reports success
-- but the object persists, same class of issue as migration 049), so the
-- re-cropped file was uploaded under a new key (bird_dog_v2.mp4) instead.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/bird_dog_v2.mp4'
WHERE name = 'Bird Dog' AND is_assignable = true;
