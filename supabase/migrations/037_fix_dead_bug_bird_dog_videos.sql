-- 037_fix_dead_bug_bird_dog_videos.sql
-- bird_dog.mp4 was actually a Dead Bug (supine). That footage was copied over
-- dead_bug.mp4 in Storage; the old dead_bug file was cat-cow junk and bird_dog
-- was removed pending a real all-fours Bird Dog regen.

-- Dead Bug keeps pointing at dead_bug.mp4 (now correct footage).
UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/dead_bug.mp4'
WHERE name = 'Dead Bug' AND is_assignable = true;

-- Bird Dog has no video until a real quadruped clip is uploaded.
UPDATE public.exercises
SET video_url = NULL
WHERE name = 'Bird Dog' AND is_assignable = true;
