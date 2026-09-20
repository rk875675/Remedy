// Applies the two PostHog project-level settings that the taxonomy depends on but that no
// amount of app code can set: revenue event mapping, and internal-traffic exclusion.
//
// Split out from the app because these are console settings, not code — but kept *as* code
// so they are reviewable, idempotent, and reproducible if the project is ever rebuilt.
//
// Needs a personal API key with `project:write` (the read key in .env.local does not have
// it). Put it in .env.local as POSTHOG_PROJECT_WRITE_KEY, then:
//
//   node scripts/configure_posthog_project.mjs          # show the diff, change nothing
//   node scripts/configure_posthog_project.mjs --apply  # write it
//
// Safe to re-run: it PATCHes to a fixed desired state and re-reads to confirm.

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const KEY = env.POSTHOG_PROJECT_WRITE_KEY || env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = env.POSTHOG_PROJECT_ID || '470505';
const HOST = 'https://us.posthog.com';
const APPLY = process.argv.includes('--apply');

if (!KEY) {
  console.error('No POSTHOG_PROJECT_WRITE_KEY or POSTHOG_PERSONAL_API_KEY in .env.local');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

/**
 * Money events. `trial_started` is deliberately absent — a trial is not revenue.
 * `subscription_renewed` is included now that ASSN DID_RENEW is flowing.
 * Both share original_transaction_id so Revenue Analytics can stitch MRR/churn.
 */
const REVENUE_EVENT = {
  revenueProperty: 'revenue',
  revenueCurrencyProperty: { property: 'currency' },
  // We send minor units (7999 = $79.99), which is what this flag expects.
  currencyAwareDecimal: true,
  productProperty: 'product_id',
  subscriptionProperty: 'original_transaction_id',
};

const REVENUE_EVENTS = [
  { eventName: 'subscription_started', ...REVENUE_EVENT },
  { eventName: 'subscription_renewed', ...REVENUE_EVENT },
];

/**
 * Cohort 362128 ("Internal / Test users") matches `is_internal = true`, which the server
 * sets from `profiles.is_dev OR entitlements.is_sandbox`. The `environment` filter is the
 * belt-and-braces half: it catches sandbox *events* even if the person was never flagged.
 */
const TEST_ACCOUNT_FILTERS = [
  { key: 'id', type: 'cohort', value: 362128, operator: 'not_in' },
  { key: 'environment', type: 'event', value: ['sandbox'], operator: 'is_not' },
];

const current = await fetch(`${HOST}/api/projects/${PROJECT}/`, { headers }).then((r) => r.json());

console.log('current:');
console.log('  revenue events:      ', JSON.stringify(current.revenue_analytics_config?.events ?? []));
console.log('  test filters:        ', JSON.stringify(current.test_account_filters ?? []));
console.log('  filters on by default:', current.test_account_filters_default_checked ?? false);

const payload = {
  revenue_analytics_config: {
    ...(current.revenue_analytics_config ?? {}),
    base_currency: 'USD',
    events: REVENUE_EVENTS,
    // Revenue must never include our own sandbox purchases.
    filter_test_accounts: true,
  },
  test_account_filters: TEST_ACCOUNT_FILTERS,
  // Without this, every insight silently includes internal traffic until someone
  // remembers to flip the toggle. Defaults decide what the numbers actually say.
  test_account_filters_default_checked: true,
};

if (!APPLY) {
  console.log('\nwould apply:\n' + JSON.stringify(payload, null, 2));
  console.log('\n(dry run — pass --apply to write)');
  process.exit(0);
}

const res = await fetch(`${HOST}/api/projects/${PROJECT}/`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify(payload),
});

if (!res.ok) {
  const body = await res.text();
  console.error(`\nPATCH failed: HTTP ${res.status} ${body.slice(0, 400)}`);
  if (res.status === 403) {
    console.error('That key lacks `project:write`. Create one at ' +
      `${HOST}/project/${PROJECT}/settings/user-api-keys with Project: write.`);
  }
  process.exit(1);
}

const after = await fetch(`${HOST}/api/projects/${PROJECT}/`, { headers }).then((r) => r.json());
const events = after.revenue_analytics_config?.events ?? [];
const checks = [
  ['subscription_started registered as a revenue event',
    events.some((e) => e.eventName === 'subscription_started' && e.revenueProperty === 'revenue')],
  ['subscription_renewed registered as a revenue event',
    events.some((e) => e.eventName === 'subscription_renewed' && e.revenueProperty === 'revenue')],
  ['subscriptionProperty is original_transaction_id',
    events.every((e) => e.subscriptionProperty === 'original_transaction_id')],
  ['revenue reads minor units', events.every((e) => e.currencyAwareDecimal === true)],
  ['trial_started NOT booked as revenue', !events.some((e) => e.eventName === 'trial_started')],
  ['revenue excludes test accounts', after.revenue_analytics_config?.filter_test_accounts === true],
  ['internal cohort excluded',
    (after.test_account_filters ?? []).some((f) => f.type === 'cohort' && f.value === 362128)],
  ['sandbox events excluded',
    (after.test_account_filters ?? []).some((f) => f.key === 'environment')],
  ['filters on by default', after.test_account_filters_default_checked === true],
];

console.log('');
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
