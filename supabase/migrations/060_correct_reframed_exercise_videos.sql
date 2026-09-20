-- Correct the first reframe pass after device review:
-- center Hip Hinge, materially zoom out both loaded hinges, and remove the
-- hard left source-frame seam from Standing Hip Flexor Stretch.

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/hip_hinge_v5.mp4'
WHERE name = 'Bodyweight Hip Hinge' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/dumbbell_rdl_v6.mp4'
WHERE name = 'Dumbbell Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/kettlebell_deadlift_v6.mp4'
WHERE name = 'Kettlebell Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://videos.remedyrecoveries.com/exercises/hip_flexor_stretch_v6.mp4'
WHERE name = 'Standing Hip Flexor Stretch' AND is_assignable = true;
