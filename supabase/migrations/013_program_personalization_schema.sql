-- 013_program_personalization_schema.sql
-- Extensible, snapshot-based program personalization system.
--
-- Layers:
--   L1 Tagged exercise catalog        -> ALTER exercises (rich metadata tags)
--   L2 Program session templates      -> program_templates / _sessions / _slots (slots, not fixed exercises)
--   L3 Assignment rules (config)      -> assignment_rules (versioned jsonb)
--   L4 Resolved user plan snapshot     -> user_program_plans / user_plan_sessions / user_plan_session_exercises
--   L5 Weekly adaptive ramp           -> user_weekly_ramp_decisions
--   Replacement pools                  -> exercise_replacement_groups
--
-- The app reads ONLY the L4 snapshot for playback. Library/template changes never
-- mutate an in-progress user's frozen plan.
--
-- Assignment runs server-side (Edge Function `assign-program`) AFTER paywall conversion.
-- The naive auto-assign trigger from 008 is removed at the bottom of this file.

-- =============================================================================
-- 1. LAYER 1 — Tagged exercise catalog (extend exercises)
-- =============================================================================
-- Each row is one concrete exercise *variant*. Band / dumbbell / gym variants of the
-- same movement are SEPARATE rows (separate videos), linked only by movement_pattern.

ALTER TABLE public.exercises
  -- Hard equipment filter. User is never assigned an exercise above their tier.
  ADD COLUMN IF NOT EXISTS equipment_tier text NOT NULL DEFAULT 'open_space'
    CHECK (equipment_tier IN ('open_space', 'bands_dumbbells', 'gym')),
  -- Which back regions this targets. Values: 'upper','middle','lower','general'.
  ADD COLUMN IF NOT EXISTS pain_areas text[] NOT NULL DEFAULT ARRAY['general']::text[],
  -- 1 (gentlest) .. 5 (hardest). Used for assignment gating + weekly ramp.
  ADD COLUMN IF NOT EXISTS intensity_tier int NOT NULL DEFAULT 1
    CHECK (intensity_tier BETWEEN 1 AND 5),
  -- Free-text movement family used to find equipment-appropriate replacements,
  -- e.g. 'thoracic_mobility','core_activation','hip_hinge','glute_activation'.
  -- Intentionally NOT a CHECK enum so the content owner can add new patterns
  -- without a migration.
  ADD COLUMN IF NOT EXISTS movement_pattern text NOT NULL DEFAULT 'mobility_general',
  -- Pain descriptors this exercise is safe for. Values: 'stiffness','ache','sharp','all'.
  ADD COLUMN IF NOT EXISTS pain_types_safe text[] NOT NULL DEFAULT ARRAY['all']::text[],
  -- Pain triggers this exercise specifically helps. Values: 'sitting','bending',
  -- 'standing','morning','exercise'.
  ADD COLUMN IF NOT EXISTS triggers_addressed text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Per-goal relevance 0..1, e.g. {"reduce_pain":0.8,"mobility":0.4,...}.
  ADD COLUMN IF NOT EXISTS goals_weight jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Clinical effectiveness 1..5 (slot priority; research-seeded).
  ADD COLUMN IF NOT EXISTS effectiveness int NOT NULL DEFAULT 3
    CHECK (effectiveness BETWEEN 1 AND 5),
  -- Fatigue cost 1..5; summed per session and capped by a per-activity budget.
  ADD COLUMN IF NOT EXISTS fatigue_cost int NOT NULL DEFAULT 2
    CHECK (fatigue_cost BETWEEN 1 AND 5),
  -- General usefulness 1..5; tie-breaker in the replacement pool.
  ADD COLUMN IF NOT EXISTS usefulness int NOT NULL DEFAULT 3
    CHECK (usefulness BETWEEN 1 AND 5),
  -- Movement properties to AVOID for certain users, e.g. 'flexion_loaded',
  -- 'extension_loaded','impact','rotation_loaded'.
  ADD COLUMN IF NOT EXISTS aggravates text[] NOT NULL DEFAULT ARRAY[]::text[],
  -- Training phase this exercise belongs to.
  ADD COLUMN IF NOT EXISTS phase text NOT NULL DEFAULT 'mobility'
    CHECK (phase IN ('mobility', 'activation', 'strength', 'recovery')),
  -- Estimated minutes for one exercise block (match-screen / session length calc).
  ADD COLUMN IF NOT EXISTS duration_minutes_est int NOT NULL DEFAULT 4;

-- =============================================================================
-- 2. New onboarding answer — sessions per week preference (NEW question q8)
-- =============================================================================
ALTER TABLE public.onboarding_answers
  ADD COLUMN IF NOT EXISTS sessions_per_week_preference int
    CHECK (sessions_per_week_preference BETWEEN 2 AND 5);

-- =============================================================================
-- 3. LAYER 3 — Assignment rules (versioned, extensible config)
-- =============================================================================
-- `rules` jsonb maps onboarding answer keys -> { type, filters, weights, modifiers }
-- plus global config (duration_weeks map, sessions/week recommendations, intensity
-- multipliers, fatigue budgets). Adding a new onboarding question = add a column +
-- add a rules entry. Existing exercises/templates are NOT touched.
CREATE TABLE public.assignment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version int NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT false,
  rules jsonb NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- At most one active ruleset.
CREATE UNIQUE INDEX assignment_rules_one_active
  ON public.assignment_rules (is_active)
  WHERE is_active;

-- =============================================================================
-- 4. LAYER 2 — Program session templates (slots, not fixed exercises)
-- =============================================================================
CREATE TABLE public.program_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  -- week_phase_plan: phase emphasis as a function of relative program progress so the
  -- engine can scale a single master template to ANY duration_weeks. Example:
  --   { "early": {"mobility":0.6,"activation":0.4},
  --     "mid":   {"activation":0.4,"strength":0.4,"mobility":0.2},
  --     "late":  {"strength":0.6,"mobility":0.2,"recovery":0.2} }
  week_phase_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Session blueprints keyed by session-index within a week (1..N). The engine uses the
-- first `sessions_per_week` blueprints and distributes them across the week.
CREATE TABLE public.program_template_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.program_templates(id) ON DELETE CASCADE,
  session_index int NOT NULL,
  -- title_template may contain tokens resolved at assignment time, e.g.
  -- "{area} Mobility & Extension".
  title_template text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('mobility', 'activation', 'strength', 'recovery')),
  UNIQUE (template_id, session_index)
);

-- Ordered slots per session blueprint. Each slot has SELECTION CRITERIA, not a
-- hardcoded exercise_id.
CREATE TABLE public.program_template_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_session_id uuid NOT NULL
    REFERENCES public.program_template_sessions(id) ON DELETE CASCADE,
  slot_order int NOT NULL,
  -- selection_criteria jsonb keys (all optional):
  --   movement_pattern, phase, pain_area_bias ('upper'|'lower'|'match_user'),
  --   target_intensity_tier, label
  selection_criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (template_session_id, slot_order)
);

-- =============================================================================
-- 5. Replacement pools — ordered alternatives per movement pattern
-- =============================================================================
-- Curated fallback ordering used when a slot's primary candidate is filtered out
-- (e.g. above the user's equipment tier). The engine still respects the hard
-- equipment filter + pain-area + equal-or-lower intensity when choosing from here.
CREATE TABLE public.exercise_replacement_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_pattern text NOT NULL,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  priority int NOT NULL DEFAULT 100, -- lower = preferred
  UNIQUE (movement_pattern, exercise_id)
);

-- =============================================================================
-- 6. LAYER 4 — Resolved user plan snapshot (frozen at assignment)
-- =============================================================================
CREATE TABLE public.user_program_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.program_templates(id),
  rules_version int NOT NULL,
  program_name text NOT NULL,
  subtitle text,
  tagline text,
  duration_weeks int NOT NULL,
  sessions_per_week int NOT NULL,
  start_week int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'preview')),
  -- top-2 scoring dimensions used for the program name (for analytics / display)
  primary_focus text,
  secondary_focus text,
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz
);

CREATE INDEX user_program_plans_user_status_idx
  ON public.user_program_plans (user_id, status);

CREATE TABLE public.user_plan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.user_program_plans(id) ON DELETE CASCADE,
  week_number int NOT NULL,
  session_number int NOT NULL,
  title text NOT NULL,
  phase text NOT NULL,
  estimated_minutes int NOT NULL DEFAULT 0,
  intensity_tier int NOT NULL DEFAULT 1,
  UNIQUE (plan_id, week_number, session_number)
);

CREATE INDEX user_plan_sessions_plan_idx
  ON public.user_plan_sessions (plan_id, week_number, session_number);

CREATE TABLE public.user_plan_session_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_session_id uuid NOT NULL
    REFERENCES public.user_plan_sessions(id) ON DELETE CASCADE,
  exercise_id uuid NOT NULL REFERENCES public.exercises(id),
  order_index int NOT NULL,
  sets int,
  reps int,
  duration_seconds int,
  rest_seconds int NOT NULL DEFAULT 30,
  -- load tier 1..5; weekly ramp bumps this for the NEXT week, not the template.
  load_tier int NOT NULL DEFAULT 1
);

CREATE INDEX user_plan_session_exercises_session_idx
  ON public.user_plan_session_exercises (plan_session_id, order_index);

-- =============================================================================
-- 7. LAYER 5 — Weekly adaptive ramp decisions
-- =============================================================================
CREATE TABLE public.user_weekly_ramp_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.user_program_plans(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_number int NOT NULL, -- the week that was just completed
  suggestion text NOT NULL CHECK (suggestion IN ('progress', 'hold')),
  decision text NOT NULL CHECK (decision IN ('progress', 'hold')),
  pain_delta numeric, -- avg(before) - avg(after) for the completed week; >0 = improving
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, week_number)
);

-- =============================================================================
-- 8. Wire user_programs + session_completions to the snapshot
-- =============================================================================
-- user_programs stays as the lightweight current-week/session pointer; it now points
-- at the active resolved plan.
ALTER TABLE public.user_programs
  ADD COLUMN IF NOT EXISTS active_plan_id uuid
    REFERENCES public.user_program_plans(id);

-- Completions now reference resolved plan sessions. Keep program_session_id for
-- backwards compatibility but make it nullable (snapshot path uses plan_session_id).
ALTER TABLE public.session_completions
  ADD COLUMN IF NOT EXISTS plan_session_id uuid
    REFERENCES public.user_plan_sessions(id);

ALTER TABLE public.session_completions
  ALTER COLUMN program_session_id DROP NOT NULL;

-- =============================================================================
-- 9. ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.assignment_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_template_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.program_template_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_replacement_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_program_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plan_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_plan_session_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_weekly_ramp_decisions ENABLE ROW LEVEL SECURITY;

-- Config tables: authenticated read (writes only via service-role edge functions /
-- migrations). The active ruleset is needed for any client-side preview fallback.
CREATE POLICY "assignment_rules_select_authenticated" ON public.assignment_rules
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "program_templates_select_authenticated" ON public.program_templates
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "program_template_sessions_select_authenticated" ON public.program_template_sessions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "program_template_slots_select_authenticated" ON public.program_template_slots
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "exercise_replacement_groups_select_authenticated" ON public.exercise_replacement_groups
  FOR SELECT USING (auth.role() = 'authenticated');

-- Snapshot tables: users can read only their own plan. Writes happen via the
-- service-role edge function (RLS does not apply to service role).
CREATE POLICY "user_program_plans_select_own" ON public.user_program_plans
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "user_plan_sessions_select_own" ON public.user_plan_sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_program_plans p
      WHERE p.id = user_plan_sessions.plan_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "user_plan_session_exercises_select_own" ON public.user_plan_session_exercises
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.user_plan_sessions s
      JOIN public.user_program_plans p ON p.id = s.plan_id
      WHERE s.id = user_plan_session_exercises.plan_session_id
        AND p.user_id = auth.uid()
    )
  );

-- Weekly ramp: user can read + record their own decision. The intensity application
-- to next week's snapshot is handled server-side (see migration that adds the trigger).
CREATE POLICY "user_weekly_ramp_decisions_select_own" ON public.user_weekly_ramp_decisions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_weekly_ramp_decisions_insert_own" ON public.user_weekly_ramp_decisions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =============================================================================
-- 10. GRANTS (RLS still governs row visibility)
-- =============================================================================
GRANT SELECT ON public.assignment_rules TO authenticated;
GRANT SELECT ON public.program_templates TO authenticated;
GRANT SELECT ON public.program_template_sessions TO authenticated;
GRANT SELECT ON public.program_template_slots TO authenticated;
GRANT SELECT ON public.exercise_replacement_groups TO authenticated;
GRANT SELECT ON public.user_program_plans TO authenticated;
GRANT SELECT ON public.user_plan_sessions TO authenticated;
GRANT SELECT ON public.user_plan_session_exercises TO authenticated;
GRANT SELECT, INSERT ON public.user_weekly_ramp_decisions TO authenticated;

-- =============================================================================
-- 11. Remove naive auto-assign trigger (assignment now runs post-paywall, server-side)
-- =============================================================================
DROP TRIGGER IF EXISTS on_onboarding_complete ON public.onboarding_answers;
DROP FUNCTION IF EXISTS public.handle_onboarding_complete();
