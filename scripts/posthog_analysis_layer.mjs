// Phase 4 — the analysis layer, as code.
//
// Builds every cohort, insight and dashboard that §1 of docs/ANALYTICS.md says must be
// answerable, then verifies each one actually executes against PostHog.
//
// Why a script and not clicking around the console: the taxonomy in ANALYTICS.md is only
// worth anything if the questions it promises to answer are actually wired up, and a
// dashboard built by hand drifts from the doc the first time someone edits a filter. This
// file is reviewable, diffable, and re-runnable — it PATCHes to a fixed desired state, so
// running it twice is a no-op rather than a duplicate.
//
//   node scripts/posthog_analysis_layer.mjs           # dry run: list what would change
//   node scripts/posthog_analysis_layer.mjs --apply   # create/update, then verify
//   node scripts/posthog_analysis_layer.mjs --verify  # only re-run every saved query
//
// Needs POSTHOG_PERSONAL_API_KEY in .env.local with insight/dashboard/cohort/annotation
// write scope. It does NOT need project:write (see scripts/configure_posthog_project.mjs).

import { readFileSync } from 'node:fs';

import {
  loadOnboardingFlow,
  loadServerEvents,
  loadTaxonomy,
  PERSON_PROPS,
  SDK_EVENT_PROPS,
  SDK_EVENTS,
  SERVER_EVENT_PROPS,
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

const KEY = env.POSTHOG_PERSONAL_API_KEY;
const PROJECT = env.POSTHOG_PROJECT_ID || '470505';
const API = `https://us.posthog.com/api/projects/${PROJECT}`;
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const APPLY = process.argv.includes('--apply');
const VERIFY_ONLY = process.argv.includes('--verify');
const TILES_ONLY = process.argv.includes('--tiles-only');

/**
 * The instrumentation cutover. Project 470505 holds ~1,900 events from the *old* ad-hoc
 * taxonomy (ANALYTICS.md §0.6), including at least one event name that no longer exists in
 * the codebase. Every insight below is hard-scoped to on-or-after this date so no chart can
 * silently average the old naming together with the new.
 */
const CUTOVER = '2026-08-09';

/**
 * Temporary preview so existing device/sandbox traffic is visible on the boards.
 * Set to false and re-run `--apply` when real users start arriving.
 */
const INCLUDE_INTERNAL_FOR_PREVIEW = true;

/**
 * Set on every insight rather than relying on the project-level default, which needs
 * `project:write` we don't have. Being explicit is better anyway: it survives someone
 * flipping the project default later.
 */
const T = !INCLUDE_INTERNAL_FOR_PREVIEW; // filterTestAccounts

const TAGS = ['remedy-core'];

// Cohort 362128 matches is_internal = true on the *current* person. SQL cannot use
// filterTestAccounts, and person.properties.is_internal on events is frozen at
// ingestion (person-on-events) — so the cohort is the only filter that stays in
// sync with the dashboards after someone is flagged retroactively.
const INTERNAL_COHORT_ID = 362128;
const SQL_EXCLUDE_INTERNAL = INCLUDE_INTERNAL_FOR_PREVIEW
  ? ''
  : `
  AND person_id NOT IN cohort(${INTERNAL_COHORT_ID})
  AND coalesce(toString(properties.environment), '') != 'sandbox'`;

const { interstitials: ONBOARDING_INTERSTITIALS } = loadOnboardingFlow();
const SQL_EXCLUDE_INTERSTITIALS = ONBOARDING_INTERSTITIALS.length
  ? `\n  AND toString(properties.step_key) NOT IN (${ONBOARDING_INTERSTITIALS.map((k) => `'${k}'`).join(', ')})`
  : '';

/** Exact on-screen headings. Bars stay `q5`; this is what you see after opening the tile. */
const ONBOARDING_STEP_QUESTIONS = {
  welcome: 'Welcome',
  founder: 'Founder story',
  education: 'Education',
  q0: 'Where did you hear about us?',
  safety: 'Do any of these apply to you?',
  q9: 'Have you tried to fix your back pain before?',
  q6: "What's your main goal?",
  q1: 'Where is your back pain?',
  q2: 'How long have you had it?',
  recognize: 'Which of these feel true?',
  seen: "You're not imagining this",
  alarm: 'Pain is a protector',
  why: 'Why Remedy exists',
  q3: 'How would you describe it?',
  q4: "What's your activity level?",
  q5: 'What makes your pain worse?',
  q7: 'What equipment do you have access to?',
  q8: 'How much time can you give your back each day?',
  finalizing: 'Building your plan',
  match: 'Your plan preview',
};

function hogqlStepQuestion(expr = 'toString(properties.step_key)') {
  const branches = Object.entries(ONBOARDING_STEP_QUESTIONS)
    .map(([key, question]) => `${expr} = '${key}', '${question.replace(/'/g, "\\'")}'`);
  return `multiIf(${branches.join(', ')}, ${expr})`;
}

/** Monday-readable labels for $screen_name / screen_exited.screen_name. */
const SCREEN_LABELS = {
  '/(onboarding)': 'Onboarding — Welcome',
  '/(onboarding)/founder': 'Onboarding — Founder',
  '/(onboarding)/education': 'Onboarding — Education',
  '/(onboarding)/q0': 'Onboarding — Hear about us',
  '/(onboarding)/safety': 'Onboarding — Safety',
  '/(onboarding)/q9': 'Onboarding — Tried before',
  '/(onboarding)/q6': 'Onboarding — Goal',
  '/(onboarding)/q1': 'Onboarding — Pain location',
  '/(onboarding)/q2': 'Onboarding — Duration',
  '/(onboarding)/recognize': 'Onboarding — Recognition',
  '/(onboarding)/seen': 'Onboarding — Seen',
  '/(onboarding)/alarm': 'Onboarding — Pain alarm',
  '/(onboarding)/why': 'Onboarding — Why Remedy',
  '/(onboarding)/q3': 'Onboarding — Pain type',
  '/(onboarding)/q4': 'Onboarding — Activity',
  '/(onboarding)/q5': 'Onboarding — Triggers',
  '/(onboarding)/q7': 'Onboarding — Equipment',
  '/(onboarding)/q8': 'Onboarding — Time budget',
  '/(onboarding)/finalizing': 'Onboarding — Building plan',
  '/(onboarding)/match': 'Onboarding — Plan preview',
  '/(auth)/sign-in': 'Sign in',
  '/(auth)/email': 'Email auth',
  '/auth-callback': 'Auth callback',
  '/reset-password': 'Reset password',
  '/(legal)/terms': 'Terms',
  '/(legal)/privacy': 'Privacy',
  '/(tabs)': 'Home',
  '/(tabs)/progress': 'Progress',
  '/(tabs)/profile': 'Profile',
  '/session/[id]': 'Session player',
  '/building-plan': 'Building plan',
  '/weekly-ramp': 'Weekly ramp',
  '/orientation': 'Orientation',
  '/program-complete': 'Program complete',
  '/onboarding-answers': 'Saved answers',
  '/feedback': 'Feedback',
  unknown: 'Unknown',
};

function hogqlScreenLabel(expr) {
  const branches = Object.entries(SCREEN_LABELS)
    .map(([key, label]) => `${expr} = '${key}', '${label.replace(/'/g, "\\'")}'`);
  return `multiIf(${branches.join(', ')}, ${expr})`;
}

const STARTER_DASHBOARDS = ['Remedy Relentless', 'Starter Remedy'];

const OBSOLETE_INSIGHT_NAMES = [
  'Verification pipeline loss — purchase_flow_completed → trial_started',
  'Dead ends — empty states and validation failures',
  'F1 — Install → Activation',
  'Install retention (daily, D0–D30)',
  'Pageview funnel, by browser',
  'Referring domain (last 14 days)',
  'Growth accounting',
  'Retention',
  'Weekly active users (WAUs)',
  'Daily active users (DAUs)',
];

const ALERTS = [
  {
    insightName: 'Alert — purchase_verification_failed',
    name: 'purchase_verification_failed > 0',
  },
  {
    insightName: 'Alert — program_assignment_failed',
    name: 'program_assignment_failed > 0',
  },
];

// --- tiny API helpers --------------------------------------------------------

async function api(path, options = {}) {
  const res = await fetch(`${API}${path}`, { headers: H, ...options });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} ${path} — ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

async function listAll(resource) {
  const out = [];
  let url = `/${resource}/?limit=100`;
  while (url) {
    const page = await api(url);
    out.push(...(page.results ?? []));
    url = page.next ? page.next.replace(`https://us.posthog.com/api/projects/${PROJECT}`, '') : null;
  }
  return out;
}

function findExistingDashboard(existing, d) {
  return existing.find((x) =>
    !x.deleted && (
      (d.id != null && x.id === d.id)
      || x.name === d.name
      || (d.formerNames ?? []).includes(x.name)
    ),
  );
}

function findExistingInsight(existing, i) {
  return existing.find((x) =>
    !x.deleted && (
      x.name === i.name
      || (i.formerNames ?? []).includes(x.name)
    ),
  );
}

/** First tile full-width; the rest two-up. Leftover tiles (moved insights) are dropped. */
async function syncDashboardTiles(dashId, insights) {
  const dash = await api(`/dashboards/${dashId}/`);
  const byName = new Map();
  for (const t of dash.tiles ?? []) {
    if (!t.deleted && t.insight?.name) byName.set(t.insight.name, t);
  }
  const insightNames = insights.map((i) => i.name);
  const tiles = [];
  insights.forEach((insight, i) => {
    const t = byName.get(insight.name);
    if (!t) return;
    const fullWidth = i === 0;
    const pairIndex = i - 1;
    const row = fullWidth ? 0 : Math.floor(pairIndex / 2);
    const col = fullWidth ? 0 : (pairIndex % 2) * 6;
    const y = fullWidth ? 0 : 6 + row * 5;
    tiles.push({
      id: t.id,
      order: i,
      show_description: insight.showDescription === true,
      layouts: {
        sm: { x: col, y, w: fullWidth ? 12 : 6, h: fullWidth ? 6 : 5 },
      },
    });
  });
  for (const t of dash.tiles ?? []) {
    if (t.deleted) continue;
    const name = t.insight?.name;
    if (!name || !insightNames.includes(name)) tiles.push({ id: t.id, deleted: true });
  }
  if (!tiles.length) return;
  await api(`/dashboards/${dashId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ tiles }),
  });
}

// --- cohorts -----------------------------------------------------------------

const behavioral = (props) => ({
  properties: { type: 'AND', values: [{ type: 'AND', values: props }] },
});

const performed = (event, extra = {}) => ({
  key: event, type: 'behavioral', value: 'performed_event', event_type: 'events',
  time_value: 30, time_interval: 'day', negation: false, ...extra,
});

const COHORTS = [
  {
    name: 'Activated users',
    description:
      'Completed at least one session. ANALYTICS.md §1.3 defines activation as a first ' +
      'session completed within 48h of program_assigned; the 48h bound is expressed in the ' +
      'activation funnel insight, not here, because cohorts cannot express a relative window ' +
      'between two events. Use this for slicing, and the funnel for the rate.',
    filters: behavioral([
      { ...performed('session_completed', { time_value: 90 }) },
    ]),
  },
  {
    name: 'Weekly Active Completers',
    description:
      'ANALYTICS.md §1.4 habit metric: ≥2 completed sessions in a rolling 7 days. ' +
      'Deliberately not DAU — the product prescribes 3–5 sessions/week and rest days are ' +
      'part of the design, so a model user would look like a DAU failure.',
    filters: behavioral([{
      key: 'session_completed', type: 'behavioral', value: 'performed_event_multiple',
      event_type: 'events', operator: 'gte', operator_value: 2,
      time_value: 7, time_interval: 'day', negation: false,
    }]),
  },
  {
    name: 'Paying subscribers',
    description: 'subscription_status = active, set by the server truth layer (§3.6).',
    filters: {
      properties: {
        type: 'AND',
        values: [{
          type: 'AND',
          values: [{ key: 'subscription_status', type: 'person', value: ['active'], operator: 'exact' }],
        }],
      },
    },
  },
  {
    name: 'Trialists',
    description: 'subscription_status = trial. Denominator of trial→paid (PRD target >25%).',
    filters: {
      properties: {
        type: 'AND',
        values: [{
          type: 'AND',
          values: [{ key: 'subscription_status', type: 'person', value: ['trial'], operator: 'exact' }],
        }],
      },
    },
  },
  {
    name: 'Lapsed completers (no session in 14d)',
    description:
      'Completed a session in the last 90 days but none in the last 14. The churn-risk list: ' +
      'these are people the program stopped holding.',
    filters: behavioral([
      { ...performed('session_completed', { time_value: 90 }) },
      { ...performed('session_completed', { time_value: 14, negation: true }) },
    ]),
  },
  {
    name: 'Internal / Test users',
    description:
      'is_internal = true on the current person (profiles.is_dev OR entitlements.is_sandbox). ' +
      'The only filter that stays retroactive under person-on-events. Do not also match ' +
      '$internal_or_test_user — we never set that property.',
    filters: {
      properties: {
        type: 'AND',
        values: [{
          type: 'AND',
          values: [{ key: 'is_internal', type: 'person', value: [true], operator: 'exact' }],
        }],
      },
    },
  },
  {
    name: 'Premium people',
    description:
      'is_premium = true (trial, active, or cancelled-until-expiry). North-star denominator. ' +
      'Current person property, so it stays retroactive under person-on-events.',
    filters: {
      properties: {
        type: 'AND',
        values: [{
          type: 'AND',
          values: [{ key: 'is_premium', type: 'person', value: [true], operator: 'exact' }],
        }],
      },
    },
  },
];

// --- insight builders --------------------------------------------------------

const ev = (event, extra = {}) => ({ kind: 'EventsNode', event, ...extra });

const funnel = (series, opts = {}) => ({
  kind: 'FunnelsQuery',
  series,
  dateRange: { date_from: CUTOVER },
  funnelsFilter: {
    funnelVizType: 'steps',
    funnelWindowInterval: 14,
    funnelWindowIntervalUnit: 'day',
    ...(opts.funnelsFilter ?? {}),
  },
  filterTestAccounts: T,
  ...(opts.breakdownFilter ? { breakdownFilter: opts.breakdownFilter } : {}),
  ...(opts.properties ? { properties: opts.properties } : {}),
});

const trends = (series, opts = {}) => ({
  kind: 'TrendsQuery',
  series,
  interval: opts.interval ?? 'week',
  dateRange: { date_from: CUTOVER },
  trendsFilter: {
    display: opts.display ?? 'ActionsLineGraph',
    ...(opts.formula ? { formula: opts.formula } : {}),
    ...(opts.formulaNodes ? { formulaNodes: opts.formulaNodes } : {}),
  },
  filterTestAccounts: T,
  ...(opts.breakdownFilter ? { breakdownFilter: opts.breakdownFilter } : {}),
  ...(opts.properties ? { properties: opts.properties } : {}),
});

const eventPropEq = (key, value) => ({
  properties: [{ key, type: 'event', value: [value], operator: 'exact' }],
});

/** Apple Small Business Program cut. If the account leaves the program this is 30%. */
const APPLE_KEEP = 0.85;

/** List-price cents when a refund event has no amount (today they do not). */
const REFUND_AMOUNT_HOGQL =
  "sum(if(toFloat(properties.revenue) > 0, toFloat(properties.revenue), " +
  "multiIf(toString(properties.product_id) LIKE '%annual%', 7999, " +
  "toString(properties.product_id) LIKE '%weekly%', 499, " +
  "toString(properties.product_id) LIKE '%monthly%', 1299, 0)))";

const sql = (query) => ({ kind: 'DataVisualizationNode', source: { kind: 'HogQLQuery', query } });

const byEventProp = (prop) => ({ breakdownFilter: { breakdown: prop, breakdown_type: 'event' } });
const byPersonProp = (prop) => ({ breakdownFilter: { breakdown: prop, breakdown_type: 'person' } });
const BAR = 'ActionsBarValue';

// --- dashboards and their insights ------------------------------------------
//
// Numbered so the PostHog sidebar reads in journey order (alpha would scramble them).
// Tile order inside each board is most-important → niche. Dollars stay on Revenue;
// headcount / return rates stay on Users & Retention; product usage + session
// quality stay on In-App.

const DASHBOARDS = [
  {
    id: 1981017,
    formerNames: ['Remedy — North Star'],
    name: '2. Users & Retention',
    description:
      'How many people we have and whether they come back. Headlines first. ' +
      'Paid-user counts live here; dollars live on 4. Revenue. Session quality lives on 3. In-App. ' +
      `Scoped to on-or-after ${CUTOVER}.`,
    insights: [
      {
        name: 'North star — completed sessions per active subscriber per week',
        description:
          'Completed sessions ÷ unique current-premium people who did anything that week. ' +
          'Premium is read from the persons table (current is_premium), not frozen ' +
          'person.properties.is_premium on events. The old A/B used dau of session_completed ' +
          'as the denominator, which cannot fall when subscribers stop finishing.',
        query: sql(`SELECT week,
  round(completed / nullIf(active_subscribers, 0), 3) AS sessions_per_active_subscriber,
  completed,
  active_subscribers
FROM (
  SELECT
    toStartOfWeek(timestamp) AS week,
    countIf(event = 'session_completed') AS completed,
    uniq(person_id) AS active_subscribers
  FROM events
  WHERE timestamp >= '${CUTOVER}'
    AND person_id IN (
      SELECT id FROM persons
      WHERE toString(properties.is_premium) = 'true'
    )
    ${SQL_EXCLUDE_INTERNAL}
  GROUP BY week
)
ORDER BY week`),
      },
      {
        name: 'Weekly Active Completers (≥2 sessions in the week)',
        description:
          '§1.4. Expressed in SQL because "≥2 events per user per window" is not a shape ' +
          'the trends builder can state exactly.',
        query: sql(`SELECT week, count() AS weekly_active_completers
FROM (
  SELECT toStartOfWeek(timestamp) AS week, person_id AS pid, count() AS sessions
  FROM events
  WHERE event = 'session_completed' AND timestamp >= '${CUTOVER}'
    ${SQL_EXCLUDE_INTERNAL}
  GROUP BY week, pid
  HAVING sessions >= 2
)
GROUP BY week
ORDER BY week`),
      },
      {
        name: 'Activation rate — program assigned → first session completed ≤48h',
        description:
          '§1.3. Deliberately completion, not start: finishing means 15 minutes of exercise ' +
          'and a before/after pain score — the promise delivered once. The 48h window is a ' +
          'recommended default, not a PRD fact.',
        query: funnel(
          [
            ev('program_assigned'),
            ev('session_completed', {
              properties: [{ key: 'is_first_session', type: 'event', value: ['true'], operator: 'exact' }],
            }),
          ],
          { funnelsFilter: { funnelWindowInterval: 48, funnelWindowIntervalUnit: 'hour' } },
        ),
      },
      {
        name: 'Program retention (weekly, W0–W9)',
        description:
          'Primary curve (§1.5). Cohort on program_assigned, return on session_completed. ' +
          'Programs run 5–10 weeks, so this is the curve that predicts churn.',
        query: {
          kind: 'RetentionQuery',
          retentionFilter: {
            targetEntity: { id: 'program_assigned', name: 'program_assigned', type: 'events' },
            returningEntity: { id: 'session_completed', name: 'session_completed', type: 'events' },
            period: 'Week', totalIntervals: 10, retentionType: 'retention_first_time',
          },
          dateRange: { date_from: CUTOVER },
          filterTestAccounts: T,
        },
      },
      {
        name: 'Open retention (daily, D0–D30)',
        description:
          'PRD D7/D30 curve, cutover-scoped. Cohorts on first Application Opened after ' +
          '2026-08-09 because Application Installed last fired 2026-06-20 — a first-install ' +
          'event that will not re-fire for anyone already on device.',
        query: {
          kind: 'RetentionQuery',
          retentionFilter: {
            targetEntity: { id: 'Application Opened', name: 'Application Opened', type: 'events' },
            returningEntity: { id: 'Application Opened', name: 'Application Opened', type: 'events' },
            period: 'Day', totalIntervals: 30, retentionType: 'retention_first_time',
          },
          dateRange: { date_from: CUTOVER },
          filterTestAccounts: T,
        },
      },
      {
        name: 'Completer lifecycle (new / returning / resurrecting / dormant)',
        description: 'Whether weekly volume is growth or churn-and-replace.',
        query: {
          kind: 'LifecycleQuery',
          series: [ev('session_completed')],
          interval: 'week',
          dateRange: { date_from: CUTOVER },
          filterTestAccounts: T,
        },
      },
      {
        name: 'Completed sessions per week (volume)',
        description: 'The raw north-star numerator, unnormalised.',
        query: trends([ev('session_completed', { math: 'total' })]),
      },
    ],
  },

  {
    id: 1981018,
    formerNames: ['Remedy — Acquisition'],
    name: '1. Onboarding',
    description:
      'How people start: questions, drop-off, signup, where they heard about us. ' +
      'Not whether they come back (2. Users & Retention) and not money (4. Revenue).',
    insights: [
      {
        name: 'F1 — Onboarding → Activation',
        description:
          'Cutover-scoped first-run path through program assignment. Starts at ' +
          'onboarding_started because Application Installed is once-per-install and every ' +
          'current device installed before 2026-08-09. Ends at program_assigned — first ' +
          'session is 3. In-App (F4) and the activation-rate tile on 2. Users & Retention. ' +
          'Post-paywall handoff (purchase stash → signup → assignment) is still the risky drop.',
        query: funnel([
          ev('onboarding_started'),
          ev('onboarding_completed'),
          ev('paywall_viewed'),
          ev('purchase_flow_completed'),
          ev('signup_completed'),
          ev('program_assigned'),
        ]),
      },
      {
        name: 'F2 — Onboarding drop-off by step',
        description:
          'Which question is the expensive one. The question column is the on-screen heading. ' +
          'median_seconds separates a hard question from a boring one.',
        query: sql(`SELECT
  toInt(properties.step_index) AS step_index,
  any(toString(properties.step_key)) AS step_key,
  any(${hogqlStepQuestion()}) AS question,
  uniqIf(person_id, event = 'onboarding_step_viewed') AS viewed,
  uniqIf(person_id, event = 'onboarding_step_completed') AS completed,
  round(100.0 * uniqIf(person_id, event = 'onboarding_step_completed')
        / nullIf(uniqIf(person_id, event = 'onboarding_step_viewed'), 0), 1) AS completion_pct,
  round(medianIf(toFloat(properties.time_on_step_ms),
                 event = 'onboarding_step_completed') / 1000, 1) AS median_seconds
FROM events
WHERE event IN ('onboarding_step_viewed', 'onboarding_step_completed')
  AND timestamp >= '${CUTOVER}'
  ${SQL_EXCLUDE_INTERSTITIALS}
  ${SQL_EXCLUDE_INTERNAL}
GROUP BY step_index
ORDER BY step_index`),
      },
      {
        name: 'Onboarding — exits by step',
        description:
          'Abandoned + backgrounded only. step_key stays q5 on the chart; question is the ' +
          'on-screen heading so you do not have to walk the funnel.',
        query: sql(`SELECT
  toString(properties.step_key) AS step_key,
  ${hogqlStepQuestion()} AS question,
  count() AS exits
FROM events
WHERE event = 'onboarding_step_exited'
  AND timestamp >= '${CUTOVER}'
  AND toString(properties.exit_type) IN ('abandoned', 'backgrounded')
  ${SQL_EXCLUDE_INTERNAL}
GROUP BY step_key, question
ORDER BY exits DESC`),
      },
      {
        name: 'Onboarding — time on step',
        description: 'Average time_on_step_ms per step. Pair with the drop-off table above.',
        query: trends(
          [ev('onboarding_step_completed', { math: 'avg', math_property: 'time_on_step_ms' })],
          { ...byEventProp('step_key'), display: BAR },
        ),
      },
      {
        name: 'F5 — Signup funnel by method',
        description:
          'Runs AFTER money has changed hands, so a failure here is a paid user with no ' +
          'account. Broken down by method to catch Apple/Google/Email failing differently.',
        query: funnel(
          [ev('signup_started'), ev('signup_completed')],
          byEventProp('method'),
        ),
      },
      {
        name: 'Acquisition source mix',
        description:
          'Self-reported "where did you hear about us" (q0), as a person property. ' +
          'Closed set: instagram, facebook, tiktok, youtube, google, friend_family, other.',
        query: trends(
          [ev('onboarding_completed', { math: 'dau' })],
          { ...byPersonProp('acquisition_source'), display: BAR },
        ),
      },
    ],
  },

  {
    id: 1981021,
    formerNames: ['Remedy — Monetization'],
    name: '4. Revenue',
    description:
      'Money only: dollars, paywall conversion, trials, renewals. ' +
      'How many people exist lives on 2. Users & Retention. ' +
      'LTV / target CAC need ad spend, which is not in this project yet. ' +
      'The big chart is cumulative dollars: monthly, annual, total, and profit.',
    insights: [
      {
        name: 'Revenue ($)',
        formerNames: ['Revenue (minor units)'],
        description:
          'Running total in dollars. Monthly and annual are first charges + renewals. ' +
          'Total is both. Profit is total after Apple 15% and refunds (list price if the ' +
          'refund has no amount — we do not attach one yet). Trials are not income.',
        query: trends(
          [
            ev('subscription_started', {
              math: 'sum',
              math_property: 'revenue',
              custom_name: 'Monthly started',
              ...eventPropEq('plan_interval', 'monthly'),
            }),
            ev('subscription_renewed', {
              math: 'sum',
              math_property: 'revenue',
              custom_name: 'Monthly renewed',
              ...eventPropEq('plan_interval', 'monthly'),
            }),
            ev('subscription_started', {
              math: 'sum',
              math_property: 'revenue',
              custom_name: 'Annual started',
              ...eventPropEq('plan_interval', 'annual'),
            }),
            ev('subscription_renewed', {
              math: 'sum',
              math_property: 'revenue',
              custom_name: 'Annual renewed',
              ...eventPropEq('plan_interval', 'annual'),
            }),
            ev('subscription_refunded', {
              math: 'hogql',
              math_hogql: REFUND_AMOUNT_HOGQL,
              custom_name: 'Refunds',
            }),
          ],
          {
            interval: 'day',
            display: 'ActionsLineGraphCumulative',
            formulaNodes: [
              { formula: '(A + B) / 100', custom_name: 'Monthly sub' },
              { formula: '(C + D) / 100', custom_name: 'Annual sub' },
              { formula: '(A + B + C + D) / 100', custom_name: 'Total revenue' },
              { formula: `((A + B + C + D) * ${APPLE_KEEP} - E) / 100`, custom_name: 'Profit' },
            ],
          },
        ),
      },
      {
        name: 'F3 — Monetization funnel',
        description:
          'Saw the paywall → Superwall rendered one → started a purchase → Apple completed ' +
          'it. Stops at purchase_flow_completed because the no-trial SKU never emits ' +
          'trial_started. Server grant (trial OR paid) is the SQL tile next to this.',
        query: funnel([
          ev('paywall_viewed'),
          ev('paywall_presented'),
          ev('purchase_started'),
          ev('purchase_flow_completed'),
        ]),
      },
      {
        name: 'Trial → paid conversion',
        description: 'PRD target > 25%. Both steps are server events, so this is authoritative.',
        query: funnel(
          [ev('trial_started'), ev('subscription_started')],
          { funnelsFilter: { funnelWindowInterval: 30, funnelWindowIntervalUnit: 'day' } },
        ),
      },
      {
        name: 'Renewals',
        description:
          'ASSN DID_RENEW. Recurring revenue, broken down by plan_interval so monthly vs ' +
          'annual is visible without opening Revenue Analytics.',
        query: trends(
          [ev('subscription_renewed', { math: 'total' })],
          { ...byEventProp('plan_interval'), display: BAR },
        ),
      },
      {
        name: 'Verification pipeline loss — purchase_flow_completed → grant',
        description:
          'Apple took the money, did our server ever find out? Grant is trial_started OR ' +
          'subscription_started — the no-trial SKU never emits a trial. Should be ~0 drop; ' +
          'treat anything else as an incident.',
        query: sql(`SELECT
  count() AS purchased_people,
  countIf(granted_at IS NOT NULL AND granted_at >= purchased_at) AS granted_people,
  round(100.0 * countIf(granted_at IS NOT NULL AND granted_at >= purchased_at)
        / nullIf(count(), 0), 1) AS grant_pct
FROM (
  SELECT
    person_id,
    minIf(timestamp, event = 'purchase_flow_completed') AS purchased_at,
    minIf(timestamp, event IN ('trial_started', 'subscription_started')) AS granted_at
  FROM events
  WHERE event IN ('purchase_flow_completed', 'trial_started', 'subscription_started')
    AND timestamp >= '${CUTOVER}'
    ${SQL_EXCLUDE_INTERNAL}
  GROUP BY person_id
  HAVING purchased_at IS NOT NULL
)`),
      },
      {
        name: 'Paywall variant performance',
        description: 'Superwall experiment arms against real purchase completion, not just clicks.',
        query: funnel(
          [ev('paywall_presented'), ev('purchase_flow_completed')],
          byEventProp('paywall_variant_id'),
        ),
      },
      {
        name: 'Superwall render loss — paywall_viewed → paywall_presented',
        description:
          'The gap is Superwall failing to render a paywall we asked for. Currently the most ' +
          'expensive kind of invisible: the user never sees a price and we never know.',
        query: funnel([ev('paywall_viewed'), ev('paywall_presented')]),
      },
      {
        name: 'Purchase failures by reason',
        description: 'Closed reason set — declined vs cancelled vs pipeline error.',
        query: trends([ev('purchase_failed', { math: 'total' })], { ...byEventProp('reason'), display: BAR }),
      },
      {
        name: 'F6 — Restore funnel',
        description:
          'App Store-required, and the recovery path for every purchase-verification failure. ' +
          'A low rate here compounds the loss measured two charts up.',
        query: funnel([ev('restore_started'), ev('restore_succeeded')]),
      },
    ],
  },

  {
    id: 1981022,
    formerNames: ['Remedy — Core loop & retention'],
    name: '3. In-App',
    description:
      'Core loop first (finish, adhere, pain), then time in the app and where they go, ' +
      'then content. Whether they come back lives on 2. Users & Retention.',
    insights: [
      {
        name: 'F4 — Session completion funnel',
        description:
          'Do people bail at the preview, at the pain check-in, at the first exercise, or ' +
          'midway? Each step is a different fix.',
        query: funnel([
          ev('session_start_tapped'),
          ev('session_previewed'),
          ev('session_started'),
          ev('exercise_started'),
          ev('session_completed'),
        ], { funnelsFilter: { funnelWindowInterval: 2, funnelWindowIntervalUnit: 'hour' } }),
      },
      {
        name: 'Adherence — completed ÷ prescribed sessions per week',
        description:
          '§1.4: the ratio to actually watch. Prescribed comes from the person property ' +
          'sessions_per_week_preference set at onboarding. 1.0 means the average user is ' +
          'hitting their own chosen cadence.',
        query: sql(`SELECT week, round(avg(completed / prescribed), 3) AS adherence_ratio
FROM (
  SELECT toStartOfWeek(timestamp) AS week,
         person_id AS pid,
         count() AS completed,
         max(toFloat(person.properties.sessions_per_week_preference)) AS prescribed
  FROM events
  WHERE event = 'session_completed' AND timestamp >= '${CUTOVER}'
    ${SQL_EXCLUDE_INTERNAL}
  GROUP BY week, pid
  HAVING prescribed > 0
)
GROUP BY week
ORDER BY week`),
      },
      {
        name: 'Average pain improvement per session',
        description:
          'PRD §10 targets average improvement > 1.5 points. pain_delta is after − before, ' +
          'so this should sit BELOW −1.5. A rising line is the product getting worse.',
        query: trends([ev('session_completed', { math: 'avg', math_property: 'pain_delta' })]),
      },
      {
        name: 'Time in app per user per week',
        description:
          'Same pairing as the daily tile, rolled to the week. This is the stickiness ' +
          'number next to completed-sessions-per-subscriber.',
        query: sql(`SELECT
  week,
  round(avg(user_seconds) / 60, 1) AS avg_minutes,
  round(quantile(0.5)(user_seconds) / 60, 1) AS median_minutes,
  uniq(pid) AS people
FROM (
  SELECT week, pid, sum(duration_s) AS user_seconds
  FROM (
    SELECT
      toStartOfWeek(timestamp) AS week,
      person_id AS pid,
      event,
      lead(event) OVER (PARTITION BY person_id ORDER BY timestamp) AS next_event,
      dateDiff('second', timestamp, lead(timestamp) OVER (PARTITION BY person_id ORDER BY timestamp)) AS duration_s
    FROM events
    WHERE event IN ('Application Opened', 'Application Backgrounded')
      AND timestamp >= '${CUTOVER}'
      ${SQL_EXCLUDE_INTERNAL}
  )
  WHERE event = 'Application Opened'
    AND next_event = 'Application Backgrounded'
    AND duration_s > 0 AND duration_s < 14400
  GROUP BY week, pid
)
GROUP BY week
ORDER BY week`),
      },
      {
        name: 'Screens viewed',
        description:
          'Where attention goes. Route patterns, labelled. A screen that never appears ' +
          'here is unused; a screen that dominates and is not Home or Session is a smell.',
        query: sql(`SELECT
  screen_key,
  ${hogqlScreenLabel('screen_key')} AS screen,
  views,
  people
FROM (
  SELECT
    toString(properties.$screen_name) AS screen_key,
    count() AS views,
    uniq(person_id) AS people
  FROM events
  WHERE event = '$screen' AND timestamp >= '${CUTOVER}'
    ${SQL_EXCLUDE_INTERNAL}
  GROUP BY screen_key
)
ORDER BY views DESC`),
      },
      {
        name: 'Tab mix — Home / Progress / Profile',
        description:
          'The three main tabs. tab_switched was deliberately not added — $screen plus ' +
          'previous_screen is the same transition. Re-tapping the active tab is not a visit.',
        query: sql(`SELECT
  ${hogqlScreenLabel('toString(properties.$screen_name)')} AS tab,
  count() AS views,
  uniq(person_id) AS people
FROM events
WHERE event = '$screen' AND timestamp >= '${CUTOVER}'
  AND toString(properties.$screen_name) IN ('/(tabs)', '/(tabs)/progress', '/(tabs)/profile')
  ${SQL_EXCLUDE_INTERNAL}
GROUP BY tab
ORDER BY views DESC`),
      },
      {
        name: 'Session abandonment by phase',
        description:
          'Mid-session churn, which writes nothing to the database and is otherwise ' +
          'completely invisible. phase_key says exactly where they gave up.',
        query: trends([ev('session_abandoned', { math: 'total' })], { ...byEventProp('phase_key'), display: BAR }),
      },
      {
        name: 'Workout minutes per user per week',
        description:
          'Sum of completed-session duration per person per week. The training-load ' +
          'companion to the north-star session count.',
        query: sql(`SELECT
  week,
  round(avg(user_seconds) / 60, 1) AS avg_minutes,
  round(quantile(0.5)(user_seconds) / 60, 1) AS median_minutes,
  uniq(pid) AS people
FROM (
  SELECT
    toStartOfWeek(timestamp) AS week,
    person_id AS pid,
    sum(toFloat(properties.duration_seconds)) AS user_seconds
  FROM events
  WHERE event = 'session_completed' AND timestamp >= '${CUTOVER}'
    ${SQL_EXCLUDE_INTERNAL}
  GROUP BY week, pid
)
GROUP BY week
ORDER BY week`),
      },
      {
        name: 'Time in app per user per day',
        description:
          'Foreground minutes per person per day. Paired Application Opened → next ' +
          'Application Backgrounded; pairs longer than 4 hours are dropped as unpaired. ' +
          'app_session_ended is the measured replacement after the next client release.',
        query: sql(`SELECT
  day,
  round(avg(user_seconds) / 60, 1) AS avg_minutes,
  round(quantile(0.5)(user_seconds) / 60, 1) AS median_minutes,
  uniq(pid) AS people
FROM (
  SELECT day, pid, sum(duration_s) AS user_seconds
  FROM (
    SELECT
      toStartOfDay(timestamp) AS day,
      person_id AS pid,
      event,
      lead(event) OVER (PARTITION BY person_id ORDER BY timestamp) AS next_event,
      dateDiff('second', timestamp, lead(timestamp) OVER (PARTITION BY person_id ORDER BY timestamp)) AS duration_s
    FROM events
    WHERE event IN ('Application Opened', 'Application Backgrounded')
      AND timestamp >= '${CUTOVER}'
      ${SQL_EXCLUDE_INTERNAL}
  )
  WHERE event = 'Application Opened'
    AND next_event = 'Application Backgrounded'
    AND duration_s > 0 AND duration_s < 14400
  GROUP BY day, pid
)
GROUP BY day
ORDER BY day`),
      },
      {
        name: 'App opens per user per week',
        description:
          'How often people come back, independent of whether they finished a workout. ' +
          'A user who opens 5× and completes 0 is a different problem from one who never opens.',
        query: sql(`SELECT
  toStartOfWeek(timestamp) AS week,
  count() AS opens,
  uniq(person_id) AS people,
  round(count() / nullIf(uniq(person_id), 0), 2) AS opens_per_user
FROM events
WHERE event = 'Application Opened' AND timestamp >= '${CUTOVER}'
  ${SQL_EXCLUDE_INTERNAL}
GROUP BY week
ORDER BY week`),
      },
      {
        name: 'Screen dwell',
        description:
          'Median seconds on each screen. Time from a $screen to the next $screen or ' +
          'Application Backgrounded. screen_exited is the measured event after the next ' +
          'client release — switch this query to time_on_screen_ms then.',
        query: sql(`SELECT
  screen_key,
  ${hogqlScreenLabel('screen_key')} AS screen,
  visits,
  round(median_ms / 1000, 1) AS median_seconds
FROM (
  SELECT
    screen_key,
    count() AS visits,
    median(dwell_ms) AS median_ms
  FROM (
    SELECT
      toString(properties.$screen_name) AS screen_key,
      event,
      dateDiff('millisecond', timestamp, lead(timestamp) OVER (PARTITION BY person_id ORDER BY timestamp)) AS dwell_ms
    FROM events
    WHERE event IN ('$screen', 'Application Backgrounded')
      AND timestamp >= '${CUTOVER}'
      ${SQL_EXCLUDE_INTERNAL}
  )
  WHERE event = '$screen'
    AND screen_key != ''
    AND dwell_ms > 0 AND dwell_ms < 3600000
  GROUP BY screen_key
)
ORDER BY visits DESC`),
      },
      {
        name: 'Workout minutes per session',
        description:
          'session_completed.duration_seconds — time inside a prescribed workout, not ' +
          'time in the app. Pair with time-in-app above: browsing vs training.',
        query: trends([ev('session_completed', { math: 'avg', math_property: 'duration_seconds' })]),
      },
      {
        name: 'F7 — Week progression through the ramp',
        description:
          'After they decide progress vs hold, do they come back and finish another ' +
          'session? Starts at weekly_ramp_decided so the decision breakdown is on an event ' +
          'that actually carries it — session_completed does not.',
        query: funnel(
          [ev('weekly_ramp_decided'), ev('session_completed')],
          { ...byEventProp('decision'), funnelsFilter: { funnelWindowInterval: 21, funnelWindowIntervalUnit: 'day' } },
        ),
      },
      {
        name: 'Screen paths — previous → current',
        description:
          'How people move. previous_screen is null on the first screen of a foreground ' +
          'session, so those entries are excluded. Top 20 transitions.',
        query: sql(`SELECT
  ${hogqlScreenLabel('toString(properties.previous_screen)')} AS from_screen,
  ${hogqlScreenLabel('toString(properties.$screen_name)')} AS to_screen,
  count() AS transitions
FROM events
WHERE event = '$screen' AND timestamp >= '${CUTOVER}'
  AND toString(properties.previous_screen) != ''
  ${SQL_EXCLUDE_INTERNAL}
GROUP BY from_screen, to_screen
ORDER BY transitions DESC
LIMIT 20`),
      },
      {
        name: 'Exercises started by movement pattern',
        description:
          'What people actually train, not just what they skip. movement_pattern is the ' +
          'bounded catalog dimension — exercise_id is too wide to put on a bar chart.',
        query: trends(
          [ev('exercise_started', { math: 'total' })],
          { ...byEventProp('movement_pattern'), display: BAR },
        ),
      },
      {
        name: 'Most-skipped exercises',
        description:
          'Direct content feedback on the catalog. Broken down by exercise_name (the ' +
          'display name, ~30 rows) so Monday reading does not require a UUID lookup.',
        query: trends([ev('exercise_skipped', { math: 'total' })], { ...byEventProp('exercise_name'), display: BAR }),
      },
      {
        name: 'Feature usage',
        description:
          'Non-workout actions: progress chart, home nudge, saved answers, reminders, ' +
          'review, legal. Proves whether secondary surfaces are touched at all.',
        query: trends([
          ev('progress_range_changed', { math: 'total' }),
          ev('home_nudge_tapped', { math: 'total' }),
          ev('answers_viewed', { math: 'total' }),
          ev('daily_reminder_enabled', { math: 'total' }),
          ev('stretch_reminders_enabled', { math: 'total' }),
          ev('review_manual_tapped', { math: 'total' }),
          ev('legal_document_viewed', { math: 'total' }),
          ev('feedback_submitted', { math: 'total' }),
        ]),
      },
    ],
  },

  {
    id: 1981023,
    formerNames: ['Remedy — Reliability & friction'],
    name: '5. Reliability',
    description:
      'Failures and friction — the niche board. Check here when something looks broken. ' +
      '§1.8: every event carries a reason from a closed set, so each bar is actionable.',
    insights: [
      {
        name: 'All pipeline failures',
        description:
          'One line per failure mode. The point is the shape over time: a step change here ' +
          'is a release regression, and it should be visible without opening seven charts.',
        query: trends([
          ev('purchase_failed', { math: 'total' }),
          ev('purchase_confirmation_failed', { math: 'total' }),
          ev('purchase_verification_failed', { math: 'total' }),
          ev('restore_failed', { math: 'total' }),
          ev('program_assignment_failed', { math: 'total' }),
          ev('session_load_failed', { math: 'total' }),
          ev('session_completion_failed', { math: 'total' }),
          ev('exercise_video_failed', { math: 'total' }),
          ev('signup_failed', { math: 'total' }),
          ev('signin_failed', { math: 'total' }),
        ], { interval: 'day' }),
      },
      {
        name: 'Lost completed workouts — session_completion_failed by reason',
        description:
          'The user finished the workout and we lost it. Worst non-billing failure in the ' +
          'app: the effort was real and the record is gone.',
        query: trends([ev('session_completion_failed', { math: 'total' })], { ...byEventProp('reason'), display: BAR }),
      },
      {
        name: 'Purchase confirmation failures by reason',
        description: 'They paid and we lost the receipt. Cross-check against the restore funnel.',
        query: trends([ev('purchase_confirmation_failed', { math: 'total' })], { ...byEventProp('reason'), display: BAR }),
      },
      {
        name: 'Alert — purchase_verification_failed',
        description:
          'Daily count for the alert. Any non-zero day is a user who paid and may have no entitlement.',
        query: trends([ev('purchase_verification_failed', { math: 'total' })], { interval: 'day' }),
      },
      {
        name: 'Alert — program_assignment_failed',
        description:
          'Daily count for the alert. A spike here is the assign-program retry loop coming back.',
        query: trends([ev('program_assignment_failed', { math: 'total' })], { interval: 'day' }),
      },
      {
        name: 'session_load_failed by reason',
        description: 'Tapped into a session and got nothing.',
        query: trends([ev('session_load_failed', { math: 'total' })], { ...byEventProp('reason'), display: BAR }),
      },
      {
        name: 'exercise_video_failed by reason',
        description:
          'Video is the product. Never carries the signed URL — only which exercise and how ' +
          'it failed.',
        query: trends([ev('exercise_video_failed', { math: 'total' })], { ...byEventProp('reason'), display: BAR }),
      },
      {
        name: 'program_assignment_failed by reason',
        description:
          'The pre-cutover data showed 136 failures against 11 successes concentrated in 4 ' +
          'users (§0.6) — a retry loop, not 136 independent failures. This chart is how we ' +
          'find out whether that is still happening.',
        query: trends([ev('program_assignment_failed', { math: 'total' })], { ...byEventProp('reason'), display: BAR }),
      },
      {
        name: 'Dead ends — empty states by reason',
        description:
          'Home had nothing to offer. rest_day and session_done_today are by design; ' +
          'no_active_plan and no_session_available are the ones to fix.',
        query: trends(
          [ev('home_empty_state_shown', { math: 'total' })],
          { ...byEventProp('reason'), display: BAR },
        ),
      },
      {
        name: 'Onboarding validation failures by reason',
        description: 'Continue tapped with an answer the schema rejected.',
        query: trends(
          [ev('onboarding_validation_failed', { math: 'total' })],
          { ...byEventProp('reason'), display: BAR },
        ),
      },
      {
        name: 'Review prompt skipped by reason',
        description:
          'The only way to tell a working App Store review rollout from a broken one. ' +
          'flag_off / unavailable / native_module_missing are the ones that mean the sheet ' +
          'never had a chance.',
        query: trends(
          [ev('review_prompt_skipped', { math: 'total' })],
          { ...byEventProp('reason'), display: BAR },
        ),
      },
      {
        name: 'Notification permission outcome',
        description:
          'Prompt shown → granted. Denials are permanent on iOS, so the prompt is a one-shot ' +
          'resource and this rate is worth defending.',
        query: funnel(
          [ev('notification_permission_requested'), ev('notification_permission_granted')],
          { funnelsFilter: { funnelWindowInterval: 1, funnelWindowIntervalUnit: 'hour' } },
        ),
      },
      {
        name: 'Feedback submitted',
        description:
          'In-app notes from Profile → Send Feedback. Volume over time — a spike is either ' +
          'a release people are reacting to, or abuse hitting the rate limit next tile.',
        query: trends([ev('feedback_submitted', { math: 'total' })], { interval: 'day' }),
      },
      {
        name: 'Feedback by category',
        description: 'bug / idea / question / other. The body never reaches analytics.',
        query: trends(
          [ev('feedback_submitted', { math: 'total' })],
          { ...byEventProp('category'), display: BAR },
        ),
      },
      {
        name: 'Feedback by rating',
        description:
          'Optional 1–5. 4–5 is the cohort that sees the App Store ask. Unrated notes have ' +
          'no rating property and do not appear here.',
        query: trends(
          [ev('feedback_submitted', { math: 'total' })],
          { ...byEventProp('rating'), display: BAR },
        ),
      },
      {
        name: 'Feedback submit failed by reason',
        description:
          'Abuse and friction on the write path. rate_limited / duplicate mean the caps are ' +
          'doing their job; request_failed is ours.',
        query: trends(
          [ev('feedback_submit_failed', { math: 'total' })],
          { ...byEventProp('reason'), display: BAR },
        ),
      },
      {
        name: 'Feedback → App Store review ask',
        description:
          'Happy-path ask after a 4–5 rating: shown → write-review tap. source_screen is ' +
          'always feedback. Profile Rate Remedy stays on Feature usage.',
        query: funnel(
          [
            ev('review_ask_shown', eventPropEq('source_screen', 'feedback')),
            ev('review_manual_tapped', eventPropEq('source_screen', 'feedback')),
          ],
          { funnelsFilter: { funnelWindowInterval: 1, funnelWindowIntervalUnit: 'hour' } },
        ),
      },
    ],
  },
];

// --- preflight: the taxonomy must actually contain what we charted ----------
//
// Every query below returns HTTP 200 whether or not the event exists — a typo'd event name
// produces a valid query that reports zero forever. Since none of these events have fired
// yet, "0 rows" is indistinguishable from "wrong name" at runtime. So the names are checked
// against the Zod schemas in lib/analytics/events/ instead, which is the only place that
// can prove the app will ever emit them.

const clientTaxonomy = loadTaxonomy();
const serverEvents = loadServerEvents();

/** Walk a query object and collect the events and property references it depends on. */
function collectRefs(query) {
  const events = new Set();
  const eventProps = new Set();
  const personProps = new Set();
  (function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (node.kind === 'EventsNode' && node.event) events.add(node.event);
    if (node.math_property) eventProps.add(node.math_property);
    if (node.retentionFilter) {
      for (const e of [node.retentionFilter.targetEntity, node.retentionFilter.returningEntity]) {
        if (e?.id) events.add(e.id);
      }
    }
    if (node.breakdown && node.breakdown_type === 'event') eventProps.add(node.breakdown);
    if (node.breakdown && node.breakdown_type === 'person') personProps.add(node.breakdown);
    if (node.key && node.type === 'event') eventProps.add(node.key);
    if (node.key && node.type === 'person') personProps.add(node.key);
    for (const v of Object.values(node)) walk(v);
  })(query);
  return { events, eventProps, personProps };
}

function preflight(insights) {
  const problems = [];
  for (const i of insights) {
    // SQL insights reference the schema directly and are verified by executing them.
    if (i.query.kind === 'DataVisualizationNode') continue;
    const { events, eventProps, personProps } = collectRefs(i.query);

    for (const e of events) {
      if (!clientTaxonomy.has(e) && !serverEvents.has(e) && !SDK_EVENTS.has(e)) {
        problems.push(`${i.name}: event "${e}" is not in the taxonomy`);
      }
    }
    for (const p of eventProps) {
      const known = [...events].some((e) => clientTaxonomy.get(e)?.has(p))
        || SERVER_EVENT_PROPS.has(p)
        || SDK_EVENT_PROPS.has(p)
        || [...events].some((e) => serverEvents.has(e));
      if (!known) problems.push(`${i.name}: property "${p}" is on none of [${[...events].join(', ')}]`);
    }
    for (const p of personProps) {
      if (!PERSON_PROPS.has(p)) problems.push(`${i.name}: person property "${p}" is not declared in §4`);
    }
  }
  return problems;
}

// --- execution ---------------------------------------------------------------

const allInsights = DASHBOARDS.flatMap((d) => d.insights.map((i) => ({ ...i, dashboard: d.name })));

const problems = preflight(allInsights);
if (problems.length) {
  console.error(`preflight failed — ${problems.length} reference(s) not backed by the taxonomy:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nFix the insight or the event definition. Refusing to build charts that can only ever show zero.');
  process.exit(1);
}
console.log(`preflight: ${allInsights.length} insights reference only declared events and properties\n`);

if (TILES_ONLY) {
  const existingDashboards = await listAll('dashboards');
  for (const d of DASHBOARDS) {
    const dash = findExistingDashboard(existingDashboards, d);
    if (!dash) {
      console.error(`dashboard missing: ${d.name}`);
      process.exit(1);
    }
    await api(`/dashboards/${dash.id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ name: d.name, description: d.description, tags: TAGS, pinned: true }),
    });
    await syncDashboardTiles(dash.id, d.insights);
    console.log(`tiles ordered: ${d.name} (${d.insights.length})`);
  }
  process.exit(0);
}

if (!APPLY && !VERIFY_ONLY) {
  console.log(`dry run — would ensure ${COHORTS.length} cohorts, ${DASHBOARDS.length} dashboards, ${allInsights.length} insights\n`);
  for (const c of COHORTS) console.log(`  cohort    ${c.name}`);
  for (const d of DASHBOARDS) {
    console.log(`\n  dashboard ${d.name}`);
    for (const i of d.insights) console.log(`    insight  ${i.name}`);
  }
  console.log('\npass --apply to write');
  process.exit(0);
}

const results = [];
const record = (ok, name, detail = '') => {
  results.push({ ok, name, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

if (APPLY) {
  // Annotation marking the cutover, so every chart shows where the taxonomy changed.
  const annotations = await listAll('annotations');
  const marker = 'Analytics taxonomy cutover';
  if (!annotations.some((a) => a.content === marker && !a.deleted)) {
    await api('/annotations/', {
      method: 'POST',
      body: JSON.stringify({
        content: marker,
        date_marker: `${CUTOVER}T00:00:00Z`,
        scope: 'project',
      }),
    });
    record(true, 'cutover annotation created');
  } else {
    record(true, 'cutover annotation already present');
  }

  // Cohorts
  const existingCohorts = await listAll('cohorts');
  for (const c of COHORTS) {
    const found = existingCohorts.find((x) => x.name === c.name && !x.deleted);
    try {
      if (found) {
        await api(`/cohorts/${found.id}/`, { method: 'PATCH', body: JSON.stringify(c) });
        record(true, `cohort updated: ${c.name}`, `id ${found.id}`);
      } else {
        const made = await api('/cohorts/', { method: 'POST', body: JSON.stringify(c) });
        record(true, `cohort created: ${c.name}`, `id ${made.id}`);
      }
    } catch (e) {
      record(false, `cohort: ${c.name}`, String(e).slice(0, 200));
    }
  }

  // Dashboards + insights
  const existingDashboards = await listAll('dashboards');
  const existingInsights = await listAll('insights');

  for (const d of DASHBOARDS) {
    let dash = findExistingDashboard(existingDashboards, d);
    if (!dash) {
      dash = await api('/dashboards/', {
        method: 'POST',
        body: JSON.stringify({ name: d.name, description: d.description, tags: TAGS, pinned: true }),
      });
      record(true, `dashboard created: ${d.name}`, `id ${dash.id}`);
    } else {
      await api(`/dashboards/${dash.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ name: d.name, description: d.description, tags: TAGS, pinned: true }),
      });
      record(true, `dashboard present: ${d.name}`, `id ${dash.id}`);
    }

    for (const i of d.insights) {
      const body = {
        name: i.name,
        description: i.description,
        query: i.query,
        tags: TAGS,
        dashboards: [dash.id],
      };
      const found = findExistingInsight(existingInsights, i);
      try {
        if (found) {
          await api(`/insights/${found.id}/`, { method: 'PATCH', body: JSON.stringify(body) });
          record(true, `insight updated: ${i.name}`);
        } else {
          await api('/insights/', { method: 'POST', body: JSON.stringify(body) });
          record(true, `insight created: ${i.name}`);
        }
      } catch (e) {
        record(false, `insight: ${i.name}`, String(e).slice(0, 250));
      }
    }

    try {
      await syncDashboardTiles(dash.id, d.insights);
      record(true, `dashboard tiles ordered: ${d.name}`);
    } catch (e) {
      record(false, `dashboard tiles: ${d.name}`, String(e).slice(0, 250));
    }
  }

  const dashboardsAfter = await listAll('dashboards');
  for (const name of STARTER_DASHBOARDS) {
    const starter = dashboardsAfter.find((x) => x.name === name && !x.deleted);
    if (!starter) {
      record(true, `starter dashboard already gone: ${name}`);
      continue;
    }
    if (!starter.pinned) {
      record(true, `starter dashboard already unpinned: ${name}`, `id ${starter.id}`);
      continue;
    }
    try {
      await api(`/dashboards/${starter.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ pinned: false }),
      });
      record(true, `unpinned starter dashboard: ${name}`, `id ${starter.id}`);
    } catch (e) {
      record(false, `unpin ${name}`, String(e).slice(0, 200));
    }
  }

  const insightsAfter = await listAll('insights');
  for (const name of OBSOLETE_INSIGHT_NAMES) {
    const found = insightsAfter.find((x) => x.name === name && !x.deleted);
    if (!found) {
      record(true, `obsolete insight already gone: ${name}`);
      continue;
    }
    try {
      await api(`/insights/${found.id}/`, { method: 'PATCH', body: JSON.stringify({ deleted: true }) });
      record(true, `obsolete insight deleted: ${name}`, `id ${found.id}`);
    } catch (e) {
      record(false, `delete obsolete: ${name}`, String(e).slice(0, 200));
    }
  }

  // Personal keys often lack user:read. Dashboards carry created_by, which is enough
  // to subscribe the project owner without a second scope.
  const ownerId = dashboardsAfter.find((d) => d.created_by?.id)?.created_by?.id;
  if (!ownerId) {
    record(false, 'alerts', 'could not resolve a created_by user id for subscribed_users');
  } else {
    const existingAlerts = await listAll('alerts');
    for (const a of ALERTS) {
      const insight = insightsAfter.find((x) => x.name === a.insightName && !x.deleted);
      if (!insight) {
        record(false, `alert: ${a.name}`, `insight "${a.insightName}" not found`);
        continue;
      }
      const body = {
        insight: insight.id,
        name: a.name,
        subscribed_users: [ownerId],
        enabled: true,
        calculation_interval: 'daily',
        condition: { type: 'absolute_value' },
        threshold: { configuration: { type: 'absolute', bounds: { upper: 0 } } },
        config: { type: 'TrendsAlertConfig', series_index: 0, check_ongoing_interval: true },
      };
      const found = existingAlerts.find((x) => x.name === a.name);
      try {
        if (found) {
          await api(`/alerts/${found.id}/`, { method: 'PATCH', body: JSON.stringify(body) });
          record(true, `alert updated: ${a.name}`, `insight ${insight.id}`);
        } else {
          await api('/alerts/', { method: 'POST', body: JSON.stringify(body) });
          record(true, `alert created: ${a.name}`, `insight ${insight.id}`);
        }
      } catch (e) {
        record(false, `alert: ${a.name}`, String(e).slice(0, 250));
      }
    }
  }
}

// Verify: every saved query must actually execute. A dashboard of broken tiles is worse
// than no dashboard, because it looks like an answer.
console.log('\nexecuting every saved query…\n');
for (const i of allInsights) {
  try {
    const res = await fetch(`${API}/query/`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ query: i.query }),
    });
    const text = await res.text();
    if (!res.ok) { record(false, `runs: ${i.name}`, `HTTP ${res.status} ${text.slice(0, 200)}`); continue; }
    const json = JSON.parse(text);
    const rows = json.results?.length ?? json.result?.length ?? 0;
    record(true, `runs: ${i.name}`, `${rows} row(s)`);
  } catch (e) {
    record(false, `runs: ${i.name}`, String(e).slice(0, 200));
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  process.exit(1);
}
