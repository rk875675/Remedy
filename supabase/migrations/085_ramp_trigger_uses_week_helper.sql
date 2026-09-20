-- Keep the three ramp gates on one predicate. apply_weekly_ramp still had its
-- own session-count SQL, so it could drift from get_home_state / complete_session
-- and fail a save after Home had already sent the user to /weekly-ramp.
-- complete_session also returns ramp_ready so the session screen does not route
-- to a ramp that cannot save (ended_week from session_number overflow is not
-- the same as every plan session in that week having a completion).

CREATE OR REPLACE FUNCTION public.apply_weekly_ramp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  target_week int := NEW.week_number + 1;
  v_plan_owner uuid;
BEGIN
  SELECT user_id INTO v_plan_owner
    FROM public.user_program_plans
    WHERE id = NEW.plan_id;
  IF v_plan_owner IS NULL OR v_plan_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'plan_not_owned' USING ERRCODE = 'P0004';
  END IF;

  IF NOT public.week_is_fully_completed(NEW.user_id, NEW.plan_id, NEW.week_number) THEN
    RAISE EXCEPTION 'week_not_completed' USING ERRCODE = 'P0005';
  END IF;

  IF NEW.decision = 'progress' THEN
    UPDATE public.user_plan_session_exercises e
    SET
      reps = CASE WHEN e.reps IS NOT NULL THEN CEIL(e.reps * 1.1)::int ELSE e.reps END,
      duration_seconds = CASE
        WHEN e.duration_seconds IS NOT NULL THEN CEIL(e.duration_seconds * 1.1)::int
        ELSE e.duration_seconds
      END,
      rest_seconds = GREATEST(10, e.rest_seconds - 5),
      load_tier = LEAST(5, e.load_tier + 1)
    FROM public.user_plan_sessions s
    WHERE e.plan_session_id = s.id
      AND s.plan_id = NEW.plan_id
      AND s.week_number = target_week;

    UPDATE public.user_plan_sessions s
    SET intensity_tier = LEAST(5, s.intensity_tier + 1)
    WHERE s.plan_id = NEW.plan_id
      AND s.week_number = target_week;
  END IF;

  RETURN NEW;
END;
$$;

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
  v_sessions_per_week int;
  v_duration_weeks int;
  v_start_week int;
  v_next_session int;
  v_next_week int;
  v_completed_week int := NULL;
  v_ended_week boolean := false;
  v_program_done boolean := false;
  v_ramp_ready boolean := false;
  v_completion_id uuid;
  v_before_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO v_up FROM public.user_programs WHERE user_id = v_user_id;
  IF NOT FOUND OR v_up.active_plan_id IS NULL THEN
    RAISE EXCEPTION 'no_active_program' USING ERRCODE = 'P0001';
  END IF;

  SELECT sessions_per_week, duration_weeks, COALESCE(start_week, 1)
    INTO v_sessions_per_week, v_duration_weeks, v_start_week
    FROM public.user_program_plans
    WHERE id = v_up.active_plan_id
      AND user_id = v_user_id
      AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_active_program' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_session FROM public.user_plan_sessions WHERE id = p_plan_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_session.plan_id <> v_up.active_plan_id
     OR v_session.week_number <> v_up.current_week
     OR v_session.session_number <> v_up.current_session THEN
    RAISE EXCEPTION 'session_not_current' USING ERRCODE = 'P0003';
  END IF;

  IF v_session.week_number > v_start_week
     AND public.week_is_fully_completed(v_user_id, v_up.active_plan_id, v_session.week_number - 1)
     AND NOT EXISTS (
       SELECT 1
       FROM public.user_weekly_ramp_decisions d
       WHERE d.plan_id = v_up.active_plan_id
         AND d.user_id = v_user_id
         AND d.week_number = v_session.week_number - 1
     ) THEN
    RAISE EXCEPTION 'weekly_ramp_required' USING ERRCODE = 'P0006';
  END IF;

  INSERT INTO public.session_completions (user_id, plan_session_id, duration_seconds)
  VALUES (v_user_id, p_plan_session_id, p_duration_seconds)
  RETURNING id INTO v_completion_id;

  SELECT id INTO v_before_id
    FROM public.pain_checkins
    WHERE user_id = v_user_id
      AND type = 'before'
      AND session_completion_id IS NULL
      AND recorded_at >= now() - interval '6 hours'
    ORDER BY recorded_at DESC
    LIMIT 1;

  IF v_before_id IS NOT NULL THEN
    UPDATE public.pain_checkins
      SET session_completion_id = v_completion_id
      WHERE id = v_before_id;
  END IF;

  IF p_pain_after IS NOT NULL THEN
    INSERT INTO public.pain_checkins (user_id, session_completion_id, score, type)
    VALUES (v_user_id, v_completion_id, p_pain_after, 'after');
  END IF;

  v_next_session := v_up.current_session + 1;
  v_next_week := v_up.current_week;
  IF v_next_session > v_sessions_per_week THEN
    v_next_session := 1;
    v_next_week := v_up.current_week + 1;
    v_completed_week := v_up.current_week;
    v_ended_week := true;
    v_ramp_ready := public.week_is_fully_completed(
      v_user_id,
      v_up.active_plan_id,
      v_completed_week
    );
  END IF;

  IF v_next_week > v_duration_weeks THEN
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
    'program_done', v_program_done,
    'ramp_ready', v_ramp_ready
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_session(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_session(uuid, int, int) TO authenticated;
