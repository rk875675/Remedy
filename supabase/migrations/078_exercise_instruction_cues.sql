-- 078_exercise_instruction_cues.sql
-- Rewrite session-player grey captions (`exercises.instructions`) as one
-- mid-rep cue. Video owns setup; the green dose line owns sets/reps/holds.
-- Target 70–95 characters, hard cap 120. Loaded work keeps PRD "last 2
-- hard" as plain language. Same voice on unassignable rows so frozen
-- snapshots that still join them are not left on the old setup paragraphs.

-- ============================================================================
-- 1. Assignable catalog (current player)
-- ============================================================================

UPDATE public.exercises SET instructions =
  'Inhale and arch; exhale and round. Let your head follow your spine.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000001'; -- Cat-Cow Stretch

UPDATE public.exercises SET instructions =
  'Hands behind your head. Arch only the upper back over the chair — not the low back.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000002'; -- Thoracic Extension (Chair-Assisted)

UPDATE public.exercises SET instructions =
  'Keep both knees stacked. Open the top arm and let your eyes follow your hand.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000003'; -- Open-Book Rotation

UPDATE public.exercises SET instructions =
  'Tall spine. Tuck the back hip under, then shift forward until the front of that hip stretches.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000004'; -- Standing Hip Flexor Stretch

UPDATE public.exercises SET instructions =
  'Reach opposite arm and leg. Keep the back still and the hips level.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000006'; -- Bird Dog

UPDATE public.exercises SET instructions =
  'Lower opposite arm and leg over 3 seconds. If the low back lifts, use a smaller range.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000007'; -- Dead Bug

UPDATE public.exercises SET instructions =
  'Drive through your heels and squeeze. Keep the ribs down — don''t arch the low back.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000008'; -- Glute Bridge

UPDATE public.exercises SET instructions =
  'Lift the hips so ear, shoulder, hip, and knee line up. Don''t let the hips sag.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000009'; -- Side Plank (Knees)

UPDATE public.exercises SET instructions =
  'Push the hips back, not the knees forward. Keep a long back and soft knees.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000011'; -- Bodyweight Hip Hinge

UPDATE public.exercises SET instructions =
  'Hinge at the hips, not the waist. Feel the hamstrings, then stand. Last 2 should feel hard.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000012'; -- Banded Romanian Deadlift

UPDATE public.exercises SET instructions =
  'Hinge with a long back. Lower for 3 seconds, then stand. Last 2 reps should feel hard.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000013'; -- Dumbbell Romanian Deadlift

UPDATE public.exercises SET instructions =
  'Chest tall, elbows inside the knees. Last 2 reps should feel hard.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000014'; -- Goblet Squat

UPDATE public.exercises SET instructions =
  'Drive the hips up until they lock out. Don''t arch the low back. Last 2 should feel hard.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000015'; -- Barbell Hip Thrust

UPDATE public.exercises SET instructions =
  'Sit tall. Pull by squeezing the shoulder blades — don''t lean back. Last 2 should feel hard.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000016'; -- Seated Cable Row

UPDATE public.exercises SET instructions =
  'Feet flat, push through mid-foot. Don''t let the low back curl at the bottom. Last 2 should feel hard.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000017'; -- Leg Press

UPDATE public.exercises SET instructions =
  'Sit back toward your heels, arms long, forehead down. Breathe into the stretch.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000018'; -- Child's Pose Hold

UPDATE public.exercises SET instructions =
  'Cross ankle over opposite knee. Gently pull the uncrossed thigh toward you.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000019'; -- Supine Figure-4 Stretch

UPDATE public.exercises SET instructions =
  'Hips stay on the floor. Press the chest up fully, pause, then lower slowly.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000022'; -- McKenzie Press-Up

UPDATE public.exercises SET instructions =
  'Drive through the planted heel. Keep both hips level at the top — don''t let one drop.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000026'; -- Single-Leg Glute Bridge

UPDATE public.exercises SET instructions =
  'Sit the hips back, chest tall, weight in mid-foot. Knees track over the toes.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000028'; -- Bodyweight Squat

UPDATE public.exercises SET instructions =
  'Hinge at the hip, not the waist. Free leg reaches straight back; keep the back long.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000029'; -- Single-Leg Romanian Deadlift

UPDATE public.exercises SET instructions =
  'Hold behind the thigh and straighten the knee until you feel a pull, not a burn.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000030'; -- Supine Hamstring Stretch

UPDATE public.exercises SET instructions =
  'Straight line from ankles to shoulders. Lift the hips — don''t sag or pike.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000031'; -- Side Plank (Full)

UPDATE public.exercises SET instructions =
  'Torso tall. Lower the back knee straight down over 3 seconds, then drive through the front heel.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000032'; -- Split Squat

UPDATE public.exercises SET instructions =
  'Pull to the lower ribs and squeeze the shoulder blades. Last 2 reps should feel hard.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000033'; -- Banded Row

UPDATE public.exercises SET instructions =
  'Walk tall. Keep both shoulders level — don''t lean toward or away from the weight.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000034'; -- Suitcase Carry

UPDATE public.exercises SET instructions =
  'Hinge, grip, stand by driving the hips forward. Keep a flat back. Last 2 should feel hard.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000035'; -- Kettlebell Deadlift

UPDATE public.exercises SET instructions =
  'Hinge down, then rise until the body is one line. Stop at straight — don''t arch past it.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000036'; -- Back Extension (45°)

-- ============================================================================
-- 2. Unassignable / legacy rows (frozen snapshots can still join these)
-- ============================================================================

UPDATE public.exercises SET instructions =
  'Gently draw the knee toward your chest. Stop at a stretch, not a pinch.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000005'; -- Knee-to-Chest

UPDATE public.exercises SET instructions =
  'Keep the hips stacked. Open the top knee against the band — don''t roll the pelvis back.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000010'; -- Banded Clamshell

UPDATE public.exercises SET instructions =
  'Curl the shoulders up, then lower slowly. Stop if the low back pinches.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000020'; -- Weighted Sit-Up

UPDATE public.exercises SET instructions =
  'Gently flatten the low back into the floor, then release. Small motion — don''t push into pain.'
  WHERE id IN (
    'cccc0001-0000-0000-0000-000000000021', -- Pelvic Tilt (catalog)
    'cccc0001-0001-0001-0001-000000000001'  -- Pelvic Tilt (legacy)
  );

UPDATE public.exercises SET instructions =
  'Knees together, lower both to one side. Shoulders stay down. Return and switch.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000023'; -- Supine Trunk Rotation

UPDATE public.exercises SET instructions =
  'Hands on the low back. Gently bend backward, then return tall. Stop if it pinches.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000024'; -- Standing Back Extension

UPDATE public.exercises SET instructions =
  'Squeeze the glute and lift one straight leg a few inches. Keep the hips on the floor.'
  WHERE id = 'cccc0001-0000-0000-0000-000000000025'; -- Prone Hip Extension

UPDATE public.exercises SET instructions =
  'Keep the hips stacked. Open the top knee — don''t roll the pelvis back.'
  WHERE id IN (
    'cccc0001-0000-0000-0000-000000000027', -- Clamshell
    'cccc0001-0001-0001-0001-000000000004'  -- Side-Lying Clam
  );

UPDATE public.exercises SET instructions =
  'Inhale and arch; exhale and round. Let your head follow your spine.'
  WHERE id = 'bbbb0001-0001-0001-0001-000000000001'; -- Cat-Cow Stretch (legacy)

UPDATE public.exercises SET instructions =
  'Reach opposite arm and leg. Keep the back still and the hips level.'
  WHERE id = 'bbbb0001-0001-0001-0001-000000000002'; -- Bird Dog (legacy)

UPDATE public.exercises SET instructions =
  'Drive through your heels and squeeze. Keep the ribs down — don''t arch the low back.'
  WHERE id = 'bbbb0001-0001-0001-0001-000000000003'; -- Glute Bridge (legacy)

UPDATE public.exercises SET instructions =
  'Lower opposite arm and leg slowly. If the low back lifts, use a smaller range.'
  WHERE id = 'bbbb0001-0001-0001-0001-000000000004'; -- Dead Bug (legacy 45s hold)

UPDATE public.exercises SET instructions =
  'Sit back toward your heels, arms long, forehead down. Breathe into the stretch.'
  WHERE id = 'bbbb0001-0001-0001-0001-000000000005'; -- Child's Pose Hold (legacy)

UPDATE public.exercises SET instructions =
  'Tall spine. Tuck the back hip under, then shift forward until the front of that hip stretches.'
  WHERE id = 'cccc0001-0001-0001-0001-000000000002'; -- Hip Flexor Stretch (legacy)

UPDATE public.exercises SET instructions =
  'Drive through the planted heel. Keep both hips level at the top — don''t let one drop.'
  WHERE id = 'cccc0001-0001-0001-0001-000000000003'; -- Single-Leg Glute Bridge (legacy)
