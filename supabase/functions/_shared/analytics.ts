// Server-side analytics capture — the truth layer.
//
// Client events measure intent and experience and are lossy exactly when it
// matters most: the user force-quits between paying Apple and the app
// confirming it. Anything that must be *correct* — revenue, entitlement grants,
// subscription state — is captured here instead, from the code path that
// actually mutates the database.
//
// Direct HTTP rather than a PostHog SDK: one fetch is the entire surface we
// need, and pulling an SDK into every edge function would add cold-start cost
// for nothing.
//
// `distinctId` is ALWAYS the Supabase auth UUID — the same value the client
// passes to identify(). If these two ever diverge, server and client events
// land on different persons and every cross-layer funnel silently breaks.

const POSTHOG_KEY = (Deno.env.get('POSTHOG_PROJECT_KEY') ?? '').trim();
const POSTHOG_HOST = (Deno.env.get('POSTHOG_HOST') ?? 'https://us.i.posthog.com').trim();

/** Same kill-switch contract as the client: no key, no analytics, no errors. */
export const SERVER_ANALYTICS_ENABLED = POSTHOG_KEY.length > 0;

/**
 * A purchase verification already waits on two Apple round trips; a hung
 * analytics call must not be what makes it time out. PostHog being down can
 * cost us an event, but it can never cost us a grant.
 */
const CAPTURE_TIMEOUT_MS = 2500;

/**
 * Erasure credentials. Separate from the capture key on purpose: capture uses the public
 * project token, while erasure needs a personal API key scoped to person deletion. Private
 * API calls also go to a different host than ingestion (`us.posthog.com`, not `us.i.…`).
 */
const POSTHOG_PERSON_DELETE_KEY = (Deno.env.get('POSTHOG_PERSON_DELETE_KEY') ?? '').trim();
const POSTHOG_API_HOST = (Deno.env.get('POSTHOG_API_HOST') ?? 'https://us.posthog.com').trim();
const POSTHOG_PROJECT_ID = (Deno.env.get('POSTHOG_PROJECT_ID') ?? '').trim();

export const PERSON_ERASURE_ENABLED =
  POSTHOG_PERSON_DELETE_KEY.length > 0 && POSTHOG_PROJECT_ID.length > 0;

/** Erasure is a compliance obligation, so it gets a longer budget than capture. */
const ERASURE_TIMEOUT_MS = 5000;

/**
 * Distinct ID used for events that must survive a person's erasure.
 *
 * Deliberately a constant and never a user identifier: paired with
 * `$process_person_profile: false`, it lets us keep a churn count without keeping any link
 * to the human it came from.
 */
export const ANONYMOUS_DISTINCT_ID = 'account_deletions';

/** Every server event. Adding one means adding a row to docs/ANALYTICS.md §3.6. */
export type ServerEventName =
  | 'trial_started'
  | 'subscription_started'
  | 'subscription_restored'
  | 'subscription_renewed'
  | 'subscription_cancelled'
  | 'subscription_refunded'
  | 'dev_trial_granted'
  | 'promo_code_redeemed'
  | 'account_deleted';

type PropertyValue = string | number | boolean | null;
export type ServerProperties = Record<string, PropertyValue | undefined>;

function compact(properties: ServerProperties | undefined): Record<string, PropertyValue> {
  const out: Record<string, PropertyValue> = {};
  if (!properties) return out;
  for (const [key, value] of Object.entries(properties)) {
    if (value !== undefined) out[key] = value;
  }
  return out;
}

export interface ServerEventInput {
  /** Supabase auth UUID. Never an email, transaction id, or anything else. */
  distinctId: string;
  event: ServerEventName;
  /**
   * `sandbox` traffic is real but must be excluded from every production
   * number, so it is required rather than optional.
   */
  environment: 'sandbox' | 'production';
  /** Dev accounts and sandbox purchases, filtered out of production analysis. */
  isInternal: boolean;
  properties?: ServerProperties;
  /** Authoritative person state — survives the client never opening again. */
  personProperties?: ServerProperties;
  personPropertiesSetOnce?: ServerProperties;
  /**
   * `none` stores the event without creating or touching a person profile. Required for
   * anything captured about a user we are simultaneously erasing — otherwise the event
   * lands after the deletion and resurrects them as a brand-new person.
   */
  personProfile?: 'update' | 'none';
}

/**
 * Sends one event. Never throws and never rejects: a failure here is logged and
 * dropped, because no analytics call may turn a successful purchase into a
 * failed request.
 *
 * Awaited by callers rather than fired and forgotten — an edge isolate can be
 * torn down the moment its Response is returned, which would silently lose the
 * exact events this layer exists to guarantee.
 */
export async function captureServerEvent(input: ServerEventInput): Promise<void> {
  if (!SERVER_ANALYTICS_ENABLED) return;

  const properties: Record<string, PropertyValue | Record<string, PropertyValue>> = {
    ...compact(input.properties),
    environment: input.environment,
    is_internal: input.isInternal,
    // Marks the event as server-authored so a client/server discrepancy can be
    // investigated rather than guessed at.
    source: 'server',
  };

  if (input.personProfile === 'none') {
    properties.$process_person_profile = false;
  } else {
    const person = compact(input.personProperties);
    if (Object.keys(person).length > 0) properties.$set = person;

    const personOnce = compact(input.personPropertiesSetOnce);
    if (Object.keys(personOnce).length > 0) properties.$set_once = personOnce;
  }

  try {
    const response = await fetch(`${POSTHOG_HOST}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event: input.event,
        distinct_id: input.distinctId,
        properties,
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[analytics] capture ${input.event} failed: HTTP ${response.status}`);
    }
  } catch (err) {
    console.error(`[analytics] capture ${input.event} threw:`, err);
  }
}

/**
 * Erases a person and every event ever captured for them — PostHog's side of an account
 * deletion.
 *
 * Two steps, both verified against the live API rather than taken from the docs:
 *
 * 1. Resolve the person UUID from the distinct ID. `bulk_delete` accepts a `distinct_ids`
 *    field that would skip this, but it returns HTTP 500 on this project, so the lookup is
 *    not optional.
 * 2. `bulk_delete` with `delete_events` **in the body**. As a query parameter it is silently
 *    ignored: the call still reports success, but comes back
 *    `events_queued_for_deletion: false` and the person's events are left behind. That is a
 *    deletion that looks compliant and isn't, so the flag is asserted in the response below
 *    rather than assumed.
 *
 * PostHog removes events asynchronously during off-peak hours, so success means *accepted*,
 * not *already gone*.
 *
 * Never throws: a failed erasure must not turn a successful account deletion into an error
 * the user sees. It returns a result so the caller can log the discrepancy, which is the
 * only signal that a deletion still needs to be replayed by hand.
 */
export async function erasePostHogPerson(
  distinctId: string,
): Promise<{ ok: boolean; detail: string }> {
  if (!PERSON_ERASURE_ENABLED) {
    return { ok: false, detail: 'erasure_not_configured' };
  }
  const base = `${POSTHOG_API_HOST}/api/projects/${POSTHOG_PROJECT_ID}/persons`;
  const auth = {
    Authorization: `Bearer ${POSTHOG_PERSON_DELETE_KEY}`,
    'Content-Type': 'application/json',
  };
  try {
    const lookup = await fetch(
      `${base}/?distinct_id=${encodeURIComponent(distinctId)}`,
      { headers: auth, signal: AbortSignal.timeout(ERASURE_TIMEOUT_MS) },
    );
    if (!lookup.ok) return { ok: false, detail: `lookup_http_${lookup.status}` };

    const found = (await lookup.json()) as { results?: Array<{ id?: string }> };
    const ids = (found.results ?? []).map((p) => p.id).filter((id): id is string => !!id);

    // No person means nothing has been ingested under this ID yet — nothing to erase.
    // Not an error, but see §6.4: events still in flight will land afterwards.
    if (ids.length === 0) return { ok: true, detail: 'no_person_found' };

    const response = await fetch(`${base}/bulk_delete/`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ ids, delete_events: true }),
      signal: AbortSignal.timeout(ERASURE_TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, detail: `delete_http_${response.status}` };

    const result = (await response.json()) as {
      persons_deleted?: number;
      events_queued_for_deletion?: boolean;
    };
    if (!result.events_queued_for_deletion) {
      return { ok: false, detail: 'person_deleted_but_events_not_queued' };
    }
    return { ok: true, detail: `deleted_${result.persons_deleted ?? 0}_persons_with_events` };
  } catch (err) {
    return { ok: false, detail: `threw_${String(err).slice(0, 120)}` };
  }
}

// --- Shared derivations -----------------------------------------------------

/** Weekly vs monthly vs annual retention and LTV is the core pricing question (PRD §9). */
export function planInterval(
  productId: string | null | undefined,
): 'weekly' | 'monthly' | 'annual' | 'none' {
  if (!productId) return 'none';
  if (productId.includes('annual')) return 'annual';
  if (productId.includes('weekly')) return 'weekly';
  if (productId.includes('monthly')) return 'monthly';
  return 'none';
}

/**
 * List prices in **minor units** (cents), used only when Apple's transaction
 * omits a price. PostHog treats revenue as minor units to avoid float drift.
 *
 * A stale entry here is a wrong revenue number, so Apple's verified price is
 * always preferred — this exists so an older transaction without one still
 * reports something rather than nothing.
 */
const LIST_PRICE_MINOR: Readonly<Record<string, number>> = {
  'com.remedyapp.weekly': 499,
  'com.remedyapp.monthly': 1299,
  'com.remedyapp.annual': 7999,
  'com.remedyapp.weekly.no.trial': 499,
  'com.remedyapp.monthly.no.trial': 1299,
  'com.remedyapp.annual.no.trial': 7999,
};

export interface RevenueFields {
  revenue: number;
  currency: string;
  revenue_source: 'apple' | 'list_price';
}

/**
 * Apple reports `price` in **milliunits** (12.99 USD → 12990); PostHog wants
 * minor units (1299). `revenue_source` records which path was taken, so a
 * pricing change that outdates the fallback table is visible in the data rather
 * than silently wrong.
 */
export function revenueFields(
  productId: string,
  applePriceMilliunits: number | undefined,
  appleCurrency: string | undefined,
): RevenueFields | null {
  if (applePriceMilliunits !== undefined && applePriceMilliunits > 0) {
    return {
      revenue: Math.round(applePriceMilliunits / 10),
      currency: (appleCurrency ?? 'USD').toUpperCase(),
      revenue_source: 'apple',
    };
  }
  const fallback = LIST_PRICE_MINOR[productId];
  if (fallback === undefined) return null;
  return { revenue: fallback, currency: 'USD', revenue_source: 'list_price' };
}
