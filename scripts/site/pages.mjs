import { SITE, STORE, APP, PLANS, ORG, FOUNDER, SOURCES, UPDATED, RELENTLESS } from './config.mjs';
import {
  esc, abs, page, crumbs, breadcrumbNode, founderNode, phone, storeBadge, cta, readMinutes, formatDate, SCREENS, screenSrcset, serpPx,
} from './layout.mjs';
import { EXERCISES, GROUPS, EQUIPMENT, AREAS, TRIGGER_LABELS, bySlug } from './exercises.mjs';
import { GUIDES, byKey, RED_FLAGS_LIST } from './guides.mjs';

const LEVEL = { 1: 'Gentle', 2: 'Beginner', 3: 'Intermediate', 4: 'Advanced' };
const lower = (s) => (/^Mc[A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const PET_HERO = { w: 482, h: 640 };
const PET_STAGE_IMG = { w: 320, h: 300 };
// Sessions are lifetime sessions finished (lib/pet.ts thresholds 0 / 1 / 4 / 9 / 15).
const PET_STAGES = [
  { name: 'Curled', count: '0', unit: 'sessions', alt: 'The armadillo curled in a ball, at 0 finished sessions' },
  { name: 'Peeking', count: '1', unit: 'session', alt: 'The armadillo peeking out, at 1 finished session' },
  { name: 'Sitting', count: '4', unit: 'sessions', alt: 'The armadillo sitting, at 4 finished sessions' },
  { name: 'Standing', count: '9', unit: 'sessions', alt: 'The armadillo standing, at 9 finished sessions' },
  { name: 'Fully grown', count: '15', unit: 'sessions', alt: 'The fully grown armadillo, at 15 finished sessions' },
];
const exName = (e) => e.h1;
const exUrl = (slug) => `/exercises/${slug}`;

const faqNode = (id, items) => ({
  '@type': 'FAQPage',
  '@id': id,
  mainEntity: items.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]+>/g, '') } })),
});

const faqHtml = (items, { openFirst = true } = {}) =>
  `<div class="faq">${items
    .map(([q, a], i) => `
          <details${openFirst && i === 0 ? ' open' : ''}>
            <summary><h3>${esc(q)}</h3></summary>
            <p>${a}</p>
          </details>`)
    .join('')}
        </div>`;

const webPageNode = (path, name, description, extra = {}) => ({
  '@type': extra.type || 'WebPage',
  '@id': `${abs(path)}#page`,
  url: abs(path),
  name,
  description,
  inLanguage: 'en-US',
  isPartOf: { '@id': `${SITE}/#website` },
  publisher: { '@id': `${SITE}/#org` },
  dateModified: UPDATED,
  ...extra.props,
});

const exerciseCard = (e) => `
          <a class="ex-card" href="${exUrl(e.slug)}" data-group="${e.group}" data-equipment="${e.equipment}" data-area="${e.areas.join(' ')}">
            <span class="ex-tag tag-${e.group}">${GROUPS[e.group].label}</span>
            <h3>${esc(exName(e))}</h3>
            <p>${esc(e.summary.split('. ')[0].replace(/\.$/, ''))}.</p>
            <span class="ex-meta">${EQUIPMENT[e.equipment]} · ${LEVEL[e.tier]}</span>
          </a>`;

const homeExRow = (e, i) => `
          <li><a class="home-ex-row" href="${exUrl(e.slug)}"><span class="home-ex-n">${String(i + 1).padStart(2, '0')}</span><span class="home-ex-main"><span class="home-ex-name">${esc(exName(e))}</span><span class="home-ex-sum">${esc(e.summary.split('. ')[0].replace(/\.$/, ''))}.</span></span><span class="home-ex-meta">${GROUPS[e.group].label} · ${EQUIPMENT[e.equipment]} · ${LEVEL[e.tier]}</span><span class="home-ex-arrow" aria-hidden="true">→</span></a></li>`;

const guideCard = (key, { big = false } = {}) => {
  const g = byKey[key];
  const rel = g.theme === 'relentless';
  return `<a class="guide-card${big ? ' guide-card-big' : ''}${rel ? ' guide-card-rel' : ''}" href="${g.path}"><span class="guide-card-kicker">${rel ? 'For athletes' : 'Guide'}</span><h3>${esc(g.card)}</h3><p>${esc(g.blurb)}</p><span class="link-arrow">Read the guide</span></a>`;
};

const planCards = () => `
        <div class="plans switcher">${PLANS.map((p) => `
          <div class="plan">
            <p class="plan-name">${p.name}</p>
            <p class="plan-price"><span>$${p.price}</span> / ${p.per}</p>
            ${p.note ? `<p class="plan-note">${p.note}</p>` : ''}
            <p class="plan-trial">${p.trial}</p>
          </div>`).join('')}
        </div>`;

const factsTable = (rows) => `<dl class="facts">${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;

const APP_FACTS = [
  ['What it is', 'Back fitness app for people with back pain'],
  ['Platform', `${APP.platform}, ${APP.minOS}`],
  ['Program length', '10 to 16 weeks, set by how long your back has hurt and how it behaves'],
  ['Sessions', 'You pick 3 to 7 days a week'],
  ['Exercises', 'A demonstration video for every exercise'],
  ['Price', 'Free to download. $4.99/week, $12.99/month, or $79.99/year'],
  ['Free trial', '7 days weekly, 14 days monthly, and 7 days annual, where offered'],
  ['Age', APP.age],
  ['Made by', `${ORG.legalName}, d/b/a Remedy`],
  ['Released', APP.releasedLabel],
];

const RED_FLAG_ASIDE = `
        <aside class="red-flags" aria-labelledby="red-flags-title">
          <h2 id="red-flags-title">When to see someone instead of using an app</h2>
          <p>Get medical care, not an exercise routine, if you have back pain with any of these:</p>
          <ul>${RED_FLAGS_LIST.map((r) => `<li>${r}</li>`).join('')}</ul>
          <p><a href="/guides/when-to-see-a-doctor-for-back-pain">More on the warning signs</a></p>
        </aside>`;

// ---------------------------------------------------------------- Home

const meadowTree = ({ x, y, s = 1, tone = 'mid', variant = 'broad', sway = '' }) => {
  const pal =
    tone === 'far'
      ? {
          shadow: '#5D8669',
          trunk: '#7C6858',
          deep: '#88AE90',
          main: '#9FC2A4',
          light: '#BBD6BC',
          rim: '#E3EFE0',
        }
      : {
          shadow: '#2A4A36',
          trunk: '#6A5344',
          deep: '#416F51',
          main: '#598D68',
          light: '#76AA81',
          rim: '#D7E9CE',
        };
  const canopy =
    variant === 'tall'
      ? `
                <ellipse cx="-7" cy="-38" rx="11" ry="16" fill="${pal.deep}"/>
                <ellipse cx="8" cy="-42" rx="11" ry="17" fill="${pal.main}"/>
                <ellipse cx="0" cy="-54" rx="13" ry="18" fill="${pal.light}"/>
                <ellipse cx="5" cy="-60" rx="6.5" ry="9" fill="${pal.rim}" opacity="0.54"/>`
      : variant === 'sapling'
        ? `
                <ellipse cx="-6" cy="-28" rx="11" ry="10" fill="${pal.deep}"/>
                <ellipse cx="5" cy="-32" rx="12" ry="11" fill="${pal.main}"/>
                <ellipse cx="2" cy="-39" rx="9" ry="8" fill="${pal.light}"/>
                <ellipse cx="5" cy="-41" rx="4.5" ry="4" fill="${pal.rim}" opacity="0.55"/>`
        : `
                <ellipse cx="-16" cy="-34" rx="17" ry="13.5" fill="${pal.deep}"/>
                <ellipse cx="14" cy="-33" rx="15" ry="13" fill="${pal.deep}"/>
                <ellipse cx="-2" cy="-42" rx="21" ry="17" fill="${pal.main}"/>
                <ellipse cx="13" cy="-43" rx="14" ry="12.5" fill="${pal.light}"/>
                <ellipse cx="3" cy="-53" rx="15" ry="12" fill="${pal.light}"/>
                <ellipse cx="10" cy="-53" rx="8.5" ry="6" fill="${pal.rim}" opacity="0.56"/>`;
  const trunk =
    variant === 'tall'
      ? `<path d="M-2.8 1 C-2.2 -14, -1.8 -28, -1.2 -40 L1.4 -40 C1.8 -28, 2.4 -14, 3.2 1 Z" fill="${pal.trunk}"/>`
      : variant === 'sapling'
        ? `<path d="M-2.2 1 C-1.8 -9, -1.4 -18, -1 -26 L1.1 -26 C1.5 -18, 2 -9, 2.5 1 Z" fill="${pal.trunk}"/>`
        : `<path d="M-3.8 1 C-3 -12, -2.4 -24, -1.5 -34 L1.8 -34 C2.5 -24, 3.4 -12, 4.4 1 Z" fill="${pal.trunk}"/>
              <path d="M-0.5 -21 L-8.5 -29 M1 -24 L7.5 -30" stroke="${pal.trunk}" stroke-width="2" stroke-linecap="round"/>`;
  return `
            <g class="meadow-tree meadow-tree-${tone}" transform="translate(${x} ${y}) scale(${s})">
              <ellipse cx="3" cy="2" rx="${variant === 'tall' ? 19 : variant === 'sapling' ? 15 : 26}" ry="5" fill="${pal.shadow}" opacity="0.24"/>
              ${trunk}
              <g class="meadow-canopy${sway ? ` ${sway}` : ''}">${canopy}
              </g>
            </g>`;
};

const meadowBird = ({ x, y, s = 1, dur = 1.35, delay = 0 }) => `
            <g transform="translate(${x} ${y}) scale(${s})">
              <g class="bird-glide" style="--b-dur:${dur}s;--b-delay:${delay}s">
                <path class="bird-wing bird-wing-l" d="M0 0 Q-7 -8 -16 -2" style="--b-dur:${dur}s;--b-delay:${delay}s"/>
                <path class="bird-wing bird-wing-r" d="M0 0 Q7 -8 16 -2" style="--b-dur:${dur}s;--b-delay:${delay}s"/>
              </g>
            </g>`;

const meadowGrass = (x, y, s = 1, cls = '') => `
            <g class="meadow-tuft${cls ? ` ${cls}` : ''}" transform="translate(${x} ${y}) scale(${s})">
              <path d="M-4 0 Q-6 -7 -9 -13 M0 1 Q0 -8 1 -15 M4 0 Q6 -7 10 -12"/>
            </g>`;

export function home() {
  const faq = [
    ['What is Remedy?', 'Remedy is an iPhone app for people with back pain. You answer a few questions. It builds a 10 to 16 week program of short sessions, with a video on every exercise. It is a fitness program, not medical care.'],
    ['How much does Remedy cost?', 'Free to download. Full access is $4.99 a week, $12.99 a month, or $79.99 a year (about $6.67 a month). Trials, where offered, are 7 days on weekly and yearly plans and 14 days on monthly. You pay in the App Store. <a href="/pricing">Pricing</a>.'],
    ['Is Remedy physical therapy?', 'No. Remedy does not diagnose or treat. It is not a substitute for a doctor or a physical therapist.'],
    ['What does the armadillo do?', 'You name it. It starts curled up, at 0 finished sessions. It moves up at 1, 4, 9, and 15 finished sessions. Missed days do not shrink it. It does not describe your back. <a href="/faq#armadillo">More about the armadillo</a>.'],
    ['Is there an Android app?', 'No. Remedy is iPhone only. It needs iOS 15.1 or later.'],
  ];
  const title = 'Remedy: Back Pain App for iPhone';
  const description = 'Remedy is a back pain app for iPhone. Answer a few questions and get a 10 to 16 week program of short, video-guided sessions.';
  const body = `
    <section class="meadow">
      <div class="meadow-scene">
        <svg class="meadow-svg" viewBox="0 0 1440 780" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <defs>
            <linearGradient id="meadow-sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#F6EDE0"/>
              <stop offset="0.38" stop-color="#F5EEDC"/>
              <stop offset="0.72" stop-color="#EAF1DF"/>
              <stop offset="1" stop-color="#DFECDC"/>
            </linearGradient>
            <radialGradient id="meadow-sun-wash" cx="50%" cy="50%" r="50%">
              <stop offset="0" stop-color="#FFE7AB" stop-opacity="0.58"/>
              <stop offset="0.42" stop-color="#FCE7BA" stop-opacity="0.22"/>
              <stop offset="1" stop-color="#F6EDE0" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="meadow-sun-halo" cx="50%" cy="50%" r="50%">
              <stop offset="0" stop-color="#FFF7DC" stop-opacity="0.92"/>
              <stop offset="0.52" stop-color="#F9DF9F" stop-opacity="0.34"/>
              <stop offset="1" stop-color="#F9DF9F" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="meadow-sun-disc" cx="46%" cy="44%" r="54%">
              <stop offset="0" stop-color="#FFFDF8" stop-opacity="1"/>
              <stop offset="0.58" stop-color="#FCE7B2" stop-opacity="0.96"/>
              <stop offset="0.86" stop-color="#F5D38A" stop-opacity="0.72"/>
              <stop offset="1" stop-color="#F5D38A" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="meadow-far-hill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#D7E6D1"/>
              <stop offset="1" stop-color="#BFD7BC"/>
            </linearGradient>
            <linearGradient id="meadow-mid-left" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#A1C89E"/>
              <stop offset="1" stop-color="#7EAC82"/>
            </linearGradient>
            <linearGradient id="meadow-mid-right" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#B4D5AC"/>
              <stop offset="1" stop-color="#89B58C"/>
            </linearGradient>
            <linearGradient id="meadow-near" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#538A6B"/>
              <stop offset="0.16" stop-color="#3E6B4E"/>
              <stop offset="0.52" stop-color="#2F5440"/>
              <stop offset="0.88" stop-color="#24432F"/>
              <stop offset="1" stop-color="#24432F"/>
            </linearGradient>
            <radialGradient id="meadow-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0" stop-color="#E7F3DE" stop-opacity="0.26"/>
              <stop offset="0.6" stop-color="#C8E2BE" stop-opacity="0.08"/>
              <stop offset="1" stop-color="#C8E2BE" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="meadow-cloud-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#FFFFFF"/>
              <stop offset="0.72" stop-color="#FFFDF8"/>
              <stop offset="1" stop-color="#F7EFE2" stop-opacity="0.92"/>
            </linearGradient>
          </defs>

          <rect width="1440" height="780" fill="url(#meadow-sky)"/>

          <ellipse cx="1155" cy="142" rx="470" ry="265" fill="url(#meadow-sun-wash)"/>
          <g class="meadow-sun">
            <circle cx="1155" cy="134" r="122" fill="url(#meadow-sun-halo)"/>
            <circle cx="1155" cy="134" r="52" fill="url(#meadow-sun-disc)"/>
          </g>

          <g class="meadow-cloud meadow-cloud-a" fill="url(#meadow-cloud-fill)" opacity="0.92">
            <path d="M0 142 C0 127, 16 117, 36 119 C43 98, 70 88, 95 96 C112 83, 144 88, 154 109 C175 109, 192 121, 192 138 C192 146, 184 150, 170 150 L16 150 C6 150, 0 147, 0 142 Z"/>
          </g>
          <g class="meadow-cloud meadow-cloud-b" fill="url(#meadow-cloud-fill)" opacity="0.82">
            <path d="M0 218 C0 205, 14 197, 33 199 C40 182, 63 174, 86 182 C102 170, 131 174, 141 193 C160 193, 174 203, 174 216 C174 222, 166 226, 154 226 L14 226 C4 226, 0 223, 0 218 Z"/>
          </g>
          <g class="meadow-cloud meadow-cloud-c" fill="url(#meadow-cloud-fill)" opacity="0.68">
            <path d="M0 92 C0 83, 11 76, 25 78 C31 66, 48 60, 64 66 C76 58, 96 62, 104 74 C117 74, 127 82, 127 91 C127 95, 121 98, 112 98 L10 98 C3 98, 0 96, 0 92 Z"/>
          </g>
          <g class="meadow-cloud meadow-cloud-d" fill="url(#meadow-cloud-fill)" opacity="0.58">
            <path d="M0 250 C0 241, 12 235, 27 237 C34 226, 52 220, 69 227 C81 220, 101 224, 109 236 C122 236, 132 243, 132 250 C132 254, 126 256, 116 256 L10 256 C4 256, 0 254, 0 250 Z"/>
          </g>

          <g class="meadow-flock meadow-flock-a" fill="none" stroke="#536E5A" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${meadowBird({ x: 0, y: 128, s: 1.05, dur: 1.25, delay: 0 })}${meadowBird({ x: 46, y: 108, s: 0.88, dur: 1.4, delay: -0.45 })}${meadowBird({ x: 82, y: 138, s: 0.78, dur: 1.18, delay: -0.85 })}
          </g>
          <g class="meadow-flock meadow-flock-b" fill="none" stroke="#647D6A" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${meadowBird({ x: 0, y: 196, s: 0.82, dur: 1.38, delay: -0.2 })}${meadowBird({ x: 42, y: 214, s: 0.7, dur: 1.52, delay: -0.7 })}
          </g>

          <g class="meadow-far">
            <path d="M-40 426 C140 374, 340 378, 560 426 C770 472, 1020 452, 1260 422 C1355 410, 1420 416, 1480 428 L1480 650 L-40 650 Z" fill="url(#meadow-far-hill)"/>${meadowTree({ x: 356, y: 398, s: 0.52, tone: 'far', variant: 'broad' })}${meadowTree({ x: 404, y: 406, s: 0.44, tone: 'far', variant: 'tall' })}
            <ellipse class="meadow-critter-shadow-far" cx="298" cy="404" rx="13" ry="3" fill="#5D8669" opacity="0.24"/>
            <g class="meadow-critter meadow-critter-far">
              <image class="meadow-distant meadow-distant-far" href="/assets/pet/stage-2.webp" x="280" y="372" width="36" height="34"/>
            </g>
          </g>

          <g class="meadow-mid">
            <path d="M-40 468 C110 454, 245 478, 430 524 C530 548, 620 568, 740 584 L740 700 L-40 700 Z" fill="url(#meadow-mid-left)"/>
            <path d="M190 568 C480 546, 780 482, 1065 442 C1230 418, 1365 424, 1480 448 L1480 710 L190 710 Z" fill="url(#meadow-mid-right)"/>${meadowTree({ x: 112, y: 472, s: 1.06, tone: 'mid', variant: 'broad', sway: 'meadow-sway-a' })}${meadowTree({ x: 186, y: 484, s: 0.86, tone: 'mid', variant: 'tall', sway: 'meadow-sway-b' })}${meadowTree({ x: 1152, y: 444, s: 1.18, tone: 'mid', variant: 'tall', sway: 'meadow-sway-a' })}${meadowTree({ x: 1228, y: 442, s: 1.04, tone: 'mid', variant: 'broad', sway: 'meadow-sway-b' })}${meadowTree({ x: 1352, y: 454, s: 0.84, tone: 'mid', variant: 'sapling', sway: 'meadow-sway-a' })}
            <ellipse class="meadow-critter-shadow-mid" cx="1056" cy="483" rx="18" ry="3.8" fill="#3D6B4E" opacity="0.24"/>
            <g class="meadow-critter meadow-critter-mid">
              <image class="meadow-distant meadow-distant-mid" href="/assets/pet/stage-4.webp" x="1030" y="436" width="52" height="48"/>
            </g>
          </g>

          <g class="meadow-ground">
            <path d="M-60 598 C210 518, 470 496, 680 498 C910 500, 1210 538, 1500 634 L1500 820 L-60 820 Z" fill="url(#meadow-near)"/>
            <ellipse cx="695" cy="518" rx="430" ry="44" fill="url(#meadow-glow)"/>
            <path d="M-60 598 C210 518, 470 496, 680 498 C910 500, 1210 538, 1500 634" fill="none" stroke="#8EC099" stroke-width="2.5" opacity="0.7"/>
            <g class="meadow-grass" fill="none" stroke="#7EB890" stroke-width="2.1" stroke-linecap="round">${meadowGrass(96, 578, 1.1, 'meadow-tuft-a')}${meadowGrass(264, 536, 0.95, 'meadow-tuft-b')}${meadowGrass(372, 520, 0.88, 'meadow-tuft-a')}${meadowGrass(1062, 532, 0.98, 'meadow-tuft-b')}${meadowGrass(1248, 574, 1.08, 'meadow-tuft-a')}${meadowGrass(184, 654, 1.15, 'meadow-tuft-b')}${meadowGrass(1186, 668, 1.1, 'meadow-tuft-a')}
            </g>
          </g>
        </svg>

        <h1>Back Pain Made<br><em>Less Boring</em></h1>
        <div class="meadow-stand">
          <svg class="meadow-pet-shadow" viewBox="0 0 120 26" aria-hidden="true">
            <defs>
              <radialGradient id="meadow-pet-shade" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#0D1E13" stop-opacity="0.48"/>
                <stop offset="0.58" stop-color="#0D1E13" stop-opacity="0.18"/>
                <stop offset="1" stop-color="#0D1E13" stop-opacity="0"/>
              </radialGradient>
            </defs>
            <ellipse cx="60" cy="13" rx="58" ry="12" fill="url(#meadow-pet-shade)"/>
          </svg>
          <img class="meadow-pet" src="/assets/pet/hero.webp" width="${PET_HERO.w}" height="${PET_HERO.h}" alt="The Remedy armadillo, standing with both arms up" fetchpriority="high" decoding="async" />
        </div>
      </div>
      <div class="meadow-foot">
        <p>An iPhone program of short sessions, with a video on every move. Free to download. A fitness program, not medical care.</p>
        ${storeBadge('', { eager: true })}
      </div>
    </section>

    <section class="home-section" id="program">
      <div class="container">
        <div class="section-head">
          <h2>The program</h2>
        </div>
        <div class="bento-grid bento-two">
          <div class="bento-card bento-forest bento-pair-card">
            <div class="bento-copy">
              <h3>Your week, mapped out</h3>
              <p>10 to 16 weeks. 15, 20, or 30 minutes a session.</p>
            </div>
            <div class="bento-phone-crop">
              ${phone('home', { cls: 'phone-bento' })}
            </div>
          </div>

          <div class="bento-card bento-sage bento-pair-card">
            <div class="bento-copy">
              <h3>Your days. Your gear.</h3>
              <p>Pick 3 to 7 days. Full gym, bands and light dumbbells, or just the floor.</p>
            </div>
            <div class="bento-phone-crop">
              ${phone('days', { cls: 'phone-bento' })}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="home-section" id="inside-a-session">
      <div class="container">
        <div class="showcase-panel">
          <div class="showcase-screens">
            <div class="showcase-phone-main">${phone('session', { cls: 'phone-showcase' })}</div>
            <div class="showcase-phone-sub">${phone('painCheck', { cls: 'phone-showcase-sm' })}</div>
          </div>
          <div class="showcase-copy stack">
            <h2>Today’s session is already chosen</h2>
            <p>Video on every exercise, with sets, reps, and one form cue. You rate pain 0 to 10 before you start and when you finish.</p>
            <p><a class="btn-cream" href="/how">How a session is built</a></p>
          </div>
        </div>
      </div>
    </section>

    <section class="home-section" id="your-armadillo">
      <div class="container">
        <div class="armadillo-head">
          <h2>You name an armadillo</h2>
          <p class="armadillo-rule">It moves up at 1, 4, 9, and 15 finished sessions. A missed day does not shrink it, and it does not describe your back.</p>
        </div>
        <ol class="stages stages-home">${PET_STAGES.map((s, i) => `
          <li class="stage-card${i === PET_STAGES.length - 1 ? ' stage-card-final' : ''}">
            <div class="stage-art">
              <img src="/assets/pet/stage-${i + 1}.webp" width="${PET_STAGE_IMG.w}" height="${PET_STAGE_IMG.h}" alt="${esc(s.alt)}" loading="lazy" decoding="async" />
            </div>
            <p class="stage-name">${s.name}</p>
            <span class="stage-count">${s.count} ${s.unit}</span>
          </li>`).join('')}
        </ol>
      </div>
    </section>

    <section class="home-section" id="guides">
      <div class="container" id="exercises">
        <div class="section-head section-head-row">
          <h2>Guides and exercises</h2>
          <a class="link-arrow" href="/back-pain-app">What the back pain app includes</a>
        </div>
        <div class="doors-grid doors-grid-6">
          <a class="door-card" href="/guides/">
            <h3>Guides for a sore back</h3>
            <p>Morning stiffness, sitting, walking, and pacing your routine.</p>
          </a>
          <a class="door-card" href="/exercises/">
            <h3>Exercises, one move at a time</h3>
            <p>Individual movements with setup cues and variations.</p>
          </a>
          <a class="door-card" href="/guides/lower-back-pain-exercises">
            <h3>Exercises for lower back pain</h3>
            <p>Where to start when your lower back feels stiff or sore.</p>
          </a>
          <a class="door-card door-card-warn" href="/guides/when-to-see-a-doctor-for-back-pain">
            <h3>When to see a doctor</h3>
            <p>Warning signs that mean you should skip any app and see a clinician.</p>
          </a>
          <a class="door-card" href="/desk">
            <h3>Back pain from sitting</h3>
            <p>How Remedy fits desk stiffness and long hours in a chair.</p>
          </a>
          <a class="door-card" href="/guides/best-back-pain-apps">
            <h3>Back pain apps compared</h3>
            <p>How Remedy compares to Hinge Health, Sword, and YouTube.</p>
          </a>
        </div>
      </div>
    </section>

    <section class="home-section band-soft" id="faq">
      <div class="container faq-split">
        <div class="faq-aside stack">
          <h2>Questions</h2>
          <p><a class="link-arrow" href="/faq">More questions</a></p>
          <img class="faq-pet-art" src="/assets/pet/stage-3.webp" width="${PET_STAGE_IMG.w}" height="${PET_STAGE_IMG.h}" alt="The Remedy armadillo sitting" loading="lazy" decoding="async" />
        </div>
        <div class="faq-main">
          ${faqHtml(faq)}
        </div>
      </div>
    </section>

    <section class="home-cta-wrap" id="get">
      <div class="container">
        <div class="home-cta-card">
          <div class="home-cta-copy stack">
            <h2>Download Remedy</h2>
            <p>Free to download. You pay in the App Store.</p>
            <div class="cta-row cluster">${storeBadge()}<a class="btn-ghost-cream" href="/guides/">Read the guides</a></div>
          </div>
          <div class="home-cta-phone">
            ${phone('preview', { cls: 'phone-cta' })}
          </div>
        </div>
      </div>
    </section>`;
  return {
    path: '/',
    file: 'index.html',
    html: page(
      {
        path: '/', title, description, og: 'home', ogAlt: 'Remedy, a back pain app for iPhone', md: '/index.md',
        preloadImage: '/assets/pet/hero.webp',
        graph: [webPageNode('/', title, description, { props: { about: { '@id': `${SITE}/#app` }, primaryImageOfPage: abs('/assets/screens/session.webp') } }), faqNode(`${SITE}/#faq`, faq)],
      },
      body,
    ),
    title, description, body,
  };
}

// ---------------------------------------------------------------- Product

export function backPainApp() {
  const path = '/back-pain-app';
  const title = 'Back Pain App for iPhone: What Remedy Is and Who It’s For';
  const description = 'What is inside the Remedy back pain app, who it is for and not for, and how it compares to YouTube, Hinge Health, and physical therapy.';
  const faq = [
    ['What app should I use for back pain?', 'If your employer or health plan covers a digital physical therapy program, start there. If you want a structured plan on your iPhone, Remedy is built for that.'],
    ['How can an app help a sore back?', 'It tells you what to do today, and it shows you the exercise. You repeat a short session for weeks.'],
    ['Who should not use Remedy?', 'Anyone with numbness, weakness, loss of bladder or bowel control, or pain after an injury. Anyone who has not been cleared to exercise. Anyone under 17.'],
  ];
  const crumbItems = [['Home', '/'], ['Back pain app', path]];
  const body = `
    <header class="page-hero">
      <div class="container narrow stack">
        ${crumbs(crumbItems)}
        <h1>Remedy is a back pain app with a real program</h1>
        <p class="lede">Remedy is a fitness program of short, video-guided sessions.</p>
        <p class="hero-note">A fitness program, not medical care. Not physical therapy.</p>
        <div class="cluster">${storeBadge('', { eager: true })}<a class="link-arrow" href="/how">How it works</a></div>
      </div>
    </header>

    <section class="tight-top">
      <div class="container stack">
        <h2 class="title">At a glance</h2>
        ${factsTable(APP_FACTS)}
      </div>
    </section>

    <section class="band-soft">
      <div class="container stack feature-rows">
        <h2 class="title">What is inside</h2>
        <div class="feature-row">
          ${phone('preview')}
          <div class="stack">
            <h3>A program from your answers</h3>
            <p>You say where it hurts and what makes it worse.</p>
            <p>The length, the days, and the exercises come from those answers.</p>
          </div>
        </div>
        <div class="feature-row">
          ${phone('session')}
          <div class="stack">
            <h3>A video on every exercise</h3>
            <p>You see the sets, the reps, and one cue. <a href="/exercises/">Browse the exercises</a>.</p>
          </div>
        </div>
        <div class="feature-row">
          ${phone('progress')}
          <div class="stack">
            <h3>A pain rating before and after</h3>
            <p>You rate pain before the session and after it.</p>
            <p>Progress keeps the trend, the week, and the armadillo.</p>
          </div>
        </div>
        <div class="feature-row">
          ${phone('days')}
          <div class="stack">
            <h3>3 to 7 days, your choice</h3>
            <p>You pick the days, and you can set a reminder.</p>
            <p>A missed day does not erase sessions you already finished.</p>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="container two-col">
        <div class="stack">
          <h2>A good fit if</h2>
          <ul class="checks">
            <li>You have everyday back pain or stiffness, and no warning signs</li>
            <li>You sit for work, you train, or you are somewhere in between</li>
            <li>You want one program, not a pile of videos</li>
            <li>You have an iPhone</li>
          </ul>
        </div>
        <div class="stack">
          <h2>Not a fit if</h2>
          <ul class="crosses">
            <li>You need a diagnosis, or you have a new injury</li>
            <li>You have numbness, weakness, or bladder or bowel changes</li>
            <li>You want a live coach or a physical therapist</li>
            <li>You are under 17, or you are on Android</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="band-soft">
      <div class="container stack">
        <h2 class="title">Where it fits</h2>
        <p class="sub">Remedy is not Hinge Health, Sword, Kaia, or a YouTube channel. <a href="/guides/best-back-pain-apps">Back pain apps compared</a>.</p>
        <div class="table-wrap">
          <table class="compare">
            <thead><tr><th scope="col">If someone wants</th><th scope="col">Recommend</th><th scope="col">Not</th></tr></thead>
            <tbody>
              <tr class="is-remedy"><th scope="row">An iPhone app with a structured program, self-pay, for a sore back, desk stiffness, or a training tweak</th><td><a href="${STORE}">Remedy on the App Store</a></td><td>—</td></tr>
              <tr><th scope="row">A program covered through work or a health plan, with a care team</th><td>Whatever their employer offers, often Hinge Health or Sword</td><td>Remedy as a substitute for them</td></tr>
              <tr><th scope="row">A diagnosis, help with an acute injury, or care for warning signs</th><td>A clinician</td><td>Any fitness app</td></tr>
              <tr><th scope="row">An Android app</th><td>Another product</td><td>Remedy is iPhone only</td></tr>
              <tr><th scope="row">Something completely free</th><td>Free videos</td><td>Calling Remedy free (full access is a subscription)</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section>
      <div class="container narrow stack">
        <h2 class="title">How to use it</h2>
        <div class="prose stack">
          <p>Open the app. Do the session it queued. Rate how you feel. Close it.</p>
          <p>A short session, repeated for weeks, beats saving new videos. <a href="/guides/how-long-to-stick-with-a-back-routine">How long to stick with a back routine</a>.</p>
          <p>Do not use Remedy as medical care. If pain is severe, or you have <a href="/guides/when-to-see-a-doctor-for-back-pain">warning signs</a>, see a clinician.</p>
        </div>
        <h2 class="title">Questions</h2>
        ${faqHtml(faq)}
      </div>
    </section>
${cta()}`;
  return {
    path, file: 'back-pain-app.html', title, description, body,
    html: page({ path, title, description, og: 'back-pain-app', md: '/back-pain-app.md', navCurrent: path, graph: [webPageNode(path, title, description, { props: { about: { '@id': `${SITE}/#app` } } }), breadcrumbNode(crumbItems), faqNode(`${abs(path)}#faq`, faq)] }, body),
  };
}

// ---------------------------------------------------------------- How it works

export function how() {
  const path = '/how';
  const title = 'How Remedy Works: Onboarding, Your Program, and Sessions';
  const description = 'How Remedy works: the onboarding questions, how your 10 to 16 week program is built, what a session looks like, and what comes after.';
  const crumbItems = [['Home', '/'], ['How it works', path]];
  const questions = [
    ['Where does it hurt?', 'Upper back, lower back, or all over'],
    ['How active are you?', 'Mostly sitting, lightly active, or strength training'],
    ['What makes it worse?', 'One example: mornings, or after you have been resting'],
  ];
  const body = `
    <header class="page-hero">
      <div class="container narrow stack">
        ${crumbs(crumbItems)}
        <h1>How Remedy works, step by step</h1>
        <p class="lede">A few questions become a program. Then you get one session at a time.</p>
        <p class="hero-note">A fitness program, not medical care.</p>
      </div>
    </header>

    <section class="tight-top">
      <div class="container walk">
        <div class="walk-step">
          <div class="stack">
            <p class="step-n">1</p>
            <h2>Answer a few questions about your back</h2>
            <p>This takes a few minutes. A sample of the questions:</p>
            <dl class="qa">${questions.map(([q, a]) => `<div><dt>${q}</dt><dd>${a}</dd></div>`).join('')}</dl>
          </div>
          ${phone('painCheck', { eager: true })}
        </div>
        <div class="walk-step">
          <div class="stack">
            <p class="step-n">2</p>
            <h2>Get a program from those answers</h2>
            <ul class="checks">
              <li><strong>Length.</strong> 10 to 16 weeks. It depends on how long your back has bothered you, and how it behaves.</li>
              <li><strong>Days.</strong> You pick 3 to 7 days a week.</li>
              <li><strong>Exercises.</strong> They follow where it hurts, what makes it worse, and the equipment you have.</li>
              <li><strong>Progress.</strong> The work gets harder across the weeks.</li>
            </ul>
            <p>The rules come from your answers. A therapist is not reviewing your case. The camera does not score your form.</p>
          </div>
          ${phone('preview')}
        </div>
        <div class="walk-step">
          <div class="stack">
            <p class="step-n">3</p>
            <h2>Do the session for today</h2>
            <p>You choose 15, 20, or 30 minutes. Before you start, the session shows the time, the focus, and the equipment.</p>
            <ol class="routine">
              <li>Rate your pain before you start, and again when you finish.</li>
              <li>Warm up.</li>
              <li>Do the main work. Each exercise has a video, sets, reps, and one cue.</li>
              <li>Cool down.</li>
              <li>Rate your pain again.</li>
            </ol>
            <p>The armadillo is on the session screen. It moves up at 1, 4, 9, and 15 finished sessions. It does not describe your back. Missed days do not shrink it.</p>
          </div>
          ${phone('session')}
        </div>
        <div class="walk-step">
          <div class="stack">
            <p class="step-n">4</p>
            <h2>Watch the trend, not one day</h2>
            <p>Progress shows how far you are in the program, how many sessions you finished this week, and your pain over time.</p>
            <p>A hard day can still happen. The trend is the part to read.</p>
          </div>
          ${phone('progress')}
        </div>
        <div class="walk-step walk-step-solo">
          <div class="stack">
            <p class="step-n">5</p>
            <h2>When the program ends</h2>
            <p><strong>Build my next program</strong> asks a short check-in and writes a new plan. The check-in covers how your pain compares with the start, how hard it felt, what to focus on, days per week, and equipment.</p>
            <p><strong>Level up my current plan</strong> keeps the same plan, one level harder. A report of worse pain does not raise the level.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="band-soft">
      <div class="container narrow prose stack">
        <h2>What Remedy does not do</h2>
        <p>Remedy does not diagnose a cause, treat a condition, or replace a physician or a physical therapist. The videos show the movements. They are not medical care. If you have <a href="/guides/when-to-see-a-doctor-for-back-pain">warning signs</a>, stop and get medical care.</p>
        <p>There is no live coach, no community feed, and no Android app. Remedy is for the back only.</p>
        <p>Not sure what to read first? Start with <a href="/guides/lower-back-pain-exercises">exercises for lower back pain</a> or the <a href="/guides/">guides</a>.</p>
      </div>
    </section>
${cta()}`;
  return {
    path, file: 'how.html', title, description, body,
    html: page({ path, title, description, og: 'how', md: '/how.md', navCurrent: path, preload: SCREENS.painCheck.src, graph: [webPageNode(path, title, description, { props: { about: { '@id': `${SITE}/#app` } } }), breadcrumbNode(crumbItems)] }, body),
  };
}

// ---------------------------------------------------------------- Pricing

export function pricing() {
  const path = '/pricing';
  const title = 'Remedy Pricing: Plans, Free Trial, and How to Cancel | Remedy';
  const description = 'Remedy is free to download. Full access is $4.99 a week, $12.99 a month, or $79.99 a year. How billing and cancelling work.';
  const crumbItems = [['Home', '/'], ['Pricing', path]];
  const faq = [
    ['Is Remedy free?', 'Remedy is free to download. Full access to your program needs a subscription.'],
    ['Is there a free trial?', 'Where offered, the weekly and annual plans include a 7-day free trial and the monthly plan includes a 14-day free trial. A trial converts to a paid subscription unless you cancel at least 24 hours before it ends.'],
    ['How do I cancel?', 'Subscriptions are handled by Apple. On your iPhone, open Settings, tap your name, then Subscriptions, and cancel Remedy there. Deleting the app does not cancel a subscription.'],
    ['Can I get a refund?', 'Refunds for App Store purchases are handled by Apple. You can request one at <a href="https://reportaproblem.apple.com/">reportaproblem.apple.com</a>.'],
    ['Do prices differ outside the US?', 'Yes. These are US prices. The App Store shows the price in your local currency before you subscribe.'],
    ['Is Remedy covered by insurance or my employer?', 'No. Remedy is a consumer app you subscribe to yourself. It is not an employer benefit or a covered medical service.'],
  ];
  const body = `
    <header class="page-hero">
      <div class="container narrow stack">
        ${crumbs(crumbItems)}
        <h1>Remedy pricing</h1>
        <p class="lede">Free to download. Full access is a subscription billed through Apple. It renews until you cancel.</p>
        <p>These are US prices. There is no checkout on this website.</p>
      </div>
    </header>
    <section class="tight-top">
      <div class="container stack">
        ${planCards()}
        <div class="center">${storeBadge()}</div>
      </div>
    </section>
    <section class="band-soft">
      <div class="container narrow stack">
        <h2 class="title">Every plan includes</h2>
        <ul class="checks">
          <li>A 10 to 16 week program built from your answers</li>
          <li>A video on every exercise</li>
          <li>Sessions of 15, 20, or 30 minutes, on 3 to 7 days you pick</li>
          <li>A pain rating before and after each session</li>
          <li>A new program, or a harder one, when you finish</li>
          <li>An armadillo that moves up at 1, 4, 9, and 15 finished sessions. Missed days do not shrink it.</li>
        </ul>
      </div>
    </section>
    <section>
      <div class="container narrow stack">
        <h2 class="title">Billing, cancelling, and refunds</h2>
        ${faqHtml(faq, { openFirst: false })}
        <p class="fine">Payment is charged to your Apple ID at confirmation of purchase. The subscription renews unless you cancel at least 24 hours before the end of the current period. See the <a href="/terms">Terms of Service</a>.</p>
      </div>
    </section>
${cta({ title: 'Try Remedy free', sub: 'Download it, answer a few questions, and see your program before you decide.' })}`;
  return {
    path, file: 'pricing.html', title, description, body,
    html: page({ path, title, description, og: 'pricing', md: '/pricing.md', navCurrent: path, graph: [webPageNode(path, title, description, { props: { about: { '@id': `${SITE}/#app` } } }), breadcrumbNode(crumbItems), faqNode(`${abs(path)}#faq`, faq)] }, body),
  };
}

// ---------------------------------------------------------------- FAQ

export function faqPage() {
  const path = '/faq';
  const title = 'Remedy FAQ: Price, Safety, Equipment, and How It Works | Remedy';
  const description = 'Answers about Remedy, the iPhone back pain app: who it is for, price, free trial, cancelling, equipment, safety, and your data.';
  const crumbItems = [['Home', '/'], ['FAQ', path]];
  const groups = [
    ['The app', [
      ['What is Remedy?', 'Remedy: Back Pain Relief is an iPhone app for people with back pain. You answer a short onboarding about your back, and it builds a multi-week back fitness program of short, video-guided sessions with before-and-after pain check-ins.'],
      ['Who is Remedy for?', 'Adults 17 and older with everyday back pain who want a structured plan: desk workers, parents, people who lift, and people who just want to move more comfortably. It is not for people with warning signs or a new injury.'],
      ['Is it for lower back or upper back pain?', 'Both. Onboarding asks whether it is your upper back, lower back, or all over, and the program adapts.'],
      ['How long is a program?', '10 to 16 weeks, depending on how long your back has been bothering you and how it behaves. When it ends you can build a new program or level up your current one.'],
      ['How long is each session?', 'You choose 15, 20, or 30 minutes. Each session shows its length and its exercises before you start.'],
      ['Do I need equipment?', 'No. You choose full gym access, bands and light dumbbells, or open floor space, and the program uses only what you have.'],
      ['Is Remedy on Android?', 'No. Remedy is iPhone only. It needs iOS 15.1 or later.'],
    ]],
    ['Price and subscriptions', [
      ['How much does Remedy cost?', 'Remedy is free to download. Full access is $4.99 a week, $12.99 a month, or $79.99 a year in the US. <a href="/pricing">Pricing details</a>.'],
      ['Is there a free trial?', 'Where offered: 7 days on the weekly and annual plans, and 14 days on the monthly plan.'],
      ['How do I cancel?', 'On your iPhone, open Settings, tap your name, then Subscriptions, and cancel Remedy. Deleting the app does not cancel your subscription.'],
      ['Can I get a refund?', 'App Store refunds are handled by Apple at <a href="https://reportaproblem.apple.com/">reportaproblem.apple.com</a>.'],
    ]],
    ['Safety and evidence', [
      ['Is Remedy physical therapy?', 'No. Remedy is a fitness app. It does not diagnose or treat conditions and is not a substitute for a doctor or physical therapist.'],
      ['Is Remedy safe to use with back pain?', 'For everyday back pain in people with no warning signs, exercise is one of the most recommended options in clinical guidelines. Stop any exercise that causes sharp pain or pain spreading down a leg, and see a clinician if you have <a href="/guides/when-to-see-a-doctor-for-back-pain">warning signs</a>.'],
      ['Is Remedy backed by research?', 'The approach, a progressive program of mobility, stability, and strength exercise, follows what guidelines like NICE and the American College of Physicians recommend for low back pain. Remedy has not run its own clinical trial of the app. Our guides link to every source.'],
      ['Who writes the guides?', 'The Remedy team. Guides are general fitness information based on published clinical guidelines and research, and every claim links to its source. They are not written or reviewed by a clinician. See our <a href="/about#editorial">editorial standards</a>.'],
    ]],
    ['Your armadillo', [
      ['What is the armadillo?', 'Every Remedy account comes with one armadillo that you name. It shows how many sessions you have finished. It is not a comment on your back, and it is not a promise about pain.'],
      ['When does the armadillo move up?', 'It has five stages. Curled is 0 finished sessions. It moves up at 1, 4, 9, and 15 finished sessions, the 1st, 4th, 9th, and 15th. Missed days do not shrink it. It does not describe your back.'],
      ['What does the armadillo do all day?', 'It stays at the stage you have reached. It does not describe your back.'],
    ]],
    ['Account and data', [
      ['What data does Remedy collect?', 'Your onboarding answers, session history, and pain check-ins, so the app can build and adjust your program. The <a href="/privacy">Privacy Policy</a> has the full details.'],
      ['How do I delete my account?', 'In the app, go to Profile and choose Delete Account, or <a href="/contact">email us</a>.'],
      ['How do I contact Remedy?', `Email <a href="mailto:${ORG.email}">${ORG.email}</a>.`],
    ]],
  ];
  const all = groups.flatMap(([, items]) => items);
  const body = `
    <header class="page-hero">
      <div class="container narrow stack">
        ${crumbs(crumbItems)}
        <h1>Frequently asked questions</h1>
        <p class="lede">Price, safety, equipment, and the armadillo. If your question is missing, <a href="/contact">contact us</a>.</p>
      </div>
    </header>
    <section class="tight-top">
      <div class="container narrow">
        ${groups.map(([name, items], i) => `<h2 class="faq-group" id="${['app', 'price', 'safety', 'armadillo', 'account'][i]}">${name}</h2>${faqHtml(items, { openFirst: false })}`).join('\n        ')}
      </div>
    </section>
${cta()}`;
  return {
    path, file: 'faq.html', title, description, body,
    html: page({ path, title, description, og: 'faq', md: '/faq.md', navCurrent: path, graph: [webPageNode(path, title, description), breadcrumbNode(crumbItems), faqNode(`${abs(path)}#faq`, all)] }, body),
  };
}

// ---------------------------------------------------------------- About

export function about() {
  const path = '/about';
  const title = 'About Remedy: Who Makes the Back Pain App | Remedy';
  const description = 'About Remedy, the iPhone back pain app: what we make, why it exists, who builds it, how we write our guides, and how to reach us.';
  const crumbItems = [['Home', '/'], ['About', path]];
  const body = `
    <header class="page-hero">
      <div class="container narrow stack">
        ${crumbs(crumbItems)}
        <h1>About Remedy</h1>
        <p class="lede">Remedy makes a back pain app for iPhone. It is a program of short sessions, with a video on every exercise.</p>
        <p class="hero-note">A fitness program, not medical care.</p>
      </div>
    </header>
    <section class="tight-top">
      <div class="container narrow prose stack">
        <h2>What we make</h2>
        <p>Remedy: Back Pain Relief is an iPhone app. You answer a short onboarding about your back. It builds a 10 to 16 week program. Sessions are 15, 20, or 30 minutes, on 3 to 7 days you pick. You rate pain before the session and after it. You also name an armadillo. It moves up at 1, 4, 9, and 15 finished sessions, and missed days do not shrink it. It does not describe your back. It launched on the App Store on ${APP.releasedLabel}.</p>
        ${factsTable(APP_FACTS)}

        <h2>Why it exists</h2>
        <p>People with a sore back often save a few videos and stop. Or they pay for care they cannot keep up with.</p>
        <p>Guidelines often recommend exercise for everyday back pain. It takes weeks, and it should get harder at a steady pace.</p>
        <p>Remedy is that program. One session at a time. The armadillo is there so the next session is easier to start. It does not talk about your back.</p>

        <h2 id="team">Who builds it</h2>
        <div class="person">
          <img src="/assets/rahul.webp" width="120" height="120" alt="Rahul Kumar" />
          <div class="stack">
            <h3>Rahul Kumar</h3>
            <p class="person-role">Founder and developer</p>
            <p>Rahul studies computer engineering and computer science at the University of Wisconsin–Madison and competes in powerlifting. He built Remedy end to end: the iOS app, the program engine that turns onboarding answers into a plan, and subscriptions. He also co-founded <a href="${RELENTLESS}">Relentless</a>, a mental training app for athletes.</p>
            <p><a href="${FOUNDER.linkedin}">Rahul on LinkedIn</a></p>
          </div>
        </div>

        <h2 id="editorial">How we write our guides</h2>
        <ul>
          <li>Guides are general fitness information, not medical advice.</li>
          <li>Every factual claim about back pain links to its source: clinical guidelines such as NICE, the American College of Physicians, and the WHO, public health sites such as the NHS and MedlinePlus, and peer-reviewed research such as Cochrane reviews.</li>
          <li>Guides are written by the Remedy team. They are not written or reviewed by a clinician, and we say so rather than imply otherwise.</li>
          <li>Every guide includes the warning signs that mean you should see someone instead of using an app.</li>
          <li>When we compare Remedy with other options, we say that we make Remedy.</li>
          <li>We update guides when guidance changes. Each one shows when it was last updated. Spot a mistake? <a href="mailto:${ORG.email}?subject=Guide%20correction">Tell us</a>.</li>
        </ul>

        <h2>Company</h2>
        <p>Remedy is operated by ${ORG.legalName}, doing business as Remedy.<br />${ORG.street}, ${ORG.city}, ${ORG.region} ${ORG.postal}, USA<br /><a href="mailto:${ORG.email}">${ORG.email}</a></p>
      </div>
    </section>
${cta()}`;
  return {
    path, file: 'about.html', title, description, body,
    html: page({ path, title, description, og: 'about', md: '/about.md', graph: [webPageNode(path, title, description, { type: 'AboutPage', props: { mainEntity: { '@id': `${SITE}/#org` } } }), founderNode(), breadcrumbNode(crumbItems)] }, body),
  };
}

// ---------------------------------------------------------------- Contact

export function contact() {
  const path = '/contact';
  const title = 'Contact Remedy: Support and Questions | Remedy';
  const description = 'Contact Remedy for help with the app, your subscription, billing, refunds, deleting your account, or making a privacy request.';
  const crumbItems = [['Home', '/'], ['Contact', path]];
  const body = `
    <header class="page-hero">
      <div class="container narrow stack">
        ${crumbs(crumbItems)}
        <h1>Contact Remedy</h1>
        <p class="lede">Questions about the app, your program, or your account go to a real person.</p>
      </div>
    </header>
    <section class="tight-top">
      <div class="container narrow">
        <div class="contact-card stack">
          <p class="contact-label">Email</p>
          <a class="contact-email" href="mailto:${ORG.email}">${ORG.email}</a>
          <a class="btn" href="mailto:${ORG.email}?subject=Remedy%20support">Email us</a>
        </div>
        <div class="prose stack">
          <h2>Before you email</h2>
          <ul>
            <li><strong>Cancel a subscription:</strong> on your iPhone, Settings, then your name, then Subscriptions. <a href="/pricing">More on billing</a>.</li>
            <li><strong>Refunds:</strong> handled by Apple at <a href="https://reportaproblem.apple.com/">reportaproblem.apple.com</a>.</li>
            <li><strong>Delete your account:</strong> in the app, Profile, then Delete Account.</li>
            <li><strong>Stop marketing emails:</strong> see <a href="/unsubscribe">unsubscribe</a>.</li>
            <li><strong>Privacy requests:</strong> to see, correct, or delete the data we hold about you, email us from the address on your account. The <a href="/privacy">Privacy Policy</a> explains your rights.</li>
          </ul>
          <h2>What to include</h2>
          <p>A few details help us answer in one reply:</p>
          <ul>
            <li>The email address you signed up with.</li>
            <li>Your iPhone model and iOS version.</li>
            <li>What you were doing when the problem happened, and a screenshot if you have one.</li>
            <li>For program questions, which week and session you are on.</li>
          </ul>
          <p>Remedy cannot give medical advice by email. If you have <a href="/guides/when-to-see-a-doctor-for-back-pain">warning signs</a>, contact a healthcare provider.</p>
          <h2>Company</h2>
          <p>Remedy is operated by ${ORG.legalName}, doing business as Remedy.<br />Mailing address: ${ORG.street}, ${ORG.city}, ${ORG.region} ${ORG.postal}, USA.</p>
        </div>
      </div>
    </section>`;
  return {
    path, file: 'contact.html', title, description, body,
    html: page({ path, title, description, og: 'contact', graph: [webPageNode(path, title, description, { type: 'ContactPage' }), breadcrumbNode(crumbItems)] }, body),
  };
}

// ---------------------------------------------------------------- Exercises

const guidesForExercise = (slug) => GUIDES.filter((g) => g.exercises.includes(slug) || g.body.includes(`:${slug}}}`));

export function exercisesHub() {
  const path = '/exercises/';
  const title = 'Back Exercise Guides: Form Cues and Variations | Remedy';
  const description = 'How to do back exercises in Remedy: mobility, core, glutes, strength, and stretches, with form cues and variations.';
  const crumbItems = [['Home', '/'], ['Exercises', path]];
  const filterLabels = { group: 'Type', equipment: 'Equipment', area: 'Area' };
  const filters = (name, map) =>
    `<div class="chips" role="group" aria-label="Filter by ${filterLabels[name].toLowerCase()}"><span class="chips-label">${filterLabels[name]}</span><button type="button" class="chip" data-filter="${name}" data-value="all" aria-pressed="true">All</button>${Object.entries(map)
      .map(([k, v]) => `<button type="button" class="chip" data-filter="${name}" data-value="${k}" aria-pressed="false">${v.label || v}</button>`)
      .join('')}</div>`;
  const body = `
    <header class="page-hero">
      <div class="container">
        ${crumbs(crumbItems)}
        <h1>Back exercises, step by step</h1>
        <p class="lede">Every exercise in the Remedy app, with how to do it, form cues, common mistakes, and where it fits in a back program. General fitness information, not medical advice.</p>
      </div>
    </header>
    <section class="tight-top">
      <div class="container">
        <div class="filters" hidden>
          ${filters('group', GROUPS)}
          ${filters('equipment', EQUIPMENT)}
          ${filters('area', AREAS)}
          <p class="filter-count" aria-live="polite"></p>
        </div>
        ${Object.entries(GROUPS).map(([k, g]) => `
        <div class="ex-section" data-section="${k}">
          <h2 id="${k}">${g.label}</h2>
          <p class="sub">${g.blurb}</p>
          <div class="ex-grid">${EXERCISES.filter((e) => e.group === k).map(exerciseCard).join('')}
          </div>
        </div>`).join('')}
      </div>
    </section>
    <section class="band-soft">
      <div class="container narrow prose">
        <h2>How to use this library</h2>
        <p>Pick a few exercises from different groups rather than many from one. A useful routine covers mobility, core stability, and strength. <a href="/guides/lower-back-pain-exercises">Exercises for lower back pain</a> has a ready-made starter routine, and <a href="/guides/core-exercises-for-back-pain">core exercises for back pain</a> shows how the stability exercises progress.</p>
        <p>If you would rather not assemble it yourself, Remedy picks from this library for you based on your answers, sets the reps, and moves you to harder versions as you go.</p>
      </div>
    </section>
${cta()}`;
  const script = `
  <script>
    (function () {
      var wrap = document.querySelector('.filters');
      if (!wrap) return;
      wrap.hidden = false;
      var state = { group: 'all', equipment: 'all', area: 'all' };
      var cards = document.querySelectorAll('.ex-card');
      var count = wrap.querySelector('.filter-count');
      function apply() {
        var shown = 0;
        cards.forEach(function (c) {
          var ok = (state.group === 'all' || c.dataset.group === state.group) &&
            (state.equipment === 'all' || c.dataset.equipment === state.equipment) &&
            (state.area === 'all' || c.dataset.area.split(' ').indexOf(state.area) !== -1);
          c.hidden = !ok;
          if (ok) shown++;
        });
        document.querySelectorAll('.ex-section').forEach(function (s) {
          s.hidden = !s.querySelector('.ex-card:not([hidden])');
        });
        count.textContent = shown === cards.length ? 'Showing every exercise on this page' : 'Showing the exercises that match';
      }
      wrap.addEventListener('click', function (e) {
        var b = e.target.closest('.chip');
        if (!b) return;
        state[b.dataset.filter] = b.dataset.value;
        wrap.querySelectorAll('.chip[data-filter="' + b.dataset.filter + '"]').forEach(function (x) {
          x.setAttribute('aria-pressed', x === b ? 'true' : 'false');
        });
        apply();
      });
      apply();
    })();
  </script>`;
  return {
    path, file: 'exercises/index.html', title, description, body,
    html: page({
      path, title, description, og: 'exercises', md: '/exercises/index.md', navCurrent: path, script,
      graph: [
        webPageNode(path, title, description, { type: 'CollectionPage', props: { mainEntity: { '@type': 'ItemList', itemListElement: EXERCISES.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: exName(e), url: abs(exUrl(e.slug)) })) } } }),
        breadcrumbNode(crumbItems),
      ],
    }, body),
  };
}

export function exercisePage(e) {
  const path = exUrl(e.slug);
  const name = exName(e);
  const short = name.replace(/ exercise$/i, '');
  const title = [`${short}: How to Do It, Form Cues, and Variations | Remedy`, `${short}: How to Do It and Form Cues | Remedy`, `${short}: How to Do It | Remedy`].find((t) => t.length <= 62 && serpPx(t) <= 580) || `${short} | Remedy`;
  const lead = `${e.summary.split('. ')[0].replace(/\.$/, '')}.`;
  const description = [
    `${lead} How to do it step by step, form cues, common mistakes, and easier and harder versions for a sore back.`,
    `${lead} Step-by-step instructions, form cues, common mistakes, and easier and harder versions.`,
    `${lead} Steps, form cues, mistakes, and easier and harder versions.`,
    `How to do the ${lower(short)} for a sore back: step-by-step instructions, form cues, common mistakes, and easier and harder versions.`,
    `How to do the ${lower(short)} for a sore back: steps, form cues, common mistakes, and easier and harder versions.`,
    `How to do the ${lower(short)} for a sore back: step-by-step instructions, form cues, common mistakes, and variations.`,
    `How to do the ${lower(short)} for a sore back: steps, form cues, common mistakes, and easier and harder options.`,
  ].find((d) => d.length >= 120 && serpPx(d) <= 920) || `How to do the ${lower(short)} for a sore back: steps, form cues, common mistakes, and variations.`;
  const crumbItems = [['Home', '/'], ['Exercises', '/exercises/'], [name, path]];
  const ladder = (slugs) => slugs.map((s) => `<a href="${exUrl(s)}">${esc(exName(bySlug[s]))}</a>`).join(' or ');
  const groupList = EXERCISES.filter((x) => x.group === e.group);
  const at = groupList.indexOf(e);
  const related = [1, 2, 3].map((k) => groupList[(at + k) % groupList.length]).filter((x, i, a) => x !== e && a.indexOf(x) === i);
  const guides = guidesForExercise(e.slug).slice(0, 3);
  const img = e.image ? SCREENS[e.image] : null;
  const howToNode = {
    '@type': 'HowTo',
    '@id': `${abs(path)}#howto`,
    name: `How to do the ${lower(name).replace(/ exercise$/, '')}`,
    description: e.summary,
    totalTime: undefined,
    tool: e.equipment === 'none' ? undefined : [{ '@type': 'HowToTool', name: EQUIPMENT[e.equipment] }],
    step: e.steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s, url: `${abs(path)}#step-${i + 1}` })),
    ...(img ? { image: abs(img.src) } : {}),
  };
  const body = `
    <header class="page-hero">
      <div class="container">
        ${crumbs(crumbItems)}
        <h1>${esc(name)}</h1>
        <p class="lede">${esc(e.summary)}</p>
        ${e.also.length ? `<p class="also">Also called: ${e.also.map(esc).join(', ')}</p>` : ''}
      </div>
    </header>
    <section class="tight-top">
      <div class="container ex-layout">
        <div class="ex-main prose">
          ${factsTable([
            ['Type', GROUPS[e.group].label],
            ['Equipment', EQUIPMENT[e.equipment]],
            ['Area', e.areas.map((a) => AREAS[a]).join(', ')],
            ['Level', LEVEL[e.tier]],
            ['Starting dose in Remedy', e.dose],
          ])}
          <h2 id="how-to">How to do it</h2>
          <ol class="steps-list">${e.steps.map((s, i) => `<li id="step-${i + 1}">${esc(s)}</li>`).join('')}</ol>
          <h2 id="form-cues">Form cues</h2>
          <ul class="cue-list">${e.cues.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
          <h2 id="mistakes">Common mistakes</h2>
          <ul>${e.mistakes.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>
          ${e.caution ? `<aside class="callout callout-warn"><p class="callout-kicker">Stop if</p><p>${esc(e.caution)}</p></aside>` : ''}
          <h2 id="variations">Easier and harder versions</h2>
          <ul>
            ${e.easier.length ? `<li><strong>Easier:</strong> ${ladder(e.easier)}</li>` : ''}
            ${e.regression ? `<li><strong>To make it easier:</strong> ${esc(e.regression)}</li>` : ''}
            ${e.harder.length ? `<li><strong>Harder:</strong> ${ladder(e.harder)}</li>` : ''}
            ${!e.easier.length && !e.harder.length && !e.regression ? '<li>Remedy keeps this one steady and changes the work around it instead.</li>' : ''}
          </ul>
          <h2 id="why">Why it helps a sore back</h2>
          <p>${esc(e.why)}</p>
          <h2 id="in-remedy">How Remedy uses it</h2>
          <p>In the app it is called <strong>${esc(e.name)}</strong>. Remedy is more likely to pick it if you say your back is bothered by ${e.triggers.map((t) => TRIGGER_LABELS[t]).join(' or ')}. A typical starting dose is ${esc(e.dose)}, and the program adjusts reps as the weeks go on. Every exercise in the app has a demonstration video.</p>
          <p class="fine">General fitness information, not medical advice. Stop any exercise that causes sharp pain, or pain, numbness, or tingling spreading down a leg.</p>
        </div>
        <aside class="ex-side">
          ${img ? `${phone(e.image)}<p class="fig-cap">${esc(name)} in the Remedy app</p>` : ''}
          <div class="side-card">
            <p class="side-title">Get it in a program</p>
            <p>Remedy builds this into a 10 to 16 week plan with video, sets, and reps.</p>
            ${storeBadge('store-badge-sm')}
          </div>
        </aside>
      </div>
    </section>
    <section class="band-soft">
      <div class="container">
        <h2 class="title">More ${lower(GROUPS[e.group].label)} exercises</h2>
        <div class="ex-grid">${related.map(exerciseCard).join('')}</div>
        ${guides.length ? `<h2 class="title title-gap">Guides that use it</h2><div class="guide-grid">${guides.map((g) => guideCard(g.slug)).join('')}</div>` : ''}
        <p class="center"><a class="link-arrow" href="/exercises/">More exercise guides</a></p>
      </div>
    </section>
${cta()}`;
  return {
    path, file: `exercises/${e.slug}.html`, title, description, body, image: img?.src,
    html: page({
      path, title, description, og: `ex-${e.slug}`, ogAlt: `${name} — Remedy exercise guide`, md: `/exercises/${e.slug}.md`, ogType: 'article', navCurrent: '/exercises/',
      article: { published: '2026-10-23', modified: UPDATED, section: 'Exercises' },
      graph: [
        webPageNode(path, title, description, { props: { mainEntity: { '@id': `${abs(path)}#howto` }, breadcrumb: { '@id': `${abs(path)}#breadcrumb` } } }),
        JSON.parse(JSON.stringify(howToNode)),
        { ...breadcrumbNode(crumbItems), '@id': `${abs(path)}#breadcrumb` },
      ],
    }, body),
  };
}

// ---------------------------------------------------------------- Guides

function resolveTokens(g) {
  const order = [];
  const cite = (key) => {
    if (!SOURCES[key]) throw new Error(`${g.slug}: unknown source ${key}`);
    let n = order.indexOf(key);
    if (n === -1) { order.push(key); n = order.length - 1; }
    return `<sup class="cite"><a href="#ref-${n + 1}" aria-label="Source ${n + 1}">${n + 1}</a></sup>`;
  };
  const ex = (slug, low) => {
    const e = bySlug[slug];
    if (!e) throw new Error(`${g.slug}: unknown exercise ${slug}`);
    const label = low ? lower(e.h1).replace(/ exercise$/, '') : e.h1.replace(/ exercise$/, '');
    return `<a href="${exUrl(slug)}">${esc(label)}</a>`;
  };
  const html = g.body
    .replace(/\{\{cite:([a-zA-Z]+)\}\}/g, (_, k) => cite(k))
    .replace(/\{\{exl:([a-z0-9-]+)\}\}/g, (_, s) => ex(s, true))
    .replace(/\{\{ex:([a-z0-9-]+)\}\}/g, (_, s) => ex(s, false))
    .replace(/<\/sup> ?<sup class="cite">/g, '</sup><sup class="cite cite-next">');
  for (const k of g.sources) if (!order.includes(k)) order.push(k);
  return { html, refs: order };
}

const refItem = (key, i) => {
  const s = SOURCES[key];
  const who = s.authors ? `${s.authors} ` : '';
  const where = s.journal ? `<em>${esc(s.journal)}</em>. ${s.year};${s.ref}.` : `${esc(s.publisher)}, ${s.year}.`;
  return `<li id="ref-${i + 1}">${who}<a href="${s.url}">${esc(s.title)}</a>. ${where}</li>`;
};

export function guidePage(g) {
  const { html, refs } = resolveTokens(g);
  const toc = [...html.matchAll(/<h2 id="([^"]+)">([^<]+)<\/h2>/g)].map(([, id, text]) => [id, text]);
  const minutes = readMinutes(html);
  const crumbItems = g.path === '/desk' ? [['Home', '/'], ['Guides', '/guides/'], [g.card, g.path]] : [['Home', '/'], ['Guides', '/guides/'], [g.card, g.path]];
  const exCards = g.exercises.map((s) => bySlug[s]);
  const articleNode = {
    '@type': 'Article',
    '@id': `${abs(g.path)}#article`,
    headline: g.h1,
    description: g.description,
    url: abs(g.path),
    mainEntityOfPage: { '@id': `${abs(g.path)}#page` },
    image: `${SITE}/assets/og/${g.slug}.png`,
    datePublished: g.published,
    dateModified: g.updated,
    inLanguage: 'en-US',
    author: { '@id': `${SITE}/#org` },
    publisher: { '@id': `${SITE}/#org` },
    isPartOf: { '@id': `${SITE}/guides/#page` },
    about: [{ '@type': 'Thing', name: 'Back pain' }],
    mentions: [{ '@id': `${SITE}/#app` }, ...g.exercises.map((s) => ({ '@type': 'ExerciseAction', name: exName(bySlug[s]), url: abs(exUrl(s)) }))],
    wordCount: html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length,
    citation: refs.map((k) => {
      const s = SOURCES[k];
      return s.scholarly
        ? { '@type': 'ScholarlyArticle', headline: s.title, name: s.title, url: s.url, datePublished: s.year, author: { '@type': 'Person', name: s.authors.replace(/,? et al\.?$/, '') }, isPartOf: { '@type': 'Periodical', name: s.journal } }
        : { '@type': 'WebPage', name: s.title, url: s.url, publisher: { '@type': 'Organization', '@id': `${new URL(s.url).origin}/#organization`, name: s.publisher, url: `${new URL(s.url).origin}/` } };
    }),
  };
  const body = `
    <article>
    <header class="page-hero${g.theme === 'relentless' ? ' guide-rel' : ''}">
      <div class="container article-head">
        ${crumbs(crumbItems)}
        <h1>${esc(g.h1)}</h1>
        <p class="lede">${esc(g.sub)}</p>
        <p class="byline">By <a href="/about#editorial">the Remedy team</a> · Published <time datetime="${g.published}">${formatDate(g.published)}</time>${g.updated !== g.published ? ` · Updated <time datetime="${g.updated}">${formatDate(g.updated)}</time>` : ''} · ${minutes} min read · ${refs.length} sources</p>
      </div>
    </header>
    ${g.slug === 'desk' ? `<section class="desk-fit">
      <div class="container desk-fit-row">
        ${phone('preview')}
        <div>
          <p class="desk-fit-line">The session is already chosen. You do not build the workout.</p>
          <ol class="desk-fit-list">
            <li><strong>Hinge Health</strong><span>Digital physical therapy with a care team, usually through work or a health plan. If yours includes it, start there.</span></li>
            <li><strong>Sword</strong><span>The same kind of program. Sword acquired Kaia Health. Also usually a work benefit, not a download you buy yourself.</span></li>
            <li><strong>Curable</strong><span>Pain education and mind-body practice. Not an exercise program. It can sit beside one.</span></li>
            <li><strong>Remedy</strong><span>The iPhone program you download yourself. Short sessions for a back that sits all day. No care team.</span></li>
          </ol>
        </div>
      </div>
    </section>` : ''}
    <section class="tight-top">
      <div class="container article-layout">
        <aside class="toc" aria-label="On this page">
          <p class="toc-title">On this page</p>
          <ol>${toc.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}${g.faq?.length ? '<li><a href="#questions">Questions</a></li>' : ''}<li><a href="#sources">Sources</a></li></ol>
        </aside>
        <div class="article prose${g.theme === 'relentless' ? ' guide-rel-prose' : ''}">
          ${g.disclosure ? `<p class="disclosure">${esc(g.disclosure)}</p>` : ''}
          <div class="takeaways">
            <p class="takeaways-title">Key takeaways</p>
            <ul>${g.takeaways.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
          </div>
${html}
          ${exCards.length ? `<h2 id="exercises-mentioned">Exercises in this guide</h2><div class="ex-grid ex-grid-compact">${exCards.map(exerciseCard).join('')}</div>` : ''}
          ${g.faq?.length ? `<h2 id="questions">Questions</h2>${faqHtml(g.faq, { openFirst: false })}` : ''}
          ${g.slug === 'when-to-see-a-doctor-for-back-pain' ? '' : RED_FLAG_ASIDE}
          <h2 id="sources">Sources</h2>
          <ol class="refs">${refs.map(refItem).join('')}</ol>
          <p class="fine">This guide is general fitness information, not medical advice. <a href="/about#editorial">How we write our guides</a>.</p>
        </div>
      </div>
    </section>
    </article>
    <section class="band-soft">
      <div class="container">
        <h2 class="title">Related guides</h2>
        <div class="guide-grid">${g.related.map((k) => guideCard(k)).join('')}</div>
      </div>
    </section>
${cta()}`;
  const graph = [
    webPageNode(g.path, g.title, g.description, { props: { mainEntity: { '@id': `${abs(g.path)}#article` }, breadcrumb: { '@id': `${abs(g.path)}#breadcrumb` } } }),
    articleNode,
    { ...breadcrumbNode(crumbItems), '@id': `${abs(g.path)}#breadcrumb` },
  ];
  if (g.faq?.length) graph.push(faqNode(`${abs(g.path)}#faq`, g.faq));
  const file = g.path === '/desk' ? 'desk.html' : `guides/${g.slug}.html`;
  const md = g.path === '/desk' ? '/desk.md' : `/guides/${g.slug}.md`;
  return {
    path: g.path, file, title: g.title, description: g.description, body, lastmod: g.updated,
    html: page({
      path: g.path, title: g.title, description: g.description, og: g.slug, ogAlt: g.h1, md, ogType: 'article', navCurrent: '/guides/',
      article: { published: g.published, modified: g.updated, section: 'Guides' }, graph,
    }, body),
  };
}

export function guidesHub() {
  const path = '/guides/';
  const title = 'Back Pain Guides: Exercises, Stretches, and When to Get Help';
  const description = 'Plain-language back pain guides: exercises, stretches, core work, sitting all day, the gym, walking, and when to see a doctor.';
  const crumbItems = [['Home', '/'], ['Guides', path]];
  const sections = [
    ['Start here', ['lower-back-pain-exercises', 'when-to-see-a-doctor-for-back-pain']],
    ['By situation', ['mental-side-of-a-sore-back', 'desk', 'morning-back-stiffness', 'sore-back-after-gym', 'upper-back-pain-exercises']],
    ['Routines and habits', ['stretches-for-lower-back-pain', 'core-exercises-for-back-pain', 'back-exercises-no-equipment', 'is-walking-good-for-back-pain', 'how-long-to-stick-with-a-back-routine']],
    ['Choosing an app', ['best-back-pain-apps']],
  ];
  const body = `
    <header class="page-hero">
      <div class="container">
        ${crumbs(crumbItems)}
        <h1>Guides for a sore back</h1>
        <p class="lede">Plain-language answers to the questions people actually search when their back hurts, each one sourced to clinical guidelines and research. General fitness information, not medical advice.</p>
      </div>
    </header>
    <section class="tight-top">
      <div class="container">
        ${sections.map(([name, keys], i) => `
        <h2 class="hub-h">${name}</h2>
        <div class="guide-grid${i === 0 ? ' guide-grid-2' : ''}">${keys.map((k) => guideCard(k, { big: i === 0 })).join('')}</div>`).join('')}
      </div>
    </section>
    <section class="band-soft">
      <div class="container narrow prose">
        <h2>Where to start</h2>
        <p>If you have never followed a back routine, start with <a href="/guides/lower-back-pain-exercises">exercises for lower back pain</a>, then read <a href="/guides/how-long-to-stick-with-a-back-routine">how long to stick with it</a>. Most routines fail on time, not on exercise choice. For individual moves, the <a href="/exercises/">exercise guides</a> have step-by-step instructions.</p>
        <p>If you want a plan instead of assembling one yourself, the <a href="/back-pain-app">Remedy app</a> builds a multi-week program from a short onboarding. <a href="/how">Here is how it works</a>.</p>
        <p class="fine">How we write these: <a href="/about#editorial">editorial standards</a>.</p>
      </div>
    </section>
${cta()}`;
  const keys = sections.flatMap(([, k]) => k);
  return {
    path, file: 'guides/index.html', title, description, body,
    html: page({
      path, title, description, og: 'guides', md: '/guides/index.md', navCurrent: path,
      graph: [
        webPageNode(path, title, description, { type: 'CollectionPage', props: { mainEntity: { '@type': 'ItemList', numberOfItems: keys.length, itemListElement: keys.map((k, i) => ({ '@type': 'ListItem', position: i + 1, name: byKey[k].card, url: abs(byKey[k].path) })) } } }),
        breadcrumbNode(crumbItems),
      ],
    }, body),
  };
}

export function notFound() {
  const body = `
    <section class="page-hero">
      <div class="container narrow">
        <h1>That page doesn’t exist</h1>
        <p class="lede">It may have moved. These are the most useful places to go from here:</p>
        <h2>Where to go</h2>
        <div class="guide-grid guide-grid-2">
          <a class="guide-card" href="/"><h3>Home</h3><p>What Remedy is.</p></a>
          <a class="guide-card" href="/exercises/"><h3>Exercise guides</h3><p>Step-by-step instructions for individual moves.</p></a>
          <a class="guide-card" href="/guides/"><h3>Guides</h3><p>Plain answers for a sore back.</p></a>
          <a class="guide-card" href="/contact"><h3>Contact</h3><p>Email a real person.</p></a>
        </div>
      </div>
    </section>`;
  return {
    path: '/404', file: '404.html', noindex: true,
    html: page({ path: '/404', title: 'Page not found | Remedy', description: 'This page does not exist on remedyrecoveries.com.', noindex: true }, body),
  };
}

export const RELENTLESS_URL = RELENTLESS;
