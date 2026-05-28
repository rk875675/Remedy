-- 008_auto_assign_program.sql
-- 1. Trigger: auto-create user_programs row when onboarding_answers is inserted.
-- 2. Alter entitlements CHECK to allow 'dev_trial' subscription_status.
-- 3. Backfill: create user_programs for existing users who completed onboarding but have none.

-- ---------------------------------------------------------------------------
-- 1. Add 'dev_trial' to the subscription_status CHECK constraint
-- ---------------------------------------------------------------------------
ALTER TABLE public.entitlements
  DROP CONSTRAINT IF EXISTS entitlements_subscription_status_check;

ALTER TABLE public.entitlements
  ADD CONSTRAINT entitlements_subscription_status_check
  CHECK (subscription_status IN ('none', 'trial', 'active', 'cancelled', 'expired', 'dev_trial'));

-- ---------------------------------------------------------------------------
-- 2. Trigger function: auto-assign program after onboarding_answers INSERT
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_onboarding_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_programs WHERE user_id = NEW.user_id
  ) THEN
    INSERT INTO public.user_programs (user_id, program_id, started_at, current_week, current_session)
    VALUES (
      NEW.user_id,
      (SELECT id FROM public.programs LIMIT 1),
      now(),
      1,
      1
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop if it already exists (idempotent re-run safety)
DROP TRIGGER IF EXISTS on_onboarding_complete ON public.onboarding_answers;

CREATE TRIGGER on_onboarding_complete
  AFTER INSERT ON public.onboarding_answers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_onboarding_complete();

-- ---------------------------------------------------------------------------
-- 3. Backfill: existing users who finished onboarding but have no user_programs
-- ---------------------------------------------------------------------------
INSERT INTO public.user_programs (user_id, program_id, started_at, current_week, current_session)
SELECT
  oa.user_id,
  (SELECT id FROM public.programs LIMIT 1),
  now(),
  1,
  1
FROM public.onboarding_answers oa
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_programs up WHERE up.user_id = oa.user_id
);
