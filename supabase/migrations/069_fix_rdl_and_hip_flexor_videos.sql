-- 069_fix_rdl_and_hip_flexor_videos.sql
-- Recrop four clips that displayed badly in the 20:13 session player.
--
-- Banded RDL: live v3 was a square Kling remake with painted-on grey/white
--   side bars and a 20:13 crop that cut her head. Replaced with the original
--   1920x1080 source cropped 1660x1080 (20:13) so the full ROM stays in frame.
-- Dumbbell RDL: source was a 16:9 clip padded to 20:13 with flat grey. Grey
--   pad stripped, then cropped to 20:13. Head is already cut in the source
--   footage — this is as open as that recording allows.
-- Single-Leg RDL: measured 20:13 crop (1544x1004) so the hinge + back leg
--   fill the player instead of sitting in unused studio.
-- Standing Hip Flexor Stretch: portrait 810x936 source fitted into 1280x832
--   with studio-wall-colored side pads (not player-black bars). contentFit
--   special-case removed in app/session and temp-video-review.
--
-- New immutable R2 keys avoid CDN/device cache on the old filenames.
-- Upload: scripts/output/{banded_rdl_v4,dumbbell_rdl_v7,single_leg_rdl_v4,hip_flexor_stretch_v7}.mp4
--      → r2://remedy-videos/exercises/

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/banded_rdl_v4.mp4'
WHERE name = 'Banded Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/dumbbell_rdl_v7.mp4'
WHERE name = 'Dumbbell Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/single_leg_rdl_v4.mp4'
WHERE name = 'Single-Leg Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/hip_flexor_stretch_v7.mp4'
WHERE name = 'Standing Hip Flexor Stretch' AND is_assignable = true;
