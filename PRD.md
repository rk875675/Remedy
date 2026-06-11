# Remedy — Product Requirements Document
**Version:** 0.3 (MVP)
**Last updated:** May 13, 2026
**Status:** Draft

---

## ⚠️ Cursor / AI Coding Rules

These rules apply to every prompt sent to Cursor. They are non-negotiable.

1. **Do not invent features.** Only build what is explicitly described in this PRD. If something is unclear, output a `// HUMAN INPUT NEEDED:` comment and stop.
2. **Do not modify working code** unless the prompt explicitly says to. If a fix requires touching something outside the stated scope, flag it and ask.
3. **Do not install new dependencies** without confirming first. List what you'd add and why, then wait.
4. **Minimal diffs only.** Change the least amount of code needed to accomplish the goal. No refactors unless asked.
5. **No placeholders replaced with real implementations** unless explicitly instructed. Placeholder videos, mock data, and stub functions stay as-is until told otherwise.
6. **Flag ambiguity, don't guess.** If the PRD doesn't cover a case, say so — don't invent behavior.
7. **Protect existing functionality.** Never change a working screen or flow as a side effect of building something new.

---

## 1. Vision

Remedy is a consumer mobile app that helps anyone with back pain — from desk workers to powerlifters to retirees — relieve and recover through structured, video-guided exercise programs personalized to their situation. The experience is clean, premium, and built around real PT expertise. It sits in the space between "Google a YouTube video" and "pay $200/hr for a PT session."

V1 is back pain only. Neck, shoulder, hip, and other areas come later.

---

## 2. The Problem

People with back pain have two bad options:
- **Too vague:** YouTube videos, Reddit posts, generic stretching guides. No structure, no progression, no accountability.
- **Too expensive/inaccessible:** In-person PT. Most people can't afford it, can't access it, or don't know when they actually need it.

There's no consumer product that gives them a real, structured program — the kind a PT would actually prescribe — in a beautiful, easy-to-use app that works whether you're 60 years old with chronic stiffness or a 28-year-old athlete who tweaked their back at the gym.

---

## 3. Target User

**Primary:** Anyone with back pain. The app is designed to serve the full spectrum through onboarding-driven personalization:

| Persona | Profile | Program focus |
|---------|---------|---------------|
| Desk worker | 30s–40s, sedentary, chronic lower back ache | Mobility, posture, core stability |
| Older adult | 55+, stiffness, limited mobility, cautious | Gentle movement, low-impact |
| Parent / active adult | 35–50, occasional flare-ups, time-constrained | Short sessions, maintenance |
| Gym-goer / athlete | 20s–30s, training-related pain, wants to stay active | Strength-based rehab, return to lifting |
| Powerlifter / serious athlete | Specific movement dysfunction, high body awareness | Performance-focused rehab |

**Not the target:** Acute injury patients who need in-person diagnosis (safety gate handles this in onboarding).

**User mindset:** "I know I should be doing something about this. I just don't know what, and I don't want to make it worse."

**Key design constraint:** The program content and UX must feel appropriate across all personas. Personalization happens through onboarding routing — not by building separate apps for each group.

---

## 4. MVP Scope

### In scope (V1)
- Onboarding questionnaire with interstitial stats/insight screens
- Back pain program only (4–6 weeks, personalized by onboarding answers)
- Video session player (placeholder videos during development)
- Daily session tracking
- Pain check-in (before/after each session)
- Paywall + subscription (monthly + annual)

### Out of scope (V2+)
- Neck, shoulder, hip, knee pain programs
- AI-adaptive programming
- Live coaching or messaging
- Computer vision / form feedback
- Community / social features
- Wearable integration
- Employer / insurance partnerships
- Avatar / animated guide character

---

## 5. User Flow

### Onboarding
Onboarding alternates between questions and interstitial insight screens. The goal is to make it feel like a valuable experience — not a survey. Each interstitial uses the answers so far to show something relevant (stats, social proof, a cost comparison). Progress bar visible throughout.

**Screen flow:**

1. **Welcome** — App name, tagline, CTA ("Get Started")
2. **Q1: Where is your back pain?** — Upper / Middle / Lower / All over
3. **Interstitial: Social proof stat** — e.g. *"80% of adults experience back pain at some point. Most never get a structured plan."* (animated stat graphic)
4. **Q2: How long have you had it?** — Less than 2 weeks / 2 weeks–3 months / 3+ months
5. **Interstitial: Pain reduction graph** — e.g. *"People on a structured program report 60% less pain in 4 weeks."* (simple line graph, warm design)
6. **Q3: How would you describe it?** — Stiffness / Dull ache / Sharp pain / Multiple
   - *Safety gate triggers here if "Sharp pain" + "< 2 weeks": soft warning before continuing*
7. **Q4: What's your activity level?** — Sedentary (desk job) / Lightly active / Regular gym-goer / Athlete or powerlifter
8. **Interstitial: Money saved** — *"The average PT recovery program costs $1,200+. Remedy costs less than one session."* (cost comparison visual)
9. **Q5: What makes it worse?** — Sitting too long / Bending / Standing / Morning stiffness / Exercise
10. **Q6: What's your main goal?** — Reduce daily pain / Get back to working out / Sleep better / Improve mobility
11. **Program match screen** — Personalized program summary based on all answers, with brief description of approach
12. **Paywall** — 7-day free trial, then $12.99/month or $79.99/year
13. **Sign up** — Apple / Google / Email (after paywall, so user is committed before creating account)
14. **Home / dashboard**

### Core Loop (Daily)
1. Open app → see today's session on home screen
2. Tap "Start Session" → session player launches
3. Session player: one exercise at a time, video + timer + rep/set guide
4. End of session: pain check-in (1–10 slider, before vs after)
5. Completion screen → next session preview

---

## 6. Core Features

### 6.1 Authentication
- Three sign-up options: **Sign in with Apple**, **Sign in with Google**, **Email + password**
- Shown after paywall — user sees the value and commits before creating an account
- All three handled via Supabase Auth (native Apple/Google OAuth + email provider)
- Apple Sign In is required by App Store if any other social login is offered
- Email option: standard email + password, with email verification via Resend
- No username creation — display name pulled from Apple/Google profile or set from email

### 6.2 Onboarding Questionnaire
- 6 questions + 3 interstitial insight screens (see §5 for full flow)
- One screen at a time, progress bar at top
- Interstitials show stats, graphs, or cost comparisons relevant to answers so far — makes it feel like the app is giving value, not extracting data
- Answers collectively route user to a personalized program variant
- Safety gate: "Sharp pain" + "< 2 weeks" → soft warning before proceeding
- All onboarding answers stored to user profile for future personalization

### 6.3 Programs
- **V1: Back pain only.** One core program with variants based on onboarding answers (activity level + pain type drive the variant)
- Each program: 4–6 weeks, 3–5 sessions/week, ~15–20 min per session
- Each session: 4–7 exercises with video, sets/reps or duration, rest time
- Programs structured with progressive difficulty (Week 1 = foundational, Week 4+ = strengthening/loading)
- Program designed and recorded by licensed PT partner
- **During development: placeholder videos only** (static image or looping placeholder clip). Real videos added when PT partner content is ready. No fake exercise videos — clearly marked as placeholder in code and UI.

### 6.4 Session Player
- Full-screen video for each exercise
- Exercise name + sets/reps or timer displayed clearly
- "Pause" and "Skip" controls
- Rest timer between exercises
- Auto-advances to next exercise
- Exit mid-session saves progress

### 6.5 Pain Check-In
- Simple 1–10 slider: "How is your pain right now?"
- Captured before session starts and after session ends
- Stored per session for progress view later

### 6.6 Progress Tracking
- Weekly completion (e.g., "3/4 sessions this week")
- Pain trend graph (average pain score over time)
- Program progress bar (Week 2 of 5)

### 6.7 Home Screen
- Today's session card (or rest day indicator)
- Quick pain summary ("Your pain is trending down 📉")
- Program progress

### 6.8 Paywall + Subscription
- 7-day free trial (full access)
- $12.99/month
- $79.99/year (~$6.67/month, save 49%)
- Paywall UI + A/B experiments managed via **Superwall**
- Subscriptions processed via **Apple IAP / StoreKit** (iOS-first)
- No Stripe, no web checkout, no external purchase links for in-app premium unlocks
- Users can access: onboarding + first session for free before hitting paywall

---

## 7. UI & Design System

### Color Palette (Warm, Premium)
| Role | Color | Notes |
|------|-------|-------|
| Background | Warm cream / off-white (`#FAF7F4`) | Never pure white |
| Primary accent | Terracotta / warm coral (`#C4614A`) | CTAs, active states |
| Secondary accent | Warm sage green (`#7A9E7E`) | Progress, positive states |
| Surface / cards | Warm white (`#FFFFFF`) with soft shadow | Slight warmth, not clinical |
| Text primary | Dark warm gray (`#1C1C1E`) | Not pure black |
| Text secondary | Medium warm gray (`#6B6B6B`) | Subtext, labels |
| Destructive / warning | Soft amber (`#E5A020`) | Safety gate, caution states |

### Design Principles
- **Warm and premium, not clinical.** Feels like a wellness app, not a hospital portal.
- **Spacious layouts.** Generous padding, nothing cramped.
- **Rounded corners throughout.** Cards, buttons, inputs — consistent radius.
- **Soft shadows** on cards — depth without harsh borders.
- **Large, readable text.** Accessible across all age groups (minimum 16px body).
- **No avatar / mascot.** Clean human-focused design instead. (Deferred to V2+.)
- **Skeleton loaders** over spinners for loading states.
- **Animations: subtle and purposeful.** Onboarding transitions, completion celebrations — nothing gratuitous.

### Onboarding-specific UI
- Interstitial screens use **warm illustrated graphics or simple animated charts** — not stock photos
- Stats displayed large and bold (e.g. "80%" in big type, supporting text below)
- Consistent warm gradient or card background on interstitials to visually distinguish from question screens

---

## 8. Content Strategy

### PT Partner Model
- Partner with one licensed PT (ideally a creator with existing audience)
- Structure: equity stake in company (3–8%) + revenue share if they also market/distribute
- They design the programs, appear on camera, provide clinical credibility
- All content filmed once, owned by the company
- Content format: short exercise videos (30–90 seconds each), clean background, clear demo of movement with cues

### Content Specs (V1)
- ~40–60 total exercise videos across both programs
- Each video: PT on camera, clear form demo, 1–2 verbal cues, no talking head intro/outro
- Simple, clean production — good lighting, neutral background, no fancy editing needed
- Voiceover or on-screen text for key cues (e.g., "Keep your core engaged")

---

## 8. Legal & Compliance

- Position as a **fitness and wellness app**, not a medical device or treatment
- No claims of "treating," "curing," or "diagnosing" conditions
- Mandatory disclaimer on onboarding: *"Remedy is not a substitute for professional medical advice. Consult a doctor or physical therapist if you have a serious injury or medical condition."*
- Safety gate in onboarding for acute pain signals (see Section 5)
- Terms of Service and Privacy Policy required at signup
- Recommend a one-time review by a health law attorney before launch (~$500–1,500)
- All content created by a licensed PT — include their credentials in the app

---

## 9. Monetization

| Plan | Price | Notes |
|------|-------|-------|
| Monthly | $12.99/month | After 7-day free trial |
| Annual | $79.99/year | ~$6.67/month, save 49% |

- Paywall UI and experiments: **Superwall** (on-device paywall/entitlement UX layer)
- Subscription processing: **Apple IAP / StoreKit** (iOS-first)
- Billing source of truth: backend (Supabase) — entitlements verified server-side, not trusted from client
- No Stripe, no web checkout, no external purchase links for unlocking premium in-app
- Restore purchases must be supported (App Store requirement)
- Free trial requires no payment upfront on iOS (standard App Store trial)
- Goal: push users toward annual plan (higher LTV, lower churn)
- Show annual savings prominently on paywall
- Idempotency keys on all billing-adjacent mutations to prevent duplicate grants

---

## 10. Success Metrics (V1)

| Metric | Target (Month 3) |
|--------|-----------------|
| Downloads | 1,000+ |
| Trial → Paid conversion | > 25% |
| Day 7 retention | > 40% |
| Day 30 retention | > 20% |
| Avg pain score improvement | > 1.5 points over 4 weeks |
| Monthly revenue | $3,000+ MRR |

---

## 11. Tech Stack (Locked)

| Layer | Choice |
|-------|--------|
| Mobile app | React Native + Expo (iOS-first) |
| Local dev / testing | Expo Go |
| Auth / DB / backend | Supabase (auth, database, edge functions) |
| Rate limiting | Upstash Redis |
| Paywall / experiments | Superwall |
| iOS subscriptions | Apple IAP / StoreKit |
| Analytics | PostHog |
| Email (transactional) | Resend |
| Push notifications | Expo Notifications |
| Video hosting (dev) | Supabase Storage (placeholder videos only) |
| Video hosting (prod) | Cloudflare Stream (HLS, adaptive bitrate, auto-transcode) |

### App Identifiers
- **Bundle ID:** `com.remedyapp.ios`
- **IAP Product IDs:** `com.remedyapp.monthly`, `com.remedyapp.annual`

---

## 12. Architecture Principles (Non-Negotiable)

These govern every backend and client decision. When in doubt, default to these.

**Thin client, server-authoritative backend.** Entitlements, access gates, usage, quotas, and account state live on the server. The client never defines protected state.

**No direct client calls to sensitive third parties.** All sensitive flows go: App → Supabase Edge Function → third party. Keys stay off-device. Failures are centralized.

**Graceful degraded modes.** App must handle: normal / degraded / stale / quota-hit / upstream failure / auth failure / premium-gated / abuse-limited. Never brittle all-or-nothing.

**Atomic multi-step mutations.** Granting access, logging usage, billing events — one backend operation, never split client steps that can fail halfway.

**Event history, not just snapshots.** Entitlements, usage, refunds, quota resets: reconstructable timeline. Needed for support, abuse review, analytics.

**Rollback-friendly changes.** Small scoped commits, obvious revert paths, clean git tree before risky changes.

**Idempotency on mutations.** Idempotency keys + replay-safe responses + dedupe at storage layer for all billing-adjacent and protected mutations.

**RLS at the DB layer.** User data protected by Row Level Security policies. No trusting client-supplied user IDs for authorization. Sensitive tables have no unsafe direct client writes.

---

## 13. Open Questions

- [ ] PT partner identified and deal terms agreed?
- [ ] Content production timeline and budget?
- [ ] iOS-first launch confirmed? (Android later)
- [ ] App Store Connect account set up?
- [ ] Health law attorney review scheduled?
- [x] Paywall placement — end of onboarding, after program match screen ✓
- [ ] What happens when a user completes the full program? (Loop it? Unlock next level?)
- [x] Video hosting — Cloudflare Stream for production, Supabase Storage for dev placeholders ✓
- [x] Bundle ID — confirmed as `com.remedyapp.ios`

---

## 14. Launch Checklist (Pre-Launch)

- [ ] PT partner signed
- [ ] All exercise videos filmed and edited
- [ ] Onboarding questionnaire built and tested
- [ ] Both programs fully loaded into app
- [ ] Session player working end-to-end
- [ ] Apple IAP / StoreKit configured and sandbox-tested
- [ ] Superwall paywall configured and tested
- [ ] Supabase RLS policies applied to all tables
- [ ] Upstash Redis rate limiting live on all public endpoints
- [ ] Legal disclaimer + ToS + Privacy Policy live
- [ ] App Store listing (screenshots, description, keywords)
- [ ] Expo Go testing complete; TestFlight beta with 10–20 real users
- [ ] Attorney review of disclaimers and marketing copy
- [ ] PostHog events wired: onboarding completion, paywall view, trial start, conversion, session complete, pain check-in
