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
