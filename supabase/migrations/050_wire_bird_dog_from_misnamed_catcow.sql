-- 050_wire_bird_dog_from_misnamed_catcow.sql
-- Bird Dog should use the former Cat-Cow Storage clip (misnamed bird-dog footage).
-- New path busts clients still caching the Jul 27 remake at bird_dog.mp4.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/bird_dog_from_misnamed_catcow.mp4'
WHERE name = 'Bird Dog' AND is_assignable = true;
