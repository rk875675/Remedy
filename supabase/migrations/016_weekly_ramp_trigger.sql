-- 016_weekly_ramp_trigger.sql
-- Layer 5 — weekly adaptive ramp application.
--
-- When a user confirms a weekly ramp decision (client inserts into
-- user_weekly_ramp_decisions), apply the intensity change to the NEXT week's resolved
-- snapshot ONLY. The master template is never touched.
--
-- This runs as SECURITY DEFINER so it can write the snapshot tables (clients cannot
-- update user_plan_session_exercises directly under RLS). A 'progress' decision bumps
-- reps / duration / load tier and trims rest; a 'hold' decision changes nothing.

CREATE OR REPLACE FUNCTION public.apply_weekly_ramp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  target_week int := NEW.week_number + 1;
BEGIN
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

DROP TRIGGER IF EXISTS on_weekly_ramp_decision ON public.user_weekly_ramp_decisions;

CREATE TRIGGER on_weekly_ramp_decision
  AFTER INSERT ON public.user_weekly_ramp_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_weekly_ramp();
