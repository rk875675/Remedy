# Remedy — Analytics Contract

> **Status: PHASES 0–4 COMPLETE. PHASE 5 IN PROGRESS.** Client instrumentation (§3.3–§3.5,
> §3.7–§3.10) and the server truth layer (§3.6) are written, typed, deployed, and confirmed
> live in PostHog (§7.6). The analysis layer (§7.7) is built as code: 5 dashboards, 56
> insights, 7 cohorts, all executing.
>
> **The first device run is done, and it earned its keep** (§9.1). 312 events, four real
> defects — a render loop re-invoking an edge function 1.4×/second, phantom hints on resume,
> one purchase reported three times, and internal traffic excluded from nothing. All four
> are fixed. The free funnel is verified end to end: onboarding steps complete in order, the
> anonymous → authenticated merge holds with zero orphans, `acquisition_source` survives it,
> screen names are normalized, and no PII reached PostHog.
>
> **Project configuration is complete** (§10.2): revenue mapping and internal-traffic
> exclusion are applied and verified, and no work in this document is blocked on a
> credential.
>
> **Remaining: a real (non-internal) paid path.** Sandbox `subscription_started` and
> `subscription_renewed` have fired; `trial_started` has not, because the current SKU is
> no-trial. `subscription_restored` / cancelled / refunded are still unexercised.
>
> **Production numbers are clean.** Every pre-launch account is flagged internal and the
> exclusion is retroactive, so the dashboards currently read zero real traffic — which is
> the correct reading, not a broken one.
>
> This document is the contract between the product and PostHog. The typed event wrappers in
> `lib/analytics/` and this file must be updated in the same change. If they disagree, this
> file is wrong and must be fixed — never the other way around.
>
> **Target PostHog project: `470505`** (US cloud, `https://us.i.posthog.com`).
> The project key in `.env.local` has been verified live against this host.

---

## 0. App inventory (what we are measuring)

### 0.1 Stack and observability surfaces

| Area | Reality in this repo |
|---|---|
| Platform | React Native 0.81.5 / React 19.1.0, Expo SDK 54 (`~54.0.35`), managed workflow, **iOS only** (`com.remedyappco.ios`) |
| Router | `expo-router` v6, file-based. Root is a real `Stack` in `app/_layout.tsx`, not a `Slot`. |
| Navigation observability | `useSegments()` and `useRouter()` are already used by the root guard in `app/_layout.tsx`. `usePathname` and `useNavigationContainerRef` are unused — a screen listener can be added at the root without touching product code. |
| Auth | Supabase Auth (`@supabase/supabase-js`), PKCE, AsyncStorage-persisted session. Single `onAuthStateChange` listener in `context/AuthContext.tsx`. |
| Stable user id | `session.user.id` — the Supabase Auth UUID. Also the `profiles.id` PK and the `user_id` FK on every domain table. **This is the only acceptable `distinct_id`.** |
| Pre-auth activity | **Yes, and it is the entire acquisition funnel.** Sign-up happens *after* the paywall (PRD §5 step 13). A user can complete 13 onboarding steps, see a program preview, view the paywall, and purchase a subscription with **no account**. Answers live in `OnboardingContext` + AsyncStorage; a purchase is stashed in `lib/pendingPurchase.ts`. |
| Monetization | Superwall (`expo-superwall`) renders the paywall for placement `onboarding_paywall`; Apple IAP / StoreKit (`expo-iap`) processes the purchase; **Supabase is the billing source of truth**. No Stripe, no RevenueCat. |
| Server learns about billing | Client-initiated `verify-purchase` / `restore-purchases`, plus the `apple-assn` edge function (App Store Server Notifications V2) for renewals, cancellations, expiries, and refunds. |
| Notifications | `expo-notifications`. Local daily reminder + stretch-break reminders scheduled on-device; push token stored on `profiles.push_token` but nothing sends remote push yet. |
| Existing telemetry | PostHog only. No Sentry, no Amplitude, no Mixpanel, no telemetry tables in Postgres. |
| Linter | **No ESLint config exists.** Import restrictions cannot be enforced by lint; the facade boundary will be enforced by a header comment plus a check in the verification script. |
| Validation | `zod` ^3.23.8 already used for strict boundary schemas in `lib/schemas.ts`. Event payload validation will follow the same pattern. |

### 0.2 Core loop (one sentence)

**A user opens the app, taps into today's prescribed session, works through 4–6 video-guided
exercises with a pain check-in before and after, and completes it — if they stop completing
sessions, they have churned.**

### 0.3 First-run path (cold install → first real value)

```
Application Installed
  → /(onboarding)              welcome
  → /(onboarding)/founder      interstitial
  → /(onboarding)/education    interstitial
  → /(onboarding)/q0           where did you hear about us      (analytics-only answer)
  → /(onboarding)/q9           tried anything before            (analytics-only answer)
  → /(onboarding)/recognize    which stuck-pain patterns feel true  (analytics-only; copy depends on q9)
  → /(onboarding)/seen         one tailored mindset interstitial (q9 + recognize)
  → /(onboarding)/q6           main goals            (multi)  ← personalizing quiz starts
  → /(onboarding)/q1           pain location
  → /(onboarding)/q2           pain duration
  → /(onboarding)/q3           pain type             (multi)
  → /(onboarding)/q4           activity level
  → /(onboarding)/q5           pain triggers         (multi)
  → /(onboarding)/q7           equipment tier + safety disclaimer modal
  → /(onboarding)/q8           time budget + cadence → sessions_per_week_preference
  → /(onboarding)/finalizing   animated "building your plan"
  → /(onboarding)/match        server-computed plan preview  →  Superwall paywall
  → /(auth)/sign-in            Apple / Google / Email          ← FIRST TIME AN ACCOUNT EXISTS
  → /building-plan             persist answers, verify purchase, assign program
  → /(tabs)                    home
  → /orientation               three-slide mindset orientation      (first session start only)
  → /session/[id]              ← FIRST REAL VALUE
```

Two things about this path drive the whole instrumentation design:

1. **Twelve of the ~17 funnel screens happen before the user has an ID.** If the
   anonymous → authenticated merge is broken, the entire acquisition funnel is orphaned and
   unattributable. This is the single highest-risk part of the implementation.
2. **Money changes hands before the account exists.** The purchase is stashed on device and
   verified after signup. Attribution of revenue to a person depends on the same merge.

### 0.4 Domain model (the nouns our taxonomy must use)

```
profile ─1:1─ onboarding_answers
profile ─1:1─ entitlements ─1:N─ billing_events
profile ─1:1─ user_programs (progress pointer) ──► user_program_plans (active snapshot)
                                                      └─N─ user_plan_sessions
                                                             └─N─ user_plan_session_exercises ──► exercises
profile ─1:N─ session_completions ─1:N─ pain_checkins (before | after)
user_program_plans ─1:N─ user_weekly_ramp_decisions
```

Canonical identifier names, used identically in every event that carries them:
`user_id`, `plan_id`, `plan_session_id`, `exercise_id`, `week_number`, `session_number`,
`original_transaction_id`, `product_id`.

### 0.5 Existing PostHog usage — and what is wrong with it

`lib/analytics.ts` (19 lines) plus `<PostHogProvider>` in `app/_layout.tsx`, with 16 event
names fired from 8 files. It must be replaced, not extended, for five concrete reasons:

1. **Two independent PostHog clients exist.** `lib/analytics.ts` constructs
   `new PostHog(key, …)` at module scope, and `app/_layout.tsx` separately mounts
   `<PostHogProvider apiKey={…}>`, which constructs a second one. `identify()` is called on
   the standalone client; SDK autocapture runs on the provider's client. They do not share
   in-memory identity state, so **the anon → auth merge is not reliable today.**
2. **Undeclared autocapture.** `<PostHogProvider>` is mounted with no `autocapture` prop.
   Per `posthog-react-native@4.50.0`'s own typings, that means `captureScreens: true` and
   `captureAppLifecycleEvents: true` are silently on. Nobody chose that.
3. **The kill switch is partial.** `trackEvent` checks `EXPO_PUBLIC_POSTHOG_KEY`, but
   `identifyUser` and `resetAnalytics` do not, and both provider and standalone client are
   constructed unconditionally at import time with `key ?? ''`.
4. **Host mismatch.** `lib/analytics.ts` hardcodes `https://us.i.posthog.com`;
   `_layout.tsx` reads `EXPO_PUBLIC_POSTHOG_HOST`. Change the env var and half the events
   go somewhere else.
5. **Untyped call sites.** Every call is `trackEvent('some_string', {…})` with
   `Record<string, unknown>` properties. Nothing prevents a typo or a missing property.

Additionally, `trackEvent('onboarding_completed', { ...complete, retake: true })` in
`app/(onboarding)/match.tsx` spreads the entire answers object — which is fine today because
every field is a closed enum, but is exactly the pattern that leaks a free-text field the
first time someone adds one.

**None of the 16 current events are load-bearing for any decision, the app is not live, and
no historical data matters.** Confirmed: they are renamed to the taxonomy below rather than
bridged. No backwards-compatibility shim is needed anywhere.

### 0.6 Audit of what project 470505 actually contains

1,889 events from ~25 persons between 2026-06-14 and 2026-08-08, all dev/TestFlight traffic.
Measured, not assumed:

| Finding | Evidence | Consequence |
|---|---|---|
| **There is no screen tracking at all.** | Zero `$screen` events, despite `<PostHogProvider>` defaulting `captureScreens: true`. | The SDK's screen autocapture hooks React Navigation in a way `expo-router` does not satisfy. Confirms §7's decision to emit our own normalized `screen()` — we are not replacing working behaviour, we are filling a hole. |
| **Lifecycle autocapture works.** | `Application Became Active` (407), `Backgrounded` (292), `Opened` (192), `Installed` (6). | Confirms §7's decision to leave lifecycle capture **on**. This is the only install/return signal that exists. |
| **The anon → auth merge mostly works, but is not clean.** | 11 persons hold both pre-auth and post-auth events; 6 are pre-auth only; **1 is post-auth-only orphaned**. Distinct-ids-per-person: 14 persons with 1, then 7 / 1 / 1 / 1 / 1 persons holding 2, 3, 4, 5 and **9** ids. | Both clients share the same AsyncStorage persistence key, which is why identity mostly survives — but the two-client split in §0.5 means it is coincidence, not design. The 9-id person is repeated dev reinstalls, not necessarily a bug. |
| **`program_assign_failed` fires 136 times against 11 `program_assigned` successes.** | 136 events / 4 persons vs 11 events / 10 persons. | A 12:1 failure-to-success ratio concentrated in 4 users looks like a retry loop, not 136 independent failures. Worth a look independent of analytics — flagged, not investigated here. |
| **Taxonomy drift has already happened.** | `onboarding_download_reason` has 18 events (2026-06-25 → 2026-07-04) and **does not exist anywhere in the codebase** — it was renamed to `onboarding_hear_about` and the old name was left orphaned in PostHog. | Exactly the drift this document exists to prevent. Reinforces the §8 rule that the doc and the wrappers ship in the same commit. |

Existing data is **not purged** — it is harmless dev traffic. Instead, an annotation marks the
instrumentation cutover date, and every Phase 6 insight is scoped to on-or-after that date so
no chart silently mixes the old and new taxonomies.

---

## 1. Measurement model

### 1.1 North-star metric

**Completed sessions per active subscriber per week.**

Justification: it is the only number that goes up when the product is actually working. It
requires the user to still be subscribed (revenue), to still be opening the app (retention),
and to finish what they started (value delivery). Every PRD success metric — D7/D30
retention, trial→paid conversion, and average pain improvement — is downstream of it.

### 1.2 Input metrics

| # | Input metric | Why it moves the north star |
|---|---|---|
| 1 | **Onboarding completion rate** (`onboarding_started` → `onboarding_completed`) | Nobody reaches the paywall without it; 10 questions plus interstitials is a lot of surface to lose people on. |
| 2 | **Paywall conversion rate** (`paywall_viewed` → `purchase_flow_completed`) | Gates the subscriber population. Server grant (`trial_started` **OR** `subscription_started`) is a separate check — the no-trial SKU never emits `trial_started`. |
| 3 | **Activation rate** (see 1.3) | A user who never finishes one session never finishes a hundred. |
| 4 | **Weekly completion rate** (`session_completed` ÷ prescribed sessions for that week) | Directly the numerator of the north star. |
| 5 | **Trial → paid conversion** (server `trial_started` → server `subscription_started`) | Converts engagement into the revenue the north star is measured over. PRD target > 25%. |

### 1.3 Activation

> **A user is activated when they fire `session_completed` with `is_first_session = true`
> within 48 hours of `program_assigned`.**

Single real event, real property, real time bound. It is deliberately *completion*, not
*start*: starting a session only proves curiosity, whereas finishing one means the user did
15 minutes of exercise and gave us a before/after pain score — that is the product's promise
delivered once. The 48-hour bound is a recommended default, not a PRD fact — see
`HUMAN INPUT NEEDED` #3.

### 1.4 Habit / engagement metric

**Weekly Active Completer (WAC): a user with ≥ 2 `session_completed` events in a rolling
7-day window.**

Deliberately *not* DAU/MAU. The product prescribes 3–5 sessions per week
(`sessions_per_week_preference` is constrained to 3–5 client-side, 2–5 in the DB), and rest
days are part of the program design. A user doing 3 sessions a week is a model user and
would look like a 43% DAU/MAU failure. The threshold of 2 is the floor at which a program
still progresses; the ratio **WAC ÷ prescribed cadence** is the adherence measure to watch.

### 1.5 Retention

Two curves, because the PRD asks for one thing and the product needs another.

| Curve | Cohort (day 0) | "Returned" event | Interval | Why |
|---|---|---|---|---|
| **Program retention** (primary) | `program_assigned` | `session_completed` | Weekly, W0–W9 | Programs run 5–10 weeks. This is the curve that predicts churn and answers "does the program hold people?" |
| **Open retention** (PRD D7/D30, cutover-scoped) | first `Application Opened` after 2026-08-09 | `Application Opened` | Daily, D1/D7/D30 | PRD §10 still names install retention. `Application Installed` last fired 2026-06-20 and will not re-fire for anyone already on device, so the live curve cohorts on first open after cutover. |

Both must be sliceable by `subscription_status`, `plan_interval`, `acquisition_source`, and
`equipment_tier`.

### 1.6 Funnels

Every funnel below is answerable from the event table in §3.

| Funnel | Steps | The drop-off question each step answers |
|---|---|---|
| **F1 — Onboarding → Activation** | `onboarding_started` → `onboarding_completed` → `paywall_viewed` → `purchase_flow_completed` → `signup_completed` → `program_assigned` | Where between "started onboarding" and "got a program" do we lose people? First session is In-App (F4) and the activation-rate tile, not this funnel. The product funnel still *conceptually* starts at `Application Installed`, but that event is once-per-install and last fired 2026-06-20 — a cutover-scoped insight that starts there is empty forever. Post-paywall handoff (purchase stash → signup → assignment) is still the risky drop. |
| **F2 — Onboarding step funnel** | `onboarding_step_viewed` / `onboarding_step_completed` for the question keys only (`q0`, `q9`, `q6`, `q1`–`q5`, `q7`, `q8`, `recognize`) | Which question is the expensive one? Interstitials (welcome / founder / education / seen / finalizing / match) are excluded. `time_on_step_ms` separates "hard question" from "boring question". |
| **F3 — Monetization** | `paywall_viewed` → `paywall_presented` → `purchase_started` → `purchase_flow_completed` | Did they see the paywall, did Superwall actually render one, did they start a purchase, did Apple complete it? Stops at the client purchase because the no-trial SKU never emits `trial_started`. Server grant (`trial_started` **OR** `subscription_started`) is a separate SQL tile. Trial → paid stays its own funnel. |
| **F4 — Session completion** | `session_start_tapped` → `session_previewed` → `session_started` → `exercise_started` → `session_completed` | Do people bail at the preview, at the pain check-in, at the first exercise, or midway? `session_abandoned` carries `phase_key` for exactly this. |
| **F5 — Auth** | `signup_started` → `signup_completed`, broken down by `method` | Is Apple/Google/Email failing differently? This runs *after* money has changed hands, so a failure here is a paid user with no account. |
| **F6 — Restore** | `restore_started` → `restore_succeeded` | The App Store-required path, and the recovery path for every purchase-verification failure. |
| **F7 — Week progression** | `weekly_ramp_decided` → `session_completed` | After they choose progress vs hold, do they come back and finish another session? Broken down by `decision`. Starts at the decide event because `session_completed` does not carry `decision`. |

### 1.7 Cohort dimensions

Every metric above must be sliceable by these person properties (full definitions in §4):

`subscription_status`, `plan_interval`, `is_trial`, `acquisition_source`, `signup_method`,
`activity_level`, `pain_duration`, `pain_location`, `equipment_tier`,
`sessions_per_week_preference`, `primary_goal`, `paywall_variant_id`, `is_internal`,
`environment`, plus SDK-provided `$app_version` and `$os_version`.

### 1.8 Quality and friction signals

These are first-class events, not afterthoughts. Every one has a `reason` from a closed set.

- **Purchase pipeline:** `purchase_failed`, `purchase_confirmation_failed`,
  `purchase_verification_failed`, `restore_failed`
- **Program pipeline:** `program_assignment_failed`
- **Session pipeline:** `session_load_failed`, `session_completion_failed`,
  `exercise_video_failed`
- **Auth:** `signup_failed`, `signin_failed`, `account_deletion_failed`
- **Abandonment:** `session_abandoned` (with `phase_key`),
  `onboarding_step_exited` (with `exit_type`)
- **Permissions:** `notification_permission_denied`
- **Dead ends:** `onboarding_validation_failed`, `home_empty_state_shown`

### 1.9 Product usage

Workout completions are the north star. They do not answer "what is the user doing in
the app." These four do, and they sit on **3. In-App** after the core-loop tiles:

| Metric | Source | Decision it changes |
|---|---|---|
| **Screen mix** | `$screen` by `$screen_name` | Which surfaces get built; which are dead. |
| **Tab mix** | `$screen` on `/(tabs)`, `/(tabs)/progress`, `/(tabs)/profile` | Whether Progress and Profile are used, or Home is the entire product. |
| **Time in app per user per day / week** | `Application Opened` → `Application Backgrounded` (paired); `app_session_ended` after the next client release | Stickiness independent of completions. A subscriber who opens 4 minutes a week and never trains is not a north-star success. |
| **Screen dwell** | Time from `$screen` to the next `$screen` or `Application Backgrounded`; `screen_exited.time_on_screen_ms` after the next client release | Which screens hold attention vs bounce. |

`tab_switched` stays dropped (§6.1). Autocapture of every tap stays off (§7). Session
replay stays off (§7). Those would raise event volume and App Store disclosure without
changing a product decision.

---

## 2. Naming and schema standards

- **Events:** `snake_case`, `object_verb`, verb in past tense. `session_completed`,
  `paywall_dismissed`, `purchase_failed`. Never `Completed Session`, never camelCase, never
  present tense.
- **Properties:** `snake_case`, with units in the name: `_ms`, `_seconds`, `_count`, `_at`
  (ISO 8601 string), `_id`. Booleans read as assertions: `is_trial`, `has_active_plan`.
- **Enumerated properties** use a fixed documented value set, expressed as a TypeScript union
  and a Zod enum. No free text, ever.
- **Identifier names are global.** `plan_session_id` means the same thing in every event that
  carries it.
- **Reserved namespace:** never define our own `$`-prefixed property.
- **Cardinality:** UUIDs (`plan_id`, `plan_session_id`, `exercise_id`) may be sent as
  properties for per-entity drill-down. The sanctioned *breakdown* for the catalog is
  `exercise_name` (~30 display names). `exercise_id` stays on the event for joins.
  Never break down by `plan_session_id`.

### 2.1 Accepted exceptions

`Application Installed`, `Application Opened`, `Application Backgrounded`,
`Application Became Active`, `Application Updated`, `Deep link opened`, and `$screen` are
emitted by the PostHog SDK with SDK-owned names. They violate our casing convention and we
keep them anyway: they are the canonical names PostHog's own mobile reports key off, and
renaming them would cost more than it buys. Everything we author follows the rules above.

---

## 3. Event table

`C` = fired from the client. `S` = fired server-side from a Supabase edge function.
`SDK` = emitted by `posthog-react-native` autocapture.

Property types: `str` (enumerated unless noted), `int`, `float`, `bool`, `iso` (ISO 8601
timestamp string), `uuid`.

### 3.1 Lifecycle — SDK

| Event | Fires when | Trigger location | Properties | Notes |
|---|---|---|---|---|
| `Application Installed` | First launch after install | SDK lifecycle autocapture | SDK-provided | Day-0 cohort for install retention. Not reliable across reinstalls. |
| `Application Opened` | Cold start or return from background | SDK | `from_background` (SDK) | "Returned" event for install retention. |
| `Application Backgrounded` | App backgrounded | SDK | SDK-provided | Also consumed in-app to close open funnel steps — see `onboarding_step_exited`. |
| `Application Became Active` | Foregrounded | SDK | SDK-provided | |
| `Application Updated` | Version changed | SDK | SDK-provided | |
| `Deep link opened` | `remedy://` link opened | SDK | SDK-provided | Email OTP / password recovery land here. |

### 3.2 Screens — C

| Event | Fires when | Trigger location | Required properties | Optional | Notes |
|---|---|---|---|---|---|
| `$screen` | Every screen visit (navigate, or return from background) | `useProductUsageTracking()` in `lib/analytics/productUsage.ts`, mounted via `<AnalyticsBridge />` | `$screen_name` str (route **pattern**), `is_authenticated` bool, `is_onboarded` bool, `is_premium` bool, `has_active_plan` bool, `is_retaking` bool | `previous_screen` str (null on the first screen of a **foreground** session) | See §3.2.1. Returning from background is a new visit so dwell excludes time away. |
| `screen_exited` | Leaving a screen by navigate or background after ≥400ms | same | `screen_name` str, `time_on_screen_ms` int, `exit_type` str, `is_authenticated` bool, `is_onboarded` bool, `is_premium` bool, `has_active_plan` bool, `is_retaking` bool | — | `exit_type` ∈ `navigate` \| `backgrounded`. iOS `inactive` is not an exit. `$screen` still fires on every visit. `screen_exited` is omitted when dwell is under 400ms (tab flicker) so bounce noise does not inflate volume or dwell charts. Onboarding dashboards still use `onboarding_step_*`. |
| `app_session_ended` | App backgrounded | same | `duration_ms` int, `screen_count` int, `ended_reason` str, `is_authenticated` bool, `is_premium` bool | — | One foreground period. `ended_reason` ∈ `backgrounded`. Flushed immediately so the duration is not stuck in the queue when iOS suspends the process. |

`subscription_status` and plan tier are deliberately **not** on this event. They are person
properties set authoritatively by the server (§4), and PostHog can break any event down by a
person property already. Copying them onto every screen view would add payload and create a
second, staler source of truth for the same fact.

#### 3.2.1 Closed set of `$screen_name` values

Enforced in code as the `KNOWN_SCREENS` allow-list in `lib/analytics/routes.ts`. The two lists
must stay identical.

`/(onboarding)`, `/(onboarding)/founder`, `/(onboarding)/education`, `/(onboarding)/q0`,
`/(onboarding)/safety`, `/(onboarding)/q9`, `/(onboarding)/q6`, `/(onboarding)/q1`, `/(onboarding)/q2`,
`/(onboarding)/recognize`, `/(onboarding)/seen`,
`/(onboarding)/q3`, `/(onboarding)/q4`, `/(onboarding)/q5`, `/(onboarding)/q7`,
`/(onboarding)/q8`, `/(onboarding)/finalizing`, `/(onboarding)/match`,
`/(auth)/sign-in`, `/(auth)/email`, `/(legal)/terms`, `/(legal)/privacy`, `/(tabs)`,
`/(tabs)/progress`, `/(tabs)/profile`, `/session/[id]`, `/building-plan`, `/weekly-ramp`,
`/orientation`, `/program-complete`, `/onboarding-answers`, `/auth-callback`, `/reset-password`,
`/feedback`.

Cardinality is bounded by that list rather than trusted to the router. A route not on it emits
the literal name `unknown` and logs a warning in development naming the file to update — so a
new screen announces itself loudly instead of silently adding a row to every screen report.
The transient empty-segment state during a root transition emits nothing at all.

`exit_type` on `screen_exited` ∈ `navigate` \| `backgrounded`. `ended_reason` on
`app_session_ended` ∈ `backgrounded`. `screen_name` is the §3.2.1 list plus `unknown`.

`/session/[id]` is emitted **as the literal pattern string**, never interpolated. The session
UUID travels as `plan_session_id` on the session events instead. Query params (`?mode=signup`,
`?week=3`, `?retake=1`, `?token_hash=…`) are **never** part of the screen name — note that
`auth-callback` receives an auth token in its query string, which is exactly why this rule is
absolute.

### 3.3 Onboarding — C

Step keys are the members of `ONBOARDING_FLOW` in `context/OnboardingContext.tsx`, plus
`finalizing` and `match`. `step_index` is the array index (0-based), so funnel ordering
survives a reorder of the keys. The `recognize` / `seen` block sits after
q9 and before the personalizing quiz (`q6`). The seen interstitial is tailored from
q9 (`tried_before`) plus the first recognize selection.

| Event | Fires when | Trigger location | Required properties | Optional | Notes |
|---|---|---|---|---|---|
| `onboarding_started` | "Get Started" tapped on welcome | `app/(onboarding)/index.tsx` | `is_resume` bool | `resume_step_key` str, `resume_step_index` int | Top of F1/F2. |
| `onboarding_step_viewed` | The router settles on a funnel step | `useOnboardingStepTracking` in `lib/analytics/onboardingSteps.ts` | `step_key` str, `step_index` int, `is_retake` bool | — | Driven off the active route, not screen mount: expo-router keeps earlier screens mounted, so a mount hook would miss every back-navigation and re-entry. Exactly one `viewed` and one `exited` per visit. |
| `onboarding_step_completed` | Continue pressed with a valid answer | Each `q*.tsx` continue handler, via `useOnboardingStepCompletion()` | `step_key` str, `step_index` int, `time_on_step_ms` int, `is_retake` bool | `answer_count` int (multi-selects) | Primary F2 step event. |
| `onboarding_step_exited` | Leaving a step by any route | `lib/analytics/onboardingSteps.ts` — route watcher + `AppState` listener | `step_key` str, `step_index` int, `time_on_step_ms` int, `exit_type` str | — | `exit_type` ∈ `forward` \| `backward` \| `backgrounded` \| `abandoned`. Without this, a user who took a phone call is indistinguishable from a user who quit. Returning to the foreground starts a *new* visit, so dwell time excludes the time away. |
| `onboarding_option_selected` | An option is tapped on a question screen | Each `q*.tsx` select handler | `step_key` str, `option_value` str, `is_multi_select` bool, `is_deselect` bool | `selection_count` int | All option values are closed enums (§3.3.1). `q2` sends the engine bucket (`pain_duration`), not the UI row id. |
| `onboarding_hint_shown` | Personalization bubble renders | `components/onboarding/PersonalizationBubble.tsx` | `step_key` str, `hint_key` str | — | Replaces `onboarding_option_bubble_shown`. |
| `onboarding_disclaimer_viewed` | Equipment safety modal opens | `components/onboarding/EquipmentDisclaimerModal.tsx` | `equipment_tier` str | — | Replaces `onboarding_equipment_disclaimer_shown`. |
| `onboarding_disclaimer_confirmed` | Modal confirmed | same | `equipment_tier` str, `time_on_step_ms` int | — | Replaces `onboarding_equipment_disclaimer_confirmed`. |
| `onboarding_plan_previewed` | `assign-program?preview_only` resolves on match | `app/(onboarding)/match.tsx` | `preview_source` str (`server` \| `fallback`), `duration_weeks` int, `sessions_per_week` int | `primary_focus` str, `equipment_tier` str | `fallback` means the edge function failed and the user is seeing client-side copy. The invoke itself is cached on the answers fingerprint for the JS session — Superwall remounts must not re-hit the edge function. The event is separately deduped on the result fingerprint. |
| `onboarding_completed` | "Start My Program" with complete answers | `app/(onboarding)/match.tsx` `handleStart()` | `pain_location` str, `pain_duration` str, `activity_level` str, `equipment_tier` str, `primary_goal` str, `pain_type_count` int, `pain_trigger_count` int, `goal_count` int, `sessions_per_week_preference` int, `is_retake` bool | `time_in_funnel_ms` int | `time_in_funnel_ms` is measured from "Get Started" (`markOnboardingFunnelStart`) and omitted only if that tap never happened in this JS session (deep-link resume). Sends the *primary* goal and counts rather than spreading raw arrays. |
| `onboarding_validation_failed` | "Start My Program" with incomplete answers | `app/(onboarding)/match.tsx` `handleStart()` | `reason` str (`incomplete_answers` \| `session_expired`), `missing_field_count` int | — | This dead end is currently invisible. |
| `onboarding_retake_confirmed` | Retake confirmed from saved answers | `app/onboarding-answers.tsx` | `source_screen` str | — | Existing event, kept. |

#### 3.3.1 Closed value sets (from `lib/schemas.ts` and `types/database.ts`)

| Property | Values |
|---|---|
| `pain_location` | `upper` \| `lower` \| `all` |
| `pain_duration` | `acute` \| `subacute` \| `chronic` |
| `pain_type` (element) | `stiffness` \| `ache` \| `sharp` \| `nerve` |
| `activity_level` | `sedentary` \| `light` \| `active` \| `athlete` |
| `pain_trigger` (element) | `sitting` \| `bending` \| `standing` \| `morning` \| `exercise` \| `other` |
| `equipment_tier` | `open_space` \| `bands_dumbbells` \| `gym` |
| `main_goal` / `primary_goal` | `reduce_pain` \| `return_to_exercise` \| `sleep` \| `mobility` |
| `sessions_per_week_preference` | int, 3–7 (derived from `sessionsPerWeekSchema`, which is a ranged int rather than a literal union) |
| `acquisition_source` | `instagram` \| `facebook` \| `tiktok` \| `youtube` \| `google` \| `friend_family` \| `other` |
| `prior_attempts` (`q9`) | `yes` \| `no` |
| `recognize_pattern` (`recognize`) | `effort` \| `return_loop` \| `flinch` \| `permanence` |
| `session_length` (`q8`) | `minutes_15` \| `minutes_20` \| `minutes_30` |
| `training_cadence` (`q8`) | `days_3` \| `days_4` \| `days_5` \| `days_6` \| `days_7` (legacy: `every_day` \| `every_other_day`) |
| `home_empty_state_reason` | `program_complete` \| `no_active_plan` \| `rest_day` \| `session_done_today` \| `no_session_available` |
| `exercise_phase` | `mobility` \| `activation` \| `strength` \| `recovery` |
| `subscription_status` | `none` \| `trial` \| `active` \| `cancelled` \| `expired` \| `dev_trial` |
| `product_id` | `com.remedyapp.weekly` \| `com.remedyapp.monthly` \| `com.remedyapp.annual` \| `com.remedyapp.weekly.no.trial` \| `com.remedyapp.monthly.no.trial` \| `com.remedyapp.annual.no.trial` |
| `plan_interval` | `weekly` \| `monthly` \| `annual` \| `none` |

### 3.4 Authentication — C

| Event | Fires when | Trigger location | Required properties | Optional | Notes |
|---|---|---|---|---|---|
| `signup_started` | Auth button tapped in signup mode | `app/(auth)/sign-in.tsx`, `app/(auth)/email.tsx` | `method` str (`apple` \| `google` \| `email`), `source_screen` str, `has_pending_purchase` bool | — | `has_pending_purchase` isolates the post-paywall signup, the highest-stakes variant. |
| `signup_completed` | Supabase returns a session for a new user | `lib/analytics/authAttempt.ts`, called by `useIdentitySync` immediately after `identify()` | `method` str | `duration_ms` int | Fires **strictly after** `identify()`. `signup_method` is set **on the `identify()` call itself** (not a follow-up `setPersonProperties`, which was landing on the anonymous person). Supabase's `onAuthStateChange` cannot tell a signup from a sign-in — only the screen that started the flow knows, so the intent is recorded at flow start and consumed here. |
| `signup_failed` | Auth call errors or is cancelled | same files | `method` str, `reason` str | — | `reason` ∈ `cancelled` \| `invalid_credentials` \| `email_in_use` \| `weak_password` \| `network` \| `unavailable` \| `unknown`. Never the raw error string. |
| `signin_started` / `signin_completed` / `signin_failed` | Same, in sign-in mode | same files | as above | — | |
| `password_reset_requested` | "Forgot password" submitted | `app/(auth)/email.tsx` | `source_screen` str | — | |
| `password_reset_completed` | New password saved | `app/reset-password.tsx` | — | — | |
| `signed_out` | Sign out tapped | `app/(tabs)/profile.tsx`, `app/building-plan.tsx`, `app/(onboarding)/{index,founder,education}.tsx` | `source_screen` str | — | Fired at the call site, **before** `AuthContext` clears the session and `useIdentitySync` calls `reset()`. |
| `account_deleted` | Delete-account succeeds | `supabase/functions/delete-account` (S) | `environment` str | — | Server only, under distinct ID `account_deletions` with no person profile, so the count survives erasure (§6.4). There is no client mirror — a client event on the person would be deleted with them. |
| `account_deletion_failed` | Delete-account fails | `context/AuthContext.tsx` | `reason` str | — | `reason` is the existing `DeleteAccountError` union: `missing_auth` \| `invalid_auth` \| `rate_limited` \| `delete_failed` \| `request_failed`. |

### 3.5 Monetization — client layer (intent and experience)

Superwall events are bridged through the existing `useSuperwallEvents` hook in
`lib/superwall.tsx`, so we get paywall render and transaction lifecycle without adding
another SDK to the facade.

| Event | Fires when | Trigger location | Required properties | Optional | Notes |
|---|---|---|---|---|---|
| `paywall_viewed` | First match-screen view of this placement+entry in the JS session (non-retake) | `app/(onboarding)/match.tsx` | `placement` str, `entry_point` str (`onboarding` \| `reconvert`), `is_superwall_available` bool | — | Deduped per JS session. Superwall present/dismiss remounts this screen and must not re-fire. `reconvert` = an authed non-premium user routed back here by the root guard. |
| `paywall_presented` | Superwall `onPaywallPresent` | `useSuperwallEvents` in `app/(onboarding)/match.tsx` | `placement` str | `paywall_name` str, `paywall_variant_id` str, `paywall_experiment_id` str | The gap between `paywall_viewed` and this is Superwall failing to render — previously invisible. Also **sets the variant/experiment as person properties** (Phase 4 bridge), so arms are analyzable against retention and not only against immediate conversion. |
| `paywall_dismissed` | Superwall paywall closes | `usePlacement` `onDismiss` | `placement` str, `result_type` str | `paywall_variant_id` str | `result_type` ∈ `purchased` \| `restored` \| `declined` \| `no_paywall`. |
| `purchase_started` | Superwall `transactionStart` | `useSuperwallEvents` | `product_id` str, `placement` str | `paywall_variant_id` str | |
| `purchase_flow_completed` | A transaction is stashed for verification | `app/(onboarding)/match.tsx` `handlePurchased()` / `handleFeatureAccess()` | `product_id` str, `plan_interval` str, `is_authenticated` bool, `transaction_source` str | `paywall_variant_id` str | **Client-side intent only — never used for revenue.** `transaction_source` ∈ `storekit` \| `superwall_event` \| `feature_gate`. Optional `paywall_variant_id` so the variant funnel does not break down a property step 2 does not carry. |
| `purchase_failed` | Superwall `transactionFail` / `transactionAbandon` | `useSuperwallEvents` | `reason` str | `product_id` str | `reason` ∈ `cancelled` \| `declined` \| `pending` \| `unknown`. `transactionAbandon` → `cancelled`; `transactionFail` → `declined`, because the SDK only supplies a free-text error string, which is never sent. |
| `purchase_confirmation_failed` | No transaction could be found or stashed | `app/(onboarding)/match.tsx` `showPurchaseConfirmationError()` | `reason` str, `source` str | — | `reason` ∈ `no_transaction` \| `stash_failed`; `source` ∈ `purchase` \| `feature_gate`. **The user paid and we lost the receipt** — the most expensive failure in the app. |
| `purchase_verification_failed` | `verify-purchase` rejects or errors | `app/building-plan.tsx` | `reason` str, `attempt` int | — | Replaces `purchase_recovery_failed`. `reason` ∈ `transaction_not_found` \| `transaction_expired` \| `transaction_revoked` \| `transaction_already_linked` \| `invalid_receipt` \| `apple_unavailable` \| `rate_limited` \| `invalid_auth` \| `internal_error` \| `network` \| `other`. The edge function returns an open, growing set of strings (several embedding a status code, e.g. `apple_api_error_503`); `lib/analytics/purchaseErrors.ts` collapses them so `reason` stays a bounded breakdown dimension. |
| `restore_started` | Restore tapped | `app/(onboarding)/match.tsx`, `app/(tabs)/profile.tsx` | `source_screen` str (`match` \| `profile`), `is_authenticated` bool | — | |
| `restore_succeeded` | Restore verified | same | `source_screen` str | `product_id` str | Replaces `purchase_restored`. |
| `restore_failed` | Restore found nothing or was refused | same | `source_screen` str, `reason` str | — | `reason` ∈ `no_transaction` \| `transaction_already_linked` \| `network` \| `unknown`. `transaction_already_linked` is the anti-fraud refusal and needs its own visibility. |

### 3.6 Monetization — server layer (truth) — S

Fired from Supabase edge functions via `supabase/functions/_shared/analytics.ts`, with the
user's Supabase UUID as `distinct_id` so they land on the same person as the client events.
Every event carries `environment`, `is_internal`, and `source: 'server'`.

| Event | Fires when | Trigger location | Required properties | Notes |
|---|---|---|---|---|
| `trial_started` | `entitlements.subscription_status` transitions to `trial` | `supabase/functions/verify-purchase/index.ts` | `product_id` str, `plan_interval` str, `original_transaction_id` str, `prior_status` str\|null, `is_trial_conversion` bool, `expires_at` iso | Denominator of trial→paid. **Not a step of F3** — F3 stops at `purchase_flow_completed`. The no-trial SKU never emits this. **Deliberately carries no `revenue`**. |
| `subscription_started` | Status transitions to `active` | `supabase/functions/verify-purchase/index.ts` | `product_id` str, `plan_interval` str, `original_transaction_id` str, `prior_status` str\|null, `is_trial_conversion` bool, `expires_at` iso, `revenue` int, `currency` str, `revenue_source` str | First-charge revenue. Renewals are `subscription_renewed`. |
| `subscription_restored` | A restore writes a new `billing_events` row | `supabase/functions/restore-purchases/index.ts` | `product_id` str, `plan_interval` str, `original_transaction_id` str, `prior_status` str\|null, `granted_access` bool, `expires_at` iso | **Not revenue** — the money was booked by `verify-purchase` on the original device; counting restores would inflate revenue on every reinstall. `granted_access` separates real rescues from no-op taps by someone who already had premium. |
| `subscription_renewed` | ASSN `DID_RENEW` writes a new `billing_events` row | `supabase/functions/apple-assn/index.ts` | `product_id` str, `plan_interval` str, `original_transaction_id` str, `prior_status` str\|null, `expires_at` iso, `notification_type` str, `subtype` str\|null, `revenue` int, `currency` str, `revenue_source` str | Recurring revenue. Idempotency key is `assn_{notificationUUID}`. |
| `subscription_cancelled` | ASSN `DID_CHANGE_RENEWAL_STATUS` / `AUTO_RENEW_DISABLED` | `supabase/functions/apple-assn/index.ts` | `product_id` str, `plan_interval` str, `original_transaction_id` str, `prior_status` str\|null, `expires_at` iso, `notification_type` str, `subtype` str\|null | Intent to churn. Access remains until `expires_at` (`subscription_status = cancelled`, `is_premium` still true). |
| `subscription_refunded` | ASSN `REFUND` or `REVOKE` | `supabase/functions/apple-assn/index.ts` | `product_id` str, `plan_interval` str, `original_transaction_id` str, `prior_status` str\|null, `expires_at` iso, `notification_type` str, `subtype` str\|null | Immediate revoke (`is_premium = false`, status `expired`). `billing_events.event_type` is `refund` (DB enum); PostHog event name is `subscription_refunded`. |
| `dev_trial_granted` | Dev trial issued | `supabase/functions/grant-dev-trial/index.ts` | `expires_at` iso | Its own name rather than `trial_started`, even though it writes that row to `billing_events` — free premium for a teammate would otherwise corrupt trial→paid conversion. Always `is_internal = true`. |
| `promo_code_redeemed` | `redeem_promo_code` RPC returns a fresh `redeemed` | `supabase/functions/promo-codes/index.ts` | `code` str, `promo_type` str (`months_free`\|`lifetime`), `months` int\|null, `creator_slug` str, `expires_at` iso\|null | Backend-granted access via a creator promo code — **not revenue** and not part of the trial funnel. Fires only on a fresh redemption; HTTP retries replay through `already_redeemed` in the RPC and never re-capture. `billing_events.event_type` is `promo_redeemed`. |
| `account_deleted` | Auth user hard-deleted | `supabase/functions/delete-account/index.ts` | `was_premium` bool, `subscription_status` str\|null, `product_id` str\|null, `plan_interval` str | Fired **after** the delete succeeds, so a failed attempt cannot look like churn. Entitlement context is read before the cascade destroys it. Captured under the constant distinct ID `account_deletions` with no person profile, then the real person is erased (§6.4) — so churn stays countable while the human does not. |

**Revenue is in minor units (cents), not dollars** — `revenue: 7999` means $79.99. This is
PostHog's recommendation and avoids float drift when summing. Configure Revenue Analytics to
read `revenue` / `currency` off `subscription_started` and `subscription_renewed`.

`revenue_source` records where the number came from: `apple` when Apple's verified
transaction supplied a price (converted from milliunits), `list_price` when it did not and
the table in `_shared/analytics.ts` was used. A pricing change in App Store Connect that
outdates that table shows up as `list_price` rows with a stale value rather than failing
silently, so **alert on `revenue_source = 'list_price'` becoming common.**

#### 3.6.1 Why two idempotency guards

`verify-purchase` fires only when **both** hold:

1. **The `billing_events` insert succeeded.** `idempotency_key` is `UNIQUE`, so exactly one
   caller can win the insert; a `23505` unique violation means this is a replay. StoreKit
   re-delivers unfinished transactions on every launch, so without this the same purchase
   would be reported as new revenue repeatedly.
2. **`entitlements.subscription_status` actually changed.** This catches a *fresh* request
   (new idempotency key) for a subscription we already knew about.

They catch different duplicates, which is why both are needed. The insert guard is the one
that is safe under concurrency, because the unique constraint resolves the race atomically.

The obvious implementation — an ignore-duplicates upsert with `.select()` to see whether a
row was created — **does not work here and was caught in verification**: migration 017 grants
`service_role` `INSERT` on `billing_events` and nothing else, so the read-back returns 403,
which would have silently suppressed every revenue event. The insert error code is used
instead, needing no new grant.

#### 3.6.1 App Store Server Notifications (`apple-assn`)

Handled by `supabase/functions/apple-assn/index.ts`. Apple POSTs
`{ "signedPayload": "<JWS>" }` with no Supabase JWT; auth is the Apple x5c chain pinned to
Root CA G3 (same trust path as `verify-purchase`).

| Apple `notificationType` | Entitlement write | `billing_events.event_type` | PostHog event |
|---|---|---|---|
| `DID_RENEW` | `active` (or `trial`), refresh `expires_at` | `subscription_renewed` | `subscription_renewed` |
| `DID_CHANGE_RENEWAL_STATUS` + `AUTO_RENEW_DISABLED` | `cancelled`, keep premium until expiry | `subscription_cancelled` | `subscription_cancelled` |
| `DID_CHANGE_RENEWAL_STATUS` + `AUTO_RENEW_ENABLED` | back to `active` | — | — |
| `EXPIRED` | `expired`, `is_premium = false` | — | — |
| `REFUND` / `REVOKE` | `expired`, `is_premium = false` | `refund` | `subscription_refunded` |
| `TEST` / other | ignore, HTTP 200 | — | — |

Lookup key is `entitlements.original_transaction_id`. Idempotency key is
`assn_{notificationUUID}`. Unknown OID (ASSN before first `verify-purchase`, or deleted
account) acks 200 without retrying forever.

**Still configure in App Store Connect:** Production and Sandbox URLs both point at
`https://<project>.supabase.co/functions/v1/apple-assn`.

### 3.7 Program assignment — C

`program_assigned` stays client-side. It is not revenue and not an entitlement, so it does
not meet the bar for the server truth layer, and the client version carries the
user-perceived latency that the server version cannot.

| Event | Fires when | Trigger location | Required properties | Optional |
|---|---|---|---|---|
| `program_assignment_started` | Assignment begins | `app/building-plan.tsx` | `is_retake` bool | — |
| `program_assigned` | `assign-program` returns a plan | `app/building-plan.tsx` | `plan_id` uuid, `duration_weeks` int, `sessions_per_week` int, `equipment_tier` str, `is_retake` bool, `duration_ms` int | `primary_focus` str |
| `program_assignment_failed` | `assign-program` errors | `app/building-plan.tsx` | `reason` str, `is_retake` bool | — |

`program_assignment_failed.reason` ∈ `assign_failed` \| `verify_purchase_failed` \|
`incomplete_answers` \| `timeout` \| `unexpected_error`. This replaces the old
`program_assign_failed`, whose `reason` was a raw error string — §0.6 found it was the most
frequent event in the project and unbreakdownable because of it.

Closing that set surfaced a latent bug: `program_assigned` could fire with `undefined`
properties when an assignment failed but was "recovered" (another process had already created
the plan). The event is now guarded on the parse actually succeeding.

### 3.8 Core loop — session player — C

All from `app/session/[id].tsx` unless noted. Phase keys mirror the existing `Phase` type:
`preview` \| `checkin_before` \| `exercise` \| `rest` \| `checkin_after` \| `complete`.

| Event | Fires when | Required properties | Optional | Notes |
|---|---|---|---|---|
| `session_start_tapped` | "Start Session" on home | `source_screen` str, `week_number` int, `session_number` int | — | `app/(tabs)/index.tsx`. Separates intent from `session_started`, which only happens after preview + pain check-in. |
| `session_previewed` | Preview phase renders | `plan_session_id` uuid, `week_number` int, `session_number` int, `exercise_count` int, `estimated_minutes` int, `phase` str | — | `phase` ∈ §3.8.1 `exercise_phase`. No `intensity_tier`: it is a per-exercise property and the session has no single value for it, so it moved to `exercise_started`. |
| `session_started` | "Begin Session" (after before-check-in) | `plan_session_id` uuid, `week_number` int, `session_number` int, `exercise_count` int, `pain_before` int, `is_first_session` bool | — | Existing event, re-specified. `is_first_session` powers activation. |
| `pain_checkin_submitted` | Either pain slider is submitted | `checkin_type` str (`before` \| `after`), `score` int (1–10), `plan_session_id` uuid, `week_number` int | — | Explicitly required by PRD §14. See privacy note in §6.2 — this is the one health-adjacent field, and it is what PRD §10's "avg pain improvement > 1.5 points" is measured from. |
| `exercise_started` | First set of an exercise begins (once per exercise, not per set) | `exercise_id` uuid, `exercise_index` int, `exercise_count` int, `plan_session_id` uuid, `movement_pattern` str, `phase` str, `intensity_tier` int | `sets` int, `reps` int, `duration_seconds` int | `exercise_id` is a sanctioned breakdown dimension (~30-row catalog). `load_tier` is not sent — it exists on `user_plan_session_exercises` but the player never reads it, so it is not in scope at the call site. |
| `exercise_set_completed` | "Set N Done" | `exercise_id` uuid, `set_index` int, `set_count` int, `time_on_set_ms` int | — | |
| `exercise_completed` | Last set done | `exercise_id` uuid, `exercise_index` int, `duration_ms` int, `sets_completed` int | — | |
| `exercise_skipped` | "Skip exercise" | `exercise_id` uuid, `exercise_name` str, `exercise_index` int, `set_index` int, `time_on_exercise_ms` int | — | Which exercises get skipped is direct content feedback. Break down by `exercise_name` (catalog display name, ~30 rows), not the UUID. |
| `rest_skipped` | "Skip Rest" | `rest_kind` str (`set` \| `exercise`), `remaining_seconds` int | — | |
| `session_completed` | `complete_session` RPC succeeds | `plan_session_id` uuid, `week_number` int, `session_number` int, `duration_seconds` int, `exercise_count` int, `skipped_exercise_count` int, `pain_before` int, `pain_after` int, `pain_delta` int, `ended_week` bool, `program_done` bool, `is_first_session` bool | — | Existing event, re-specified. North-star numerator. |
| `session_abandoned` | Exit confirmed, or app backgrounded mid-session | `plan_session_id` uuid, `phase_key` str, `exercise_index` int, `elapsed_ms` int, `exit_type` str | `week_number` int | `exit_type` ∈ `user_exit` \| `backgrounded`. **At most once per session** — a user who backgrounds and then confirms Exit is one abandonment. Not fired from the `preview` or `complete` phases: nothing was started in the first, everything was finished in the second. Only `background` counts, not iOS `inactive` (app switcher / notification shade is a glance). |
| `session_load_failed` | Load error or empty exercise list | `reason` str | `plan_session_id` uuid | `reason` ∈ `not_found` \| `no_exercises` \| `network` \| `unknown`. |
| `session_completion_failed` | `complete_session` RPC errors or returns no row | `reason` str, `plan_session_id` uuid | — | `reason` ∈ `not_current_session` \| `network` \| `rpc_error`. `not_current_session` is the pointer guard refusing a replay; the other two mean the workout was done and the write genuinely failed. The Postgres message is inspected only to bucket it and is never sent. |
| `exercise_video_failed` | Video URL fetch or playback fails | `exercise_id` uuid, `reason` str | — | `reason` ∈ `url_fetch_failed` \| `playback_error`. **Verified in Phase 2:** both paths are distinguishable — the `get-video-url` invoke error/`catch`, and the `player.replaceAsync` rejection. **The signed video URL is never sent.** |

#### 3.8.1 Closed value sets

Measured from the live catalog, not assumed. A new value trips dev-mode validation,
which is the reminder to update `lib/analytics/events/enums.ts` and this table together.

| Property | Values |
|---|---|
| `phase` (`exercise_phase`) | `mobility` \| `activation` \| `strength` \| `recovery` |
| `movement_pattern` | `core_activation` \| `glute_activation` \| `hip_hinge` \| `hip_mobility` \| `lower_body_strength` \| `lumbar_extension` \| `lumbar_mobility` \| `mobility_general` \| `posterior_chain_strength` \| `spinal_stability` \| `stretch_recovery` \| `thoracic_mobility` |
| `intensity_tier` | `1`–`4` |

### 3.9 Weekly ramp and program completion — C

| Event | Fires when | Trigger location | Required properties |
|---|---|---|---|
| `weekly_ramp_suggested` | Ramp screen shows a suggestion | `app/weekly-ramp.tsx` | `week_number` int, `suggestion` str (`progress` \| `hold`), `pain_delta` float \| **null** |
| `weekly_ramp_decided` | User chooses | `app/weekly-ramp.tsx` | `week_number` int, `suggestion` str, `decision` str, `followed_suggestion` bool, `pain_delta` float \| **null** |
| `program_completed` | Program-complete screen loads its stats | `app/program-complete.tsx` | `sessions_completed_count` int, `days_active_count` int |
| `program_restarted` | "Restart Program" | `app/program-complete.tsx` | `source_screen` str |

`pain_delta` is nullable: a week with too few paired check-ins has no computable delta,
which is a real state and distinct from "no change". It is a float — the screen rounds to
one decimal place, not to an integer.

`program_completed` carries **no `duration_weeks`**. The completion screen never loads the
program length, and defaulting it would put a number in the taxonomy that isn't measured.
`days_active_count` is sent instead, which the screen does compute.

`weekly_ramp_confirmed` is renamed to `weekly_ramp_decided` (past-tense, and "confirmed"
wrongly implies the user agreed with the suggestion — `followed_suggestion` carries that).

### 3.10 Engagement, settings, notifications — C

| Event | Fires when | Trigger location | Required properties | Notes |
|---|---|---|---|---|
| `progress_range_changed` | Chart range toggle | `app/(tabs)/progress.tsx` | `chart` str (`pain` \| `activity`), `range_days` int | Pills are labelled 14D/1M/3M (pain) and 1M/3M/6M (activity); sent as days (`14` \| `30` \| `90` \| `180`) so the two charts are comparable. |
| `progress_week_navigated` | *(not currently fired)* | — | `direction` str (`previous` \| `next`), `week_offset` int | Wrapper kept for taxonomy continuity. Week arrows were removed when This Week moved to Home (current week only). |
| `home_nudge_shown` / `home_nudge_tapped` | Notification nudge badge on Home This Week | `app/(tabs)/index.tsx` | `nudge_key` str (`notification_setup`) | Badge opens the Workout Days sheet (same as Edit days). Visible while workout reminders are off; hides when they are on, returns if they are turned off. `shown` fires once per `nudge_key` per JS session — a Home remount must not re-fire. |
| `home_empty_state_shown` | Home has no session to offer | `app/(tabs)/index.tsx` | `reason` str | Dead end. `reason` ∈ `program_complete` \| `no_active_plan` \| `rest_day` \| `session_done_today` \| `no_session_available`. `rest_day` and `session_done_today` are by design. Fired on change of reason, not on every focus. |
| `orientation_completed` | Last slide of the pre-session mindset orientation | `app/orientation.tsx` | `slide_count` int | Fires once per completion (storage is per user). `$screen` covers the visit. |
| `notification_permission_requested` | OS prompt is actually shown | `lib/notifications.ts` | `purpose` str (`daily_reminder` \| `stretch_break` \| `workout_reminder`) | Instrumented inside `requestPermissions` because only it can tell a real prompt from an already-granted permission. `purpose` records which toggle spent the one prompt iOS allows. Workout-day reminders use `workout_reminder`. |
| `notification_permission_granted` / `notification_permission_denied` | Prompt resolves | `lib/notifications.ts` | `purpose` str | Denial correlates strongly with churn. |
| `daily_reminder_enabled` | Reminders turned on and permission granted | `components/progress/WorkoutDaysModal.tsx` `save()` | `hour` int, `minute` int, `purpose` str | Time-of-day is a schedule preference, not PII. Fires only on the off→on transition, after `requestPermissions` returns a token. `purpose` is `workout_reminder` (the permission `purpose` that spent the prompt). `notification_permission_*` fire only when iOS actually shows the prompt — already-granted is silent. |
| `daily_reminder_disabled` | Reminders turned off | `app/(tabs)/profile.tsx` toggle, or `WorkoutDaysModal.save()` when they uncheck | — | |
| `stretch_reminders_enabled` | Toggle on | `app/(tabs)/profile.tsx` | `interval_minutes` int, `start_hour` int, `end_hour` int | |
| `stretch_reminders_disabled` | Toggle off | `app/(tabs)/profile.tsx` | — | |
| `display_name_updated` | Name saved | `app/(tabs)/profile.tsx` | `has_name` bool | **The name itself is never sent.** |
| `answers_viewed` | Saved answers screen focused | `app/onboarding-answers.tsx` | `source_screen` str | |
| `legal_document_viewed` | Terms/privacy opened | `app/(auth)/sign-in.tsx`, `app/(onboarding)/match.tsx` | `document` str (`terms` \| `privacy`), `source_screen` str | App Store compliance evidence. Fired at the four opener call sites, not in the legal screens, so the origin is known. |
| `progress_reset` | Dev tool used, after all three writes succeed | `app/(tabs)/profile.tsx` | — | Always `is_internal = true`. |
| `review_prompt_requested` | Immediately before `requestReview()` | `lib/app-store-review.ts` | `source_screen` str (`session` \| `weekly_ramp`), `plan_session_id` uuid?, `week_number` int? | **"We asked iOS", not "the user saw a sheet".** Apple gives no callback and silently discards requests past its cap, so this is an upper bound on impressions, never a count of them. `plan_session_id` is absent on the weekly ramp, which is keyed to a week. |
| `review_prompt_skipped` | Every early return out of the prompt | `lib/app-store-review.ts` | `source_screen` str, `reason` str | The whole observability story — see §3.10.1. |
| `review_manual_tapped` | "Rate Remedy" row or post-feedback "Leave a review" tapped | `lib/app-store-review.ts` (`openWriteReviewPage`) | `source_screen` str (`profile` \| `feedback`) | Deep-links to the App Store write-review page. Apple prohibits driving `requestReview()` from a button, so this is a genuinely different action from the two above. |
| `feedback_submitted` | In-app feedback sent successfully | `app/feedback.tsx` | `category` str (`bug` \| `idea` \| `question` \| `other`), `feedback_length` int, `rating` int? (1–5) | **The body is never sent.** Length is the trimmed character count. Rating is omitted when the user skips the optional scale. |
| `feedback_submit_failed` | Submit rejected or network failed | `app/feedback.tsx` | `reason` str (`rate_limited` \| `duplicate` \| `invalid_body` \| `request_failed`) | Caps doing their job vs our outage. Never includes the body. |
| `review_ask_shown` | 4–5 rating success screen with App Store CTA | `app/feedback.tsx` | `source_screen` str (`feedback`), `rating` int (`4` \| `5`) | Funnel step before `review_manual_tapped`. Not the native `requestReview()` sheet. |

#### 3.10.1 Reading the review-prompt funnel

There is **no callback** telling us whether the native sheet appeared or whether anyone rated.
The `review_prompt_skipped.reason` breakdown is therefore the only way to tell a working
rollout from a broken one, because a popup that fails to appear is something no user will ever
report.

| `reason` | Meaning | Expected volume |
|---|---|---|
| `pain_not_improved` | Pain was equal or worse. The product rule working as intended. | High — the bulk of skips |
| `dev` | `__DEV__` build without the build gate forced on | Internal only |
| `build_gate_off` | `extra.enableAppStoreReviewPrompt` is not `true` in this binary | **Zero in production.** Non-zero means a build shipped misconfigured |
| `not_ios` | Android. Play In-App Review is a different API and is out of scope | Zero while iOS-only |
| `flag_off` | `app_store_review_prompt` is disabled, or PostHog was unreachable and the reader failed closed | 100% until the flag is switched on |
| `threshold` | Fewer than 1 lifetime session recorded, or AsyncStorage was unreadable | Rare |
| `already_requested_for_trigger` | Idempotency guard: same session/week already asked | Low; a spike means a screen is remounting |
| `cooldown` | App-side cooldown. Currently unreachable — `MIN_HOURS_SINCE_LAST_REQUEST` is 0 by design | Zero |
| `native_module_missing` | The binary predates `expo-store-review` | **Zero after a fresh build.** Non-zero means JS shipped ahead of a native build |
| `unavailable` | `isAvailableAsync()` false — notably **every TestFlight build** | High in TestFlight, ~zero in App Store builds |

`tab_switched` was specified in Phase 0 and **deliberately dropped in Phase 2**: `$screen`
already carries `previous_screen` (§3.2), so it would be a second, less reliable copy of the
same transition. See §5.

---

## 4. Person properties

| Property | Type | Set by | When | Which cohort/filter needs it |
|---|---|---|---|---|
| `signup_method` | str | C | On `identify()` at signup, from the pending auth attempt | F5 person-property slice; auth-method retention. Event `method` on `signup_completed` is the event-level copy. |
| `acquisition_source` | str | C | On `q0` answer — **pre-auth**, merged on identify | Channel attribution for every funnel. Closed set in §3.3.1. This is the property that proves the merge works. |
| `is_premium` | bool | S (authoritative), C (refresh) | Every entitlement transition | Gates every monetization comparison. |
| `subscription_status` | str | S | Every entitlement transition | Trial vs active vs expired cohorts. |
| `plan_interval` | str | S | On purchase | Monthly vs annual retention and LTV (PRD §9 goal: push annual). |
| `product_id` | str | S | On purchase and restore | Which SKU the person is actually on. |
| `subscription_expires_at` | iso | S | On purchase and restore | Expiry-window and lapse analysis. Replaces the planned `trial_ends_at`, which was redundant with it. |
| `first_purchase_at` | iso | S | Once, on first purchase | Set-once. Time-to-purchase without needing the full event history. |
| `first_product_id` | str | S | Once, on first purchase | Set-once. What they *first* bought, preserved across later plan changes. |
| ~~`account_deleted`~~ | — | — | — | **Removed.** Pointless once erasure landed: the person it would mark no longer exists (§6.4). |
| `is_internal` | bool | S + C | On identify and on entitlement change | **Excludes dev/sandbox traffic from every production number.** Derived from `profiles.is_dev` OR `entitlements.is_sandbox`. |
| `environment` | str | S | Every server event (event property, not person) | `sandbox` \| `production`. |
| `pain_location` | str | C | On `onboarding_completed` | Clinical-segment slicing. See §6.2. |
| `pain_duration` | str | C | On `onboarding_completed` | Acute vs chronic behave completely differently. |
| `activity_level` | str | C | On `onboarding_completed` | Core persona dimension (PRD §3). |
| `equipment_tier` | str | C | On `onboarding_completed` and retake | Content-availability segment. |
| `primary_goal` | str | C | On `onboarding_completed` | Program naming and motivation segment. |
| `sessions_per_week_preference` | int | C | On `onboarding_completed` | Denominator for the adherence ratio in §1.4. |
| `program_week` | int | C | On `session_completed` | "How deep into the program" cohorting. |
| `first_session_completed_at` | iso | C | Once, on first `session_completed` | Activation timestamp; set-once semantics. |
| `paywall_variant_id` | str | C | On `paywall_presented` | **Superwall experiment arm** — bridged so variants can be analyzed against retention, not just immediate conversion (Phase 4). |
| `paywall_experiment_id` | str | C | On `paywall_presented` | same |

SDK-provided properties we rely on and do not duplicate: `$os`, `$os_version`,
`$app_version`, `$app_build`, `$device_type`, `$locale`, `$timezone`.

---

## 5. Server-side truth layer — idempotency

Webhooks and client retries replay. Every server event fires on **state transition**, not on
message receipt:

1. Read current `entitlements` row for the user.
2. Compute the new state from the verified Apple transaction.
3. If the state is unchanged, **do nothing** — no event.
4. If changed, write `entitlements` and insert `billing_events` with the existing
   `idempotency_key` unique constraint in the same operation.
5. Capture the PostHog event **only if the `billing_events` insert actually inserted a row.**
   A unique-violation means this is a replay, and no event is sent.

This reuses infrastructure that already exists (`billing_events.idempotency_key` UNIQUE,
migration 001; `entitlements.original_transaction_id` partial UNIQUE, migration 023) rather
than adding a parallel dedupe mechanism.

`distinct_id` on every server event is the Supabase Auth UUID — byte-identical to what the
client passes to `identify()`. This is verified explicitly in the Phase 5 checklist, not
assumed.

---

## 6. Privacy and compliance

### 6.1 Deliberately NOT tracked

| Not tracked | Why |
|---|---|
| Email address, display name, Apple/Google profile name | PII. `profiles.email` and `display_name` exist and are deliberately never read by the analytics layer. `display_name_updated` sends `has_name` only. |
| Push token (`profiles.push_token`) | A device credential. |
| Free-text feedback | User-authored text from `app/feedback.tsx`. Stored in `public.feedback` and emailed via Resend. Analytics gets `category`, optional `rating` (1–5), and `feedback_length` — never the body. |
| Signed Cloudflare Stream URLs | They are time-limited credentials. |
| Supabase JWTs, anon key, any `Deno.env` secret | Obvious. |
| Interpolated route paths (`/session/8f3a-…`) as screen names | One screen per entity makes every screen report useless. |
| Auth-callback query strings (`token_hash`, `type`) | Contains a live auth token. |
| Raw error messages / stack traces as `reason` | Unbounded cardinality and can embed user data. All `reason` values come from closed sets. |
| Precise location | Never collected. PostHog infers coarse country from request IP — noted in §6.3. |
| Autocapture touches, scroll, keystrokes | High-cardinality noise with no semantic value. |
| `exercise_name` as a person property | Belongs on events, not on the person. |
| Apple `original_transaction_id` on the **client** | Server-only, for store reconciliation. |
| `tab_switched` | Dropped in Phase 2. `$screen` already carries `previous_screen`, so this would be a second, less reliable copy of the same transition. The only signal it adds is re-tapping the already-active tab, which is not worth an event. |
| Raw Superwall `transactionFail` error string | Free text from StoreKit. Mapped to `purchase_failed.reason = declined`; the string is never sent. |
| Raw Supabase auth error messages | Can echo back a user-supplied email. Inspected only to classify, then discarded — see `lib/analytics/authAttempt.ts`. |
| `session_abandoned` from the `preview` and `complete` phases | Nothing was started in the first and everything was finished in the second; firing there would make the abandonment rate meaningless. |

### 6.2 The one genuinely sensitive field: pain scores

`pain_checkin_submitted.score` and the derived `pain_delta`, plus the person properties
`pain_location`, `pain_duration`, and the `pain_type_count` / `pain_trigger_count` counts,
are self-reported wellness inputs. They are coarse (1–10 integer, three-value enums),
non-diagnostic, and attached to an opaque UUID.

They are also **unavoidable**: PRD §10 sets "average pain score improvement > 1.5 points over
4 weeks" as a V1 success metric, and PRD §14 explicitly lists pain check-in as an event to
wire. There is no version of this measurement system that omits them and still answers the
question the PRD asks.

Consequence for the App Store privacy label: **Health & Fitness → Linked to You → App
Functionality + Analytics.** This has been accepted as a deliberate product decision — pain
scores are tracked, because the PRD's headline outcome metric is measured from them.

A code comment goes at each pain-related call site explaining that the *score* is sent and
free text is not, so a future contributor doesn't "helpfully" add a notes field.

### 6.3 App Store privacy disclosures implied by this design

| Data type | Collected | Linked to identity | Used for tracking |
|---|---|---|---|
| Identifiers — user ID (Supabase UUID) | Yes | Yes | **No** |
| Usage data — product interaction | Yes | Yes | **No** |
| Purchases — subscription status, product, revenue | Yes | Yes | **No** |
| Health & Fitness — pain score, pain profile | Yes (pending #4) | Yes | **No** |
| Diagnostics — failure reasons, crash-adjacent events | Yes | Yes | **No** |
| Contact Info — Email Address | Yes | Yes | **No** |
| Location, contacts, browsing history, search history | **No** | — | — |
| User content — in-app feedback text | Yes | Yes | **No** |

**No ATT prompt is required.** "Tracking" under Apple's definition means linking data to
third-party data for advertising or sharing with a data broker. Nothing here does that: no
IDFA, no `expo-tracking-transparency` in the dependency list, no advertising SDK, no
cross-app identifier. PostHog is a first-party analytics processor.

**Session replay is OFF** and is not being enabled. If it is ever turned on, it changes the
privacy label (screen content is user content), adds an App Store disclosure obligation, and
adds bandwidth cost on cellular during video playback. It gets its own decision, separately.

### 6.4 Deletion and retention

`context/AuthContext.tsx` → `deleteAccount()` → `supabase/functions/delete-account` hard-deletes
the auth user and cascades every row.

Deletion propagates to PostHog. After the auth user is destroyed, the function does two
things, in this order:

1. **Captures `account_deleted` under a constant, non-identifying distinct ID**
   (`account_deletions`) with `$process_person_profile: false`. Churn has to remain
   countable after the person is gone, and a person-less event is the only way to keep the
   number without keeping the human. Entitlement context (`was_premium`,
   `subscription_status`, `product_id`, `plan_interval`) is read *before* the cascade
   destroys it and travels on the event itself.
2. **Erases the person and their events** via `POST /api/projects/:id/persons/bulk_delete/`.
   The distinct ID is looked up to its person UUID first — the endpoint takes `ids`, and
   passing distinct IDs instead returns a 500. `delete_events: true` must go in the **body**;
   as a query parameter it is silently ignored and the response comes back
   `events_queued_for_deletion: false` while still reporting success. Event deletion is
   asynchronous, so events remain queryable for a short window after the person is gone.

Erasure uses `POSTHOG_PERSON_DELETE_KEY`, a personal API key scoped to person read/write and
kept separate from the capture token: capture posts a public project token to the ingestion
host, erasure posts a privileged key to the private API host. If the key or
`POSTHOG_PROJECT_ID` is absent, `erasePostHogPerson` returns `erasure_not_configured` and the
function logs it — deletion of the Supabase account still succeeds, and analytics never
blocks the user's request.

**Known limitation:** a failed erasure is logged, not retried. If PostHog is down at the
moment of deletion the person survives and needs manual removal. A retry queue is worth
building if this ever fires in production.

Data retention follows the PostHog project's configured retention. No separate copy of event
data is stored by this app.

### 6.5 Opt-out

**No user-facing analytics opt-out toggle ships in V1.** Deliberate decision: no consent
regime applies to a first-party analytics processor on a US iOS launch with no advertising
identifier and no cross-app tracking, and surfacing a toggle would both confuse users and
degrade the data the product is steered by.

The facade still routes every call through a single gate rather than scattered `if`
statements, so if a consent requirement ever appears (EU launch, an App Store policy change,
an enterprise ask) it is one function to implement and not a codebase-wide retrofit. The
`ANALYTICS_ENABLED` env kill switch remains the operator-facing off switch.

---

## 7. Architecture decisions — implemented in Phase 1

| Decision | Choice | Reasoning |
|---|---|---|
| Surveys | **Off** (`disableSurveys: true`) | No `PostHogSurveyProvider` is mounted, so loading them would only add a startup request for data nothing renders. |
| Feature-flag preload | **On** (`preloadFeatureFlags: true`) | Was off through Phase 4, when no flag existed. Adopted for the `app_store_review_prompt` kill switch, which has to be answerable the moment a session ends and cannot afford a network round-trip there. The fetch is backgrounded at init, not blocking. Paywall variants are still bridged from Superwall as person properties rather than evaluated by PostHog. |
| Flag reads | `isFeatureEnabled()` in the facade, **fails closed** | The single flag reader in the app. Returns `false` on any uncertainty — analytics disabled, SDK unbound, flag unfetched, or a multivariate value. A kill switch that fails open is not a kill switch. Do not evaluate flags from the SDK directly. |
| Autocapture — touches | **Off** | Produces `$autocapture` events keyed on view hierarchy. High cardinality, no semantic meaning, breaks on any UI refactor. Already off by default. |
| Autocapture — screens | **Off** | Replaced by our own `screen()` call with normalized route patterns and user-context enrichment. The SDK's version cannot normalize `/session/[id]` and cannot attach `is_premium`. **This is a change from today's silent default of `true`.** |
| Autocapture — app lifecycle | **On** | `Application Installed` / `Opened` is the only reliable install and return signal, it is low-volume, and PRD-mandated D7/D30 retention is measured on it. Hand-rolling it would be worse. |
| Session replay | **Off** | Privacy label impact, App Store disclosure, and bandwidth cost during video playback. Deliberate later decision, not a default. |
| Debug mode | Development builds only, gated on `__DEV__` | |
| Flush behaviour | Dev: flush immediately (`flushAt: 1`). Production: `flushAt: 20`, `flushInterval: 30s`, bounded queue | Mobile users on cellular mid-workout; batching matters. Dev needs events in PostHog in seconds, not on a batch timer. |
| Host | `EXPO_PUBLIC_POSTHOG_HOST`, defaulting to `https://us.i.posthog.com` | US region, matching the existing project. No reverse proxy for V1 — iOS apps are not subject to browser ad-blockers, so the SDK-host-blocking resilience argument doesn't apply. Revisit if ingest loss shows up. |
| Number of SDK clients | **Exactly one**, owned by the facade and bound via `setClient()` | Fixes the two-client identity split described in §0.5. |
| Lazy loading | The PostHog module is dynamically imported only when `ANALYTICS_ENABLED` is true | With env vars unset the dependency is never initialized and every facade method is a no-op. |

### 7.1 Module layout

| File | Responsibility |
|---|---|
| `lib/analytics/config.ts` | Reads env, computes `ANALYTICS_ENABLED`, holds flush tuning. No logic. |
| `lib/analytics/facade.ts` | **The only module permitted to touch the PostHog SDK.** Owns the client, the pre-init queue, and the whole public surface. |
| `lib/analytics/routes.ts` | Route-pattern normalization and the `KNOWN_SCREENS` allow-list. Pure functions, no SDK. |
| `lib/analytics/AnalyticsProvider.tsx` | `AnalyticsProvider` (boots the client) and `AnalyticsBridge` (identity sync + product-usage + onboarding step tracking). |
| `lib/analytics/productUsage.ts` | Screen dwell and app-session duration, driven off the router + AppState. |
| `lib/analytics/index.ts` | Public surface: facade re-exports, the provider, and route helpers. No untyped `trackEvent` — it was deleted at the end of Phase 2 once every call site was converted. |
| `lib/analytics/events/defineEvent.ts` | `defineEvent` / `defineEventWithoutProperties`: the name registry and dev-mode payload validation. |
| `lib/analytics/events/enums.ts` | Every closed value set. Domain enums are derived from `lib/schemas.ts` so they cannot drift from what the app persists. |
| `lib/analytics/events/{onboarding,auth,monetization,program,coreLoop,engagement}.ts` | Typed per-domain wrappers. **The only thing product code calls.** |
| `lib/analytics/onboardingSteps.ts` | Funnel step dwell timing and exit classification, driven off the router. |
| `lib/analytics/authAttempt.ts` | Auth attempt lifecycle, so completion events fire strictly after `identify()`. |
| `lib/analytics/purchaseErrors.ts` | Collapses open-ended StoreKit / edge-function error strings onto the closed reason sets. |

The SDK reference lives in exactly one place: the `await import('posthog-react-native')` inside
`initAnalytics()`. The type import at the top of `facade.ts` is `import type`, erased at compile
time, so it adds no runtime dependency.

### 7.2 Facade surface

```
initAnalytics()                                  → Promise<void>  loads + binds the SDK
setClient(client | null)                         → void           binding hook, replays the queue
capture(event, properties?)                      → void
screen(name, properties?)                        → void
identify(distinctId, personProperties?)          → void
reset()                                          → void
setPersonProperties(properties, setOnce?)        → void
flush()                                          → void
ANALYTICS_ENABLED                                → boolean
```

Every method returns `void`. Nothing here is awaitable, by design — an analytics call must never
be something a user-facing code path can block on. Failures are swallowed; in development they
log a warning naming the call that threw.

**Pre-init queue.** Calls made before the client binds are buffered in order and replayed on
`setClient()`. The buffer is capped at 100 calls and drops oldest-first, so a failed init can
never turn it into a memory leak. This exists because the first screen event and the first
onboarding step both fire before an async SDK import can finish.

**Property sanitization.** `undefined` values are dropped rather than coerced to `null`:
"never set" and "set to empty" are different answers in a breakdown, and collapsing them makes
optional properties unqueryable. Nested objects are rejected by the type system.

### 7.3 Identity flow

Owned entirely by `useIdentitySync()`. `AuthContext` no longer calls analytics — it previously
called `identifyUser` from its own `onAuthStateChange` handler, which is half of the two-client
split described in §0.5.

| Transition | Behaviour | Why |
|---|---|---|
| anonymous → signed in | `identify(user.id)` only, **no reset** | Merges the entire pre-auth funnel — onboarding, paywall, purchase — into the identified person. Calling `reset()` here is the single most common way to silently destroy top-of-funnel attribution. |
| user A → user B | `reset()`, then `identify(B)` | Stops one account's session bleeding into another on a shared device. |
| signed in → signed out | `reset()` | |

A `lastIdentified` ref means `identify()` fires on actual change only, never on re-render or
token refresh.

### 7.4 Phase 1 verification results

Run on 2026-08-08 against this repo.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Passes. Only the pre-existing `@expo/vector-icons` and `scripts/audit.ts` errors documented in `AGENTS.md` remain. |
| App bundles with analytics **enabled** | Pass — expo-router entry bundle builds, 11.97 MB. |
| App bundles with analytics **disabled** (`EXPO_NO_DOTENV=1`, both vars unset) | Pass — builds cleanly, and no `phc_` publishable key appears anywhere in the bundle, so `ANALYTICS_ENABLED` is false and the SDK is never constructed. |
| Exactly one module references the SDK | Pass — `lib/analytics/facade.ts`. |
| Old duplicate client gone | Pass — `lib/analytics.ts` deleted; no `identifyUser` / `resetAnalytics` in the bundle. |
| No server-only secrets in the client bundle | Pass — neither `POSTHOG_PERSONAL_API_KEY` nor `SUPABASE_ACCESS_TOKEN`, by name or value, appears in the bundle. |

Runtime checks that need a device — anonymous → authenticated merge confirmed in the PostHog UI,
queue replay under a real cold start, logout/login as a different user — are Phase 5 (§9).

### 7.5 Phase 2 verification results

Run on 2026-08-09 against this repo.

| Check | Result |
|---|---|
| `npx tsc --noEmit` | Passes. Only the pre-existing `@expo/vector-icons` and `scripts/audit.ts` errors remain. |
| expo-router entry bundle builds | Pass — 12.08 MB, HTTP 200. |
| All 51 typed event names present in the bundle | Pass — none missing. |
| Untyped `trackEvent` shim removed | Pass — gone from the source and absent from the bundle. |
| No raw `capture('…')` at any product call site | Pass — the only `capture` callers are `defineEvent` and the facade itself. |
| No event wrapper without a call site | Pass — every exported wrapper is referenced outside its own module; every enum is referenced. |
| No server-only secret in the client bundle | Pass — `POSTHOG_PERSONAL_API_KEY` and `SUPABASE_ACCESS_TOKEN` absent by name *and* by value. Only the client-safe publishable key is inlined. `phx_` matches in the bundle are Phoenix Channels constants from Supabase Realtime, not a PostHog key. |

Everything in §7.5 is static verification. **No client event has been confirmed to arrive in
PostHog yet** — that requires a device and is Phase 5 (§9). Do not build dashboards on the
client events until that is done. The server events in §3.6 *have* been confirmed live; see
§7.6.

### 7.6 Phase 3 verification results

Run on 2026-08-09 against the linked project (`vgqmvekjttywwadpftre`) and PostHog project
`470505`. Reproduce with `node scripts/verify_server_analytics.mjs`.

Unlike §7.5 this is a **live end-to-end test, not a static check**. It creates a throwaway
dev user, calls the deployed `grant-dev-trial` and `delete-account` functions with that
user's real JWT, then queries PostHog to confirm what landed. The test deletes its own user
(`delete-account` is one of the things under test); leftover users and orphaned
`billing_events` rows were both confirmed to be zero afterwards.

| Check | Result |
|---|---|
| `POST /i/v0/e/` accepts the helper's exact payload shape | Pass — HTTP 200. |
| Event queryable in PostHog with revenue intact | Pass — `revenue=7999`, `currency=USD`, `source=server`. |
| A deployed edge function reaches PostHog | Pass — proves `POSTHOG_PROJECT_KEY` is readable inside the isolate, which no static check can show. |
| `dev_trial_granted` captured | Pass. |
| **Fires exactly once despite a replayed call** | Pass — count = 1 after two identical invocations. |
| Server events marked `source = server` | Pass. |
| Internal traffic marked `is_internal` | Pass. |
| Server-set person properties applied | Pass — `is_premium=true`, `subscription_status=dev_trial`, `is_internal=true`. Asserted **before** deletion; erasure destroys them, so that is the only moment they are observable. |
| Test user exists as a PostHog person before deletion | Pass — makes the erasure check below meaningful rather than vacuous. |
| **PostHog person erased by `delete-account`** | Pass — lookup by distinct ID returns empty after the call. |
| `account_deleted` **not** attributed to the erased user | Pass — no such event on the user's own distinct ID. |
| `account_deleted` captured anonymously | Pass — on `account_deletions`, carrying `was_premium=true`, `subscription_status=dev_trial`. |

18/18 checks passed.

**Bugs this caught that static checking could not:**

1. The idempotency read-back returned **403**, because `service_role` has `INSERT` but not
   `SELECT` on `billing_events` (migration 017). Every revenue event would have been
   silently suppressed. Fixed by using the unique-violation error code as the signal
   instead (§3.6.1).
2. PostHog ingestion on this project takes **longer than 60 seconds**, so the first run
   reported a false negative on an event that had in fact arrived. Any future verification
   must poll for minutes, not seconds.
3. `bulk_delete` with `delete_events=true` as a **query parameter** returned HTTP 200 while
   quietly leaving `events_queued_for_deletion: false` — the person would have been deleted
   and their event history retained, which is the failure mode compliance actually cares
   about. It has to go in the body, and the response field is now asserted rather than
   trusted.

**Operational hazard this exposed:** a verification run that fails *after* creating its
throwaway user but *before* flagging `is_dev` leaves a PostHog person with `is_internal`
unset — a deleted Supabase account that nonetheless looks like a real user and is not
excluded by the internal cohort. Three such persons from earlier failed runs were found and
erased. Anyone re-running the script after a failure should check for stragglers by looking
up the test user's UUID under `/api/projects/470505/persons/?distinct_id=…` and erasing via
`bulk_delete` with `delete_events: true` in the body.

**Still not verified:** the paid paths. `verify-purchase` and `restore-purchases` cannot be
exercised without a real Apple transaction, so `trial_started`, `subscription_started`, and
`subscription_restored` are deployed and type-correct but have never fired. They share the
helper and the guard pattern with the two paths that were proven, but the revenue values,
`is_trial_conversion`, and the `trial → active` transition specifically remain untested until
a sandbox purchase on a device (Phase 5, §9).

---

## 7.7 Phase 4 — the analysis layer

Every question §1 promises to answer is now built in PostHog, and built **as code**:
`scripts/posthog_analysis_layer.mjs`. Run it with `--apply`; it PATCHes to a fixed desired
state, so a second run updates in place rather than creating duplicates.

A dashboard assembled by clicking around drifts from this document the first time someone
edits a filter, and nobody notices because the chart still renders. Keeping the definitions
in a reviewed file means a change to the analysis layer shows up in a diff.

### 7.7.1 What exists

| Dashboard | id | What it is (and is not) | Tiles, most important first |
|---|---|---|---|
| 1. Onboarding | 1981018 | How people start. Not whether they come back, not money. | F1 (starts at `onboarding_started`, ends at `program_assigned`), F2 drop-off (includes question copy), exits by step, time on step, F5 signup, acquisition mix |
| 2. Users & Retention | 1981017 | Headcount and return rates. Paid-user *counts* live here; dollars do not. | North-star ratio, WAC, activation rate, program retention, open retention, completer lifecycle, session volume |
| 3. In-App | 1981022 | What they do in the product. Core loop first, then time and screens, then content. Not whether they return. | F4, adherence, pain, time in app (week), screens viewed, tab mix, abandonment, workout minutes (user-week), time in app (day), app opens, screen dwell, workout minutes (session), F7, screen paths, exercises started, skipped, feature usage |
| 4. Revenue | 1981021 | Money only. LTV / target CAC need ad spend, which is not in this project yet. Headline chart is a cumulative dollar running total (monthly / annual / total / profit after Apple 15% + refunds). | Revenue ($) (cumulative monthly, annual, total, profit), F3, trial→paid, renewals, verification grant, variant performance, Superwall render loss, purchase failures, F6 |
| 5. Reliability | 1981023 | Failures and friction — the niche board. | All pipeline failures, lost workouts, purchase confirmation, daily alerts, then per-reason bars, notification permission, then in-app feedback (volume, category, rating, submit failures, 4–5 → App Store ask) |

56 insights, 5 dashboards (pinned, numbered so the sidebar is journey order), 7 cohorts
(`Activated users`, `Weekly Active Completers`,
`Paying subscribers`, `Trialists`, `Lapsed completers`, `Internal / Test users`,
`Premium people`), two daily alerts
(`purchase_verification_failed > 0`, `program_assignment_failed > 0`), and a project
annotation marking the cutover. Starter boards ("Remedy Relentless", "Starter Remedy")
are unpinned and their leftover starter insights are deleted so the five numbered
dashboards are the pinned set. Tiles on each board run most-important at the top to
niche at the bottom. Dollars stay on Revenue; headcount / return rates stay on
Users & Retention; product usage and session quality stay on In-App.

Four things are worth knowing about how they are built:

- **Everything is hard-scoped to on-or-after 2026-08-09**, the instrumentation cutover.
  Project 470505 holds ~1,900 events under the *old* ad-hoc taxonomy (§0.6), including a
  name that no longer exists in the codebase. Without the date floor, charts would silently
  average two different taxonomies together.
- **`filterTestAccounts` is set explicitly on every builder insight.** SQL tiles cannot use
  that toggle, so they exclude cohort `362128` via `person_id NOT IN cohort(...)` plus `environment != sandbox`
  — the same rule, expressed in HogQL. Filtering SQL on `person.properties.is_internal`
  would be wrong: that value is frozen at ingestion under person-on-events.
- **Five metrics are SQL, not builder queries**, because the builder cannot state them
  exactly: the north-star ratio (sessions ÷ current-premium people via `persons.is_premium`,
  not frozen `person.properties.is_premium` on events, and not ÷ completers), WAC
  ("≥2 events per person per window"), adherence (completed ÷ each person's own
  `sessions_per_week_preference`), the onboarding step table (viewed vs completed vs
  median dwell, questions only), and verification grant (`trial_started` OR
  `subscription_started` after `purchase_flow_completed`).
- **The internal/test cohort matches `is_internal = true` only.** Cohort 362128 is the
  project's test-account filter. `$internal_or_test_user` is a PostHog default we never set
  and must not be OR-ed in. Membership is the current person property, so flagging is
  retroactive. Count is the number of flagged persons, not a fixed 6.

### 7.7.2 Why "the query ran" is not verification

Every one of the 56 insights executes against PostHog. Most return **zero rows after
internal exclusion** — correctly, because 27/28 persons are in cohort 362128. That creates
a trap: a misspelled event name produces a perfectly valid query that returns zero rows
forever and looks identical to "everyone is us." Unfiltered SQL (verification grant) is
the check that the query is not vacuously empty.

So event and property names are checked against `lib/analytics/events/*.ts` — the Zod
schemas — *before* anything is written. The build refuses to run if an insight references an
event or property the app cannot emit. `scripts/verify_analysis_preflight.mjs` is the
negative test proving the guard actually fires: it injects a bad event name, a bad event
property, and an undeclared person property, and asserts all three are rejected.

Writing that guard immediately caught a bug in its own parser — single-line schemas like
`z.object({ exercise_id: uuid, reason: videoFailureReason })` were only yielding their first
property, so several real properties were being treated as unknown. Both are fixed.

**Result: 144/144 checks pass** (`node scripts/posthog_analysis_layer.mjs --apply`), plus 4/4
on the preflight negative test. Re-run `--apply` after any insight change; it PATCHes in
place.

### 7.7.3 What these dashboards cannot tell you yet

They are correct by construction and empty by circumstance. Until Phase 5 puts real client
events through them, **the numbers on them are not evidence of anything.** Specifically:

- Every client-sourced chart reads zero because no instrumented build has run on a device
  (or reads only internal traffic while `INCLUDE_INTERNAL_FOR_PREVIEW` is on).
- Screen mix, tab mix, paths, and time-in-app tiles run on `$screen` and Application
  Opened/Backgrounded — those already exist. `screen_exited` and `app_session_ended` need
  the next client release before they can replace the lifecycle pairing.
- `trial_started` / `subscription_started` / `subscription_restored` have never fired from a
  real purchase (§7.6), so F3, trial→paid and the revenue chart are structurally correct but
  unexercised.

Revenue Analytics **is** now configured (§10.2), so revenue flows into PostHog's own revenue
views as well as the plain property sum on the Revenue dashboard.

---

## 8. How to add a new event

1. **Justify it.** Name the decision it will change. If you cannot, don't add it.
2. **Add the row to §3 of this file first** — event name, trigger location, required and
   optional properties, types, and the closed value set for every enumerated property.
3. **Add the typed wrapper** to the matching domain module in `lib/analytics/events/`
   (`onboarding.ts`, `auth.ts`, `monetization.ts`, `program.ts`, `coreLoop.ts`,
   `engagement.ts`) using `defineEvent(name, schema)`. Required properties are required in the
   type; enumerated values come from `enums.ts`, never bare `z.string()`.
4. **Add any new closed value set to `enums.ts`** and to the value-set table in §3. Derive it
   from `lib/schemas.ts` if the app already persists that field.
5. **Call the wrapper.** There is no untyped escape hatch — `capture` is exported only for
   `defineEvent`.
6. **Check it against §6.1** — no PII, no free text, no unbounded strings, no raw errors.
   `node scripts/verify_phase5_device.mjs --static` enforces this automatically.
7. **Verify it arrives** in PostHog with a real device before considering it done.
8. **If it belongs on a dashboard, add it to `scripts/posthog_analysis_layer.mjs`** and
   re-run with `--apply`. The preflight there refuses to build a chart on an event the
   schemas cannot produce, so a rename that misses one of the two files fails loudly instead
   of yielding a chart that reads zero forever.
9. **Doc and code ship in the same commit.** A taxonomy doc that drifts from the code is
   worse than no doc.

To remove an event: delete the wrapper, the call site, and the table row together. A wrapper
with no call site is deleted on sight.

---

## 9. Phase 5 verification

Most of this checklist is now automated: `scripts/verify_phase5_device.mjs`. Do the device
walkthrough, then run it.

```bash
node scripts/verify_phase5_device.mjs --static                    # no PostHog calls
node scripts/verify_phase5_device.mjs --since 2h --include-internal   # after a dev-device run
```

**Pass `--include-internal` when verifying your own run.** The harness defaults to the same
lens the dashboards use, which excludes internal traffic — and a dev device is almost
certainly flagged `is_internal`, so without the flag every data check comes back
inconclusive.

It reports three outcomes, and the third is the one that makes it usable before the device
run exists: **PASS** (ran, data is right), **FAIL** (ran, data is wrong), **SKIP** (the
events have not arrived, so the check could not run). Only FAIL sets a non-zero exit.

The window is **floored at the cutover** regardless of `--since`, so a wide window cannot
drag the pre-Phase-2 taxonomy (§0.6) back in and report long-dead event names as live drift.

Two checks are worth calling out because no manual walkthrough would catch them reliably:

- **Taxonomy drift.** Every event name and property arriving in PostHog is compared against
  the Zod schemas. This is precisely the `onboarding_download_reason` failure from §0.6 — a
  renamed event left orphaned in PostHog — turned into an automatic check.
- **Identity merge integrity.** Counts persons holding *post*-auth events with no pre-auth
  history. Any such person is an orphaned acquisition funnel, which §0.3 flags as the single
  highest-risk part of the design.

Writing the harness immediately caught two bugs in its own checks, both of which would have
produced confident nonsense:

1. The "exactly one file imports the SDK" check matched the **comments that warn against
   importing the SDK**, reporting a violation in the very files enforcing the rule. It now
   strips comments and distinguishes a runtime import from an erased `import type`.
2. `loadServerEvents()` missed `account_deleted`, because it is the last member of the
   `ServerEventName` union and ends with a semicolon the regex did not allow. A real,
   correctly-emitted server event was being reported as taxonomy drift.

### 9.1 First device run — what it found

The first real walkthrough produced 312 events and **four genuine defects**, three of them
in the app rather than in the instrumentation. This is the entire justification for Phase 5:
every one of these passed type-checking, passed the taxonomy preflight, and would have
looked completely normal in a code review.

**1. A render loop hammering an edge function.** `onboarding_plan_previewed` fired **163
times in 113 seconds** — over half of every event captured. `match.tsx` computed
`const complete = getComplete(answers)` on each render, which returns a fresh Zod-parsed
object, and then depended on it in an effect that calls `setPreview()`. New object identity
every render → effect re-runs → sets state → renders again. The analytics event was the
symptom; the disease was `assign-program` being re-invoked roughly 1.4 times a second for
as long as the match screen stayed open. Fixed by memoizing on `answers`, which is a stable
`useState` value.

This one is the reason the harness now has a **`no event firing at machine speed`** check.
Nothing else could have caught it: the event name was correct, the properties were correct,
the schema validated. Only the *volume* was insane, and volume is not something any static
check or manual walkthrough reliably notices.

A later audit still saw ~42 preview events per person. The memo stopped the render loop;
Superwall present/dismiss remounts the match screen and re-ran the effect. The event is now
deduped on a session-level fingerprint so a remount of the same preview is silent.

**2. Phantom hints on resume.** Resuming onboarding fired four `onboarding_hint_shown`
events in the same second, all attributed to `step_key: 'welcome'` — for hints belonging to
q6, q2, q3 and q8, none of which were on screen. `PersonalizationBubble` reports whenever it
becomes visible, and a pre-filled answer makes it visible on its first render, before the
step tracker has caught up. It now captures whether it was already visible at mount and only
reports a value that changes while mounted.

**3. One purchase, three events.** `purchase_flow_completed` fired three times for a single
transaction — once from Superwall's dismiss callback, once from the StoreKit query, once
from the feature gate. That redundancy is deliberate and load-bearing for *access* (it is
what stops a paying user falling through), but the event is supposed to mean one completed
purchase. Now deduplicated on `original_transaction_id`, so the redundant paths stay
redundant while the event stays truthful — and a genuine second attempt still reports.

**4. Internal traffic was not excluded from anything.** All 312 events counted as
production. `is_internal` was only ever written server-side, and only as an *event* property
on the handful of events the edge functions emit — so a developer walking the app produced a
full session of ordinary-looking production traffic. Only 1 of 54 accounts was flagged
`is_dev`, and the exclusion cohort matches `is_internal` as a **person** property, which
nothing set. The cohort excluded exactly **0 of 312** events.

Fixed in three places: the app now tags dev accounts at sign-in
(`AnalyticsProvider.markInternal`), `scripts/flag_internal_accounts.mjs` sets
`profiles.is_dev` and back-fills existing PostHog persons, and all 54 pre-launch accounts
were flagged. Because cohort membership is evaluated against the person as they are *now*,
flagging is retroactive — all 334 events moved inside the cohort, and the production view
correctly reports zero traffic.

That last point exposed a fifth bug, in the harness itself: it filtered internal traffic by
reading `person.properties.is_internal` off the events table, which is frozen at ingestion
under person-on-events. It therefore reported 312 events of "production" traffic that every
dashboard had already excluded. It now filters by cohort membership, the same way the
dashboards do, so the two views cannot disagree.

A sixth was a false alarm the harness raised against itself: it asserted onboarding steps
`0..12` complete contiguously and failed on the observed `3..12`. The run was right and the
check was wrong — the flow has 15 steps, and the five interstitials (`welcome`, `founder`,
`education`, `finalizing`, `match`) have no answer to complete, so they report progress
through `onboarding_step_exited` instead. The expected set is now derived from the step enum
and from which screens actually call `useOnboardingStepCompletion`, so reordering or adding
a step updates the check instead of silently invalidating it.

**What the run could not verify.** Three checks still report FAIL for want of data, all
blocked on the same thing rather than on any defect:

- The purchase event, `program_assigned` and `session_completed` never fired because the
  purchase was rejected — correctly — with `transaction_already_linked`. The *Apple sandbox
  account* was fine; the conflict is at the **Remedy account** layer. Sandbox Apple ID
  `remedyappco@gmail.com` already owns subscription `2000001207494436`, and our
  `entitlements` table binds that transaction to the Remedy account
  `rkumar875675@gmail.com`. The run signed out and created a *new* Remedy account, so the
  same Apple ID returned the same transaction and the anti-fraud guard in `verify-purchase`
  refused to link one subscription to two accounts. Exactly what it is for. Unblocking means
  releasing that transaction from the account currently holding it, or purchasing on a
  different Apple ID.

  Note that the product involved is `com.remedyapp.monthly.no.trial`, so the event to expect
  is **`subscription_started`, not `trial_started`** — `verify-purchase` only emits
  `trial_started` when Apple reports `inTrialPeriod`. The harness originally keyed all three
  paid-path checks on `trial_started` alone, which would have reported "awaiting data"
  forever after a completely successful purchase. It now accepts either.
- `Application Installed` needs a genuinely fresh install; the SDK deduplicates it.
- `restore_succeeded` needs an account with something to restore.

Worth noting that the failure path instrumented *itself* correctly: `purchase_failed`,
`purchase_confirmation_failed` (`no_transaction`), `purchase_verification_failed`
(`transaction_already_linked`) and `restore_failed` (`no_transaction`) all arrived with
accurate closed-set reasons. The quality signals in §1.8 work.

### 9.2 Manual checklist

Items the harness cannot check — they need a human with a device.

**The actions to perform on the device** (the harness then judges the result):

- [x] Fresh install, walk the full anonymous funnel welcome → q8 without signing in.
      *Done. All 10 question steps completed in order; the merge held with zero orphans.
      `Application Installed` still missing — the app was already installed, and the SDK
      deduplicates it.*
- [x] Background the app mid-onboarding, reopen it. *Done — `backgrounded` exit recorded.*
- [ ] Complete the paywall with a **sandbox** Apple account, then sign up.
      *Attempted; blocked on `transaction_already_linked` (§9.1). Needs a second Sandbox
      Apple ID, or the bound transaction released.*
- [ ] Complete one full session, backgrounding the app partway through a *second* one.
      *Blocked behind the paywall above — no program is assigned without an entitlement.*
- [x] Log out, log in as a different user. *Done.*
- [x] Trigger a restore from Profile. *Done — correctly reported `restore_failed`
      (`no_transaction`); `restore_succeeded` still needs an account with something to
      restore.*

**Then run, in this order:**

```bash
node scripts/flag_internal_accounts.mjs --apply          # flag any account the run created
node scripts/verify_phase5_device.mjs --since 2h --include-internal
```

The first step matters and is easy to forget. A newly created account defaults to
`is_dev = false`, so a test account made *during* the run is not internal until it is
flagged — and its traffic counts as production in the meantime. Flagging is retroactive
(§10.2.1), so running it afterwards is enough; running it at all is not optional.

**Checks that still need a human**, because they are about absence or about the SDK's own
behaviour, and no query can see them:

- [ ] Open the merged person in the PostHog UI and eyeball that pre-auth and post-auth events
      really are one person. The harness counts orphans, but a screenshot is the artifact
      worth keeping.
- [ ] Log in as a different user → confirm no events bleed across and `reset()` fired.
- [ ] Unset `EXPO_PUBLIC_POSTHOG_KEY` and `EXPO_PUBLIC_POSTHOG_HOST`, cold start, complete
      onboarding and a full session: **the app behaves identically and no network calls to
      PostHog are made.** This is the kill-switch test; verify with a proxy or Charles, since
      "no events arrived" alone cannot distinguish a working kill switch from a dropped
      network.
- [ ] Replay a verification twice against the *same* Apple transaction. The harness asserts
      one `trial_started` per `original_transaction_id`, but only a human can cause the replay.

**Already verified, no device needed:**

- [x] Delete account → `account_deleted` fires anonymously and the PostHog person is erased
      (§7.6).
- [x] Exactly one file constructs the PostHog SDK — automated, currently passing.
- [x] No PII in any event payload — automated, 70 schemas scanned, currently passing.

---

## 10. Decision log

| # | Question | Resolution |
|---|---|---|
| 1 | Which PostHog project? | **Project `470505`**, US cloud. The key already in `.env.local` is verified live against `https://us.i.posthog.com`. |
| 2 | Preserve existing event history? | **No.** App is not live; no data matters. Clean rename to the taxonomy in §3, no bridging. |
| 3 | Activation window | See §1.3. |
| 4 | Send pain scores? | **Yes.** Accepted along with the Health & Fitness privacy-label consequence (§6.2). |
| 5 | Server-side keys | Resolved. Capture uses the project token; erasure uses a separate person-scoped personal key (§10.1). A `project:write` key is still missing for the two settings in §10.2. |
| 6 | Apple ASSN webhook | **Shipped** as `apple-assn`. See §3.6.1. App Store Connect URL config is the remaining ops step. |
| 7 | User-facing opt-out toggle | **No.** Env kill switch only. See §6.5. |
| 8 | Insight shape vs usefulness | **Aggregate the decision, don't chart the calendar.** Onboarding exits are a bar by step, filtered to `abandoned` + `backgrounded`. Dead ends and review-prompt skips are bars by `reason`. F3 ends at `purchase_flow_completed`; grant is `trial_started` OR `subscription_started`. F7 starts at `weekly_ramp_decided`. North star divides by current-premium people (`persons.is_premium`), not by completers. F1 and open-retention are cutover-scoped off `Application Installed` because that event last fired before cutover. |

### 10.1 Access still required

| Need | Blocks | Status |
|---|---|---|
| `EXPO_PUBLIC_POSTHOG_KEY` for project 470505 | Phase 1 | **Resolved.** In `.env.local`; verified to be project 470505's own `api_token`. |
| `POSTHOG_PERSONAL_API_KEY` | Phases 5–6, §6.4 | **Resolved.** In `.env.local`. Verified against project 470505: read access confirmed on query, insights, dashboards, cohorts, persons, event/property definitions, alerts and annotations. Local tooling only — never bundled. |
| `SUPABASE_ACCESS_TOKEN` | Phase 3 deploy | **Resolved.** In `.env.local`. `supabase projects list` now returns project `vgqmvekjttywwadpftre` as linked. |
| `POSTHOG_PROJECT_KEY` + `POSTHOG_HOST` as Supabase secrets | Phase 3 server capture | **Resolved.** Set on project `vgqmvekjttywwadpftre` and confirmed readable inside a deployed function isolate (§7.6). Reuses the publishable `phc_` key — `/i/v0/e/` accepts only the project token, and that token is already public in the app bundle, so this adds no exposure. |
| A second, person-scoped PostHog key in Supabase secrets | §6.4 deletion propagation | **Resolved.** `POSTHOG_PERSON_DELETE_KEY` + `POSTHOG_PROJECT_ID` + `POSTHOG_API_HOST` are set on `vgqmvekjttywwadpftre`; erasure verified end-to-end (§7.6). |
| `project:write` scope | Revenue Analytics + test-account filter default | **Resolved.** `POSTHOG_PROJECT_WRITE_KEY` in `.env.local`; `scripts/configure_posthog_project.mjs --apply` passed 7/7 and the result was re-read independently with the *read* key (§10.2). Git-ignored, absent from tracked files and history. |

**All access is now in place.** Nothing in this document is blocked on a credential.

### 10.2 Project settings — applied

Both project-level settings are configured, by
`scripts/configure_posthog_project.mjs --apply` (dry-runs by default; re-runnable — it
PATCHes to a fixed desired state). Verified 7/7 by the script, then re-read independently
with the read-only key to confirm the write actually persisted rather than trusting the
script's own read-back.

1. **Revenue events registered.** `subscription_started` and `subscription_renewed`, revenue
   property `revenue`, currency property `currency`, product property `product_id`,
   `subscriptionProperty` `original_transaction_id`, **currency-aware decimal on** (values
   are minor units, so 7999 → $79.99), `filter_test_accounts` on.
   - `trial_started` is deliberately **not** registered: a trial is not income, and booking it
     would report revenue that may never arrive.
   - `subscriptionProperty` is set because ASSN `DID_RENEW` is flowing (`subscription_renewed`).
     Both events share `original_transaction_id` so Revenue Analytics can stitch MRR/churn.
2. **Internal-traffic exclusion wired.** Test-account filters are now the (repaired) internal
   cohort `362128` **plus** `event.environment is_not sandbox`, and
   `test_account_filters_default_checked` is `true`, so new ad-hoc insights start filtered.

#### 10.2.1 Keeping the internal cohort populated

Configuring the filter was necessary but not sufficient: the first device run proved the
cohort was matching almost nobody (§9.1). Cohort `362128` matches `is_internal` as a
**person** property, and nothing was setting it — the edge functions wrote `is_internal`
only as an *event* property, on the few events they emit. Three things now keep it fed:

- **The app tags itself.** `AnalyticsProvider.markInternal` sets `is_internal: true` as a
  person property at sign-in when `profiles.is_dev` is set. Only ever `true`, so a real user
  is never written to and can never be silently dropped from analytics.
- **`scripts/flag_internal_accounts.mjs`** sets `profiles.is_dev` and back-fills existing
  PostHog persons. Dry-runs by default; `--apply` to write; re-runnable and never un-flags.
- **All 54 pre-launch accounts are flagged.** Every account that existed before launch is
  ours, so all of them are internal.

The important property is that this is **retroactive**. Cohort membership is evaluated
against the person as they are now, not as they were at ingestion, so flagging a person
pulls their entire history out of every insight. Filtering on `is_internal` directly would
*not* do this — person properties on the events table are frozen at ingestion time under
person-on-events, which is the trap the harness itself originally fell into (§9.1).

**PostHog materialised six managed views** under
`revenue_analytics.events.subscription_started.*` (charge, customer, mrr, product,
revenue_item, subscription), confirming the mapping was accepted rather than merely stored.

`revenue_item_events_revenue_view` currently returns **zero rows, correctly**. Five
`subscription_started` events exist in the project — all `phase3-probe-*` verification events
carrying `revenue = 7999 USD` — and every one is `is_internal = true` on both the event and
the person. The empty view is therefore positive evidence: it proves `filter_test_accounts`
is actually excluding internal traffic from revenue, rather than the mapping being inert.

**Note on tooling:** the PostHog MCP connection available in this workspace is authenticated
against a *different* account — organization `Relentless App LLC`, project `400227`. The app
sends to project `470505`, which that connection cannot see. MCP-based analysis will therefore
show an empty project and must not be used to check this instrumentation; use the personal API
key against `470505` instead.
