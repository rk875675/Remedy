-- 056_repoint_exercise_videos_to_r2.sql
-- Repoint exercise clips from Supabase Storage to Cloudflare R2.
--
-- Rationale: clips are static, repeatedly-served assets. Supabase bills storage
-- egress above the Pro quota ($0.03/GB cached, $0.09/GB uncached); R2 bills $0 for
-- egress. Combined with the on-device cache in lib/videoCache.ts, video delivery
-- stops scaling with user count.
--
-- The URLs here point at the NORMALIZED encodes (scripts/normalize_videos.py):
-- the library went from 110.2 MB to 10.3 MB (-90.7%) by capping width at 1280px
-- (the player container is ~1179px at 3x) with no change to aspect ratio or crop.
--
-- Because lib/videoCache.ts keys its on-device cache on the full URL, this change
-- invalidates cached copies automatically; clients re-download once, then stop.

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/back_extension_45_v2.mp4'
WHERE name = 'Back Extension (45°)' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/banded_clamshell.mp4'
WHERE name = 'Banded Clamshell' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/banded_rdl.mp4'
WHERE name = 'Banded Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/banded_row_v2.mp4'
WHERE name = 'Banded Row' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/barbell_hip_thrust_v2.mp4'
WHERE name = 'Barbell Hip Thrust' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/bird_dog_v2.mp4'
WHERE name = 'Bird Dog' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/hip_hinge_v2.mp4'
WHERE name = 'Bodyweight Hip Hinge' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/bodyweight_squat_v2.mp4'
WHERE name = 'Bodyweight Squat' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/cat_cow.mp4'
WHERE name = 'Cat-Cow Stretch' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/childs_pose.mp4'
WHERE name = 'Child''s Pose Hold' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/clamshell.mp4'
WHERE name = 'Clamshell' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/dead_bug.mp4'
WHERE name = 'Dead Bug' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/dumbbell_rdl.mp4'
WHERE name = 'Dumbbell Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/glute_bridge.mp4'
WHERE name = 'Glute Bridge' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/goblet_squat.mp4'
WHERE name = 'Goblet Squat' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/kettlebell_deadlift.mp4'
WHERE name = 'Kettlebell Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/leg_press.mp4'
WHERE name = 'Leg Press' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/mckenzie_press_up.mp4'
WHERE name = 'McKenzie Press-Up' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/open_book_rotation.mp4'
WHERE name = 'Open-Book Rotation' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/seated_cable_row_v2.mp4'
WHERE name = 'Seated Cable Row' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/side_plank_full.mp4'
WHERE name = 'Side Plank (Full)' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/side_plank_knees.mp4'
WHERE name = 'Side Plank (Knees)' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/single_leg_glute_bridge.mp4'
WHERE name = 'Single-Leg Glute Bridge' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/single_leg_rdl.mp4'
WHERE name = 'Single-Leg Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/split_squat.mp4'
WHERE name = 'Split Squat' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/hip_flexor_stretch.mp4'
WHERE name = 'Standing Hip Flexor Stretch' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/suitcase_carry.mp4'
WHERE name = 'Suitcase Carry' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/figure_4_stretch.mp4'
WHERE name = 'Supine Figure-4 Stretch' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/hamstring_stretch.mp4'
WHERE name = 'Supine Hamstring Stretch' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/thoracic_extension_chair.mp4'
WHERE name = 'Thoracic Extension (Chair-Assisted)' AND is_assignable = true;
