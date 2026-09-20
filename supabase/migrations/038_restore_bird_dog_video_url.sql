-- 038_restore_bird_dog_video_url.sql
-- Real Bird Dog clip uploaded after the dead-bug/bird-dog file swap fix.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/bird_dog.mp4'
WHERE name = 'Bird Dog' AND is_assignable = true;
