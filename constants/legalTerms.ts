/**
 * In-app Terms of Service / EULA — the single source of truth.
 * Keep wording in sync with website/terms.html (https://remedyrecoveries.com/terms).
 * Attorney review still required before revenue (PRD §8); until then this is the
 * company document of record. Version tracked in lib/legalAcceptance.ts.
 */

export const TERMS_LAST_UPDATED = 'September 19, 2026';
export const TERMS_PUBLIC_URL = 'https://remedyrecoveries.com/terms';
export const PRIVACY_PUBLIC_URL = 'https://remedyrecoveries.com/privacy';
export const CONTACT_PUBLIC_URL = 'https://remedyrecoveries.com/contact';
export const LEGAL_EMAIL = 'social@remedyrecoveries.com';
export const LEGAL_ENTITY = 'Kumar Holdings LLC';
export const LEGAL_MAILING_ADDRESS = '8209 W 127th Cir, Overland Park, KS 66213, USA';

/** Quiet one-liner shown at signup, program match, and session start. */
export const MEDICAL_DISCLAIMER_LINE =
  'Remedy is fitness guidance, not medical advice. See a clinician if you have a serious injury or condition.';

export type LegalInline = {
  text: string;
  bold?: boolean;
  link?: 'privacy' | 'email';
};

export type LegalBlock =
  | { type: 'p'; text: string }
  | { type: 'p'; parts: LegalInline[] }
  | { type: 'ul'; items: string[] }
  | { type: 'h2'; text: string };

export const TERMS_BLOCKS: LegalBlock[] = [
  {
    type: 'p',
    parts: [
      {
        text: 'These Terms of Service (the “Terms”) are the end-user license agreement (EULA) and terms of use for the Remedy iOS app and remedyrecoveries.com. They are an agreement between you and Kumar Holdings LLC, doing business as Remedy (“Remedy,” “we,” “us,” or “our”), 8209 W 127th Cir, Overland Park, KS 66213, USA.',
      },
    ],
  },
  {
    type: 'p',
    parts: [
      {
        text: 'PLEASE READ THESE TERMS CAREFULLY. SECTION 14 CONTAINS A BINDING ARBITRATION PROVISION AND CLASS-ACTION WAIVER THAT AFFECT HOW DISPUTES ARE RESOLVED, WITH AN OPT-OUT RIGHT. SECTIONS 2–4 CONTAIN IMPORTANT HEALTH AND SAFETY TERMS.',
        bold: true,
      },
    ],
  },
  { type: 'h2', text: '1. Agreement' },
  {
    type: 'p',
    parts: [
      { text: 'By checking an acceptance box, creating an account, or using the Remedy iOS app (the “App”) or remedyrecoveries.com (together, the “Service”), you agree to these Terms and our ' },
      { text: 'Privacy Policy', link: 'privacy' },
      { text: '. If you do not agree, do not use the Service.' },
    ],
  },
  { type: 'h2', text: '2. Not medical care: no professional relationship' },
  {
    type: 'p',
    parts: [
      {
        text: 'REMEDY IS A GENERAL FITNESS AND WELLNESS SERVICE. IT PROVIDES GENERAL EXERCISE GUIDANCE AND EDUCATIONAL CONTENT ONLY. IT IS NOT MEDICAL ADVICE, DIAGNOSIS, OR TREATMENT; IT IS NOT PHYSICAL THERAPY OR THE PRACTICE OF MEDICINE; AND NO PHYSICIAN–PATIENT, THERAPIST–PATIENT, OR OTHER PROFESSIONAL–CLIENT RELATIONSHIP IS CREATED BY YOUR USE OF THE SERVICE.',
        bold: true,
      },
    ],
  },
  {
    type: 'p',
    text: 'The Service is not a substitute for care from a physician, physical therapist, or other qualified healthcare provider. Always consult a healthcare provider before beginning an exercise program, and stop immediately and seek medical attention if you experience severe pain, numbness, weakness, loss of bladder or bowel control, or other concerning symptoms.',
  },
  {
    type: 'p',
    parts: [
      {
        text: 'DO NOT USE THE SERVICE IN AN EMERGENCY. If you think you are experiencing a medical emergency, call your local emergency number (for example 911 in the US) immediately.',
        bold: true,
      },
    ],
  },
  {
    type: 'p',
    text: 'Exercise demonstration videos in the App are AI-generated. They illustrate movements for educational purposes. They are not recordings of a live clinical session, they are not a substitute for in-person physical therapy, and they are not personalized medical care.',
  },
  { type: 'h2', text: '3. Your health representations' },
  {
    type: 'p',
    text: 'By using the Service, you represent and agree that:',
  },
  {
    type: 'ul',
    items: [
      'You have consulted a physician or other qualified healthcare provider before beginning this or any exercise program, or you have voluntarily chosen not to and know of no reason why you should not exercise.',
      'You do not have symptoms that require medical evaluation first (including back pain after recent trauma, numbness in the groin or inner thighs, loss of bladder or bowel control, progressive leg weakness, fever or unexplained weight loss with back pain, or night pain that always wakes you), or if you do, a licensed clinician has evaluated you and cleared you to exercise.',
      'You will exercise within your own limits, use equipment safely, and stop any exercise that causes or worsens pain or other warning signs.',
      'The information you provide during onboarding is accurate. Your program is built from your answers.',
    ],
  },
  { type: 'h2', text: '4. Assumption of risk and release' },
  {
    type: 'p',
    text: 'Physical exercise carries inherent risks, including muscle and joint injury and, in rare cases, serious injury. You voluntarily choose to perform the exercises presented in the Service and, to the maximum extent permitted by applicable law, you knowingly assume all risks associated with doing so and release Remedy, its members, officers, employees, and contractors from any claim arising out of injuries or aggravation of pre-existing conditions sustained while performing exercises presented in the Service. Nothing in this section limits liability that cannot be limited under applicable law, including liability for death or personal injury caused by our negligence where such limits are not permitted.',
  },
  { type: 'h2', text: '5. Eligibility and accounts' },
  {
    type: 'p',
    text: 'You must be at least 16 years old to use the Service. By using the Service you confirm that you are 16 or older. You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account. Notify us promptly of any unauthorized use.',
  },
  { type: 'h2', text: '6. License' },
  {
    type: 'p',
    text: 'The App is licensed, not sold. Remedy grants you a limited, personal, revocable, non-exclusive, non-transferable license to use the App on Apple-branded devices that you own or control, and to use the Service for your own personal, non-commercial use, subject to these Terms. We reserve all rights not expressly granted. You may not copy, modify, distribute, sell, lease, reverse engineer, or create derivative works from the Service except as allowed by law.',
  },
  { type: 'h2', text: '7. Subscriptions and billing' },
  {
    type: 'ul',
    items: [
      'Remedy offers auto-renewing subscriptions (weekly, monthly, and annual) purchased through Apple’s App Store.',
      'Payment is charged to your Apple ID account. Subscriptions renew automatically unless cancelled at least 24 hours before the end of the current period.',
      'You can manage or cancel your subscription in your App Store account settings. Deleting the App does not cancel a subscription.',
      'Where offered, free trials convert to a paid subscription unless cancelled before the trial ends.',
      'If subscription prices change, the change applies at your next renewal, and Apple will notify you as required and, where required, seek your consent.',
      'Refunds are handled by Apple under App Store policies. You can request a refund at reportaproblem.apple.com.',
    ],
  },
  { type: 'h2', text: '8. Acceptable use and feedback' },
  {
    type: 'p',
    text: 'You agree not to misuse the Service, including attempting to access other users’ data, probing or breaching security, reverse engineering the App, scraping or redistributing content, using the Service to build a competing product, or using the Service in violation of applicable law. If you send us suggestions or feedback, you grant us a perpetual, irrevocable, royalty-free license to use them without restriction or compensation.',
  },
  { type: 'h2', text: '9. Intellectual property' },
  {
    type: 'p',
    text: 'The Service, including all exercise videos, program content, text, and branding, is owned by Remedy or its licensors and protected by intellectual property laws. The license in Section 6 is the only license we grant. You may not copy, distribute, or create derivative works from our content.',
  },
  {
    type: 'p',
    parts: [
      { text: 'Copyright complaints: if you believe content in the Service infringes your copyright, send a notice with the details required by 17 U.S.C. § 512 to ' },
      { text: LEGAL_EMAIL, link: 'email' },
      { text: ' or to our mailing address above, attention: Copyright Agent, Kumar Holdings LLC. We will respond to valid notices.' },
    ],
  },
  { type: 'h2', text: '10. Disclaimers' },
  {
    type: 'p',
    text: 'THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT GUARANTEE ANY PARTICULAR FITNESS OR HEALTH OUTCOME, THAT ANY PROGRAM IS RIGHT FOR YOUR CONDITION, OR THAT THE SERVICE WILL BE UNINTERRUPTED OR ERROR-FREE. SOME JURISDICTIONS DO NOT ALLOW THE EXCLUSION OF IMPLIED WARRANTIES, SO SOME OF THE ABOVE MAY NOT APPLY TO YOU.',
  },
  { type: 'h2', text: '11. Limitation of liability' },
  {
    type: 'p',
    text: 'TO THE MAXIMUM EXTENT PERMITTED BY LAW, REMEDY WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF DATA OR GOODWILL, ARISING FROM YOUR USE OF THE SERVICE. OUR TOTAL LIABILITY FOR ALL CLAIMS WILL NOT EXCEED THE GREATER OF FIFTY US DOLLARS (USD $50) OR THE AMOUNT YOU PAID US IN THE TWELVE MONTHS BEFORE THE CLAIM AROSE.',
  },
  {
    type: 'p',
    text: 'Nothing in these Terms excludes or limits liability that cannot be excluded or limited under applicable law, including, for consumers in the EU, UK, Australia, and certain US states, statutory consumer rights and liability for death or personal injury caused by negligence, fraud, or willful misconduct. If you are a consumer in a jurisdiction whose law grants you mandatory rights, those rights are not affected by these Terms.',
  },
  { type: 'h2', text: '12. Indemnification' },
  {
    type: 'p',
    text: 'To the maximum extent permitted by applicable law, you agree to indemnify and hold harmless Remedy and its members, officers, employees, and contractors from claims, damages, and expenses (including reasonable attorneys’ fees) arising out of your violation of these Terms, your violation of applicable law, or your misuse of the Service. This section does not apply to consumers in jurisdictions where such indemnities are unenforceable.',
  },
  { type: 'h2', text: '13. Governing law and venue' },
  {
    type: 'p',
    text: 'These Terms are governed by the laws of the State of Kansas, USA, without regard to conflict-of-law rules. Subject to Section 14, any dispute not subject to arbitration will be brought exclusively in the state courts of Johnson County, Kansas, or the United States District Court for the District of Kansas, and you consent to their jurisdiction. If you are a consumer with mandatory legal protections in your country of residence (for example in the EU or UK), you retain the protection of those laws and the right to bring proceedings in your local courts where the law gives you that right.',
  },
  { type: 'h2', text: '14. Dispute resolution: arbitration and class waiver' },
  {
    type: 'p',
    parts: [
      { text: 'Informal resolution first. Before filing a claim, you agree to email ' },
      { text: LEGAL_EMAIL, link: 'email' },
      { text: ' or write to our mailing address with a description of the dispute and give us 30 days to resolve it informally. Most concerns can be resolved this way.' },
    ],
  },
  {
    type: 'p',
    text: 'YOU AND REMEDY AGREE THAT ANY DISPUTE ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE THAT IS NOT RESOLVED INFORMALLY WILL BE RESOLVED BY BINDING INDIVIDUAL ARBITRATION ADMINISTERED BY THE AMERICAN ARBITRATION ASSOCIATION (AAA) UNDER ITS CONSUMER ARBITRATION RULES, RATHER THAN IN COURT, AND YOU AND REMEDY EACH WAIVE THE RIGHT TO A JURY TRIAL AND THE RIGHT TO PARTICIPATE IN A CLASS ACTION, CLASS ARBITRATION, OR REPRESENTATIVE PROCEEDING. Claims may be brought only in an individual capacity.',
  },
  {
    type: 'ul',
    items: [
      'Exceptions: either party may bring an individual claim in small-claims court, and either party may seek injunctive relief in court for infringement or misuse of intellectual property.',
      'Opt-out: you may opt out of this arbitration provision by emailing us within 30 days of first accepting these Terms, with your name, account email, and a statement that you opt out of arbitration. Opting out does not affect any other part of these Terms.',
      'Arbitration costs: AAA consumer rules cap your filing fees; we will pay arbitration fees where those rules or applicable law require.',
      'If you are a consumer in a jurisdiction where pre-dispute arbitration agreements or class waivers are not enforceable against consumers (including the EU and UK), this Section 14 does not apply to you, and disputes will be resolved under Section 13.',
      'If the class-waiver above is found unenforceable as to a particular claim, that claim must proceed in court, not arbitration.',
    ],
  },
  { type: 'h2', text: '15. App Store terms' },
  {
    type: 'p',
    text: 'These Terms are between you and Kumar Holdings LLC, not Apple Inc. (“Apple”). Apple has no obligation to provide maintenance or support for the App. To the extent any warranty applies and is not effectively disclaimed, Remedy (not Apple) is responsible for it. Remedy, not Apple, is responsible for addressing claims relating to the App, including product-liability, legal-compliance, and intellectual-property claims. In the event of any third-party claim that the App infringes intellectual property rights, Remedy, not Apple, is responsible for its investigation, defense, settlement, and discharge. You must comply with applicable third-party terms of agreement when using the App. Apple and Apple’s subsidiaries are third-party beneficiaries of these Terms and may enforce them against you.',
  },
  { type: 'h2', text: '16. Export and sanctions' },
  {
    type: 'p',
    text: 'You represent that you are not located in a country subject to a US government embargo or designated as a “terrorist supporting” country, and that you are not on any US government list of prohibited or restricted parties.',
  },
  { type: 'h2', text: '17. Termination and survival' },
  {
    type: 'p',
    text: 'You may stop using the Service and delete your account at any time in Profile → Delete Account. We may suspend or terminate access for violation of these Terms. Sections 2–4 and 9–16 (and any other provision that by its nature should survive) survive termination. To the extent permitted by law, any claim must be filed within one year after it arose or it is permanently barred; this time-bar does not apply where prohibited.',
  },
  { type: 'h2', text: '18. Changes to these Terms' },
  {
    type: 'p',
    text: 'We may update these Terms from time to time. We will post the revised version in the App and at remedyrecoveries.com/terms with an updated date, and for material changes we will notify you in the App and ask you to accept again where required. We will not apply a new arbitration provision to disputes that arose before the change without your renewed consent. Continued use after changes take effect constitutes acceptance.',
  },
  { type: 'h2', text: '19. Miscellaneous' },
  {
    type: 'p',
    text: 'If any provision of these Terms is found unenforceable, the rest remain in effect. These Terms and the Privacy Policy are the entire agreement between you and Remedy about the Service. You may not assign these Terms; we may assign them in connection with a merger, acquisition, or sale of assets. Our failure to enforce a provision is not a waiver. Neither party is liable for delay or failure caused by events beyond its reasonable control.',
  },
  { type: 'h2', text: '20. Contact' },
  {
    type: 'p',
    parts: [
      { text: 'Kumar Holdings LLC, d/b/a Remedy · 8209 W 127th Cir, Overland Park, KS 66213, USA · ' },
      { text: LEGAL_EMAIL, link: 'email' },
      { text: '.' },
    ],
  },
];
