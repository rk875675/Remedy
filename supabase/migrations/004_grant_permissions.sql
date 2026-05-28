-- 004_grant_permissions.sql
-- Grant table permissions to authenticated and anon roles

-- Authenticated users need SELECT on read-only tables
GRANT SELECT ON public.programs TO authenticated;
GRANT SELECT ON public.program_sessions TO authenticated;
GRANT SELECT ON public.exercises TO authenticated;
GRANT SELECT ON public.session_exercises TO authenticated;

-- Authenticated users need SELECT + INSERT/UPDATE on their own data tables
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.onboarding_answers TO authenticated;
GRANT SELECT ON public.user_programs TO authenticated;
GRANT SELECT, INSERT ON public.session_completions TO authenticated;
GRANT SELECT, INSERT ON public.pain_checkins TO authenticated;
GRANT SELECT ON public.entitlements TO authenticated;
GRANT SELECT ON public.billing_events TO authenticated;

-- Service role (edge functions) needs full access — already has it by default
-- but user_programs needs UPDATE from edge functions context
GRANT SELECT, INSERT, UPDATE ON public.user_programs TO authenticated;
