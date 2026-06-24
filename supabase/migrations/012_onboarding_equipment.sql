-- Add equipment preference to onboarding answers
ALTER TABLE public.onboarding_answers
  ADD COLUMN IF NOT EXISTS equipment text;
