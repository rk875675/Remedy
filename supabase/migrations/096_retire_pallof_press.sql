-- Pallof Press is out of the program. It is too hard, and it needs a band anchor.
-- Anti-rotation stays covered by Plank Shoulder Taps.
-- The row stays so nothing that already points at it breaks. It must not be assigned.

UPDATE public.exercises
SET is_assignable = false
WHERE id = 'cccc0001-0000-0000-0000-000000000041';

DELETE FROM public.exercise_replacement_groups
WHERE exercise_id = 'cccc0001-0000-0000-0000-000000000041';
