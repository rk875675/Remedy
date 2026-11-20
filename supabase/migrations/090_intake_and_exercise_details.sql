-- 090_intake_and_exercise_details.sql
-- Additive storage for the clinical intake and per-exercise dosing tags.
-- Does not alter exercises, onboarding_answers, or any existing RPC.
-- Seed rows for exercise_details live in 091_seed_exercise_details.sql.

-- ---------------------------------------------------------------------------
-- user_intake: one strict intake JSON object per user (spec 01).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_intake (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  version int NOT NULL DEFAULT 1,
  answers jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_intake ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_intake_select_own"
  ON public.user_intake
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user_intake_insert_own"
  ON public.user_intake
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_intake_update_own"
  ON public.user_intake
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE ON TABLE public.user_intake TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_intake TO service_role;

-- ---------------------------------------------------------------------------
-- exercise_details: clinical tags the v2 engine reads. One row per exercise.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.exercise_details (
  exercise_id uuid PRIMARY KEY REFERENCES public.exercises(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  dose_class text NOT NULL CHECK (dose_class IN (
    'mobility_dynamic',
    'stretch_static',
    'motor_control',
    'isometric_core',
    'strength_endurance',
    'loaded_strength',
    'neural_mobilization',
    'breathing',
    'aerobic'
  )),
  spine_bias text NOT NULL CHECK (spine_bias IN (
    'flexion',
    'extension',
    'neutral',
    'rotation',
    'lateral'
  )),
  contra text[] NOT NULL DEFAULT '{}',
  function_targets text[] NOT NULL DEFAULT '{}',
  per_side boolean NOT NULL DEFAULT false,
  steps text[] NOT NULL DEFAULT '{}',
  feel text,
  mistakes text[] NOT NULL DEFAULT '{}',
  tempo text,
  tempo_pattern int[] NOT NULL DEFAULT '{}',
  breathing text,
  easier text,
  harder text,
  purpose text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.exercise_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "exercise_details_select_authenticated"
  ON public.exercise_details
  FOR SELECT
  TO authenticated
  USING (true);

GRANT SELECT ON TABLE public.exercise_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exercise_details TO service_role;

-- ---------------------------------------------------------------------------
-- Bump updated_at on update. SECURITY INVOKER; both writing roles can execute it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intake_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.intake_touch_updated_at() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intake_touch_updated_at() TO authenticated, service_role;

DROP TRIGGER IF EXISTS user_intake_touch_updated_at ON public.user_intake;
CREATE TRIGGER user_intake_touch_updated_at
  BEFORE UPDATE ON public.user_intake
  FOR EACH ROW
  EXECUTE FUNCTION public.intake_touch_updated_at();

DROP TRIGGER IF EXISTS exercise_details_touch_updated_at ON public.exercise_details;
CREATE TRIGGER exercise_details_touch_updated_at
  BEFORE UPDATE ON public.exercise_details
  FOR EACH ROW
  EXECUTE FUNCTION public.intake_touch_updated_at();
