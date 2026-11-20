-- Hold the pattern-gap exercises from 093 out of new plans until their videos
-- (and the breathing screen) exist. Rows and teaching copy stay in place.
UPDATE public.exercises
SET is_assignable = false
WHERE name IN (
  'Pelvic Tilt',
  'Knee-to-Chest',
  'Seated Sciatic Nerve Slider',
  'Side-Lying Hip Abduction',
  'Banded Lateral Walk',
  'Plank Shoulder Taps',
  'Pallof Press',
  'Wall Angel',
  'Band Pull-Apart',
  'Sit-to-Stand',
  'Step-Up',
  '90-90 Breathing'
);
