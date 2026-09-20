// Phase 5 — device verification, automated.
//
// Turns the §9 checklist in docs/ANALYTICS.md from a list of things to eyeball into a
// pass/fail run. Do the device walkthrough, then run this.
//
//   node scripts/verify_phase5_device.mjs                  # static checks + last 24h of data
//   node scripts/verify_phase5_device.mjs --since 2h       # narrow to the run you just did
//   node scripts/verify_phase5_device.mjs --since 2026-08-11T14:00:00Z
//   node scripts/verify_phase5_device.mjs --static         # no PostHog calls
//   node scripts/verify_phase5_device.mjs --include-internal   # keep dev/sandbox traffic
//
// By default internal traffic is EXCLUDED, matching every dashboard. During a dev-device
// run your own person is almost certainly flagged `is_internal`, so pass
// --include-internal or the data checks will all come back inconclusive.
//
// Three outcomes, and the distinction matters:
//   PASS   the check ran and the data is right
//   FAIL   the check ran and the data is wrong — a real problem
//   SKIP   the required events have not arrived, so the check could not run
// SKIP is not failure. Before the device run everything data-driven is SKIP. Only FAIL
// blocks. Exit code is non-zero only on FAIL.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import {
  CUTOVER, loadOnboardingFlow, loadTaxonomy, loadServerEvents, SDK_EVENTS, TOOLING_EVENTS,
} from './lib/taxonomy.mjs';

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const PROJECT = env.POSTHOG_PROJECT_ID || '470505';
const API = `https://us.posthog.com/api/projects/${PROJECT}`;
const H = { Authorization: `Bearer ${env.POSTHOG_PERSONAL_API_KEY}`, 'Content-Type': 'application/json' };

const argv = process.argv.slice(2);
const STATIC_ONLY = argv.includes('--static');
const INCLUDE_INTERNAL = argv.includes('--include-internal');
const sinceArg = (() => {
  const i = argv.indexOf('--since');
  return i !== -1 ? argv[i + 1] : '24h';
})();

/** HogQL time bound. Accepts `24h` / `2h` / `7d` or an absolute ISO timestamp. */
const SINCE = /^\d+[hd]$/.test(sinceArg)
  ? `now() - INTERVAL ${sinceArg.slice(0, -1)} ${sinceArg.endsWith('h') ? 'HOUR' : 'DAY'}`
  : `toDateTime('${sinceArg.replace('T', ' ').replace('Z', '')}')`;

/**
 * Dev devices are flagged internal, and every dashboard excludes them. So the harness
 * defaults to the same lens the dashboards use, and --include-internal is the escape hatch
 * for verifying your own run.
 */
// Filtered by cohort membership rather than by `person.properties.is_internal`, because
// that is what the dashboards do and the two do not agree. Person properties on the events
// table are frozen at ingestion (person-on-events), so reading the property here still
// counted a device run that was flagged internal afterwards — the harness reported 312
// events of "production" traffic that every insight had already excluded. Cohort
// membership is evaluated against the person as they are now, which makes flagging
// retroactive and the two views consistent.
const INTERNAL_COHORT = 362128;
const INTERNAL_CLAUSE = INCLUDE_INTERNAL
  ? ''
  : ` AND person_id NOT IN (SELECT person_id FROM cohort_people WHERE cohort_id = ${INTERNAL_COHORT})`;

const results = [];
const pass = (name, detail = '') => results.push({ s: 'PASS', name, detail });
const fail = (name, detail = '') => results.push({ s: 'FAIL', name, detail });
const skip = (name, detail = '') => results.push({ s: 'SKIP', name, detail });

async function hogql(query) {
  const res = await fetch(`${API}/query/`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${text.slice(0, 300)}`);
  return JSON.parse(text).results ?? [];
}

// =============================================================================
// Static checks — no device or data required
// =============================================================================

const taxonomy = loadTaxonomy();
const serverEvents = loadServerEvents();

function walkSource(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (['node_modules', '.git', '.expo', 'dist', 'ios', 'android', 'scripts'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walkSource(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const sourceFiles = walkSource('.');

/** Comments discuss the SDK by name all over this codebase; only real code counts. */
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

// §9: exactly one file may construct the PostHog SDK. Two runtime importers means two
// clients, which is precisely what broke the anon→auth merge before Phase 1 (§0.5).
// A `import type` is erased at compile time and cannot construct anything, so it does not
// count — otherwise the facade's own type annotation would look like a violation.
{
  const runtime = [];
  const typeOnly = [];
  for (const f of sourceFiles) {
    const code = stripComments(readFileSync(f, 'utf8'));
    const name = f.replace(/\\/g, '/');
    if (/import\s+type\s+[^;]*from\s*['"]posthog-react-native['"]/.test(code)) typeOnly.push(name);
    if (/(^|[^e])\bimport\s*\(\s*['"]posthog-react-native['"]/.test(code)
      || /^\s*import\s+(?!type\b)[^;]*from\s*['"]posthog-react-native['"]/m.test(code)) {
      runtime.push(name);
    }
  }
  const detail = `runtime: ${runtime.join(', ') || 'none'}${typeOnly.length ? ` | type-only: ${typeOnly.join(', ')}` : ''}`;
  if (runtime.length === 1) pass('exactly one file constructs the PostHog SDK', detail);
  else fail('exactly one file constructs the PostHog SDK', `${runtime.length} runtime importers — ${detail}`);
}

// §6.1: no event may carry PII or an unbounded string.
{
  const FORBIDDEN = ['email', 'display_name', 'push_token', 'full_name', 'phone', 'address',
    'password', 'access_token', 'refresh_token', 'signed_url', 'video_url', 'avatar_url'];
  const offenders = [];
  for (const [event, props] of taxonomy) {
    for (const p of props) if (FORBIDDEN.includes(p)) offenders.push(`${event}.${p}`);
  }
  if (offenders.length === 0) pass('no PII property names in any event schema', `${taxonomy.size} events scanned`);
  else fail('no PII property names in any event schema', offenders.join(', '));
}

// The facade boundary: product code must not call capture() directly.
{
  const leaks = sourceFiles.filter((f) => {
    if (f.replace(/\\/g, '/').includes('lib/analytics/')) return false;
    return /\bcapture\(/.test(stripComments(readFileSync(f, 'utf8')));
  });
  if (leaks.length === 0) pass('no direct capture() calls outside lib/analytics');
  else fail('no direct capture() calls outside lib/analytics', leaks.join(', '));
}

if (STATIC_ONLY) {
  report();
}

// =============================================================================
// Data checks — require a completed device run
// =============================================================================

// Floored at the cutover no matter what --since says. A wider window would drag in the
// pre-Phase-2 taxonomy (§0.6) and report long-dead event names as live drift.
const WINDOW = `timestamp > ${SINCE} AND timestamp >= toDateTime('${CUTOVER} 00:00:00')`;

// How much instrumented traffic is even in the window? Everything below is conditional on
// this, so that "you haven't run the device yet" reads as SKIP rather than a wall of FAIL.
let volume = [];
try {
  volume = await hogql(
    `SELECT event, count() AS c, uniq(person_id) AS people
     FROM events WHERE ${WINDOW}${INTERNAL_CLAUSE}
     GROUP BY event ORDER BY c DESC`,
  );
} catch (e) {
  console.error(`Could not reach PostHog: ${String(e).slice(0, 200)}`);
  process.exit(2);
}

const seen = new Map(volume.map((r) => [r[0], { count: r[1], people: r[2] }]));
const has = (e) => (seen.get(e)?.count ?? 0) > 0;
const anyClientEvent = [...taxonomy.keys()].some(has);

console.log(`window: ${sinceArg}   internal traffic: ${INCLUDE_INTERNAL ? 'included' : 'excluded'}`);
console.log(`${volume.length} distinct events, ${volume.reduce((a, r) => a + r[1], 0)} total\n`);

// --- taxonomy drift ---------------------------------------------------------
// §0.6 found `onboarding_download_reason` orphaned in PostHog after a rename. This is the
// check that would have caught it.
{
  const unknown = volume
    .map((r) => r[0])
    .filter((e) => !taxonomy.has(e) && !serverEvents.has(e) && !SDK_EVENTS.has(e) && !TOOLING_EVENTS.has(e));
  if (!volume.length) skip('no unknown event names arriving', 'no traffic in window');
  else if (unknown.length === 0) pass('no unknown event names arriving', `${volume.length} names, all declared`);
  else fail('no unknown event names arriving', `not in taxonomy: ${unknown.join(', ')}`);
}

// Properties arriving that the schema does not declare — the other half of drift.
if (anyClientEvent) {
  const rows = await hogql(
    `SELECT event, arrayJoin(JSONExtractKeys(properties)) AS prop, count() AS c
     FROM events WHERE ${WINDOW}${INTERNAL_CLAUSE}
       AND event IN (${[...taxonomy.keys()].map((e) => `'${e}'`).join(',')})
     GROUP BY event, prop`,
  );
  const undeclared = rows
    .filter(([event, prop]) => !prop.startsWith('$') && !taxonomy.get(event)?.has(prop))
    .filter(([, prop]) => !['source', 'environment', 'is_internal'].includes(prop))
    .map(([event, prop]) => `${event}.${prop}`);
  if (undeclared.length === 0) pass('no undeclared properties arriving');
  else fail('no undeclared properties arriving', [...new Set(undeclared)].join(', '));
} else {
  skip('no undeclared properties arriving', 'no client events yet');
}

// --- runaway events ---------------------------------------------------------
// A React effect whose dependency is rebuilt every render re-runs every render, and if it
// also sets state it loops — emitting the same event several times a second for as long as
// the screen is open. The first device run hit exactly this: `onboarding_plan_previewed`
// fired 163 times in 113 seconds, over half of all events captured, while re-invoking an
// edge function at the same rate. Nothing else here would have caught it: the name and the
// properties were entirely valid, only the volume was insane.
//
// Human-paced repetition is the thing to stay under. A user tapping options quickly still
// lands well below one event per second sustained, so a run of 20+ at >0.5/s is a loop.
if (anyClientEvent) {
  const rows = await hogql(
    `SELECT event, person_id, count() AS c,
            dateDiff('second', min(timestamp), max(timestamp)) AS span
     FROM events WHERE ${WINDOW}${INTERNAL_CLAUSE} AND event NOT LIKE '$%'
     GROUP BY event, person_id HAVING c >= 20 AND c / greatest(span, 1) > 0.5
     ORDER BY c DESC LIMIT 10`,
  );
  if (rows.length === 0) {
    pass('no event firing at machine speed');
  } else {
    fail('no event firing at machine speed', rows
      .map(([e, , c, span]) => `${e}: ${c}x in ${span}s (${(c / Math.max(span, 1)).toFixed(1)}/s)`)
      .join('; '));
  }
} else {
  skip('no event firing at machine speed', 'no client events yet');
}

// --- screen tracking --------------------------------------------------------
if (has('$screen')) {
  const rows = await hogql(
    `SELECT DISTINCT properties.$screen_name FROM events
     WHERE event = '$screen' AND ${WINDOW}${INTERNAL_CLAUSE} LIMIT 100`,
  );
  const names = rows.map((r) => r[0]).filter(Boolean);
  // A raw UUID or numeric id in a screen name means the route was not normalized, which
  // would make $screen_name unbounded-cardinality.
  const unnormalized = names.filter((n) =>
    /[0-9a-f]{8}-[0-9a-f]{4}/i.test(n) || /\/\d+(\/|$)/.test(n));
  if (unnormalized.length === 0) pass('screen names are normalized route patterns', `${names.length} distinct`);
  else fail('screen names are normalized route patterns', `raw ids leaked: ${unnormalized.slice(0, 5).join(', ')}`);
} else {
  skip('screen names are normalized route patterns', 'no $screen events yet');
}

// --- onboarding step ordering ----------------------------------------------
// Only *question* screens emit `onboarding_step_completed` — they are the ones that call
// `useOnboardingStepCompletion`. The interstitials (welcome, founder, education,
// seen, alarm, why, finalizing, match) have no answer to complete and report forward progress through
// `onboarding_step_exited` instead. The expected indices are therefore derived from the
// step enum and the screens that actually wire up completion, not hardcoded: a step added
// or reordered changes this check automatically instead of silently invalidating it.
const { questionStepIndices } = loadOnboardingFlow();
const expected = questionStepIndices.join(',');
const LABEL = `onboarding question steps [${expected}] complete in order`;

if (has('onboarding_step_completed')) {
  const rows = await hogql(
    `SELECT toInt(properties.step_index) AS idx, any(toString(properties.step_key)) AS k, uniq(person_id)
     FROM events WHERE event = 'onboarding_step_completed' AND ${WINDOW}${INTERNAL_CLAUSE}
     GROUP BY idx ORDER BY idx`,
  );
  const indices = rows.map((r) => r[0]);
  if (indices.length === 0) {
    skip(LABEL, 'no step events');
  } else if (indices.join(',') === expected) {
    pass(LABEL, `${indices.length} question steps, no gaps`);
  } else {
    const missing = questionStepIndices.filter((i) => !indices.includes(i));
    const unexpected = indices.filter((i) => !questionStepIndices.includes(i));
    fail(LABEL,
      `saw [${indices.join(',')}]` +
      (missing.length ? ` — missing ${missing.join(',')}` : '') +
      (unexpected.length ? ` — interstitial/unknown steps completed: ${unexpected.join(',')}` : ''));
  }
} else {
  skip(LABEL, 'no onboarding_step_completed yet');
}

// --- the identity merge — the highest-risk thing in the whole design (§0.3) --
if (has('onboarding_started') || has('signup_completed')) {
  const rows = await hogql(
    `SELECT
       countIf(pre > 0 AND post > 0) AS merged,
       countIf(pre > 0 AND post = 0) AS anon_only,
       countIf(pre = 0 AND post > 0) AS orphaned
     FROM (
       SELECT person_id,
              countIf(event IN ('onboarding_started','onboarding_step_completed','paywall_viewed')) AS pre,
              countIf(event IN ('signup_completed','program_assigned','session_completed')) AS post
       FROM events WHERE ${WINDOW}${INTERNAL_CLAUSE}
       GROUP BY person_id
     )`,
  );
  const [merged, anonOnly, orphaned] = rows[0] ?? [0, 0, 0];
  if (orphaned === 0 && merged > 0) {
    pass('anon → auth merge holds', `${merged} merged, ${anonOnly} still anonymous, 0 orphaned`);
  } else if (orphaned > 0) {
    fail('anon → auth merge holds',
      `${orphaned} person(s) have post-auth events with no pre-auth history — funnel is orphaned`);
  } else {
    skip('anon → auth merge holds', 'no person has completed both halves yet');
  }
} else {
  skip('anon → auth merge holds', 'no onboarding or signup events yet');
}

// acquisition_source is set at q0, before any account exists. Its presence on an identified
// person is the cleanest proof the merge carried pre-auth state across.
if (has('signup_completed')) {
  const rows = await hogql(
    `SELECT countIf(isNotNull(person.properties.acquisition_source)), count()
     FROM events WHERE event = 'signup_completed' AND ${WINDOW}${INTERNAL_CLAUSE}`,
  );
  const [withSrc, total] = rows[0] ?? [0, 0];
  if (total === 0) skip('acquisition_source survives the merge', 'no signups');
  else if (withSrc === total) pass('acquisition_source survives the merge', `${withSrc}/${total}`);
  else fail('acquisition_source survives the merge', `only ${withSrc}/${total} identified persons carry it`);
} else {
  skip('acquisition_source survives the merge', 'no signup_completed yet');
}

// --- backgrounding produces a real exit, not an infinite dwell --------------
for (const [event, prop] of [['onboarding_step_exited', 'exit_type'], ['session_abandoned', 'exit_type']]) {
  if (!has(event)) { skip(`${event} records backgrounding`, `no ${event} yet`); continue; }
  const rows = await hogql(
    `SELECT toString(properties.${prop}) AS t, count() FROM events
     WHERE event = '${event}' AND ${WINDOW}${INTERNAL_CLAUSE} GROUP BY t`,
  );
  const kinds = rows.map((r) => r[0]);
  if (kinds.includes('backgrounded')) pass(`${event} records backgrounding`, kinds.join(', '));
  else fail(`${event} records backgrounding`, `exit types seen: ${kinds.join(', ') || 'none'} — no "backgrounded"`);
}

/**
 * The server event a successful purchase produces, which depends on the product.
 *
 * `verify-purchase` emits `trial_started` only when Apple reports `inTrialPeriod`; the
 * `.no.trial` products go straight to `subscription_started`. Keying the paid-path checks
 * on `trial_started` alone meant a perfectly successful purchase of a no-trial product
 * reported "awaiting data" forever.
 */
const PURCHASE_EVENTS = ['trial_started', 'subscription_started'];
const purchaseEvent = PURCHASE_EVENTS.find((e) => has(e)) ?? null;
const PURCHASE_IN = PURCHASE_EVENTS.map((e) => `'${e}'`).join(',');

// --- funnels F1–F7 must actually fill in ------------------------------------
{
  const FUNNELS = {
    'F1 install→activation': ['Application Installed', 'onboarding_started', 'onboarding_completed',
      'paywall_viewed', 'purchase_flow_completed', 'signup_completed', 'program_assigned', 'session_completed'],
    'F3 monetization': ['paywall_viewed', 'paywall_presented', 'purchase_started',
      'purchase_flow_completed', purchaseEvent ?? 'trial_started|subscription_started'],
    'F4 session completion': ['session_start_tapped', 'session_previewed', 'session_started',
      'exercise_started', 'session_completed'],
    'F5 auth': ['signup_started', 'signup_completed'],
    'F6 restore': ['restore_started', 'restore_succeeded'],
  };
  for (const [label, steps] of Object.entries(FUNNELS)) {
    const missing = steps.filter((s) => !has(s));
    if (missing.length === steps.length) { skip(`${label} has data`, 'no steps fired'); continue; }
    if (missing.length) fail(`${label} has data`, `steps never fired: ${missing.join(', ')}`);
    else pass(`${label} has data`, steps.map((s) => seen.get(s).count).join(' → '));
  }
}

// --- the paid path ----------------------------------------------------------
if (purchaseEvent) {
  const rows = await hogql(
    `SELECT toString(properties.environment), toString(properties.is_internal),
            toString(properties.source), count()
     FROM events WHERE event = '${purchaseEvent}' AND ${WINDOW}
     GROUP BY 1, 2, 3`,
  );
  const sandbox = rows.filter((r) => r[0] === 'sandbox');
  if (!sandbox.length) fail(`sandbox ${purchaseEvent} tagged correctly`, `environments seen: ${rows.map((r) => r[0]).join(', ')}`);
  else if (sandbox.every((r) => r[1] === 'true' && r[2] === 'server')) {
    pass(`sandbox ${purchaseEvent} tagged correctly`, 'environment=sandbox, is_internal=true, source=server');
  } else {
    fail(`sandbox ${purchaseEvent} tagged correctly`, JSON.stringify(sandbox));
  }

  // Idempotency: replaying a verification must not double-book a purchase. Checked across
  // both events, because a trial converting to paid is one transaction legitimately
  // producing one of each — but never two of the same.
  const dupes = await hogql(
    `SELECT event, toString(properties.original_transaction_id) AS txn, count() AS c
     FROM events WHERE event IN (${PURCHASE_IN}) AND ${WINDOW}
     GROUP BY event, txn HAVING c > 1`,
  );
  if (dupes.length === 0) pass('exactly one purchase event per transaction');
  else fail('exactly one purchase event per transaction', dupes.map((d) => `${d[0]} ${d[1]}×${d[2]}`).join(', '));

  // The client and server halves must land on one person, or revenue is unattributable.
  const split = await hogql(
    `SELECT uniqIf(person_id, event = 'purchase_flow_completed') AS client_people,
            uniqIf(person_id, event IN (${PURCHASE_IN})) AS server_people,
            uniq(person_id) AS combined
     FROM events WHERE event IN ('purchase_flow_completed',${PURCHASE_IN}) AND ${WINDOW}`,
  );
  const [clientP, serverP, combined] = split[0] ?? [0, 0, 0];
  if (!clientP || !serverP) skip('client and server purchase land on one person', 'only one half present');
  else if (combined === Math.max(clientP, serverP)) {
    pass('client and server purchase land on one person', `${combined} person(s)`);
  } else {
    fail('client and server purchase land on one person',
      `client=${clientP}, server=${serverP}, combined=${combined} — the halves are on different people`);
  }
} else {
  const why = 'no trial_started or subscription_started yet';
  skip('sandbox purchase event tagged correctly', why);
  skip('exactly one purchase event per transaction', why);
  skip('client and server purchase land on one person', why);
}

// --- no PII reached PostHog at runtime --------------------------------------
if (anyClientEvent) {
  const rows = await hogql(
    `SELECT DISTINCT arrayJoin(JSONExtractKeys(properties)) AS prop
     FROM events WHERE ${WINDOW}${INTERNAL_CLAUSE}
       AND event IN (${[...taxonomy.keys()].map((e) => `'${e}'`).join(',')})`,
  );
  const suspicious = rows.map((r) => r[0]).filter((p) =>
    /email|phone|password|token|address|full_?name|display_?name|url/i.test(p));
  if (suspicious.length === 0) pass('no PII-shaped property names reached PostHog');
  else fail('no PII-shaped property names reached PostHog', suspicious.join(', '));
} else {
  skip('no PII-shaped property names reached PostHog', 'no client events yet');
}

report();

// =============================================================================

function report() {
  const w = Math.max(...results.map((r) => r.name.length));
  console.log('');
  for (const r of results) {
    console.log(`${r.s}  ${r.name.padEnd(w)}${r.detail ? `  ${r.detail}` : ''}`);
  }
  const p = results.filter((r) => r.s === 'PASS').length;
  const f = results.filter((r) => r.s === 'FAIL').length;
  const s = results.filter((r) => r.s === 'SKIP').length;
  console.log(`\n${p} passed, ${f} failed, ${s} skipped (awaiting data)`);
  if (f) {
    console.log('\nFAILURES:');
    for (const r of results.filter((x) => x.s === 'FAIL')) console.log(`  - ${r.name}: ${r.detail}`);
  } else if (s) {
    console.log('\nNo failures. Skipped checks need a device run — see docs/ANALYTICS.md §9.');
  }
  process.exit(f ? 1 : 0);
}
