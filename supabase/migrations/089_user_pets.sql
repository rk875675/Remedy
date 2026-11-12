-- 089_user_pets.sql
-- The pet armadillo (PRD §6.9). One row per user:
--   name  — chosen by the user in onboarding (or from Home for existing users)
--   stage — 1..5, a high-water mark driven by lifetime completed sessions. It only
--           ever goes up; missing days or deleting history never lowers it.
--
-- Deliberately additive. get_home_state and complete_session are NOT changed:
-- released app builds parse get_home_state with a strict schema, so a new key in
-- that payload would break Home on every installed version. Instead:
--   * the stage is raised by a trigger on session_completions, which runs inside the
--     same transaction as complete_session's insert (so it is still atomic with the
--     completion), and
--   * the app reads the pet through its own RPC, get_pet_state.
--
-- Clients have no direct access to user_pets. Reads go through get_pet_state and the
-- only client write is set_pet_name; both are SECURITY DEFINER and scoped to auth.uid().

CREATE TABLE IF NOT EXISTS public.user_pets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text CHECK (name IS NULL OR char_length(name) BETWEEN 1 AND 20),
  stage int NOT NULL DEFAULT 1 CHECK (stage BETWEEN 1 AND 5),
  named_at timestamptz,
  stage_updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_pets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_pets FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Stage thresholds: lifetime completed sessions needed to be AT each stage.
--   stage 1 closed ball   0
--   stage 2 peeking out   1
--   stage 3 sitting       4
--   stage 4 standing      9
--   stage 5 fully grown  15
-- Single source of truth; get_pet_state returns the array so the client never
-- hardcodes it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pet_stage_thresholds()
RETURNS int[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[0, 1, 4, 9, 15];
$$;

CREATE OR REPLACE FUNCTION public.pet_stage_for_sessions(p_sessions int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT GREATEST(1, count(*)::int)
    FROM unnest(public.pet_stage_thresholds()) AS t(needed)
   WHERE t.needed <= GREATEST(COALESCE(p_sessions, 0), 0);
$$;

REVOKE ALL ON FUNCTION public.pet_stage_thresholds() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pet_stage_for_sessions(int) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Raise the stage whenever a session completion is recorded.
-- Runs in the inserting transaction. A pet problem must never block a session
-- from being saved, so any error here is downgraded to a warning; get_pet_state
-- recomputes the stage from the completion count on read, so a missed bump heals.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bump_pet_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sessions int;
  v_stage int;
BEGIN
  SELECT count(*)::int INTO v_sessions
    FROM public.session_completions
   WHERE user_id = NEW.user_id;

  v_stage := public.pet_stage_for_sessions(v_sessions);

  INSERT INTO public.user_pets AS pet (user_id, stage)
  VALUES (NEW.user_id, v_stage)
  ON CONFLICT (user_id) DO UPDATE
    SET stage = EXCLUDED.stage,
        stage_updated_at = now()
    WHERE pet.stage < EXCLUDED.stage;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'bump_pet_stage failed for user %: %', NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.bump_pet_stage() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_session_completion_bump_pet ON public.session_completions;
CREATE TRIGGER on_session_completion_bump_pet
  AFTER INSERT ON public.session_completions
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_pet_stage();

-- ---------------------------------------------------------------------------
-- get_pet_state: everything the client needs to draw the pet.
--   name              — NULL until the user names it
--   stage             — never lower than the stored high-water mark
--   total_sessions    — lifetime completed sessions
--   last_completed_at — most recent completion, for "missed days" moods
--   thresholds        — sessions needed for stages 1..5
-- Read-only (STABLE): a user with no row yet simply gets stage 1 and a NULL name.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_pet_state()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := NULL;
  v_stored_stage int := NULL;
  v_sessions int := 0;
  v_last timestamptz := NULL;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT up.name, up.stage
    INTO v_name, v_stored_stage
    FROM public.user_pets up
   WHERE up.user_id = v_user_id;

  SELECT count(*)::int, max(c.completed_at)
    INTO v_sessions, v_last
    FROM public.session_completions c
   WHERE c.user_id = v_user_id;

  RETURN jsonb_build_object(
    'name', v_name,
    'stage', GREATEST(COALESCE(v_stored_stage, 1), public.pet_stage_for_sessions(v_sessions)),
    'total_sessions', COALESCE(v_sessions, 0),
    'last_completed_at', v_last,
    'thresholds', to_jsonb(public.pet_stage_thresholds())
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_pet_state() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_pet_state() TO authenticated;

-- ---------------------------------------------------------------------------
-- set_pet_name: the only client write. Trims, collapses inner whitespace, and
-- enforces 1..20 characters with no control characters. Creates the row if the
-- user has none yet (new users name the pet before their first session).
-- Returns the same payload as get_pet_state.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_pet_name(p_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text;
  v_sessions int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  v_name := btrim(regexp_replace(COALESCE(p_name, ''), '\s+', ' ', 'g'));

  IF char_length(v_name) < 1
     OR char_length(v_name) > 20
     OR v_name ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid_pet_name' USING ERRCODE = '22023';
  END IF;

  SELECT count(*)::int INTO v_sessions
    FROM public.session_completions
   WHERE user_id = v_user_id;

  INSERT INTO public.user_pets AS pet (user_id, name, named_at, stage)
  VALUES (v_user_id, v_name, now(), public.pet_stage_for_sessions(v_sessions))
  ON CONFLICT (user_id) DO UPDATE
    SET name = EXCLUDED.name,
        named_at = COALESCE(pet.named_at, EXCLUDED.named_at);

  RETURN public.get_pet_state();
END;
$$;

REVOKE ALL ON FUNCTION public.set_pet_name(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_pet_name(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Backfill: existing users start at the stage their history has already earned.
-- Users with no completed sessions get no row; they read as stage 1 until they
-- name the pet or finish a session.
-- ---------------------------------------------------------------------------
INSERT INTO public.user_pets (user_id, stage)
SELECT c.user_id, public.pet_stage_for_sessions(count(*)::int)
  FROM public.session_completions c
  JOIN public.profiles p ON p.id = c.user_id
 GROUP BY c.user_id
ON CONFLICT (user_id) DO NOTHING;
