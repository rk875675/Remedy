-- Remove Clamshell and Banded Clamshell from the assignable exercise pool.
-- Existing frozen user plans are unaffected; these exercises simply will not
-- be picked for any new plan assignments going forward.

BEGIN;

-- 1. Mark both exercises non-assignable
UPDATE public.exercises
SET    is_assignable = false
WHERE  id IN (
  'cccc0001-0000-0000-0000-000000000027',  -- Clamshell
  'cccc0001-0000-0000-0000-000000000010'   -- Banded Clamshell
);

-- 2. Remove both from the replacement ladder
DELETE FROM public.exercise_replacement_groups
WHERE  exercise_id IN (
  'cccc0001-0000-0000-0000-000000000027',
  'cccc0001-0000-0000-0000-000000000010'
);

-- 3. Re-number glute_activation priorities to close the gap.
--    New ladder: Glute Bridge (t2) → SL Glute Bridge (t3) → Barbell Hip Thrust (t4)
UPDATE public.exercise_replacement_groups
SET    priority = 10
WHERE  movement_pattern = 'glute_activation'
  AND  exercise_id = 'cccc0001-0000-0000-0000-000000000008'; -- Glute Bridge

UPDATE public.exercise_replacement_groups
SET    priority = 20
WHERE  movement_pattern = 'glute_activation'
  AND  exercise_id = 'cccc0001-0000-0000-0000-000000000026'; -- Single-Leg Glute Bridge

UPDATE public.exercise_replacement_groups
SET    priority = 30
WHERE  movement_pattern = 'glute_activation'
  AND  exercise_id = 'cccc0001-0000-0000-0000-000000000015'; -- Barbell Hip Thrust

COMMIT;
