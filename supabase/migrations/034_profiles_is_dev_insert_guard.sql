-- 034_profiles_is_dev_insert_guard.sql
-- Prevent privilege/revenue escalation when a client repairs a missing profile row.
--
-- Migration 022 protects UPDATE, but the INSERT policy added by migration 033 lets an
-- authenticated user insert their own profile with is_dev = true. Silently force the
-- flag off for client roles while preserving privileged service/migration inserts.

CREATE OR REPLACE FUNCTION public.prevent_is_dev_insert_escalation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_dev IS TRUE
     AND current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    NEW.is_dev := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_is_dev_insert ON public.profiles;

CREATE TRIGGER profiles_guard_is_dev_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_is_dev_insert_escalation();
