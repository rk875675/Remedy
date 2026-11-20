-- 093_exercise_pattern_gaps.sql
-- Fill the movement patterns v2 already asks for.
-- Re-enable Pelvic Tilt and Knee-to-Chest as lumbar_flexion.
-- Insert the next ten catalog rows (..0037-..0046). video_url stays NULL.
-- Tag two existing details. Teaching copy is new rows only.

-- ============================================================================
-- 1. Re-enable lumbar flexion
-- ============================================================================
UPDATE public.exercises SET
  is_assignable = true,
  movement_pattern = 'lumbar_flexion',
  sets = 2,
  reps = 10,
  duration_seconds = NULL,
  rest_seconds = 15,
  equipment_tier = 'open_space',
  pain_areas = ARRAY['lower','general']::text[],
  intensity_tier = 1
  WHERE id = 'cccc0001-0000-0000-0000-000000000021'; -- Pelvic Tilt

UPDATE public.exercises SET
  is_assignable = true,
  movement_pattern = 'lumbar_flexion',
  sets = 2,
  reps = NULL,
  duration_seconds = 30,
  rest_seconds = 15,
  equipment_tier = 'open_space',
  pain_areas = ARRAY['lower','general']::text[],
  intensity_tier = 1
  WHERE id = 'cccc0001-0000-0000-0000-000000000005'; -- Knee-to-Chest

-- ============================================================================
-- 2. New exercises (..0037-..0046)
-- ============================================================================
INSERT INTO public.exercises
  (id, name, description, sets, reps, duration_seconds, rest_seconds, video_url, instructions,
   equipment_tier, pain_areas, intensity_tier, movement_pattern, pain_types_safe,
   triggers_addressed, goals_weight, effectiveness, fatigue_cost, usefulness, aggravates,
   phase, duration_minutes_est)
VALUES

  ('cccc0001-0000-0000-0000-000000000037',
   'Seated Sciatic Nerve Slider',
   'Seated knee and neck motion that slides the sciatic nerve through a short range.',
   2, 10, NULL, 15, NULL,
   'Sit tall on a chair. Straighten one knee and look up, then bend the knee and look down. Keep the range small, short of a stretch, then switch legs.',
   'open_space', ARRAY['lower','general']::text[], 1, 'nerve_glide', ARRAY['all']::text[],
   ARRAY['sitting','bending']::text[],
   '{"reduce_pain":0.7,"mobility":0.6}'::jsonb,
   4, 1, 4, ARRAY[]::text[], 'mobility', 4),

  ('cccc0001-0000-0000-0000-000000000038',
   'Side-Lying Hip Abduction',
   'Side-lying leg lift for the hip abductors, with the hips stacked.',
   3, 12, NULL, 30, NULL,
   'Lie on your side with hips stacked. Lift the top leg a short way, toes forward, then lower slowly. Switch sides.',
   'open_space', ARRAY['lower','general']::text[], 2, 'hip_abduction', ARRAY['ache','stiffness','all']::text[],
   ARRAY['standing','walking']::text[],
   '{"reduce_pain":0.6,"return_to_exercise":0.7}'::jsonb,
   4, 2, 4, ARRAY[]::text[], 'activation', 4),

  ('cccc0001-0000-0000-0000-000000000039',
   'Banded Lateral Walk',
   'Side steps against a band to load both hip abductors.',
   3, 10, NULL, 30, NULL,
   'Stand with a band above the knees, soft knees, and step sideways while keeping the hips level and the band under light tension.',
   'bands_dumbbells', ARRAY['lower','general']::text[], 3, 'hip_abduction', ARRAY['ache','stiffness','all']::text[],
   ARRAY['standing','walking']::text[],
   '{"reduce_pain":0.5,"return_to_exercise":0.7}'::jsonb,
   4, 2, 4, ARRAY[]::text[], 'activation', 4),

  ('cccc0001-0000-0000-0000-000000000040',
   'Plank Shoulder Taps',
   'Plank with a hand tap to the opposite shoulder, hips staying still.',
   2, 8, NULL, 30, NULL,
   'Hold a plank on your hands, feet a little wide. Tap one hand to the opposite shoulder and set it down without rocking the hips, then switch.',
   'open_space', ARRAY['lower','general']::text[], 2, 'anti_rotation', ARRAY['ache','stiffness','all']::text[],
   ARRAY['standing','exercise']::text[],
   '{"reduce_pain":0.7,"return_to_exercise":0.6}'::jsonb,
   4, 2, 4, ARRAY[]::text[], 'activation', 4),

  ('cccc0001-0000-0000-0000-000000000041',
   'Pallof Press',
   'Band press away from the chest while the trunk resists the twist.',
   3, 8, NULL, 30, NULL,
   'Stand sideways to a band anchored at chest height. Hold it at your chest and press the hands straight out without letting the band turn you, then return. Switch sides.',
   'bands_dumbbells', ARRAY['lower','general']::text[], 3, 'anti_rotation', ARRAY['ache','stiffness','all']::text[],
   ARRAY['exercise','standing']::text[],
   '{"reduce_pain":0.5,"return_to_exercise":0.8}'::jsonb,
   4, 2, 4, ARRAY[]::text[], 'activation', 4),

  ('cccc0001-0000-0000-0000-000000000042',
   'Wall Angel',
   'Arms slide up a wall to move the shoulder blades with the back supported.',
   2, 10, NULL, 30, NULL,
   'Stand with your back against a wall and slide the arms up and down, stopping before the low back arches.',
   'open_space', ARRAY['upper','general']::text[], 1, 'scapular', ARRAY['all']::text[],
   ARRAY['sitting']::text[],
   '{"reduce_pain":0.6,"mobility":0.7}'::jsonb,
   4, 1, 4, ARRAY[]::text[], 'activation', 3),

  ('cccc0001-0000-0000-0000-000000000043',
   'Band Pull-Apart',
   'Horizontal band pull that squeezes the shoulder blades.',
   3, 12, NULL, 45, NULL,
   'Hold a band in front of you at shoulder height and pull it apart by squeezing the shoulder blades, then return slowly.',
   'bands_dumbbells', ARRAY['upper','general']::text[], 2, 'scapular', ARRAY['ache','stiffness','all']::text[],
   ARRAY['sitting']::text[],
   '{"reduce_pain":0.5,"return_to_exercise":0.7}'::jsonb,
   4, 2, 4, ARRAY[]::text[], 'strength', 4),

  ('cccc0001-0000-0000-0000-000000000044',
   'Sit-to-Stand',
   'Stand up from a chair and sit back down with the legs doing the work.',
   2, 10, NULL, 30, NULL,
   'Sit at the front of a sturdy chair, feet flat. Stand up through your feet, then sit back down with control.',
   'open_space', ARRAY['lower','general']::text[], 2, 'functional', ARRAY['ache','stiffness','all']::text[],
   ARRAY['sitting','standing']::text[],
   '{"reduce_pain":0.5,"return_to_exercise":0.7}'::jsonb,
   4, 2, 5, ARRAY[]::text[], 'strength', 3),

  ('cccc0001-0000-0000-0000-000000000045',
   'Step-Up',
   'Step onto a stair or sturdy step, driving through one leg.',
   3, 8, NULL, 45, NULL,
   'Place one whole foot on a sturdy step. Drive through that heel to stand on the step, then step down with control. Switch legs.',
   'open_space', ARRAY['lower','general']::text[], 3, 'functional', ARRAY['ache','stiffness','all']::text[],
   ARRAY['exercise','standing']::text[],
   '{"reduce_pain":0.4,"return_to_exercise":0.8}'::jsonb,
   4, 3, 4, ARRAY[]::text[], 'strength', 5),

  ('cccc0001-0000-0000-0000-000000000046',
   '90-90 Breathing',
   'Quiet breathing on the back with hips and knees bent, feet supported.',
   2, NULL, 60, 15, NULL,
   'Lie on your back with your feet up on a chair so the hips and knees are about 90 degrees. Breathe in through the nose and let the belly and side ribs rise, then breathe out slowly.',
   'open_space', ARRAY['lower','upper','general']::text[], 1, 'breathing', ARRAY['all']::text[],
   ARRAY['morning','sitting']::text[],
   '{"reduce_pain":0.6,"sleep":0.7,"mobility":0.4}'::jsonb,
   3, 1, 4, ARRAY[]::text[], 'recovery', 3);

-- ============================================================================
-- 3. Contra tags on two existing details
-- ============================================================================
UPDATE public.exercise_details
SET contra = contra || ARRAY['flexion_loaded']::text[]
WHERE exercise_id = 'cccc0001-0000-0000-0000-000000000014' -- Goblet Squat
  AND NOT ('flexion_loaded' = ANY (contra));

UPDATE public.exercise_details
SET contra = contra || ARRAY['balance_challenge']::text[]
WHERE exercise_id = 'cccc0001-0000-0000-0000-000000000026' -- Single-Leg Glute Bridge
  AND NOT ('balance_challenge' = ANY (contra));

-- ============================================================================
-- 4. Teaching rows for the new exercises
-- ============================================================================
INSERT INTO public.exercise_details (
  exercise_id,
  slug,
  dose_class,
  spine_bias,
  contra,
  function_targets,
  per_side,
  steps,
  feel,
  mistakes,
  tempo,
  tempo_pattern,
  breathing,
  easier,
  harder,
  purpose
) VALUES
  (
    'cccc0001-0000-0000-0000-000000000037',
    'seated-sciatic-nerve-slider',
    'neural_mobilization',
    'neutral',
    '{}'::text[],
    ARRAY['sitting','bending','walking']::text[],
    true,
    ARRAY['Sit tall on a chair, one foot on the floor.','Straighten that knee and look up at the same time.','Bend the knee and look down.','Keep the motion small and smooth. It should not feel like a stretch.','Finish your reps, then switch legs.']::text[],
    'A gentle movement behind the knee or in the back of the thigh. Not tingling that lingers, and not a sharp pain.',
    ARRAY['Pushing into a hamstring stretch. Keep the range small.','Tipping the low back forward and back. Stay tall and move from the neck and the knee.','Continuing if tingling or pain travels down the leg. Ease off.']::text[],
    'Straighten and look up, then bend and look down, about 2 seconds each way',
    ARRAY[2,2]::int[],
    'Breathe normally. Do not hold your breath.',
    'Use a smaller knee movement, and keep the head still if looking up bothers the neck.',
    'Sit a little taller and straighten the knee a bit more, still short of a stretch.',
    'Slides the sciatic nerve through a short, easy range so it moves without a stretch.'
  ),
  (
    'cccc0001-0000-0000-0000-000000000038',
    'side-lying-hip-abduction',
    'strength_endurance',
    'neutral',
    '{}'::text[],
    ARRAY['walking','stairs','standing']::text[],
    true,
    ARRAY['Lie on your side, head supported, hips stacked, bottom knee bent a little.','Keep the top leg straight and the toes pointing forward.','Lift the top leg a short way, without rolling the hip back.','Pause, then lower slowly.','Finish your reps, then switch sides.']::text[],
    'The side of the top hip working. Not the low back, and not the front of the hip.',
    ARRAY['Rolling the top hip back to lift higher. Keep the hips stacked.','Lifting so high the low back arches. A small lift is enough.','Pointing the toes up. Keep them facing forward.']::text[],
    'Lift, pause, then lower slowly',
    '{}'::int[],
    'Breathe out as you lift, in as you lower.',
    'Bend the top knee and lift only a few inches.',
    'Slow the lower, and keep the hips stacked the whole way.',
    'Strengthens the side of the hip that keeps the pelvis level when you stand and walk.'
  ),
  (
    'cccc0001-0000-0000-0000-000000000039',
    'banded-lateral-walk',
    'strength_endurance',
    'neutral',
    ARRAY['balance_challenge']::text[],
    ARRAY['walking','stairs','standing']::text[],
    false,
    ARRAY['Loop a band just above the knees.','Stand with a soft knee bend and the feet about hip-width apart.','Step sideways, keeping light tension on the band and the hips level.','Bring the other foot in, without letting the knees collapse.','Take the steps one way, then come back the other way.']::text[],
    'The sides of the hips working. The knees stay out over the toes.',
    ARRAY['Letting the knees cave in. Keep them lined up with the toes.','Leaning the trunk side to side. Stay tall and move the feet.','Taking steps so big the band goes slack. Keep light tension.']::text[],
    'Step, then bring the feet back under you with control',
    '{}'::int[],
    'Breathe normally as you step. Do not hold your breath.',
    'Use a lighter band and keep it above the knees.',
    'Slow each step, or move a light band down toward the ankles.',
    'Loads the side of the hips while you stay tall, so the pelvis stays level as you step.'
  ),
  (
    'cccc0001-0000-0000-0000-000000000040',
    'plank-shoulder-taps',
    'motor_control',
    'neutral',
    '{}'::text[],
    ARRAY['bending','standing','exercise']::text[],
    true,
    ARRAY['Set up in a plank on your hands, or on your knees if that keeps the back flat.','Place the hands under the shoulders and the feet a little wider than the hips.','Brace the stomach and tap one hand to the opposite shoulder.','Put the hand back, then tap the other shoulder.','Keep the hips from rocking. Each tap is one rep.']::text[],
    'The stomach and the shoulders working to keep the body still. Not the low back sagging.',
    ARRAY['Rocking the hips as the hand lifts. Widen the feet and move slower.','Letting the hips pike up. Keep a straight line from head to knees or heels.','Holding the breath. Breathe out as you tap.']::text[],
    'Tap over 2 seconds, then set the hand down',
    ARRAY[2]::int[],
    'Breathe out as you tap, in as the hand returns.',
    'Drop to the knees, and widen the feet.',
    'Bring the feet a little closer, still without the hips rocking.',
    'Trains the trunk to stay still while one hand leaves the floor.'
  ),
  (
    'cccc0001-0000-0000-0000-000000000041',
    'pallof-press',
    'motor_control',
    'neutral',
    '{}'::text[],
    ARRAY['twisting','standing','exercise']::text[],
    true,
    ARRAY['Anchor a band at chest height and stand sideways to it.','Hold the band at the chest with both hands, and stand tall.','Press the hands straight out, and do not let the band twist you.','Pause, then bring the hands back to the chest.','Finish the reps, then turn and face the other way.']::text[],
    'The trunk working to keep you facing forward. Not a turn through the low back.',
    ARRAY['Letting the band rotate you as the arms straighten. Use a lighter band.','Arching the low back to press. Keep the ribs down and stand tall.','Holding the press so long that you start to twist. Keep the pause short.']::text[],
    'Press out, pause, then return to the chest',
    '{}'::int[],
    'Breathe out as you press, in as the hands come back.',
    'Stand closer to the anchor, or use a lighter band, and press only part of the way.',
    'Step a little farther from the anchor, and still keep the chest facing forward.',
    'Teaches the trunk to resist a twist while the arms press out.'
  ),
  (
    'cccc0001-0000-0000-0000-000000000042',
    'wall-angel',
    'strength_endurance',
    'neutral',
    '{}'::text[],
    ARRAY['sitting','overhead']::text[],
    false,
    ARRAY['Stand with the back, hips, and the back of the head against a wall.','Bend the elbows and rest the arms on the wall in a goal-post shape.','Slowly slide the arms up, keeping them on the wall if you can.','Stop before the low back arches or the ribs flare.','Slide the arms back down.']::text[],
    'Between the shoulder blades and across the upper back. Not a pinch in the low back.',
    ARRAY['Arching the low back to keep the arms on the wall. Step the feet forward and use a smaller slide.','Shrugging toward the ears. Keep the shoulders down as the arms rise.','Forcing the arms flat when they will not stay there. Let them come off a little rather than arch.']::text[],
    'Slide up, pause, then slide down',
    '{}'::int[],
    'Breathe in as the arms rise, out as they lower.',
    'Bring the feet a step forward and slide only as high as the ribs stay down.',
    'Keep the arms on the wall a little higher, still without arching the low back.',
    'Opens the upper back and trains the shoulder blades to move up and down the wall.'
  ),
  (
    'cccc0001-0000-0000-0000-000000000043',
    'band-pull-apart',
    'strength_endurance',
    'neutral',
    '{}'::text[],
    ARRAY['sitting','overhead','exercise']::text[],
    false,
    ARRAY['Hold a band in front of you at shoulder height, arms straight, palms down.','Stand or sit tall, with a soft bend in the elbows.','Pull the band apart by squeezing the shoulder blades together.','Pause, then let the hands come back together slowly.']::text[],
    'Between the shoulder blades and across the back of the shoulders. Not the neck.',
    ARRAY['Shrugging toward the ears. Keep the shoulders down as you pull.','Arching the low back to finish the pull. Stay tall and still.','Bending the elbows a lot. The pull comes from the shoulder blades.']::text[],
    'Pull apart, squeeze, then return slowly',
    '{}'::int[],
    'Breathe out as you pull, in as the hands come together.',
    'Use a lighter band, and pull only as far as you can stay tall.',
    'Use a slightly heavier band, and pause one breath longer at the squeeze.',
    'Strengthens the muscles between the shoulder blades that help you sit and stand tall.'
  ),
  (
    'cccc0001-0000-0000-0000-000000000044',
    'sit-to-stand',
    'strength_endurance',
    'neutral',
    '{}'::text[],
    ARRAY['sitting','standing','stairs']::text[],
    false,
    ARRAY['Sit toward the front of a sturdy chair, feet flat, about hip-width apart.','Lean the chest forward a little and keep the back long.','Push through the feet to stand up tall.','Sit back down with control, reaching the hips back to the chair.']::text[],
    'The thighs and glutes doing the work. The back stays long, not rounded.',
    ARRAY['Using the hands to push off when you do not need them. Let the legs do it.','Dropping into the chair. Lower with control.','Rounding the low back as you sit. Keep the chest tall.']::text[],
    'Stand up, then sit down with control',
    '{}'::int[],
    'Breathe out as you stand, in as you sit.',
    'Raise the seat with a cushion, or use the hands on the chair at first.',
    'Take the hands off the chair, or pause just above the seat before you sit.',
    'Practices standing up from a chair, using the legs so the back does less of the work.'
  ),
  (
    'cccc0001-0000-0000-0000-000000000045',
    'step-up',
    'strength_endurance',
    'neutral',
    ARRAY['balance_challenge']::text[],
    ARRAY['stairs','walking','exercise']::text[],
    true,
    ARRAY['Stand facing a sturdy step or the bottom stair.','Place one whole foot on the step.','Drive through that heel to stand up on the step, and bring the other foot up.','Step back down with control.','Finish the reps, then switch legs.']::text[],
    'The thigh and glute of the leg on the step. The knee tracks over the toes.',
    ARRAY['Pushing off the back foot. Let the foot on the step do the work.','Letting the knee cave in. Keep it lined up with the toes.','Using a step so high you have to hop. Choose a lower step.']::text[],
    'Drive up, then step down with control',
    '{}'::int[],
    'Breathe out as you step up, in as you step down.',
    'Use a lower step, and hold a wall or rail for balance.',
    'Use a slightly higher step, still one you can drive up without a hop.',
    'Builds the strength to climb a step, one leg at a time.'
  ),
  (
    'cccc0001-0000-0000-0000-000000000046',
    '90-90-breathing',
    'breathing',
    'neutral',
    '{}'::text[],
    ARRAY['bed','sleep','sitting']::text[],
    false,
    ARRAY['Lie on your back with the feet up on a chair, so the hips and knees are about 90 degrees.','Rest one hand on the chest and the other on the belly.','Breathe in through the nose and let the belly and the sides of the ribs rise.','Breathe out slowly and let the ribs soften down.','Keep the neck and the low back relaxed.']::text[],
    'The breath moving into the belly and the sides of the ribs. The low back stays quiet on the floor.',
    ARRAY['Shrugging the shoulders or lifting the chest hard. Keep the neck relaxed.','Breathing so fast the belly barely moves. Slow the breath down.','Pushing the low back into the floor. Let it rest.']::text[],
    'Breathe in, then a slow breath out',
    '{}'::int[],
    'In through the nose, out slowly through the mouth.',
    'Put a pillow under the head, and keep the breaths smaller.',
    'Make the breath out a little longer, still relaxed.',
    'A quiet breathing drill that lets the ribs and the low back settle.'
  )
ON CONFLICT (exercise_id) DO UPDATE SET
  slug = excluded.slug,
  dose_class = excluded.dose_class,
  spine_bias = excluded.spine_bias,
  contra = excluded.contra,
  function_targets = excluded.function_targets,
  per_side = excluded.per_side,
  steps = excluded.steps,
  feel = excluded.feel,
  mistakes = excluded.mistakes,
  tempo = excluded.tempo,
  tempo_pattern = excluded.tempo_pattern,
  breathing = excluded.breathing,
  easier = excluded.easier,
  harder = excluded.harder,
  purpose = excluded.purpose,
  updated_at = now();
