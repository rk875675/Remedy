-- 022_profiles_is_dev_guard.sql
-- Prevent privilege/revenue escalation via profiles.is_dev.
--
-- Why: profiles_update_own (migration 001) lets a user UPDATE their own row with no
-- column restriction, and `authenticated` holds table-wide UPDATE (migration 004). So
-- any signed-in user could run:
--     update profiles set is_dev = true where id = auth.uid();
-- PremiumContext treats dev as premium (prem || dev) and grant-dev-trial writes a
-- premium entitlement for is_dev profiles — a full paywall bypass with no Apple purchase.
--
-- Fix: a BEFORE UPDATE trigger forces is_dev back to its stored value for any change that
-- originates from a non-privileged client role (authenticated / anon). is_dev can only be
-- changed by service_role edge functions or migrations. Done as a silent revert (not an
-- error) so legitimate full-row updates from the client don't break.

CREATE OR REPLACE FUNCTION public.prevent_is_dev_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_dev IS DISTINCT FROM OLD.is_dev
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    NEW.is_dev := OLD.is_dev;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_is_dev ON public.profiles;

CREATE TRIGGER profiles_guard_is_dev
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_is_dev_escalation();
