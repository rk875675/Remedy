# Remedy — Cursor Master Prompt (Phased Build)

Feed each phase one at a time. Verify it works before moving to the next.
Every phase references @PRD.md, @DECISIONS.md, and @.cursor/rules/project.mdc — include these at the top of every Cursor prompt.

---

## Phase 1 — Supabase Schema, RLS, and TypeScript Types

**Cursor prompt:**

```
Context: @PRD.md @DECISIONS.md @.cursor/rules/project.mdc

Goal: Set up the complete Supabase database schema, RLS policies, and matching TypeScript types for the Remedy app. No UI, no logic — schema only.

--- SCHEMA ---

Create a migration file at `supabase/migrations/001_initial_schema.sql` with the following tables:

1. profiles
   - id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
   - display_name text
   - email text
   - created_at timestamptz DEFAULT now()

2. onboarding_answers
   - id uuid PRIMARY KEY DEFAULT gen_random_uuid()
   - user_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE
   - pain_location text NOT NULL        -- 'upper' | 'middle' | 'lower' | 'all'
   - pain_duration text NOT NULL        -- 'acute' | 'subacute' | 'chronic'
   - pain_type text NOT NULL            -- 'stiffness' | 'ache' | 'sharp' | 'multiple'
   - activity_level text NOT NULL       -- 'sedentary' | 'light' | 'active' | 'athlete'
   - pain_trigger text NOT NULL         -- 'sitting' | 'bending' | 'standing' | 'morning' | 'exercise'
   - main_goal text NOT NULL            -- 'reduce_pain' | 'return_to_exercise' | 'sleep' | 'mobility'
   - completed_at timestamptz DEFAULT now()
   - created_at timestamptz DEFAULT now()

3. programs
   - id uuid PRIMARY KEY DEFAULT gen_random_uuid()
   - name text NOT NULL
   - description text NOT NULL
   - duration_weeks int NOT NULL
   - sessions_per_week int NOT NULL
   - target_activity_levels text[] NOT NULL   -- which activity levels this program suits
   - created_at timestamptz DEFAULT now()

4. program_sessions
   - id uuid PRIMARY KEY DEFAULT gen_random_uuid()
   - program_id uuid REFERENCES programs(id) ON DELETE CASCADE
   - week_number int NOT NULL
   - session_number int NOT NULL              -- session index within the week
   - title text NOT NULL
   - duration_minutes int NOT NULL

5. exercises
   - id uuid PRIMARY KEY DEFAULT gen_random_uuid()
   - name text NOT NULL
   - description text
   - sets int
   - reps int                                 -- nullable if duration-based
   - duration_seconds int                     -- nullable if rep-based
   - rest_seconds int NOT NULL DEFAULT 30
   - video_url text                           -- placeholder, null for now
   - instructions text
   - created_at timestamptz DEFAULT now()

6. session_exercises
   - id uuid PRIMARY KEY DEFAULT gen_random_uuid()
   - session_id uuid REFERENCES program_sessions(id) ON DELETE CASCADE
   - exercise_id uuid REFERENCES exercises(id) ON DELETE CASCADE
   - order_index int NOT NULL

7. user_programs
   - id uuid PRIMARY KEY DEFAULT gen_random_uuid()
   - user_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE
   - program_id uuid REFERENCES programs(id)
   - started_at timestamptz DEFAULT now()
   - current_week int NOT NULL DEFAULT 1
   - current_session int NOT NULL DEFAULT 1

8. session_completions
   - id uuid PRIMARY KEY DEFAULT gen_random_uuid()
   - user_id uuid REFERENCES profiles(id) ON DELETE CASCADE
   - program_session_id uuid REFERENCES program_sessions(id)
   - completed_at timestamptz DEFAULT now()
   - duration_seconds int

9. pain_checkins
   - id uuid PRIMARY KEY DEFAULT gen_random_uuid()
   - user_id uuid REFERENCES profiles(id) ON DELETE CASCADE
   - session_completion_id uuid REFERENCES session_completions(id) ON DELETE SET NULL
   - score int NOT NULL CHECK (score >= 1 AND score <= 10)
   - type text NOT NULL CHECK (type IN ('before', 'after'))
   - recorded_at timestamptz DEFAULT now()

10. entitlements
    - id uuid PRIMARY KEY DEFAULT gen_random_uuid()
    - user_id uuid REFERENCES profiles(id) ON DELETE CASCADE UNIQUE
    - is_premium boolean NOT NULL DEFAULT false
    - subscription_status text NOT NULL DEFAULT 'none'
      CHECK (subscription_status IN ('none','trial','active','cancelled','expired'))
    - product_id text
    - original_transaction_id text
    - trial_started_at timestamptz
    - trial_ends_at timestamptz
    - expires_at timestamptz
    - updated_at timestamptz DEFAULT now()

11. billing_events
    - id uuid PRIMARY KEY DEFAULT gen_random_uuid()
    - user_id uuid REFERENCES profiles(id) ON DELETE CASCADE
    - event_type text NOT NULL
      CHECK (event_type IN ('trial_started','subscription_started','subscription_renewed','subscription_cancelled','refund','restored'))
    - product_id text
    - transaction_id text
    - idempotency_key text UNIQUE NOT NULL
    - metadata jsonb
    - created_at timestamptz DEFAULT now()

--- RLS POLICIES ---

Enable RLS on every table. Apply these policies:

- profiles: users can SELECT and UPDATE their own row (WHERE id = auth.uid())
- onboarding_answers: users can SELECT, INSERT, UPDATE their own row
- programs: all authenticated users can SELECT (read-only, no insert/update from client)
- program_sessions: all authenticated users can SELECT
- exercises: all authenticated users can SELECT
- session_exercises: all authenticated users can SELECT
- user_programs: users can SELECT their own row; no direct INSERT/UPDATE from client (handled by edge function)
- session_completions: users can SELECT their own rows; INSERT their own rows; no UPDATE/DELETE
- pain_checkins: users can SELECT and INSERT their own rows; no UPDATE/DELETE
- entitlements: users can SELECT their own row; no INSERT/UPDATE/DELETE from client (backend only)
- billing_events: users can SELECT their own rows; no INSERT/UPDATE/DELETE from client (backend only)

--- TRIGGER ---

Create a trigger on auth.users INSERT that automatically creates a profiles row and an entitlements row for every new user.

--- TYPESCRIPT TYPES ---

Create `types/database.ts` — export TypeScript types matching every table above. Use this pattern:

export type Profile = { id: string; display_name: string | null; email: string | null; created_at: string }
(and so on for every table)

Also export a `Database` type compatible with the Supabase client generic:
export type Database = { public: { Tables: { profiles: { Row: Profile; Insert: ...; Update: ... }, ... } } }

Update `lib/supabase.ts` to use the Database type generic: createClient<Database>(...)

--- CONSTRAINTS ---
- No seed data yet
- No edge functions yet
- Do not touch any app/ files
- If any constraint or field is ambiguous, output // HUMAN INPUT NEEDED: and stop

--- REPORT BACK ---
- List every file created or modified
- List all tables and confirm RLS is enabled on each
- Any // HUMAN INPUT NEEDED: items
```

---

## Phase 2 — Auth Flow

**Cursor prompt:**

```
Context: @PRD.md @DECISIONS.md @.cursor/rules/project.mdc @types/database.ts @lib/supabase.ts

Goal: Build the complete auth flow — Apple Sign In, Google Sign In, and email/password. Use Supabase Auth for all three. Wire navigation so unauthenticated users land on onboarding/sign-in and authenticated users go to the main app.

--- INSTALL ---
Ask me to confirm before installing:
- expo-apple-authentication
- @react-native-google-signin/google-signin

--- AUTH CONTEXT ---

Create `context/AuthContext.tsx`:
- Wrap the app in an AuthProvider that listens to supabase.auth.onAuthStateChange
- Expose: session, user, loading, signOut
- On sign-in, check if a profiles row exists — if not, create one
- Export useAuth hook

--- SCREENS ---

Build `app/(auth)/sign-in.tsx`:
- Warm background (colors.background)
- App name at top
- Three buttons stacked:
  - "Continue with Apple" — uses expo-apple-authentication, calls supabase.auth.signInWithIdToken
  - "Continue with Google" — uses Google Sign In SDK, calls supabase.auth.signInWithIdToken
  - "Continue with Email" — navigates to app/(auth)/email.tsx
- Small legal text at bottom: "By continuing, you agree to our Terms and Privacy Policy"
- Apple Sign In button must use the native Apple button style (required by Apple guidelines)

Build `app/(auth)/email.tsx`:
- Email + password inputs
- "Sign In" button and "Create Account" button (same screen, toggle mode)
- Calls supabase.auth.signInWithPassword or supabase.auth.signUp
- Show inline error messages (invalid email, wrong password, etc.)
- "Back" link to sign-in.tsx

--- NAVIGATION LOGIC ---

Update `app/_layout.tsx`:
- Wrap everything with AuthProvider
- If loading: show a plain splash (white screen, no spinner)
- If no session: redirect to /(auth)/sign-in
- If session + no onboarding_answers row: redirect to /(onboarding)/index
- If session + onboarding complete: redirect to /(tabs)/index
- Check onboarding completion by querying onboarding_answers for the current user_id

--- CONSTRAINTS ---
- No biometrics, no magic link, no phone auth — only the three options above
- Do not build any tab screens yet — /(tabs)/index can stay as a placeholder
- Do not modify the schema or types files
- Apple Sign In is required by App Store rules since we offer Google — do not remove it
- All Supabase calls go through lib/supabase.ts — no direct fetch calls

--- REPORT BACK ---
- Every file created or modified
- Confirm navigation logic works for all three states (no session / session + no onboarding / session + onboarding done)
- Any // HUMAN INPUT NEEDED: items
```

---

## Phase 3 — Onboarding Screens

**Cursor prompt:**

```
Context: @PRD.md @DECISIONS.md @.cursor/rules/project.mdc @types/database.ts @lib/supabase.ts @context/AuthContext.tsx @constants/colors.ts

Goal: Build the complete onboarding flow — 6 question screens, 3 interstitial screens, program match screen. Store answers in Supabase at the end. Use warm UI from colors.ts throughout.

--- SHARED COMPONENTS ---

Create `components/onboarding/OptionCard.tsx`:
- Tappable card, rounded corners, border
- Unselected: border colors.textSecondary, background white
- Selected: border + background tint of colors.primary
- Props: label, selected, onPress

Create `components/onboarding/ProgressBar.tsx`:
- Thin bar at top of screen
- Props: current (1–10), total (10)
- Filled portion in colors.primary

Create `components/onboarding/ContinueButton.tsx`:
- Full-width button, colors.primary background, white text
- Props: label (default "Continue"), onPress, disabled

--- ONBOARDING CONTEXT ---

Create `context/OnboardingContext.tsx`:
- Stores all 6 answers as state (types from types/database.ts OnboardingAnswers)
- setAnswer(field, value) updater
- Wrap app/_layout.tsx with OnboardingProvider

--- SCREENS ---

All screens: colors.background, safe area padding, ProgressBar at top, ContinueButton at bottom.

`app/(onboarding)/index.tsx` — Welcome
- App logo placeholder (rounded square, colors.primary)
- "Remedy" in large bold type
- "Your back pain, finally fixed." subtitle
- "Get Started" ContinueButton
- No progress bar on this screen

`app/(onboarding)/q1.tsx` — Step 1/10
- Heading: "Where is your back pain?"
- OptionCards: "Upper back" / "Middle back" / "Lower back" / "All over"
- Saves to painLocation

`app/(onboarding)/interstitial1.tsx` — Step 2/10
- Large "80%" in colors.primary (72px bold)
- Body: "of adults experience back pain at some point. Most never get a structured plan."
- Continue button

`app/(onboarding)/q2.tsx` — Step 3/10
- Heading: "How long have you had it?"
- OptionCards: "Less than 2 weeks" / "2 weeks – 3 months" / "3+ months"
- Saves to painDuration as 'acute' | 'subacute' | 'chronic'

`app/(onboarding)/interstitial2.tsx` — Step 4/10
- Heading: "A structured plan changes everything."
- Two static bars side by side (View with set heights):
  - "Without a plan" — tall bar, colors.textSecondary, 60% less pain label
  - "With Remedy" — shorter bar, colors.primary, 40% pain label
- Caption: "Users on a structured program report 60% less pain in 4 weeks."

`app/(onboarding)/q3.tsx` — Step 5/10
- Heading: "How would you describe it?"
- OptionCards: "Stiffness" / "Dull ache" / "Sharp pain" / "Multiple types"
- If "Sharp pain" selected AND painDuration === 'acute': show warning text below cards in colors.warning: "This sounds like it could be acute. We recommend seeing a doctor first — you can still continue."
- Saves to painType

`app/(onboarding)/q4.tsx` — Step 6/10
- Heading: "What's your activity level?"
- OptionCards: "Sedentary (desk job)" / "Lightly active" / "Regular gym-goer" / "Athlete or powerlifter"
- Saves to activityLevel as 'sedentary' | 'light' | 'active' | 'athlete'

`app/(onboarding)/interstitial3.tsx` — Step 7/10
- Heading: "Save over $1,000"
- Two comparison rows in a card:
  - "Average PT program" → "$1,200+"
  - "Remedy" → "$131/year"
- Both rows side by side with labels and values
- Background card: colors.surface with soft shadow

`app/(onboarding)/q5.tsx` — Step 8/10
- Heading: "What makes your pain worse?"
- OptionCards: "Sitting too long" / "Bending forward" / "Standing" / "Morning stiffness" / "Exercise"
- Saves to painTrigger

`app/(onboarding)/q6.tsx` — Step 9/10
- Heading: "What's your main goal?"
- OptionCards: "Reduce daily pain" / "Get back to working out" / "Sleep better" / "Improve mobility"
- Saves to mainGoal as 'reduce_pain' | 'return_to_exercise' | 'sleep' | 'mobility'

`app/(onboarding)/match.tsx` — Step 10/10
- Heading: "Your Program"
- Large card showing:
  - Program name: "Back Pain Relief Program"
  - Duration: "5 weeks · 4 sessions/week · ~20 min"
  - Description: one sentence based on activityLevel from context (e.g. athlete gets "Built for active people returning to training")
  - Placeholder program image (colored rectangle, colors.primary)
- "Start My Free Trial" button → navigates to /(auth)/sign-in (paywall comes in Phase 4)

--- SAVING TO SUPABASE ---

On match.tsx "Start My Free Trial" press, before navigating:
- Insert a row into onboarding_answers using the current user from AuthContext and all answers from OnboardingContext
- If insert fails, show a simple inline error and do not navigate
- If insert succeeds, navigate to /(auth)/sign-in

--- CONSTRAINTS ---
- No animations yet — static screens only
- No hardcoded hex values — use colors.ts only
- Do not modify schema, auth, or tab screens
- If user navigates back, answers should persist in OnboardingContext
- Do not add a back button to interstitial screens (forward-only flow)

--- REPORT BACK ---
- Every file created or modified
- Confirm onboarding answers are saved to Supabase on completion
- Any // HUMAN INPUT NEEDED: items
```

---

## Phase 4 — Paywall (Superwall + Apple IAP)

**Cursor prompt:**

```
Context: @PRD.md @DECISIONS.md @.cursor/rules/project.mdc @types/database.ts @lib/supabase.ts @context/AuthContext.tsx

Goal: Integrate Superwall for paywall UI and Apple IAP/StoreKit for subscription processing. Verify purchases server-side and write entitlements to Supabase. iOS only.

--- INSTALL ---
Ask me to confirm before installing:
- @superwall/react-native-superwall
- react-native-purchases (RevenueCat SDK for StoreKit — used only as a StoreKit bridge, NOT for entitlement management)

Wait — do not use RevenueCat for entitlements. Only use it as a StoreKit purchase bridge if needed. Check if Superwall has its own purchase handler first and use that. Output // HUMAN INPUT NEEDED: if unclear.

--- IAP PRODUCT IDS ---
- Monthly: com.remedyapp.monthly
- Annual: com.remedyapp.annual

--- SUPERWALL SETUP ---

Create `lib/superwall.ts`:
- Initialize Superwall with API key from EXPO_PUBLIC_SUPERWALL_API_KEY env var
- Configure purchase handler to process Apple IAP
- On successful purchase: call a Supabase Edge Function to verify and grant entitlement (see below)

--- EDGE FUNCTION ---

Create `supabase/functions/verify-purchase/index.ts`:
- Accepts: { userId, transactionId, productId, idempotencyKey }
- Verify the Apple receipt/transaction server-side using Apple's verifyReceipt or StoreKit 2 API
- If valid:
  - Upsert entitlements row: is_premium=true, subscription_status='active' or 'trial', product_id, expires_at
  - Insert a billing_events row with the idempotency_key (ignore duplicate inserts — idempotency_key is UNIQUE)
- Return { success: true, entitlement: { is_premium, subscription_status, expires_at } }
- If invalid: return { success: false, error: 'invalid_receipt' }
- Output // HUMAN INPUT NEEDED: for the exact Apple verification endpoint — StoreKit 2 vs legacy varies

--- EDGE FUNCTION: restore-purchases ---

Create `supabase/functions/restore-purchases/index.ts`:
- Accepts: { userId, originalTransactionId }
- Re-verify with Apple and re-grant entitlement if still valid
- Same idempotency pattern as above

--- ENTITLEMENT CHECK ---

Create `lib/entitlements.ts`:
- getEntitlement(userId): queries entitlements table for current user, returns the row
- isPremium(userId): returns boolean
- Used by the tab navigator to gate premium screens

--- NAVIGATION UPDATE ---

Update `app/_layout.tsx`:
- After onboarding is complete, check entitlements
- If not premium: show Superwall paywall before going to tabs
- If premium: go straight to tabs

--- CONSTRAINTS ---
- Entitlement source of truth is always Supabase — never trust client-side Superwall state for access decisions
- No Stripe, no web checkout
- Restore purchases must work
- Do not hardcode Apple API keys — use Supabase secrets (set via Supabase dashboard)
- Do not modify onboarding or auth screens

--- REPORT BACK ---
- Every file created or modified
- Confirm edge function handles duplicate idempotency_key gracefully
- Any // HUMAN INPUT NEEDED: items
```

---

## Phase 5 — Home Screen + Session Player

**Cursor prompt:**

```
Context: @PRD.md @DECISIONS.md @.cursor/rules/project.mdc @types/database.ts @lib/supabase.ts @context/AuthContext.tsx @constants/colors.ts

Goal: Build the home screen and session player. Videos are placeholders — no Cloudflare Stream yet. Use expo-av for video playback.

--- SEED DATA ---

Create `supabase/migrations/002_seed_data.sql`:
- Insert 1 program: "Back Pain Relief Program", 5 weeks, 4 sessions/week
- Insert 4 sessions for week 1 (program_sessions)
- Insert 5 placeholder exercises with video_url = null
- Insert session_exercises linking exercises to sessions in order

--- HOME SCREEN: app/(tabs)/index.tsx ---

Layout (warm, clean):
- Header: "Good morning, [first name]" or "Good morning" if no name
- Today's session card:
  - Session title (e.g. "Week 1 · Session 2")
  - Duration and exercise count
  - "Start Session" button (colors.primary)
  - If rest day: show "Rest Day" card with a brief tip
- Streak row: flame icon + "X day streak"
- Program progress bar: "Week 2 of 5"
- Pain summary if data exists: "Your pain is trending down" with average score

Data fetching:
- Query user_programs to get current week/session
- Query program_sessions + session_exercises for today's session
- Query session_completions for streak calculation (consecutive days)
- Query pain_checkins for pain trend (last 7 days average)

--- SESSION PLAYER: app/session/[id].tsx ---

Full-screen player flow:
1. Pain check-in screen before session starts:
   - "How is your pain right now?" 
   - 1–10 slider (warm colored)
   - "Begin Session" button
   - Insert pain_checkin row (type: 'before')

2. Exercise screens (one at a time):
   - Video placeholder: if video_url is null, show a colored rectangle (colors.primary, 16:9 ratio) with exercise name centered in white text
   - If video_url exists: play with expo-av, muted autoplay, loop
   - Below video: exercise name (large), sets × reps or duration
   - Rest timer between exercises (countdown, auto-advances)
   - "Skip rest" button
   - Progress indicator: "Exercise 3 of 5"
   - Pause button top right

3. Completion screen:
   - "Session Complete!" 
   - Duration taken
   - Pain check-in: same 1–10 slider (type: 'after')
   - "Done" button → insert session_completions row, update user_programs current_session, navigate home

--- STREAK LOGIC ---

A streak increments when a session_completions row is inserted for a new calendar day.
If no session completed today but one was completed yesterday, streak is maintained.
If last completion was 2+ days ago, streak resets to 0.
Calculate streak in a helper function `lib/streak.ts` — query session_completions ordered by completed_at.

--- CONSTRAINTS ---
- No real video URLs — placeholder rectangle only until Phase 7
- Do not touch auth, onboarding, or paywall files
- All DB queries through lib/supabase.ts
- No loading spinners — use skeleton loaders (gray animated rectangles as placeholders while data loads)

--- REPORT BACK ---
- Every file created or modified
- Confirm session completion writes to session_completions and updates user_programs
- Confirm pain check-ins write before and after
- Any // HUMAN INPUT NEEDED: items
```

---

## Phase 6 — Progress Screen

**Cursor prompt:**

```
Context: @PRD.md @DECISIONS.md @.cursor/rules/project.mdc @types/database.ts @lib/supabase.ts @context/AuthContext.tsx @constants/colors.ts @lib/streak.ts

Goal: Build the progress screen showing pain trend, streak, weekly completion, and program progress.

--- SCREEN: app/(tabs)/progress.tsx ---

Sections (scrollable):

1. Pain trend chart:
   - Line chart: x-axis = last 14 days, y-axis = pain score 1–10
   - Two lines: "Before session" (lighter) and "After session" (colors.primary)
   - Use react-native-gifted-charts or Victory Native — ask me to confirm install before adding
   - If fewer than 3 data points: show "Complete more sessions to see your trend" placeholder

2. Streak card:
   - Current streak (large number)
   - "X sessions completed total"

3. Weekly completion:
   - 7 circles representing the week (Mon–Sun)
   - Filled = session completed that day (colors.primary), empty = no session
   - "X/4 sessions this week" below

4. Program progress:
   - "Week X of 5" progress bar
   - Estimated completion date

Data: query pain_checkins, session_completions for current user. All client-side queries.

--- CONSTRAINTS ---
- No new packages without asking first
- Do not touch other screens
- Skeleton loaders while data loads, not spinners

--- REPORT BACK ---
- Every file created or modified
- Any // HUMAN INPUT NEEDED: items
```

---

## Phase 7 — Push Notifications + Cloudflare Stream Videos

**Cursor prompt:**

```
Context: @PRD.md @DECISIONS.md @.cursor/rules/project.mdc @lib/supabase.ts @constants/colors.ts

Goal: Two things — wire up daily push notification reminders, and swap placeholder videos for Cloudflare Stream HLS URLs.

--- PUSH NOTIFICATIONS ---

Install (confirm first): expo-notifications

Create `lib/notifications.ts`:
- requestPermissions(): asks for notification permission, stores Expo push token to profiles table (add push_token text column via migration 003)
- scheduleDailyReminder(hour, minute): schedules a local daily notification "Time for your Remedy session 💪"
- cancelReminders(): cancels all scheduled notifications

On home screen mount: call requestPermissions() if no push_token on profile yet.

Add a simple notification preference to app/(tabs)/profile.tsx:
- Toggle "Daily reminder" on/off
- Time picker for reminder time (default 8:00 AM)
- Calls scheduleDailyReminder or cancelReminders

--- CLOUDFLARE STREAM ---

Create `supabase/functions/get-video-url/index.ts`:
- Accepts: { exerciseId }
- Looks up exercise in DB, gets cloudflare_stream_id
- Returns a signed HLS URL using Cloudflare Stream API (key from Supabase secrets)
- Cache the signed URL for 1 hour (signed URLs expire — use a reasonable TTL)

Add cloudflare_stream_id text column to exercises table (migration 003).

Update session player:
- If exercise has a cloudflare_stream_id: fetch signed URL from get-video-url edge function, play with expo-av using the HLS URI
- If no cloudflare_stream_id: keep the existing placeholder rectangle
- Graceful fallback: if URL fetch fails, show placeholder + "Video unavailable" text + retry button

--- CONSTRAINTS ---
- Cloudflare API key never in the app bundle — edge function only
- Do not change any screen layouts
- Placeholder fallback must remain working for exercises with no video

--- REPORT BACK ---
- Every file created or modified
- Confirm signed URL is fetched server-side, not client-side
- Any // HUMAN INPUT NEEDED: items
```

---

## Notes for using this doc

- Feed one phase at a time. Do not skip ahead.
- After each phase: test on Expo Go before proceeding.
- If Cursor outputs `// HUMAN INPUT NEEDED:` — bring it here and we'll resolve it before continuing.
- If a phase output looks wrong or confusing — paste it here and we'll debug before moving on.
- Minor scope questions mid-phase: make a note and resolve after the phase completes, not during.
