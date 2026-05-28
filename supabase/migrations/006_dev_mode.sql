-- 006_dev_mode.sql
-- Add is_dev flag to profiles, and RLS policies needed by the dev Reset Progress feature.

-- ---------------------------------------------------------------------------
-- 1. is_dev column
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_dev boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. RLS: allow users to DELETE their own session_completions (Reset Progress)
-- ---------------------------------------------------------------------------
CREATE POLICY "session_completions_delete_own" ON public.session_completions
  FOR DELETE USING (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 3. RLS: allow users to UPDATE their own user_programs row (Reset Progress)
-- ---------------------------------------------------------------------------
CREATE POLICY "user_programs_update_own" ON public.user_programs
  FOR UPDATE USING (auth.uid() = user_id);

-- Grant DELETE on session_completions to authenticated role
GRANT DELETE ON public.session_completions TO authenticated;

-- Grant INSERT on user_programs so the trigger / edge function path still works
-- (UPDATE already granted in 004)
GRANT UPDATE ON public.user_programs TO authenticated;
