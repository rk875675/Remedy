# Legal launch checklist (out-of-repo actions)

Companion to the August 18, 2026 legal-risk hardening pass. Everything in the repo
(copy, safety/consent gate, `legal_acceptances` table, Terms/Privacy v2026-08-18,
website sync) is done. The items below live in dashboards, contracts, or filings
and **must be completed by a human**. Do not launch worldwide with these open.

---

## 1. App Store Connect (do before next submission)

- [ ] **Privacy Policy URL** = `https://remedyrecoveries.com/privacy`
- [ ] **Support URL** = `https://remedyrecoveries.com/contact`
- [ ] **Regulated medical device declaration = No** (US/UK/EU). This is only
      true while every public surface stays wellness-only — no treat / cure /
      diagnose / prescribe / rehabilitate / "PT program" claims anywhere,
      including screenshots and the App Store description.
- [ ] **Age rating: 16+** — matches the in-app 16+ attestation, Terms §5, and
      Privacy children's section (all aligned to 16). 16 is at or above the
      GDPR digital-consent age in every EU member state and above COPPA's 13.
      Known residual risk (accepted): contracts with 16–17-year-olds are
      voidable in many jurisdictions, so the arbitration clause and liability
      release may not bind that age slice. If this ever becomes a concern,
      change the attestation, Terms §5, and Privacy children's section to 18
      together.
- [ ] **Privacy nutrition labels** per `docs/ANALYTICS.md` §6.3: Health & Fitness
      data, linked to you, no tracking. Do not add data types we do not collect.
- [ ] **No ATT prompt** (we have no IDFA/tracking — keep it that way).
- [ ] **Screenshots**: re-export from `app-store/frames.html` (copy was updated —
      "A stronger back starts here.", no "Backed by sports medicine", no
      "Real results", no "adapts to how you feel today").
- [ ] **App description / promotional text**: wellness vocabulary only. Reuse the
      website hero language ("structured back fitness program", "educational
      exercise guidance, not medical care").

## 2. Superwall dashboard (exact live strings to change)

All three active paywalls (`REMEDY PAYWALL 3-Page`, `REMEDY Program Paywall`,
`REMEDY Program Paywall v2`) contain:

- [ ] **"Average PT program $1,500+"** — the NUMBER is defensible (2026 US
      self-pay average is ~$150/session and a typical 8–12 visit course runs
      $1,200–$4,000 per multiple published cost guides), so the anchor can stay
      **if** both of these change on all three paywalls:
      1. Label it as a price comparison, not an equivalence — e.g.
         **"In-person PT course: typically $1,500+"**.
      2. Add one small line near it: **"Remedy is a fitness program, not a
         substitute for physical therapy."**
      Without the disclaimer line, the anchor implies Remedy substitutes for
      licensed physical therapy — the exact claim class APTA forced Kaia/UHC to
      drop, and the thing that flips the wellness posture (Apple 1.4.1 / EU MDR).
- [ ] `REMEDY PAYWALL 3-Page` says **"a full customized program tailored to you"**
      — fine, keep; do NOT reintroduce "therapy", "treatment", "recovery plan",
      "heal", or clinician comparisons in future edits.
- [ ] Keep: Restore link, Terms of Use · Privacy Policy links, trial-reminder
      copy ("You'll be charged on … unless you cancel"), "No commitment, cancel
      anytime". These are Apple 3.1.2-friendly — leave them.
- [ ] Confirm the Terms/Privacy links on the paywalls point to
      `https://remedyrecoveries.com/terms` and `/privacy`.

## 3. Operational blockers (Phase 5 — no code can close these)

1. [ ] **EU Art. 27 + UK GDPR representative.** If the app is available in the
       EEA/UK, appoint a representative service (e.g. Prighter, DataRep) and add
       the real name/address to the Privacy Policy. Until appointed, either limit
       EU/UK App Store availability or accept the gap knowingly. Do **not**
       invent a representative in the policy.
2. [ ] **Processor DPAs.** Accept/sign the DPA each provider offers: Supabase,
       PostHog, Superwall, Cloudflare, Upstash, Resend, Expo, Apple, Google.
       Keep copies. The Privacy Policy now says we rely on provider SCCs "where
       in place" — make that true.
3. [ ] **Insurance.** General liability + cyber, ideally product/completed-
       operations for a fitness app. The TOS liability cap does not pay a
       medical bill or defense costs.
4. [ ] **One legal entity everywhere.** TOS/Privacy say **Kumar Holdings LLC**;
       the PostHog org is named "Relentless App LLC". Align Apple Developer,
       Superwall, PostHog, bank, and domain WHOIS to one entity, or document the
       relationship. This is a corporate-identity decision only you can make.
5. [ ] **Confirm Kumar Holdings LLC is in good standing in Kansas** and that a
       consumer fitness app is within its stated purpose.
6. [ ] **No PT names or credentials in the app or marketing** until a signed
       IP/credential-use agreement exists. The TOS and product disclose
       AI-generated videos — keep that disclosure until a real clinician
       contract replaces it.
7. [ ] **Attorney review before revenue** (per your own decision): Terms
       (especially the Kansas arbitration clause and the release), Privacy,
       and the consent-gate wording. The 2026-08-30 documents are internally
       consistent company drafts, not legal advice.
8. [x] Public contact is `social@remedyrecoveries.com` (Cloudflare Email Routing
       → operator Gmail). `LEGAL_EMAIL`, website, feedback, and auth-email
       contact links use that address. Do not put a personal Gmail on the site.

## 4. If any of this changes, bump the version

`lib/legalAcceptance.ts` → `LEGAL_DOCS_VERSION` (currently `2026-09-10`) must be
bumped whenever Terms, Privacy, or the consent/disclaimer copy materially
changes, and material changes should re-prompt acceptance in-app.
