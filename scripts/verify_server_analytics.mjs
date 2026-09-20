// Phase 3 verification: proves server-authored events actually reach PostHog.
//
// Runs the real chain end to end against the linked project — creates a throwaway dev
// user, calls the deployed grant-dev-trial and delete-account functions with that user's
// JWT, then queries PostHog to confirm the events and person properties landed. The user
// is deleted by the test itself (delete-account is one of the things under test).
//
// Reads every credential from the environment. Nothing is printed but event names,
// property values, and pass/fail.

import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

const SUPABASE_URL = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON_KEY = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
// Read from a file rather than an env var: the key travels through a PowerShell hand-off
// that mangled it into table-rendering characters, which surfaced as an opaque
// "cannot convert to ByteString" failure when it was used as a header.
const SERVICE_KEY = readFileSync(process.env.SERVICE_KEY_FILE, 'utf8').trim();
const PH_KEY = env.EXPO_PUBLIC_POSTHOG_KEY;
const PH_HOST = env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
const PH_PERSONAL = env.POSTHOG_PERSONAL_API_KEY;
const PH_DELETE_KEY = env.POSTHOG_PERSONAL_API_DELETE_KEY;
const PH_PROJECT = process.env.POSTHOG_PROJECT_ID || '470505';
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = readFileSync('supabase/.temp/project-ref', 'utf8').trim();

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function hogql(query) {
  const res = await fetch(`https://us.posthog.com/api/projects/${PH_PROJECT}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PH_PERSONAL}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) throw new Error(`HogQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).results ?? [];
}

/**
 * Ingestion is async and measured in minutes, not seconds, on a low-volume project — a
 * 60s window produced a false negative on the first run.
 */
async function waitForRows(query, { attempts = 45, delayMs = 8000 } = {}) {
  for (let i = 0; i < attempts; i++) {
    const rows = await hogql(query);
    if (rows.length > 0) return rows;
    await sleep(delayMs);
  }
  return [];
}

// --- 1. The capture contract itself ----------------------------------------
// Sent with the exact payload shape _shared/analytics.ts builds, so a mistake in the
// endpoint, envelope, or $set semantics fails here rather than in production.
const probeId = `phase3-probe-${Date.now()}`;
{
  const res = await fetch(`${PH_HOST}/i/v0/e/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: PH_KEY,
      event: 'subscription_started',
      distinct_id: probeId,
      properties: {
        product_id: 'com.remedyapp.annual',
        plan_interval: 'annual',
        revenue: 7999,
        currency: 'USD',
        revenue_source: 'list_price',
        environment: 'sandbox',
        is_internal: true,
        source: 'server',
        $set: { is_premium: true, subscription_status: 'active', is_internal: true },
        $set_once: { first_purchase_at: new Date().toISOString() },
      },
      timestamp: new Date().toISOString(),
    }),
  });
  check('capture endpoint accepts the helper payload', res.ok, `HTTP ${res.status}`);
}

// --- 2. Full chain through a deployed edge function -------------------------
const testEmail = `phase3-verify-${Date.now()}@remedy-analytics-test.invalid`;
const testPassword = `Ph3-${Math.random().toString(36).slice(2)}-${Date.now()}`;
let userId = null;
let jwt = null;

async function admin(path, init = {}) {
  return fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

try {
  const createRes = await admin('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: testEmail, password: testPassword, email_confirm: true }),
  });
  const created = await createRes.json();
  userId = created.id ?? null;
  check('throwaway test user created', !!userId, userId ? `id ${userId.slice(0, 8)}…` : JSON.stringify(created).slice(0, 200));

  if (userId) {
    // grant-dev-trial requires is_dev, and it also marks every event internal so this
    // verification cannot contaminate production numbers.
    //
    // Set through the management API rather than PostgREST: service_role has SELECT but
    // not UPDATE on profiles (migration 004 grants UPDATE to `authenticated` only), so the
    // obvious PATCH returns 42501.
    const patch = await fetch(
      `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `UPDATE public.profiles SET is_dev = true WHERE id = '${userId}';` }),
      },
    );
    check('test user flagged is_dev', patch.ok, patch.ok ? '' : (await patch.text()).slice(0, 200));

    const signIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });
    const session = await signIn.json();
    jwt = session.access_token ?? null;
    check('signed in as test user', !!jwt);
  }

  if (jwt) {
    const grant = await fetch(`${SUPABASE_URL}/functions/v1/grant-dev-trial`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const grantBody = await grant.json();
    check('grant-dev-trial succeeded', grant.ok && grantBody.success === true, JSON.stringify(grantBody).slice(0, 200));

    // Replay guard: a second call must not produce a second analytics event.
    const replay = await fetch(`${SUPABASE_URL}/functions/v1/grant-dev-trial`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    check('grant-dev-trial replay still returns success', replay.ok);

    // Erasure can only be tested once a person actually exists in PostHog. Deleting before
    // ingestion catches up would exercise the "nothing to erase" path and prove nothing.
    console.log('\nwaiting for the test user to materialise as a PostHog person…\n');
    let personExisted = false;
    let personProps = null;
    for (let i = 0; i < 45; i++) {
      const res = await fetch(
        `https://us.posthog.com/api/projects/${PH_PROJECT}/persons/?distinct_id=${userId}`,
        { headers: { Authorization: `Bearer ${PH_DELETE_KEY}` } },
      );
      const body = await res.json();
      if ((body.results ?? []).length > 0) {
        personExisted = true;
        personProps = body.results[0].properties ?? {};
        break;
      }
      await sleep(8000);
    }
    check('test user exists as a PostHog person before deletion', personExisted,
      personExisted ? '' : 'never ingested — erasure test below is inconclusive');

    // Person properties must be asserted here, not after the run: deletion erases them by
    // design, so this is the only moment they can be observed.
    if (personProps) {
      check('server-set person properties applied',
        personProps.is_premium === true && personProps.subscription_status === 'dev_trial' && personProps.is_internal === true,
        `is_premium=${personProps.is_premium}, status=${personProps.subscription_status}, is_internal=${personProps.is_internal}`);
    }

    const del = await fetch(`${SUPABASE_URL}/functions/v1/delete-account`, {
      method: 'POST',
      headers: { apikey: ANON_KEY, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    });
    const delBody = await del.json();
    check('delete-account succeeded (test user removed)', del.ok && delBody.success === true, JSON.stringify(delBody).slice(0, 200));

    if (personExisted) {
      let gone = false;
      for (let i = 0; i < 10; i++) {
        const res = await fetch(
          `https://us.posthog.com/api/projects/${PH_PROJECT}/persons/?distinct_id=${userId}`,
          { headers: { Authorization: `Bearer ${PH_DELETE_KEY}` } },
        );
        const body = await res.json();
        if ((body.results ?? []).length === 0) { gone = true; break; }
        await sleep(3000);
      }
      check('PostHog person erased by delete-account', gone,
        gone ? 'right to be forgotten honoured' : 'person still present after deletion');
    }
  }
} catch (err) {
  check('end-to-end chain ran without throwing', false, String(err).slice(0, 300));
}

// --- 3. Confirm everything landed in PostHog --------------------------------
console.log('\nwaiting for PostHog ingestion…\n');

const probeRows = await waitForRows(
  `SELECT event, properties.revenue, properties.currency, properties.source, properties.is_internal
   FROM events WHERE distinct_id = '${probeId}' AND timestamp > now() - INTERVAL 1 HOUR`,
);
check('probe event queryable in PostHog', probeRows.length > 0,
  probeRows.length ? `revenue=${probeRows[0][1]} ${probeRows[0][2]}, source=${probeRows[0][3]}, is_internal=${probeRows[0][4]}` : 'no rows after polling');

if (userId) {
  // `events.distinct_id` is qualified because person-override joins expose a second
  // column of the same name, which makes the bare reference a query error.
  const evRows = await waitForRows(
    `SELECT event, properties.source, properties.is_internal, properties.was_premium
     FROM events WHERE events.distinct_id = '${userId}' AND timestamp > now() - INTERVAL 1 HOUR
     ORDER BY timestamp ASC`,
  );
  const names = evRows.map((r) => r[0]);
  check('edge function reached PostHog (secret readable in isolate)', evRows.length > 0,
    names.length ? names.join(', ') : 'no rows — POSTHOG_PROJECT_KEY may not be set on the function');
  check('dev_trial_granted captured', names.includes('dev_trial_granted'));
  check('dev_trial_granted fired exactly once despite replay',
    names.filter((n) => n === 'dev_trial_granted').length === 1,
    `count=${names.filter((n) => n === 'dev_trial_granted').length}`);
  check('server events marked source=server', evRows.every((r) => r[1] === 'server'));
  check('test traffic marked is_internal', evRows.every((r) => r[2] === true));

  // account_deleted is deliberately NOT on the user's distinct_id — it is captured
  // person-less under a constant ID so it survives the erasure without resurrecting them.
  check('account_deleted not attributed to the erased user', !names.includes('account_deleted'),
    names.includes('account_deleted') ? 'leaked onto the deleted person' : 'correctly anonymous');

  const anonRows = await waitForRows(
    `SELECT event, properties.was_premium, properties.subscription_status, properties.source
     FROM events
     WHERE events.distinct_id = 'account_deletions' AND event = 'account_deleted'
       AND timestamp > now() - INTERVAL 1 HOUR
     ORDER BY timestamp DESC LIMIT 1`,
  );
  check('account_deleted captured anonymously', anonRows.length > 0,
    anonRows.length ? `was_premium=${anonRows[0][1]}, status=${anonRows[0][2]}, source=${anonRows[0][3]}` : 'no anonymous churn event found');
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`);
  process.exit(1);
}
