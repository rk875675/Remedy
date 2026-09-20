-- 049_recrop_batch1_videos.sql
-- Re-crop pass (computed crop via pt-video-crop-center skill): Back Extension (45°),
-- Barbell Hip Thrust, Bodyweight Hip Hinge, Bodyweight Squat.
-- Uploaded as new _v2 filenames because the original storage objects
-- (back_extension_45.mp4, barbell_hip_thrust.mp4, hip_hinge.mp4, bodyweight_squat.mp4)
-- are orphaned in Storage (no metadata row in storage.objects — likely from an earlier
-- dashboard upload/delete inconsistency), so they can't be deleted or overwritten via
-- the CLI/API. Old objects left in place; DB now points at the new ones.

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/back_extension_45_v2.mp4'
WHERE name = 'Back Extension (45°)' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/barbell_hip_thrust_v2.mp4'
WHERE name = 'Barbell Hip Thrust' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/hip_hinge_v2.mp4'
WHERE name = 'Bodyweight Hip Hinge' AND is_assignable = true;

UPDATE public.exercises
SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/bodyweight_squat_v2.mp4'
WHERE name = 'Bodyweight Squat' AND is_assignable = true;
