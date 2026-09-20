-- 036_wire_pt_video_urls.sql
-- TEMP audit wiring: point assignable exercises at Supabase Storage clips so the
-- in-app TEMP video review screen can play them. Safe to leave after remakes —
-- URLs can be overwritten when final Kling cuts land.

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/banded_rdl.mp4'
  WHERE name = 'Banded Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/banded_row.mp4'
  WHERE name = 'Banded Row' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/hip_hinge.mp4'
  WHERE name = 'Bodyweight Hip Hinge' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/dumbbell_rdl.mp4'
  WHERE name = 'Dumbbell Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/figure_4_stretch.mp4'
  WHERE name = 'Supine Figure-4 Stretch' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/goblet_squat.mp4'
  WHERE name = 'Goblet Squat' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/leg_press.mp4'
  WHERE name = 'Leg Press' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/split_squat.mp4'
  WHERE name = 'Split Squat' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/hamstring_stretch.mp4'
  WHERE name = 'Supine Hamstring Stretch' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/open_book_rotation.mp4'
  WHERE name = 'Open-Book Rotation' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/single_leg_rdl.mp4'
  WHERE name = 'Single-Leg Romanian Deadlift' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/seated_cable_row.mp4'
  WHERE name = 'Seated Cable Row' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/side_plank_knees.mp4'
  WHERE name = 'Side Plank (Knees)' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/single_leg_glute_bridge.mp4'
  WHERE name = 'Single-Leg Glute Bridge' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/bodyweight_squat.mp4'
  WHERE name = 'Bodyweight Squat' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/hip_flexor_stretch.mp4'
  WHERE name = 'Standing Hip Flexor Stretch' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/thoracic_extension_chair.mp4'
  WHERE name = 'Thoracic Extension (Chair-Assisted)' AND is_assignable = true;

-- Re-assert the original 6 demo clips (idempotent)
UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/bird_dog.mp4'
  WHERE name = 'Bird Dog' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/cat_cow.mp4'
  WHERE name = 'Cat-Cow Stretch' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/childs_pose.mp4'
  WHERE name = 'Child''s Pose Hold' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/dead_bug.mp4'
  WHERE name = 'Dead Bug' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/glute_bridge.mp4'
  WHERE name = 'Glute Bridge' AND is_assignable = true;

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/mckenzie_press_up.mp4'
  WHERE name = 'McKenzie Press-Up' AND is_assignable = true;
