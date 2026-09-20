-- Predicate used by get_home_state + complete_session must match apply_weekly_ramp.
-- Run: supabase db query --linked --yes -f scripts/verify_weekly_ramp_gate.sql

DO $$
DECLARE
  v_user uuid := '749d01e0-be42-4e18-a7a7-e1e3a2b26e31';
  v_plan uuid;
  v_week1 boolean;
  v_week3 boolean;
  v_planned1 int;
  v_done1 int;
BEGIN
  SELECT active_plan_id INTO v_plan
    FROM public.user_programs
   WHERE user_id = v_user;
  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'verify_failed no_plan';
  END IF;

  SELECT count(*) INTO v_planned1
    FROM public.user_plan_sessions
   WHERE plan_id = v_plan AND week_number = 1;

  SELECT count(DISTINCT c.plan_session_id) INTO v_done1
    FROM public.session_completions c
    JOIN public.user_plan_sessions s ON s.id = c.plan_session_id
   WHERE c.user_id = v_user AND s.plan_id = v_plan AND s.week_number = 1;

  v_week1 := public.week_is_fully_completed(v_user, v_plan, 1);
  v_week3 := public.week_is_fully_completed(v_user, v_plan, 3);

  IF v_planned1 < 1 THEN
    RAISE EXCEPTION 'verify_failed week1_has_no_sessions';
  END IF;
  IF v_done1 >= v_planned1 THEN
    RAISE EXCEPTION 'verify_failed week1_unexpectedly_complete %/%', v_done1, v_planned1;
  END IF;
  IF v_week1 IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'verify_failed week1_helper %', v_week1;
  END IF;
  IF v_week3 IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'verify_failed week3_helper %', v_week3;
  END IF;

  RAISE NOTICE 'PASS week_is_fully_completed: week1=%/% week3=false', v_done1, v_planned1;

  BEGIN
    INSERT INTO public.user_weekly_ramp_decisions (
      plan_id, user_id, week_number, suggestion, decision
    ) VALUES (
      v_plan, v_user, 3, 'hold', 'hold'
    );
    RAISE EXCEPTION 'verify_failed trigger_accepted_incomplete_week';
  EXCEPTION
    WHEN SQLSTATE 'P0005' THEN
      RAISE NOTICE 'PASS apply_weekly_ramp rejects incomplete week 3';
  END;
END;
$$;
