-- 048_wire_cat_cow_stretch_video.sql
-- Wire Cat-Cow Stretch to new Kling clip in Storage.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/cat_cow.mp4'
WHERE name = 'Cat-Cow Stretch' AND is_assignable = true;
