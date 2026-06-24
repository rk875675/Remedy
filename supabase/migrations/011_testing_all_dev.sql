-- 010_testing_all_dev.sql
--
-- ⚠️⚠️⚠️ TESTING ONLY — REMOVE BEFORE PROD ⚠️⚠️⚠️
--
-- Makes every existing AND future account a dev account so the paywall can be
-- bypassed via the dev trial during testing.
--
-- To revert before launch, create a new migration containing:
--   ALTER TABLE public.profiles ALTER COLUMN is_dev SET DEFAULT false;
--   UPDATE public.profiles SET is_dev = false;

-- Future accounts: handle_new_user() inserts profiles without specifying
-- is_dev, so the column default applies to every new signup.
ALTER TABLE public.profiles ALTER COLUMN is_dev SET DEFAULT true;

-- Current accounts
UPDATE public.profiles SET is_dev = true;
