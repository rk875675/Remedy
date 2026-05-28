-- 002_seed_data.sql
-- Seed: 1 program, 4 week-1 sessions, 5 exercises, session_exercises links

-- Program
INSERT INTO public.programs (id, name, description, duration_weeks, sessions_per_week, target_activity_levels)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Back Pain Relief Program',
  'A structured 5-week program designed to reduce back pain through progressive mobility, stability, and strengthening exercises.',
  5, 4,
  ARRAY['sedentary', 'light', 'active', 'athlete']
);

-- Week 1 sessions
INSERT INTO public.program_sessions (id, program_id, week_number, session_number, title, duration_minutes) VALUES
  ('aaaa0001-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 1, 1, 'Foundation & Mobility', 18),
  ('aaaa0001-0001-0001-0001-000000000002', '11111111-1111-1111-1111-111111111111', 1, 2, 'Core Activation', 20),
  ('aaaa0001-0001-0001-0001-000000000003', '11111111-1111-1111-1111-111111111111', 1, 3, 'Gentle Strength', 18),
  ('aaaa0001-0001-0001-0001-000000000004', '11111111-1111-1111-1111-111111111111', 1, 4, 'Flexibility & Recovery', 15);

-- Exercises
INSERT INTO public.exercises (id, name, description, sets, reps, duration_seconds, rest_seconds, video_url, instructions) VALUES
  ('bbbb0001-0001-0001-0001-000000000001', 'Cat-Cow Stretch', 'Alternating between arching and rounding your back on all fours.', 3, 10, NULL, 20, NULL, 'Start on hands and knees. Inhale and arch your back, lifting your head. Exhale and round your spine, tucking your chin.'),
  ('bbbb0001-0001-0001-0001-000000000002', 'Bird Dog', 'Extending opposite arm and leg from a tabletop position.', 3, 8, NULL, 30, NULL, 'From hands and knees, extend right arm forward and left leg back. Hold 2 seconds, return, and switch sides.'),
  ('bbbb0001-0001-0001-0001-000000000003', 'Glute Bridge', 'Lifting hips off the floor while lying on your back.', 3, 12, NULL, 30, NULL, 'Lie on your back with knees bent. Push through heels to lift hips until body forms a straight line. Squeeze glutes at top.'),
  ('bbbb0001-0001-0001-0001-000000000004', 'Dead Bug', 'Controlled arm and leg lowering while lying on your back.', 3, NULL, 45, 20, NULL, 'Lie on your back with arms extended toward ceiling and knees at 90 degrees. Slowly lower opposite arm and leg, keeping core engaged.'),
  ('bbbb0001-0001-0001-0001-000000000005', 'Child''s Pose Hold', 'A resting stretch for the lower back and hips.', 2, NULL, 30, 15, NULL, 'Kneel and sit back on your heels. Extend arms forward on the floor and hold, breathing deeply.');

-- Session 1 exercises (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000001', 0),
  ('aaaa0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000002', 1),
  ('aaaa0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000003', 2),
  ('aaaa0001-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000005', 3);

-- Session 2 exercises (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0001-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000004', 0),
  ('aaaa0001-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000003', 1),
  ('aaaa0001-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000002', 2),
  ('aaaa0001-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000001', 3);

-- Session 3 exercises (5 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0001-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000003', 0),
  ('aaaa0001-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000002', 1),
  ('aaaa0001-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000004', 2),
  ('aaaa0001-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000001', 3),
  ('aaaa0001-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000005', 4);

-- Session 4 exercises (3 exercises - shorter recovery day)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0001-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000001', 0),
  ('aaaa0001-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000005', 1),
  ('aaaa0001-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000004', 2);
