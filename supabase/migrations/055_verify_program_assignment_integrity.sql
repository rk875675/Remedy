-- 055_verify_program_assignment_integrity.sql
-- Fail rollout if existing assignment state violates the invariants required by the
-- atomic writer. This is verification only; it intentionally performs no cleanup.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.user_programs up
    JOIN public.user_program_plans pointed ON pointed.id = up.active_plan_id
    WHERE pointed.status <> 'active'
  ) THEN
    RAISE EXCEPTION 'assignment_integrity_stale_pointer';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_program_plans active
    LEFT JOIN public.user_programs up
      ON up.user_id = active.user_id
     AND up.active_plan_id = active.id
    WHERE active.status = 'active'
      AND up.id IS NULL
  ) THEN
    RAISE EXCEPTION 'assignment_integrity_orphan_active_plan';
  END IF;
END;
$$;
