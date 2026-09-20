/**
 * In-app Privacy Policy — the single source of truth.
 * Keep wording in sync with website/privacy.html (https://remedyrecoveries.com/privacy).
 * Version tracked in lib/legalAcceptance.ts (LEGAL_DOCS_VERSION).
 */

import type { LegalBlock } from './legalTerms';
import { LEGAL_EMAIL } from './legalTerms';

export const PRIVACY_LAST_UPDATED = 'September 10, 2026';

export const PRIVACY_BLOCKS: LegalBlock[] = [
  {
    type: 'p',
    text: 'This Privacy Policy explains how Kumar Holdings LLC, doing business as Remedy (“Remedy,” “we,” “us,” or “our”), collects, uses, and shares information when you use the Remedy iOS application (the “App”) and visit remedyrecoveries.com (together, the “Service”). We are the controller of your personal information.',
  },
  {
    type: 'p',
    parts: [
      { text: 'Contact: ' },
      { text: LEGAL_EMAIL, link: 'email' },
      { text: ' · Mailing address: Kumar Holdings LLC, 8209 W 127th Cir, Overland Park, KS 66213, USA.' },
    ],
  },
  { type: 'h2', text: 'Notice at collection (summary)' },
  {
    type: 'ul',
    items: [
      'We collect: identifiers (email, account ID), profile details (display name), commercial information (subscription status), internet/usage activity, any feedback you send us, and (as sensitive information) the health-related answers and 1–10 pain check-ins you provide.',
      'We use them to run your account, build and adapt your exercise program, show your progress, read and respond to feedback, and improve the App.',
      'We do not sell your personal information, and we do not share it for cross-context behavioral advertising.',
      'Your health-related answers and pain scores are used only to provide the Service, never for advertising or marketing.',
      'In the App, we ask for your explicit consent before collecting health-related answers. You can withdraw it at any time by deleting your account.',
      'You can delete your account and data at any time in the App (Profile → Delete Account) or by emailing us.',
    ],
  },
  { type: 'h2', text: '1. Information we collect' },
  {
    type: 'p',
    text: 'Account information. When you create an account, we collect your email address and a password, or (if you sign in with Apple or Google) the account identifier and email those services share with us. Passwords are stored in hashed form by our authentication provider; we never see your raw password.',
  },
  {
    type: 'p',
    text: 'Profile information. Information you provide to set up your experience, such as your display name.',
  },
  {
    type: 'p',
    text: 'Onboarding and health-related answers. To personalize your program, we ask about your back, for example where it hurts, how long you have felt it, how you would describe it, what makes it worse, your activity level, equipment available to you, and your goal. We collect these answers only after you give explicit consent on the safety and consent screen, and we use them solely to build and adapt your exercise program and show your progress.',
  },
  {
    type: 'p',
    text: 'Progress and session data. Records of which sessions and exercises you complete, your before-and-after pain check-ins (a 1–10 score), and program progress.',
  },
  {
    type: 'p',
    text: 'Legal acceptance records. Which versions of these documents you accepted and when, kept as evidence of your consent.',
  },
  {
    type: 'p',
    text: 'Subscription and purchase status. Whether you have an active subscription or free trial, and your entitlement status. Payments are processed by Apple; we never receive or store your credit card or full payment details.',
  },
  {
    type: 'p',
    text: 'Usage and device information. When you use the App, we automatically collect information about how you interact with it (screens viewed, features used, where users drop off), along with technical details such as device type, operating system, and IP address, associated with your account identifier. Diagnostic events (for example a failed sign-in or a video playback error) may also be recorded. If you enable workout or stretch reminders, we store a push token to deliver them.',
  },
  {
    type: 'p',
    text: 'Feedback you send us. If you use Send Feedback in the App, we collect the category you pick, an optional 1–5 rating, and the message you write, along with your account identifier and app version so we can follow up.',
  },
  {
    type: 'p',
    text: 'We do not collect precise (GPS-level) location data, photos, contacts, or your advertising identifier (IDFA). We do not use session replay.',
  },
  { type: 'h2', text: '2. How we use your information' },
  {
    type: 'ul',
    items: [
      'Create and maintain your account and deliver the App’s core features (personalized program, video-guided sessions, progress tracking).',
      'Personalize your exercise program from your onboarding answers and adapt it as you progress.',
      'Process and manage your subscription and free trial.',
      'Send transactional emails such as account confirmation and password reset.',
      'Send optional workout and stretch reminders, if you turn them on.',
      'Understand how the App is used so we can fix problems and improve it.',
      'Read and respond to feedback you send from the App, and communicate with you about important notices, updates, and customer support.',
      'Protect the security and integrity of the Service (including rate limiting) and comply with legal obligations.',
    ],
  },
  {
    type: 'p',
    text: 'We do not send marketing email campaigns at this time. If that changes, you will be able to opt out.',
  },
  { type: 'h2', text: '3. Legal bases for processing (EU/UK users)' },
  {
    type: 'ul',
    items: [
      'Performance of a contract: to provide the App and the features you sign up for.',
      'Legitimate interests: to analyze usage, improve the App, and keep it secure, balanced against your rights.',
      'Explicit consent: for your health-related answers and pain check-ins (special-category data under GDPR Article 9), which we request on the in-app safety and consent screen before any health question, and for optional notifications. You may withdraw consent at any time by turning off notifications in iOS Settings, deleting your account, or emailing us.',
      'Legal obligation: where we are required to process information to comply with the law.',
    ],
  },
  { type: 'h2', text: '4. Service providers and third parties' },
  {
    type: 'p',
    text: 'We share information only with the providers we use to operate the Service, each bound to use it only to provide services to us. We do not sell your personal information or share it for cross-context behavioral advertising.',
  },
  {
    type: 'ul',
    items: [
      'Supabase: authentication, database, storage. Account credentials, profile, onboarding answers, pain check-ins, session progress, entitlements, legal acceptances, push token, in-app feedback.',
      'PostHog: product analytics. Usage events and technical data tied to your account identifier, including coarse pain scores and pain-profile fields used to measure how programs are used. Not used for advertising.',
      'Superwall: subscription paywall. Its SDK collects device and usage information needed to display paywalls, plus subscription/entitlement status.',
      'Apple: Sign in with Apple and in-app purchases. Payment handled by Apple; we receive subscription status and the account identifier/email you share.',
      'Google: Sign in with Google. Account identifier and email Google shares with us.',
      'Cloudflare: website hosting and exercise video delivery. Technical request data (such as IP address) needed to serve pages and signed video streams.',
      'Upstash: rate limiting for our backend functions. Technical request identifiers only.',
      'Resend: transactional email. Email address, for account confirmation, password reset, and notifying us when you send in-app feedback.',
      'Expo: app framework and delivery. Technical and diagnostic data.',
    ],
  },
  {
    type: 'p',
    text: 'We may also disclose information when required by law (for example a subpoena or legal process), or when we believe in good faith that disclosure is necessary to protect our rights, your safety or the safety of others, or to investigate fraud or respond to a lawful government request.',
  },
  { type: 'h2', text: '5. Your pain and program information (sensitive data)' },
  {
    type: 'ul',
    items: [
      'Your onboarding answers and pain check-ins are used only to provide the Service, to personalize your program and show your progress. We limit our use of this sensitive information to those purposes.',
      'They are never sold, never used to target advertising, and never shared for cross-context behavioral advertising.',
      'They are not medical or clinical records. Remedy is a fitness and wellness app, not a healthcare provider, and nothing in the App is medical advice, diagnosis, or treatment. We are not a HIPAA covered entity.',
      'Your records are isolated through row-level database security, so only you can access your own program data while signed in.',
    ],
  },
  { type: 'h2', text: '6. Data retention' },
  {
    type: 'p',
    text: 'We retain your information for as long as your account is active. When you delete your account, we delete the personal data associated with it promptly, and in any case within 30 days, except where a longer period is required by law (for example tax and accounting records) or needed to resolve a dispute or enforce our agreements. Backup copies are purged on our providers’ standard rotation schedules.',
  },
  { type: 'h2', text: '7. Your privacy rights' },
  {
    type: 'p',
    text: 'EU/UK (GDPR). You have the right to access, correct, delete, restrict, or object to our processing of your personal data; to data portability; and to withdraw consent where processing is based on consent. You may lodge a complaint with your local data protection authority. We respond to verified requests within the timeframe required by law (generally 30 days).',
  },
  {
    type: 'p',
    text: 'California (CCPA/CPRA). We collect the categories listed in the Notice at Collection above, directly from you and from your use of the App, for the business purposes in Section 2. We do not sell or share your personal information, and we limit the use of sensitive personal information to providing the Service. California residents have the right to know, access, correct, and delete their personal information, and to not be discriminated against for exercising these rights. We respond to verifiable requests within 45 days.',
  },
  {
    type: 'p',
    text: 'Other US states. If your state’s privacy law grants you rights of access, correction, deletion, or portability, you can exercise them the same way, and you may appeal a refusal by replying to our response email.',
  },
  {
    type: 'p',
    parts: [
      { text: 'How to exercise your rights: delete your account in the App (Profile → Delete Account) or email ' },
      { text: LEGAL_EMAIL, link: 'email' },
      { text: '.' },
    ],
  },
  { type: 'h2', text: '8. Account deletion' },
  {
    type: 'p',
    text: 'You can delete your account at any time in the App: Profile → Delete Account. Deletion removes your associated personal data, including your profile, onboarding answers, pain check-ins, session history, in-app feedback, and analytics person record. Deleting the App from your device does not cancel an Apple subscription or delete your account; manage billing in your App Store settings.',
  },
  { type: 'h2', text: '9. International data transfers' },
  {
    type: 'p',
    text: 'Our service providers store and process your information in the United States. If you are located elsewhere, your information will be transferred to and processed in the US, a country whose data-protection laws may differ from yours. Where a provider offers Standard Contractual Clauses or an equivalent safeguard as part of its terms, we rely on those safeguards for the transfer.',
  },
  { type: 'h2', text: '10. Security' },
  {
    type: 'p',
    text: 'We use reasonable physical, electronic, and procedural safeguards to protect your information, including encryption of data in transit and access controls (including row-level security) limiting who can reach it. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.',
  },
  { type: 'h2', text: '11. Children' },
  {
    type: 'p',
    parts: [
      { text: 'The Service is intended for people 16 and older and requires a 16+ attestation. We do not knowingly collect personal information from anyone under 16, and never from children under 13. If you are a parent or guardian and believe your child has provided us information, contact ' },
      { text: LEGAL_EMAIL, link: 'email' },
      { text: ' and we will delete it.' },
    ],
  },
  { type: 'h2', text: '12. Automated decision-making and AI' },
  {
    type: 'p',
    text: 'Exercise demonstration videos in the App are AI-generated. They are educational illustrations of movements, not recordings of a live session with a treating clinician, and they are not generated from your personal data. We do not use your personal information for automated decision-making that produces legal or similarly significant effects, and we do not use artificial intelligence to process your personal data; program personalization uses rules based on the answers you provide.',
  },
  { type: 'h2', text: '13. Our website and advertising' },
  {
    type: 'p',
    text: 'remedyrecoveries.com is a static marketing site. We do not run advertising pixels or analytics cookies on the site. Cloudflare may process strictly necessary technical information (such as IP address and browser type) to deliver the pages. If you email us from the contact page, we receive whatever you send. We may promote the App on platforms such as Meta and Apple Search Ads; those platforms collect information under their own policies when you see or interact with an ad. We do not include advertising SDKs in the App, and we never send your onboarding answers, pain scores, or other health-related information to advertising networks.',
  },
  { type: 'h2', text: '14. Changes to this policy' },
  {
    type: 'p',
    text: 'We may update this Privacy Policy from time to time. When we do, we will revise the “Last updated” date and post the new version in the App and on our website. Material changes will be communicated through the App, and where the law requires renewed consent we will ask for it.',
  },
  { type: 'h2', text: '15. Contact us' },
  {
    type: 'p',
    parts: [
      { text: 'Questions about this policy or your information? Email ' },
      { text: LEGAL_EMAIL, link: 'email' },
      { text: ' or write to Kumar Holdings LLC, 8209 W 127th Cir, Overland Park, KS 66213, USA.' },
    ],
  },
];
