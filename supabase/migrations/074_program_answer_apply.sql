-- 074_program_answer_apply.sql
-- Save answers independently of snapshot apply.
--   applied_answers     — last answers written into the active snapshot
--   pending_apply_week  — program week when expensive changes take effect
-- Unused future weeks on superseded snapshots are pruned after each persist.

ALTER TABLE public.user_programs
  ADD COLUMN IF NOT EXISTS applied_answers jsonb,
  ADD COLUMN IF NOT EXISTS pending_apply_week int;

UPDATE public.user_programs up
SET applied_answers = jsonb_build_object(
  'pain_location', oa.pain_location,
  'pain_duration', oa.pain_duration,
  'pain_type', to_jsonb(oa.pain_type),
  'activity_level', oa.activity_level,
  'pain_trigger', to_jsonb(oa.pain_trigger),
  'equipment', oa.equipment,
  'main_goal', to_jsonb(oa.main_goal),
  'sessions_per_week_preference', oa.sessions_per_week_preference
)
FROM public.onboarding_answers oa
WHERE oa.user_id = up.user_id
  AND up.applied_answers IS NULL
  AND oa.equipment IS NOT NULL;

CREATE OR REPLACE FUNCTION public.prune_superseded_program_snapshots(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.user_plan_sessions s
  USING public.user_program_plans p
  WHERE p.id = s.plan_id
    AND p.user_id = p_user_id
    AND p.status = 'superseded'
    AND NOT EXISTS (
      SELECT 1
      FROM public.session_completions c
      WHERE c.plan_session_id = s.id
    );

  DELETE FROM public.user_program_plans p
  WHERE p.user_id = p_user_id
    AND p.status = 'superseded'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_plan_sessions s WHERE s.plan_id = p.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.user_weekly_ramp_decisions d WHERE d.plan_id = p.id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.prune_superseded_program_snapshots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_superseded_program_snapshots(uuid) TO service_role;

DROP FUNCTION IF EXISTS public.assign_user_program_snapshot(uuid, uuid, jsonb);

CREATE FUNCTION public.assign_user_program_snapshot(
  p_user_id uuid,
  p_template_id uuid,
  p_plan jsonb,
  p_preserve_pointer boolean DEFAULT false
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
        current_week = CASE
          WHEN p_preserve_pointer THEN current_week
          ELSE (p_plan ->> 'start_week')::int
        END,
        current_session = CASE
          WHEN p_preserve_pointer THEN current_session
          ELSE 1
        END
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

  PERFORM public.prune_superseded_program_snapshots(p_user_id);

  RETURN v_plan_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_user_program_snapshot(uuid, uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_user_program_snapshot(uuid, uuid, jsonb, boolean) TO service_role;
