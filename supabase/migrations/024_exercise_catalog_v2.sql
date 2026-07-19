-- 024_exercise_catalog_v2.sql
-- Evidence-based exercise catalog update for Remedy V1.
--
-- Changes:
--   1. Add is_assignable column (soft-delete gate).
--   2. Soft-delete Weighted Sit-Up (contraindication example, never assigned).
--   3. Insert 10 new clinically-grounded exercises for the back_v1 catalog.
--   4. Add new movement_patterns: lumbar_extension.
--   5. Update week_phase_plan phase ratios (early recovery bump, late strength bump).
--   6. Update program_template_session titles to plain-language names.
--   7. Replace program_template_slots with improved 5-slot session blueprints.
--   8. Extend & clean up exercise_replacement_groups (remove soft-deleted,  add new).
--
-- // HUMAN INPUT NEEDED: calibrate effectiveness / fatigue_cost / goals_weight
--    numbers with a licensed PT before launch. All values are evidence-informed
--    but not clinically validated by a practitioner.

-- ============================================================================
-- 1. is_assignable column
-- ============================================================================
ALTER TABLE public.exercises
  ADD COLUMN IF NOT EXISTS is_assignable boolean NOT NULL DEFAULT true;

-- ============================================================================
-- 2. Soft-delete Weighted Sit-Up
--    (exists only as a contraindication fixture — never assign to users)
-- ============================================================================
UPDATE public.exercises
  SET is_assignable = false
  WHERE id = 'cccc0001-0000-0000-0000-000000000020';

-- Remove it from the replacement pool so it is never pulled as a fallback.
DELETE FROM public.exercise_replacement_groups
  WHERE exercise_id = 'cccc0001-0000-0000-0000-000000000020';

-- ============================================================================
-- 3. New exercises
--    IDs: cccc0001-0000-0000-0000-000000000021 .. 000000000030
-- ============================================================================
INSERT INTO public.exercises
  (id, name, description, sets, reps, duration_seconds, rest_seconds, video_url, instructions,
   equipment_tier, pain_areas, intensity_tier, movement_pattern, pain_types_safe,
   triggers_addressed, goals_weight, effectiveness, fatigue_cost, usefulness, aggravates,
   phase, duration_minutes_est)
VALUES

  -- ── Mobility ───────────────────────────────────────────────────────────────

  ('cccc0001-0000-0000-0000-000000000021',
   'Pelvic Tilt',
   'Gentle lumbar flattening against the floor to release stiffness.',
   2, 15, NULL, 15, NULL,
   'Lie on your back with knees bent; gently flatten your lower back against the floor by tightening your abs, then slowly release.',
   'open_space', ARRAY['lower','general']::text[], 1, 'lumbar_mobility', ARRAY['all']::text[],
   ARRAY['morning','sitting']::text[],
   '{"reduce_pain":0.8,"mobility":0.6,"sleep":0.5}'::jsonb,
   4, 1, 5, ARRAY[]::text[], 'mobility', 3),

  ('cccc0001-0000-0000-0000-000000000022',
   'McKenzie Press-Up',
   'Prone extension press-up to centralise lumbar symptoms.',
   3, 10, NULL, 20, NULL,
   'Lie face down with hands under your shoulders; slowly press your upper body up while keeping your hips on the floor, hold briefly, then lower down.',
   'open_space', ARRAY['lower']::text[], 1, 'lumbar_extension', ARRAY['all']::text[],
   ARRAY['sitting','bending','standing']::text[],
   '{"reduce_pain":0.9,"mobility":0.7}'::jsonb,
   5, 1, 5, ARRAY[]::text[], 'mobility', 4),

  ('cccc0001-0000-0000-0000-000000000023',
   'Supine Trunk Rotation',
   'Gentle lumbar rotation stretch lying on the back.',
   2, 8, NULL, 15, NULL,
   'Lie on your back with knees bent; slowly lower both knees to one side, hold 2–3 seconds, return to centre, and switch sides.',
   'open_space', ARRAY['lower','middle']::text[], 1, 'lumbar_mobility', ARRAY['all']::text[],
   ARRAY['morning','sitting']::text[],
   '{"reduce_pain":0.6,"mobility":0.7,"sleep":0.4}'::jsonb,
   3, 1, 4, ARRAY[]::text[], 'mobility', 3),

  ('cccc0001-0000-0000-0000-000000000024',
   'Standing Back Extension',
   'McKenzie standing lumbar extension to relieve disc pressure.',
   2, 10, NULL, 15, NULL,
   'Stand with feet shoulder-width apart, place hands on your lower back, and gently bend backwards from the waist, then return upright.',
   'open_space', ARRAY['lower']::text[], 1, 'lumbar_extension', ARRAY['all']::text[],
   ARRAY['sitting','standing']::text[],
   '{"reduce_pain":0.7,"mobility":0.6}'::jsonb,
   4, 1, 4, ARRAY[]::text[], 'mobility', 3),

  -- ── Activation / Stability ──────────────────────────────────────────────────

  ('cccc0001-0000-0000-0000-000000000025',
   'Prone Hip Extension',
   'Lift one leg in prone to activate the glutes with no lumbar load.',
   3, 10, NULL, 20, NULL,
   'Lie face down with legs straight; tighten your glutes and lift one straight leg slightly off the floor, hold 2 seconds, lower, and switch legs.',
   'open_space', ARRAY['lower','general']::text[], 2, 'glute_activation', ARRAY['all']::text[],
   ARRAY['bending','sitting']::text[],
   '{"reduce_pain":0.6,"return_to_exercise":0.5,"mobility":0.3}'::jsonb,
   3, 2, 4, ARRAY[]::text[], 'activation', 4),

  ('cccc0001-0000-0000-0000-000000000026',
   'Single-Leg Glute Bridge',
   'Progression of the glute bridge on one leg for greater hip strength.',
   3, 10, NULL, 30, NULL,
   'Lie on your back with knees bent; extend one leg straight, then drive through the heel of the other to lift your hips until your body forms a straight line.',
   'open_space', ARRAY['lower','general']::text[], 3, 'glute_activation', ARRAY['ache','stiffness','all']::text[],
   ARRAY['standing','exercise']::text[],
   '{"reduce_pain":0.6,"return_to_exercise":0.7}'::jsonb,
   4, 2, 4, ARRAY[]::text[], 'activation', 4),

  ('cccc0001-0000-0000-0000-000000000027',
   'Clamshell',
   'Side-lying hip external rotation to activate the hip abductors.',
   2, 15, NULL, 20, NULL,
   'Lie on your side with hips stacked and knees bent; keeping feet together, rotate the top knee open as far as comfortable without rolling the pelvis back.',
   'open_space', ARRAY['lower','general']::text[], 1, 'glute_activation', ARRAY['all']::text[],
   ARRAY['sitting','standing']::text[],
   '{"reduce_pain":0.5,"return_to_exercise":0.5}'::jsonb,
   3, 1, 4, ARRAY[]::text[], 'activation', 3),

  -- ── Strength ────────────────────────────────────────────────────────────────

  ('cccc0001-0000-0000-0000-000000000028',
   'Bodyweight Squat',
   'Controlled squat to build leg and hip strength without load.',
   3, 12, NULL, 30, NULL,
   'Stand with feet shoulder-width apart; push your hips back and bend your knees to lower into a squat keeping your chest tall, then drive through your heels to stand.',
   'open_space', ARRAY['lower','general']::text[], 2, 'lower_body_strength', ARRAY['ache','stiffness','all']::text[],
   ARRAY['exercise','bending']::text[],
   '{"return_to_exercise":0.8,"reduce_pain":0.4}'::jsonb,
   4, 2, 4, ARRAY[]::text[], 'strength', 4),

  ('cccc0001-0000-0000-0000-000000000029',
   'Single-Leg Romanian Deadlift',
   'Bodyweight single-leg hip hinge to progress posterior chain strength and balance.',
   3, 8, NULL, 30, NULL,
   'Stand on one leg with a slight knee bend; hinge at the hips, letting the free leg extend behind you as your torso lowers, then drive through the hip to stand tall.',
   'open_space', ARRAY['lower','general']::text[], 3, 'hip_hinge', ARRAY['ache','stiffness','all']::text[],
   ARRAY['bending','exercise']::text[],
   '{"return_to_exercise":0.8,"reduce_pain":0.4}'::jsonb,
   4, 3, 4, ARRAY[]::text[], 'strength', 5),

  -- ── Recovery ────────────────────────────────────────────────────────────────

  ('cccc0001-0000-0000-0000-000000000030',
   'Supine Hamstring Stretch',
   'Lying hamstring stretch to relieve tension that loads the lumbar spine.',
   2, NULL, 30, 15, NULL,
   'Lie on your back; lift one leg and hold behind the thigh, then gently straighten the knee until you feel a stretch in the back of the leg, breathe and hold.',
   'open_space', ARRAY['lower']::text[], 1, 'stretch_recovery', ARRAY['all']::text[],
   ARRAY['sitting','morning']::text[],
   '{"reduce_pain":0.6,"sleep":0.6,"mobility":0.7}'::jsonb,
   3, 1, 4, ARRAY[]::text[], 'recovery', 3);

-- ============================================================================
-- 4. Update week_phase_plan on the back_v1 master template
--    Early: heavy mobility + activation, no strength.
--    Mid:   balanced — add strength, reduce mobility.
--    Late:  strength-dominant, keep mobility and recovery.
-- ============================================================================
UPDATE public.program_templates
  SET week_phase_plan = '{
    "early": {"mobility": 0.55, "activation": 0.40, "strength": 0.00, "recovery": 0.05},
    "mid":   {"mobility": 0.25, "activation": 0.35, "strength": 0.30, "recovery": 0.10},
    "late":  {"mobility": 0.15, "activation": 0.25, "strength": 0.50, "recovery": 0.10}
  }'::jsonb
  WHERE slug = 'back_v1';

-- ============================================================================
-- 5. Update session blueprint titles to plain-language names
-- ============================================================================
UPDATE public.program_template_sessions SET title_template = '{area} Mobility & Relief'
  WHERE id = 'dddd0002-0000-0000-0000-000000000001';

UPDATE public.program_template_sessions SET title_template = '{area} Stability & Core'
  WHERE id = 'dddd0002-0000-0000-0000-000000000002';

UPDATE public.program_template_sessions SET title_template = '{area} Strength & Function'
  WHERE id = 'dddd0002-0000-0000-0000-000000000003';

UPDATE public.program_template_sessions SET title_template = '{area} Mobility & Relief'
  WHERE id = 'dddd0002-0000-0000-0000-000000000004';

UPDATE public.program_template_sessions SET title_template = '{area} Stability & Core'
  WHERE id = 'dddd0002-0000-0000-0000-000000000005';

-- ============================================================================
-- 6. Replace template slots with improved 5-slot session blueprints
--
--    Each session always contains all four component types so the user gets
--    a complete workout regardless of focus. The slot count is 5 per session.
--
--    Session 1 — Mobility & Relief  (used 1st every week at every frequency)
--    Session 2 — Stability & Core   (used 2nd at 3x+ /week)
--    Session 3 — Strength & Function(used 3rd at 3x+ /week; phase-gated)
--    Session 4 — Mobility & Relief  (4th at 4x+ /week; repeat of type A)
--    Session 5 — Stability & Core   (5th at 5x /week; repeat of type B)
-- ============================================================================
DELETE FROM public.program_template_slots
  WHERE template_session_id IN (
    'dddd0002-0000-0000-0000-000000000001',
    'dddd0002-0000-0000-0000-000000000002',
    'dddd0002-0000-0000-0000-000000000003',
    'dddd0002-0000-0000-0000-000000000004',
    'dddd0002-0000-0000-0000-000000000005'
  );

INSERT INTO public.program_template_slots (template_session_id, slot_order, selection_criteria)
VALUES

  -- ── Session 1: Mobility & Relief ──────────────────────────────────────────
  -- Slot 1: lumbar mobility (Cat-Cow, Knee-to-Chest, Pelvic Tilt, Supine Trunk Rotation)
  ('dddd0002-0000-0000-0000-000000000001', 1,
   '{"phase":"mobility","movement_pattern":"lumbar_mobility","label":"lumbar_warm_up"}'::jsonb),

  -- Slot 2: lumbar extension (McKenzie Press-Up, Standing Back Extension)
  ('dddd0002-0000-0000-0000-000000000001', 2,
   '{"phase":"mobility","movement_pattern":"lumbar_extension","label":"lumbar_extension"}'::jsonb),

  -- Slot 3: thoracic or hip mobility matched to user's pain area
  ('dddd0002-0000-0000-0000-000000000001', 3,
   '{"phase":"mobility","pain_area_bias":"match_user","label":"area_mobility"}'::jsonb),

  -- Slot 4: gentle glute activation (capped at intensity tier 2 for relief sessions)
  ('dddd0002-0000-0000-0000-000000000001', 4,
   '{"phase":"activation","movement_pattern":"glute_activation","target_intensity_tier":2,"label":"gentle_activation"}'::jsonb),

  -- Slot 5: recovery stretch
  ('dddd0002-0000-0000-0000-000000000001', 5,
   '{"phase":"recovery","movement_pattern":"stretch_recovery","label":"cooldown"}'::jsonb),

  -- ── Session 2: Stability & Core ───────────────────────────────────────────
  -- Slot 1: lumbar mobility warm-up
  ('dddd0002-0000-0000-0000-000000000002', 1,
   '{"phase":"mobility","movement_pattern":"lumbar_mobility","label":"warm_up"}'::jsonb),

  -- Slot 2: spinal stability (Bird Dog)
  ('dddd0002-0000-0000-0000-000000000002', 2,
   '{"phase":"activation","movement_pattern":"spinal_stability","label":"spinal_stability"}'::jsonb),

  -- Slot 3: core activation (Dead Bug)
  ('dddd0002-0000-0000-0000-000000000002', 3,
   '{"phase":"activation","movement_pattern":"core_activation","label":"core_activation"}'::jsonb),

  -- Slot 4: glute activation (Clamshell → Bridge → Single-Leg Bridge by intensity)
  ('dddd0002-0000-0000-0000-000000000002', 4,
   '{"phase":"activation","movement_pattern":"glute_activation","label":"glute_activation"}'::jsonb),

  -- Slot 5: recovery stretch
  ('dddd0002-0000-0000-0000-000000000002', 5,
   '{"phase":"recovery","movement_pattern":"stretch_recovery","label":"cooldown"}'::jsonb),

  -- ── Session 3: Strength & Function ────────────────────────────────────────
  -- Slot 1: lumbar mobility warm-up
  ('dddd0002-0000-0000-0000-000000000003', 1,
   '{"phase":"mobility","movement_pattern":"lumbar_mobility","label":"warm_up"}'::jsonb),

  -- Slot 2: glute activation (bridges / single-leg bridge / hip thrust)
  ('dddd0002-0000-0000-0000-000000000003', 2,
   '{"phase":"activation","movement_pattern":"glute_activation","label":"glute_primer"}'::jsonb),

  -- Slot 3: hip hinge strength (Hip Hinge → SL RDL → Banded RDL → DB RDL)
  ('dddd0002-0000-0000-0000-000000000003', 3,
   '{"phase":"strength","movement_pattern":"hip_hinge","label":"hip_hinge"}'::jsonb),

  -- Slot 4: lower body strength (Squat → Goblet Squat → Leg Press)
  ('dddd0002-0000-0000-0000-000000000003', 4,
   '{"phase":"strength","movement_pattern":"lower_body_strength","label":"lower_body"}'::jsonb),

  -- Slot 5: recovery stretch
  ('dddd0002-0000-0000-0000-000000000003', 5,
   '{"phase":"recovery","movement_pattern":"stretch_recovery","label":"cooldown"}'::jsonb),

  -- ── Session 4: Mobility & Relief (4th day variant) ────────────────────────
  -- Slot 1: lumbar extension (alternate entry to Session 1's lumbar_mobility)
  ('dddd0002-0000-0000-0000-000000000004', 1,
   '{"phase":"mobility","movement_pattern":"lumbar_extension","label":"lumbar_extension"}'::jsonb),

  -- Slot 2: hip mobility
  ('dddd0002-0000-0000-0000-000000000004', 2,
   '{"phase":"mobility","movement_pattern":"hip_mobility","label":"hip_mobility"}'::jsonb),

  -- Slot 3: spinal stability (light)
  ('dddd0002-0000-0000-0000-000000000004', 3,
   '{"phase":"activation","movement_pattern":"spinal_stability","target_intensity_tier":2,"label":"light_stability"}'::jsonb),

  -- Slot 4: recovery stretch
  ('dddd0002-0000-0000-0000-000000000004', 4,
   '{"phase":"recovery","movement_pattern":"stretch_recovery","label":"cooldown"}'::jsonb),

  -- ── Session 5: Stability & Core (5th day variant) ─────────────────────────
  -- Slot 1: lumbar mobility warm-up
  ('dddd0002-0000-0000-0000-000000000005', 1,
   '{"phase":"mobility","movement_pattern":"lumbar_mobility","label":"warm_up"}'::jsonb),

  -- Slot 2: core activation
  ('dddd0002-0000-0000-0000-000000000005', 2,
   '{"phase":"activation","movement_pattern":"core_activation","label":"core_activation"}'::jsonb),

  -- Slot 3: posterior chain (upper-body pulling for upper/mid back users; glute for lower)
  ('dddd0002-0000-0000-0000-000000000005', 3,
   '{"phase":"strength","movement_pattern":"posterior_chain_strength","pain_area_bias":"match_user","label":"posterior_chain"}'::jsonb),

  -- Slot 4: spinal stability
  ('dddd0002-0000-0000-0000-000000000005', 4,
   '{"phase":"activation","movement_pattern":"spinal_stability","label":"spinal_stability"}'::jsonb);

-- ============================================================================
-- 7. Extend & clean up exercise_replacement_groups
-- ============================================================================

-- New lumbar_extension pool
INSERT INTO public.exercise_replacement_groups (movement_pattern, exercise_id, priority)
VALUES
  ('lumbar_extension', 'cccc0001-0000-0000-0000-000000000022', 10), -- McKenzie Press-Up
  ('lumbar_extension', 'cccc0001-0000-0000-0000-000000000024', 20); -- Standing Back Extension

-- Extend lumbar_mobility pool (Pelvic Tilt highest priority — most accessible)
INSERT INTO public.exercise_replacement_groups (movement_pattern, exercise_id, priority)
VALUES
  ('lumbar_mobility', 'cccc0001-0000-0000-0000-000000000021',  5), -- Pelvic Tilt (gentlest)
  ('lumbar_mobility', 'cccc0001-0000-0000-0000-000000000023', 25); -- Supine Trunk Rotation

-- Extend glute_activation pool with new bodyweight options
INSERT INTO public.exercise_replacement_groups (movement_pattern, exercise_id, priority)
VALUES
  ('glute_activation', 'cccc0001-0000-0000-0000-000000000027',  5), -- Clamshell BW (tier 1, gentlest)
  ('glute_activation', 'cccc0001-0000-0000-0000-000000000025', 15), -- Prone Hip Extension (tier 2)
  ('glute_activation', 'cccc0001-0000-0000-0000-000000000026', 25); -- Single-Leg Glute Bridge (tier 3)

-- Extend hip_hinge pool with bodyweight tier 3 option
INSERT INTO public.exercise_replacement_groups (movement_pattern, exercise_id, priority)
VALUES
  ('hip_hinge', 'cccc0001-0000-0000-0000-000000000029', 15); -- Single-Leg RDL BW (tier 3, between BW hinge and banded RDL)

-- Extend lower_body_strength pool with bodyweight squat
INSERT INTO public.exercise_replacement_groups (movement_pattern, exercise_id, priority)
VALUES
  ('lower_body_strength', 'cccc0001-0000-0000-0000-000000000028',  5); -- Bodyweight Squat (tier 2, lower priority number = preferred)

-- Extend stretch_recovery pool with hamstring stretch
INSERT INTO public.exercise_replacement_groups (movement_pattern, exercise_id, priority)
VALUES
  ('stretch_recovery', 'cccc0001-0000-0000-0000-000000000030', 25); -- Supine Hamstring Stretch
