-- 035_entitlements_is_sandbox.sql
-- Informational flag recording whether the Apple transaction that granted the
-- entitlement came from the Sandbox environment. Never used to gate access —
-- sandbox purchases are trusted the same as production (verification chain in
-- _shared/apple.ts: production first, sandbox fallback, per Apple's guidance).

ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS is_sandbox boolean NOT NULL DEFAULT false;
