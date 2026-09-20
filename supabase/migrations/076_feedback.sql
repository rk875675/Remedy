-- 076_feedback.sql
-- In-app feedback from Profile → Send Feedback.
-- Clients never write this table. The submit-feedback edge function inserts
-- with the service role after JWT auth + rate limiting. RLS stays on with no
-- authenticated policies so a leaked anon/user key cannot read or write rows.

CREATE TABLE public.feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('bug', 'idea', 'question', 'other')),
  rating smallint CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 2000),
  app_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedback_user_id_created_at_idx
  ON public.feedback (user_id, created_at DESC);

ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.feedback TO service_role;
