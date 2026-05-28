-- 001_initial_schema.sql
-- Remedy — complete database schema, RLS policies, and auth trigger

-- =============================================================================
-- 1. TABLES
-- =============================================================================

-- 1. profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. onboarding_answers
CREATE TABLE public.onboarding_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  pain_location text NOT NULL,
  pain_duration text NOT NULL,
  pain_type text NOT NULL,
  activity_level text NOT NULL,
  pain_trigger text NOT NULL,
  main_goal text NOT NULL,
  completed_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. programs
CREATE TABLE public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL,
  duration_weeks int NOT NULL,
  sessions_per_week int NOT NULL,
  target_activity_levels text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. program_sessions
CREATE TABLE public.program_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  week_number int NOT NULL,
  session_number int NOT NULL,
  title text NOT NULL,
  duration_minutes int NOT NULL
);

-- 5. exercises
CREATE TABLE public.exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  sets int,
  reps int,
  duration_seconds int,
  rest_seconds int NOT NULL DEFAULT 30,
  video_url text,
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 6. session_exercises
CREATE TABLE public.session_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.program_sessions(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  order_index int NOT NULL
);

-- 7. user_programs
CREATE TABLE public.user_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  program_id uuid NOT NULL REFERENCES public.programs(id),
  started_at timestamptz DEFAULT now(),
  current_week int NOT NULL DEFAULT 1,
  current_session int NOT NULL DEFAULT 1
);

-- 8. session_completions
CREATE TABLE public.session_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  program_session_id uuid NOT NULL REFERENCES public.program_sessions(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  duration_seconds int
);

-- 9. pain_checkins
CREATE TABLE public.pain_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_completion_id uuid REFERENCES public.session_completions(id) ON DELETE SET NULL,
  score int NOT NULL CHECK (score >= 1 AND score <= 10),
  type text NOT NULL CHECK (type IN ('before', 'after')),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- 10. entitlements
CREATE TABLE public.entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE UNIQUE,
  is_premium boolean NOT NULL DEFAULT false,
  subscription_status text NOT NULL DEFAULT 'none'
    CHECK (subscription_status IN ('none', 'trial', 'active', 'cancelled', 'expired')),
  product_id text,
  original_transaction_id text,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 11. billing_events
CREATE TABLE public.billing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL
    CHECK (event_type IN (
      'trial_started', 'subscription_started', 'subscription_renewed',
      'subscription_cancelled', 'refund', 'restored'
    )),
  product_id text,
  transaction_id text,
  idempotency_key text UNIQUE NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pain_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;

-- profiles: users can SELECT and UPDATE their own row
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- onboarding_answers: users can SELECT, INSERT, UPDATE their own row
CREATE POLICY "onboarding_select_own" ON public.onboarding_answers
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "onboarding_insert_own" ON public.onboarding_answers
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "onboarding_update_own" ON public.onboarding_answers
  FOR UPDATE USING (auth.uid() = user_id);

-- programs: all authenticated users can SELECT
CREATE POLICY "programs_select_authenticated" ON public.programs
  FOR SELECT USING (auth.role() = 'authenticated');

-- program_sessions: all authenticated users can SELECT
CREATE POLICY "program_sessions_select_authenticated" ON public.program_sessions
  FOR SELECT USING (auth.role() = 'authenticated');

-- exercises: all authenticated users can SELECT
CREATE POLICY "exercises_select_authenticated" ON public.exercises
  FOR SELECT USING (auth.role() = 'authenticated');

-- session_exercises: all authenticated users can SELECT
CREATE POLICY "session_exercises_select_authenticated" ON public.session_exercises
  FOR SELECT USING (auth.role() = 'authenticated');

-- user_programs: users can SELECT their own row; no INSERT/UPDATE from client
CREATE POLICY "user_programs_select_own" ON public.user_programs
  FOR SELECT USING (auth.uid() = user_id);

-- session_completions: users can SELECT and INSERT their own rows; no UPDATE/DELETE
CREATE POLICY "session_completions_select_own" ON public.session_completions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "session_completions_insert_own" ON public.session_completions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- pain_checkins: users can SELECT and INSERT their own rows; no UPDATE/DELETE
CREATE POLICY "pain_checkins_select_own" ON public.pain_checkins
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "pain_checkins_insert_own" ON public.pain_checkins
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- entitlements: users can SELECT their own row; no INSERT/UPDATE/DELETE from client
CREATE POLICY "entitlements_select_own" ON public.entitlements
  FOR SELECT USING (auth.uid() = user_id);

-- billing_events: users can SELECT their own rows; no INSERT/UPDATE/DELETE from client
CREATE POLICY "billing_events_select_own" ON public.billing_events
  FOR SELECT USING (auth.uid() = user_id);

-- =============================================================================
-- 3. TRIGGER — auto-create profiles + entitlements on new user signup
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.raw_user_meta_data ->> 'name'),
    NEW.email
  );

  INSERT INTO public.entitlements (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
