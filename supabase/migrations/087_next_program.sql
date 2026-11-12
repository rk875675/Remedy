-- 087_next_program.sql
-- Program completion no longer restarts the same plan. The user either:
--   continue — keeps their answers; the next program runs one progression level up
--   rebuild  — answers a short check-in (how it went + what to change) and gets a
--              program built from it
--
-- user_programs carries the journey-level state (not the plan snapshot) so mid-program
-- rebuilds via assign-program / apply-program-answers keep the user's level.
--   progression_level  — engine intensity shift for the current program (-1..3)
--   programs_completed — finished programs; the current one is number + 1
--   program_started_at — when the current program began; NULL = the first program
--
-- program_checkins is one row per finished program. Written only by start_next_program
-- (service role via the start-next-program edge function); no client policies.

ALTER TABLE public.user_programs
  ADD COLUMN IF NOT EXISTS progression_level int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS programs_completed int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS program_started_at timestamptz;

ALTER TABLE public.user_programs
  ADD CONSTRAINT user_programs_progression_level_check
    CHECK (progression_level BETWEEN -1 AND 3),
  ADD CONSTRAINT user_programs_programs_completed_check
    CHECK (programs_completed >= 0);

CREATE TABLE public.program_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key uuid NOT NULL,
  choice text NOT NULL CHECK (choice IN ('continue', 'rebuild')),
  from_plan_id uuid REFERENCES public.user_program_plans(id) ON DELETE SET NULL,
  to_plan_id uuid REFERENCES public.user_program_plans(id) ON DELETE SET NULL,
  from_level int NOT NULL,
  to_level int NOT NULL,
  pain_change text CHECK (pain_change IN ('much_better', 'better', 'same', 'worse')),
  difficulty text CHECK (difficulty IN ('too_easy', 'just_right', 'too_hard')),
  answers jsonb NOT NULL,
  feedback text CHECK (feedback IS NULL OR char_length(feedback) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT program_checkins_user_key_unique UNIQUE (user_id, idempotency_key),
  CONSTRAINT program_checkins_choice_fields_check CHECK (
    (choice = 'continue' AND pain_change IS NULL AND difficulty IS NULL AND feedback IS NULL)
    OR (choice = 'rebuild' AND pain_change IS NOT NULL AND difficulty IS NOT NULL)
  )
);

ALTER TABLE public.program_checkins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.program_checkins FROM anon, authenticated;
-- Replay lookup before a rebuild is computed. Inserts go through start_next_program.
GRANT SELECT ON public.program_checkins TO service_role;

-- ---------------------------------------------------------------------------
-- start_next_program
-- ---------------------------------------------------------------------------
-- The edge function builds p_plan with the engine; everything that must agree with it
-- happens here in one transaction under the same per-user advisory lock as
-- assign_user_program_snapshot:
--   1. a replayed idempotency key returns the plan the first attempt created
--   2. the active plan is still the one the client finished, and it IS finished
--   3. new snapshot + pointer reset (assign_user_program_snapshot)
--   4. saved answers, level, program count, and the check-in row
CREATE FUNCTION public.start_next_program(
  p_user_id uuid,
  p_expected_plan_id uuid,
  p_idempotency_key uuid,
  p_choice text,
  p_template_id uuid,
  p_plan jsonb,
  p_answers jsonb,
  p_to_level int,
  p_pain_change text DEFAULT NULL,
  p_difficulty text DEFAULT NULL,
  p_feedback text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_existing public.program_checkins%ROWTYPE;
  v_up public.user_programs%ROWTYPE;
  v_duration_weeks int;
  v_plan_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_expected_plan_id IS NULL OR p_idempotency_key IS NULL
     OR p_plan IS NULL OR p_answers IS NULL
     OR jsonb_typeof(p_plan -> 'sessions') <> 'array' THEN
    RAISE EXCEPTION 'invalid_next_program' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  SELECT * INTO v_existing
    FROM public.program_checkins
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'plan_id', v_existing.to_plan_id,
      'from_level', v_existing.from_level,
      'to_level', v_existing.to_level,
      'replayed', true
    );
  END IF;

  SELECT * INTO v_up FROM public.user_programs WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_up.active_plan_id IS NULL THEN
    RAISE EXCEPTION 'no_active_program' USING ERRCODE = 'P0001';
  END IF;
  IF v_up.active_plan_id <> p_expected_plan_id THEN
    RAISE EXCEPTION 'plan_changed' USING ERRCODE = 'P0010';
  END IF;

  SELECT duration_weeks INTO v_duration_weeks
    FROM public.user_program_plans
    WHERE id = v_up.active_plan_id AND user_id = p_user_id AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_active_program' USING ERRCODE = 'P0001';
  END IF;
  IF v_up.current_week <= v_duration_weeks THEN
    RAISE EXCEPTION 'program_not_complete' USING ERRCODE = 'P0011';
  END IF;

  v_plan_id := public.assign_user_program_snapshot(p_user_id, p_template_id, p_plan, false);

  UPDATE public.onboarding_answers
    SET pain_location = p_answers ->> 'pain_location',
        pain_duration = p_answers ->> 'pain_duration',
        pain_type = ARRAY(
          SELECT t.v FROM jsonb_array_elements_text(p_answers -> 'pain_type') WITH ORDINALITY AS t(v, i)
          ORDER BY t.i
        ),
        activity_level = p_answers ->> 'activity_level',
        pain_trigger = ARRAY(
          SELECT t.v FROM jsonb_array_elements_text(p_answers -> 'pain_trigger') WITH ORDINALITY AS t(v, i)
          ORDER BY t.i
        ),
        equipment = p_answers ->> 'equipment',
        -- Order matters: the first goal is the program's primary focus.
        main_goal = ARRAY(
          SELECT t.v FROM jsonb_array_elements_text(p_answers -> 'main_goal') WITH ORDINALITY AS t(v, i)
          ORDER BY t.i
        ),
        sessions_per_week_preference = (p_answers ->> 'sessions_per_week_preference')::int
    WHERE user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_onboarding_answers' USING ERRCODE = 'P0012';
  END IF;

  UPDATE public.user_programs
    SET progression_level = p_to_level,
        programs_completed = programs_completed + 1,
        program_started_at = now(),
        applied_answers = p_answers,
        pending_apply_week = NULL
    WHERE user_id = p_user_id;

  INSERT INTO public.program_checkins (
    user_id,
    idempotency_key,
    choice,
    from_plan_id,
    to_plan_id,
    from_level,
    to_level,
    pain_change,
    difficulty,
    answers,
    feedback
  )
  VALUES (
    p_user_id,
    p_idempotency_key,
    p_choice,
    v_up.active_plan_id,
    v_plan_id,
    v_up.progression_level,
    p_to_level,
    p_pain_change,
    p_difficulty,
    p_answers,
    NULLIF(btrim(p_feedback), '')
  );

  RETURN jsonb_build_object(
    'plan_id', v_plan_id,
    'from_level', v_up.progression_level,
    'to_level', p_to_level,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.start_next_program(uuid, uuid, uuid, text, uuid, jsonb, jsonb, int, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_next_program(uuid, uuid, uuid, text, uuid, jsonb, jsonb, int, text, text, text) TO service_role;
