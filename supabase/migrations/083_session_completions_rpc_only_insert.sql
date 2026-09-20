-- session_completions must only be written by complete_session().
--
-- `session_completions_insert_own` (001_initial_schema.sql) let any authenticated user
-- POST rows straight to /rest/v1/session_completions with their own user_id, bypassing
-- the pointer guard in complete_session (021/057). Two consequences:
--
--   1. Progress, totals and charts can be inflated arbitrarily.
--   2. apply_weekly_ramp (028) counts completion rows to decide a week is finished, so
--      forged rows unlock a real 'progress' ramp — +10% reps/duration and load_tier + 1
--      on a back-rehab plan the user never actually worked up to. That is a physical
--      safety issue, not just bad analytics.
--
-- The app never inserts directly: every completion goes through the RPC
-- (app/session/[id].tsx). SELECT stays (progress, charts, program-complete) and DELETE
-- stays (the Reset Progress flow in app/(tabs)/profile.tsx deletes completions).
-- complete_session is SECURITY DEFINER, so it keeps writing after this revoke.
DROP POLICY IF EXISTS session_completions_insert_own ON public.session_completions;
REVOKE INSERT ON public.session_completions FROM authenticated;
