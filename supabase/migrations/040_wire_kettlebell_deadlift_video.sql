-- 040_wire_kettlebell_deadlift_video.sql
-- Wire Kettlebell Deadlift to trimmed PT clip in Storage.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/kettlebell_deadlift.mp4'
WHERE name = 'Kettlebell Deadlift' AND is_assignable = true;
