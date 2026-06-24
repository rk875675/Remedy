-- 017_service_role_grants.sql
-- Edge functions use the service_role JWT. RLS is bypassed, but PostgreSQL still
-- requires explicit GRANTs. Without these, assign-program / grant-dev-trial /
-- verify-purchase cannot read onboarding answers or write entitlements.

-- Read paths (assignment engine + dev trial + IAP verification)
GRANT SELECT ON public.onboarding_answers TO service_role;
GRANT SELECT ON public.profiles TO service_role;
GRANT SELECT ON public.entitlements TO service_role;
GRANT SELECT ON public.assignment_rules TO service_role;
GRANT SELECT ON public.exercises TO service_role;
GRANT SELECT ON public.program_templates TO service_role;
GRANT SELECT ON public.program_template_sessions TO service_role;
GRANT SELECT ON public.program_template_slots TO service_role;
GRANT SELECT ON public.exercise_replacement_groups TO service_role;
GRANT SELECT ON public.programs TO service_role;
GRANT SELECT ON public.user_programs TO service_role;
GRANT SELECT ON public.user_program_plans TO service_role;
GRANT SELECT ON public.user_plan_sessions TO service_role;
GRANT SELECT ON public.user_plan_session_exercises TO service_role;

-- Write paths (assignment snapshot + entitlements)
GRANT INSERT, UPDATE ON public.user_program_plans TO service_role;
GRANT INSERT ON public.user_plan_sessions TO service_role;
GRANT INSERT ON public.user_plan_session_exercises TO service_role;
GRANT INSERT, UPDATE ON public.user_programs TO service_role;
GRANT INSERT, UPDATE ON public.entitlements TO service_role;
GRANT INSERT ON public.billing_events TO service_role;
