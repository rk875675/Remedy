-- 041_unwire_kettlebell_deadlift_video.sql
-- Undo premature wiring — clip was a Kling reference, not a finished PT video.

UPDATE public.exercises
SET video_url = NULL
WHERE name = 'Kettlebell Deadlift' AND is_assignable = true;
