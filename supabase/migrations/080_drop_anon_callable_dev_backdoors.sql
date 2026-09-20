-- Close an anon-reachable privilege-escalation / data-destruction hole.
--
-- seed_friend_tester(uuid) and z_grant_named_dev() were created directly against the
-- production database and never existed in a migration, so they carried Postgres'
-- default EXECUTE-to-PUBLIC grant. PostgREST exposes every non-trigger function in
-- the exposed schema, which made seed_friend_tester callable by `anon` with nothing
-- but the publishable key that ships inside the app bundle:
--
--   POST /rest/v1/rpc/seed_friend_tester  {"p_user_id": "<any user's uuid>"}
--
-- As SECURITY DEFINER it then set entitlements.is_premium = true for 365 days (a free
-- premium bypass) and DELETEd that user's session_completions, pain_checkins and
-- user_weekly_ramp_decisions (unrecoverable progress loss for an arbitrary account).
-- Verified reachable against the live project: the call reached the function body and
-- only failed on the foreign key because the probe used a non-existent uuid.
--
-- No trigger references either function (the only live triggers are
-- on_weekly_ramp_decision, profiles_guard_is_dev and profiles_guard_is_dev_insert), so
-- dropping them is non-breaking. _dev_seed_friend only ever fed seed_friend_tester.
DROP FUNCTION IF EXISTS public.seed_friend_tester(uuid);
DROP FUNCTION IF EXISTS public.z_grant_named_dev();
DROP TABLE IF EXISTS public._dev_seed_friend;

-- get_home_state is a legitimate client RPC, but it also still held the default PUBLIC
-- grant. Keep `authenticated` (which the app uses) and drop the anonymous surface.
REVOKE EXECUTE ON FUNCTION public.get_home_state(timestamptz, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_home_state(timestamptz, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_home_state(timestamptz, integer) TO authenticated;

-- Root cause, not just the instance: stop every future function in this schema from
-- being granted to PUBLIC (and therefore to `anon`) the moment it is created. New RPCs
-- must grant `authenticated` explicitly, the way complete_session and restart_program
-- already do.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
