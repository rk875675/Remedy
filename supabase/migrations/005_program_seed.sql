-- 005_program_seed.sql
-- Add difficulty column, complete Week 1 + Week 2 sessions, and auto-assign to existing users.
-- All INSERTs are idempotent (ON CONFLICT DO NOTHING) so this is safe if 002 already ran.

-- ---------------------------------------------------------------------------
-- 1. Add difficulty column to programs (idempotent)
-- ---------------------------------------------------------------------------
ALTER TABLE public.programs ADD COLUMN IF NOT EXISTS difficulty text;

-- ---------------------------------------------------------------------------
-- 2. Program (upsert difficulty so it's set whether or not 002 ran)
-- ---------------------------------------------------------------------------
INSERT INTO public.programs (id, name, description, duration_weeks, sessions_per_week, target_activity_levels, difficulty)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Back Pain Relief Program',
  'A 5-week structured program to reduce back pain and build core stability.',
  5, 4,
  ARRAY['sedentary', 'light', 'active', 'athlete'],
  'beginner'
)
ON CONFLICT (id) DO UPDATE SET difficulty = 'beginner';

-- ---------------------------------------------------------------------------
-- 3. Week 1 sessions (idempotent)
-- ---------------------------------------------------------------------------
INSERT INTO public.program_sessions (id, program_id, week_number, session_number, title, duration_minutes) VALUES
  ('aaaa0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 1, 1, 'Foundation & Mobility', 18),
  ('aaaa0001-0001-0001-0001-000000000002', '11111111-1111-1111-1111-111111111111', 1, 2, 'Core Activation', 20),
  ('aaaa0001-0001-0001-0001-000000000003', '11111111-1111-1111-1111-111111111111', 1, 3, 'Gentle Strength', 18),
  ('aaaa0001-0001-0001-0001-000000000004', '11111111-1111-1111-1111-111111111111', 1, 4, 'Flexibility & Recovery', 15)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 4. Week 2 sessions (new)
-- ---------------------------------------------------------------------------
INSERT INTO public.program_sessions (id, program_id, week_number, session_number, title, duration_minutes) VALUES
  ('aaaa0002-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 2, 1, 'Core Progression', 18),
  ('aaaa0002-0001-0001-0001-000000000002', '11111111-1111-1111-1111-111111111111', 2, 2, 'Hip Mobility', 16),
  ('aaaa0002-0001-0001-0001-000000000003', '11111111-1111-1111-1111-111111111111', 2, 3, 'Strength & Stability', 20)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Exercises: Week 1 (idempotent — same IDs as 002)
-- ---------------------------------------------------------------------------
INSERT INTO public.exercises (id, name, sets, reps, duration_seconds, rest_seconds, video_url, instructions) VALUES
  ('bbbb0001-0001-0001-0001-000000000001', 'Cat-Cow Stretch',    3, 10, NULL, 20, NULL, 'Start on hands and knees. Inhale and arch your back, lifting your head. Exhale and round your spine, tucking your chin.'),
  ('bbbb0001-0001-0001-0001-000000000002', 'Bird Dog',           3,  8, NULL, 30, NULL, 'From hands and knees, extend your right arm forward and left leg back. Hold 2 seconds, return, and switch sides.'),
  ('bbbb0001-0001-0001-0001-000000000003', 'Glute Bridge',       3, 12, NULL, 30, NULL, 'Lie on your back with knees bent. Push through your heels to lift your hips until your body forms a straight line. Squeeze glutes at top.'),
  ('bbbb0001-0001-0001-0001-000000000004', 'Dead Bug',           3, NULL, 45, 20, NULL, 'Lie on your back with arms toward the ceiling and knees at 90 degrees. Slowly lower opposite arm and leg together, keeping your core pressed to the floor.'),
  ('bbbb0001-0001-0001-0001-000000000005', 'Child''s Pose Hold', 2, NULL, 30, 15, NULL, 'Kneel and sit back on your heels. Extend arms forward on the floor and breathe deeply into your lower back.')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. Exercises: Week 2 (new)
-- ---------------------------------------------------------------------------
INSERT INTO public.exercises (id, name, sets, reps, duration_seconds, rest_seconds, video_url, instructions) VALUES
  ('cccc0001-0001-0001-0001-000000000001', 'Pelvic Tilt',             3, 15, NULL, 20, NULL, 'Lie on your back with knees bent. Gently flatten your lower back against the floor by tightening your abs, then slowly release.'),
  ('cccc0001-0001-0001-0001-000000000002', 'Hip Flexor Stretch',      2, NULL, 30, 20, NULL, 'Kneel on one knee with the other foot forward. Shift your weight forward gently until you feel a stretch in the front of your hip. Switch sides.'),
  ('cccc0001-0001-0001-0001-000000000003', 'Single-Leg Glute Bridge', 3, 10, NULL, 30, NULL, 'Lie on your back with knees bent. Extend one leg straight, then drive through the planted heel to lift your hips. Keep your hips level throughout.'),
  ('cccc0001-0001-0001-0001-000000000004', 'Side-Lying Clam',         3, 12, NULL, 20, NULL, 'Lie on your side with knees bent and stacked. Keeping your feet together, rotate your top knee upward like a clamshell. Control the movement back down.')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. Session exercises: Week 1
-- Replace existing links so session 4 gets its 4th exercise (Pelvic Tilt).
-- ---------------------------------------------------------------------------
DELETE FROM public.session_exercises
WHERE session_id IN (
  'aaaa0001-0001-0001-0001-000000000001',
  'aaaa0001-0001-0001-0001-000000000002',
  'aaaa0001-0001-0001-0001-000000000003',
  'aaaa0001-0001-0001-0001-000000000004'
);

-- Session 1: Foundation & Mobility (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000001', 1),
  ('aaaa0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000002', 2),
  ('aaaa0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000003', 3),
  ('aaaa0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000005', 4);

-- Session 2: Core Activation (5 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0001-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000004', 1),
  ('aaaa0001-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000003', 2),
  ('aaaa0001-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000002', 3),
  ('aaaa0001-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000001', 4),
  ('aaaa0001-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000005', 5);

-- Session 3: Gentle Strength (5 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0001-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000003', 1),
  ('aaaa0001-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000002', 2),
  ('aaaa0001-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000004', 3),
  ('aaaa0001-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000001', 4),
  ('aaaa0001-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000005', 5);

-- Session 4: Flexibility & Recovery (4 exercises — added Pelvic Tilt)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0001-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000001', 1),
  ('aaaa0001-0001-0001-0001-000000000004', 'cccc0001-0001-0001-0001-000000000001', 2),
  ('aaaa0001-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000005', 3),
  ('aaaa0001-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000004', 4);

-- ---------------------------------------------------------------------------
-- 8. Session exercises: Week 2 (new)
-- ---------------------------------------------------------------------------

-- Session 5: Core Progression (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0002-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000004', 1),
  ('aaaa0002-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000003', 2),
  ('aaaa0002-0001-0001-0001-000000000001', 'cccc0001-0001-0001-0001-000000000001', 3),
  ('aaaa0002-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000002', 4);

-- Session 6: Hip Mobility (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0002-0001-0001-0001-000000000002', 'cccc0001-0001-0001-0001-000000000002', 1),
  ('aaaa0002-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000001', 2),
  ('aaaa0002-0001-0001-0001-000000000002', 'cccc0001-0001-0001-0001-000000000004', 3),
  ('aaaa0002-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000005', 4);

-- Session 7: Strength & Stability (5 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0002-0001-0001-0001-000000000003', 'cccc0001-0001-0001-0001-000000000003', 1),
  ('aaaa0002-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000002', 2),
  ('aaaa0002-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000004', 3),
  ('aaaa0002-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000001', 4),
  ('aaaa0002-0001-0001-0001-000000000003', 'cccc0001-0001-0001-0001-000000000001', 5);

-- ---------------------------------------------------------------------------
-- 9. Auto-assign program to users who completed onboarding but have no program
-- ---------------------------------------------------------------------------
INSERT INTO public.user_programs (user_id, program_id, started_at, current_week, current_session)
SELECT
  oa.user_id,
  '11111111-1111-1111-1111-111111111111',
  now(),
  1,
  1
FROM public.onboarding_answers oa
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_programs up WHERE up.user_id = oa.user_id
);
