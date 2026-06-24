-- 015_seed_templates_and_catalog.sql
-- Seed Layer 1 (tagged exercise catalog), Layer 2 (master template + session blueprints
-- + slots) and the replacement pools.
--
-- // HUMAN INPUT NEEDED: total V1 exercise count target (seeding 20 tagged placeholders).
-- // RESEARCH: effectiveness / fatigue / usefulness are clinically-plausible placeholders
--    for non-specific low back pain rehab. Calibrate with a PT before launch.
-- All video_url left NULL — placeholders stay placeholders until real content exists.

-- =============================================================================
-- 1. Tagged exercise catalog (band/dumbbell/gym variants are SEPARATE rows)
-- =============================================================================
INSERT INTO public.exercises
  (id, name, description, sets, reps, duration_seconds, rest_seconds, video_url, instructions,
   equipment_tier, pain_areas, intensity_tier, movement_pattern, pain_types_safe,
   triggers_addressed, goals_weight, effectiveness, fatigue_cost, usefulness, aggravates,
   phase, duration_minutes_est)
VALUES
  -- ---- Mobility (open_space) ----
  ('cccc0001-0000-0000-0000-000000000001', 'Cat-Cow Stretch', 'Alternating spinal flexion and extension on all fours.', 2, 10, NULL, 20, NULL, 'On hands and knees, alternate arching and rounding your spine with your breath.',
   'open_space', ARRAY['lower','general']::text[], 1, 'lumbar_mobility', ARRAY['all']::text[],
   ARRAY['morning','sitting']::text[], '{"reduce_pain":0.6,"mobility":0.8,"sleep":0.4,"return_to_exercise":0.3}'::jsonb, 4, 1, 5, ARRAY[]::text[], 'mobility', 4),

  ('cccc0001-0000-0000-0000-000000000002', 'Thoracic Extension (Chair-Assisted)', 'Gentle upper-back extension over a chair edge.', 2, 8, NULL, 20, NULL, 'Sit tall, hands behind head, extend the upper back over the chair edge, then return.',
   'open_space', ARRAY['upper','middle','general']::text[], 1, 'thoracic_mobility', ARRAY['all']::text[],
   ARRAY['sitting']::text[], '{"reduce_pain":0.6,"mobility":0.8}'::jsonb, 4, 1, 4, ARRAY[]::text[], 'mobility', 4),

  ('cccc0001-0000-0000-0000-000000000003', 'Open-Book Rotation', 'Side-lying thoracic rotation opening the chest.', 2, 8, NULL, 20, NULL, 'Lie on your side, knees bent, rotate the top arm open like a book, following with your eyes.',
   'open_space', ARRAY['upper','middle']::text[], 1, 'thoracic_mobility', ARRAY['all']::text[],
   ARRAY['sitting','morning']::text[], '{"reduce_pain":0.5,"mobility":0.8}'::jsonb, 3, 1, 4, ARRAY[]::text[], 'mobility', 4),

  ('cccc0001-0000-0000-0000-000000000004', 'Standing Hip Flexor Stretch', 'Half-kneeling stretch for tight hip flexors.', 2, NULL, 30, 15, NULL, 'In a half-kneeling stance, tuck your pelvis and shift forward to feel a stretch at the front of the hip.',
   'open_space', ARRAY['lower','general']::text[], 1, 'hip_mobility', ARRAY['all']::text[],
   ARRAY['sitting','standing']::text[], '{"reduce_pain":0.6,"mobility":0.7}'::jsonb, 4, 1, 4, ARRAY[]::text[], 'mobility', 3),

  ('cccc0001-0000-0000-0000-000000000005', 'Knee-to-Chest', 'Gentle unloaded lumbar flexion stretch.', 2, NULL, 30, 15, NULL, 'Lie on your back and gently draw one or both knees toward your chest.',
   'open_space', ARRAY['lower']::text[], 1, 'lumbar_mobility', ARRAY['stiffness','ache','all']::text[],
   ARRAY['morning']::text[], '{"reduce_pain":0.7,"mobility":0.6,"sleep":0.5}'::jsonb, 3, 1, 4, ARRAY[]::text[], 'mobility', 3),

  -- ---- Activation (open_space + bands) ----
  ('cccc0001-0000-0000-0000-000000000006', 'Bird Dog', 'Opposite arm/leg reach from all fours for spinal control.', 3, 8, NULL, 30, NULL, 'From hands and knees, extend the opposite arm and leg, keeping your trunk still.',
   'open_space', ARRAY['lower','general']::text[], 2, 'spinal_stability', ARRAY['all']::text[],
   ARRAY['bending','standing']::text[], '{"reduce_pain":0.8,"return_to_exercise":0.6,"mobility":0.3}'::jsonb, 5, 2, 5, ARRAY[]::text[], 'activation', 4),

  ('cccc0001-0000-0000-0000-000000000007', 'Dead Bug', 'Controlled limb lowering with a braced core.', 3, NULL, 45, 20, NULL, 'On your back, knees at 90 degrees, slowly lower the opposite arm and leg while keeping the low back flat.',
   'open_space', ARRAY['lower','general']::text[], 2, 'core_activation', ARRAY['all']::text[],
   ARRAY['bending']::text[], '{"reduce_pain":0.8,"return_to_exercise":0.6}'::jsonb, 5, 2, 5, ARRAY[]::text[], 'activation', 4),

  ('cccc0001-0000-0000-0000-000000000008', 'Glute Bridge', 'Hip extension to activate the glutes.', 3, 12, NULL, 30, NULL, 'On your back, knees bent, drive through the heels to lift the hips and squeeze the glutes.',
   'open_space', ARRAY['lower','general']::text[], 2, 'glute_activation', ARRAY['all']::text[],
   ARRAY['sitting','standing']::text[], '{"reduce_pain":0.7,"return_to_exercise":0.6,"mobility":0.3}'::jsonb, 4, 2, 5, ARRAY[]::text[], 'activation', 4),

  ('cccc0001-0000-0000-0000-000000000009', 'Side Plank (Knees)', 'Lateral trunk endurance from the knees.', 3, NULL, 30, 30, NULL, 'On your side resting on a forearm and knees, lift the hips to form a straight line.',
   'open_space', ARRAY['lower','general']::text[], 3, 'spinal_stability', ARRAY['ache','stiffness','all']::text[],
   ARRAY['standing']::text[], '{"reduce_pain":0.7,"return_to_exercise":0.7}'::jsonb, 4, 3, 4, ARRAY[]::text[], 'activation', 3),

  ('cccc0001-0000-0000-0000-000000000010', 'Banded Clamshell', 'Hip external rotation against a band.', 3, 15, NULL, 30, NULL, 'Side-lying with a band around the thighs, open the top knee while keeping the feet together.',
   'bands_dumbbells', ARRAY['lower','general']::text[], 2, 'glute_activation', ARRAY['all']::text[],
   ARRAY['sitting','standing']::text[], '{"reduce_pain":0.6,"return_to_exercise":0.6}'::jsonb, 3, 2, 4, ARRAY[]::text[], 'activation', 4),

  -- ---- Strength (open_space + bands + gym) ----
  ('cccc0001-0000-0000-0000-000000000011', 'Bodyweight Hip Hinge', 'Patterning the hinge with a neutral spine.', 3, 12, NULL, 30, NULL, 'Push the hips back with a long neutral spine, then drive through the hips to stand.',
   'open_space', ARRAY['lower']::text[], 2, 'hip_hinge', ARRAY['all']::text[],
   ARRAY['bending']::text[], '{"reduce_pain":0.7,"return_to_exercise":0.7,"mobility":0.3}'::jsonb, 4, 2, 5, ARRAY[]::text[], 'strength', 4),

  ('cccc0001-0000-0000-0000-000000000012', 'Banded Romanian Deadlift', 'Hip hinge loaded with a resistance band.', 3, 12, NULL, 45, NULL, 'Stand on a band, hinge at the hips keeping a neutral spine, and return tall.',
   'bands_dumbbells', ARRAY['lower','general']::text[], 3, 'hip_hinge', ARRAY['ache','stiffness','all']::text[],
   ARRAY['bending','exercise']::text[], '{"return_to_exercise":0.8,"reduce_pain":0.5}'::jsonb, 4, 3, 4, ARRAY[]::text[], 'strength', 5),

  ('cccc0001-0000-0000-0000-000000000013', 'Dumbbell Romanian Deadlift', 'Loaded hip hinge with dumbbells.', 3, 10, NULL, 60, NULL, 'Hold dumbbells, hinge at the hips with a neutral spine, feel the hamstrings, then stand.',
   'bands_dumbbells', ARRAY['lower','general']::text[], 4, 'posterior_chain_strength', ARRAY['ache','all']::text[],
   ARRAY['bending','exercise']::text[], '{"return_to_exercise":0.9}'::jsonb, 4, 4, 4, ARRAY[]::text[], 'strength', 5),

  ('cccc0001-0000-0000-0000-000000000014', 'Goblet Squat', 'Squat holding a single dumbbell at the chest.', 3, 10, NULL, 60, NULL, 'Hold a dumbbell at your chest and squat between your hips, keeping the chest tall.',
   'bands_dumbbells', ARRAY['lower','general']::text[], 3, 'lower_body_strength', ARRAY['ache','all']::text[],
   ARRAY['exercise','standing']::text[], '{"return_to_exercise":0.8,"reduce_pain":0.4}'::jsonb, 4, 3, 4, ARRAY[]::text[], 'strength', 5),

  ('cccc0001-0000-0000-0000-000000000015', 'Barbell Hip Thrust', 'Loaded hip extension off a bench.', 3, 10, NULL, 75, NULL, 'With upper back on a bench and a barbell over the hips, drive the hips to full extension.',
   'gym', ARRAY['lower','general']::text[], 4, 'glute_activation', ARRAY['ache','all']::text[],
   ARRAY['exercise','sitting']::text[], '{"return_to_exercise":0.9,"reduce_pain":0.4}'::jsonb, 5, 4, 4, ARRAY[]::text[], 'strength', 6),

  ('cccc0001-0000-0000-0000-000000000016', 'Seated Cable Row', 'Horizontal pull for the mid/upper back.', 3, 12, NULL, 60, NULL, 'Sit tall and row the handle to the trunk, squeezing the shoulder blades.',
   'gym', ARRAY['upper','middle','general']::text[], 3, 'posterior_chain_strength', ARRAY['all']::text[],
   ARRAY['sitting']::text[], '{"return_to_exercise":0.8,"reduce_pain":0.5}'::jsonb, 4, 3, 4, ARRAY[]::text[], 'strength', 5),

  ('cccc0001-0000-0000-0000-000000000017', 'Leg Press', 'Machine-based lower-body pressing.', 3, 12, NULL, 75, NULL, 'Press the platform away through mid-foot, stopping short of lumbar rounding.',
   'gym', ARRAY['lower','general']::text[], 4, 'lower_body_strength', ARRAY['ache','all']::text[],
   ARRAY['exercise']::text[], '{"return_to_exercise":0.9}'::jsonb, 4, 4, 3, ARRAY[]::text[], 'strength', 5),

  -- ---- Recovery ----
  ('cccc0001-0000-0000-0000-000000000018', 'Child''s Pose Hold', 'Resting stretch for the low back and hips.', 2, NULL, 40, 15, NULL, 'Kneel and sit back on your heels, reaching the arms forward and breathing slowly.',
   'open_space', ARRAY['lower','general']::text[], 1, 'stretch_recovery', ARRAY['all']::text[],
   ARRAY['morning']::text[], '{"reduce_pain":0.6,"sleep":0.7,"mobility":0.5}'::jsonb, 3, 1, 4, ARRAY[]::text[], 'recovery', 3),

  ('cccc0001-0000-0000-0000-000000000019', 'Supine Figure-4 Stretch', 'Glute/piriformis stretch on the back.', 2, NULL, 30, 15, NULL, 'On your back, cross one ankle over the opposite knee and draw the legs toward you.',
   'open_space', ARRAY['lower']::text[], 1, 'stretch_recovery', ARRAY['all']::text[],
   ARRAY['sitting']::text[], '{"reduce_pain":0.6,"sleep":0.6,"mobility":0.5}'::jsonb, 3, 1, 4, ARRAY[]::text[], 'recovery', 3),

  -- ---- Contraindicated example (loaded spinal flexion) ----
  -- Tagged aggravates=flexion_loaded so the lower+sharp+acute contraindication has a
  -- visible effect (excluded in early weeks).
  ('cccc0001-0000-0000-0000-000000000020', 'Weighted Sit-Up', 'Loaded trunk flexion crunch.', 3, 12, NULL, 45, NULL, 'Hold a light weight at the chest and curl the trunk up, then lower under control.',
   'bands_dumbbells', ARRAY['general']::text[], 3, 'core_activation', ARRAY['ache','all']::text[],
   ARRAY['exercise']::text[], '{"return_to_exercise":0.5}'::jsonb, 3, 3, 2, ARRAY['flexion_loaded']::text[], 'strength', 4);

-- =============================================================================
-- 2. Master program template + week phase plan
-- =============================================================================
INSERT INTO public.program_templates (id, slug, name, description, week_phase_plan, is_active)
VALUES (
  'dddd0001-0000-0000-0000-000000000001',
  'back_v1',
  'Back Pain Master Template',
  'Slot-based master template for non-specific low back pain. Scales to any duration_weeks via week_phase_plan.',
  '{
     "early": {"mobility": 0.6, "activation": 0.4, "strength": 0.0, "recovery": 0.0},
     "mid":   {"mobility": 0.25, "activation": 0.4, "strength": 0.35, "recovery": 0.0},
     "late":  {"mobility": 0.2, "activation": 0.3, "strength": 0.4, "recovery": 0.1}
   }'::jsonb,
  true
);

-- Session blueprints (session_index 1..5). The engine uses the first
-- `sessions_per_week` blueprints and distributes them across the week.
INSERT INTO public.program_template_sessions (id, template_id, session_index, title_template, phase)
VALUES
  ('dddd0002-0000-0000-0000-000000000001', 'dddd0001-0000-0000-0000-000000000001', 1, '{area} Mobility & Foundation', 'mobility'),
  ('dddd0002-0000-0000-0000-000000000002', 'dddd0001-0000-0000-0000-000000000001', 2, '{area} Stability Foundation', 'activation'),
  ('dddd0002-0000-0000-0000-000000000003', 'dddd0001-0000-0000-0000-000000000001', 3, '{area} Strength & Control', 'strength'),
  ('dddd0002-0000-0000-0000-000000000004', 'dddd0001-0000-0000-0000-000000000001', 4, '{area} Mobility & Recovery', 'recovery'),
  ('dddd0002-0000-0000-0000-000000000005', 'dddd0001-0000-0000-0000-000000000001', 5, '{area} Strength & Endurance', 'strength');

-- Ordered slots per session blueprint. selection_criteria = movement_pattern / phase /
-- pain_area_bias / target_intensity_tier. pain_area_bias 'match_user' resolves to the
-- user's pain_location at assignment time.
INSERT INTO public.program_template_slots (template_session_id, slot_order, selection_criteria)
VALUES
  -- Session 1 — Mobility & Foundation
  ('dddd0002-0000-0000-0000-000000000001', 1, '{"phase":"mobility","movement_pattern":"thoracic_mobility","pain_area_bias":"match_user"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000001', 2, '{"phase":"mobility","movement_pattern":"lumbar_mobility"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000001', 3, '{"phase":"mobility","movement_pattern":"hip_mobility"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000001', 4, '{"phase":"recovery","movement_pattern":"stretch_recovery"}'::jsonb),
  -- Session 2 — Stability Foundation
  ('dddd0002-0000-0000-0000-000000000002', 1, '{"phase":"mobility","movement_pattern":"thoracic_mobility"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000002', 2, '{"phase":"activation","movement_pattern":"core_activation"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000002', 3, '{"phase":"activation","movement_pattern":"glute_activation"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000002', 4, '{"phase":"activation","movement_pattern":"spinal_stability"}'::jsonb),
  -- Session 3 — Strength & Control
  ('dddd0002-0000-0000-0000-000000000003', 1, '{"phase":"mobility"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000003', 2, '{"phase":"activation","movement_pattern":"glute_activation"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000003', 3, '{"phase":"strength","movement_pattern":"hip_hinge"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000003', 4, '{"phase":"strength","movement_pattern":"posterior_chain_strength"}'::jsonb),
  -- Session 4 — Mobility & Recovery
  ('dddd0002-0000-0000-0000-000000000004', 1, '{"phase":"mobility","movement_pattern":"lumbar_mobility"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000004', 2, '{"phase":"mobility","movement_pattern":"hip_mobility"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000004', 3, '{"phase":"recovery","movement_pattern":"stretch_recovery"}'::jsonb),
  -- Session 5 — Strength & Endurance
  ('dddd0002-0000-0000-0000-000000000005', 1, '{"phase":"activation","movement_pattern":"core_activation"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000005', 2, '{"phase":"strength","movement_pattern":"lower_body_strength"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000005', 3, '{"phase":"strength","movement_pattern":"posterior_chain_strength"}'::jsonb),
  ('dddd0002-0000-0000-0000-000000000005', 4, '{"phase":"activation","movement_pattern":"spinal_stability"}'::jsonb);

-- =============================================================================
-- 3. Replacement pools (movement_pattern -> ordered alternatives across tiers)
-- =============================================================================
INSERT INTO public.exercise_replacement_groups (movement_pattern, exercise_id, priority)
VALUES
  ('thoracic_mobility', 'cccc0001-0000-0000-0000-000000000002', 10),
  ('thoracic_mobility', 'cccc0001-0000-0000-0000-000000000003', 20),
  ('lumbar_mobility',   'cccc0001-0000-0000-0000-000000000001', 10),
  ('lumbar_mobility',   'cccc0001-0000-0000-0000-000000000005', 20),
  ('hip_mobility',      'cccc0001-0000-0000-0000-000000000004', 10),
  ('core_activation',   'cccc0001-0000-0000-0000-000000000007', 10),
  ('core_activation',   'cccc0001-0000-0000-0000-000000000020', 30),
  ('glute_activation',  'cccc0001-0000-0000-0000-000000000008', 10),
  ('glute_activation',  'cccc0001-0000-0000-0000-000000000010', 20),
  ('glute_activation',  'cccc0001-0000-0000-0000-000000000015', 30),
  ('spinal_stability',  'cccc0001-0000-0000-0000-000000000006', 10),
  ('spinal_stability',  'cccc0001-0000-0000-0000-000000000009', 20),
  ('hip_hinge',         'cccc0001-0000-0000-0000-000000000011', 10),
  ('hip_hinge',         'cccc0001-0000-0000-0000-000000000012', 20),
  ('posterior_chain_strength', 'cccc0001-0000-0000-0000-000000000013', 10),
  ('posterior_chain_strength', 'cccc0001-0000-0000-0000-000000000016', 20),
  ('lower_body_strength',      'cccc0001-0000-0000-0000-000000000014', 10),
  ('lower_body_strength',      'cccc0001-0000-0000-0000-000000000017', 20),
  ('stretch_recovery',  'cccc0001-0000-0000-0000-000000000018', 10),
  ('stretch_recovery',  'cccc0001-0000-0000-0000-000000000019', 20);
