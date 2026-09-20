-- 047_fix_cat_cow_bird_dog_swap.sql
-- Cat-Cow Storage object was actually Bird Dog footage.
-- That file was copied to bird_dog.mp4; Cat-Cow URL cleared until new clip lands.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/bird_dog.mp4'
WHERE name = 'Bird Dog' AND is_assignable = true;

UPDATE public.exercises
SET video_url = NULL
WHERE name = 'Cat-Cow Stretch' AND is_assignable = true;
