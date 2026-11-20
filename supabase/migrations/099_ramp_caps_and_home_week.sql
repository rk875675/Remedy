-- Progress no longer pushes strength or activation reps past 15, and a hold that
-- already has reps stays at that hold. Home's this-week dots count only
-- completions on the active plan since this program started.

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
     AND c.completed_at >= p_week_monday
     AND (v_up.program_started_at IS NULL OR c.completed_at >= v_up.program_started_at)
     AND EXISTS (
       SELECT 1
         FROM public.user_plan_sessions ps
        WHERE ps.id = c.plan_session_id
          AND ps.plan_id = v_plan.id
     );

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


-- A completed older week with no decision row could still be bumped by a direct
-- insert. The app only offers the week Home marks pending (current_week - 1,
-- after complete_session has already advanced the pointer). The trigger now
-- requires that same week.

CREATE OR REPLACE FUNCTION public.apply_weekly_ramp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  target_week int := NEW.week_number + 1;
  v_plan_owner uuid;
  v_current_week int;
BEGIN
  SELECT user_id INTO v_plan_owner
    FROM public.user_program_plans
    WHERE id = NEW.plan_id;
  IF v_plan_owner IS NULL OR v_plan_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'plan_not_owned' USING ERRCODE = 'P0004';
  END IF;

  SELECT up.current_week INTO v_current_week
    FROM public.user_programs up
    WHERE up.user_id = NEW.user_id
      AND up.active_plan_id = NEW.plan_id;
  IF v_current_week IS NULL OR NEW.week_number <> v_current_week - 1 THEN
    RAISE EXCEPTION 'ramp_week_not_current' USING ERRCODE = 'P0006';
  END IF;

  IF NOT public.week_is_fully_completed(NEW.user_id, NEW.plan_id, NEW.week_number) THEN
    RAISE EXCEPTION 'week_not_completed' USING ERRCODE = 'P0005';
  END IF;

  IF NEW.decision = 'progress' THEN
    UPDATE public.user_plan_session_exercises e
    SET
      reps = CASE
        WHEN e.reps IS NULL THEN NULL
        WHEN ex.phase IN ('strength', 'activation') THEN LEAST(15, CEIL(e.reps * 1.1)::int)
        ELSE CEIL(e.reps * 1.1)::int
      END,
      duration_seconds = CASE
        WHEN e.duration_seconds IS NULL THEN NULL
        WHEN e.reps IS NOT NULL THEN e.duration_seconds
        ELSE CEIL(e.duration_seconds * 1.1)::int
      END,
      rest_seconds = GREATEST(10, e.rest_seconds - 5),
      load_tier = LEAST(5, e.load_tier + 1)
    FROM public.user_plan_sessions s, public.exercises ex
    WHERE e.plan_session_id = s.id
      AND ex.id = e.exercise_id
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
