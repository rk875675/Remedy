-- 033_profiles_insert_own.sql
-- Allow a signed-in user to insert their own missing profiles row.
--
-- Why: profiles has only profiles_select_own + profiles_update_own (migration 001) —
-- no INSERT policy. Profile creation relies solely on the handle_new_user trigger. If
-- that trigger ever failed, or a profiles row was deleted independently of auth.users,
-- the client-side repair attempts in AuthContext (validateSession / ensureProfile) are
-- denied by RLS. validateSession then reports the session as invalid and the app force
-- signs the user out on every launch — the account is permanently unusable until an
-- operator manually inserts the row. Adding this policy lets the existing client-side
-- self-heal path actually work.

CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- RLS policies are necessary but not sufficient — migration 004 only granted
-- SELECT/UPDATE on profiles to `authenticated`. Without this GRANT, the insert is
-- rejected before RLS is even evaluated.
GRANT INSERT ON public.profiles TO authenticated;
