// Parses the typed event definitions in lib/analytics/events/ into a plain map, so tooling
// can check itself against the taxonomy instead of against a hand-maintained second copy.
//
// The Zod schemas are the only artifact that proves what the app can actually emit, which
// makes them the right source of truth for both the Phase 4 insight preflight and the
// Phase 5 device verification.

import { existsSync, readdirSync, readFileSync } from 'node:fs';

const EVENTS_DIR = new URL('../../lib/analytics/events/', import.meta.url);
const ONBOARDING_DIR = new URL('../../app/(onboarding)/', import.meta.url);

/**
 * The onboarding funnel, split into the steps that emit `onboarding_step_completed` and
 * the interstitials that do not.
 *
 * Both halves are read out of the source rather than listed here. The order comes from the
 * `onboardingStepKey` enum (which is what assigns `step_index`), and a step counts as a
 * question only if its screen actually calls `useOnboardingStepCompletion`. Hardcoding
 * either one means a reordered or added step quietly turns this check into a lie — which
 * is exactly how the first version of it produced a false failure.
 *
 * @returns {{ stepKeys: string[], questionStepIndices: number[], interstitials: string[] }}
 */
export function loadOnboardingFlow() {
  const enums = readFileSync(new URL('enums.ts', EVENTS_DIR), 'utf8');
  const block = enums.match(/export const onboardingStepKey = z\.enum\(\[([\s\S]*?)\]\)/);
  if (!block) throw new Error('could not find onboardingStepKey enum in events/enums.ts');
  const stepKeys = [...block[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1]);

  const questionStepIndices = [];
  const interstitials = [];
  stepKeys.forEach((key, index) => {
    // Mirrors STEP_BY_SCREEN in lib/analytics/onboardingSteps.ts: welcome is the group index.
    const file = new URL(key === 'welcome' ? 'index.tsx' : `${key}.tsx`, ONBOARDING_DIR);
    const src = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (src.includes('useOnboardingStepCompletion')) questionStepIndices.push(index);
    else interstitials.push(key);
  });
  return { stepKeys, questionStepIndices, interstitials };
}

function propsFrom(body, bundles) {
  // Anchored on `{`, `,` or a newline so single-line schemas
  // (`z.object({ exercise_id: uuid, reason: videoFailureReason })`) yield every key, not
  // just the first one.
  const props = [...body.matchAll(/(?:^|[{,\n])\s*([a-z0-9_]+)\s*:/g)].map((m) => m[1]);
  for (const spread of body.matchAll(/\.\.\.(\w+)/g)) {
    props.push(...(bundles.get(spread[1]) ?? []));
  }
  return props;
}

/** @returns {Map<string, Set<string>>} event name -> property names */
export function loadTaxonomy() {
  const taxonomy = new Map();
  for (const file of readdirSync(EVENTS_DIR)) {
    if (!file.endsWith('.ts') || file === 'defineEvent.ts' || file === 'enums.ts') continue;
    const src = readFileSync(new URL(file, EVENTS_DIR), 'utf8');

    // Shared property bundles (`const stepBase = { … }`, spread into schemas as `...stepBase`).
    const bundles = new Map();
    for (const m of src.matchAll(/const (\w+) = \{([^}]*)\}/g)) {
      bundles.set(m[1], propsFrom(m[2], new Map()));
    }
    // Named schemas (`const attemptStarted = z.object({ … })`) referenced by defineEvent.
    const named = new Map();
    for (const m of src.matchAll(/const (\w+) = z\.object\(\{([\s\S]*?)\}\)\.strict\(\)/g)) {
      named.set(m[1], propsFrom(m[2], bundles));
    }

    for (const m of src.matchAll(/defineEvent(WithoutProperties)?\(\s*'([a-z0-9_]+)'\s*(,)?/g)) {
      const name = m[2];
      if (m[1]) { taxonomy.set(name, new Set()); continue; }
      const after = src.slice(m.index);
      const ref = after.match(/^defineEvent\(\s*'[a-z0-9_]+'\s*,\s*(\w+)\s*\)/);
      if (ref && named.has(ref[1])) { taxonomy.set(name, new Set(named.get(ref[1]))); continue; }
      const objAt = after.indexOf('.object({');
      if (objAt === -1) { taxonomy.set(name, new Set()); continue; }
      let depth = 0, end = -1;
      for (let i = objAt + '.object('.length; i < after.length; i++) {
        if (after[i] === '{') depth++;
        else if (after[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
      }
      taxonomy.set(name, new Set(propsFrom(after.slice(objAt + '.object({'.length, end), bundles)));
    }
  }
  return taxonomy;
}

/**
 * Server-only events (§3.6). Their properties are not described by the client schemas.
 *
 * The trailing `;?` matters: the last member of the `ServerEventName` union ends with a
 * semicolon, and without it `account_deleted` was silently missing from the set — which
 * made a real, correctly-emitted event look like taxonomy drift.
 */
export function loadServerEvents() {
  const src = readFileSync(new URL('../../supabase/functions/_shared/analytics.ts', import.meta.url), 'utf8');
  return new Set([...src.matchAll(/^\s*\|?\s*'([a-z0-9_]+)'\s*;?\s*$/gm)].map((m) => m[1]));
}

/**
 * Emitted by our own verification scripts, never by the app. Excluded from drift detection
 * so tooling artifacts cannot masquerade as product events — or fail the check forever.
 */
export const TOOLING_EVENTS = new Set(['probe_event']);

/**
 * The instrumentation cutover. Events before this date belong to the pre-Phase-2 ad-hoc
 * taxonomy (§0.6) — including `onboarding_hear_about`, which no longer exists in the code.
 * Nothing should ever be judged against data older than this.
 */
export const CUTOVER = '2026-08-09';

/** Emitted by posthog-react-native lifecycle autocapture, confirmed present in §0.6. */
export const SDK_EVENTS = new Set([
  'Application Installed', 'Application Opened',
  'Application Became Active', 'Application Backgrounded', 'Application Updated',
  '$screen', '$identify', '$create_alias', '$set', '$feature_flag_called',
  '$groupidentify', '$pageview', '$autocapture', 'survey shown', 'survey sent',
]);

/** Properties we attach to SDK events ($screen) or the SDK attaches itself. */
export const SDK_EVENT_PROPS = new Set([
  '$screen_name', 'previous_screen',
  'is_authenticated', 'is_onboarded', 'is_premium', 'has_active_plan', 'is_retaking',
  'from_background',
]);

/** Person properties set by the client identity sync and the server truth layer (§4). */
export const PERSON_PROPS = new Set([
  'is_premium', 'subscription_status', 'plan_interval', 'product_id', 'is_internal',
  'subscription_expires_at', 'first_purchase_at', 'first_product_id',
  'acquisition_source', 'signup_method', 'activity_level', 'pain_duration', 'pain_location',
  'equipment_tier', 'sessions_per_week_preference', 'primary_goal', 'paywall_variant_id',
  'has_red_flag', 'prior_attempts', 'session_length',
  'paywall_experiment_id', 'program_week', 'first_session_completed_at',
]);

/** Attached by the server to every event it sends. */
export const SERVER_EVENT_PROPS = new Set([
  'revenue', 'currency', 'revenue_source', 'source', 'environment', 'is_internal',
]);
