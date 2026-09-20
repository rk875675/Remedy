-- Reframe six exercise videos requested during device review.
-- New immutable R2 keys avoid stale edge/device caches from prior versions.

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/hip_hinge_v3.mp4'
WHERE name = 'Bodyweight Hip Hinge' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/dumbbell_rdl_v3.mp4'
WHERE name = 'Dumbbell Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/kettlebell_deadlift_v3.mp4'
WHERE name = 'Kettlebell Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/single_leg_rdl_v3.mp4'
WHERE name = 'Single-Leg Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/hip_flexor_stretch_v3.mp4'
WHERE name = 'Standing Hip Flexor Stretch' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/thoracic_extension_chair_v3.mp4'
WHERE name = 'Thoracic Extension (Chair-Assisted)' AND is_assignable = true;
