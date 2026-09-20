-- Treat q3 "Travels or tingles" (nerve) like sharp: conservative early weeks.
-- Catalog rows already include 'all' in pain_types_safe, so no catalog rewrite.

UPDATE public.assignment_rules
SET rules = jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              rules,
              '{pain_type,require_pain_types_safe}',
              COALESCE(rules->'pain_type'->'require_pain_types_safe', '{}'::jsonb)
                || '{"nerve": true}'::jsonb
            ),
            '{pain_type,exclude_aggravates_early}',
            COALESCE(rules->'pain_type'->'exclude_aggravates_early', '{}'::jsonb)
              || '{"nerve": ["flexion_loaded"]}'::jsonb
          ),
          '{pain_location,contraindications,0,when,pain_type}',
          '["sharp", "nerve"]'::jsonb
        ),
        '{pain_type,bubble}',
        COALESCE(rules->'pain_type'->'bubble', '{}'::jsonb)
          || '{"nerve": "Early sessions stay calm. Loading increases gradually."}'::jsonb
      ),
      '{pain_type,phase_emphasis}',
      COALESCE(rules->'pain_type'->'phase_emphasis', '{}'::jsonb)
        || '{"nerve": {"activation": 0.2, "strength": -0.1}}'::jsonb
    )
WHERE is_active = true;
