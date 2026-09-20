-- 052_wire_banded_row_v2.sql
-- Wire Banded Row to no-watermark remake (new path busts old clip cache).

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/banded_row_v2.mp4'
WHERE name = 'Banded Row' AND is_assignable = true;
