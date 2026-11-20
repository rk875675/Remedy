-- Programs run 10 to 16 weeks. Engine v2 sets the exact length from the intake
-- (lib/intake.ts programWeeks). The v1 fallback only knows the duration bucket,
-- so it uses 10 weeks for pain under 3 months and 12 for longer.
-- Existing plan snapshots keep the length they were built with.

UPDATE public.assignment_rules
SET rules = jsonb_set(
      rules,
      '{global,duration_weeks}',
      '{"acute": 10, "subacute": 10, "chronic": 12}'::jsonb
    )
WHERE is_active = true;
