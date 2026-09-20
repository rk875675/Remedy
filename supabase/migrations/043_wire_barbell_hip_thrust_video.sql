-- 043_wire_barbell_hip_thrust_video.sql
-- Wire Barbell Hip Thrust to new Kling clip in Storage.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/barbell_hip_thrust.mp4'
WHERE name = 'Barbell Hip Thrust' AND is_assignable = true;
