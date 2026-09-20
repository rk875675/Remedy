-- 077_promo_codes.sql
-- Creator promo codes: admin-minted codes that grant access server-side, no Apple
-- involvement. Two grant types: months_free (N months) and lifetime (no expiry).
-- Clients never touch these tables directly — RLS stays on with no client policies;
-- all reads/writes go through the promo-codes / promo-admin edge functions
-- (service role) and the redeem_promo_code RPC below.

-- =============================================================================
-- 1. TABLES
-- =============================================================================

CREATE TABLE public.creators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  type text NOT NULL CHECK (type IN ('months_free', 'lifetime')),
  months integer CHECK (months > 0),
  creator_id uuid NOT NULL REFERENCES public.creators(id),
  is_personal boolean NOT NULL DEFAULT false,
  -- NULL = unlimited redemptions.
  max_redemptions integer CHECK (max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- months is required for months_free and forbidden for lifetime.
  CONSTRAINT promo_codes_months_by_type CHECK (
    (type = 'months_free' AND months IS NOT NULL) OR
    (type = 'lifetime' AND months IS NULL)
  )
);

-- Codes are matched case-insensitively; one canonical spelling per code.
CREATE UNIQUE INDEX promo_codes_lower_code_key ON public.promo_codes (lower(code));
CREATE INDEX promo_codes_creator_id_idx ON public.promo_codes (creator_id);

CREATE TABLE public.promo_code_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  entitlement_expires_at timestamptz,
  UNIQUE (promo_code_id, user_id)
);

-- =============================================================================
-- 2. ENTITLEMENTS: grant source
-- =============================================================================
-- Which system granted the current access. Apple sync paths must never evict a
-- still-live promo grant; a later PAID Apple purchase may overwrite it (that flip
-- is "converted to paying").

ALTER TABLE public.entitlements
  ADD COLUMN source text NOT NULL DEFAULT 'apple'
  CHECK (source IN ('apple', 'promo'));

-- =============================================================================
-- 3. BILLING EVENTS: promo redemption audit rows
-- =============================================================================

ALTER TABLE public.billing_events
  DROP CONSTRAINT IF EXISTS billing_events_event_type_check;

ALTER TABLE public.billing_events
  ADD CONSTRAINT billing_events_event_type_check
  CHECK (event_type IN (
    'trial_started', 'subscription_started', 'subscription_renewed',
    'subscription_cancelled', 'refund', 'restored', 'promo_redeemed'
  ));

-- =============================================================================
-- 4. REDEEM RPC
-- =============================================================================
-- Single serialized redemption path. FOR UPDATE on the code row serializes
-- concurrent redemptions of the same code, so the counter increment and the
-- redemption insert are atomic per code.
--
-- Cap enforcement uses promo_codes.redemption_count, NOT count(*) of redemption
-- rows: redemption rows cascade away on account delete while the counter does not,
-- so deleting an account burns the slot (re-grant is an admin action).

CREATE OR REPLACE FUNCTION public.redeem_promo_code(p_code text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code public.promo_codes%ROWTYPE;
  v_creator public.creators%ROWTYPE;
  v_existing public.promo_code_redemptions%ROWTYPE;
  v_entitlement public.entitlements%ROWTYPE;
  v_expires_at timestamptz;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_code
  FROM public.promo_codes
  WHERE lower(code) = lower(trim(p_code))
  FOR UPDATE;

  -- Uniform 'invalid' for missing / inactive / expired / creator inactive so
  -- near-misses cannot be probed apart.
  IF NOT FOUND OR NOT v_code.active
     OR (v_code.expires_at IS NOT NULL AND v_code.expires_at < v_now) THEN
    RETURN jsonb_build_object('result', 'invalid');
  END IF;

  SELECT * INTO v_creator FROM public.creators WHERE id = v_code.creator_id;
  IF NOT FOUND OR NOT v_creator.active THEN
    RETURN jsonb_build_object('result', 'invalid');
  END IF;

  -- Idempotent replay: this user already redeemed this code — return success
  -- with the original expiry instead of failing an HTTP retry.
  SELECT * INTO v_existing
  FROM public.promo_code_redemptions
  WHERE promo_code_id = v_code.id AND user_id = p_user_id;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'result', 'already_redeemed',
      'code', v_code.code,
      'type', v_code.type,
      'months', v_code.months,
      'creator_name', v_creator.name,
      'creator_slug', v_creator.slug,
      'expires_at', v_existing.entitlement_expires_at
    );
  END IF;

  IF v_code.max_redemptions IS NOT NULL
     AND v_code.redemption_count >= v_code.max_redemptions THEN
    RETURN jsonb_build_object('result', 'fully_redeemed');
  END IF;

  -- Never overwrite currently-valid access (paying sub, trial, dev trial, or a
  -- live promo from another code). Same validity rule as the app's premium gate.
  SELECT * INTO v_entitlement
  FROM public.entitlements
  WHERE user_id = p_user_id;
  IF FOUND
     AND v_entitlement.is_premium
     AND (v_entitlement.expires_at IS NULL OR v_entitlement.expires_at > v_now)
     AND v_entitlement.subscription_status IN ('active', 'trial', 'dev_trial', 'cancelled') THEN
    RETURN jsonb_build_object('result', 'already_entitled');
  END IF;

  IF v_code.type = 'lifetime' THEN
    v_expires_at := NULL;
  ELSE
    v_expires_at := v_now + make_interval(months => v_code.months);
  END IF;

  INSERT INTO public.promo_code_redemptions
    (promo_code_id, user_id, redeemed_at, entitlement_expires_at)
  VALUES (v_code.id, p_user_id, v_now, v_expires_at);

  -- Same transaction as the insert; already serialized by FOR UPDATE above.
  UPDATE public.promo_codes
  SET redemption_count = redemption_count + 1
  WHERE id = v_code.id;

  -- Promo grants clear every Apple identifier so an Apple webhook keyed on an old
  -- original_transaction_id can never mutate this row.
  INSERT INTO public.entitlements (
    user_id, is_premium, subscription_status, source, product_id,
    original_transaction_id, trial_started_at, trial_ends_at, expires_at, updated_at
  )
  VALUES (
    p_user_id, true, 'active', 'promo', NULL, NULL, NULL, NULL, v_expires_at, v_now
  )
  ON CONFLICT (user_id) DO UPDATE SET
    is_premium = true,
    subscription_status = 'active',
    source = 'promo',
    product_id = NULL,
    original_transaction_id = NULL,
    trial_started_at = NULL,
    trial_ends_at = NULL,
    expires_at = EXCLUDED.expires_at,
    updated_at = EXCLUDED.updated_at;

  -- Audit row. Stable idempotency key: an HTTP retry replays via already_redeemed
  -- above and never reaches this insert, but keep the conflict guard anyway.
  INSERT INTO public.billing_events
    (user_id, event_type, product_id, transaction_id, idempotency_key, metadata)
  VALUES (
    p_user_id, 'promo_redeemed', NULL, NULL,
    'promo_redeem_' || p_user_id || '_' || v_code.id,
    jsonb_build_object(
      'promo_code_id', v_code.id,
      'code', v_code.code,
      'type', v_code.type,
      'months', v_code.months,
      'creator_slug', v_creator.slug,
      'is_personal', v_code.is_personal,
      'expires_at', v_expires_at
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN jsonb_build_object(
    'result', 'redeemed',
    'code', v_code.code,
    'type', v_code.type,
    'months', v_code.months,
    'creator_name', v_creator.name,
    'creator_slug', v_creator.slug,
    'expires_at', v_expires_at
  );
END;
$$;

-- Service-role only: the redeem edge function is the single caller.
REVOKE ALL ON FUNCTION public.redeem_promo_code(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.redeem_promo_code(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.redeem_promo_code(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code(text, uuid) TO service_role;

-- =============================================================================
-- 5. RLS + GRANTS
-- =============================================================================
-- RLS on, zero client policies: anon/authenticated can neither read nor write.
-- Edge functions use the service role (bypasses RLS but still needs GRANTs).

ALTER TABLE public.creators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_code_redemptions ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.creators TO service_role;
-- DELETE: promo-admin may delete a code only while redemption_count = 0.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.promo_codes TO service_role;
GRANT SELECT, INSERT ON public.promo_code_redemptions TO service_role;
