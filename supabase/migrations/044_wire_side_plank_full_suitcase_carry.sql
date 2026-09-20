-- 044_wire_side_plank_full_suitcase_carry.sql
-- Wire Side Plank (Full) and Suitcase Carry to new Kling clips in Storage.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/side_plank_full.mp4'
WHERE name = 'Side Plank (Full)' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/suitcase_carry.mp4'
WHERE name = 'Suitcase Carry' AND is_assignable = true;
