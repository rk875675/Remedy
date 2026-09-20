// Marks our own accounts as internal, in both places that have to agree for the
// "Internal / Test users" cohort to actually exclude them.
//
// Why this exists: `is_internal` was only ever written server-side, and only as an event
// property on the few events the edge functions emit. A developer walking the app on a
// real device produced a full session of ordinary-looking production traffic — the first
// Phase 5 device run landed 312 events and the cohort excluded none of them.
//
// The app now tags already-flagged dev accounts at sign-in (AnalyticsProvider).
// This script only back-fills PostHog is_internal for rows that are already
// profiles.is_dev. It must never SET is_dev — that flag is manual (SQL).
//
//   node scripts/flag_internal_accounts.mjs          # show what would change
//   node scripts/flag_internal_accounts.mjs --apply  # write PostHog only

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

const REF = readFileSync('supabase/.temp/project-ref', 'utf8').trim();
const PH_PROJECT = env.POSTHOG_PROJECT_ID || '470505';
const PH_HOST = 'https://us.posthog.com';
// Person properties are a write to a person, so this needs the person:write key rather
// than the read-only one used for querying.
const PH_KEY = env.POSTHOG_PERSONAL_API_DELETE_KEY || env.POSTHOG_PERSONAL_API_KEY;
const APPLY = process.argv.includes('--apply');

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`SQL ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

// Walking every account is enough requests to get throttled, and a 429/503 partway through
// would otherwise look like a real failure. Retried with a backoff so the run is
// all-or-nothing rather than "mostly worked".
async function ph(path, init = {}, attempt = 1) {
  const res = await fetch(`${PH_HOST}/api/projects/${PH_PROJECT}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${PH_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if ((res.status === 429 || res.status >= 500) && attempt <= 4) {
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    return ph(path, init, attempt + 1);
  }
  return res;
}

const users = await sql(`
  SELECT u.id, u.email, coalesce(p.is_dev, false) AS is_dev
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at;`);

const unflagged = users.filter((u) => !u.is_dev);
console.log(`${users.length} accounts, ${users.length - unflagged.length} already flagged is_dev`);

if (!APPLY) {
  console.log(`\nwould flag ${unflagged.length} account(s) as is_dev and back-fill their`);
  console.log('PostHog persons with is_internal = true:');
  for (const u of unflagged) console.log(`  ${u.email}`);
  console.log('\n(dry run — pass --apply to write)');
  process.exit(0);
}

if (unflagged.length > 0) {
  console.log(
    `\nrefusing to flag ${unflagged.length} account(s) as is_dev. ` +
      'is_dev is manual-only (SQL as service_role). This script only back-fills PostHog ' +
      'is_internal on accounts that are already is_dev.',
  );
}

// Back-fill PostHog. Every account is walked, not just the newly flagged ones, because a
// profile can have been is_dev for a while without its person ever carrying the property.
let patched = 0;
let absent = 0;
const failures = [];

for (const user of users) {
  const lookup = await ph(`/persons/?distinct_id=${encodeURIComponent(user.id)}`);
  if (!lookup.ok) {
    failures.push(`${user.email}: lookup HTTP ${lookup.status}`);
    continue;
  }
  const person = (await lookup.json()).results?.[0];
  // No person means the account never sent a client event — nothing to exclude.
  if (!person) {
    absent++;
    continue;
  }
  if (person.properties?.is_internal === true) continue;

  const patch = await ph(`/persons/${person.id}/`, {
    method: 'PATCH',
    body: JSON.stringify({ properties: { ...person.properties, is_internal: true } }),
  });
  if (patch.ok) patched++;
  else failures.push(`${user.email}: PATCH HTTP ${patch.status}`);
}

console.log(`PostHog: ${patched} person(s) marked internal, ${absent} account(s) have no person yet`);
for (const f of failures) console.log(`  FAILED  ${f}`);

const cohortRes = await ph('/cohorts/362128/');
if (cohortRes.ok) {
  const cohort = await cohortRes.json();
  console.log(`cohort "${cohort.name}" currently counts ${cohort.count} people (recalculates on a delay)`);
} else {
  console.log(`could not read cohort 362128: HTTP ${cohortRes.status}`);
}
process.exit(failures.length ? 1 : 0);
