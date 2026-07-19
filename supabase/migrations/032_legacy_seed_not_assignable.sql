-- 032_legacy_seed_not_assignable.sql
-- The legacy fixed-program seed exercises (002/005, IDs bbbb0001-* and
-- cccc0001-0001-*) predate the tagged catalog: they carry default metadata
-- (movement_pattern 'mobility_general', pain_areas ['general'], intensity 1)
-- and were never meant for the slot-based assignment engine, but is_assignable
-- defaulted to true so they leak into the selection pool as duplicates of
-- curated exercises (Bird Dog, Glute Bridge, Dead Bug, ...).
--
-- Mark them non-assignable. Rows are kept so legacy program_sessions /
-- session_exercises references remain intact.

UPDATE public.exercises
  SET is_assignable = false
  WHERE id::text LIKE 'bbbb0001-%'
     OR id::text LIKE 'cccc0001-0001-%';

-- Ensure none linger in replacement pools (none expected after 031's rebuild).
DELETE FROM public.exercise_replacement_groups g
  USING public.exercises e
  WHERE g.exercise_id = e.id AND e.is_assignable = false;
