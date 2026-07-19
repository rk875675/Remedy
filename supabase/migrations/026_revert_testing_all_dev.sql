-- 026_revert_testing_all_dev.sql
-- Revert migration 011 (TESTING ONLY), which set profiles.is_dev DEFAULT true and flipped
-- every existing row to true. Because handle_new_user() inserts profiles without specifying
-- is_dev, that default granted every new signup is_dev=true → PremiumContext treats dev as
-- premium → a complete paywall bypass with no Apple purchase.
--
-- Fix: restore the safe default (false) and reset all rows to false. Genuine staff/dev
-- accounts must be re-flagged explicitly afterwards via a service_role edge function or a
-- follow-up migration. Client writes to is_dev are already blocked by migration 022's guard
-- trigger; migrations run as a privileged role, so the UPDATE below is permitted by that
-- trigger.

ALTER TABLE public.profiles ALTER COLUMN is_dev SET DEFAULT false;

UPDATE public.profiles SET is_dev = false WHERE is_dev = true;
