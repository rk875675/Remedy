-- 023_entitlements_unique_transaction.sql
-- One Apple subscription → one Remedy account (anti subscription-fraud), enforced at the
-- DB layer as a backstop to the application checks in verify-purchase / restore-purchases.
--
-- A partial unique index (NULLs excluded) means a given original_transaction_id can map to
-- at most one entitlements row. Since entitlements is keyed UNIQUE per user_id, this makes
-- the same transaction unable to grant premium on a second account even if the app-layer
-- check is bypassed.

-- Pre-existing duplicates (from sandbox testing reusing one Apple transaction across
-- accounts) would block the index. Keep the most recently-updated row's link and unlink
-- the older duplicates by nulling original_transaction_id. This does NOT revoke premium or
-- delete any entitlement — it only removes the redundant transaction reference so the
-- one-subscription-one-account invariant can be enforced going forward.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY original_transaction_id
      ORDER BY updated_at DESC NULLS LAST, id DESC
    ) AS rn
  FROM public.entitlements
  WHERE original_transaction_id IS NOT NULL
)
UPDATE public.entitlements e
SET original_transaction_id = NULL
FROM ranked
WHERE e.id = ranked.id
  AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS entitlements_original_transaction_id_key
  ON public.entitlements (original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;
