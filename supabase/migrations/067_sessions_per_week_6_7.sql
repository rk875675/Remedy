-- 067_sessions_per_week_6_7.sql
-- Expand the sessions-per-week offering from 3–5 to 3–7.
--
-- Changes:
--   1. Widen the onboarding_answers CHECK constraint to allow 6 and 7.
--   2. Seed two new session blueprints (session_index 6 and 7) so the engine
--      can .slice(0, sessionsPerWeek) up to 7 without running out of blueprints.
--   3. Update assignment_rules v1 to list 6+7 as valid options and add
--      PersonalizationBubble copy for both values.
--
-- Session 6 — Core & Stability Focus:
--   Extra activation day slotted between two strength sessions for high-frequency
--   training without cumulative fatigue spike.
--
-- Session 7 — Active Recovery:
--   Pure mobility + recovery day appropriate for every-day training; keeps
--   movement stimulus without adding meaningful load on the seventh consecutive day.

-- =============================================================================
-- 1. Widen the CHECK constraint
-- =============================================================================

-- The inline CHECK added in migration 013 has a Postgres-generated name.
-- Drop it by identifying it from the system catalog to be safe, then re-add.
DO $$
DECLARE
  _con text;
BEGIN
  SELECT conname
  INTO   _con
  FROM   pg_constraint
  WHERE  conrelid = 'public.onboarding_answers'::regclass
    AND  contype  = 'c'
    AND  pg_get_constraintdef(oid) LIKE '%sessions_per_week_preference%';

  IF _con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.onboarding_answers DROP CONSTRAINT %I', _con);
  END IF;
END$$;

ALTER TABLE public.onboarding_answers
  ADD CONSTRAINT onboarding_answers_sessions_per_week_check
    CHECK (sessions_per_week_preference BETWEEN 2 AND 7);

-- =============================================================================
-- 2. Add two new session blueprints
-- =============================================================================

INSERT INTO public.program_template_sessions (id, template_id, session_index, title_template, phase)
VALUES
  -- 6th day: a second activation-focused session for high-frequency weeks.
  (
    'dddd0002-0000-0000-0000-000000000006',
    'dddd0001-0000-0000-0000-000000000001',
    6,
    '{area} Core & Stability Focus',
    'activation'
  ),
  -- 7th day: dedicated active-recovery session; keeps daily movement without extra load.
  (
    'dddd0002-0000-0000-0000-000000000007',
    'dddd0001-0000-0000-0000-000000000001',
    7,
    '{area} Active Recovery',
    'recovery'
  )
ON CONFLICT (id) DO NOTHING;

-- Slots for session 6 — Core & Stability Focus
INSERT INTO public.program_template_slots (template_session_id, slot_order, selection_criteria)
VALUES
  ('dddd0002-0000-0000-0000-000000000006', 1, '{"phase":"mobility","movement_pattern":"lumbar_mobility"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000006', 2, '{"phase":"activation","movement_pattern":"core_activation"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000006', 3, '{"phase":"activation","movement_pattern":"glute_activation"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000006', 4, '{"phase":"recovery","movement_pattern":"stretch_recovery"}'::jsonb)
ON CONFLICT DO NOTHING;

-- Slots for session 7 — Active Recovery
INSERT INTO public.program_template_slots (template_session_id, slot_order, selection_criteria)
VALUES
  ('dddd0002-0000-0000-0000-000000000007', 1, '{"phase":"mobility","movement_pattern":"thoracic_mobility"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000007', 2, '{"phase":"mobility","movement_pattern":"lumbar_mobility"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000007', 3, '{"phase":"mobility","movement_pattern":"hip_mobility"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000007', 4, '{"phase":"recovery","movement_pattern":"stretch_recovery"}'::jsonb)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 3. Update assignment_rules v1 — options and bubble copy for 6 and 7
-- =============================================================================

UPDATE public.assignment_rules
SET rules = jsonb_set(
      jsonb_set(
        rules,
        '{sessions_per_week_preference,options}',
        '[3, 4, 5, 6, 7]'::jsonb
      ),
      '{sessions_per_week_preference,bubble}',
      '{
        "2": "Lighter schedule — we will keep sessions efficient on your workout days.",
        "3": "A balanced, sustainable rhythm for steady progress.",
        "4": "A consistent cadence to build strength and mobility faster.",
        "5": "An ambitious schedule — we will manage fatigue across the week.",
        "6": "A high-frequency plan — we will include an active-recovery day to manage load.",
        "7": "Every day — sessions alternate effort and recovery so your back adapts without overloading."
      }'::jsonb
    )
WHERE version = 1;
