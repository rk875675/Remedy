// Facts the whole site quotes. Keep these in sync with the live App Store listing
// (https://itunes.apple.com/lookup?id=6813745106) — never guess a price or a date.

export const SITE = 'https://remedyrecoveries.com';
export const APP_ID = '6813745106';
export const STORE = `https://apps.apple.com/us/app/remedy-back-pain-relief/id${APP_ID}`;
export const CSS_VERSION = 23;
export const UPDATED = '2026-10-23';
export const OUT = 'website';

export const RELENTLESS = 'https://relentlesstough.com/';

export const APP = {
  name: 'Remedy',
  storeName: 'Remedy: Back Pain Relief',
  platform: 'iPhone',
  minOS: 'iOS 15.1 or later',
  age: '17+',
  released: '2026-10-13',
  releasedLabel: 'October 13, 2026',
  category: 'Health & Fitness',
  exerciseCount: 28,
};

export const PLANS = [
  { id: 'weekly', name: 'Weekly', price: '4.99', per: 'week', trial: '7-day free trial where offered', duration: 'P1W', unit: 'WEE' },
  { id: 'monthly', name: 'Monthly', price: '12.99', per: 'month', trial: '14-day free trial where offered', duration: 'P1M', unit: 'MON' },
  { id: 'annual', name: 'Annual', price: '79.99', per: 'year', trial: '7-day free trial where offered', duration: 'P1Y', unit: 'ANN', note: 'About $6.67 a month' },
];

export const ORG = {
  name: 'Remedy',
  legalName: 'Kumar Holdings LLC',
  email: 'social@remedyrecoveries.com',
  street: '8209 W 127th Cir',
  city: 'Overland Park',
  region: 'KS',
  postal: '66213',
  country: 'US',
};

export const FOUNDER = {
  id: `${SITE}/about#rahul-kumar`,
  name: 'Rahul Kumar',
  role: 'Founder and developer',
  linkedin: 'https://www.linkedin.com/in/rahul-kumar-aa1a8b32a/',
  relentless: 'https://relentlesstough.com/about/',
};

// Sources cited across guides. Every DOI here was checked against Crossref.
export const SOURCES = {
  nhs: { title: 'Back pain (NHS Health A to Z)', publisher: 'NHS', year: '2026', url: 'https://www.nhs.uk/conditions/back-pain/' },
  nhsSciatica: { title: 'Sciatica', publisher: 'NHS', year: '2026', url: 'https://www.nhs.uk/conditions/sciatica/' },
  nhsWalking: { title: 'Walking for health', publisher: 'NHS', year: '2026', url: 'https://www.nhs.uk/live-well/exercise/walking-for-health/' },
  nice: { title: 'Low back pain and sciatica in over 16s: assessment and management (NG59)', publisher: 'National Institute for Health and Care Excellence', year: '2016, updated 2020', url: 'https://www.nice.org.uk/guidance/ng59' },
  who: { title: 'WHO guideline for non-surgical management of chronic primary low back pain in adults in primary and community care settings', publisher: 'World Health Organization', year: '2023', url: 'https://www.who.int/publications/i/item/9789240081789' },
  medline: { title: 'Back pain (MedlinePlus health topic)', publisher: 'MedlinePlus, U.S. National Library of Medicine', year: '2026', url: 'https://medlineplus.gov/backpain.html' },
  acp: { title: 'Noninvasive treatments for acute, subacute, and chronic low back pain: a clinical practice guideline from the American College of Physicians', authors: 'Qaseem A, et al.', journal: 'Annals of Internal Medicine', year: '2017', ref: '166(7):514-530', url: 'https://doi.org/10.7326/M16-2367', scholarly: true },
  cochraneExercise: { title: 'Exercise therapy for chronic low back pain', authors: 'Hayden JA, et al.', journal: 'Cochrane Database of Systematic Reviews', year: '2021', ref: 'CD009790', url: 'https://doi.org/10.1002/14651858.CD009790.pub2', scholarly: true },
  cochraneRest: { title: 'Advice to rest in bed versus advice to stay active for acute low-back pain and sciatica', authors: 'Dahm KT, et al.', journal: 'Cochrane Database of Systematic Reviews', year: '2010', ref: 'CD007612', url: 'https://doi.org/10.1002/14651858.CD007612.pub2', scholarly: true },
  cochraneMotor: { title: 'Motor control exercise for chronic non-specific low-back pain', authors: 'Saragiotto BT, et al.', journal: 'Cochrane Database of Systematic Reviews', year: '2016', ref: 'CD012004', url: 'https://doi.org/10.1002/14651858.CD012004', scholarly: true },
  lancetWhat: { title: 'What low back pain is and why we need to pay attention', authors: 'Hartvigsen J, et al.', journal: 'The Lancet', year: '2018', ref: '391(10137):2356-2367', url: 'https://doi.org/10.1016/S0140-6736(18)30480-X', scholarly: true },
  lancetTreat: { title: 'Prevention and treatment of low back pain: evidence, challenges, and promising directions', authors: 'Foster NE, et al.', journal: 'The Lancet', year: '2018', ref: '391(10137):2368-2383', url: 'https://doi.org/10.1016/S0140-6736(18)30489-6', scholarly: true },
  walkback: { title: 'Effectiveness and cost-effectiveness of an individualised, progressive walking and education intervention for the prevention of low back pain recurrence in Australia (WalkBack): a randomised controlled trial', authors: 'Pocovi NC, et al.', journal: 'The Lancet', year: '2024', ref: '404(10448):134-144', url: 'https://doi.org/10.1016/S0140-6736(24)00755-4', scholarly: true },
  owen: { title: 'Which specific modes of exercise training are most effective for treating low back pain? Network meta-analysis', authors: 'Owen PJ, et al.', journal: 'British Journal of Sports Medicine', year: '2020', ref: '54(21):1279-1287', url: 'https://doi.org/10.1136/bjsports-2019-100886', scholarly: true },
  steffens: { title: 'Prevention of low back pain: a systematic review and meta-analysis', authors: 'Steffens D, et al.', journal: 'JAMA Internal Medicine', year: '2016', ref: '176(2):199-208', url: 'https://doi.org/10.1001/jamainternmed.2015.7431', scholarly: true },
};
