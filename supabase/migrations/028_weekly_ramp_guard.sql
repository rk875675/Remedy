-- 028_weekly_ramp_guard.sql
-- Lock down the weekly ramp so it can only be applied to a week the user actually
-- completed, on a plan they actually own.
--
-- Why: user_weekly_ramp_decisions_insert_own (migration 013) only checked
-- auth.uid() = user_id. An authenticated user could insert 'progress' decisions for
-- weeks 1..N on day 1 — each insert fires apply_weekly_ramp() (SECURITY DEFINER),
-- compounding +10% reps/duration and +1 load_tier onto later weeks of a back-pain
-- rehab plan (injury risk). The policy also never verified plan_id belonged to the
-- caller, so a leaked plan UUID could be used to corrupt another user's snapshot.
--
-- Fix, two layers:
--   1. RLS: plan_id must be the caller's own ACTIVE plan (owned via user_program_plans
--      and pointed at by user_programs.active_plan_id).
--   2. Trigger guard: apply_weekly_ramp() verifies ownership and that EVERY session of
--      the decided week has a completion before mutating next week's snapshot. Raising
--      inside the AFTER INSERT trigger rolls the decision row back too.

-- ---------------------------------------------------------------------------
-- 1. RLS: decision must target the caller's own active plan
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_weekly_ramp_decisions_insert_own"
  ON public.user_weekly_ramp_decisions;

CREATE POLICY "user_weekly_ramp_decisions_insert_own" ON public.user_weekly_ramp_decisions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.user_program_plans p
      WHERE p.id = user_weekly_ramp_decisions.plan_id
        AND p.user_id = auth.uid()
        AND p.status = 'active'
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_programs up
      WHERE up.user_id = auth.uid()
        AND up.active_plan_id = user_weekly_ramp_decisions.plan_id
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Trigger: validate ownership + week completion before applying the ramp
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_weekly_ramp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  target_week int := NEW.week_number + 1;
  v_plan_owner uuid;
  v_total_sessions int;
  v_completed_sessions int;
BEGIN
  -- Defense in depth (RLS already checks this for client inserts): the plan must
  -- belong to the user recorded on the decision row.
  SELECT user_id INTO v_plan_owner
    FROM public.user_program_plans
    WHERE id = NEW.plan_id;
  IF v_plan_owner IS NULL OR v_plan_owner <> NEW.user_id THEN
    RAISE EXCEPTION 'plan_not_owned' USING ERRCODE = 'P0004';
  END IF;

  -- The decided week must be fully completed: every resolved session of that week
  -- has a completion by this user. Blocks day-1 mass 'progress' inserts.
  SELECT count(*) INTO v_total_sessions
    FROM public.user_plan_sessions s
    WHERE s.plan_id = NEW.plan_id
      AND s.week_number = NEW.week_number;

  SELECT count(DISTINCT c.plan_session_id) INTO v_completed_sessions
    FROM public.session_completions c
    JOIN public.user_plan_sessions s ON s.id = c.plan_session_id
    WHERE c.user_id = NEW.user_id
      AND s.plan_id = NEW.plan_id
      AND s.week_number = NEW.week_number;

  IF v_total_sessions = 0 OR v_completed_sessions < v_total_sessions THEN
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
