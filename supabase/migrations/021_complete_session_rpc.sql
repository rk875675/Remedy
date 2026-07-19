-- 021_complete_session_rpc.sql
-- Server-side, pointer-guarded session completion.
--
-- Why: the client previously inserted a session_completion for ANY plan_session_id it
-- could read and then blindly advanced user_programs.current_week/current_session from
-- the pointer — with no check that the completed session was actually the user's current
-- prescribed session. A user could deep-link / replay / open a future session and corrupt
-- progression (skip sessions, advance weeks early, inflate counts) or double-complete.
--
-- This RPC makes completion authoritative on the server: it only accepts the session that
-- matches user_programs.current_week/current_session for the active plan, writes the
-- completion + after-checkin, and advances the pointer atomically. A finished session is
-- no longer "current", so a second submit is rejected — closing the double-complete hole.

CREATE OR REPLACE FUNCTION public.complete_session(
  p_plan_session_id uuid,
  p_duration_seconds int,
  p_pain_after int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_up public.user_programs%ROWTYPE;
  v_session public.user_plan_sessions%ROWTYPE;
  v_sessions_per_week int := 4;
  v_duration_weeks int := 5;
  v_next_session int;
  v_next_week int;
  v_completed_week int := NULL;
  v_ended_week boolean := false;
  v_program_done boolean := false;
  v_completion_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_up FROM public.user_programs WHERE user_id = v_user_id;
  IF NOT FOUND OR v_up.active_plan_id IS NULL THEN
    RAISE EXCEPTION 'no_active_program' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_session FROM public.user_plan_sessions WHERE id = p_plan_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Pointer guard: the session being completed MUST be the user's current week/session
  -- in their active plan. Rejects deep-linked, replayed, future, or out-of-order
  -- completions — and second submits, since the pointer has already advanced past a
  -- finished session.
  IF v_session.plan_id <> v_up.active_plan_id
     OR v_session.week_number <> v_up.current_week
     OR v_session.session_number <> v_up.current_session THEN
    RAISE EXCEPTION 'session_not_current' USING ERRCODE = 'P0003';
  END IF;

  SELECT sessions_per_week, duration_weeks
    INTO v_sessions_per_week, v_duration_weeks
    FROM public.user_program_plans WHERE id = v_up.active_plan_id;

  INSERT INTO public.session_completions (user_id, plan_session_id, duration_seconds)
  VALUES (v_user_id, p_plan_session_id, p_duration_seconds)
  RETURNING id INTO v_completion_id;

  IF p_pain_after IS NOT NULL THEN
    INSERT INTO public.pain_checkins (user_id, session_completion_id, score, type)
    VALUES (v_user_id, v_completion_id, p_pain_after, 'after');
  END IF;

  v_next_session := v_up.current_session + 1;
  v_next_week := v_up.current_week;
  IF v_next_session > v_sessions_per_week THEN
    -- Finished the last session of the week → eligible for the weekly ramp.
    v_next_session := 1;
    v_next_week := v_up.current_week + 1;
    v_completed_week := v_up.current_week;
    v_ended_week := true;
  END IF;

  IF v_next_week > v_duration_weeks THEN
    -- Program finished — write completion sentinel; no valid session to advance to.
    v_program_done := true;
    UPDATE public.user_programs
      SET current_week = v_duration_weeks + 1, current_session = 1
      WHERE user_id = v_user_id;
  ELSE
    UPDATE public.user_programs
      SET current_session = v_next_session, current_week = v_next_week
      WHERE user_id = v_user_id;
  END IF;

  RETURN jsonb_build_object(
    'completion_id', v_completion_id,
    'ended_week', v_ended_week,
    'completed_week', v_completed_week,
    'program_done', v_program_done
  );
END;
$$;

-- Only authenticated end users may call this; never anon/public.
REVOKE ALL ON FUNCTION public.complete_session(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_session(uuid, int, int) TO authenticated;
