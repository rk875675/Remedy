import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3';
import { parseAssnSignedPayload } from '../_shared/apple.ts';
import {
  captureServerEvent,
  planInterval,
  revenueFields,
  type ServerEventName,
} from '../_shared/analytics.ts';

// App Store Server Notifications V2 webhook.
// Apple POSTs a signedPayload with no Supabase JWT — auth is the Apple JWS chain
// (pinned to Apple Root CA G3). Ack with 200 so Apple stops retrying; 5xx only on
// transient failures we want retried.

const bodySchema = z
  .object({
    signedPayload: z.string().min(1).max(65536),
  })
  .strict();

type BillingEventType =
  | 'subscription_renewed'
  | 'subscription_cancelled'
  | 'refund';

type AssnAction =
  | {
      kind: 'renew';
      status: 'active' | 'trial';
      isPremium: true;
      billingEvent: 'subscription_renewed';
      analyticsEvent: 'subscription_renewed';
      includeRevenue: true;
    }
  | {
      kind: 'cancel';
      status: 'cancelled';
      isPremium: true;
      billingEvent: 'subscription_cancelled';
      analyticsEvent: 'subscription_cancelled';
      includeRevenue: false;
    }
  | {
      kind: 'reactivate';
      status: 'active';
      isPremium: true;
      billingEvent: null;
      analyticsEvent: null;
      includeRevenue: false;
    }
  | {
      kind: 'expire';
      status: 'expired';
      isPremium: false;
      billingEvent: null;
      analyticsEvent: null;
      includeRevenue: false;
    }
  | {
      kind: 'refund';
      status: 'expired';
      isPremium: false;
      billingEvent: 'refund';
      analyticsEvent: 'subscription_refunded';
      includeRevenue: false;
    }
  | { kind: 'ignore'; reason: string };

function resolveAction(
  notificationType: string,
  subtype: string | null | undefined,
): AssnAction {
  switch (notificationType) {
    case 'DID_RENEW':
      return {
        kind: 'renew',
        status: 'active',
        isPremium: true,
        billingEvent: 'subscription_renewed',
        analyticsEvent: 'subscription_renewed',
        includeRevenue: true,
      };
    case 'DID_CHANGE_RENEWAL_STATUS':
      if (subtype === 'AUTO_RENEW_DISABLED') {
        return {
          kind: 'cancel',
          status: 'cancelled',
          isPremium: true,
          billingEvent: 'subscription_cancelled',
          analyticsEvent: 'subscription_cancelled',
          includeRevenue: false,
        };
      }
      if (subtype === 'AUTO_RENEW_ENABLED') {
        return {
          kind: 'reactivate',
          status: 'active',
          isPremium: true,
          billingEvent: null,
          analyticsEvent: null,
          includeRevenue: false,
        };
      }
      return { kind: 'ignore', reason: `renewal_status_${subtype ?? 'none'}` };
    case 'EXPIRED':
      return {
        kind: 'expire',
        status: 'expired',
        isPremium: false,
        billingEvent: null,
        analyticsEvent: null,
        includeRevenue: false,
      };
    case 'REFUND':
    case 'REVOKE':
      return {
        kind: 'refund',
        status: 'expired',
        isPremium: false,
        billingEvent: 'refund',
        analyticsEvent: 'subscription_refunded',
        includeRevenue: false,
      };
    case 'TEST':
      return { kind: 'ignore', reason: 'test' };
    default:
      // SUBSCRIBED / OFFER_REDEEMED / GRACE_PERIOD / DID_FAIL_TO_RENEW / etc.
      // Initial grants stay on verify-purchase; billing-retry keeps current access
      // until EXPIRED. Ack so Apple does not retry forever.
      return { kind: 'ignore', reason: `unhandled_${notificationType}` };
  }
}

function entitlementUnchanged(
  prior: {
    is_premium: boolean;
    subscription_status: string;
    expires_at: string | null;
    product_id: string | null;
  },
  next: {
    isPremium: boolean;
    status: string;
    expiresAt: string | null;
    productId: string | null;
  },
): boolean {
  const priorExp = prior.expires_at ? new Date(prior.expires_at).getTime() : null;
  const nextExp = next.expiresAt ? new Date(next.expiresAt).getTime() : null;
  return (
    prior.is_premium === next.isPremium &&
    prior.subscription_status === next.status &&
    prior.product_id === next.productId &&
    priorExp === nextExp
  );
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Superwall Option 2: same raw ASSN body. Never block the Apple ack. */
function forwardToSuperwall(rawText: string): void {
  const url = Deno.env.get('SUPERWALL_ASSN_WEBHOOK_URL');
  if (!url) return;
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: rawText,
  }).catch(() => {
    console.error('[apple-assn] superwall forward failed');
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, error: 'method_not_allowed' }, 405);
  }

  try {
    let rawText: string;
    try {
      rawText = await req.text();
    } catch {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    forwardToSuperwall(rawText);

    let rawBody: unknown;
    try {
      rawBody = JSON.parse(rawText);
    } catch {
      return json({ ok: false, error: 'invalid_json' }, 400);
    }

    const parsed = bodySchema.safeParse(rawBody);
    if (!parsed.success) {
      return json({ ok: false, error: 'invalid_body' }, 400);
    }

    const assn = await parseAssnSignedPayload(parsed.data.signedPayload);
    if (!assn.valid || !assn.notificationType || !assn.notificationUUID) {
      // Bad signature / spoof — do not 5xx (Apple would retry a poison payload).
      console.error('[apple-assn] verify failed:', assn.error);
      return json({ ok: false, error: assn.error ?? 'invalid_payload' }, 400);
    }

    const action = resolveAction(assn.notificationType, assn.subtype);
    if (action.kind === 'ignore') {
      return json({ ok: true, ignored: action.reason }, 200);
    }

    if (!assn.transaction?.originalTransactionId) {
      console.error('[apple-assn] missing transaction for', assn.notificationType);
      return json({ ok: true, ignored: 'missing_transaction' }, 200);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const oid = assn.transaction.originalTransactionId;
    const { data: entitlement, error: lookupError } = await supabaseAdmin
      .from('entitlements')
      .select(
        'user_id, is_premium, subscription_status, expires_at, product_id, is_sandbox, source',
      )
      .eq('original_transaction_id', oid)
      .maybeSingle();

    if (lookupError) {
      console.error('[apple-assn] entitlement lookup failed:', lookupError);
      return json({ ok: false, error: 'lookup_failed' }, 500);
    }

    if (!entitlement) {
      // Purchase may not be bound yet (ASSN raced ahead of verify-purchase), or the
      // account was deleted. Ack — retrying cannot invent a user_id binding.
      console.warn('[apple-assn] no entitlement for oid', oid, assn.notificationType);
      return json({ ok: true, ignored: 'unknown_subscription' }, 200);
    }

    // Promo preservation: promo grants clear original_transaction_id, so this
    // lookup can't normally find them — but if a row is somehow still a live
    // promo grant (null expires_at = lifetime), an Apple expire/refund/revoke
    // must never revoke it. Ack so Apple stops retrying.
    if (
      (action.kind === 'expire' || action.kind === 'refund') &&
      entitlement.source === 'promo' &&
      entitlement.is_premium === true &&
      (!entitlement.expires_at || new Date(entitlement.expires_at).getTime() > Date.now())
    ) {
      return json({ ok: true, ignored: 'promo_grant_active' }, 200);
    }

    const productId = assn.transaction.productId ?? entitlement.product_id;
    const expiresAt =
      assn.transaction.expiresDate != null
        ? new Date(assn.transaction.expiresDate).toISOString()
        : entitlement.expires_at;

    // Renewals that arrive while still in an Apple free trial stay `trial`.
    let nextStatus: string = action.status;
    if (action.kind === 'renew' && assn.transaction.inTrialPeriod) {
      nextStatus = 'trial';
    }

    const next = {
      isPremium: action.isPremium,
      status: nextStatus,
      expiresAt,
      productId,
    };

    if (
      entitlementUnchanged(
        {
          is_premium: entitlement.is_premium,
          subscription_status: entitlement.subscription_status,
          expires_at: entitlement.expires_at,
          product_id: entitlement.product_id,
        },
        next,
      )
    ) {
      return json({ ok: true, noop: true }, 200);
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from('entitlements')
      .update({
        is_premium: next.isPremium,
        subscription_status: next.status,
        product_id: next.productId,
        expires_at: next.expiresAt,
        is_sandbox: assn.environment === 'Sandbox' ? true : entitlement.is_sandbox,
        updated_at: now,
      })
      .eq('user_id', entitlement.user_id);

    if (updateError) {
      console.error('[apple-assn] entitlement update failed:', updateError);
      return json({ ok: false, error: 'update_failed' }, 500);
    }

    const billingEvent = action.billingEvent as BillingEventType | null;
    const analyticsEvent = action.analyticsEvent as ServerEventName | null;

    if (!billingEvent || !analyticsEvent) {
      // expire / reactivate — DB is source of truth; no lifecycle analytics event yet.
      return json({ ok: true, action: action.kind }, 200);
    }

    const { error: billingInsertError } = await supabaseAdmin.from('billing_events').insert({
      user_id: entitlement.user_id,
      event_type: billingEvent,
      product_id: next.productId,
      transaction_id: assn.transaction.transactionId ?? oid,
      idempotency_key: `assn_${assn.notificationUUID}`,
      metadata: {
        notification_type: assn.notificationType,
        subtype: assn.subtype,
        signed_at: assn.signedDate ? new Date(assn.signedDate).toISOString() : null,
      },
    });

    if (billingInsertError && billingInsertError.code !== '23505') {
      console.error('[apple-assn] billing_events insert failed:', billingInsertError);
      // Entitlement already updated — ack so Apple doesn't loop.
      return json({ ok: true, action: action.kind, billing: 'insert_failed' }, 200);
    }

    if (billingInsertError) {
      // Replay of the same notificationUUID — entitlement write was a no-op above or a
      // concurrent retry; do not double-count analytics.
      return json({ ok: true, action: action.kind, deduped: true }, 200);
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_dev')
      .eq('id', entitlement.user_id)
      .maybeSingle();

    const isSandbox = assn.environment === 'Sandbox' || entitlement.is_sandbox === true;
    const isInternal = isSandbox || (profile?.is_dev ?? false);
    const revenue =
      action.includeRevenue && next.productId
        ? revenueFields(
            next.productId,
            assn.transaction.priceMilliunits,
            assn.transaction.currency,
          )
        : null;

    await captureServerEvent({
      distinctId: entitlement.user_id,
      event: analyticsEvent,
      environment: isSandbox ? 'sandbox' : 'production',
      isInternal,
      properties: {
        product_id: next.productId,
        plan_interval: planInterval(next.productId),
        original_transaction_id: oid,
        prior_status: entitlement.subscription_status,
        expires_at: next.expiresAt,
        notification_type: assn.notificationType,
        subtype: assn.subtype,
        revenue: revenue?.revenue,
        currency: revenue?.currency,
        revenue_source: revenue?.revenue_source,
      },
      personProperties: {
        is_premium: next.isPremium,
        subscription_status: next.status,
        plan_interval: planInterval(next.productId),
        product_id: next.productId,
        subscription_expires_at: next.expiresAt,
        is_internal: isInternal,
      },
    });

    return json({ ok: true, action: action.kind }, 200);
  } catch (err) {
    console.error('[apple-assn] unhandled:', err);
    return json({ ok: false, error: 'internal_error' }, 500);
  }
});
