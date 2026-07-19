-- 025_dev_video_urls.sql
-- Point dev exercise video_url to Supabase Storage placeholders for local testing.
-- These will be replaced by Cloudflare Stream URLs before production.

UPDATE public.exercises
  SET video_url = 'https://vgqmvekjttywwadpftre.supabase.co/storage/v1/object/public/videos/exercises/mckenzie_press_up.mp4'
  WHERE id = 'cccc0001-0000-0000-0000-000000000022';
