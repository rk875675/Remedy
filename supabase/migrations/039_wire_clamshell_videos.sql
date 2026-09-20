-- 039_wire_clamshell_videos.sql
-- Wire bodyweight + banded clamshell clips uploaded to Storage.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/clamshell.mp4'
WHERE name = 'Clamshell' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/banded_clamshell.mp4'
WHERE name = 'Banded Clamshell' AND is_assignable = true;
