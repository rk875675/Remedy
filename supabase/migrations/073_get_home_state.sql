-- 073_get_home_state.sql
-- One round-trip for the Home tab. Replaces the 6–10 sequential PostgREST
-- reads. Workout-day / rest-day decisions stay on the client (AsyncStorage).
-- Display-week math (including the dev day-offset) runs here so the client
-- does not need a second hop after it learns duration_weeks.

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

  IF v_up.current_week > COALESCE(v_plan.start_week, 1)
     AND v_up.current_week <= v_plan.duration_weeks THEN
    IF NOT EXISTS (
      SELECT 1
        FROM public.user_weekly_ramp_decisions d
       WHERE d.plan_id = v_plan.id
         AND d.week_number = v_up.current_week - 1
    ) THEN
      v_pending_ramp_week := v_up.current_week - 1;
    END IF;
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

COMMENT ON FUNCTION public.get_home_state(timestamptz, int) IS
  'Read-only Home payload. Caller supplies local-Monday as timestamptz; rest-day logic stays on the client.';
