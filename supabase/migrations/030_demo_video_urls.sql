-- 026_demo_video_urls.sql
-- Wire the 5 AI-generated exercise videos (Supabase Storage) to their exercise rows.
-- Also swaps Thoracic Extension (no video) for Cat-Cow (has video) in blum's
-- current demo session so every slot has a playable clip.

-- ── 1. Set video_url on the 5 exercises we have footage for ──────────────────

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/glute_bridge.mp4'
  WHERE id = 'cccc0001-0000-0000-0000-000000000008';

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/dead_bug.mp4'
  WHERE id = 'cccc0001-0000-0000-0000-000000000007';

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/bird_dog.mp4'
  WHERE id = 'cccc0001-0000-0000-0000-000000000006';

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/cat_cow.mp4'
  WHERE id = 'cccc0001-0000-0000-0000-000000000001';

UPDATE public.exercises SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/childs_pose.mp4'
  WHERE id = 'cccc0001-0000-0000-0000-000000000018';

-- ── 2. Swap Thoracic Extension (no video, order 1) → Cat-Cow in blum's session ─

UPDATE public.user_plan_session_exercises
  SET
    exercise_id       = 'cccc0001-0000-0000-0000-000000000001',
    sets              = 2,
    reps              = NULL,
    duration_seconds  = 45,
    rest_seconds      = 15
  WHERE plan_session_id = 'e541c304-abbe-4849-8f2f-dddd194fa74b'
    AND order_index = 1;
