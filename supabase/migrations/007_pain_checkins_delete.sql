-- 007_pain_checkins_delete.sql
-- Allow users to DELETE their own pain_checkins (needed by Reset Progress).

CREATE POLICY "pain_checkins_delete_own" ON public.pain_checkins
  FOR DELETE USING (auth.uid() = user_id);

GRANT DELETE ON public.pain_checkins TO authenticated;
