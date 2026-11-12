-- Bird Dog is a reps exercise. Drop the 10s hold countdown from the catalog
-- and from plans already built, which store their own duration_seconds.
-- Side planks and every other timed hold stay as they are. Sets, reps, and
-- rest are unchanged.

UPDATE public.exercises
SET duration_seconds = NULL
WHERE id = 'cccc0001-0000-0000-0000-000000000006';

UPDATE public.user_plan_session_exercises
SET duration_seconds = NULL
WHERE exercise_id = 'cccc0001-0000-0000-0000-000000000006';
