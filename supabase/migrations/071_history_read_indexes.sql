-- 071_history_read_indexes.sql
-- Home and Progress filter session_completions / pain_checkins by user_id and
-- a time window. Postgres does not index FK columns automatically, so those
-- RLS-scoped reads seq-scan as the tables grow.

CREATE INDEX IF NOT EXISTS session_completions_user_completed_at_idx
  ON public.session_completions (user_id, completed_at);

CREATE INDEX IF NOT EXISTS pain_checkins_user_recorded_at_idx
  ON public.pain_checkins (user_id, recorded_at);
