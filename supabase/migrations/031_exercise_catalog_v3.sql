-- 031_exercise_catalog_v3.sql
-- Evidence-based catalog v3: real progression ladders + corrected dosing.
--
-- Research basis (see PRD program notes):
--   - McGill core-endurance protocol: isometric stability work = 8-10s holds x
--     descending reps, NOT long continuous holds (Bird Dog / Side Planks / Dead Bug fixed).
--   - Berglund/Aasa RCTs + JOSPT CPG 2021: late-phase LBP rehab should include
--     progressively loaded hinge/squat/carry patterns -> deepen bands & gym tiers.
--   - Replacement pools rebuilt as strict intensity ladders so the engine can climb
--     Clamshell -> Glute Bridge -> Single-Leg Bridge -> Hip Thrust across weeks.
--
-- Changes:
--   1. Soft-delete 5 redundant bodyweight exercises (all unfilmed, all covered by
--      a filmed or kept alternative).
--   2. Insert 6 new exercises (IDs ..0031-..0036) to deepen tiers.
--   3. Dosing fixes: McGill isometric holds; Dead Bug to slow reps; load guidance
--      appended to loaded-exercise instructions; DB RDL reclassified to hip_hinge.
--   4. Rebuild exercise_replacement_groups as intensity ladders.
--
-- // HUMAN INPUT NEEDED: calibrate effectiveness / fatigue_cost / goals_weight for
--    the 6 new exercises with a licensed PT before launch. Values are evidence-informed
--    but not clinically validated by a practitioner.

-- ============================================================================
-- 1. Soft-delete redundant bodyweight exercises
--    (kept in DB for historical plan snapshots; never assigned again)
-- ============================================================================
UPDATE public.exercises SET is_assignable = false WHERE id IN (
  'cccc0001-0000-0000-0000-000000000005', -- Knee-to-Chest        (Child's Pose covers flexion relief)
  'cccc0001-0000-0000-0000-000000000021', -- Pelvic Tilt          (Cat-Cow covers gentle lumbar mobility)
  'cccc0001-0000-0000-0000-000000000023', -- Supine Trunk Rotation (Open-Book covers rotation)
  'cccc0001-0000-0000-0000-000000000024', -- Standing Back Extension (McKenzie Press-Up covers extension)
  'cccc0001-0000-0000-0000-000000000025'  -- Prone Hip Extension  (Clamshell/Glute Bridge cover activation)
);

-- ============================================================================
-- 2. New exercises (..0031-..0036)
-- ============================================================================
INSERT INTO public.exercises
  (id, name, description, sets, reps, duration_seconds, rest_seconds, video_url, instructions,
   equipment_tier, pain_areas, intensity_tier, movement_pattern, pain_types_safe,
   triggers_addressed, goals_weight, effectiveness, fatigue_cost, usefulness, aggravates,
   phase, duration_minutes_est)
VALUES

  -- reps + duration_seconds together = "reps of timed holds" (McGill-style dosing).
  ('cccc0001-0000-0000-0000-000000000031',
   'Side Plank (Full)',
   'Full side plank on the feet for lateral trunk endurance.',
   3, 4, 10, 30, NULL,
   'Lie on your side with legs straight, prop up on your forearm, and lift your hips to form a straight line from ankles to shoulders; hold 10 seconds per rep, then switch sides.',
   'open_space', ARRAY['lower','general']::text[], 4, 'spinal_stability', ARRAY['ache','stiffness','all']::text[],
   ARRAY['standing','exercise']::text[],
   '{"return_to_exercise":0.8,"reduce_pain":0.6}'::jsonb,
   4, 3, 4, ARRAY[]::text[], 'activation', 4),

  ('cccc0001-0000-0000-0000-000000000032',
   'Split Squat',
   'Staggered-stance squat for unilateral leg and hip strength.',
   3, 10, NULL, 45, NULL,
   'Stand in a staggered stance; lower your back knee toward the floor keeping your torso tall, then drive through the front heel to stand. Lower for 3 seconds each rep to increase difficulty without weight.',
   'open_space', ARRAY['lower','general']::text[], 3, 'lower_body_strength', ARRAY['ache','stiffness','all']::text[],
   ARRAY['exercise','standing']::text[],
   '{"return_to_exercise":0.8,"reduce_pain":0.4}'::jsonb,
   4, 3, 4, ARRAY[]::text[], 'strength', 5),

  ('cccc0001-0000-0000-0000-000000000033',
   'Banded Row',
   'Horizontal band pull for the mid/upper back and posture.',
   3, 12, NULL, 45, NULL,
   'Anchor a band at chest height (or loop it around your feet while seated), pull the handles to your lower ribs squeezing the shoulder blades, then release slowly. Use a band tension where the last 2 reps feel hard — about 2 reps in reserve.',
   'bands_dumbbells', ARRAY['upper','middle','general']::text[], 2, 'posterior_chain_strength', ARRAY['all']::text[],
   ARRAY['sitting']::text[],
   '{"return_to_exercise":0.7,"reduce_pain":0.5}'::jsonb,
   4, 2, 4, ARRAY[]::text[], 'strength', 4),

  ('cccc0001-0000-0000-0000-000000000034',
   'Suitcase Carry',
   'Single-side loaded carry for anti-lateral-flexion trunk strength.',
   3, NULL, 30, 45, NULL,
   'Hold a dumbbell in one hand at your side and walk tall for the set time without leaning; keep the opposite shoulder level, then switch hands. Choose a weight where staying upright is challenging but your form never breaks.',
   'bands_dumbbells', ARRAY['lower','general']::text[], 4, 'spinal_stability', ARRAY['ache','stiffness','all']::text[],
   ARRAY['standing','exercise']::text[],
   '{"return_to_exercise":0.9,"reduce_pain":0.5}'::jsonb,
   5, 3, 4, ARRAY[]::text[], 'activation', 4),

  ('cccc0001-0000-0000-0000-000000000035',
   'Kettlebell Deadlift',
   'Loaded hip hinge from the floor with a kettlebell.',
   3, 8, NULL, 90, NULL,
   'Stand over a kettlebell, hinge at the hips with a flat back, grip the handle, and stand tall by driving the hips forward, then lower under control. Choose a weight where the last 2 reps feel hard but your back stays neutral — about 2 reps in reserve.',
   'gym', ARRAY['lower','general']::text[], 4, 'hip_hinge', ARRAY['ache','all']::text[],
   ARRAY['bending','exercise']::text[],
   '{"return_to_exercise":0.9,"reduce_pain":0.5}'::jsonb,
   5, 4, 5, ARRAY[]::text[], 'strength', 6),

  ('cccc0001-0000-0000-0000-000000000036',
   'Back Extension (45°)',
   'Hip-hinge extension on a 45-degree bench for the posterior chain.',
   3, 10, NULL, 60, NULL,
   'Set up on a 45-degree bench with hips on the pad; hinge down with a neutral spine, then raise your torso until your body forms a straight line — avoid overextending. Add a light plate to your chest only when 10 controlled reps feel easy.',
   'gym', ARRAY['lower','general']::text[], 4, 'posterior_chain_strength', ARRAY['ache','all']::text[],
   ARRAY['bending','sitting']::text[],
   '{"return_to_exercise":0.8,"reduce_pain":0.6}'::jsonb,
   4, 3, 4, ARRAY[]::text[], 'strength', 5);

-- ============================================================================
-- 3. Dosing fixes on existing exercises
-- ============================================================================

-- McGill-style isometrics: reps x 8-10s holds instead of long continuous holds.
UPDATE public.exercises SET
  sets = 3, reps = 5, duration_seconds = 10, rest_seconds = 30,
  instructions = 'From hands and knees, extend the opposite arm and leg keeping your trunk still; hold 10 seconds, return, and switch sides each rep.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000006'; -- Bird Dog

UPDATE public.exercises SET
  sets = 3, reps = 4, duration_seconds = 10, rest_seconds = 30,
  instructions = 'On your side resting on a forearm and knees, lift the hips to form a straight line; hold 10 seconds per rep, then switch sides.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000009'; -- Side Plank (Knees)

-- Dead Bug: slow alternating reps (3s lowers), not a 45s continuous hold.
UPDATE public.exercises SET
  sets = 3, reps = 10, duration_seconds = NULL, rest_seconds = 20,
  instructions = 'On your back with knees at 90 degrees, brace gently and slowly lower the opposite arm and leg over 3 seconds while keeping the low back flat; alternate sides each rep.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000007'; -- Dead Bug

-- Load guidance for loaded exercises (double-progression cue; no schema change).
UPDATE public.exercises SET
  instructions = instructions || ' Use a band tension where the last 2 reps feel hard — about 2 reps in reserve.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000012'; -- Banded RDL

UPDATE public.exercises SET
  -- A dumbbell RDL is a hip hinge; the row/back-extension exercises own posterior chain.
  movement_pattern = 'hip_hinge',
  instructions = instructions || ' Choose a weight where the last 2 reps feel hard — about 2 reps in reserve; add weight once all sets feel controlled.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000013'; -- Dumbbell RDL

UPDATE public.exercises SET
  instructions = instructions || ' Choose a weight where the last 2 reps feel hard — about 2 reps in reserve; add weight once all sets feel controlled.'
  WHERE id IN (
    'cccc0001-0000-0000-0000-000000000014', -- Goblet Squat
    'cccc0001-0000-0000-0000-000000000015', -- Barbell Hip Thrust
    'cccc0001-0000-0000-0000-000000000016', -- Seated Cable Row
    'cccc0001-0000-0000-0000-000000000017'  -- Leg Press
  );

-- ============================================================================
-- 4. Rebuild replacement pools as strict intensity ladders
--    priority order == intensity ladder (lower priority = gentler entry point).
--    The engine climbs these as the weekly session intensity target rises.
-- ============================================================================
DELETE FROM public.exercise_replacement_groups;

INSERT INTO public.exercise_replacement_groups (movement_pattern, exercise_id, priority)
VALUES
  -- Mobility (single-entry pools after redundancy cuts)
  ('lumbar_mobility',   'cccc0001-0000-0000-0000-000000000001', 10), -- Cat-Cow (t1)
  ('lumbar_extension',  'cccc0001-0000-0000-0000-000000000022', 10), -- McKenzie Press-Up (t1)
  ('thoracic_mobility', 'cccc0001-0000-0000-0000-000000000002', 10), -- Thoracic Extension (t1)
  ('thoracic_mobility', 'cccc0001-0000-0000-0000-000000000003', 20), -- Open-Book Rotation (t1)
  ('hip_mobility',      'cccc0001-0000-0000-0000-000000000004', 10), -- Hip Flexor Stretch (t1)

  -- Core activation
  ('core_activation',   'cccc0001-0000-0000-0000-000000000007', 10), -- Dead Bug (t2)

  -- Glute activation ladder: t1 -> t2 -> t2 band -> t3 -> t4 gym
  ('glute_activation',  'cccc0001-0000-0000-0000-000000000027', 10), -- Clamshell (t1)
  ('glute_activation',  'cccc0001-0000-0000-0000-000000000008', 20), -- Glute Bridge (t2)
  ('glute_activation',  'cccc0001-0000-0000-0000-000000000010', 30), -- Banded Clamshell (t2)
  ('glute_activation',  'cccc0001-0000-0000-0000-000000000026', 40), -- Single-Leg Glute Bridge (t3)
  ('glute_activation',  'cccc0001-0000-0000-0000-000000000015', 50), -- Barbell Hip Thrust (t4)

  -- Spinal stability ladder: t2 -> t3 -> t4 -> t4 loaded carry
  ('spinal_stability',  'cccc0001-0000-0000-0000-000000000006', 10), -- Bird Dog (t2)
  ('spinal_stability',  'cccc0001-0000-0000-0000-000000000009', 20), -- Side Plank Knees (t3)
  ('spinal_stability',  'cccc0001-0000-0000-0000-000000000031', 30), -- Side Plank Full (t4)
  ('spinal_stability',  'cccc0001-0000-0000-0000-000000000034', 40), -- Suitcase Carry (t4)

  -- Hip hinge ladder: t2 pattern -> t3 unilateral -> t3 band -> t4 DB -> t4 KB
  ('hip_hinge',         'cccc0001-0000-0000-0000-000000000011', 10), -- BW Hip Hinge (t2)
  ('hip_hinge',         'cccc0001-0000-0000-0000-000000000029', 20), -- Single-Leg RDL (t3)
  ('hip_hinge',         'cccc0001-0000-0000-0000-000000000012', 30), -- Banded RDL (t3)
  ('hip_hinge',         'cccc0001-0000-0000-0000-000000000013', 40), -- Dumbbell RDL (t4)
  ('hip_hinge',         'cccc0001-0000-0000-0000-000000000035', 50), -- Kettlebell Deadlift (t4)

  -- Lower body strength ladder: t2 -> t3 unilateral -> t3 loaded -> t4 machine
  ('lower_body_strength', 'cccc0001-0000-0000-0000-000000000028', 10), -- BW Squat (t2)
  ('lower_body_strength', 'cccc0001-0000-0000-0000-000000000032', 20), -- Split Squat (t3)
  ('lower_body_strength', 'cccc0001-0000-0000-0000-000000000014', 30), -- Goblet Squat (t3)
  ('lower_body_strength', 'cccc0001-0000-0000-0000-000000000017', 40), -- Leg Press (t4)

  -- Posterior chain ladder: t2 band -> t3 cable -> t4 bench
  ('posterior_chain_strength', 'cccc0001-0000-0000-0000-000000000033', 10), -- Banded Row (t2)
  ('posterior_chain_strength', 'cccc0001-0000-0000-0000-000000000016', 20), -- Seated Cable Row (t3)
  ('posterior_chain_strength', 'cccc0001-0000-0000-0000-000000000036', 30), -- Back Extension 45° (t4)

  -- Recovery
  ('stretch_recovery',  'cccc0001-0000-0000-0000-000000000018', 10), -- Child's Pose (t1)
  ('stretch_recovery',  'cccc0001-0000-0000-0000-000000000019', 20), -- Figure-4 (t1)
  ('stretch_recovery',  'cccc0001-0000-0000-0000-000000000030', 30); -- Hamstring Stretch (t1)
