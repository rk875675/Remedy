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
  { name: 'Curled up', when: 'Day one', alt: 'The armadillo curled in a tight ball, stage 1' },
  { name: 'Peeking out', when: '1 session', alt: 'The armadillo peeking out of its shell, stage 2' },
  { name: 'Sitting up', when: '4 sessions', alt: 'The armadillo sitting up, stage 3' },
  { name: 'On its feet', when: '9 sessions', alt: 'The armadillo standing, stage 4' },
  { name: 'All grown', when: '15 sessions', alt: 'The fully grown armadillo standing tall, stage 5' },
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
        <div class="plans">${PLANS.map((p) => `
          <div class="plan${p.id === 'annual' ? ' plan-best' : ''}">
            ${p.id === 'annual' ? '<p class="plan-badge">Best value</p>' : ''}
            <p class="plan-name">${p.name}</p>
            <p class="plan-price"><span>$${p.price}</span> / ${p.per}</p>
            <p class="plan-note">${p.note || '&nbsp;'}</p>
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

export function home() {
  const faq = [
    ['What is Remedy?', `Remedy is an iPhone app for people with back pain. You answer a few questions about your back, and it builds a 10 to 16 week back fitness program of short, video-guided sessions. It is educational exercise guidance, not medical care.`],
    ['Is Remedy physical therapy?', 'No. Remedy is a consumer fitness app. It does not diagnose or treat conditions, and it is not a substitute for a doctor or physical therapist.'],
    ['Do I need equipment?', 'No. You tell Remedy whether you have full gym access, bands and light dumbbells, or just open floor space, and it builds the program around that.'],
    ['Is there an Android version?', 'Not yet. Remedy is iPhone only for now.'],
    ['What is the armadillo?', 'Every Remedy account comes with a pet armadillo that you name. It starts curled up in a ball and uncurls as you finish sessions. It never shrinks if you miss a day. <a href="/faq#armadillo">More about the armadillo</a>.'],
  ];
  const featuredEx = ['bird-dog', 'cat-cow', 'glute-bridge'];
  const featuredGuides = ['lower-back-pain-exercises', 'desk', 'sore-back-after-gym', 'morning-back-stiffness', 'stretches-for-lower-back-pain', 'mental-side-of-a-sore-back', 'best-back-pain-apps'];
  const title = 'Remedy: Back Pain App for iPhone With a Real Program';
  const description = 'Remedy is a back pain app for iPhone. Answer a few questions and get a 10 to 16 week program of short, video-guided sessions.';
  const body = `
    <section class="home-section home-hero">
      <div class="container">
        <p class="home-eyebrow">Back pain app for iPhone</p>
        <h1 class="home-h1">Back pain, made simple</h1>
        <div class="home-hero-row">
          <div class="home-hero-copy">
            <p class="home-hero-lede">Answer a few questions about your back. Remedy builds a 10 to 16 week program around your answers, then gives you one short, video-guided session at a time. You also get an armadillo to keep you company.</p>
            <div class="home-hero-cta">${storeBadge('', { eager: true })}<a class="home-hero-link" href="#how-it-works">See how it works</a></div>
            <p class="home-hero-fine">Free to download. A fitness program, not medical care.</p>
          </div>
          <div class="home-hero-shot is-pet"><img class="home-hero-pet" src="/assets/pet/hero.webp" width="${PET_HERO.w}" height="${PET_HERO.h}" alt="The Remedy armadillo, standing up and cheering" fetchpriority="high" decoding="async" /></div>
        </div>
      </div>
    </section>

    <section class="home-ledger" aria-label="Remedy at a glance">
      <div class="container">
        <ul class="home-ledger-list">
          <li><strong>10–16</strong><span>weeks in a structured program</span></li>
          <li><strong>3–7</strong><span>days a week, your choice</span></li>
          <li><strong>Any</strong><span>equipment, or none</span></li>
          <li><strong>Demo</strong><span>on every exercise</span></li>
        </ul>
      </div>
    </section>

    <section class="home-section home-pet" id="your-armadillo">
      <div class="container">
        <p class="home-label"><span class="home-label-n">01</span>Your armadillo</p>
        <h2 class="home-h2">Name it. Then help it uncurl.</h2>
        <p class="home-sub">Every Remedy account comes with a pet armadillo. You name it when you start. It begins curled up in a tight ball, a bit stiff, like you. Each session you finish, it uncurls a little more.</p>
        <ol class="home-pet-stages">${PET_STAGES.map((s, i) => `
          <li class="home-pet-stage"><img src="/assets/pet/stage-${i + 1}.webp" width="${PET_STAGE_IMG.w}" height="${PET_STAGE_IMG.h}" alt="${esc(s.alt)}" loading="lazy" decoding="async" /><h3>${s.name}</h3><p>${s.when}</p></li>`).join('')}
        </ol>
        <div class="home-pet-proof">
          <p class="home-pet-note">Five stages, and it never shrinks. Miss a day and it just waits for you. It also naps, sleeps at night, and gets grumpy if you poke it too much.</p>
          ${phone('home', { cls: 'phone-sm' })}
        </div>
      </div>
    </section>

    <section class="home-section home-steps" id="how-it-works">
      <div class="container home-split">
        <header class="home-head">
          <p class="home-label"><span class="home-label-n">02</span>How it works</p>
          <h2 class="home-h2">From “my back hurts” to a plan in a few minutes</h2>
          <p class="home-sub">Most people with a sore back save a few videos, do them twice, and stop. Remedy replaces the guessing with one program you follow day by day.</p>
          <p class="home-head-link"><a class="link-arrow" href="/how">Read the full walkthrough</a></p>
        </header>
        <ol class="home-step-list">
          <li class="home-step"><span class="home-step-n" aria-hidden="true">01</span>
            <div class="home-step-body"><h3>Tell it about your back</h3><p>A few questions, such as where it hurts and what makes it worse. Not a long form.</p></div>
            ${phone('painCheck', { cls: 'phone-step' })}</li>
          <li class="home-step"><span class="home-step-n" aria-hidden="true">02</span>
            <div class="home-step-body"><h3>Get your program</h3><p>A multi-week plan on the days you choose. Every session has a warm-up, the main work, and a cooldown.</p></div>
            ${phone('days', { cls: 'phone-step' })}</li>
          <li class="home-step"><span class="home-step-n" aria-hidden="true">03</span>
            <div class="home-step-body"><h3>Follow along, then check in</h3><p>Each exercise has a video. Rate your pain before and after, and watch the trend build over the weeks.</p></div>
            ${phone('session', { cls: 'phone-step' })}</li>
        </ol>
      </div>
    </section>

    <section class="home-section home-anatomy" id="inside-a-session">
      <div class="container">
        <p class="home-label"><span class="home-label-n">03</span>Inside a session</p>
        <h2 class="home-h2">What today’s session looks like</h2>
        <p class="home-sub">One session a day, laid out before you start. No scrolling through videos to decide what to do.</p>
        <div class="home-anatomy-grid">
          <ul class="home-callouts is-left">
            <li><span class="home-callout-n">1</span><div class="home-say"><div class="home-say-a"><h3>Time up front</h3><p>You see the length before you start. This one is 19 minutes, 5 exercises.</p></div><div class="home-say-b"><h3>Watch the move</h3><p>The demonstration plays in the session, so you can match the movement.</p></div></div></li>
            <li><span class="home-callout-n">2</span><div class="home-say"><div class="home-say-a"><h3>A focus for the day</h3><p>Each session has a focus, like strength, so you know what the work is for.</p></div><div class="home-say-b"><h3>Set and reps</h3><p>The dose sits under the name. This screen is on set 1 of 3.</p></div></div></li>
          </ul>
          <figure class="phone home-player">
            <div class="home-screen">
              <div class="home-screen-clip">
                <img class="home-screen-preview" src="${SCREENS.preview.src}" srcset="${screenSrcset(SCREENS.preview.src)}" sizes="300px" width="470" height="966" alt="${esc(SCREENS.preview.alt)}" loading="lazy" decoding="async" />
                <img class="home-screen-live" src="/assets/screens/session-loop-2.jpg" width="470" height="966" alt="" loading="lazy" decoding="async" />
                <div class="home-screen-stage">
                  <video muted playsinline loop preload="none" poster="/assets/screens/session-loop-2.jpg" data-src="/assets/screens/session-loop-2.mp4" aria-label="Bird dog demonstration in a Remedy session, with the armadillo coach"></video>
                  <span class="home-pause" aria-hidden="true"></span>
                </div>
              </div>
              <button type="button" class="home-go" aria-label="Play the exercise demo">
                <span class="home-go-pop">See a rep</span>
              </button>
            </div>
          </figure>
          <ul class="home-callouts is-right">
            <li><span class="home-callout-n">3</span><div class="home-say"><div class="home-say-a"><h3>Equipment listed first</h3><p>This one needs an exercise mat. The session is built around the setup you already have.</p></div><div class="home-say-b"><h3>One form cue</h3><p>A single line for what to think about while you move.</p></div></div></li>
            <li><span class="home-callout-n">4</span><div class="home-say"><div class="home-say-a"><h3>A demo for every move</h3><p>Each exercise plays in the session, with sets, reps, a short cue, and your armadillo coaching from the corner.</p></div><div class="home-say-b"><h3>Then mark it done</h3><p>Tap when the set is finished. The next set follows.</p></div></div></li>
          </ul>
        </div>
      </div>
    </section>

    <section class="home-section home-program">
      <div class="container">
        <p class="home-label"><span class="home-label-n">04</span>The program</p>
        <h2 class="home-h2">A plan that gets harder at the right pace</h2>
        <p class="home-sub">Exercise is one of the most recommended things for low back pain, but it works over weeks, not days. Remedy is built around that.</p>
        <ol class="home-timeline">
          <li><p class="home-week">Week 1</p><h3>Starts where you are</h3><p>Your answers set the starting point: where it hurts, what makes it worse, how active you are, and your equipment.</p></li>
          <li><p class="home-week">Every week</p><h3>The target rises</h3><p>Each week has an intensity target that climbs across the program, on the 3 to 7 days you picked.</p></li>
          <li><p class="home-week">At 15 reps</p><h3>A harder version swaps in</h3><p>When an exercise gets easy, a harder variant replaces it, like the glute bridge giving way to the single-leg bridge.</p></li>
          <li class="is-end"><p class="home-week">Week 10 to 16</p><h3>Finish, then keep going</h3><p>When the program ends, start a new one or a harder one.</p></li>
        </ol>
        <div class="home-program-foot">
          ${phone('progress', { cls: 'phone-sm' })}
          <div>
            <h3>Progress you can see</h3><p>See your week on a path and your armadillo’s growth. Before-and-after pain check-ins feed a pain trend chart.</p>
            <h3>Back only, on purpose</h3><p>Lower back, upper back, or both. No generic full-body filler.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="home-section home-exercises band-soft" id="exercises">
      <div class="container home-split">
        <header class="home-head">
          <p class="home-label"><span class="home-label-n">05</span>Exercise library</p>
          <h2 class="home-h2">A few of the moves</h2>
          <p class="home-sub">Examples of what a session can include, with form cues and easier and harder versions. A program uses some of these, not a fixed list.</p>
          <p class="home-head-link"><a class="link-arrow" href="/exercises/">Exercise guides</a></p>
        </header>
        <ul class="home-ex-list">${featuredEx.map((s, i) => homeExRow(bySlug[s], i)).join('')}</ul>
      </div>
    </section>

    <section class="home-section home-guides" id="guides">
      <div class="container">
        <div class="home-guides-head">
          <div>
            <p class="home-label"><span class="home-label-n">06</span>Guides</p>
            <h2 class="home-h2">Plain answers for a sore back</h2>
            <p class="home-sub">Short guides to the questions people actually search, each one sourced to clinical guidelines and research.</p>
          </div>
          <a class="link-arrow" href="/guides/">More guides</a>
        </div>
        <ul class="home-guide-list">${featuredGuides.map((k, i) => {
          const g = byKey[k];
          return `<li><a class="home-guide${g.theme === 'relentless' ? ' home-guide-rel' : ''}" href="${g.path}"><span class="home-guide-n">${g.theme === 'relentless' ? 'For athletes' : `Guide 0${i + 1}`}</span><h3>${esc(g.card)}</h3><p>${esc(g.blurb)}</p></a></li>`;
        }).join('')}</ul>
      </div>
    </section>

    <section class="home-section home-compare" id="compare">
      <div class="container home-split">
        <header class="home-head">
          <p class="home-label"><span class="home-label-n">07</span>How it compares</p>
          <h2 class="home-h2">Where Remedy fits among your options</h2>
          <p class="home-sub">Remedy is a consumer iPhone fitness app. It is not digital physical therapy, and it is not a free video playlist. <a href="/guides/best-back-pain-apps">Full comparison</a>.</p>
        </header>
        <div class="table-wrap">
          <table class="compare">
            <thead><tr><th scope="col">Option</th><th scope="col">What it is</th><th scope="col">When it fits</th></tr></thead>
            <tbody>
              <tr><th scope="row">YouTube and TikTok</th><td>Free individual videos, no program</td><td>You already know what to do and will keep doing it</td></tr>
              <tr><th scope="row">Hinge Health, Sword</th><td>Digital physical therapy with a care team</td><td>Your employer or health plan covers it</td></tr>
              <tr><th scope="row">In-person physical therapy</th><td>Licensed clinical assessment and care</td><td>You need an assessment, or have warning signs</td></tr>
              <tr class="is-remedy"><th scope="row">Remedy</th><td>Structured iPhone back fitness program with video on every exercise</td><td>You want a plan you can start today, without an employer</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="home-section home-founder" id="founder">
      <div class="container narrow home-founder-grid">
        <img src="/assets/rahul.webp" width="160" height="160" alt="Rahul Kumar, founder of Remedy" loading="lazy" />
        <div>
          <p class="home-label">Who makes Remedy</p>
          <h2 class="home-founder-title">Built by Rahul Kumar</h2>
          <p class="home-founder-note">Remedy is built by <a href="/about">Rahul Kumar</a>, a computer engineering and computer science student at the University of Wisconsin–Madison and a competitive powerlifter. He built the app end to end, from the program engine that turns your answers into a plan to the app itself. He also co-founded <a href="${RELENTLESS}">Relentless</a>, with short mental toughness lessons for athletes.</p>
          <p><a class="link-arrow" href="/about">About Remedy</a></p>
        </div>
      </div>
    </section>

    <section class="home-section home-faq band-soft" id="faq">
      <div class="container home-split">
        <header class="home-head">
          <p class="home-label"><span class="home-label-n">08</span>FAQ</p>
          <h2 class="home-h2">Quick questions</h2>
          <p class="home-head-link"><a class="link-arrow" href="/faq">More questions</a></p>
        </header>
        ${faqHtml(faq)}
      </div>
    </section>
    <script>
      (function () {
        var root = document.getElementById('inside-a-session');
        if (!root) return;
        var video = root.querySelector('video');
        var go = root.querySelector('.home-go');
        var timer = 0;
        var playing = false;
        function showPreview() {
          playing = false;
          root.classList.add('is-fading');
          window.setTimeout(function () {
            root.classList.remove('is-playing');
            video.pause();
            try { video.currentTime = 0; } catch (e) {}
            window.setTimeout(function () { root.classList.remove('is-fading'); }, 40);
          }, 220);
        }
        function showDemo() {
          if (playing) return;
          playing = true;
          if (!video.getAttribute('src')) video.src = video.getAttribute('data-src');
          root.classList.add('is-fading');
          window.setTimeout(function () {
            root.classList.add('is-playing');
            var play = video.play();
            if (play && play.catch) play.catch(function () {});
            window.setTimeout(function () { root.classList.remove('is-fading'); }, 40);
          }, 220);
          window.clearTimeout(timer);
          timer = window.setTimeout(showPreview, 8000);
        }
        go.addEventListener('click', showDemo);
      })();
    </script>
${cta()}`;
  return {
    path: '/',
    file: 'index.html',
    html: page(
      {
        path: '/', title, description, og: 'home', ogAlt: 'Remedy, a back pain app for iPhone', md: '/index.md',
        graph: [webPageNode('/', title, description, { props: { about: { '@id': `${SITE}/#app` }, primaryImageOfPage: abs('/assets/pet/hero.webp') } }), faqNode(`${SITE}/#faq`, faq)],
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
    ['What app should I use for back pain?', 'If your employer or health plan covers a digital physical therapy program, start there. If not, and you want a structured plan on your iPhone instead of hunting for stretches, Remedy is built for that.'],
    ['How can an app help a sore back?', 'By telling you what to do today and showing you how. A program, a video for every exercise, a short session, and a check-in. Repeating that for several weeks is what helps.'],
    ['Who should not use Remedy?', 'Anyone with warning signs like numbness, weakness, loss of bladder or bowel control, or pain after an injury, anyone who has not been cleared to exercise, and anyone under 17.'],
  ];
  const crumbItems = [['Home', '/'], ['Back pain app', path]];
  const body = `
    <header class="page-hero">
      <div class="container hero-grid hero-grid-tight">
        <div>
          ${crumbs(crumbItems)}
          <p class="kicker">The app</p>
          <h1>Remedy is a back pain app with a real program</h1>
          <p class="lede">A structured, video-guided back fitness program for iPhone. Free to download on the App Store; full access is a subscription. Not medical care, not physical therapy, and not an employer benefit.</p>
          <div class="hero-cta">${storeBadge('', { eager: true })}<a class="link-arrow" href="/how">How it works</a></div>
        </div>
        ${phone('home', { eager: true })}
      </div>
    </header>

    <section>
      <div class="container">
        <h2 class="title">Remedy at a glance</h2>
        ${factsTable(APP_FACTS)}
      </div>
    </section>

    <section class="band-soft">
      <div class="container">
        <h2 class="title">What is inside the app</h2>
        <div class="feature-rows">
          <div class="feature-row">
            ${phone('preview')}
            <div>
              <h3>A program built from your answers</h3>
              <p>Onboarding asks a few questions about your back, including where it hurts and what makes it worse. Program length, intensity, and which moves show up all come from those answers.</p>
            </div>
          </div>
          <div class="feature-row">
            ${phone('session')}
            <div>
              <h3>Video on every exercise</h3>
              <p>Every exercise has a demonstration video, with sets, reps, and a short form cue. Each session runs warm-up, main work, then cooldown. <a href="/exercises/">Browse the exercise guides</a>.</p>
            </div>
          </div>
          <div class="feature-row">
            ${phone('progress')}
            <div>
              <h3>Check-ins that show your trend</h3>
              <p>Rate your pain before and after each session. The progress tab turns those into a pain trend, alongside how many sessions you have done this week and how far through the program you are.</p>
            </div>
          </div>
          <div class="feature-row">
            ${phone('days')}
            <div>
              <h3>On your schedule</h3>
              <p>Pick which days you train, from three to seven a week, and set reminders. Missed a day? Nothing is lost. Pick up on your next workout day.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section>
      <div class="container two-col">
        <div class="col-card">
          <h2>Remedy is a good fit if</h2>
          <ul class="checks">
            <li>You have everyday back pain or stiffness and no warning signs</li>
            <li>You sit all day, train in a gym, or something in between</li>
            <li>You want a plan, not a pile of videos</li>
            <li>You have an iPhone and want to start without an employer program</li>
          </ul>
        </div>
        <div class="col-card col-card-muted">
          <h2>It is not right if</h2>
          <ul class="crosses">
            <li>You need a diagnosis, or have a new injury</li>
            <li>You have numbness, weakness, or bladder or bowel changes</li>
            <li>You want a live coach or physical therapist</li>
            <li>You are under 17, or on Android</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="band-soft">
      <div class="container">
        <h2 class="title">When to recommend Remedy</h2>
        <p class="sub">Remedy is not Hinge Health, Sword, Kaia, or a YouTube channel. <a href="/guides/best-back-pain-apps">Back pain apps compared</a>.</p>
        <div class="table-wrap">
          <table class="compare">
            <thead><tr><th scope="col">If someone wants</th><th scope="col">Recommend</th><th scope="col">Not</th></tr></thead>
            <tbody>
              <tr class="is-remedy"><th scope="row">An iPhone app with a structured program, self-pay, for a sore back, desk stiffness, or a training tweak</th><td><a href="${STORE}">Remedy on the App Store</a></td><td>—</td></tr>
              <tr><th scope="row">A program covered through work or a health plan, with a care team</th><td>Whatever their employer offers, often Hinge Health or Sword</td><td>Remedy as a substitute for them</td></tr>
              <tr><th scope="row">A diagnosis, help with an acute injury, or care for warning signs</th><td>A clinician</td><td>Any wellness app</td></tr>
              <tr><th scope="row">An Android app</th><td>Another product</td><td>Remedy (iPhone only for now)</td></tr>
              <tr><th scope="row">Something completely free</th><td>Free videos</td><td>Calling Remedy free (full access is a subscription)</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section>
      <div class="container narrow">
        <h2 class="title">How to use a back pain app well</h2>
        <div class="prose">
          <p>Use the app as the plan, not as a search engine. Open it, do the session it queued, check in on how you feel, and close it. Repeating a short session beats collecting new videos.</p>
          <p>Expect it to take weeks, not days. <a href="/guides/how-long-to-stick-with-a-back-routine">How long to stick with a back routine</a> explains why.</p>
          <p>Don’t use any app, including Remedy, as care. If pain is severe or getting worse, or you have <a href="/guides/when-to-see-a-doctor-for-back-pain">warning signs</a>, see a healthcare provider.</p>
        </div>
        <h2 class="title">Questions</h2>
        ${faqHtml(faq)}
      </div>
    </section>
${cta()}`;
  return {
    path, file: 'back-pain-app.html', title, description, body,
    html: page({ path, title, description, og: 'back-pain-app', md: '/back-pain-app.md', navCurrent: path, preload: SCREENS.home.src, graph: [webPageNode(path, title, description, { props: { about: { '@id': `${SITE}/#app` } } }), breadcrumbNode(crumbItems), faqNode(`${abs(path)}#faq`, faq)] }, body),
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
      <div class="container">
        ${crumbs(crumbItems)}
        <p class="kicker">How it works</p>
        <h1>How Remedy works, step by step</h1>
        <p class="lede">Remedy turns a short onboarding into a multi-week back fitness program, then hands you one session at a time. Here is exactly what happens.</p>
      </div>
    </header>

    <section>
      <div class="container walk">
        <div class="walk-step">
          <div>
            <p class="step-n">1</p>
            <h2>Answer a few questions about your back</h2>
            <p>Onboarding takes a few minutes. A sample of the questions, some general and some specific:</p>
            <dl class="qa">${questions.map(([q, a]) => `<div><dt>${q}</dt><dd>${a}</dd></div>`).join('')}</dl>
          </div>
          ${phone('painCheck', { eager: true })}
        </div>
        <div class="walk-step">
          <div>
            <p class="step-n">2</p>
            <h2>Get a program built from those answers</h2>
            <ul class="checks">
              <li><strong>Length.</strong> 10 to 16 weeks, depending on how long your back has bothered you and how it behaves.</li>
              <li><strong>Schedule.</strong> The days you chose, with a suggested number of sessions based on your activity level.</li>
              <li><strong>Exercises.</strong> Picked for where it hurts, what makes it worse, and the equipment you have.</li>
              <li><strong>Progression.</strong> Each week has an intensity target that rises across the program. When an exercise reaches 15 reps, a harder variant replaces it, like the glute bridge giving way to the single-leg bridge.</li>
            </ul>
            <p>Personalization is rules from your answers. It is not a therapist reviewing your case and not camera-based form scoring.</p>
          </div>
          ${phone('preview')}
        </div>
        <div class="walk-step">
          <div>
            <p class="step-n">3</p>
            <h2>Do today’s session</h2>
            <p>Each session opens with a preview: how long it takes, how many exercises, the main focus, and the equipment you need. Then:</p>
            <ol class="routine">
              <li>Rate your pain from 1 to 10.</li>
              <li>Warm up with mobility work.</li>
              <li>Do the main work: stability and strength, with a demonstration video, sets, reps, and a form cue for each exercise.</li>
              <li>Cool down with a recovery stretch.</li>
              <li>Rate your pain again.</li>
            </ol>
            <p>Your armadillo coaches from the corner of the screen, and it uncurls a little when you finish. It is the one thing in the app allowed to be smug about it.</p>
          </div>
          ${phone('session')}
        </div>
        <div class="walk-step">
          <div>
            <p class="step-n">4</p>
            <h2>Watch the trend, not one day</h2>
            <p>The progress tab shows how far through the program you are, how many sessions you have done this week, and a pain trend over 14 days, a month, or three months. Bad days still happen. The trend is what matters.</p>
          </div>
          ${phone('progress')}
        </div>
        <div class="walk-step walk-step-solo">
          <div>
            <p class="step-n">5</p>
            <h2>When the program ends</h2>
            <p>You choose what is next. <strong>Build my next program</strong> asks a short check-in (how your pain compares to when you started, how hard it felt, what to focus on, days per week, and equipment) and rebuilds the plan. <strong>Level up my current plan</strong> keeps the same plan one level harder. A “worse” pain report never raises the level.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="band-soft">
      <div class="container narrow prose">
        <h2>What Remedy does not do</h2>
        <p>Remedy does not diagnose a cause, treat a condition, or replace a physician or physical therapist. Demonstration videos are educational illustrations of movements. If you have <a href="/guides/when-to-see-a-doctor-for-back-pain">warning signs</a>, stop and get medical care.</p>
        <p>There is no live coach, no community feed, and no Android app yet. Remedy covers the back only: no neck, shoulder, hip, or knee programs.</p>
        <p>Not sure what your back needs yet? Start with <a href="/guides/lower-back-pain-exercises">exercises for lower back pain</a> or the <a href="/guides/">full set of guides</a>.</p>
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
      <div class="container">
        ${crumbs(crumbItems)}
        <p class="kicker">Pricing</p>
        <h1>Remedy pricing</h1>
        <p class="lede">Free to download. Full access is an auto-renewing subscription billed through Apple. These are US prices.</p>
      </div>
    </header>
    <section class="tight-top">
      <div class="container">
        ${planCards()}
        <div class="center">${storeBadge()}</div>
      </div>
    </section>
    <section class="band-soft">
      <div class="container narrow">
        <h2 class="title">Every plan includes</h2>
        <ul class="checks checks-2">
          <li>A personalized 10 to 16 week program</li>
          <li>A demonstration video for every exercise</li>
          <li>Before-and-after pain check-ins and a pain trend</li>
          <li>Workout days and reminders</li>
          <li>A new program, or a harder one, when you finish</li>
          <li>Gym, band and dumbbell, or no-equipment versions</li>
        </ul>
      </div>
    </section>
    <section>
      <div class="container narrow">
        <h2 class="title">Billing, cancelling, and refunds</h2>
        ${faqHtml(faq, { openFirst: false })}
        <p class="fine">Payment is charged to your Apple ID account at confirmation of purchase. The subscription renews automatically unless you cancel at least 24 hours before the end of the current period. See the <a href="/terms">Terms of Service</a>.</p>
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
      ['Who is Remedy for?', 'Adults 17 and older with everyday back pain or stiffness who want a structured plan: desk workers, parents, people who lift, and people who just want to move more comfortably. It is not for people with warning signs or a new injury.'],
      ['Is it for lower back or upper back pain?', 'Both. Onboarding asks whether it is your upper back, lower back, or all over, and the program adapts.'],
      ['How long is a program?', '10 to 16 weeks, depending on how long your back has been bothering you and how it behaves. When it ends you can build a new program or level up your current one.'],
      ['How long is each session?', 'Each session shows its length and number of exercises before you start. A typical example is about 19 minutes with five exercises.'],
      ['Do I need equipment?', 'No. You choose full gym access, bands and light dumbbells, or open floor space, and the program uses only what you have.'],
      ['Is Remedy on Android?', 'Not yet. Remedy is iPhone only, and needs iOS 15.1 or later.'],
    ]],
    ['Price and subscriptions', [
      ['How much does Remedy cost?', 'Remedy is free to download. Full access is $4.99 a week, $12.99 a month, or $79.99 a year in the US. <a href="/pricing">Pricing details</a>.'],
      ['Is there a free trial?', 'Where offered: 7 days on the weekly and annual plans, and 14 days on the monthly plan.'],
      ['How do I cancel?', 'On your iPhone, open Settings, tap your name, then Subscriptions, and cancel Remedy. Deleting the app does not cancel your subscription.'],
      ['Can I get a refund?', 'App Store refunds are handled by Apple at <a href="https://reportaproblem.apple.com/">reportaproblem.apple.com</a>.'],
    ]],
    ['Safety and evidence', [
      ['Is Remedy physical therapy?', 'No. Remedy is a fitness and wellness app. It does not diagnose or treat conditions and is not a substitute for a doctor or physical therapist.'],
      ['Is Remedy safe to use with back pain?', 'For everyday back pain in people with no warning signs, exercise is one of the most recommended options in clinical guidelines. Stop any exercise that causes sharp pain or pain spreading down a leg, and see a clinician if you have <a href="/guides/when-to-see-a-doctor-for-back-pain">warning signs</a>.'],
      ['Is Remedy backed by research?', 'The approach, a progressive program of mobility, stability, and strength exercise, follows what guidelines like NICE and the American College of Physicians recommend for low back pain. Remedy has not run its own clinical trial of the app. Our guides link to every source.'],
      ['Who writes the guides?', 'The Remedy team. Guides are general fitness information based on published clinical guidelines and research, and every claim links to its source. They are not written or reviewed by a clinician. See our <a href="/about#editorial">editorial standards</a>.'],
    ]],
    ['Your armadillo', [
      ['What is the armadillo?', 'Every Remedy account comes with a pet armadillo that you name. It starts curled up in a ball and uncurls as you finish sessions. It is company, not a replacement for the program.'],
      ['How does the armadillo grow?', 'It has five stages. It moves up after your 1st, 4th, 9th, and 15th finished session, counted across your whole account. Missing a day never shrinks it. It just waits.'],
      ['What does the armadillo do all day?', 'It has moods. It sleeps at night, naps on rest days, reads a book upside down, and gets grumpy if you poke it too much. Its job is to be on your side.'],
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
      <div class="container narrow">
        ${crumbs(crumbItems)}
        <p class="kicker">FAQ</p>
        <h1>Frequently asked questions</h1>
        <p class="lede">Everything people ask about Remedy. Can’t find your answer? <a href="/contact">Contact us</a>.</p>
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
      <div class="container narrow">
        ${crumbs(crumbItems)}
        <p class="kicker">About</p>
        <h1>About Remedy</h1>
        <p class="lede">Remedy makes a back pain app for iPhone: a structured, video-guided back fitness program for people who want a plan instead of a pile of videos.</p>
      </div>
    </header>
    <section class="tight-top">
      <div class="container narrow prose">
        <h2>What we make</h2>
        <p>Remedy: Back Pain Relief is a consumer iPhone app. You answer a short onboarding about your back, and it builds a 10 to 16 week program of short sessions, with a demonstration video for every exercise and a pain check-in before and after. It also comes with a pet armadillo that you name and that grows as you finish sessions. It launched on the App Store on ${APP.releasedLabel}.</p>
        ${factsTable(APP_FACTS)}

        <h2>Why it exists</h2>
        <p>Most people with a sore back end up in one of two places: guessing with random videos they stop doing within a week, or paying for care they can’t keep up with. Exercise is one of the best-supported options for everyday back pain, but it only works if you keep doing it for weeks and it gets harder at the right pace. Remedy is built to be that middle path: a real plan in your pocket, one session at a time.</p>

        <h2 id="team">Who builds it</h2>
        <div class="person">
          <img src="/assets/rahul.webp" width="120" height="120" alt="Rahul Kumar" />
          <div>
            <h3>Rahul Kumar</h3>
            <p class="person-role">Founder and developer</p>
            <p>Rahul studies computer engineering and computer science at the University of Wisconsin–Madison and competes in powerlifting. He built Remedy end to end: the iOS app, the program engine that turns onboarding answers into a progressive plan, and subscriptions. He also co-founded <a href="${RELENTLESS}">Relentless</a>, a mental training app for athletes.</p>
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
      <div class="container narrow">
        ${crumbs(crumbItems)}
        <p class="kicker">Contact</p>
        <h1>Contact Remedy</h1>
        <p class="lede">Questions about the app, your program, or your account? Email us and a real person will reply.</p>
      </div>
    </header>
    <section class="tight-top">
      <div class="container narrow">
        <div class="contact-card">
          <p class="contact-label">Email</p>
          <a class="contact-email" href="mailto:${ORG.email}">${ORG.email}</a>
          <a class="btn" href="mailto:${ORG.email}?subject=Remedy%20support">Email us</a>
        </div>
        <div class="prose">
          <h2>Before you email</h2>
          <ul>
            <li><strong>Cancel a subscription:</strong> on your iPhone, Settings, then your name, then Subscriptions. <a href="/pricing">More on billing</a>.</li>
            <li><strong>Refunds:</strong> handled by Apple at <a href="https://reportaproblem.apple.com/">reportaproblem.apple.com</a>.</li>
            <li><strong>Delete your account:</strong> in the app, Profile, then Delete Account.</li>
            <li><strong>Stop marketing emails:</strong> see <a href="/unsubscribe">unsubscribe</a>.</li>
            <li><strong>Privacy requests:</strong> to see, correct, or delete the data we hold about you, email us from the address on your account. The <a href="/privacy">Privacy Policy</a> explains your rights.</li>
          </ul>
          <h2>What to include</h2>
          <p>A few details help us answer in one reply instead of three:</p>
          <ul>
            <li>The email address you signed up with.</li>
            <li>Your iPhone model and iOS version.</li>
            <li>What you were doing when the problem happened, and a screenshot if you have one.</li>
            <li>For program questions, which week and session you are on.</li>
          </ul>
          <p>Remedy can’t give medical advice by email. If you have <a href="/guides/when-to-see-a-doctor-for-back-pain">warning signs</a>, contact a healthcare provider.</p>
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
        <p class="kicker">Exercise library</p>
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
        count.textContent = shown + ' of ' + cards.length + ' exercises';
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
        webPageNode(path, title, description, { type: 'CollectionPage', props: { mainEntity: { '@type': 'ItemList', numberOfItems: EXERCISES.length, itemListElement: EXERCISES.map((e, i) => ({ '@type': 'ListItem', position: i + 1, name: exName(e), url: abs(exUrl(e.slug)) })) } } }),
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
        <p class="kicker">${GROUPS[e.group].label} exercise</p>
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
        <p class="kicker">${g.theme === 'relentless' ? 'For athletes' : 'Guide'}</p>
        <h1>${esc(g.h1)}</h1>
        <p class="lede">${esc(g.sub)}</p>
        <p class="byline">By <a href="/about#editorial">the Remedy team</a> · Published <time datetime="${g.published}">${formatDate(g.published)}</time>${g.updated !== g.published ? ` · Updated <time datetime="${g.updated}">${formatDate(g.updated)}</time>` : ''} · ${minutes} min read · ${refs.length} sources</p>
      </div>
    </header>
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
        <p class="kicker">Keep reading</p>
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
        <p class="kicker">Guides</p>
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
        <p class="kicker">404</p>
        <h1>That page doesn’t exist</h1>
        <p class="lede">It may have moved. These are the most useful places to go from here:</p>
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
