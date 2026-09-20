-- 068_program_rebuild_cooldown.sql
-- Persist when a user last rebuilt their remaining program so assign-program
-- can enforce a 7-day cooldown (plus a 24-hour grace rebuild). Clients can
-- SELECT these columns; only service_role can UPDATE user_programs.

ALTER TABLE public.user_programs
  ADD COLUMN IF NOT EXISTS last_program_rebuild_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_program_rebuild_grace_used boolean NOT NULL DEFAULT false;
