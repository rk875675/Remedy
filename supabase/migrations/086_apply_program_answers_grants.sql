-- 086_apply_program_answers_grants.sql
-- 017_service_role_grants.sql established explicit least-privilege grants for the
-- service_role used by edge functions. 074_program_answer_apply.sql then added the
-- apply-program-answers function without granting the four privileges it needs, so every
-- call failed at the first write with "permission denied for table onboarding_answers"
-- (SQLSTATE 42501) and returned 500 save_failed.
--
-- Granting only the operations that function actually performs; it does not delete
-- onboarding answers or plan exercises, so no DELETE is granted on those.

-- Saves the edited answer snapshot.
GRANT UPDATE ON public.onboarding_answers TO service_role;

-- Reads which sessions are already finished, to decide what may still be patched.
GRANT SELECT ON public.session_completions TO service_role;

-- Swaps exercises in place when equipment changes.
GRANT UPDATE ON public.user_plan_session_exercises TO service_role;

-- Drops surplus sessions when sessions-per-week decreases.
GRANT DELETE ON public.user_plan_sessions TO service_role;
