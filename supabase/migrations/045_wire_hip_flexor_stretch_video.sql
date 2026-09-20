-- 045_wire_hip_flexor_stretch_video.sql
-- Wire Standing Hip Flexor Stretch to new Kling clip in Storage.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/hip_flexor_stretch.mp4'
WHERE name = 'Standing Hip Flexor Stretch' AND is_assignable = true;
