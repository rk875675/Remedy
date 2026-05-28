-- 003_push_and_video.sql
-- Add push_token to profiles and cloudflare_stream_id to exercises

ALTER TABLE public.profiles ADD COLUMN push_token text;
ALTER TABLE public.exercises ADD COLUMN cloudflare_stream_id text;
