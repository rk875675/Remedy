-- 029_user_programs_pointer_guard.sql
-- Remove direct client writes to the user_programs progression pointer.
--
-- Why: user_programs_update_own (migration 006, added for the dev Reset Progress
-- feature) granted unrestricted UPDATE on ALL columns to any authenticated user. A
-- user could run e.g.
--     update user_programs set current_week = 99 where user_id = auth.uid();
-- and skip the entire rehab program (Home gates completion UI solely on
-- current_week > duration_weeks) or jump to advanced weeks with no completions —
-- an injury-risk permission bypass on a back-pain rehab plan.
--
-- Forward progression is already server-authoritative via complete_session
-- (migration 021/027). The only remaining legitimate client writes are the two
-- reset-to-start flows (program-complete "Restart Program" and the dev Reset
-- Progress), which can never skip ahead. Move them behind a fixed-value RPC and
-- revoke the generic UPDATE path entirely.

-- ---------------------------------------------------------------------------
-- 1. Drop the unrestricted UPDATE policy + table grant
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_programs_update_own" ON public.user_programs;

REVOKE UPDATE ON public.user_programs FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC: reset the caller's pointer to the start of the program
-- ---------------------------------------------------------------------------
-- Values are hardcoded server-side (week 1, session 1) so the client can only
-- restart — never fast-forward. p_reset_started_at additionally resets the program
-- start date (used by the dev Reset Progress flow).
CREATE OR REPLACE FUNCTION public.restart_program(p_reset_started_at boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  UPDATE public.user_programs
    SET current_week = 1,
        current_session = 1,
        started_at = CASE WHEN p_reset_started_at THEN now() ELSE started_at END
    WHERE user_id = v_user_id;
END;
$$;

-- Only authenticated end users may call this; never anon/public.
REVOKE ALL ON FUNCTION public.restart_program(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restart_program(boolean) TO authenticated;
