-- 042_wire_back_extension_45_video.sql
-- Wire Back Extension (45°) to new Kling clip in Storage.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/back_extension_45.mp4'
WHERE name = 'Back Extension (45°)' AND is_assignable = true;
