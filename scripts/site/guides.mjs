// Guide cluster for /guides (+ /desk). Tokens resolved at build time:
//   {{cite:key}}  numbered citation to SOURCES[key] (config.mjs), in order of first use
//   {{ex:slug}}   link to /exercises/slug using that exercise's display name
//   {{exl:slug}}  same link, lowercase name for mid-sentence use
// Each guide's <h2 id="..."> headings become its table of contents.

import { RELENTLESS } from './config.mjs';

export const RED_FLAGS_LIST = [
  'Numbness or tingling around your genitals or buttocks',
  'Trouble peeing, or loss of bladder or bowel control',
  'Numbness, tingling, or weakness in one or both legs that is getting worse',
  'Back pain after a fall, car accident, or other injury',
  'A fever, or feeling unwell, along with back pain',
  'Unexplained weight loss, or a history of cancer',
  'Pain that is severe, constant, and gets worse at night or when lying down',
  'Pain that keeps getting worse over several weeks instead of better',
];

export const GUIDES = [
  {
    slug: 'lower-back-pain-exercises',
    path: '/guides/lower-back-pain-exercises',
    card: 'Lower back pain exercises',
    blurb: 'The kinds of exercise that help a sore lower back, with a simple routine to start.',
    title: 'Lower Back Pain Exercises: What Helps, Plus a Starter Routine',
    h1: 'Exercises for lower back pain: what actually helps',
    description: 'Which exercises help lower back pain according to research, plus a simple home routine of mobility, core stability, and strength.',
    sub: 'Exercise is one of the most recommended things you can do for a sore lower back. There is no single magic move. What works is a sensible mix, done regularly and made a little harder over time.',
    published: '2026-10-23',
    updated: '2026-10-23',
    takeaways: [
      'Clinical guidelines from the UK, US, and WHO all list exercise as a first-line option for low back pain.',
      'No single exercise is best. Several types help, and the one you will keep doing beats the perfect one you skip.',
      'A good routine covers mobility, core stability, and hip and back strength, and gets harder over the weeks.',
    ],
    exercises: ['cat-cow', 'bird-dog', 'dead-bug', 'glute-bridge', 'bodyweight-hip-hinge', 'childs-pose'],
    sources: ['nice', 'acp', 'who', 'cochraneExercise', 'owen', 'lancetWhat', 'nhs'],
    related: ['stretches-for-lower-back-pain', 'core-exercises-for-back-pain', 'back-exercises-no-equipment'],
    faq: [
      ['What is the best exercise for lower back pain?', 'There isn’t one. Research comparing different types of exercise finds benefits across several, including stability work, strength training, Pilates, and aerobic exercise. The best one is a sensible mix you will actually do a few times a week.'],
      ['Should I exercise with lower back pain?', 'For most everyday back pain, yes. Guidelines recommend staying active and exercising rather than resting. Keep movements in a range that feels manageable, and stop anything that causes sharp pain or pain spreading down a leg. If you have any red-flag symptoms, see a clinician first.'],
      ['How often should I do lower back exercises?', 'Most structured programs run three or more short sessions a week for several weeks. Consistency matters more than session length.'],
    ],
    body: `
        <h2 id="does-exercise-help">Does exercise help lower back pain?</h2>
        <p>Yes, for most people. Low back pain is the leading cause of disability worldwide, and in most cases there is no single structural cause that a scan would find {{cite:lancetWhat}}. That is part of why guidelines lean so heavily on exercise and staying active rather than on fixing one specific thing.</p>
        <p>The UK’s NICE guideline recommends exercise programs for managing low back pain {{cite:nice}}. The American College of Physicians recommends exercise, along with other non-drug options like yoga and tai chi, as a first step for chronic low back pain {{cite:acp}}. The World Health Organization’s 2023 guideline also lists structured exercise programs among its recommended options {{cite:who}}.</p>
        <p>A Cochrane review of 249 trials found that exercise probably reduces pain for people with chronic low back pain compared with no treatment or usual care {{cite:cochraneExercise}}. The average effect is moderate, not miraculous, which is a good reason to treat it as a habit you build over weeks rather than a one-off fix.</p>

        <h2 id="which-exercises">Which exercises are best?</h2>
        <p>A large network meta-analysis compared different exercise types for chronic low back pain. It found benefits across several, including Pilates, stability (motor control) training, resistance training, and aerobic exercise {{cite:owen}}. In practice that means the label matters less than covering a few bases:</p>
        <ul>
          <li><strong>Mobility.</strong> Moving the spine and hips through a comfortable range. {{ex:cat-cow}}, {{exl:open-book-rotation}}, and a {{exl:hip-flexor-stretch}} are common choices.</li>
          <li><strong>Core stability.</strong> Holding the trunk steady while arms and legs move: the {{exl:bird-dog}}, {{exl:dead-bug}}, and {{exl:side-plank-knees}}.</li>
          <li><strong>Hip and back strength.</strong> The muscles that do the work when you lift and stand up: {{exl:glute-bridge}}, {{exl:bodyweight-hip-hinge}}, and {{exl:bodyweight-squat}}.</li>
          <li><strong>General activity.</strong> Walking counts. <a href="/guides/is-walking-good-for-back-pain">Walking for back pain</a> has its own guide.</li>
        </ul>

        <h2 id="starter-routine">A simple starter routine</h2>
        <p>This is the kind of session Remedy builds early in a program for someone with no equipment. It takes about 15 minutes. Move slowly and stay in a range that feels manageable.</p>
        <ol class="routine">
          <li><strong>{{ex:cat-cow}}</strong>: 2 sets of 10 slow reps to warm up.</li>
          <li><strong>{{ex:bird-dog}}</strong>: 3 sets of 5 per side, holding each for about 10 seconds.</li>
          <li><strong>{{ex:dead-bug}}</strong>: 3 sets of 10, lowering over about 3 seconds.</li>
          <li><strong>{{ex:glute-bridge}}</strong>: 3 sets of 12.</li>
          <li><strong>{{ex:bodyweight-hip-hinge}}</strong>: 3 sets of 12.</li>
          <li><strong>{{ex:childs-pose}}</strong>: 2 holds of about 40 seconds to cool down.</li>
        </ol>
        <p>Do it three times a week. When a move feels easy for a full week, move to the harder version listed on its exercise page, for example from the glute bridge to the {{exl:single-leg-glute-bridge}}. That is how Remedy progresses: harder variants, not endless extra reps.</p>

        <h2 id="what-to-avoid">What should I avoid?</h2>
        <p>You do not need to avoid bending or lifting forever. What helps is choosing a version you can do with control right now and building up from there. A few practical rules:</p>
        <ul>
          <li>Mild, general discomfort that settles within a day is common when you start. Sharp pain, or pain spreading down a leg, means stop that movement.</li>
          <li>Swap an exercise that always makes things worse for another in the same group.</li>
          <li>Don’t judge a routine after one week. <a href="/guides/how-long-to-stick-with-a-back-routine">How long to stick with it</a> covers realistic timelines.</li>
        </ul>

        <h2 id="how-remedy-fits">How Remedy fits</h2>
        <p>Remedy builds this kind of program from a short onboarding, including where it hurts and what makes it worse. Every session has a warm-up, main work, and cooldown, every exercise has a demonstration video, and the difficulty climbs week by week. <a href="/how">See how it works</a> or browse the <a href="/exercises/">exercise guides</a>.</p>`,
  },
  {
    slug: 'stretches-for-lower-back-pain',
    path: '/guides/stretches-for-lower-back-pain',
    card: 'Stretches for lower back pain',
    blurb: 'Gentle stretches that ease a stiff lower back, and why stretching alone is not enough.',
    title: '6 Gentle Stretches for Lower Back Pain and How to Use Them',
    h1: 'Stretches for lower back pain',
    description: 'Six gentle stretches for a stiff or sore lower back: how long to hold them, when they help most, and why to pair them with strength.',
    sub: 'Stretching can make a stiff back feel better in the moment. It works best as the warm-up and cooldown of a routine that also builds strength.',
    published: '2026-10-23',
    updated: '2026-10-23',
    takeaways: [
      'Gentle stretches ease stiffness, especially in the morning and after long sitting.',
      'Hold each stretch for about 30 seconds and breathe. It should feel like a pull, never sharp pain.',
      'Stretching alone is not a full program. Pair it with core and strength work for longer-term results.',
    ],
    exercises: ['cat-cow', 'childs-pose', 'figure-4-stretch', 'hamstring-stretch', 'hip-flexor-stretch', 'open-book-rotation'],
    sources: ['nice', 'cochraneExercise', 'owen', 'nhs'],
    related: ['lower-back-pain-exercises', 'morning-back-stiffness', 'desk'],
    faq: [
      ['How long should I hold a stretch for back pain?', 'About 30 seconds is a common target for static stretches like the figure-4 or hamstring stretch, repeated once or twice. Moving stretches like cat-cow are done as slow reps instead.'],
      ['Is it OK to stretch every day?', 'Gentle stretches like these are generally fine daily, and many people find them most useful first thing in the morning or after a long stretch of sitting.'],
      ['Should stretching hurt?', 'No. You should feel a mild pull. Sharp pain, or tingling and numbness down a leg, is a sign to ease off.'],
    ],
    body: `
        <h2 id="does-stretching-help">Does stretching help lower back pain?</h2>
        <p>Stretching tends to help most with stiffness: the locked-up feeling after sleep or a long day in a chair. It is gentle, needs no equipment, and is easy to do daily.</p>
        <p>The research on exercise for back pain is mostly about programs that combine several kinds of movement, including strength and stability work, rather than stretching alone {{cite:cochraneExercise}} {{cite:owen}}. NICE also recommends exercise programs rather than any single technique {{cite:nice}}. So the useful way to think about stretching is as the warm-up and cooldown of a routine, not the whole routine.</p>

        <h2 id="six-stretches">Six gentle stretches to try</h2>
        <ol class="routine">
          <li><strong>{{ex:cat-cow}}</strong>: 10 slow reps. Round and arch through a comfortable range on hands and knees.</li>
          <li><strong>{{ex:childs-pose}}</strong>: hold about 40 seconds. Sit back toward your heels with your arms long.</li>
          <li><strong>{{ex:figure-4-stretch}}</strong>: about 30 seconds per side for the glutes.</li>
          <li><strong>{{ex:hamstring-stretch}}</strong>: about 30 seconds per side, lying down so your back stays supported.</li>
          <li><strong>{{ex:hip-flexor-stretch}}</strong>: about 30 seconds per side, useful if you sit a lot.</li>
          <li><strong>{{ex:open-book-rotation}}</strong>: 8 per side for the upper and middle back.</li>
        </ol>

        <h2 id="when-to-stretch">When to stretch</h2>
        <ul>
          <li><strong>In the morning.</strong> Cat-cow and child’s pose are easy ways to loosen up. <a href="/guides/morning-back-stiffness">Why mornings feel worst</a> covers the rest.</li>
          <li><strong>After sitting.</strong> The hip flexor stretch and open-book rotation undo some of a long desk day. See <a href="/desk">back pain from sitting</a>.</li>
          <li><strong>After strength work.</strong> Remedy finishes every session with a recovery stretch like child’s pose, the figure-4, or the hamstring stretch.</li>
        </ul>

        <h2 id="how-to-stretch">How to stretch safely</h2>
        <ul>
          <li>Ease in slowly and breathe. No bouncing.</li>
          <li>Aim for a mild pull. If it is sharp, back off.</li>
          <li>Tingling or shooting pain down a leg is a nerve-related feeling, not a muscle stretch. Ease off, and if it keeps happening, get it checked. The <a href="/guides/when-to-see-a-doctor-for-back-pain">when to see a doctor guide</a> lists the warning signs.</li>
        </ul>

        <h2 id="beyond-stretching">Going beyond stretching</h2>
        <p>If stretching makes your back feel better for an hour but the stiffness keeps coming back, the missing piece is usually strength and stability. <a href="/guides/core-exercises-for-back-pain">Core exercises for back pain</a> and <a href="/guides/lower-back-pain-exercises">the lower back exercise guide</a> cover that side.</p>

        <h2 id="how-remedy-fits">How Remedy fits</h2>
        <p>In Remedy, mobility and recovery stretches are built into the warm-up and cooldown of every session, so they never drop out as the strength work gets harder. If you tell the app mornings are your worst time, stretches aimed at morning stiffness are more likely to show up. <a href="/how">How the program is built</a>.</p>`,
  },
  {
    slug: 'core-exercises-for-back-pain',
    path: '/guides/core-exercises-for-back-pain',
    card: 'Core exercises for back pain',
    blurb: 'What “core” really means for a sore back, and a progression from floor to standing.',
    title: 'Core Exercises for Back Pain: A Progression That Builds | Remedy',
    h1: 'Core exercises for back pain',
    description: 'What core stability means for back pain, what research says, and a progression from dead bugs and bird dogs to side planks.',
    sub: 'Core work for back pain is not about crunches or a six-pack. It is about keeping your trunk steady while your arms and legs move, and building that up step by step.',
    published: '2026-10-23',
    updated: '2026-10-23',
    takeaways: [
      'For back pain, “core” means the muscles that keep your trunk steady, not just your abs.',
      'Core-focused exercise helps chronic low back pain about as much as other good exercise, so it is one useful piece, not the only one.',
      'Progress from supported floor exercises to side planks and loaded carries over several weeks.',
    ],
    exercises: ['dead-bug', 'bird-dog', 'side-plank-knees', 'side-plank', 'suitcase-carry'],
    sources: ['cochraneMotor', 'owen', 'acp', 'nhs'],
    related: ['lower-back-pain-exercises', 'back-exercises-no-equipment', 'how-long-to-stick-with-a-back-routine'],
    faq: [
      ['Are crunches good for back pain?', 'Crunches are not usually the first choice. Exercises that train the trunk to stay still while the limbs move, like the dead bug, bird dog, and side plank, are more common in back programs.'],
      ['Is planking good for lower back pain?', 'Side planks are a common part of back routines because they build endurance in the side of the trunk. Start from the knees, keep holds short, and stop if your form goes or the pain gets sharper.'],
      ['How long until core exercises help my back?', 'Think in weeks. Judge a routine after four to six weeks of doing it regularly, not after a few sessions.'],
    ],
    body: `
        <h2 id="what-is-core">What does “core” mean for back pain?</h2>
        <p>Your core is the set of muscles around your trunk: the deep abdominal muscles, the muscles along your spine, the muscles on your sides, your diaphragm, and your pelvic floor. For back pain, the useful skill is keeping that trunk steady while your arms and legs do the moving. That is why back programs lean on exercises like the {{exl:bird-dog}} and {{exl:dead-bug}} instead of crunches.</p>

        <h2 id="does-it-help">Does core exercise help back pain?</h2>
        <p>Yes, though it is not unique. A Cochrane review of motor control exercise, the formal name for this kind of core training, found it probably helps people with chronic low back pain more than minimal treatment, and about as much as other forms of exercise {{cite:cochraneMotor}}. A network meta-analysis also ranked stability training among several effective exercise types {{cite:owen}}, and the American College of Physicians lists motor control exercise among its recommended non-drug options for chronic low back pain {{cite:acp}}.</p>
        <p>So core work is a good part of a routine, alongside mobility and strength. It is not the whole answer on its own.</p>

        <h2 id="progression">A core progression for back pain</h2>
        <p>This is the order Remedy climbs through. Stay on each step until it feels steady for a week or so, then move on.</p>
        <ol class="routine">
          <li><strong>{{ex:dead-bug}}</strong>: on your back, lowering an opposite arm and leg while your low back stays down. 3 sets of 10.</li>
          <li><strong>{{ex:bird-dog}}</strong>: on hands and knees, reaching an opposite arm and leg. 3 sets of 5 per side with 10-second holds.</li>
          <li><strong>{{ex:side-plank-knees}}</strong>: short holds from the knees. 3 sets of 4 ten-second holds per side.</li>
          <li><strong>{{ex:side-plank}}</strong>: the full version on your feet.</li>
          <li><strong>{{ex:suitcase-carry}}</strong>: walking with a weight in one hand without leaning. The most “real life” of the set.</li>
        </ol>

        <h2 id="short-holds">Short holds beat long shaky ones</h2>
        <p>Holding a plank for two minutes is not the goal. Repeated short holds of around ten seconds let you keep good form for every second of work, which is what builds the endurance you use in daily life. When you can do all your holds without your hips sagging or your back moving, that is the signal to progress.</p>

        <h2 id="common-mistakes">Common mistakes</h2>
        <ul>
          <li>Holding your breath. Breathe normally through every hold.</li>
          <li>Going too fast on the dead bug and bird dog. Slow, controlled reps are the point.</li>
          <li>Skipping straight to full planks. Starting from the knees is not a lesser version, it is the right step.</li>
        </ul>

        <h2 id="how-remedy-fits">How Remedy fits</h2>
        <p>Core and stability work is a fixed part of most Remedy sessions, and the app climbs this ladder for you as the weeks go on. Each exercise has a demonstration video, so you can check your form against it. <a href="/exercises/">Browse the exercise library</a>.</p>`,
  },
  {
    slug: 'upper-back-pain-exercises',
    path: '/guides/upper-back-pain-exercises',
    card: 'Upper back pain exercises',
    blurb: 'Mobility and strength for a tight upper or middle back, especially if you sit a lot.',
    title: 'Upper Back Pain Exercises for Desk Workers and Lifters | Remedy',
    h1: 'Exercises for upper and middle back pain',
    description: 'Exercises for a stiff upper back: thoracic mobility, rows for strength, how to fit them into a workday, and when to see a doctor.',
    sub: 'A tight upper back usually responds well to two things: moving it more, especially into extension and rotation, and making the muscles between your shoulder blades stronger.',
    published: '2026-10-23',
    updated: '2026-10-23',
    takeaways: [
      'Most upper back stiffness comes with long periods in one position, often sitting at a screen.',
      'Combine thoracic mobility (rotation and extension) with rows that strengthen the muscles around your shoulder blades.',
      'Upper back pain with chest pain, shortness of breath, or fever needs medical care, not exercise.',
    ],
    exercises: ['open-book-rotation', 'thoracic-extension', 'banded-row', 'seated-cable-row', 'cat-cow'],
    sources: ['nhs', 'medline'],
    related: ['desk', 'stretches-for-lower-back-pain', 'when-to-see-a-doctor-for-back-pain'],
    faq: [
      ['What causes upper back pain from sitting?', 'Usually spending a long time in one position, often rounded toward a screen, rather than any damage. Moving more often and strengthening the upper back tend to help.'],
      ['What is the best exercise for upper back pain?', 'A combination works best: a rotation like the open-book, an extension like the chair thoracic extension, and a row to build the muscles between your shoulder blades.'],
      ['When is upper back pain serious?', 'Get urgent medical help if upper back pain comes with chest pain, shortness of breath, sweating, fever, or after an injury.'],
    ],
    body: `
        <h2 id="why-it-happens">Why does the upper back get tight?</h2>
        <p>The upper and middle back, called the thoracic spine, is built for rotation and some extension. Long stretches of sitting and looking down at a screen keep it rounded and still for hours. For most people the result is stiffness and an ache between the shoulder blades, not an injury. Most back pain, upper or lower, improves with time and staying active {{cite:nhs}}.</p>

        <h2 id="mobility">Mobility: get it moving</h2>
        <ul>
          <li><strong>{{ex:open-book-rotation}}</strong>: side-lying rotation, 8 per side. Keep your knees stacked so the twist comes from your upper back.</li>
          <li><strong>{{ex:thoracic-extension}}</strong>: lean back over a chair, 8 reps. Easy to do at a desk.</li>
          <li><strong>{{ex:cat-cow}}</strong>: moves the whole spine, upper back included.</li>
        </ul>

        <h2 id="strength">Strength: build the muscles that hold you up</h2>
        <p>Mobility makes the upper back feel better. Strength makes it easier to sit and stand tall without effort. Rows are the main tool:</p>
        <ul>
          <li><strong>{{ex:banded-row}}</strong>: pull a band to your lower ribs and squeeze your shoulder blades. 3 sets of 12.</li>
          <li><strong>{{ex:seated-cable-row}}</strong>: the gym version, with load you can increase in small steps.</li>
        </ul>
        <p>Remedy’s upper back sessions pair these: a mobility warm-up, rows for strength, and a cooldown.</p>

        <h2 id="workday">Fitting it into a workday</h2>
        <ul>
          <li>Change position at least every 30 to 60 minutes. Stand up, walk to get water, look away from the screen.</li>
          <li>Do a few chair thoracic extensions between meetings. They take under a minute.</li>
          <li>Save rows and the fuller routine for a short session before or after work.</li>
        </ul>
        <p>The <a href="/desk">guide for people who sit all day</a> covers the low back side of desk work too.</p>

        <h2 id="when-to-worry">When upper back pain needs a doctor</h2>
        <p>Upper back pain can sometimes come from something other than muscles and joints. Get urgent medical help if it comes with chest pain, shortness of breath, sweating, or nausea, or if you have a fever or feel unwell {{cite:medline}}. Pain after a fall or injury also needs checking. The <a href="/guides/when-to-see-a-doctor-for-back-pain">full list of warning signs</a> is in its own guide.</p>

        <h2 id="how-remedy-fits">How Remedy fits</h2>
        <p>Remedy’s onboarding asks where it hurts: upper back, lower back, or all over. Choosing the upper back shifts your program toward thoracic mobility and rows. <a href="/how">How it works</a>.</p>`,
  },
  {
    slug: 'is-walking-good-for-back-pain',
    path: '/guides/is-walking-good-for-back-pain',
    card: 'Is walking good for back pain?',
    blurb: 'What a 2024 trial found about walking and back pain, and how to build up.',
    title: 'Is Walking Good for Back Pain? What WalkBack Found | Remedy',
    h1: 'Is walking good for back pain?',
    description: 'What research says about walking for lower back pain, including the WalkBack trial: how much to walk and how to build up.',
    sub: 'Walking is free, needs no equipment, and has some of the most encouraging recent evidence of any activity for people who keep getting back pain.',
    published: '2026-10-23',
    updated: '2026-10-23',
    takeaways: [
      'Staying active is better than bed rest for most back pain.',
      'In a 2024 trial, a progressive walking and education program roughly doubled the time people went before their next episode of low back pain.',
      'Build up gradually. Walking works well alongside a strength and mobility routine.',
    ],
    exercises: ['cat-cow', 'glute-bridge', 'hip-flexor-stretch'],
    sources: ['walkback', 'cochraneRest', 'steffens', 'nhs', 'nhsWalking'],
    related: ['lower-back-pain-exercises', 'how-long-to-stick-with-a-back-routine', 'morning-back-stiffness'],
    faq: [
      ['How much should I walk for back pain?', 'Start with what feels manageable, even 10 minutes, and build up gradually over weeks. In the WalkBack trial, people worked up toward about 30 minutes, five times a week.'],
      ['Is it better to walk or rest with a sore back?', 'For most everyday back pain, staying active is better. People advised to stay active do slightly better than those advised to rest in bed.'],
      ['Can walking make back pain worse?', 'It can if you do far more than you are used to all at once. Increase time and pace gradually, and stop if pain spreads down a leg or you get numbness or weakness.'],
    ],
    body: `
        <h2 id="what-research-says">What the research says</h2>
        <p>The clearest recent evidence comes from the WalkBack trial, published in The Lancet in 2024. Adults who had recently recovered from an episode of low back pain were split into two groups. One followed an individualised, progressive walking program with education sessions. The other got no intervention. The walking group went a median of 208 days before their next episode, compared with 112 days for the control group {{cite:walkback}}.</p>
        <p>That fits older evidence. A Cochrane review found people advised to stay active did slightly better than people advised to rest in bed {{cite:cochraneRest}}, and a review of prevention studies found that exercise, alone or with education, lowered the risk of a new episode of back pain {{cite:steffens}}.</p>

        <h2 id="why-walking">Why walking works</h2>
        <ul>
          <li>It is gentle, rhythmic movement that most people can do even with a sore back.</li>
          <li>It is easy to make slightly harder over time by adding minutes or pace.</li>
          <li>It needs nothing but shoes, so it is easy to keep doing, which is what matters most.</li>
        </ul>

        <h2 id="how-much">How much to walk</h2>
        <p>The WalkBack program built people up gradually toward about 30 minutes, five times a week, with the plan adjusted to each person {{cite:walkback}}. A practical way to start:</p>
        <ol class="routine">
          <li>Walk for as long as feels manageable, even 10 minutes, at an easy pace.</li>
          <li>Add a few minutes each week, not each day.</li>
          <li>Once 30 minutes feels easy, pick up the pace or add a gentle hill.</li>
        </ol>
        <p>The NHS has more general advice on <a href="https://www.nhs.uk/live-well/exercise/walking-for-health/">walking for health</a> {{cite:nhsWalking}}.</p>

        <h2 id="walking-plus">Walking plus a routine</h2>
        <p>Walking covers general activity. It does less for hip strength, core stability, and mobility, which is where a short routine fits in. A {{exl:glute-bridge}}, a few {{exl:cat-cow}} reps, and a {{exl:hip-flexor-stretch}} make a good partner for a daily walk. <a href="/guides/lower-back-pain-exercises">The lower back exercise guide</a> has a full starter routine.</p>

        <h2 id="when-to-stop">When to stop</h2>
        <p>Stop and get checked if walking brings on pain that spreads down a leg with numbness, tingling, or weakness, or if your back is getting steadily worse over a couple of weeks {{cite:nhs}}. See the <a href="/guides/when-to-see-a-doctor-for-back-pain">warning signs guide</a> for the full list.</p>

        <h2 id="how-remedy-fits">How Remedy fits</h2>
        <p>Remedy is the routine half: short, video-guided sessions of mobility, stability, and strength on the days you choose. Walking is a great thing to do on the days in between. <a href="/how">See how Remedy works</a>.</p>`,
  },
  {
    slug: 'when-to-see-a-doctor-for-back-pain',
    path: '/guides/when-to-see-a-doctor-for-back-pain',
    card: 'When to see a doctor',
    blurb: 'The warning signs that mean you need medical care, not an exercise routine.',
    title: 'When to See a Doctor for Back Pain: Warning Signs | Remedy',
    h1: 'When to see a doctor for back pain',
    description: 'The warning signs that mean back pain needs urgent or prompt care, what is usually fine to manage at home, and why most needs no scan.',
    sub: 'Most back pain gets better on its own with time and staying active. A few warning signs mean you should get medical care instead of starting an exercise routine.',
    published: '2026-10-23',
    updated: '2026-10-23',
    takeaways: [
      'Most back pain is not caused by serious damage and improves within weeks.',
      'Numbness around the genitals or buttocks, or loss of bladder or bowel control, is an emergency.',
      'Pain after an injury, with fever, with unexplained weight loss, or that keeps getting worse needs to be checked.',
    ],
    exercises: [],
    sources: ['nhs', 'nhsSciatica', 'nice', 'lancetTreat', 'medline'],
    related: ['lower-back-pain-exercises', 'sore-back-after-gym', 'morning-back-stiffness'],
    faq: [
      ['Do I need an X-ray or MRI for back pain?', 'Usually not. Guidelines advise against routine imaging for back pain without warning signs, because scans rarely change what helps and often show changes that are normal with age.'],
      ['When is back pain an emergency?', 'Go to an emergency department or call 911 if you have numbness around your genitals or buttocks, trouble peeing or loss of bladder or bowel control, or weakness in both legs.'],
      ['How long should back pain last before I see a doctor?', 'See a doctor if it is not improving after a few weeks, is getting worse, or is stopping you from doing daily activities, or sooner if you have any warning signs.'],
    ],
    body: `
        <h2 id="most-back-pain">Most back pain is not serious</h2>
        <p>Back pain usually improves within a few weeks or months {{cite:nhs}}. In most cases there is no serious cause, and guidelines recommend staying active, simple self-care, and exercise rather than tests {{cite:nice}} {{cite:lancetTreat}}. The point of knowing the warning signs is to catch the small number of cases that are different.</p>

        <h2 id="emergency">Get emergency care right away</h2>
        <p>Go to an emergency department or call 911 (or your local emergency number) if you have back pain with any of these. They can be signs of pressure on the nerves at the base of the spine, which needs urgent treatment {{cite:nhs}} {{cite:nhsSciatica}}:</p>
        <ul class="flag-list">
          <li>Numbness or tingling around your genitals, buttocks, or inner thighs</li>
          <li>Trouble peeing, or loss of bladder or bowel control</li>
          <li>Weakness or numbness in both legs, or weakness that is getting worse quickly</li>
          <li>Chest pain or shortness of breath along with upper back pain</li>
        </ul>

        <h2 id="see-a-doctor">See a doctor soon</h2>
        <p>Book an appointment promptly if you have back pain and {{cite:nhs}} {{cite:medline}}:</p>
        <ul class="flag-list">
          <li>It started after a fall, car accident, or other injury</li>
          <li>You have a fever or feel generally unwell</li>
          <li>You have lost weight without trying, or have a history of cancer</li>
          <li>It is severe and constant, or worse at night and when lying down</li>
          <li>It spreads down a leg below the knee with numbness, tingling, or weakness</li>
          <li>It is not improving after a few weeks, or keeps getting worse</li>
        </ul>
        <p>Another pattern worth raising with a doctor: stiffness that lasts a long time most mornings, gets better with exercise but not rest, and started gradually before your mid-forties. That can point to an inflammatory condition. <a href="/guides/morning-back-stiffness">The morning stiffness guide</a> explains more.</p>

        <h2 id="scans">Do I need a scan?</h2>
        <p>Usually not. Guidelines advise against routine X-rays or MRI for back pain without warning signs {{cite:nice}} {{cite:lancetTreat}}. Scans often show disc and joint changes that are common in people with no pain at all, and they rarely change what helps. A clinician will order imaging if your symptoms suggest it is needed.</p>

        <h2 id="usually-fine">What is usually fine to manage yourself</h2>
        <ul>
          <li>An ache or stiffness that eases as you move.</li>
          <li>Soreness the day or two after new or harder exercise. See <a href="/guides/sore-back-after-gym">sore back after the gym</a>.</li>
          <li>Stiffness from sitting that eases when you get up and move. See <a href="/desk">back pain from sitting</a>.</li>
        </ul>
        <p>For these, staying active and a sensible routine are what guidelines recommend. <a href="/guides/lower-back-pain-exercises">Exercises for lower back pain</a> is a good place to start.</p>

        <h2 id="apps">Where an app fits, and where it doesn’t</h2>
        <p>An exercise app like Remedy is for everyday back pain in people who have no warning signs and are able to exercise. It is not a diagnosis, it cannot examine you, and it is not a substitute for a doctor or physical therapist. If anything on this page applies to you, get it checked first.</p>`,
  },
  {
    slug: 'best-back-pain-apps',
    path: '/guides/best-back-pain-apps',
    card: 'Back pain apps compared',
    blurb: 'Hinge Health, Sword, Curable, YouTube, PT, and Remedy: which fits which situation.',
    title: 'Back Pain Apps Compared (2026): Which One Fits You | Remedy',
    h1: 'Back pain apps compared: which one fits your situation',
    description: 'Back pain apps compared for 2026: Hinge Health and Sword digital PT, pain-education apps like Curable, free videos, PT, and Remedy.',
    sub: 'The right back pain app depends less on features and more on your situation: whether your employer covers one, whether you want a care team, and what you are willing to pay.',
    published: '2026-10-23',
    updated: '2026-10-23',
    disclosure: 'We make Remedy, so we are not neutral. We have tried to describe every option accurately and say plainly when another one is the better fit. Check each provider’s own site for current details.',
    takeaways: [
      'If your employer or health plan offers Hinge Health or Sword for free, check that first.',
      'If you need a diagnosis or have warning signs, see a clinician before any app.',
      'If you want a structured exercise plan you can buy yourself on iPhone, that is what Remedy is for.',
    ],
    exercises: [],
    sources: ['cochraneExercise', 'acp', 'nice'],
    related: ['lower-back-pain-exercises', 'when-to-see-a-doctor-for-back-pain', 'how-long-to-stick-with-a-back-routine'],
    faq: [
      ['What is the best app for back pain?', 'It depends on access. If your employer or health plan covers a digital physical therapy program, that is usually the best first choice. If not, a consumer exercise app with a structured, progressive program is the closest self-pay option.'],
      ['Is there a back pain app I can use without insurance or an employer?', 'Yes. Remedy is available to anyone with an iPhone on the App Store. It is free to download, and full access is a subscription.'],
      ['Do back pain apps actually work?', 'Exercise is one of the best-supported options for chronic low back pain, and apps are one way to deliver it. Results depend mostly on whether you keep doing the program for several weeks.'],
    ],
    body: `
        <h2 id="at-a-glance">At a glance</h2>
        <div class="table-wrap">
          <table class="compare">
            <thead><tr><th scope="col">Option</th><th scope="col">What it is</th><th scope="col">How you get it</th><th scope="col">Best if</th></tr></thead>
            <tbody>
              <tr><th scope="row">Hinge Health</th><td>Digital physical therapy and exercise program with a care team</td><td>Usually through an employer or health plan</td><td>Your benefits cover it</td></tr>
              <tr><th scope="row">Sword (Sword Health, including Kaia)</th><td>Digital physical therapy with motion-guided exercise and clinical oversight</td><td>Usually through an employer or health plan</td><td>Your benefits cover it</td></tr>
              <tr><th scope="row">Curable</th><td>Pain-education and mind-body program, not an exercise app</td><td>Consumer subscription</td><td>You want to work on the psychological side of chronic pain</td></tr>
              <tr><th scope="row">YouTube and social video</th><td>Free individual videos, no program</td><td>Free</td><td>You already know what to do and will stick with it</td></tr>
              <tr><th scope="row">In-person physical therapy</th><td>Licensed clinical assessment and treatment</td><td>Referral or direct booking, often insurance</td><td>You need an assessment, have warning signs, or are not improving</td></tr>
              <tr class="is-remedy"><th scope="row">Remedy</th><td>Structured, video-guided back fitness program on iPhone</td><td>App Store, free download with a subscription</td><td>You want a plan you can buy yourself, without an employer</td></tr>
            </tbody>
          </table>
        </div>

        <h2 id="employer-programs">Employer-covered digital PT: Hinge Health and Sword</h2>
        <p><a href="https://www.hingehealth.com/">Hinge Health</a> and <a href="https://sword.com/">Sword Health</a> (now branded simply Sword) are the two largest digital musculoskeletal programs in the US. Both pair app-based exercise therapy with clinical support, and both are usually offered as a benefit through employers and health plans rather than sold directly to individuals. Sword <a href="https://sword.com/newsroom/sword-acquires-kaia-health">acquired Kaia Health</a> in January 2026.</p>
        <p>If your job or plan offers either at no cost, it is worth checking first. You get a care team that Remedy does not have. If you don’t have access, they generally aren’t something you can just download and buy.</p>

        <h2 id="mind-body">Pain education apps: Curable</h2>
        <p><a href="https://www.curablehealth.com/">Curable</a> takes a different approach: pain science education, meditation, and other mind-body techniques for chronic pain. It is a self-guided subscription app. It is less about exercise and more about how the nervous system processes pain, so it can sit alongside an exercise program rather than replace one.</p>

        <h2 id="free-video">Free videos</h2>
        <p>There are good back exercise videos online for free. What they don’t give you is a plan: what to do today, what to do next week, and when to make it harder. Most people who start with a playlist stop within a couple of weeks, which matters because exercise for back pain works over weeks, not days {{cite:cochraneExercise}}.</p>

        <h2 id="physical-therapy">In-person physical therapy</h2>
        <p>A physical therapist can examine you, which no app can. If you have <a href="/guides/when-to-see-a-doctor-for-back-pain">warning signs</a>, aren’t improving after a few weeks, or simply want a professional assessment, in-person care is the right call.</p>

        <h2 id="remedy">Remedy</h2>
        <p>Remedy is a consumer iPhone app. You answer a short onboarding about your back, get a multi-week program built from your answers, and follow short sessions with a demonstration video for every exercise. You check in on your pain before and after each session so you can see the trend. It is free to download; full access is a subscription of $4.99 a week, $12.99 a month, or $79.99 a year, with a free trial where offered. <a href="/pricing">Pricing details</a>.</p>
        <p>What it isn’t: physical therapy, a diagnosis, or a care team. There are no live coaches, no motion sensors, and no Android app yet.</p>

        <h2 id="how-to-choose">How to choose</h2>
        <ul>
          <li><strong>Warning signs, or a new injury?</strong> See a clinician first.</li>
          <li><strong>Covered by work or insurance?</strong> Try Hinge Health or Sword.</li>
          <li><strong>Chronic pain where stress and worry play a big part?</strong> Curable may be a useful addition.</li>
          <li><strong>Want a structured exercise plan you can start today on iPhone?</strong> <a href="/back-pain-app">The Remedy app</a>.</li>
        </ul>
        <p>Whatever you choose, exercise is one of the best-supported non-drug options for chronic low back pain {{cite:acp}} {{cite:nice}}. The best program is the one you will actually do for six weeks.</p>`,
  },
  {
    slug: 'morning-back-stiffness',
    path: '/guides/morning-back-stiffness',
    card: 'Lower back stiff in the morning',
    blurb: 'Why mornings feel worst, what usually helps, and when stiffness needs a doctor.',
    title: 'Lower Back Stiff in the Morning? Why, and What Helps | Remedy',
    h1: 'Why your lower back is stiff in the morning',
    description: 'Why a lower back feels stiffest in the morning, what helps it loosen up, and the kind of morning stiffness that needs a doctor.',
    sub: 'Waking up stiff and loosening up as you move is one of the most common back complaints. Here is what tends to help, and the pattern that is worth getting checked.',
    published: '2026-10-15',
    updated: '2026-10-23',
    takeaways: [
      'Morning stiffness that eases within a short time of getting up is very common.',
      'Gentle movement first thing helps more than forcing a deep stretch cold.',
      'Stiffness that lasts a long time, improves with exercise but not rest, and wakes you at night is worth raising with a doctor.',
    ],
    exercises: ['cat-cow', 'childs-pose', 'hamstring-stretch', 'open-book-rotation'],
    sources: ['nice', 'acp', 'nhs'],
    related: ['desk', 'stretches-for-lower-back-pain', 'how-long-to-stick-with-a-back-routine'],
    faq: [
      ['Why is my lower back stiff when I wake up?', 'You have spent hours lying fairly still, so the muscles and joints around your spine have barely moved. For most people that stiffness eases once they have been up and moving for a while.'],
      ['Is my mattress causing my back pain?', 'It can play a part, but there is rarely one perfect setup. A back that is stiff every morning usually says more about how much it moves and how strong it is across the week than about one night’s sleep.'],
      ['When is morning back stiffness a concern?', 'If it lasts a long time most mornings, gets better with exercise but not with rest, or wakes you in the second half of the night, especially if it started before your mid-forties, raise it with a doctor.'],
    ],
    body: `
        <h2 id="why-mornings">Why do mornings feel worst?</h2>
        <p>You spend hours lying fairly still. The muscles and joints around your spine have barely moved, so the first bend of the day, putting on socks or leaning over the sink, is the one you notice. For most people, that stiffness eases once they have been up and moving for a while.</p>
        <p>Your mattress and sleeping position can play a part, but there is rarely one perfect setup. A back that is stiff every morning is usually telling you more about how much it moves and how strong it is across the whole week than about one night’s sleep.</p>

        <h2 id="what-helps">What usually helps in the morning</h2>
        <ul>
          <li><strong>Get up in stages.</strong> Roll onto your side, push up with your arms, and sit on the edge of the bed for a moment before standing.</li>
          <li><strong>Move gently before you move hard.</strong> A few minutes of easy movement, like walking around the house, {{exl:cat-cow}} on hands and knees, or knees rocking side to side while lying on your back, warms things up better than forcing a deep stretch cold.</li>
          <li><strong>Save heavy lifting and long sitting for later.</strong> If you can, do your hardest physical tasks after you have been up for an hour, not straight out of bed.</li>
        </ul>
        <p>None of this is a fix on its own. It just makes mornings easier while you work on the part that matters more.</p>

        <h2 id="rest-of-week">What matters more: the rest of the week</h2>
        <p>Clinical guidelines for low back pain, such as the UK’s NICE guideline {{cite:nice}} and the American College of Physicians guideline {{cite:acp}}, both put exercise and staying active near the top of the list. In practice that means regular mobility work, core stability, and strength in your hips and back, built up gradually over weeks.</p>
        <p>If you have no equipment at home, that is fine: <a href="/guides/back-exercises-no-equipment">a floor-only back routine</a> covers all three. And if you sit for most of the day, the hours in the chair are often what makes the next morning feel worse; the <a href="/desk">guide for people who sit all day</a> covers that side of it.</p>

        <h2 id="needs-a-doctor">Morning stiffness that needs a doctor</h2>
        <p>Stiffness that loosens within a short time of getting up is very common. A different pattern is worth raising with a doctor: stiffness that lasts a long time most mornings, gets <em>better</em> with exercise but not with rest, or wakes you in the second half of the night, especially if it started gradually before your mid-forties. That can point to an inflammatory condition, which needs proper assessment rather than a stretching routine {{cite:nhs}}.</p>

        <h2 id="how-remedy-fits">How Remedy fits</h2>
        <p>Remedy’s onboarding asks what makes your back worse, and “mornings or after rest” is one of the options. Choosing it makes mobility exercises aimed at morning stiffness, like cat-cow and the {{exl:open-book-rotation}}, more likely to show up in your sessions. Mobility sits in the warm-up and cooldown of every session, and the program builds strength and stability over several weeks. <a href="/how">See how the program is put together</a>.</p>`,
  },
  {
    slug: 'sore-back-after-gym',
    path: '/guides/sore-back-after-gym',
    card: 'Sore back after the gym',
    blurb: 'Normal soreness vs a tweak, and how to keep training without guessing.',
    title: 'Sore Back After the Gym: Soreness, a Tweak, or Get It Checked?',
    h1: 'Sore back after the gym: soreness or a tweak?',
    description: 'How to tell normal training soreness from a tweaked back after lifting, how to train around it, and when it needs a clinician.',
    sub: 'Most back pain after training is either normal soreness or a minor tweak. Telling them apart decides whether you train through it, train around it, or get it looked at.',
    published: '2026-10-15',
    updated: '2026-10-23',
    takeaways: [
      'Soreness shows up a day or two later, feels dull, and eases as you warm up. A tweak usually starts during the session and feels sharper.',
      'Keep training: swap the movement that provokes it, drop the load, and keep the pattern.',
      'Pain down the leg with numbness or weakness, or pain after impact, needs a clinician.',
    ],
    exercises: ['bird-dog', 'side-plank-knees', 'glute-bridge', 'bodyweight-hip-hinge', 'barbell-hip-thrust'],
    sources: ['nhs', 'nice', 'cochraneRest'],
    related: ['mental-side-of-a-sore-back', 'back-exercises-no-equipment', 'how-long-to-stick-with-a-back-routine'],
    faq: [
      ['Should I work out with a sore lower back?', 'Usually yes, with changes. Keep training what doesn’t provoke it, swap the movement that does, and use lighter loads for the pattern that hurts. Staying active generally beats resting.'],
      ['How long does a tweaked back take to heal?', 'Most minor tweaks from lifting settle on their own over days to a few weeks. If it is getting worse after a couple of weeks, get it checked.'],
      ['When should I stop deadlifting with back pain?', 'Pause heavy deadlifts while the hinge pattern itself is painful. Light, pain-free hinges are often fine well before your working weight is, so build back up from there over weeks.'],
    ],
    body: `
        <h2 id="normal-soreness">What does normal soreness feel like?</h2>
        <p>Muscle soreness after a new or harder session usually shows up the next day or the day after. It feels dull and achy, is often on both sides, and eases as you warm up and move. It is a sign you did something your body was not used to, not a sign of damage.</p>

        <h2 id="a-tweak">What does a tweak feel like?</h2>
        <p>A tweak tends to announce itself during the session: a sudden twinge on a deadlift, a squat, or a sloppy rep at the end of a set. The pain is sharper, often in one spot, and certain movements, like bending to tie a shoe or getting out of a car, catch it. Most tweaks settle on their own over days to a few weeks.</p>

        <h2 id="keep-moving">Keep moving, change the load</h2>
        <p>Bed rest is not the answer for most back pain. The NHS {{cite:nhs}} and the NICE guideline {{cite:nice}} both recommend staying as active as you can, and people advised to stay active do slightly better than those told to rest {{cite:cochraneRest}}. For a lifter, that usually means:</p>
        <ul>
          <li><strong>Swap, don’t stop.</strong> Replace the movement that provokes it, like heavy hinges or loaded flexion, with something that does not, and keep training everything else.</li>
          <li><strong>Drop the load, keep the pattern.</strong> Light, pain-free reps of a {{exl:bodyweight-hip-hinge}} are often fine long before your working weight is.</li>
          <li><strong>Rebuild the basics.</strong> Core stability work like the {{exl:bird-dog}} and {{exl:side-plank-knees}}, plus glute strength from the {{exl:glute-bridge}} and {{exl:barbell-hip-thrust}}, gives your back a better platform when the heavy work comes back.</li>
          <li><strong>Come back gradually.</strong> Add weight back over weeks, not one session. <a href="/guides/how-long-to-stick-with-a-back-routine">Why weeks, not days</a> is its own guide.</li>
        </ul>
        <p>If you are training at home while it settles, <a href="/guides/back-exercises-no-equipment">a no-equipment back routine</a> keeps the habit going without a barbell.</p>
        <aside class="callout callout-mind" aria-label="The mental side of coming back">
          <p class="callout-kicker">The mental side of coming back</p>
          <p>Training through setbacks is as much mental as physical. Trusting a lift again after it hurt you takes patience. <a href="/guides/mental-side-of-a-sore-back">The mental side of a sore back</a> is about that part. If you want help with it, <a href="${RELENTLESS}">Relentless</a> has short mental toughness lessons for athletes.</p>
        </aside>

        <h2 id="get-it-checked">When to get it checked</h2>
        <p>See a clinician if the pain travels down your leg below the knee with numbness, tingling, or weakness; if it followed a fall or heavy impact rather than a lift; or if it is getting worse after a couple of weeks instead of better. And if you wake up locked up every day after training, <a href="/guides/morning-back-stiffness">the morning stiffness guide</a> covers what is normal and what is not. The full list of warning signs is in <a href="/guides/when-to-see-a-doctor-for-back-pain">when to see a doctor</a>.</p>

        <h2 id="how-remedy-fits">How Remedy fits</h2>
        <p>Remedy asks about your activity level in onboarding, including regular gym-goers and lifters, and whether you have full gym access. Programs for active people lean toward strength work as the weeks go on, and the exercise library includes bodyweight, band and dumbbell, and gym options like the hip thrust, {{exl:kettlebell-deadlift}}, and {{exl:leg-press}}. It is a fitness program, not a diagnosis or a return-to-sport clearance. <a href="/back-pain-app">What Remedy is and is not</a>.</p>`,
  },
  {
    slug: 'back-exercises-no-equipment',
    path: '/guides/back-exercises-no-equipment',
    card: 'Back routine with no equipment',
    blurb: 'What a home routine for a sore back needs, using only the floor.',
    title: 'Back Exercises With No Equipment: A Home Routine | Remedy',
    h1: 'Back exercises with no equipment',
    description: 'A home back routine that needs only the floor: mobility, core stability, and hip strength, plus how to progress it and keep it safe.',
    sub: 'You do not need a gym to look after a sore back. You need a floor, a few minutes, and a routine that gets slightly harder over time.',
    published: '2026-10-15',
    updated: '2026-10-23',
    takeaways: [
      'A useful home routine covers mobility, core stability, and hip and back strength.',
      'Progress by moving to harder versions, not by adding endless reps.',
      'Sharp pain or pain spreading down a leg means stop that movement.',
    ],
    exercises: ['cat-cow', 'bird-dog', 'dead-bug', 'glute-bridge', 'single-leg-glute-bridge', 'side-plank-knees', 'bodyweight-squat'],
    sources: ['nice', 'owen'],
    related: ['lower-back-pain-exercises', 'core-exercises-for-back-pain', 'sore-back-after-gym'],
    faq: [
      ['Can you strengthen your back without equipment?', 'Yes. Bodyweight exercises like the bird dog, glute bridge, single-leg bridge, side plank, and hip hinge build real strength when you progress them to harder versions over time.'],
      ['How many times a week should I do a home back routine?', 'Three or more short sessions a week is a common target. Consistency over several weeks matters more than the length of any one session.'],
    ],
    body: `
        <h2 id="what-it-needs">What does a home back routine need?</h2>
        <p>A useful back routine is not a random set of stretches. It covers three things:</p>
        <ul>
          <li><strong>Mobility</strong>: moving your spine and hips through a comfortable range. Examples: {{exl:cat-cow}}, {{exl:open-book-rotation}}, and knees rocking side to side while lying on your back.</li>
          <li><strong>Core stability</strong>: holding your trunk steady while your arms and legs move. Examples: {{exl:bird-dog}}, {{exl:dead-bug}}, and {{exl:side-plank-knees}}.</li>
          <li><strong>Hip and back strength</strong>: the muscles that do the work when you lift, carry, and climb stairs. Examples: {{exl:glute-bridge}}, {{exl:single-leg-glute-bridge}}, {{exl:bodyweight-squat}}, and {{exl:split-squat}}.</li>
        </ul>
        <p>Guidelines like NICE’s recommend exercise programs for low back pain without naming one “best” exercise {{cite:nice}}, and research comparing exercise types finds benefits across several {{cite:owen}}. What matters more is doing a sensible mix regularly.</p>

        <h2 id="progress">Progress by getting harder, not just longer</h2>
        <p>Doing thirty easy glute bridges is less useful than moving on to a harder version. A simple ladder looks like this: glute bridge, then single-leg bridge. For hinges, the {{exl:bodyweight-hip-hinge}} leads to the {{exl:single-leg-romanian-deadlift}}. For stability work, short holds of around eight to ten seconds, repeated, tend to work better than one long shaky hold.</p>
        <p>A routine needs weeks to show results. <a href="/guides/how-long-to-stick-with-a-back-routine">How long to stick with it</a> covers what to expect.</p>

        <h2 id="safety">Keeping it safe</h2>
        <ul>
          <li>Move slowly and with control. Speed is not the goal.</li>
          <li>Mild, general discomfort that settles afterwards is common when you start. Sharp pain, or pain that spreads down a leg, is a reason to stop that movement.</li>
          <li>If an exercise always makes things worse, swap it for another in the same group.</li>
        </ul>
        <p>Mornings are a good time for the mobility part if you <a href="/guides/morning-back-stiffness">wake up stiff</a>. If your back trouble started in the gym, <a href="/guides/sore-back-after-gym">the gym guide</a> covers how to train around it.</p>

        <h2 id="how-remedy-fits">How Remedy fits</h2>
        <p>Remedy asks what equipment you have, and a floor-only program is fully supported. Every exercise has a demonstration video, and the program moves you up to harder variants over the weeks instead of piling on reps. <a href="/how">How the program is built</a>.</p>`,
  },
  {
    slug: 'how-long-to-stick-with-a-back-routine',
    path: '/guides/how-long-to-stick-with-a-back-routine',
    card: 'How long to stick with a routine',
    blurb: 'Why a back routine is measured in weeks, and what progress looks like.',
    title: 'How Long to Stick With a Back Routine Before It Works | Remedy',
    h1: 'How long should you stick with a back routine?',
    description: 'Why a back routine is measured in weeks, not days, what real progress looks like along the way, and when to change course or get help.',
    sub: 'Most people quit a back routine in the first week or two, right before it has had a chance to do anything. Here is a more realistic timeline.',
    published: '2026-10-15',
    updated: '2026-10-23',
    takeaways: [
      'Judge a back routine after four to six weeks of doing it regularly, not after a few sessions.',
      'Early progress is showing up consistently and the exercises getting easier.',
      'If your back is clearly getting worse over a couple of weeks, stop and get it checked.',
    ],
    exercises: ['glute-bridge', 'single-leg-glute-bridge'],
    sources: ['nice', 'acp', 'cochraneExercise'],
    related: ['back-exercises-no-equipment', 'sore-back-after-gym', 'desk'],
    faq: [
      ['How long does it take for back exercises to work?', 'Many structured programs run for several weeks. A useful rule is to judge a routine after four to six weeks of regular sessions.'],
      ['Is it normal to feel no different after a week of back exercises?', 'Yes. In the first week or two you are mostly learning the movements. Some people feel better quickly from moving more; many don’t notice much yet.'],
    ],
    body: `
        <h2 id="first-week">Why the first week feels pointless</h2>
        <p>Strength and endurance build slowly. In the first week or two you are mostly learning the movements and getting used to doing them. Some people feel a bit better quickly just from moving more; many do not notice much yet. Both are normal.</p>

        <h2 id="think-in-weeks">Think in weeks</h2>
        <p>Structured back programs usually run over several weeks, with each week a little harder than the last. Clinical guidelines such as the NICE guideline {{cite:nice}} and the American College of Physicians guideline {{cite:acp}} recommend exercise for low back pain as an ongoing habit, not a one-off session, and the trials behind them typically run for weeks {{cite:cochraneExercise}}.</p>
        <p>A useful way to think about it: judge a routine after four to six weeks of doing it regularly, not after four to six sessions.</p>

        <h2 id="what-progress-looks-like">What progress actually looks like</h2>
        <ul>
          <li><strong>You are showing up.</strong> Consistency is the first win, and the best predictor of the rest.</li>
          <li><strong>The exercises get easier,</strong> so you move to harder versions. If you are <a href="/guides/back-exercises-no-equipment">training with no equipment</a>, that might mean going from the {{exl:glute-bridge}} to the {{exl:single-leg-glute-bridge}}.</li>
          <li><strong>Everyday things bother you less</strong>: getting out of a chair, putting on shoes, a long drive.</li>
          <li><strong>Bad days still happen.</strong> Progress is not a straight line. Look at the trend over weeks, not one morning.</li>
        </ul>
        <p>For lifters coming back from a tweak, the same timeline applies to loading; <a href="/guides/sore-back-after-gym">the gym guide</a> covers bringing weight back gradually. For desk workers, the hours of sitting count too; see <a href="/desk">the sitting guide</a>.</p>

        <h2 id="change-course">When to change course</h2>
        <p>If your back is clearly getting worse over a couple of weeks of sensible exercise, or new symptoms show up, stop and get it checked. A routine is supposed to be challenging, not to make things steadily worse. <a href="/guides/when-to-see-a-doctor-for-back-pain">When to see a doctor</a> lists the warning signs.</p>

        <h2 id="how-remedy-fits">How Remedy fits</h2>
        <p>Remedy sets your program length, 10 to 16 weeks, from how long your back has been bothering you and how it behaves, with the difficulty rising as you go. Quick before-and-after check-ins on each session turn the “am I actually improving?” question into a trend you can see. When a program ends, you can build the next one from a short check-in, or level up your current plan. <a href="/how">How it works</a>.</p>`,
  },
  {
    slug: 'mental-side-of-a-sore-back',
    path: '/guides/mental-side-of-a-sore-back',
    theme: 'relentless',
    card: 'Training with a sore back',
    blurb: 'For athletes whose back is sore and whose head is the part that wants to skip the session.',
    title: 'Training With a Sore Back: The Mental Side | Remedy',
    h1: 'When a sore back gets in your head',
    description: 'For athletes whose back pain is messing with training: how to keep the session, and where a short mental practice fits.',
    sub: 'The back is sore. Training is the thing you actually care about. The hard part is walking into the session anyway.',
    published: '2026-10-23',
    updated: '2026-10-23',
    takeaways: [
      'For someone who trains, a sore back is often a head problem as much as a back problem: trusting the next session.',
      'Staying active still matters. The routine has to be short enough that a bad day does not cancel the week.',
      'Mental practice is a separate skill from the exercises, and it is one athletes can train on purpose.',
    ],
    exercises: ['bird-dog', 'glute-bridge', 'bodyweight-hip-hinge'],
    sources: ['nice', 'cochraneExercise', 'lancetWhat'],
    related: ['sore-back-after-gym', 'how-long-to-stick-with-a-back-routine', 'when-to-see-a-doctor-for-back-pain'],
    faq: [
      ['Should I stop training if my back is sore?', 'Usually no, if it is ordinary soreness and you can change the load. Keep the sessions that do not provoke it. Pain with numbness, weakness, or after an injury needs a clinician, not another workout.'],
      ['Where do athletes practice the mental side?', 'In a separate app, not in Remedy. The people who write the lessons are <a href="https://relentlesstough.com/coaches/">listed with their programs</a>. It is not a back pain program and not medical care.'],
    ],
    body: `
        <h2 id="the-session-you-skip">The session you keep almost skipping</h2>
        <p>If you train, a sore back rarely stays in the back. It shows up as the warm-up you cut short, the set you talk yourself out of, and the week where “I’ll start again Monday” becomes the plan. The exercises are not the mystery. Showing up while you are still thinking about the last tweak is.</p>
        <p>That is a normal athlete problem, and it is not fixed by another stretch video. Guidelines still say to stay active for low back pain {{cite:nice}}, and the research on exercise is broadly supportive {{cite:cochraneExercise}}. None of that helps on the morning you do not trust the first rep. <a href="/guides/sore-back-after-gym">Sore back after the gym</a> covers how to tell ordinary soreness from a tweak. This page is about the part that happens after you already know you should move.</p>

        <h2 id="keep-the-body-in-it">Keep the body in it</h2>
        <p>Most back pain has no single structural cause an exercise is supposed to fix {{cite:lancetWhat}}. For someone who lifts, runs, or plays, the useful version of that is practical: change the load, keep the pattern that does not hurt, and do not turn one sharp day into a month off. A short session you will actually finish beats the perfect one you skip. <a href="/guides/how-long-to-stick-with-a-back-routine">How long to stick with a back routine</a> is the timeline. Think weeks, and expect a few ugly days inside them.</p>
        <ul>
          <li><strong>One session, already chosen.</strong> Deciding what to do is where a tired athlete stalls.</li>
          <li><strong>Short enough for a bad day.</strong> If it only works when you feel good, it will not survive a season.</li>
          <li><strong>A hinge you trust.</strong> Light, pain-free reps of a {{exl:bodyweight-hip-hinge}} are often the way back in, long before the working weight is.</li>
        </ul>

        <h2 id="the-head-side">The part that is actually mental</h2>
        <p>Trusting a lift again, walking into practice while the back still feels off, and not spiraling the first time it twinges: that is a skill, and it is a different skill from the bird dog. Athletes already know how to train a body on a schedule. The mind gets less of a plan, which is why a sore back turns into a story about being fragile.</p>
        <aside class="callout callout-rel" aria-label="Mental training for athletes">
          <p class="callout-kicker">If the head is the part quitting</p>
          <p>The lessons for that side live in a different app, built with <a href="https://relentlesstough.com/coaches/">mental performance coaches</a> who already work with athletes. It is not a back program. It is practice for the part of training your back cannot do for you.</p>
        </aside>
        <p>The moment that usually breaks is not the easy rep in the gym. It is the one that counts, when the back still feels off and everything tightens. <a href="https://relentlesstough.com/learn/pre-race-nerves/">What to do when your heart is already racing</a> is the same problem, just before a start line instead of a hinge.</p>
        <p>Some athletes are fine in training and fall apart once it matters. A sore back does that too: the movement you own in a quiet room feels different the day you have to trust it. <a href="https://relentlesstough.com/learn/better-in-practice-than-games/">Why skills shrink under pressure</a> is worth reading if that is the gap you keep hitting.</p>
        <p>The lessons themselves follow a sport-psychology approach called mindfulness-acceptance-commitment: notice the nerves, let them be there, and do the next action anyway. <a href="https://relentlesstough.com/learn/mac-approach/">How that approach works, and what the studies show</a>, is the longer version. A few minutes is the right size. A lecture will not survive a bad week any better than a 40-minute back routine will.</p>

        <h2 id="what-this-is-not">What this is not</h2>
        <p>A mindset does not replace a clinician. Pain with numbness, weakness, or after a fall needs a person. <a href="/guides/when-to-see-a-doctor-for-back-pain">When to see a doctor</a> lists the warning signs. Remedy’s sessions are fitness guidance for the back. The other app is mental performance training, which <a href="https://relentlesstough.com/learn/mental-toughness/">researchers define more narrowly than the slogan</a>. Neither one is treatment, and neither one is therapy. <a href="https://relentlesstough.com/about/">Who built it, and why</a>, is a separate story from this one.</p>`,
  },
  {
    slug: 'desk',
    path: '/desk',
    card: 'Back pain from sitting',
    blurb: 'For people whose back gets tight from a chair and a screen.',
    title: 'Back Pain From Sitting All Day: What Helps Desk Workers | Remedy',
    h1: 'Back pain from sitting all day',
    description: 'Why long days at a desk leave your back tight, what actually helps (not the perfect chair), and a short routine for between meetings.',
    sub: 'If your back gets tight from a chair and a screen, the fix is less about perfect posture and more about moving often and building a back that handles long days.',
    published: '2026-09-08',
    updated: '2026-10-23',
    crumbParent: false,
    takeaways: [
      'There is no single perfect sitting posture. Staying in any one position for hours is the bigger issue.',
      'Change position every 30 to 60 minutes, and add a short routine a few times a week.',
      'Hip flexor, upper back, and glute work target the areas long sitting affects most.',
    ],
    exercises: ['hip-flexor-stretch', 'thoracic-extension', 'open-book-rotation', 'glute-bridge', 'banded-row', 'mckenzie-press-up'],
    sources: ['nice', 'nhs', 'lancetWhat'],
    related: ['morning-back-stiffness', 'upper-back-pain-exercises', 'stretches-for-lower-back-pain'],
    faq: [
      ['Why does my back hurt after sitting all day?', 'Usually because it has stayed in one position for hours, not because sitting is damaging it. Moving more often and building strength in the hips and back tend to help.'],
      ['What is the best sitting posture for back pain?', 'There isn’t one perfect posture. The best posture is the next one: change position regularly, stand up, and move.'],
      ['Do standing desks help back pain?', 'They can help by making it easier to change position, but standing all day is not the goal either. Alternating between sitting, standing, and moving is what matters.'],
    ],
    body: `
        <h2 id="why-sitting">Why does sitting all day make my back hurt?</h2>
        <p>Desk stiffness is one of the most common reasons people look for help with their back. For most people, the problem is not that sitting damages the spine. Most back pain has no specific structural cause {{cite:lancetWhat}}. It is that the back stays in one position for hours. Hip flexors stay shortened, the upper back rounds toward the screen, and the glutes barely work.</p>

        <h2 id="posture">Is there a perfect posture?</h2>
        <p>No. Sitting up straight is fine, and so is leaning back, as long as you don’t stay frozen in any of them. A good chair and screen height make long days more comfortable, but they don’t replace moving. The best posture is the next one.</p>

        <h2 id="what-helps">What actually helps</h2>
        <ul>
          <li><strong>Move often.</strong> Get up every 30 to 60 minutes: refill water, take a call standing, walk to a colleague.</li>
          <li><strong>Stay active overall.</strong> Guidelines recommend staying active and exercising for low back pain {{cite:nice}} {{cite:nhs}}.</li>
          <li><strong>Build the muscles sitting switches off.</strong> Glutes, upper back, and the muscles that keep your trunk steady.</li>
        </ul>

        <h2 id="desk-routine">A short routine for between meetings</h2>
        <ol class="routine">
          <li><strong>{{ex:thoracic-extension}}</strong>: 8 reps over the back of your chair.</li>
          <li><strong>{{ex:hip-flexor-stretch}}</strong>: about 30 seconds per side.</li>
          <li><strong>{{ex:glute-bridge}}</strong>: 12 reps on the floor if you have space.</li>
          <li><strong>{{ex:open-book-rotation}}</strong>: 8 per side.</li>
        </ol>
        <p>If you have a resistance band at your desk, a set of {{exl:banded-row}} reps is a good addition for the upper back. <a href="/guides/upper-back-pain-exercises">Upper back pain exercises</a> covers that side in more detail.</p>

        <h2 id="sitting-and-mornings">Sitting and the next morning</h2>
        <p>Long days in a chair often show up the next morning too. <a href="/guides/morning-back-stiffness">Why your lower back is stiff in the morning</a> covers that side. If you want to start on your own, <a href="/guides/back-exercises-no-equipment">a no-equipment back routine</a> fits next to a desk, and <a href="/guides/how-long-to-stick-with-a-back-routine">how long to stick with it</a> sets realistic expectations.</p>

        <h2 id="how-remedy-fits">How Remedy fits</h2>
        <p>Remedy’s onboarding asks about your activity level, including “mostly sitting day-to-day,” and whether sitting too long makes your back worse. Choosing those shifts your program toward exercises aimed at sitting, like the hip flexor stretch, chair thoracic extension, rows, and the {{exl:mckenzie-press-up}}. Sessions are short on purpose so they fit around work. This page is general fitness information, not a diagnosis. If sitting pain is sudden, severe, or comes with warning signs, see a clinician first.</p>`,
  },
];

export const byKey = Object.fromEntries(GUIDES.map((g) => [g.slug, g]));
