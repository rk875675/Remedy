# Remedy — Problems & Solutions Reference
*Quick-reference for every major decision made during product design. Use this before adding new features or making architectural changes.*

---

## 1. Legal exposure — offering PT/rehab content without a PT license

**Problem:** Providing structured rehab programs could be seen as practicing physical therapy, creating liability and potential App Store rejection.

**Solution:**
- Position as a **fitness and wellness app**, not a medical treatment or device
- Language: use "relieve," "reduce," "strengthen," "guide" — never "treat," "cure," "diagnose," "rehabilitate"
- Mandatory disclaimer on onboarding screen and in ToS: *"Remedy is not a substitute for professional medical advice."*
- Safety gate in onboarding: if user reports sharp pain + < 2 weeks + no doctor visit → show soft warning before continuing
- All content created and performed by a licensed PT (credentials displayed in app)
- One-time health law attorney review of disclaimers + marketing copy before launch (~$500–1,500)

---

## 2. Subscription enforcement — preventing client-side entitlement spoofing

**Problem:** If the client controls whether a user is "premium," it can be bypassed (jailbreak, modified app, etc.).

**Solution:**
- Backend (Supabase) is the **source of truth** for entitlements — always
- Apple IAP receipt/transaction verified server-side via Supabase Edge Function before granting access
- Superwall handles the on-device paywall UI only; it is not trusted for access decisions
- Client receives an entitlement token from the server after verified purchase; server re-validates on sensitive actions
- Restore purchases flow re-verifies with Apple server-side before re-granting access

---

## 3. API abuse and rate limiting

**Problem:** Public endpoints (auth, onboarding submission, session tracking) can be hammered — bots, scrapers, abuse.

**Solution:**
- **Upstash Redis** for rate limiting on all public endpoints
- Rate limit by: IP (unauthenticated), user ID (authenticated), endpoint class (tighter on writes and sensitive routes)
- Return `429` with stable error codes + `Retry-After` header (no client retry storms)
- Log all rate limit hits to PostHog for monitoring
- Alert on spikes in 429s, validation failures, suspicious retry patterns

---

## 4. Billing edge cases — duplicate grants, failed webhooks, refunds

**Problem:** A purchase confirmation can arrive twice, a webhook can fail mid-flight, or a refund can leave a user in a bad state.

**Solution:**
- **Idempotency keys** on all billing-adjacent mutations (grant access, usage log, quota reset)
- Replay-safe responses + dedupe at the storage layer
- Billing events stored as an **event log** (not just current state snapshot) — reconstructable timeline for support and refund handling
- Entitlement revocation on confirmed refund (via Apple server-to-server notifications)

---

## 5. Content acquisition at low cost / fast timeline

**Problem:** Building 40–60 PT exercise videos in-house is expensive and slow. Hiring a random freelancer risks quality and credibility.

**Solution:**
- Partner with one **licensed PT** (ideally a creator with existing audience)
- Deal structure: equity stake (3–8%) + revenue share if they also handle marketing/distribution
- They design the programs, appear on camera, provide clinical credibility
- Company owns all content (IP assigned in contract)
- Production kept simple: good lighting, neutral background, no complex editing needed
- ~40–60 short videos (30–90 sec each) covers both V1 programs

---

## 6. Personalization without AI complexity

**Problem:** Users expect a personalized experience, but building adaptive AI programs is months of work and easy to get wrong.

**Solution:**
- Short onboarding questionnaire (5–6 questions) routes user to one of two pre-built programs
- Programs cover the real branches: pain location (back vs neck), duration, severity
- "Personalization" comes from the routing, not runtime adaptation
- V2 can add adaptive logic once we have real user data on what questions predict outcomes

---

## 7. User retention — keeping users coming back daily

**Problem:** Health apps have notoriously bad retention. Users open once and forget.

**Solution:**
- **Pain trending** — show users their pain score improving over time ("Your pain is down 2 points this week")
- **Structured weekly schedule** — app tells you exactly what to do today, no decision fatigue
- Push notifications at user's preferred time ("Time for your session")
- Completion screen with positive reinforcement after every session
- Program progress bar ("Week 3 of 5") creates commitment to finish

---

## 8. Session state — what happens if user exits mid-session

**Problem:** User starts a session, gets interrupted, comes back — do they restart or resume?

**Solution:**
- Mid-session exit saves progress (which exercise they were on)
- Cold start does **not** auto-resume the session — user must tap "Continue Session" intentionally
- Session pauses automatically if app goes to background
- If app is killed mid-session, partial completion is not counted as a full session

---

## 9. Video delivery — reliability and cost

**Problem:** Hosting 40–60 videos needs a reliable streaming solution. Supabase Storage can serve video files but has no adaptive bitrate, no transcoding, and charges egress per GB at scale.

**Decision: Supabase Storage for dev, Cloudflare Stream for production.**

**Why not Supabase-only for production:**
- No adaptive bitrate streaming — one fixed quality, buffers on slow connections
- No automatic transcoding — you'd have to manually encode every video for every device format
- Egress costs grow with scale; not optimized for video delivery

**Why Cloudflare Stream over Mux:**
- Cheaper at V1 scale (~$0.50/month storage for 40–60 short clips, pennies per view)
- Cloudflare's global CDN — fast everywhere
- Auto-transcodes on upload, serves HLS
- No dedicated React Native SDK needed — just use the HLS URL with `expo-av` or `react-native-video`
- Mux is more full-featured but overkill and more expensive for this use case

**Why Supabase Storage is fine for dev:**
- Placeholder videos are small, low-traffic, internal use only
- Zero extra setup — already have Supabase
- Switch to Cloudflare Stream when real PT content is ready

**Implementation:**
- Dev: upload placeholder MP4s to Supabase Storage, serve via public or signed URL directly
- Prod: upload PT videos to Cloudflare Stream, serve HLS URLs via Supabase Edge Function (keeps Cloudflare credentials off the client)
- Player: `expo-av` with the HLS URL — same component in both environments, just swap the URL source
- Graceful fallback: if video fails to load, show exercise name + written instructions + retry button

---

## 10. Data security — user data and DB access

**Problem:** Supabase gives direct client access to the DB by default, which is dangerous if RLS isn't configured properly.

**Solution:**
- **Row Level Security (RLS)** enabled on every table from day one
- Users can only read/write their own data — ownership enforced at DB layer
- No client-supplied user IDs trusted for authorization (always use auth context)
- Sensitive tables (entitlements, billing events, audit logs) have no direct client write access — routed through Edge Functions only
- Service role key is **backend-only**, never in the app bundle
- Dev / staging / prod environments separated with separate Supabase projects

---

## 11. Analytics — knowing what's working without over-engineering

**Problem:** Need to understand the full funnel (onboarding → trial → paid → retained) without building custom dashboards from scratch.

**Solution:**
- **PostHog** for product analytics — self-hostable, generous free tier, good funnel + retention views
- Key events to track from day one:
  - `onboarding_started`, `onboarding_completed`, `question_answered` (with question + answer)
  - `program_matched`
  - `paywall_viewed`, `trial_started`, `subscription_converted`, `subscription_cancelled`
  - `session_started`, `session_completed`, `session_abandoned`
  - `pain_checkin_submitted` (with before/after values)
- Alert on: paywall view → trial drop-off, session abandonment spikes

---

## 12. Paywall placement — when to show the gate

**Problem:** Too early = users don't understand the value. Too late = they never see the paywall.

**Solution (current decision):** Show paywall after program match screen — user has completed the questionnaire and seen their personalized program, so they understand what they're paying for. First session is accessible before the paywall to let them experience the product.

*This is an open question — Superwall A/B testing will validate the right moment post-launch.*

---

## 13. iOS-first vs cross-platform launch

**Problem:** Building for Android too adds QA time and delays launch.

**Solution:**
- iOS-first launch
- React Native + Expo codebase is cross-platform from the start — Android comes later with minimal re-work
- Apple IAP / StoreKit for subscriptions on iOS; Google Play Billing added for Android launch
- No Stripe / web checkout at V1 (App Store rule compliance + simplicity)

---

## 14. Email — when and what to send

**Problem:** Email can add retention and support value, but over-engineering it pre-launch wastes time.

**Solution:**
- **Resend** for transactional email (low priority for V1)
- V1 emails: welcome after signup, trial expiring reminder (Day 5 of 7), subscription confirmation
- No marketing email campaigns at V1 — focus on in-app experience first
- All emails triggered from Supabase Edge Functions (not client-side)
