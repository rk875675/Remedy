-- Only ask for (and require) a weekly ramp when the prior week was actually
-- finished through complete_session. get_home_state used to set pending_ramp_week
-- from the pointer alone, so a jumped current_week trapped the user on
-- /weekly-ramp; apply_weekly_ramp then raised week_not_completed (P0005) and
-- the choice could not save.

CREATE OR REPLACE FUNCTION public.week_is_fully_completed(
  p_user_id uuid,
  p_plan_id uuid,
  p_week_number int
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    (SELECT count(*) FROM public.user_plan_sessions s
      WHERE s.plan_id = p_plan_id AND s.week_number = p_week_number) > 0
    AND
    (SELECT count(DISTINCT c.plan_session_id)
       FROM public.session_completions c
       JOIN public.user_plan_sessions s ON s.id = c.plan_session_id
      WHERE c.user_id = p_user_id
        AND s.plan_id = p_plan_id
        AND s.week_number = p_week_number)
    >=
    (SELECT count(*) FROM public.user_plan_sessions s
      WHERE s.plan_id = p_plan_id AND s.week_number = p_week_number);
$$;

REVOKE ALL ON FUNCTION public.week_is_fully_completed(uuid, uuid, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.get_home_state(
  p_week_monday timestamptz,
  p_dev_day_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_dev boolean := false;
  v_display_name text := NULL;
  v_up public.user_programs%ROWTYPE;
  v_plan public.user_program_plans%ROWTYPE;
  v_display_week int;
  v_display_session int;
  v_pending_ramp_week int := NULL;
  v_display_row public.user_plan_sessions%ROWTYPE;
  v_pointer_row public.user_plan_sessions%ROWTYPE;
  v_display_json jsonb := NULL;
  v_pointer_json jsonb := NULL;
  v_display_ex_count int := 0;
  v_pointer_ex_count int := 0;
  v_equipment text := NULL;
  v_days_since int;
  v_week_completions jsonb;
  v_week_sessions jsonb;
  v_next_peek jsonb := NULL;
  v_prior_week int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.is_dev, p.display_name
    INTO v_is_dev, v_display_name
    FROM public.profiles p
   WHERE p.id = v_user_id;

  SELECT * INTO v_up
    FROM public.user_programs
   WHERE user_id = v_user_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_dev', COALESCE(v_is_dev, false),
      'display_name', v_display_name,
      'user_program', NULL,
      'plan', NULL,
      'pending_ramp_week', NULL,
      'display_week', NULL,
      'display_session', NULL,
      'display_plan_session', NULL,
      'display_exercise_count', 0,
      'pointer_plan_session', NULL,
      'pointer_exercise_count', 0,
      'week_completions', '[]'::jsonb,
      'week_sessions', '[]'::jsonb,
      'equipment', NULL,
      'next_week_peek', NULL
    );
  END IF;

  IF v_up.active_plan_id IS NULL THEN
    RETURN jsonb_build_object(
      'is_dev', COALESCE(v_is_dev, false),
      'display_name', v_display_name,
      'user_program', to_jsonb(v_up),
      'plan', NULL,
      'pending_ramp_week', NULL,
      'display_week', v_up.current_week,
      'display_session', v_up.current_session,
      'display_plan_session', NULL,
      'display_exercise_count', 0,
      'pointer_plan_session', NULL,
      'pointer_exercise_count', 0,
      'week_completions', '[]'::jsonb,
      'week_sessions', '[]'::jsonb,
      'equipment', NULL,
      'next_week_peek', NULL
    );
  END IF;

  SELECT * INTO v_plan
    FROM public.user_program_plans
   WHERE id = v_up.active_plan_id
     AND status = 'active';

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'is_dev', COALESCE(v_is_dev, false),
      'display_name', v_display_name,
      'user_program', NULL,
      'plan', NULL,
      'pending_ramp_week', NULL,
      'display_week', NULL,
      'display_session', NULL,
      'display_plan_session', NULL,
      'display_exercise_count', 0,
      'pointer_plan_session', NULL,
      'pointer_exercise_count', 0,
      'week_completions', '[]'::jsonb,
      'week_sessions', '[]'::jsonb,
      'equipment', NULL,
      'next_week_peek', NULL
    );
  END IF;

  v_prior_week := v_up.current_week - 1;
  IF v_up.current_week > COALESCE(v_plan.start_week, 1)
     AND v_up.current_week <= v_plan.duration_weeks
     AND public.week_is_fully_completed(v_user_id, v_plan.id, v_prior_week)
     AND NOT EXISTS (
      SELECT 1
        FROM public.user_weekly_ramp_decisions d
       WHERE d.plan_id = v_plan.id
         AND d.week_number = v_prior_week
    ) THEN
    v_pending_ramp_week := v_prior_week;
  END IF;

  v_display_week := v_up.current_week;
  v_display_session := v_up.current_session;

  IF COALESCE(v_is_dev, false)
     AND v_up.started_at IS NOT NULL
     AND COALESCE(p_dev_day_offset, 0) <> 0 THEN
    v_days_since := GREATEST(
      0,
      FLOOR(EXTRACT(EPOCH FROM (now() - v_up.started_at)) / 86400)::int
        + p_dev_day_offset
    );
    v_display_week := LEAST(
      (v_days_since / 7) + 1,
      v_plan.duration_weeks
    );
    IF (v_days_since % 7) < v_plan.sessions_per_week THEN
      v_display_session := (v_days_since % 7) + 1;
    ELSE
      v_display_session := v_plan.sessions_per_week + 1;
    END IF;
  END IF;

  SELECT * INTO v_display_row
    FROM public.user_plan_sessions
   WHERE plan_id = v_plan.id
     AND week_number = v_display_week
     AND session_number = v_display_session;

  IF FOUND THEN
    v_display_json := to_jsonb(v_display_row);
    SELECT count(*)::int INTO v_display_ex_count
      FROM public.user_plan_session_exercises
     WHERE plan_session_id = v_display_row.id;
  END IF;

  IF v_display_week <> v_up.current_week
     OR v_display_session <> v_up.current_session THEN
    SELECT * INTO v_pointer_row
      FROM public.user_plan_sessions
     WHERE plan_id = v_plan.id
       AND week_number = v_up.current_week
       AND session_number = v_up.current_session;
    IF FOUND THEN
      v_pointer_json := to_jsonb(v_pointer_row);
      SELECT count(*)::int INTO v_pointer_ex_count
        FROM public.user_plan_session_exercises
       WHERE plan_session_id = v_pointer_row.id;
    END IF;
  END IF;

  SELECT COALESCE(
           jsonb_agg(jsonb_build_object('completed_at', c.completed_at)),
           '[]'::jsonb
         )
    INTO v_week_completions
    FROM public.session_completions c
   WHERE c.user_id = v_user_id
     AND c.completed_at >= p_week_monday;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'session_number', s.session_number,
               'title', s.title,
               'phase', s.phase,
               'estimated_minutes', s.estimated_minutes
             )
             ORDER BY s.session_number
           ),
           '[]'::jsonb
         )
    INTO v_week_sessions
    FROM public.user_plan_sessions s
   WHERE s.plan_id = v_plan.id
     AND s.week_number = v_display_week;

  SELECT jsonb_build_object(
           'id', s.id,
           'week_number', s.week_number,
           'session_number', s.session_number
         )
    INTO v_next_peek
    FROM public.user_plan_sessions s
   WHERE s.plan_id = v_plan.id
     AND s.week_number > v_display_week
   ORDER BY s.week_number, s.session_number
   LIMIT 1;

  SELECT oa.equipment INTO v_equipment
    FROM public.onboarding_answers oa
   WHERE oa.user_id = v_user_id;

  RETURN jsonb_build_object(
    'is_dev', COALESCE(v_is_dev, false),
    'display_name', v_display_name,
    'user_program', to_jsonb(v_up),
    'plan', jsonb_build_object(
      'duration_weeks', v_plan.duration_weeks,
      'sessions_per_week', v_plan.sessions_per_week,
      'start_week', v_plan.start_week
    ),
    'pending_ramp_week', v_pending_ramp_week,
    'display_week', v_display_week,
    'display_session', v_display_session,
    'display_plan_session', v_display_json,
    'display_exercise_count', v_display_ex_count,
    'pointer_plan_session', v_pointer_json,
    'pointer_exercise_count', v_pointer_ex_count,
    'week_completions', v_week_completions,
    'week_sessions', v_week_sessions,
    'equipment', v_equipment,
    'next_week_peek', v_next_peek
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_state(timestamptz, int) TO authenticated;

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

  -- Same completion predicate as apply_weekly_ramp. A missing decision only
  -- blocks the next week when last week was actually finished.
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
    'program_done', v_program_done
  );
END;
$$;

REVOKE ALL ON FUNCTION public.complete_session(uuid, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_session(uuid, int, int) TO authenticated;
