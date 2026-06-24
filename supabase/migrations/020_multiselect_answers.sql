-- 020_multiselect_answers.sql
-- Convert pain_type, pain_trigger, and main_goal from scalar text to text[].
--
-- pain_type: existing 'multiple' rows are remapped to ARRAY['stiffness','ache']
--            (multi-select replaces the 'multiple' sentinel). All other scalar
--            values are wrapped in a single-element array.
-- pain_trigger, main_goal: single-value scalar rows become single-element arrays.
--
-- The initial schema (001) defines these three columns as plain `text NOT NULL`
-- with no CHECK constraints, so no constraints need to be dropped first.

ALTER TABLE public.onboarding_answers
  ALTER COLUMN pain_type TYPE text[]
    USING (
      CASE
        WHEN pain_type = 'multiple' THEN ARRAY['stiffness', 'ache']
        WHEN pain_type IS NULL      THEN NULL
        ELSE                             ARRAY[pain_type]
      END
    );

ALTER TABLE public.onboarding_answers
  ALTER COLUMN pain_trigger TYPE text[]
    USING (
      CASE
        WHEN pain_trigger IS NULL THEN NULL
        ELSE                           ARRAY[pain_trigger]
      END
    );

ALTER TABLE public.onboarding_answers
  ALTER COLUMN main_goal TYPE text[]
    USING (
      CASE
        WHEN main_goal IS NULL THEN NULL
        ELSE                        ARRAY[main_goal]
      END
    );
