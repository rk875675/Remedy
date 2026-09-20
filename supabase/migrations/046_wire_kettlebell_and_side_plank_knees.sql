-- 046_wire_kettlebell_and_side_plank_knees.sql
-- Wire Kettlebell Deadlift + Side Plank (Knees) to new clips in Storage.
-- Note: KB deadlift may still need trim/center later; wired for now.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/kettlebell_deadlift.mp4'
WHERE name = 'Kettlebell Deadlift' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/side_plank_knees.mp4'
WHERE name = 'Side Plank (Knees)' AND is_assignable = true;
