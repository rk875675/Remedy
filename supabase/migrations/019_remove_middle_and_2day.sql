-- 019_remove_middle_and_2day.sql
-- Removes the deprecated 'middle' pain_location value and the '2 days/week'
-- sessions_per_week_preference option. Existing rows are remapped to safe values,
-- and the active assignment_rules JSON is pruned of those keys.

-- Remap existing onboarding_answers rows
UPDATE public.onboarding_answers
  SET pain_location = 'upper'
  WHERE pain_location = 'middle';

UPDATE public.onboarding_answers
  SET sessions_per_week_preference = 3
  WHERE sessions_per_week_preference = 2;

-- Remove 'middle' from the active assignment_rules JSON
-- rules.pain_location.area_filter and rules.pain_location.title_focus
UPDATE public.assignment_rules
  SET rules = rules
    #- '{pain_location,area_filter,middle}'
    #- '{pain_location,title_focus,middle}'
  WHERE is_active = true;
