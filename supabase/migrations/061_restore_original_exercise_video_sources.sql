-- Restore untouched source clips after rejecting synthetic background extension.
-- Standing Hip Flexor Stretch is displayed with contentFit="contain" so its
-- portrait source remains fully visible without generated or blurred side fill.

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/hip_hinge_v2.mp4'
WHERE name = 'Bodyweight Hip Hinge' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/dumbbell_rdl.mp4'
WHERE name = 'Dumbbell Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/kettlebell_deadlift.mp4'
WHERE name = 'Kettlebell Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/hip_flexor_stretch.mp4'
WHERE name = 'Standing Hip Flexor Stretch' AND is_assignable = true;
