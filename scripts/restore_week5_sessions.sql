-- Restore week 5 sessions that prune removed from the live plan during the
-- rebuild verification. Copied from another Upper Back Strength plan.
INSERT INTO public.user_plan_sessions (
  plan_id, week_number, session_number, title, phase, estimated_minutes, intensity_tier
)
SELECT
  'f8028b40-38f9-40b7-a03f-859f52e328a3'::uuid,
  s.week_number,
  s.session_number,
  s.title,
  s.phase,
  s.estimated_minutes,
  s.intensity_tier
FROM public.user_plan_sessions s
WHERE s.plan_id = '9d2419a7-ad82-4eef-b8c2-968ef5421ff3'
  AND s.week_number = 5
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_plan_sessions existing
    WHERE existing.plan_id = 'f8028b40-38f9-40b7-a03f-859f52e328a3'
      AND existing.week_number = s.week_number
      AND existing.session_number = s.session_number
  );

INSERT INTO public.user_plan_session_exercises (
  plan_session_id, exercise_id, order_index, sets, reps, duration_seconds, rest_seconds, load_tier
)
SELECT
  dest.id,
  e.exercise_id,
  e.order_index,
  e.sets,
  e.reps,
  e.duration_seconds,
  e.rest_seconds,
  e.load_tier
FROM public.user_plan_sessions src
JOIN public.user_plan_session_exercises e ON e.plan_session_id = src.id
JOIN public.user_plan_sessions dest
  ON dest.plan_id = 'f8028b40-38f9-40b7-a03f-859f52e328a3'
 AND dest.week_number = src.week_number
 AND dest.session_number = src.session_number
WHERE src.plan_id = '9d2419a7-ad82-4eef-b8c2-968ef5421ff3'
  AND src.week_number = 5
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_plan_session_exercises existing
    WHERE existing.plan_session_id = dest.id
      AND existing.order_index = e.order_index
  );

SELECT week_number, session_number, title,
       (SELECT count(*) FROM user_plan_session_exercises e WHERE e.plan_session_id = s.id) AS exercises
FROM public.user_plan_sessions s
WHERE s.plan_id = 'f8028b40-38f9-40b7-a03f-859f52e328a3'
ORDER BY week_number, session_number;
