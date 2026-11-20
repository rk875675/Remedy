-- Turn the pattern-gap exercises on now that their clips are published.
-- Pallof Press stays out. 90-90 Breathing stays off until the breathing screen exists.

UPDATE public.exercises SET
  is_assignable = true,
  video_url = 'https://videos.remedyrecoveries.com/exercises/double_knee_to_chest_v1.mp4'
WHERE id = 'cccc0001-0000-0000-0000-000000000021';

UPDATE public.exercises SET
  is_assignable = true,
  video_url = 'https://videos.remedyrecoveries.com/exercises/knee_to_chest_v1.mp4'
WHERE id = 'cccc0001-0000-0000-0000-000000000005';

UPDATE public.exercises SET
  is_assignable = true,
  video_url = 'https://videos.remedyrecoveries.com/exercises/nerve_slider_v1.mp4'
WHERE id = 'cccc0001-0000-0000-0000-000000000037';

UPDATE public.exercises SET
  is_assignable = true,
  video_url = 'https://videos.remedyrecoveries.com/exercises/side_lying_hip_abduction_v2.mp4'
WHERE id = 'cccc0001-0000-0000-0000-000000000038';

UPDATE public.exercises SET
  is_assignable = true,
  video_url = 'https://videos.remedyrecoveries.com/exercises/banded_lateral_walk_v1.mp4'
WHERE id = 'cccc0001-0000-0000-0000-000000000039';

UPDATE public.exercises SET
  is_assignable = true,
  video_url = 'https://videos.remedyrecoveries.com/exercises/plank_shoulder_taps_v1.mp4'
WHERE id = 'cccc0001-0000-0000-0000-000000000040';

UPDATE public.exercises SET
  is_assignable = true,
  video_url = 'https://videos.remedyrecoveries.com/exercises/wall_angel_v1.mp4'
WHERE id = 'cccc0001-0000-0000-0000-000000000042';

UPDATE public.exercises SET
  is_assignable = true,
  video_url = 'https://videos.remedyrecoveries.com/exercises/band_pull_apart_v1.mp4'
WHERE id = 'cccc0001-0000-0000-0000-000000000043';

UPDATE public.exercises SET
  is_assignable = true,
  video_url = 'https://videos.remedyrecoveries.com/exercises/sit_to_stand_v1.mp4'
WHERE id = 'cccc0001-0000-0000-0000-000000000044';

UPDATE public.exercises SET
  is_assignable = true,
  video_url = 'https://videos.remedyrecoveries.com/exercises/step_up_v1.mp4'
WHERE id = 'cccc0001-0000-0000-0000-000000000045';
