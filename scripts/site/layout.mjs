import { SITE, STORE, APP_ID, CSS_VERSION, APP, PLANS, ORG, FOUNDER, UPDATED } from './config.mjs';

export const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const abs = (path) => (path.startsWith('http') ? path : SITE + path);

// Rough Google SERP width (Arial-ish): Google truncates titles near 580px and descriptions near 920px.
export const serpPx = (text) =>
  [...text].reduce((w, c) => w + (c === ' ' ? 4 : /[A-Z]/.test(c) ? 9.5 : /[.,:;!|]/.test(c) ? 4 : 7.5), 0);

export const SCREENS = {
  home: { src: '/assets/screens/home.webp', alt: 'Remedy home screen with the armadillo standing, 1 session until it grows, and today’s session: Thoracic Stability and Core, 19 minutes, 5 exercises' },
  session: { src: '/assets/screens/session.webp', alt: 'Remedy session screen with a demonstration video of the glute bridge, set 1 of 3, and the armadillo coach saying “I am here. Keep going.”' },
  progress: { src: '/assets/screens/progress.webp', alt: 'Remedy progress screen showing this week at 0 of 3 sessions, Arnie fully grown, and the five growth stages from 0 to 15 sessions' },
  preview: { src: '/assets/screens/session_preview.webp', alt: 'Remedy session preview: week 2 session 3, Thoracic Strength and Function, 19 minutes, 5 exercises, exercise mat needed, with the armadillo coach' },
  painCheck: { src: '/assets/screens/pain_check.webp', alt: 'Remedy pain check-in before a session. The pain scale includes 0 and is set to 5.' },
  days: { src: '/assets/screens/workout_days.webp', alt: 'Remedy workout days picker with Tuesday, Friday and Sunday selected, 3 of 3, and a workout reminder switch' },
  catCow: { src: '/assets/screens/cat_cow.webp', alt: 'Remedy session screen with a demonstration video of the cat-cow stretch, set 1 of 2, and the armadillo coach' },
  birdDog: { src: '/assets/screens/bird_dog.webp', alt: 'Remedy session screen with a demonstration video of the bird dog, set 1 of 3, and the armadillo coach' },
  childsPose: { src: '/assets/screens/childs_pose.webp', alt: 'Remedy session screen with a demonstration video of the child’s pose hold, set 1 of 2, and the armadillo coach' },
  squat: { src: '/assets/screens/squat.webp', alt: 'Remedy session screen with a demonstration video of the bodyweight squat, set 1 of 3, and the armadillo coach' },
};

const PHONE_SIZES = {
  '': '(max-width: 860px) 250px, 300px',
  'phone-sm': '(max-width: 860px) 200px, 220px',
  'phone-step': '(max-width: 860px) 110px, 190px',
  'phone-lg': '(max-width: 700px) 86vw, 380px',
  'phone-bento': '(max-width: 900px) 78vw, 340px',
  'phone-bento-sm': '(max-width: 900px) 62vw, 230px',
  'phone-showcase': '(max-width: 900px) 68vw, 290px',
  'phone-showcase-sm': '(max-width: 900px) 56vw, 235px',
  'phone-cta': '(max-width: 900px) 70vw, 290px',
};

export const screenSrcset = (src) => {
  const base = src.replace(/\.webp$/, '');
  return `${base}-240.webp 240w, ${base}-360.webp 360w, ${src} 470w`;
};

export function phone(key, { eager = false, cls = '' } = {}) {
  const s = SCREENS[key];
  const sizes = PHONE_SIZES[cls] || PHONE_SIZES[''];
  const cls2 = cls ? ` ${cls}` : '';
  return `<figure class="phone${cls2}"><img src="${s.src}" srcset="${screenSrcset(s.src)}" sizes="${sizes}" width="470" height="966" alt="${esc(s.alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" /></figure>`;
}

const ROBOTS = 'index, follow, max-image-preview:large';
const APP_PAGES = new Set(['/', '/back-pain-app', '/how', '/pricing', '/faq']);

export function orgGraph() {
  return [
    {
      '@type': 'Organization',
      '@id': `${SITE}/#org`,
      name: ORG.name,
      legalName: ORG.legalName,
      alternateName: ['Remedy Recoveries', 'Remedy: Back Pain Relief'],
      url: `${SITE}/`,
      email: ORG.email,
      logo: { '@type': 'ImageObject', '@id': `${SITE}/#logo`, url: `${SITE}/assets/logo-512.png`, width: 512, height: 512, caption: 'Remedy' },
      image: { '@id': `${SITE}/#logo` },
      description: 'Remedy makes Remedy: Back Pain Relief, an iPhone app that gives people with a sore back a structured, video-guided back fitness program. Not medical care.',
      founder: { '@id': FOUNDER.id },
      foundingDate: '2026',
      address: { '@type': 'PostalAddress', streetAddress: ORG.street, addressLocality: ORG.city, addressRegion: ORG.region, postalCode: ORG.postal, addressCountry: ORG.country },
      contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: ORG.email, url: `${SITE}/contact`, availableLanguage: 'English' },
      knowsAbout: ['Back pain', 'Low back pain', 'Exercise for back pain', 'Back fitness', 'Mobility', 'Core stability'],
      sameAs: [STORE],
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE}/#website`,
      url: `${SITE}/`,
      name: 'Remedy',
      alternateName: 'Remedy: Back Pain Relief',
      inLanguage: 'en-US',
      publisher: { '@id': `${SITE}/#org` },
    },
    {
      '@type': 'MobileApplication',
      '@id': `${SITE}/#app`,
      name: APP.storeName,
      alternateName: 'Remedy',
      description: 'iPhone back pain app. Answer a short onboarding about your back and get a structured multi-week back fitness program with short, video-guided sessions and before-and-after pain check-ins. Educational exercise guidance, not medical care.',
      operatingSystem: APP.minOS,
      applicationCategory: 'HealthApplication',
      applicationSubCategory: 'Back fitness',
      contentRating: APP.age,
      datePublished: APP.released,
      inLanguage: 'en',
      url: `${SITE}/back-pain-app`,
      installUrl: STORE,
      downloadUrl: STORE,
      image: `${SITE}/assets/logo-512.png`,
      screenshot: ['home', 'session', 'progress', 'preview'].map((k) => `${SITE}${SCREENS[k].src}`),
      featureList: [
        'Onboarding about your pain, history, activity level and equipment',
        'Personalized multi-week back fitness program',
        'Demonstration video for every exercise',
        'Before-and-after pain check-ins with a pain trend chart',
        'Workout day picker and reminders',
        'Exercises for mobility, core stability, strength, and recovery',
        'A pet armadillo you name. It moves up at 1, 4, 9, and 15 finished sessions. Missed days do not shrink it.',
      ],
      offers: PLANS.map((p) => ({
        '@type': 'Offer',
        name: `${p.name} subscription`,
        price: p.price,
        priceCurrency: 'USD',
        category: 'subscription',
        availability: 'https://schema.org/InStock',
        url: STORE,
        priceSpecification: { '@type': 'UnitPriceSpecification', price: p.price, priceCurrency: 'USD', billingDuration: p.duration, unitCode: p.unit },
      })),
      author: { '@id': `${SITE}/#org` },
      publisher: { '@id': `${SITE}/#org` },
      sameAs: [STORE],
    },
  ];
}

export function founderNode() {
  return {
    '@type': 'Person',
    '@id': FOUNDER.id,
    name: FOUNDER.name,
    jobTitle: 'Founder and developer, Remedy',
    image: `${SITE}/assets/rahul.webp`,
    description: 'Computer engineering and computer science student at the University of Wisconsin–Madison and competitive powerlifter. Built the Remedy iOS app end to end and co-founded Relentless, a mental training app for athletes.',
    worksFor: { '@id': `${SITE}/#org` },
    affiliation: { '@type': 'CollegeOrUniversity', name: 'University of Wisconsin–Madison', sameAs: 'https://www.wikidata.org/wiki/Q838330' },
    knowsAbout: ['iOS development', 'Strength training', 'Powerlifting', 'Mobile app development'],
    sameAs: [FOUNDER.linkedin, FOUNDER.relentless],
  };
}

export const breadcrumbNode = (items) => ({
  '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })),
});

export function head(p) {
  const url = abs(p.path);
  const og = p.og ? `${SITE}/assets/og/${p.og}.png` : `${SITE}/assets/og-1200.png`;
  const ogAlt = p.ogAlt || p.title;
  // The full app node (offers, screenshots) only ships on pages about the app itself.
  const needsApp = APP_PAGES.has(p.path) || JSON.stringify(p.graph || []).includes('/#app"');
  const base = orgGraph().filter((n) => needsApp || n['@type'] !== 'MobileApplication');
  const graph = { '@context': 'https://schema.org', '@graph': [...base, ...(p.graph || [])] };
  const article = p.article
    ? `
  <meta property="article:published_time" content="${p.article.published}" />
  <meta property="article:modified_time" content="${p.article.modified}" />
  <meta property="article:section" content="${esc(p.article.section)}" />`
    : '';
  const md = p.md ? `\n  <link rel="alternate" type="text/markdown" href="${SITE}${p.md}" title="Markdown" />` : '';
  const preload = p.preload
    ? `\n  <link rel="preload" as="image" href="${p.preload}" imagesrcset="${screenSrcset(p.preload)}" imagesizes="${PHONE_SIZES['']}" fetchpriority="high" />`
    : '';
  const preloadImage = p.preloadImage
    ? `\n  <link rel="preload" as="image" href="${p.preloadImage}" fetchpriority="high" />`
    : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(p.title)}</title>
  <meta name="description" content="${esc(p.description)}" />
  <meta name="robots" content="${p.noindex ? 'noindex, follow' : ROBOTS}" />
  <link rel="canonical" href="${url}" />${md}
  <link rel="alternate" type="text/plain" href="${SITE}/llms.txt" title="llms.txt" />
  <meta property="og:type" content="${p.ogType || 'website'}" />
  <meta property="og:site_name" content="Remedy" />
  <meta property="og:locale" content="en_US" />
  <meta property="og:title" content="${esc(p.ogTitle || p.title)}" />
  <meta property="og:description" content="${esc(p.description)}" />
  <meta property="og:url" content="${url}" />
  <meta property="og:image" content="${og}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="${esc(ogAlt)}" />${article}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${esc(p.ogTitle || p.title)}" />
  <meta name="twitter:description" content="${esc(p.description)}" />
  <meta name="twitter:image" content="${og}" />
  <meta name="twitter:image:alt" content="${esc(ogAlt)}" />
  <meta name="theme-color" content="#F6EDE0" />
  <meta name="apple-itunes-app" content="app-id=${APP_ID}" />
  <meta name="format-detection" content="telephone=no" />
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png" />
  <link rel="manifest" href="/site.webmanifest" />${preload}${preloadImage}
  <link rel="stylesheet" href="/styles.css?v=${CSS_VERSION}" />
  <script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>
</head>`;
}

const NAV_LINKS = [
  ['/exercises/', 'Exercises'],
  ['/guides/', 'Guides'],
  ['/how', 'How it works'],
  ['/faq', 'FAQ'],
];

export function nav(current = '') {
  const link = ([href, label]) =>
    `<a href="${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`;
  return `
<body>
  <a class="skip" href="#main">Skip to content</a>
  <header class="nav">
    <div class="nav-inner">
      <a href="/" class="nav-brand" aria-label="Remedy home">
        <img src="/assets/logo-64.png" width="32" height="32" alt="" />
        <span>Remedy</span>
      </a>
      <nav class="nav-links" aria-label="Main">
        ${NAV_LINKS.map(link).join('\n        ')}
      </nav>
      <a href="${STORE}" class="nav-cta">Get the app</a>
      <details class="nav-menu">
        <summary aria-label="Menu"><span></span><span></span><span></span></summary>
        <nav aria-label="Mobile">
          ${NAV_LINKS.map(link).join('\n          ')}
          <a href="/back-pain-app">Back pain app</a>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
          <a href="${STORE}">Get the app</a>
        </nav>
      </details>
    </div>
  </header>
`;
}

export function crumbs(items) {
  const last = items.length - 1;
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol>${items
    .map(([name, path], i) => (i === last ? `<li aria-current="page">${esc(name)}</li>` : `<li><a href="${path}">${esc(name)}</a></li>`))
    .join('')}</ol></nav>`;
}

export const storeBadge = (cls = '', { eager = false } = {}) =>
  `<a class="store-badge ${cls}" href="${STORE}"><img src="/assets/app-store-badge.svg" width="162" height="54" alt="Download Remedy on the App Store" decoding="async"${eager ? '' : ' loading="lazy"'} /></a>`;

export function cta({ title = 'Download Remedy', sub = 'Free to download. You pay in the App Store.' } = {}) {
  return `
    <section class="cta-band" id="get">
      <div class="container cta-inner stack">
        <h2>${title}</h2>
        <p>${sub}</p>
        <div class="cta-row cluster">${storeBadge()}<a class="link-arrow" href="/guides/">Read the guides</a></div>
      </div>
    </section>`;
}

export const DISCLAIMER = `Remedy is a fitness and wellness app. Everything on this site is general educational information, not medical advice, diagnosis, or treatment, and not a substitute for a physician or physical therapist. If you have severe pain, numbness, weakness, loss of bladder or bowel control, or pain after a fall or injury, get medical care. Remedy is for ages ${APP.age}.`;

export function footer() {
  return `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-about">
          <a href="/" class="footer-brand" aria-label="Remedy home"><img src="/assets/logo-64.png" width="28" height="28" alt="" loading="lazy" /> Remedy</a>
          <p>Remedy: Back Pain Relief is a structured, video-guided back fitness program for iPhone. Short sessions on the days you pick.</p>
          ${storeBadge('store-badge-sm')}
        </div>
        <nav aria-label="App">
          <h2>App</h2>
          <a href="/back-pain-app">Back pain app</a>
          <a href="/how">How it works</a>
          <a href="/pricing">Pricing</a>
          <a href="/faq">FAQ</a>
        </nav>
        <nav aria-label="Learn">
          <h2>Learn</h2>
          <a href="/guides/">Back pain guides</a>
          <a href="/exercises/">Exercise library</a>
          <a href="/guides/lower-back-pain-exercises">Lower back exercises</a>
          <a href="/desk">Back pain from sitting</a>
          <a href="/guides/when-to-see-a-doctor-for-back-pain">When to see a doctor</a>
        </nav>
        <nav aria-label="Company">
          <h2>Company</h2>
          <a href="/about">About</a>
          <a href="/contact">Contact</a>
          <a href="/privacy">Privacy</a>
          <a href="/terms">Terms</a>
          <a href="/unsubscribe">Unsubscribe</a>
        </nav>
      </div>
      <p class="footer-disclaimer">${DISCLAIMER}</p>
      <div class="footer-bottom">
        <p>© 2026 ${ORG.legalName}, doing business as Remedy.</p>
      </div>
    </div>
  </footer>`;
}

export const MENU_SCRIPT = `
  <script>
    document.addEventListener('click', function (e) {
      var menu = document.querySelector('.nav-menu[open]');
      if (menu && !menu.contains(e.target)) menu.removeAttribute('open');
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var menu = document.querySelector('.nav-menu[open]');
      if (!menu) return;
      menu.removeAttribute('open');
      var summary = menu.querySelector('summary');
      if (summary) summary.focus();
    });
  </script>`;

export function page(p, body) {
  return `${head(p)}${nav(p.navCurrent)}
  <main id="main" tabindex="-1">
${body}
  </main>
${footer()}${p.script || ''}${MENU_SCRIPT}
</body>
</html>
`;
}

export function readMinutes(html) {
  const words = html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.round(words / 220));
}

export function formatDate(iso) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export { UPDATED };
