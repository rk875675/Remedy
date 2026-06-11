# Remedy Codebase Audit Report

Audit date: May 25, 2026. Zero code changes. Facts only.

---

## SECTION 1 — SCREEN INVENTORY

### Root / infrastructure

**app/_layout.tsx**
- Renders: blank cream splash while auth/onboarding/premium checks run; then faded Slot for all routes.
- Data: Supabase `onboarding_answers` (existence check); `lib/entitlements.ts` `isPremium()` on `entitlements` table and `isDevUser()` on `profiles.is_dev`.
- Issues: `premium` state is fetched once per session change, not after paywall purchase/restore; `hasRedirected` ref is written but never read; navigation effect omits `segments`/`router` from dependencies.

**context/AuthContext.tsx** (provider, no UI)
- Data: Supabase Auth `getSession`, `onAuthStateChange`; Supabase `profiles` SELECT/INSERT via `validateSession` and `ensureProfile`.
- Issues: `validateSession` runs only on initial cold `getSession`, not on every auth state change; duplicate profile-creation logic in two functions; client `profiles` INSERT has no INSERT RLS policy (relies on `handle_new_user` trigger).

**context/OnboardingContext.tsx** (provider, no UI)
- Data: in-memory `Partial<OnboardingAnswers>` only; lost on app restart mid-onboarding.

**App.tsx** — dead placeholder screen; marked HUMAN INPUT NEEDED for deletion. Not used (`expo-router/entry` is main).

**index.ts** — dead entry registering App.tsx; marked HUMAN INPUT NEEDED for deletion.

---

### Auth group — app/(auth)/

**(auth)/_layout.tsx**
- Renders: Stack navigator, no header, cream background. No data fetch.

**(auth)/sign-in.tsx**
- Renders: Remedy hero, Apple Sign In button (iOS), Google button, Email button, legal disclaimer text (not tappable links).
- Data: Supabase Auth `signInWithIdToken` (Apple/Google); Google via `@react-native-google-signin` (requires dev build).
- Issues: no mandatory medical disclaimer from PRD; Terms/Privacy not linked; Google `hasPlayServices()` is Android-oriented.

**(auth)/email.tsx**
- Renders: email/password form, sign-in vs sign-up toggle, back button.
- Data: Supabase Auth `signUp`, `signInWithPassword`.
- Issues: no password reset; no Resend integration; email verification depends on Supabase project config only.

---

### Onboarding group — app/(onboarding)/

**Actual navigation order on disk:** index → education → q6 → q1 → q2 → q3 → q4 → q5 → interstitial3 → review → finalizing → match

**(onboarding)/_layout.tsx** — Stack, gestures enabled, no header.

**(onboarding)/index.tsx** (Welcome)
- Renders: logo circle "R", app name, tagline, Get Started, sign-out link.
- Data: AuthContext (user email, signOut); OnboardingContext `resetAnswers` on mount.
- Navigates to: education.

**(onboarding)/education.tsx** (not in PRD flow)
- Renders: 3-slide carousel (structured rehab / licensed PTs / track progress), dot indicators.
- Data: hardcoded `slides` array; local `page` state.
- Navigates to: q6 on last slide.

**(onboarding)/q6.tsx** (Main goal — asked before pain questions)
- Renders: 4 single-select goal OptionCards.
- Data: OnboardingContext `main_goal`.
- Issues: no PersonalizingLayout/progress bar unlike q1–q5.

**(onboarding)/q1.tsx** — pain location (upper/middle/lower/all). Context + PersonalizingLayout step 1/5. → q2.

**(onboarding)/q2.tsx** — pain duration (acute/subacute/chronic). step 2/5. → q3. Skips interstitial1.

**(onboarding)/q3.tsx** — pain type with safety warning if sharp + acute. step 3/5. → q4.

**(onboarding)/q4.tsx** — activity level. step 4/5. → q5.

**(onboarding)/q5.tsx** — pain trigger. step 5/5. → interstitial3 (skips interstitial2).

**(onboarding)/interstitial3.tsx** — cost comparison card ($1,500+ vs $79.99/yr), ProgressBar 7/10. Static mock data. → review.

**(onboarding)/interstitial1.tsx** and **interstitial2.tsx** — referenced in CURSOR_PHASES.md only; not present as readable route files and not wired in navigation.

**(onboarding)/review.tsx** (not in PRD)
- Renders: 5-star rating, optional feedback textarea, Submit/Skip.
- Data: local state only; `expo-store-review` prompt if rating ≥ 4.
- Issues: rating/feedback never saved to Supabase or analytics.

**(onboarding)/finalizing.tsx** (not in PRD)
- Renders: fake "Building your plan" animation with 4 status lines.
- Data: local animated progress only; no backend work. Auto → match after ~2.5s.

**(onboarding)/match.tsx** (Program match)
- Renders: "Back Pain Relief Program" card, hardcoded stats (5 weeks / 4×/week / 20 min), feature bullets, "Start My Free Trial" CTA.
- Data: OnboardingContext answers; Supabase INSERT into `onboarding_answers`; tagline derived from `activity_level` only.
- Navigates to: `/(tabs)` on success (bypasses paywall route).
- Issues: no `user_programs` row created (no client insert, no DB trigger on onboarding insert); always assigns same program name regardless of answers; button label implies trial but does not open Superwall; program stats hardcoded not from `programs` table.

---

### Paywall group — app/(paywall)/

**(paywall)/_layout.tsx** — Stack, no header.

**(paywall)/index.tsx**
- Renders: trial pitch, feature list, Start Free Trial / Start Dev Trial, Restore Purchases link, Expo Go dev banner.
- Data: Superwall `identify`, `registerPlacement('onboarding_paywall')`; Supabase `entitlements` UPSERT (Expo Go fallback only); edge function `restore-purchases` invoke; AuthContext user.
- Issues: `verify-purchase` never invoked from client; Expo Go client entitlements UPSERT violates RLS (SELECT-only policy); restore sends hardcoded `originalTransactionId: 'restore_check'`; root layout `premium` state not refreshed after grant; Superwall `onDismiss` checks `isPremium` but root may still block.

---

### Main tabs — app/(tabs)/

**(tabs)/_layout.tsx**
- Renders: bottom tabs Home (⌂), Progress (◐), Profile (○) with Unicode icons.

**(tabs)/index.tsx** (Home)
- Renders: time-based greeting, today's session card OR rest day, rotating "Did you know" insight carousel, stat cards (sessions this week, program progress, avg pain last 7 days).
- Data: Supabase `user_programs`, `profiles.is_dev`, `programs`, `program_sessions`, `session_exercises`, `session_completions`, `pain_checkins`; AsyncStorage `remedy_reset_pending`, `dev_day_offset`; hardcoded `INSIGHTS` strings.
- Issues: empty/minimal home if no `user_programs` row; no PRD "pain trending down" summary; dev day offset only affects display for `is_dev` users; program progress on home uses DB `current_week` while progress tab uses calendar-computed week.

**(tabs)/progress.tsx**
- Renders: pain trend line chart (before/after), Mon–Sun completion circles, program progress bar + estimated completion date.
- Data: Supabase `session_completions`, `pain_checkins`, `user_programs`, `programs`; AsyncStorage reset flag.
- Issues: chart requires ≥3 days with before-pain data; `computedWeek` from calendar elapsed time may diverge from home tab's DB `current_week`.

**(tabs)/profile.tsx**
- Renders: name/email card, notifications toggle, hardcoded app version 0.1.0, dev tools (simulate day, reset progress, force paywall) when `profiles.is_dev`, sign out.
- Data: Supabase `profiles`; DELETE `session_completions`/`pain_checkins`; UPDATE `user_programs`; AsyncStorage notification pref and `dev_day_offset`; `lib/notifications.ts`.
- Issues: app version hardcoded not from `expo-constants`; simulate-day stored locally, home reads only for dev users; Force Paywall navigates to paywall but root guard redirects premium/dev users back to tabs.

---

### Session — app/session/

**session/_layout.tsx** — Stack, gestures disabled.

**session/[id].tsx** (Session player)
- Renders: phased flow — before pain check-in (1–10 tap dots) → exercise video/placeholder + Done → rest timer + Skip Rest → after pain check-in → completion screen.
- Data: Supabase `session_exercises` + nested `exercises`; INSERT `pain_checkins` (×2), `session_completions`; UPDATE `user_programs`; edge function `get-video-url` when `cloudflare_stream_id` set; fallback `exercise.video_url`.
- Issues: no Skip Exercise control (PRD specifies Skip); pause hides Done but does not pause rest timer or video via AppState; no mid-session progress save/resume; session advance hardcodes 4 sessions/week and 5 weeks instead of reading `programs`; no duplicate-completion guard; before pain check-in not linked to `program_session_id`; weeks 3–5 have no seeded sessions in DB.

---

### Components — components/

**components/onboarding/ContinueButton.tsx** — full-width primary CTA; props only.

**components/onboarding/OptionCard.tsx** — selectable row with optional dark-circle icon; props only.

**components/onboarding/PersonalizingLayout.tsx** — "Personalizing your plan" header + 3 segmented progress bars; `totalSteps` prop unused; step 4 appears in two bar ranges.

**components/onboarding/ProgressBar.tsx** — horizontal fill bar from current/total; props only.

**components/.gitkeep** — empty placeholder.

---

### Lib modules (not screens, referenced by screens)

**lib/supabase.ts** — typed Supabase client with AsyncStorage session persistence.

**lib/entitlements.ts** — reads `entitlements` and `profiles.is_dev`; `isPremium` checks `is_premium`, `expires_at`, `subscription_status`.

**lib/superwall.tsx** — optional SuperwallProvider; no-op fallbacks in Expo Go.

**lib/notifications.ts** — permission request, push token → `profiles.push_token`, daily local reminder at 9:00; `projectId: undefined` may fail token fetch without EAS project ID.

**constants/colors.ts** — PRD color palette values.

---

## SECTION 2 — DATABASE

### Tables (11 total) — all have RLS enabled

| Table | RLS | Client access |
|-------|-----|---------------|
| profiles | Yes | SELECT, UPDATE; INSERT attempted in AuthContext but no INSERT RLS policy (trigger creates rows) |
| onboarding_answers | Yes | SELECT, INSERT, UPDATE own row |
| programs | Yes | SELECT only (authenticated) |
| program_sessions | Yes | SELECT only |
| exercises | Yes | SELECT only |
| session_exercises | Yes | SELECT only |
| user_programs | Yes | SELECT, UPDATE own; no INSERT RLS policy |
| session_completions | Yes | SELECT, INSERT, DELETE own |
| pain_checkins | Yes | SELECT, INSERT, DELETE own |
| entitlements | Yes | SELECT only — no client write policies |
| billing_events | Yes | SELECT only — no client writes anywhere |

### DB triggers / migration-only writes

- `handle_new_user` trigger on `auth.users` INSERT → creates `profiles` + `entitlements` rows.
- Migrations `002_seed_data.sql` and `005_program_seed.sql` seed one program, weeks 1–2 sessions (7 total), exercises, session_exercise links.
- Migration `005` backfill INSERT into `user_programs` for users who already had `onboarding_answers` at migration time — not a runtime trigger for new users.

### Edge functions (3)

**verify-purchase** — Auth required. Accepts userId, transactionId, productId, idempotencyKey. Apple verification is stub (`isValid = true`). Service role UPSERT `entitlements`, UPSERT `billing_events`. Not invoked from any client code.

**restore-purchases** — Auth required. Accepts userId, originalTransactionId. Apple verification stub. Service role UPSERT `entitlements`, UPSERT `billing_events`. Invoked from app/(paywall)/index.tsx with hardcoded `originalTransactionId: 'restore_check'`.

**get-video-url** — Auth required. Accepts exerciseId. Service role SELECT `exercises.cloudflare_stream_id`; calls Cloudflare Stream API for signed HLS URL. Invoked from app/session/[id].tsx. Read-only on DB.

### Client writes that should go through edge functions (per DECISIONS.md / PRD §12)

- **entitlements** — client UPSERT in paywall Expo Go fallback should not exist; production path must be verify-purchase / restore-purchases / Apple webhooks only.
- **user_programs INSERT** — should be server-side on onboarding completion (edge function or trigger); currently no runtime path for new users.
- **onboarding_answers INSERT** — direct client write is acceptable per current RLS but no rate limiting (Upstash not implemented).
- **session_completions / pain_checkins INSERT** — direct client writes exist; no edge function layer or rate limiting.
- **billing_events** — correctly edge-only.

---

## SECTION 3 — AUTH FLOW

### Implemented flow (cold open → home)

1. Cold open → AuthContext loads persisted session from AsyncStorage.
2. No session → root guard redirects to `/(auth)/sign-in`.
3. Session exists → check `onboarding_answers` row.
4. No onboarding row → redirect to `/(onboarding)`.
5. Onboarding complete → check `isPremium()` OR `isDevUser()`.
6. Not premium/dev → redirect to `/(paywall)`.
7. Premium/dev → redirect to `/(tabs)`.
8. Onboarding match screen saves answers then calls `router.replace('/(tabs)')`; root guard immediately redirects non-premium users to paywall.

### PRD flow mismatch

PRD §5 order: Welcome → questions/interstitials → program match → paywall → sign up → home.

Implemented order: sign in first → onboarding (requires auth) → match saves answers → attempts tabs → root guard sends to paywall → home only if premium/dev.

PRD §6.8: "Users can access onboarding + first session for free before hitting paywall" — not implemented; entire `(tabs)` group and session player are gated behind premium/dev.

### Navigation gating by state

**Unauthenticated:** Root redirects to `/(auth)/sign-in` if not in auth group. Works.

**Authenticated + no onboarding:** Redirects to `/(onboarding)` if no `onboarding_answers` row. Works. Mid-flow answers are in-memory only; restart loses progress but user stays in onboarding group.

**Authenticated + onboarding + no subscription:** Redirects to `/(paywall)` if not premium and not dev. Works for blocking tabs. match.tsx tries to skip directly to tabs first.

**Authenticated + onboarding + premium:** Redirects away from auth/onboarding/paywall to tabs. Works on cold start when `entitlements` row is premium/trial and not expired.

**Dev mode (`profiles.is_dev = true`):** Treated as premium in root layout (`premium || dev`). Dev tools visible on profile. Works for bypassing paywall.

### Gaps and edge cases

- Root `premium` state not refreshed after paywall grant/restore in same session — user may loop back to paywall until app restart (when `isPremium` re-fetches from DB).
- Expo Go "Start Dev Trial" client entitlements UPSERT likely fails RLS; no error handling before navigation.
- "Restore Purchases" stub edge function always grants premium server-side regardless of Apple receipt — works in DB but same stale-client-state issue.
- Force Paywall from profile immediately redirects premium/dev users back to tabs.
- No guest/anonymous onboarding path.
- Email sign-up with confirmation required leaves user signed out with success message; no clear return path.
- `validateSession` on cold start may sign out user if profile missing and client INSERT fails.

---

## SECTION 4 — BROKEN OR INCOMPLETE

### Hardcoded and should be dynamic

- match.tsx: program name, 5 weeks / 4×/week / 20 min stats.
- session/[id].tsx: 4 sessions per week, 5 program weeks for advancement logic.
- profile.tsx: app version "0.1.0".
- paywall/index.tsx: restore `originalTransactionId: 'restore_check'`.
- interstitial3.tsx: $1,500+ and $79.99 pricing figures.
- home INSIGHTS array: static strings.
- verify-purchase / restore-purchases: expiry dates computed from productId, not Apple response.

### Placeholder / mock instead of real DB or services

- All exercise `video_url` NULL in seed data; `cloudflare_stream_id` NULL — session player shows colored placeholder with exercise name.
- verify-purchase / restore-purchases: Apple verification always returns valid.
- finalizing.tsx: fake loading animation, no server-side program assignment.
- education.tsx, interstitial3.tsx, home insights: static marketing copy.
- Superwall purchase not wired to verify-purchase edge function.

### TODO / HUMAN INPUT NEEDED comments in code

- App.tsx — dead code, safe to delete.
- index.ts — dead code, safe to delete.
- supabase/functions/verify-purchase/index.ts — Apple verification endpoint, trial detection, real StoreKit 2 integration.
- supabase/functions/restore-purchases/index.ts — Apple verification, extract productId/expiresAt from Apple response.

No HUMAN INPUT NEEDED comments in app/ or components/ route files.

### Visually built but not functionally connected

- Onboarding review screen — UI only, no persistence.
- finalizing screen — cosmetic, no program creation.
- match "Start My Free Trial" — saves onboarding only, does not start trial or open paywall.
- Superwall paywall — UI wrapper exists; purchase → verify-purchase pipeline not connected.
- Push notifications toggle — schedules local notification; push token save may fail without EAS projectId; no server-side push sending.
- PostHog analytics — not in package.json or codebase.
- Upstash rate limiting — not in codebase.
- Resend transactional email — not in codebase.
- Program personalization — all users get same program UUID; onboarding answers stored but not used for routing.
- interstitial1 / interstitial2 — planned in CURSOR_PHASES.md, not built or linked.
- Weeks 3–5 program content — not seeded (only weeks 1–2 exist in DB).

---

## SECTION 5 — MISSING FROM PRD

Cross-reference against PRD.md MVP scope (§4) and feature sections (§6–§14).

### Authentication (§6.1)
- Partial: Apple, Google, Email implemented via Supabase Auth.
- Missing: sign-up after paywall (currently before onboarding); email verification via Resend; Terms/Privacy as functional links; mandatory medical disclaimer on onboarding.

### Onboarding (§6.2, §5)
- Partial: 6 questions exist; safety gate for sharp + acute exists on q3.
- Missing: PRD screen order (interstitial1 after q1, interstitial2 after q2); interstitial1 social proof stat screen; interstitial2 pain reduction graph screen; progress bar throughout (partial via PersonalizingLayout on q1–q5 only); onboarding accessible before account creation.

### Programs (§6.3)
- Partial: one back-pain program seeded; weeks 1–2 content only.
- Missing: 4–6 full weeks of sessions; program variants based on onboarding answers; progressive difficulty weeks 3–5; real PT videos (placeholders expected per PRD dev note — correctly placeholder).

### Session player (§6.4)
- Partial: video area, exercise info, rest timer, pause, auto-advance via Done.
- Missing: Skip exercise control; mid-session exit saves progress; auto-pause on background; cold start "Continue Session" (intentional no auto-resume per DECISIONS.md); partial completion not counted (not enforced — any completion inserts full session_completions row).

### Pain check-in (§6.5)
- Built: before/after 1–10 captured and stored in `pain_checkins`.
- Partial: before check-in not associated with session_completion_id until after session completes.

### Progress tracking (§6.6)
- Partial: weekly completion circles, pain trend chart, program progress bar on progress tab.
- Missing: home "pain trending down" quick summary.

### Home screen (§6.7)
- Partial: today's session card, rest day, program progress stat, avg pain stat, sessions this week.
- Missing: pain trend summary line.

### Paywall + subscription (§6.8, §9)
- Partial: paywall screen, Superwall integration scaffold, restore button, pricing copy.
- Missing: real Apple IAP / StoreKit purchase flow connected to verify-purchase; Superwall A/B experiments; first session free before paywall; idempotency keys from client on purchase; billing event log from real transactions; refund/revocation handling; annual savings prominence in Superwall UI (static text only on fallback screen).

### Architecture / backend (§12, DECISIONS.md)
- Missing: Upstash Redis rate limiting on edge functions; PostHog event tracking (all events listed in DECISIONS.md §11); server-side user_programs assignment on onboarding; Resend emails (welcome, trial expiring, subscription confirmation); Cloudflare Stream production video pipeline (edge function exists, no seeded stream IDs).

### Legal (§8)
- Missing: mandatory onboarding disclaimer text; ToS/Privacy Policy screens; PT credentials display.

### Launch checklist items (§14) — all unchecked in PRD; codebase status
- Not built: real videos, full program load, Apple IAP sandbox-tested path, Superwall configured/tested, PostHog wired, attorney-reviewed copy, TestFlight beta infrastructure.

---

## SECTION 6 — WHAT IS ACTUALLY WORKING END TO END

Listed only flows that can complete successfully with a configured Supabase project and migrations applied, stated with required conditions.

1. **Cold start → sign-in screen** when no persisted Supabase session.

2. **Email sign-in** (when Supabase email confirmation is disabled or user already confirmed) → root guard → onboarding welcome.

3. **Apple Sign In on iOS dev build** → same gating (requires Supabase Apple provider configured).

4. **Onboarding questionnaire UI** through all screens to match screen — answers held in context, navigation works.

5. **Persist onboarding answers** — match.tsx INSERT into `onboarding_answers` succeeds for authenticated user with profile row.

6. **Root guard routing** — authenticated users without onboarding answers forced to onboarding; with onboarding but without premium/dev forced to paywall; premium/dev users reach tabs.

7. **Restore Purchases stub path** — paywall invokes restore-purchases edge function → service role grants `entitlements.is_premium = true` in database. UI may require app restart to pass root guard due to stale `premium` state; after restart, tabs accessible.

8. **Dev user bypass** — user with `profiles.is_dev = true` reaches tabs without subscription.

9. **Home → session → completion** — when `user_programs` row exists (users backfilled by migration 005 at migration time, or manually inserted): home loads today's session from `program_sessions`, session player loads exercises from DB, before/after pain check-ins and session_completions INSERT succeed, user_programs advances current_session/week.

10. **Progress tab** — after ≥3 days of before-pain data, chart renders; weekly completion circles update from session_completions.

11. **Profile dev reset** — is_dev users can delete completions/checkins and reset user_programs to week 1.

12. **Sign out** — clears session, returns to sign-in via root guard.

### Flows that do NOT work end-to-end for a typical new user

- New user completing onboarding → home with session content (no runtime `user_programs` creation).
- Expo Go "Start Dev Trial" → tabs (client entitlements write blocked by RLS; premium state stale even if write succeeded).
- Superwall purchase → premium (verify-purchase not called from client).
- Completing full 5-week program (weeks 3–5 sessions not in DB).
- Push notification delivery, analytics funnel, real subscription billing.

---

*End of audit. No fixes or recommendations included per scope.*
