-- 009_seed_weeks_3_5.sql
-- Append program_sessions and session_exercises for weeks 2–5 of Back Pain Relief Program.
-- Week 2 session 4: Flexibility & Recovery (fills gap in 005).
-- Weeks 3–4: same exercise mix as week 2 (maintenance/progression) + recovery day.
-- Week 5: identical to week 4 (final week).
-- program_sessions INSERTs are idempotent (ON CONFLICT DO NOTHING).

-- ---------------------------------------------------------------------------
-- Week 2 session 4 (missing from 005)
-- ---------------------------------------------------------------------------
INSERT INTO public.program_sessions (id, program_id, week_number, session_number, title, duration_minutes) VALUES
  ('aaaa0002-0001-0001-0001-000000000004', '11111111-1111-1111-1111-111111111111', 2, 4, 'Flexibility & Recovery', 15)
ON CONFLICT (id) DO NOTHING;

-- Session 4: Flexibility & Recovery (4 exercises — same as week 1 session 4)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0002-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000001', 1),
  ('aaaa0002-0001-0001-0001-000000000004', 'cccc0001-0001-0001-0001-000000000001', 2),
  ('aaaa0002-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000005', 3),
  ('aaaa0002-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000004', 4);

-- ---------------------------------------------------------------------------
-- Week 3 sessions
-- ---------------------------------------------------------------------------
INSERT INTO public.program_sessions (id, program_id, week_number, session_number, title, duration_minutes) VALUES
  ('aaaa0003-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 3, 1, 'Core Progression', 18),
  ('aaaa0003-0001-0001-0001-000000000002', '11111111-1111-1111-1111-111111111111', 3, 2, 'Hip Mobility', 16),
  ('aaaa0003-0001-0001-0001-000000000003', '11111111-1111-1111-1111-111111111111', 3, 3, 'Strength & Stability', 20),
  ('aaaa0003-0001-0001-0001-000000000004', '11111111-1111-1111-1111-111111111111', 3, 4, 'Flexibility & Recovery', 15)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Week 4 sessions
-- ---------------------------------------------------------------------------
INSERT INTO public.program_sessions (id, program_id, week_number, session_number, title, duration_minutes) VALUES
  ('aaaa0004-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 4, 1, 'Core Progression', 18),
  ('aaaa0004-0001-0001-0001-000000000002', '11111111-1111-1111-1111-111111111111', 4, 2, 'Hip Mobility', 16),
  ('aaaa0004-0001-0001-0001-000000000003', '11111111-1111-1111-1111-111111111111', 4, 3, 'Strength & Stability', 20),
  ('aaaa0004-0001-0001-0001-000000000004', '11111111-1111-1111-1111-111111111111', 4, 4, 'Flexibility & Recovery', 15)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Week 5 sessions (final week — same as week 4)
-- ---------------------------------------------------------------------------
INSERT INTO public.program_sessions (id, program_id, week_number, session_number, title, duration_minutes) VALUES
  ('aaaa0005-0001-0001-0001-000000000001', '11111111-1111-1111-1111-111111111111', 5, 1, 'Core Progression', 18),
  ('aaaa0005-0001-0001-0001-000000000002', '11111111-1111-1111-1111-111111111111', 5, 2, 'Hip Mobility', 16),
  ('aaaa0005-0001-0001-0001-000000000003', '11111111-1111-1111-1111-111111111111', 5, 3, 'Strength & Stability', 20),
  ('aaaa0005-0001-0001-0001-000000000004', '11111111-1111-1111-1111-111111111111', 5, 4, 'Flexibility & Recovery', 15)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Session exercises: Week 3
-- Sessions 1–3 mirror week 2; session 4 mirrors week 1/2 recovery day.
-- ---------------------------------------------------------------------------

-- Session 1: Core Progression (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0003-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000004', 1),
  ('aaaa0003-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000003', 2),
  ('aaaa0003-0001-0001-0001-000000000001', 'cccc0001-0001-0001-0001-000000000001', 3),
  ('aaaa0003-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000002', 4);

-- Session 2: Hip Mobility (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0003-0001-0001-0001-000000000002', 'cccc0001-0001-0001-0001-000000000002', 1),
  ('aaaa0003-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000001', 2),
  ('aaaa0003-0001-0001-0001-000000000002', 'cccc0001-0001-0001-0001-000000000004', 3),
  ('aaaa0003-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000005', 4);

-- Session 3: Strength & Stability (5 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0003-0001-0001-0001-000000000003', 'cccc0001-0001-0001-0001-000000000003', 1),
  ('aaaa0003-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000002', 2),
  ('aaaa0003-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000004', 3),
  ('aaaa0003-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000001', 4),
  ('aaaa0003-0001-0001-0001-000000000003', 'cccc0001-0001-0001-0001-000000000001', 5);

-- Session 4: Flexibility & Recovery (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0003-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000001', 1),
  ('aaaa0003-0001-0001-0001-000000000004', 'cccc0001-0001-0001-0001-000000000001', 2),
  ('aaaa0003-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000005', 3),
  ('aaaa0003-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000004', 4);

-- ---------------------------------------------------------------------------
-- Session exercises: Week 4 (same as week 3)
-- ---------------------------------------------------------------------------

-- Session 1: Core Progression (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0004-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000004', 1),
  ('aaaa0004-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000003', 2),
  ('aaaa0004-0001-0001-0001-000000000001', 'cccc0001-0001-0001-0001-000000000001', 3),
  ('aaaa0004-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000002', 4);

-- Session 2: Hip Mobility (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0004-0001-0001-0001-000000000002', 'cccc0001-0001-0001-0001-000000000002', 1),
  ('aaaa0004-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000001', 2),
  ('aaaa0004-0001-0001-0001-000000000002', 'cccc0001-0001-0001-0001-000000000004', 3),
  ('aaaa0004-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000005', 4);

-- Session 3: Strength & Stability (5 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0004-0001-0001-0001-000000000003', 'cccc0001-0001-0001-0001-000000000003', 1),
  ('aaaa0004-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000002', 2),
  ('aaaa0004-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000004', 3),
  ('aaaa0004-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000001', 4),
  ('aaaa0004-0001-0001-0001-000000000003', 'cccc0001-0001-0001-0001-000000000001', 5);

-- Session 4: Flexibility & Recovery (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0004-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000001', 1),
  ('aaaa0004-0001-0001-0001-000000000004', 'cccc0001-0001-0001-0001-000000000001', 2),
  ('aaaa0004-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000005', 3),
  ('aaaa0004-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000004', 4);

-- ---------------------------------------------------------------------------
-- Session exercises: Week 5 (same as week 4 — final week)
-- ---------------------------------------------------------------------------

-- Session 1: Core Progression (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0005-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000004', 1),
  ('aaaa0005-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000003', 2),
  ('aaaa0005-0001-0001-0001-000000000001', 'cccc0001-0001-0001-0001-000000000001', 3),
  ('aaaa0005-0001-0001-0001-000000000001', 'bbbb0001-0001-0001-0001-000000000002', 4);

-- Session 2: Hip Mobility (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0005-0001-0001-0001-000000000002', 'cccc0001-0001-0001-0001-000000000002', 1),
  ('aaaa0005-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000001', 2),
  ('aaaa0005-0001-0001-0001-000000000002', 'cccc0001-0001-0001-0001-000000000004', 3),
  ('aaaa0005-0001-0001-0001-000000000002', 'bbbb0001-0001-0001-0001-000000000005', 4);

-- Session 3: Strength & Stability (5 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0005-0001-0001-0001-000000000003', 'cccc0001-0001-0001-0001-000000000003', 1),
  ('aaaa0005-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000002', 2),
  ('aaaa0005-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000004', 3),
  ('aaaa0005-0001-0001-0001-000000000003', 'bbbb0001-0001-0001-0001-000000000001', 4),
  ('aaaa0005-0001-0001-0001-000000000003', 'cccc0001-0001-0001-0001-000000000001', 5);

-- Session 4: Flexibility & Recovery (4 exercises)
INSERT INTO public.session_exercises (session_id, exercise_id, order_index) VALUES
  ('aaaa0005-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000001', 1),
  ('aaaa0005-0001-0001-0001-000000000004', 'cccc0001-0001-0001-0001-000000000001', 2),
  ('aaaa0005-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000005', 3),
  ('aaaa0005-0001-0001-0001-000000000004', 'bbbb0001-0001-0001-0001-000000000004', 4);
