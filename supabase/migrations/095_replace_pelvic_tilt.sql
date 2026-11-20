-- Pelvic Tilt is too small to read on camera.
-- Same lumbar-flexion slot, now a double knee-to-chest stretch.
-- Stays unassignable until a video is approved.

UPDATE public.exercises SET
  name = 'Double Knee-to-Chest',
  description = 'Both knees drawn to the chest to flex the low back.',
  instructions = 'Lie on your back with both knees bent. Draw both knees toward your chest and hold, then lower the feet back down. Head and shoulders stay on the mat.',
  reps = NULL,
  duration_seconds = 20
WHERE id = 'cccc0001-0000-0000-0000-000000000021';

UPDATE public.exercise_details SET
  slug = 'double-knee-to-chest',
  dose_class = 'stretch_static',
  contra = ARRAY['flexion_endrange']::text[]
WHERE exercise_id = 'cccc0001-0000-0000-0000-000000000021';
