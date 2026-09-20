-- 051_wire_seated_cable_row_v2.sql
-- Wire Seated Cable Row to newest remake (new path busts old clip cache).

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/seated_cable_row_v2.mp4'
WHERE name = 'Seated Cable Row' AND is_assignable = true;
