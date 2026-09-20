-- Recovered from the linked project's migration history: applied to production
-- but its file was missing from the repo.

-- 082_promo_already_used_expired.sql
-- already_redeemed must only replay while the caller still has live access.
-- A lapsed promo grant used to return success (original expires_at in the past),
-- so the client closed the sheet / routed into the app as if access returned.
-- Also treat code expiry as <= now so validate and redeem agree.

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
  v_entitled boolean;
BEGIN
  SELECT * INTO v_code
  FROM public.promo_codes
  WHERE lower(code) = lower(trim(p_code))
  FOR UPDATE;

  -- Uniform 'invalid' for missing / inactive / expired / creator inactive so
  -- near-misses cannot be probed apart. <= so validate and redeem agree.
  IF NOT FOUND OR NOT v_code.active
     OR (v_code.expires_at IS NOT NULL AND v_code.expires_at <= v_now) THEN
    RETURN jsonb_build_object('result', 'invalid');
  END IF;

  SELECT * INTO v_creator FROM public.creators WHERE id = v_code.creator_id;
  IF NOT FOUND OR NOT v_creator.active THEN
    RETURN jsonb_build_object('result', 'invalid');
  END IF;

  SELECT * INTO v_entitlement
  FROM public.entitlements
  WHERE user_id = p_user_id;
  v_entitled := FOUND
    AND v_entitlement.is_premium
    AND (v_entitlement.expires_at IS NULL OR v_entitlement.expires_at > v_now)
    AND v_entitlement.subscription_status IN ('active', 'trial', 'dev_trial', 'cancelled');

  -- Idempotent replay only while the caller still has live access. A lapsed
  -- grant must not return success (client would close the sheet as if access
  -- returned).
  SELECT * INTO v_existing
  FROM public.promo_code_redemptions
  WHERE promo_code_id = v_code.id AND user_id = p_user_id;
  IF FOUND THEN
    IF v_entitled THEN
      RETURN jsonb_build_object(
        'result', 'already_redeemed',
        'code', v_code.code,
        'type', v_code.type,
        'months', v_code.months,
        'weeks', v_code.weeks,
        'minutes', v_code.minutes,
        'creator_name', v_creator.name,
        'creator_slug', v_creator.slug,
        'expires_at', v_existing.entitlement_expires_at
      );
    END IF;
    RETURN jsonb_build_object('result', 'already_used');
  END IF;

  IF v_code.max_redemptions IS NOT NULL
     AND v_code.redemption_count >= v_code.max_redemptions THEN
    RETURN jsonb_build_object('result', 'fully_redeemed');
  END IF;

  -- Never overwrite currently-valid access (paying sub, trial, dev trial, or a
  -- live promo from another code). Same validity rule as the app's premium gate.
  IF v_entitled THEN
    RETURN jsonb_build_object('result', 'already_entitled');
  END IF;

  IF v_code.type = 'lifetime' THEN
    v_expires_at := NULL;
  ELSIF v_code.type = 'months_free' THEN
    v_expires_at := v_now + make_interval(months => v_code.months);
  ELSIF v_code.type = 'weeks_free' THEN
    v_expires_at := v_now + make_interval(weeks => v_code.weeks);
  ELSIF v_code.type = 'minutes_free' THEN
    v_expires_at := v_now + make_interval(mins => v_code.minutes);
  ELSE
    RETURN jsonb_build_object('result', 'invalid');
  END IF;

  INSERT INTO public.promo_code_redemptions
    (promo_code_id, user_id, redeemed_at, entitlement_expires_at)
  VALUES (v_code.id, p_user_id, v_now, v_expires_at);

  UPDATE public.promo_codes
  SET redemption_count = redemption_count + 1
  WHERE id = v_code.id;

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
      'weeks', v_code.weeks,
      'minutes', v_code.minutes,
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
    'weeks', v_code.weeks,
    'minutes', v_code.minutes,
    'creator_name', v_creator.name,
    'creator_slug', v_creator.slug,
    'expires_at', v_expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_promo_code(text, uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.redeem_promo_code(text, uuid) FROM anon;

REVOKE ALL ON FUNCTION public.redeem_promo_code(text, uuid) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.redeem_promo_code(text, uuid) TO service_role;

