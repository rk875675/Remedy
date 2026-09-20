-- Non-destructive: rebuilds remaining weeks for the mid-program user, asserts
-- progress + history survive, then rolls back via RAISE.

CREATE OR REPLACE FUNCTION pg_temp.verify_rebuild_from_progress()
RETURNS jsonb
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_user uuid := '1b32f679-b6ce-41e3-bcd2-3410290f6d56';
  v_old_plan uuid;
  v_new_plan uuid;
  v_template uuid;
  v_week int;
  v_session int;
  v_plan jsonb;
  v_before_completions int;
  v_before_checkins int;
  v_before_ramp int;
  v_after_completions int;
  v_after_checkins int;
  v_after_ramp int;
  v_pointer_week int;
  v_pointer_session int;
  v_new_start int;
  v_new_status text;
  v_old_status text;
  v_new_min_week int;
  v_new_session_count int;
  v_history_kept int;
  v_unused_left int;
  v_completion_ids uuid[];
  v_checkin_ids uuid[];
  v_result jsonb;
BEGIN
  SELECT active_plan_id, current_week, current_session
    INTO v_old_plan, v_week, v_session
    FROM public.user_programs
   WHERE user_id = v_user;
  IF v_old_plan IS NULL THEN
    RAISE EXCEPTION 'no_active_plan';
  END IF;

  SELECT template_id INTO v_template
    FROM public.user_program_plans
   WHERE id = v_old_plan;

  SELECT count(*) INTO v_before_completions
    FROM public.session_completions
   WHERE user_id = v_user;

  SELECT coalesce(array_agg(id ORDER BY id), ARRAY[]::uuid[])
    INTO v_completion_ids
    FROM public.session_completions
   WHERE user_id = v_user;

  SELECT count(*) INTO v_before_checkins
    FROM public.pain_checkins pc
    JOIN public.session_completions sc ON sc.id = pc.session_completion_id
   WHERE sc.user_id = v_user;

  SELECT coalesce(array_agg(pc.id ORDER BY pc.id), ARRAY[]::uuid[])
    INTO v_checkin_ids
    FROM public.pain_checkins pc
    JOIN public.session_completions sc ON sc.id = pc.session_completion_id
   WHERE sc.user_id = v_user;

  SELECT count(*) INTO v_before_ramp
    FROM public.user_weekly_ramp_decisions
   WHERE user_id = v_user;

  SELECT jsonb_build_object(
    'rules_version', pl.rules_version,
    'program_name', pl.program_name || ' (rebuild-test)',
    'subtitle', pl.subtitle,
    'tagline', pl.tagline,
    'duration_weeks', pl.duration_weeks,
    'sessions_per_week', pl.sessions_per_week,
    'start_week', v_week,
    'primary_focus', pl.primary_focus,
    'secondary_focus', pl.secondary_focus,
    'sessions', (
      SELECT coalesce(jsonb_agg(sess ORDER BY sess->>'week_number', sess->>'session_number'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'week_number', s.week_number,
          'session_number', s.session_number,
          'title', s.title,
          'phase', s.phase,
          'estimated_minutes', s.estimated_minutes,
          'intensity_tier', s.intensity_tier,
          'exercises', (
            SELECT coalesce(jsonb_agg(jsonb_build_object(
              'exercise_id', e.exercise_id,
              'order_index', e.order_index,
              'sets', e.sets,
              'reps', e.reps,
              'duration_seconds', e.duration_seconds,
              'rest_seconds', e.rest_seconds,
              'load_tier', e.load_tier
            ) ORDER BY e.order_index), '[]'::jsonb)
            FROM public.user_plan_session_exercises e
            WHERE e.plan_session_id = s.id
          )
        ) AS sess
        FROM public.user_plan_sessions s
        WHERE s.plan_id = v_old_plan
          AND s.week_number >= v_week
      ) remaining
    )
  )
  INTO v_plan
  FROM public.user_program_plans pl
  WHERE pl.id = v_old_plan;

  IF jsonb_array_length(v_plan->'sessions') < 1 THEN
    RAISE EXCEPTION 'no_remaining_sessions';
  END IF;

  BEGIN
  v_new_plan := public.assign_user_program_snapshot(v_user, v_template, v_plan, true);

  SELECT current_week, current_session, active_plan_id
    INTO v_pointer_week, v_pointer_session, v_new_plan
    FROM public.user_programs
   WHERE user_id = v_user;

  SELECT start_week, status
    INTO v_new_start, v_new_status
    FROM public.user_program_plans
   WHERE id = v_new_plan;

  SELECT status INTO v_old_status
    FROM public.user_program_plans
   WHERE id = v_old_plan;

  SELECT min(week_number), count(*)
    INTO v_new_min_week, v_new_session_count
    FROM public.user_plan_sessions
   WHERE plan_id = v_new_plan;

  SELECT count(*) INTO v_after_completions
    FROM public.session_completions
   WHERE user_id = v_user;

  SELECT count(*) INTO v_after_checkins
    FROM public.pain_checkins pc
    JOIN public.session_completions sc ON sc.id = pc.session_completion_id
   WHERE sc.user_id = v_user;

  SELECT count(*) INTO v_after_ramp
    FROM public.user_weekly_ramp_decisions
   WHERE user_id = v_user;

  SELECT count(*) INTO v_history_kept
    FROM public.session_completions sc
    JOIN public.user_plan_sessions s ON s.id = sc.plan_session_id
   WHERE sc.user_id = v_user
     AND s.plan_id = v_old_plan
     AND sc.id = ANY (v_completion_ids);

  SELECT count(*) INTO v_unused_left
    FROM public.user_plan_sessions s
   WHERE s.plan_id = v_old_plan
     AND NOT EXISTS (
       SELECT 1 FROM public.session_completions c WHERE c.plan_session_id = s.id
     );

  IF v_pointer_week IS DISTINCT FROM v_week THEN
    RAISE EXCEPTION 'pointer_week_moved % -> %', v_week, v_pointer_week;
  END IF;
  IF v_pointer_session IS DISTINCT FROM v_session THEN
    RAISE EXCEPTION 'pointer_session_moved % -> %', v_session, v_pointer_session;
  END IF;
  IF v_new_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'new_plan_not_active';
  END IF;
  IF v_old_status IS DISTINCT FROM 'superseded' THEN
    RAISE EXCEPTION 'old_plan_not_superseded';
  END IF;
  IF v_new_start IS DISTINCT FROM v_week THEN
    RAISE EXCEPTION 'new_start_week % expected %', v_new_start, v_week;
  END IF;
  IF v_new_min_week IS DISTINCT FROM v_week THEN
    RAISE EXCEPTION 'new_plan_includes_past_week %', v_new_min_week;
  END IF;
  IF v_new_session_count < 1 THEN
    RAISE EXCEPTION 'new_plan_empty';
  END IF;
  IF v_after_completions IS DISTINCT FROM v_before_completions THEN
    RAISE EXCEPTION 'completions_changed % -> %', v_before_completions, v_after_completions;
  END IF;
  IF v_after_checkins IS DISTINCT FROM v_before_checkins THEN
    RAISE EXCEPTION 'checkins_changed % -> %', v_before_checkins, v_after_checkins;
  END IF;
  IF v_after_ramp IS DISTINCT FROM v_before_ramp THEN
    RAISE EXCEPTION 'ramp_decisions_changed % -> %', v_before_ramp, v_after_ramp;
  END IF;
  IF v_history_kept IS DISTINCT FROM v_before_completions THEN
    RAISE EXCEPTION 'completion_ids_lost kept=% before=%', v_history_kept, v_before_completions;
  END IF;
  IF v_unused_left <> 0 THEN
    RAISE EXCEPTION 'unused_superseded_sessions_remain %', v_unused_left;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.session_completions sc
    WHERE sc.user_id = v_user AND NOT (sc.id = ANY (v_completion_ids))
  ) THEN
    RAISE EXCEPTION 'new_completion_rows_inserted';
  END IF;
  IF v_checkin_ids IS NOT NULL AND EXISTS (
    SELECT 1
    FROM unnest(v_checkin_ids) cid
    WHERE NOT EXISTS (SELECT 1 FROM public.pain_checkins pc WHERE pc.id = cid)
  ) THEN
    RAISE EXCEPTION 'pain_checkin_ids_lost';
  END IF;

  -- Restore remaining unused sessions that prune removed from the old plan.
  INSERT INTO public.user_plan_sessions (
    plan_id, week_number, session_number, title, phase, estimated_minutes, intensity_tier
  )
  SELECT
    v_old_plan, s.week_number, s.session_number, s.title, s.phase, s.estimated_minutes, s.intensity_tier
  FROM public.user_plan_sessions s
  WHERE s.plan_id = v_new_plan
    AND NOT EXISTS (
      SELECT 1 FROM public.user_plan_sessions existing
      WHERE existing.plan_id = v_old_plan
        AND existing.week_number = s.week_number
        AND existing.session_number = s.session_number
    );

  INSERT INTO public.user_plan_session_exercises (
    plan_session_id, exercise_id, order_index, sets, reps, duration_seconds, rest_seconds, load_tier
  )
  SELECT dest.id, e.exercise_id, e.order_index, e.sets, e.reps, e.duration_seconds, e.rest_seconds, e.load_tier
  FROM public.user_plan_sessions src
  JOIN public.user_plan_session_exercises e ON e.plan_session_id = src.id
  JOIN public.user_plan_sessions dest
    ON dest.plan_id = v_old_plan
   AND dest.week_number = src.week_number
   AND dest.session_number = src.session_number
  WHERE src.plan_id = v_new_plan
    AND NOT EXISTS (
      SELECT 1 FROM public.user_plan_session_exercises existing
      WHERE existing.plan_session_id = dest.id
        AND existing.order_index = e.order_index
    );

  -- Restore the live plan. Repoint first so deleting the test snapshot
  -- does not trip user_programs.active_plan_id.
  UPDATE public.user_programs
     SET active_plan_id = v_old_plan,
         current_week = v_week,
         current_session = v_session
   WHERE user_id = v_user;

  DELETE FROM public.user_program_plans WHERE id = v_new_plan;

  UPDATE public.user_program_plans
     SET status = 'active',
         superseded_at = NULL
   WHERE id = v_old_plan;

  IF (SELECT active_plan_id FROM public.user_programs WHERE user_id = v_user) IS DISTINCT FROM v_old_plan THEN
    RAISE EXCEPTION 'restore_failed';
  END IF;
  IF (SELECT status FROM public.user_program_plans WHERE id = v_old_plan) IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'restore_old_plan_not_active';
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_program_plans WHERE id = v_new_plan) THEN
    RAISE EXCEPTION 'restore_new_plan_still_present';
  END IF;
  IF (SELECT count(*) FROM public.session_completions WHERE user_id = v_user) IS DISTINCT FROM v_before_completions THEN
    RAISE EXCEPTION 'restore_lost_completions';
  END IF;

  v_result := jsonb_build_object(
    'pass', true,
    'user_id', v_user,
    'from_week', v_week,
    'from_session', v_session,
    'old_plan', v_old_plan,
    'new_plan', v_new_plan,
    'new_start_week', v_new_start,
    'new_session_count', v_new_session_count,
    'completions_kept', v_after_completions,
    'checkins_kept', v_after_checkins,
    'ramp_decisions_kept', v_after_ramp,
    'unused_superseded_left', v_unused_left,
    'pointer_unchanged', true
  );
  RETURN v_result;
  EXCEPTION WHEN OTHERS THEN
    IF v_old_plan IS NOT NULL THEN
      UPDATE public.user_programs
         SET active_plan_id = v_old_plan,
             current_week = v_week,
             current_session = v_session
       WHERE user_id = v_user;
    END IF;
    IF v_new_plan IS NOT NULL THEN
      DELETE FROM public.user_program_plans WHERE id = v_new_plan;
    END IF;
    IF v_old_plan IS NOT NULL THEN
      UPDATE public.user_program_plans
         SET status = 'active',
             superseded_at = NULL
       WHERE id = v_old_plan;
    END IF;
    RAISE;
  END;
END;
$fn$;

SELECT pg_temp.verify_rebuild_from_progress() AS result;
