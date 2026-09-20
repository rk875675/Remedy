-- 054_atomic_program_assignment.sql
-- Serialize each user's assignments and persist the complete snapshot + pointer in one
-- transaction. Any failure restores the previous active plan and pointer automatically.

CREATE UNIQUE INDEX IF NOT EXISTS user_program_plans_one_active_per_user_idx
  ON public.user_program_plans (user_id)
  WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.assign_user_program_snapshot(
  p_user_id uuid,
  p_template_id uuid,
  p_plan jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_plan_id uuid;
  v_program_id uuid;
  v_session_id uuid;
  v_session jsonb;
  v_exercise jsonb;
BEGIN
  IF p_user_id IS NULL OR p_plan IS NULL OR jsonb_typeof(p_plan -> 'sessions') <> 'array' THEN
    RAISE EXCEPTION 'invalid_assignment_snapshot' USING ERRCODE = '22023';
  END IF;

  -- Transaction-scoped and deterministic for this user. Concurrent callers wait here;
  -- the unique index independently enforces the one-active-plan invariant.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  UPDATE public.user_program_plans
    SET status = 'superseded', superseded_at = now()
    WHERE user_id = p_user_id AND status = 'active';

  INSERT INTO public.user_program_plans (
    user_id,
    template_id,
    rules_version,
    program_name,
    subtitle,
    tagline,
    duration_weeks,
    sessions_per_week,
    start_week,
    status,
    primary_focus,
    secondary_focus
  )
  VALUES (
    p_user_id,
    p_template_id,
    (p_plan ->> 'rules_version')::int,
    p_plan ->> 'program_name',
    p_plan ->> 'subtitle',
    p_plan ->> 'tagline',
    (p_plan ->> 'duration_weeks')::int,
    (p_plan ->> 'sessions_per_week')::int,
    (p_plan ->> 'start_week')::int,
    'active',
    p_plan ->> 'primary_focus',
    p_plan ->> 'secondary_focus'
  )
  RETURNING id INTO v_plan_id;

  FOR v_session IN
    SELECT value FROM jsonb_array_elements(p_plan -> 'sessions')
  LOOP
    INSERT INTO public.user_plan_sessions (
      plan_id,
      week_number,
      session_number,
      title,
      phase,
      estimated_minutes,
      intensity_tier
    )
    VALUES (
      v_plan_id,
      (v_session ->> 'week_number')::int,
      (v_session ->> 'session_number')::int,
      v_session ->> 'title',
      v_session ->> 'phase',
      (v_session ->> 'estimated_minutes')::int,
      (v_session ->> 'intensity_tier')::int
    )
    RETURNING id INTO v_session_id;

    FOR v_exercise IN
      SELECT value FROM jsonb_array_elements(v_session -> 'exercises')
    LOOP
      INSERT INTO public.user_plan_session_exercises (
        plan_session_id,
        exercise_id,
        order_index,
        sets,
        reps,
        duration_seconds,
        rest_seconds,
        load_tier
      )
      VALUES (
        v_session_id,
        (v_exercise ->> 'exercise_id')::uuid,
        (v_exercise ->> 'order_index')::int,
        (v_exercise ->> 'sets')::int,
        (v_exercise ->> 'reps')::int,
        (v_exercise ->> 'duration_seconds')::int,
        (v_exercise ->> 'rest_seconds')::int,
        (v_exercise ->> 'load_tier')::int
      );
    END LOOP;
  END LOOP;

  UPDATE public.user_programs
    SET active_plan_id = v_plan_id,
        current_week = (p_plan ->> 'start_week')::int,
        current_session = 1
    WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    SELECT id INTO v_program_id FROM public.programs ORDER BY created_at LIMIT 1;
    IF v_program_id IS NULL THEN
      RAISE EXCEPTION 'no_legacy_program' USING ERRCODE = 'P0001';
    END IF;

    INSERT INTO public.user_programs (
      user_id,
      program_id,
      active_plan_id,
      current_week,
      current_session
    )
    VALUES (
      p_user_id,
      v_program_id,
      v_plan_id,
      (p_plan ->> 'start_week')::int,
      1
    );
  END IF;

  RETURN v_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_user_program_snapshot(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_user_program_snapshot(uuid, uuid, jsonb) TO service_role;

-- Progression must reject a pointer to a superseded snapshot, not merely a non-null
-- active_plan_id. This replaces the latest definition from migration 027.
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

  SELECT sessions_per_week, duration_weeks
    INTO v_sessions_per_week, v_duration_weeks
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
