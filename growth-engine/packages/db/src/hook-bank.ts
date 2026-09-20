/**
 * Remedy hook system — source of truth.
 *
 * A first slide has two jobs, in order:
 * 1. Distribution — name the avatar or the back-pain problem so TikTok/IG
 *    can classify the post. Small accounts die without this.
 * 2. Retention — after that noun is on screen, make swiping away feel like a miss.
 *
 * Old-gen (undefined "this", save/bookmark, wait-for-slide, 3-word interrupts)
 * is last-resort test material, not the default. Length is not a quality score.
 * 1–2 on-screen lines. Three lines is too long.
 *
 * Steal the JOB of a shape (avatar filter, most-of-group + pillar problem,
 * numbered ways, bare callout, belief autopsy) — not a fixed phrase.
 */

export const HOOK_MECHANISMS = [
  {
    id: "punchy",
    label: "Pattern interrupt",
    why: "1–2 lines on mute. Blunt beats polished. Specific beats short.",
  },
  {
    id: "callout",
    label: "Self-diagnosis",
    why: "'If you…' names the exact viewer. Research: 2x stronger on TikTok than Instagram.",
  },
  {
    id: "mistake",
    label: "Mistake / stop",
    why: "Loss aversion. 'You're doing X wrong' / 'Stop X' forces a self-audit they have to resolve.",
  },
  {
    id: "open_loop",
    label: "Undefined this",
    why: "A gap the swipe closes — but the missing thing must still be named (a belief, a plan, a stretch trap). Bare 'this' / 'wait until slide N' is old-gen. Almost never.",
  },
  {
    id: "listicle",
    label: "Numbered list",
    why: "Carousel king. Bounded journey + a hidden twist (#2 is the one) so swipe has a job.",
  },
  {
    id: "contrarian",
    label: "Trusted = dangerous",
    why: "Frames common advice as the problem. Comments + swipes. Only use claims we can pay off.",
  },
  {
    id: "story",
    label: "Mid-story",
    why: "Start in the middle. Brain needs the ending. Vulnerability + receipts, not a TED talk.",
  },
  {
    id: "result",
    label: "Result first",
    why: "Payoff before method. '3 weeks. Different mornings.' Specific beats vague every time.",
  },
  {
    id: "constraint",
    label: "Constraint filter",
    why: "Names a limit (15 min, no gym, 3 days). The constraint does the targeting.",
  },
  {
    id: "identity",
    label: "POV / identity",
    why: "Drops them into a scene or tribe. 'POV:' and 'Tell me you…' are native pattern interrupts.",
  },
  {
    id: "how_to",
    label: "Do this instead",
    why: "Clear value exchange. Swap / routine / first step. Pre-handle the objection in the line.",
  },
  {
    id: "wish_i_knew",
    label: "Wish I knew",
    why: "Hindsight as a gift. 'Things I wish I knew at 28' is save-bait and swipe-bait.",
  },
  {
    id: "save_bait",
    label: "Save this if",
    why: "Saves help IG rank — only when the line already names the avatar or the back-pain problem. Bare 'bookmark this' is old-gen.",
  },
  {
    id: "permission",
    label: "You don't need",
    why: "Relief. Removes the expensive / hard path and implies a simpler one is coming.",
  },
  {
    id: "relatable",
    label: "Shared wince",
    why: "One specific moment (socks, low couch, 3pm). Recognition stops the thumb.",
  },
  {
    id: "challenge",
    label: "Follow along",
    why: "Journey hook. Day 1 / N days. Native to TikTok series behavior.",
  },
  {
    id: "stat_based",
    label: "Hard number",
    why: "Odd or concrete numbers feel measured. Pair with a gap, don't dump a stat and stop.",
  },
  {
    id: "myth_bust",
    label: "Myth / fact",
    why: "Two-beat contrast. Fast to read. Only when the 'fact' is something Remedy can show.",
  },
  // Legacy ids still on older generated rows — keep labels so the UI doesn't go blank.
  {
    id: "problem_solution",
    label: "Problem named",
    why: "Names the pain. Weak alone — better when it implies the usual fix is wrong.",
  },
  {
    id: "curiosity",
    label: "Curiosity gap",
    why: "Legacy alias of open_loop / insider.",
  },
  {
    id: "transformation",
    label: "Before / after",
    why: "Legacy alias of result.",
  },
  {
    id: "social_proof",
    label: "Borrowed authority",
    why: "PT / desk-worker bandwagon. Use sparingly — easy to sound like an ad.",
  },
] as const;

export type HookMechanism = (typeof HOOK_MECHANISMS)[number]["id"];

export interface HookFormulaDef {
  name: string;
  category: HookMechanism;
  template: string;
  notes: string;
}

export interface SeedHookDef {
  text: string;
  category: HookMechanism;
}

export function hookWordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function hookOpeningWord(text: string): string {
  const first = text.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().replace(/[^a-z0-9']/g, "");
}

/** Huge on-screen type: ~8 words per line. 1–2 is the target; 3 is a miss. */
export function hookSlideLines(text: string): number {
  const clauses = text.split(/[\n.!?]+/).map((s) => s.trim()).filter(Boolean);
  const words = hookWordCount(text);
  if (clauses.length >= 3 || words >= 15) return Math.max(clauses.length, 3);
  if (words <= 8 && clauses.length <= 1) return 1;
  return 2;
}

const BODY_SIGNAL =
  /\b(back|lumbar|desk|chair|foam\s*roll(?:ing)?|pts?\b|physical therapy|mattress|ibuprofen|deadlift|sit(?:ting)?|workers?|program|pain|posture|stiff(?:ness)?|stretch(?:es|ing)?)\b/i;

const OLD_GEN_MECHANIC =
  /\b(hear me out|don't skip this|dont skip this|wait (for|until) slide|then this|bookmark this|save this|screenshot this|read this twice|i changed one thing|one thing changed|this is the one|21 days of this|come back on day|you'll want slide|why is no one talking about this)\b/i;

/** Avatar, body, or pillar object the algorithm can classify. YouTube/TikTok alone is not enough. */
export function hasDistributionSignal(text: string): boolean {
  return BODY_SIGNAL.test(text);
}

/** Vague / any-niche lines. Keep in the bank but almost never pick or generate. */
export function isLowSignalHook(text: string): boolean {
  const t = text.trim();
  if (OLD_GEN_MECHANIC.test(t)) return true;
  if (!hasDistributionSignal(t)) return true;
  return false;
}

/** Clinician-bashing and permanent-fix language — never ship these. */
export function isUnsafeHook(text: string): boolean {
  const t = text.toLowerCase();
  if (/\b(chiro|chiropractor|physio|physiotherapist)\b/.test(t)) return true;
  if (/\b(guarantee|guaranteed|permanently|forever|cured)\b/.test(t)) return true;
  if (/\bpts?\b.{0,24}\b(don't|dont|didn't|didnt|hate|wrong|gatekeep|hiding)\b/.test(t)) return true;
  if (/\b(don't|dont)\s+need\s+a\s+(pt|physical therapist)\b/.test(t)) return true;
  if (/\bremedy\b.{0,16}\bfree\b/.test(t) || /\bfree\s+(app|download|trial)\b/.test(t)) return true;
  return false;
}

/** Mistake-correction / trusted-advice-is-the-trap. "You're foam rolling wrong" is the proven winner. */
export const CONTROVERSIAL_CATEGORIES = new Set<string>(["mistake", "contrarian", "myth_bust"]);

/**
 * Five content pillars. Every slideshow sits in one of these.
 * Prefer controversial hooks (pillar 2–3 shape) — that's what won.
 */
export const CONTENT_PILLARS = [
  {
    id: "pt_cost",
    title: "PT is expensive as fuck",
    thesis:
      "Remedy exists so you're not paying hundreds a visit just to get a structured plan. Personalized program from your answers — not a generic stretch list.",
    payoff: "Onboarding answers → matched program. Cost of PT vs a plan you own.",
    hooks: [
      "PT is expensive as fuck.",
      "$1,200. That's the average PT course.",
      "PT is $150 a session.",
    ],
  },
  {
    id: "playlist_vs_program",
    title: "Playlist vs program",
    thesis:
      "Backs change from the same movements, in order, for weeks. TikTok/YouTube look cool and promise a fix. They're not yours and they're not a program.",
    payoff: "That's why you're still hurting. Then the app / the plan. Not another 3-exercise reel.",
    hooks: [
      "You will never get your back right from YouTube.",
      "You will never get your back right from TikTok.",
      "You don't have a back problem. You have a plan problem.",
      "That's why you're still hurting.",
    ],
  },
  {
    id: "stuck_advice",
    title: "The advice that's keeping you stuck",
    thesis: "The usual fixes are the trap. Stretch-only. Rest and wait. Buy a mattress.",
    payoff:
      "Tight isn't the whole problem. Weak is. Sharp and new → doctor. Same desk/gym ache for months → stop waiting it out.",
    hooks: [
      "You are killing your back by stretching it.",
      "The worst thing you can do is rest it and wait.",
      "Your mattress isn't the issue.",
      "You're foam rolling wrong.",
    ],
  },
  {
    id: "huge_untreated",
    title: "This is huge and nobody treats it like a plan",
    thesis: "Punchy number, then the gap: most people still don't have a program. One stat per video. Don't stack 80% + 619M + #1 in the same batch.",
    payoff: "The number, then: still no program. That's the gap Remedy fills.",
    hooks: [
      "80% of adults get back pain.",
      "2 in 5 adults. Last 3 months.",
      "#1 cause of disability on earth.",
      "619 million people.",
      "Nobody tells you this starts at 20.",
    ],
  },
  {
    id: "persona",
    title: "Persona / situation",
    thesis: "Same product, different that's-me. Match the face to the line.",
    payoff:
      "Desk = stretch-reminder is useless, show a real session. Gym-bro = get back to training, not become a yoga person. Time = 15 minutes, not an hour for PT. Age = this starts at 20. Don't have a 20-year-old say after the kids are down.",
    hooks: [
      "I sit 9 hours. Desk stretches do nothing.",
      "My back isn't injured. Deadlifts light it up.",
      "You don't have an hour for PT.",
      "Nobody tells you this starts at 20.",
    ],
  },
] as const;

export type ContentPillarId = (typeof CONTENT_PILLARS)[number]["id"];

const HUGE_PROBLEM_STAT = /80%|619\s*million|#1 cause|leading cause of disability|2 in 5|4 out of 5|4 in 5|843 million|1 in 13|up to 84%/;

/** WHO / CDC / lifetime facts — one per carousel, never stacked. */
export function isHugeProblemStat(text: string): boolean {
  return HUGE_PROBLEM_STAT.test(text.toLowerCase());
}

export function matchContentPillar(text: string): (typeof CONTENT_PILLARS)[number] | undefined {
  const t = text.trim().toLowerCase();
  for (const p of CONTENT_PILLARS) {
    if (p.hooks.some((h) => h.toLowerCase() === t)) return p;
  }
  if (/\b(pt is|physical therapy|\$1,?200|\$150|expensive as fuck)\b/.test(t)) return CONTENT_PILLARS[0];
  if (/\b(youtube|tiktok|playlist|plan problem|still hurting)\b/.test(t)) return CONTENT_PILLARS[1];
  if (/\b(stretch|foam roll|rest it|mattress|wait it out)\b/.test(t)) return CONTENT_PILLARS[2];
  if (HUGE_PROBLEM_STAT.test(t) || /\bstarts at 20\b/.test(t)) return CONTENT_PILLARS[3];
  if (/\b(sit 9|deadlift|hour for pt|15 minutes|desk stretch)\b/.test(t)) return CONTENT_PILLARS[4];
  return undefined;
}

export function contentPillarsPromptBlock(): string {
  const body = CONTENT_PILLARS.map((p, i) => {
    return `${i + 1}. ${p.title}
   ${p.thesis}
   Payoff: ${p.payoff}
   Example hooks: ${p.hooks.join(" / ")}`;
  }).join("\n\n");
  return `CONTENT PILLARS — every hook and carousel sits in exactly one of these. Lean controversial (mistake / contrarian). "You're foam rolling wrong" is the proven winner shape.

${body}

Pillar rules:
- One "this is huge" stat per video. Do not stack 80% + 619 million + #1 disability in the same carousel.
- PT cost is fair game. Never bash therapists as people. Never say you don't need a PT or that they hid something. Never claim Remedy has a PT or that a PT designed / filmed / approved the product. Authority copy may say backed by physiological studies.
- Stretch-only payoff: tight isn't the whole problem. Weak is.
- Sharp + new pain → see a doctor. Same desk/gym ache for months → stop waiting it out.
- "PT is expensive as fuck" is organic-only. Meta/paid uses $150 a session or $1,200 course.
- Persona must match the face. Don't have a 20-year-old say "after the kids are down."
- Device/UGC only (not a slideshow slide): flash a bunch of "3 exercises to fix your back" videos → "that's why you're still hurting."`;
}

const FILLERS: Record<string, readonly string[]> = {
  pain: ["back pain", "lower back pain", "morning stiffness", "desk back"],
  failed_fixes: ["stretching and foam rolling", "YouTube and a new mattress", "ibuprofen and rest"],
  desired_outcome: ["stand up without wincing", "sit through a workday", "stop dreading mornings"],
  relatable_struggle: ["sits 8 hours a day", "gave up on random stretches", "wakes up stiff every day", "can't tie their shoes"],
  authority_figure: ["coworker", "friend"],
  surprising_truth: [
    "most back pain needs strength, not more stretching",
    "rest makes a weak back weaker",
    "your chair isn't the whole story",
  ],
  n: ["3", "5", "7", "14", "21"],
  habit: ["a 15-minute back session", "a real program", "strength work"],
  common_mistake: ["only stretching", "resting all day", "doing random YouTube", "foam rolling and hoping"],
  trigger: ["sitting all day", "sleeping", "a long drive", "3pm"],
  activity: ["tying your shoes", "getting out of bed", "a low couch", "sitting through a movie"],
  before: ["stiff mornings", "ibuprofen at 10am", "random YouTube"],
  after: ["a 5-week plan", "mornings that don't suck", "showing up 3 days a week"],
  audience_segment: ["desk workers", "remote workers", "people over 30"],
  stat_percent: ["80", "70"],
  hours: ["8", "10"],
  myth: ["Rest fixes it", "You just need to stretch", "Buy a better chair"],
  fact: ["Weak muscles keep it coming back", "You need a plan", "Strength work does more"],
  expensive_solution: ["a standing desk", "a new mattress", "another gadget"],
  object: ["chair", "mattress", "foam roller"],
  wrong_advice: ["just rest it", "just stretch it", "wait it out"],
  age: ["25", "28", "30"],
  slide_n: ["4", "5", "6"],
  minutes: ["12", "15", "18"],
  week_n: ["3", "5"],
  avatar: [
    "people with back pain",
    "desk workers",
    "people who sit all day",
    "busy people with a sore back",
    "anyone who's tried YouTube for their back",
  ],
  avatar_call: [
    "People with back pain",
    "Desk workers",
    "Anyone who sits 8 hours",
    "Busy people with back pain",
    "Gym people with a loud back",
  ],
  avatar_situation: [
    "have back pain",
    "sit 8 hours with a sore back",
    "foam roll and still hurt",
    "can't get through a desk day",
    "dread standing up from the chair",
  ],
  pillar_deal: [
    "never get a real plan",
    "collect YouTube playlists",
    "stretch a weak back and wonder why",
    "wait it out for months",
    "never feel like anyone took it seriously",
  ],
  common_belief: [
    "you just need to stretch",
    "rest will fix it",
    "the mattress is the issue",
    "a standing desk will save you",
    "more videos means a plan",
  ],
  ways_verb: [
    "improve back pain",
    "get through a desk day",
    "stop dreading mornings",
    "stop the 3pm flare",
  ],
};

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Fill a formula template. Static punchy lines pass through unchanged. */
export function fillHookTemplate(template: string): string {
  return template.replace(/\{([a-z_]+)\}/g, (full, key: string) => {
    const options = FILLERS[key];
    return options ? pick(options) : full;
  });
}

export function pickDiverseHooks<T extends { text: string; category: string }>(pool: T[], n: number): T[] {
  if (n <= 0 || pool.length === 0) return [];
  const remaining = [...pool];
  const picked: T[] = [];
  const score = (h: T): number => {
    const words = hookWordCount(h.text);
    const lines = hookSlideLines(h.text);
    let s = 0;
    if (isLowSignalHook(h.text)) s -= 16;
    if (hasDistributionSignal(h.text)) s += 6;
    // Length is almost flat: 1–2 lines are equal. Only punish 3+ lines or scraps.
    if (lines >= 3 || words > 16) s -= 8;
    else if (words < 4 && isLowSignalHook(h.text)) s -= 2;
    if (!picked.some((p) => hookOpeningWord(p.text) === hookOpeningWord(h.text))) s += 5;
    if (!picked.some((p) => p.category === h.category)) s += 3;
    else s -= 2;
    if (CONTROVERSIAL_CATEGORIES.has(h.category) && !isLowSignalHook(h.text)) s += 3;
    return s;
  };
  while (picked.length < n && remaining.length > 0) {
    remaining.sort((a, b) => score(b) - score(a));
    const next = remaining.shift();
    if (!next) break;
    picked.push(next);
  }
  return picked;
}

export const HOOK_FORMULAS: HookFormulaDef[] = [
  // --- punchy (static + tiny templates) ---
  { name: "Hear me out", category: "punchy", template: "Hear me out.", notes: "Conversational interrupt. Zero context on purpose." },
  { name: "This is the one", category: "punchy", template: "This is the one.", notes: "Undefined this + confidence." },
  { name: "Then this", category: "punchy", template: "Then this.", notes: "Ellipsis ending. Swipe closes it." },
  { name: "Don't skip this", category: "punchy", template: "Don't skip this.", notes: "FOMO command, 3 words." },
  { name: "I was wrong", category: "punchy", template: "I was wrong.", notes: "Confession as interrupt." },
  { name: "Read this twice", category: "punchy", template: "Read this twice.", notes: "Implies a reframe is coming." },
  { name: "Save this", category: "punchy", template: "Save this.", notes: "Bare save-prime." },
  { name: "Wait for slide N", category: "punchy", template: "Wait for slide {slide_n}.", notes: "Named destination inside the carousel." },
  { name: "Why is no one talking", category: "punchy", template: "Why is no one talking about this?", notes: "Insider + open loop." },
  { name: "Stop stretching it", category: "punchy", template: "Stop stretching it.", notes: "Contrarian command, 3 words." },
  { name: "Rest made it worse", category: "punchy", template: "Rest made it worse.", notes: "Trusted advice inverted." },
  { name: "Your chair is lying", category: "punchy", template: "Your chair is lying.", notes: "Blame + personality." },
  { name: "Tight isn't the problem", category: "punchy", template: "Tight isn't the problem.", notes: "Reframe in 4 words." },
  { name: "Strength over stretch", category: "punchy", template: "Strength over stretch.", notes: "Core Remedy claim, ultra short." },
  { name: "15 minutes that's it", category: "punchy", template: "{minutes} minutes. That's it.", notes: "Constraint + relief." },
  { name: "No foam roller", category: "punchy", template: "No foam roller needed.", notes: "Removes the gadget objection." },
  { name: "You don't need a gadget", category: "punchy", template: "You don't need another gadget.", notes: "Permission, short. Gadgets, not clinicians." },
  { name: "This isn't a playlist", category: "punchy", template: "This isn't a playlist.", notes: "Anti-YouTube in 4 words." },
  { name: "A program not vibes", category: "punchy", template: "A program, not vibes.", notes: "Brand wedge, punchy." },
  { name: "Movement not rest", category: "punchy", template: "Movement, not rest.", notes: "Myth-bust compressed." },
  { name: "Five weeks not five videos", category: "punchy", template: "Five weeks. Not five videos.", notes: "Timeboxed contrast." },
  { name: "YouTube is not PT", category: "punchy", template: "YouTube is not PT.", notes: "Authority contrast." },
  { name: "Ibuprofen isn't a plan", category: "punchy", template: "Ibuprofen isn't a plan.", notes: "Object as failed fix." },
  { name: "The chair is winning", category: "punchy", template: "The chair is winning.", notes: "Personified enemy." },
  { name: "Stiff can ease", category: "punchy", template: "Stiff can ease.", notes: "Hope. No forever / guarantee." },
  { name: "Show up that's the program", category: "punchy", template: "Show up. That's the program.", notes: "Identity + product." },
  { name: "Under 20 minutes", category: "punchy", template: "Under 20 minutes.", notes: "Constraint only. Visual does the rest." },
  { name: "Your mornings can change", category: "punchy", template: "Your mornings can change.", notes: "Soft result, no fake cure." },
  { name: "One thing changed", category: "punchy", template: "One thing changed.", notes: "Classic 'one thing' gap." },
  { name: "Desk job tax", category: "punchy", template: "Desk job tax.", notes: "Two-word identity label." },

  // --- callout ---
  { name: "If you sit hours", category: "callout", template: "If you sit {hours} hours.", notes: "Self-diagnosis. Incomplete on purpose." },
  { name: "If mornings feel 80", category: "callout", template: "If mornings feel 80.", notes: "Pain-scale callout without saying pain scale." },
  { name: "If you've tried YouTube", category: "callout", template: "If you've tried YouTube.", notes: "Failed-fix audience filter." },
  { name: "If sitting is the trigger", category: "callout", template: "If sitting is the trigger.", notes: "Cause as identity." },
  { name: "If you can't tie shoes", category: "callout", template: "If you can't tie your shoes.", notes: "Specific activity = instant recognition." },
  { name: "Desk workers read this", category: "callout", template: "Desk workers. Read this.", notes: "Tribe + command." },
  { name: "Remote workers this is you", category: "callout", template: "Remote workers. This is you.", notes: "Tribe + mirror." },
  { name: "If just stretch failed", category: "callout", template: "If \"just stretch\" didn't work.", notes: "Quotes the bad advice." },
  { name: "If you sit through work", category: "callout", template: "If you sit through pain at work.", notes: "High-stakes daily scene." },
  { name: "If you pop ibuprofen", category: "callout", template: "If you pop ibuprofen at 10am.", notes: "Specific time makes it real." },

  // --- mistake ---
  { name: "Stop only stretching", category: "mistake", template: "Stop only stretching.", notes: "Presupposes they're doing it." },
  { name: "Stop resting it", category: "mistake", template: "Stop resting it.", notes: "Attacks the most trusted advice." },
  { name: "Stop random YouTube", category: "mistake", template: "Stop random YouTube.", notes: "Failed-fix command." },
  { name: "You're stretching wrong", category: "mistake", template: "You're stretching wrong.", notes: "Direct callout. 3 words." },
  { name: "Stop treating tightness", category: "mistake", template: "Stop treating it like tightness.", notes: "Reframe the diagnosis they gave themselves." },
  { name: "You're skipping strength", category: "mistake", template: "You're skipping the strength part.", notes: "Names the missing piece." },
  { name: "Stop waiting it out", category: "mistake", template: "Stop waiting it out.", notes: "Anti-passivity." },
  { name: "The stretch making it worse", category: "mistake", template: "The stretch making it worse.", notes: "Trusted move = danger." },
  { name: "Stop {common_mistake}", category: "mistake", template: "Stop {common_mistake}.", notes: "Command + specific mistake." },
  { name: "Wrong advice is hurting you", category: "mistake", template: "The advice that's hurting you.", notes: "Trusted = dangerous, no object yet." },

  // --- open_loop ---
  { name: "Nobody talks about this", category: "open_loop", template: "Nobody talks about this.", notes: "Insider gap, 4 words." },
  { name: "The one thing your back needs", category: "open_loop", template: "The one thing your back needs.", notes: "'The one' pattern completion." },
  { name: "This isn't what you think", category: "open_loop", template: "This isn't what you think.", notes: "Contradiction + undefined this." },
  { name: "Stretches aren't the plan", category: "open_loop", template: "Your stretches aren't the plan. This is.", notes: "Classic undefined-this contrast. No 'fix' claim." },
  { name: "I changed one thing", category: "open_loop", template: "I changed one thing.", notes: "Cause withheld." },
  { name: "Wait until slide N", category: "open_loop", template: "Wait until slide {slide_n}.", notes: "Named carousel destination." },
  { name: "The part nobody shows you", category: "open_loop", template: "The part nobody shows you.", notes: "Insider + visual tease." },
  { name: "Why it keeps coming back", category: "open_loop", template: "There's a reason it keeps coming back.", notes: "Cause-curiosity." },
  { name: "Strength first then mobility", category: "open_loop", template: "Strength first. Then mobility.", notes: "Order is the gap. Doesn't bash clinicians." },
  { name: "Most people miss this", category: "open_loop", template: "Most people miss this.", notes: "Social comparison + gap." },
  { name: "This is why it flares", category: "open_loop", template: "This is why it flares at {trigger}.", notes: "Cause + specific moment." },
  { name: "The missing piece", category: "open_loop", template: "The missing piece isn't flexibility.", notes: "Closes one door, opens another." },

  // --- listicle ---
  { name: "N things I wish I knew", category: "listicle", template: "{n} things I wish I knew.", notes: "List + hindsight. No 'back pain' needed." },
  { name: "N mistakes number is the one", category: "listicle", template: "{n} mistakes. #{n} is the one.", notes: "Hidden twist so swipe has a job." },
  { name: "N signs it's not tightness", category: "listicle", template: "{n} signs it's not tightness.", notes: "Diagnostic listicle." },
  { name: "N desk habits to drop", category: "listicle", template: "{n} desk habits to drop.", notes: "Constraint + list." },
  { name: "Things nobody tells you", category: "listicle", template: "Things nobody tells you about {pain}.", notes: "Insider listicle." },
  { name: "N things I stopped doing", category: "listicle", template: "{n} things I stopped doing.", notes: "Subtraction list — underused." },
  { name: "N reasons stretching failed", category: "listicle", template: "{n} reasons stretching failed.", notes: "Post-mortem list." },
  { name: "N desk fixes no equipment", category: "listicle", template: "{n} desk fixes. No equipment.", notes: "List + constraint." },
  { name: "N swaps that changed mornings", category: "listicle", template: "{n} swaps that changed my mornings.", notes: "Result + list." },

  // --- contrarian ---
  { name: "Stretching is overrated", category: "contrarian", template: "Stretching is overrated.", notes: "Belief challenge. Pay off with strength." },
  { name: "You don't need more rest", category: "contrarian", template: "You don't need more rest.", notes: "Relief + challenge." },
  { name: "Mattress isn't the issue", category: "contrarian", template: "Your mattress isn't the issue.", notes: "Kills the expensive wrong fix." },
  { name: "Standing desk won't save you", category: "contrarian", template: "Standing desks won't save you.", notes: "Gadget myth." },
  { name: "Flexibility isn't the goal", category: "contrarian", template: "Flexibility isn't the goal.", notes: "Reframe the win condition." },
  { name: "Unpopular rest makes it worse", category: "contrarian", template: "Unpopular: rest makes it worse.", notes: "Hot take format." },
  { name: "Your back doesn't need a vacation", category: "contrarian", template: "Your back doesn't need a vacation.", notes: "Metaphor challenge." },
  { name: "Sitting isn't the villain", category: "contrarian", template: "Sitting isn't the villain. Weakness is.", notes: "Two-beat reframe." },
  { name: "Worst advice I got", category: "contrarian", template: "The worst {pain} advice I ever got.", notes: "Negative experience." },
  { name: "Strong beats flexible", category: "contrarian", template: "Strong beats flexible.", notes: "3-word brand line." },

  // --- story ---
  { name: "I almost quit on my back", category: "story", template: "I almost quit on my back.", notes: "In medias res + vulnerability." },
  { name: "I was doing everything wrong", category: "story", template: "I was doing everything wrong.", notes: "Confession. Swipe = the right thing." },
  { name: "I spent a year on YouTube", category: "story", template: "I spent a year on YouTube.", notes: "Failed-fix as story open." },
  { name: "I used to dread mornings", category: "story", template: "I used to dread mornings.", notes: "Before-state, ending withheld." },
  { name: "I thought I needed a new chair", category: "story", template: "I thought I needed a new {object}.", notes: "Wrong-solution story." },
  { name: "Week N is when it clicked", category: "story", template: "Week {week_n} is when it clicked.", notes: "Specific beat in the arc." },
  { name: "Six months ago I couldn't sit", category: "story", template: "Six months ago I couldn't sit.", notes: "Timeboxed before-state." },

  // --- result ---
  { name: "N weeks different mornings", category: "result", template: "{week_n} weeks. Different mornings.", notes: "Result-first, no method." },
  { name: "N days of this", category: "result", template: "{n} days of this.", notes: "Undefined this + timeframe." },
  { name: "Before ibuprofen after a plan", category: "result", template: "Before: {before}. After: {after}.", notes: "Contrast pair." },
  { name: "I tracked it N weeks", category: "result", template: "I tracked it for {week_n} weeks.", notes: "Data-diary. Chart is the payoff." },
  { name: "I stopped dreading the alarm", category: "result", template: "I stopped dreading the alarm.", notes: "Emotional result, no medical claim." },
  { name: "From stiff to showing up", category: "result", template: "From stiff to showing up.", notes: "Process result, not a cure." },

  // --- constraint ---
  { name: "N minutes no gym", category: "constraint", template: "{minutes} minutes. No gym.", notes: "Time + place constraint." },
  { name: "No equipment still works", category: "constraint", template: "No equipment. Still works.", notes: "Removes the gear barrier." },
  { name: "If you only have N days", category: "constraint", template: "If you only have {n} days.", notes: "Schedule filter. Incomplete." },
  { name: "Desk-friendly that's the point", category: "constraint", template: "Desk-friendly. That's the point.", notes: "Constraint as feature." },
  { name: "Lunch-break length", category: "constraint", template: "Lunch-break length.", notes: "Two-word time box." },
  { name: "Apartment floor that's the gym", category: "constraint", template: "Apartment floor. That's the gym.", notes: "Place constraint." },
  { name: "Three days that's enough", category: "constraint", template: "Three days a week. That's enough.", notes: "Relief + constraint." },

  // --- identity ---
  { name: "POV stand up without wincing", category: "identity", template: "POV: you stand up without wincing.", notes: "Scene drop into the after." },
  { name: "Tell me you have desk back", category: "identity", template: "Tell me you have desk back.", notes: "Trend format, tribe." },
  { name: "For everyone who sits", category: "identity", template: "For everyone who {relatable_struggle}.", notes: "Identity call-out." },
  { name: "POV back finally cooperates", category: "identity", template: "POV: your back finally cooperates.", notes: "Emotional identity, short." },
  { name: "Tell me without telling me", category: "identity", template: "Tell me without telling me: desk job.", notes: "Meme-native." },
  { name: "This is for the 3pm people", category: "identity", template: "This is for the 3pm slump people.", notes: "Niche-inside-niche." },

  // --- how_to ---
  { name: "Do this instead of stretching", category: "how_to", template: "Do this instead of stretching.", notes: "Swap. 'This' is the gap." },
  { name: "My N-minute reset", category: "how_to", template: "My {minutes}-minute back reset.", notes: "Personal routine." },
  { name: "Instead of X this", category: "how_to", template: "Instead of {common_mistake}, this.", notes: "Swap, undefined this." },
  { name: "Start here not stretches", category: "how_to", template: "Start here. Not with stretches.", notes: "First-step + contrarian." },
  { name: "The first thing I do at 7am", category: "how_to", template: "The first thing I do at 7am.", notes: "Specific time = believable." },
  { name: "How I stopped dreading mornings", category: "how_to", template: "How I stopped dreading mornings.", notes: "How-to without 'fixed my pain'." },
  { name: "Swap this one habit", category: "how_to", template: "Swap this one habit.", notes: "Low-effort promise." },

  // --- wish_i_knew ---
  { name: "Things I wish I knew at age", category: "wish_i_knew", template: "Things I wish I knew at {age}.", notes: "Age-gated hindsight. Huge save format." },
  { name: "What I wish someone told me", category: "wish_i_knew", template: "What I wish someone told me.", notes: "Gift framing." },
  { name: "I wish I'd strengthened first", category: "wish_i_knew", template: "I wish I'd strengthened first.", notes: "Specific regret = Remedy wedge." },
  { name: "I wish I'd had a plan", category: "wish_i_knew", template: "I wish I'd had a plan.", notes: "Product without naming it." },
  { name: "Things nobody told me at age", category: "wish_i_knew", template: "Things nobody told me at {age}.", notes: "Insider + age." },

  // --- save_bait ---
  { name: "Save this if you sit", category: "save_bait", template: "Save this if you sit all day.", notes: "Save prime + audience." },
  { name: "Screenshot this before work", category: "save_bait", template: "Screenshot this before work.", notes: "Action + context." },
  { name: "Save this for 3pm", category: "save_bait", template: "Save this for your 3pm slump.", notes: "Moment targeting." },
  { name: "Send this to your back", category: "save_bait", template: "Send this to your back.", notes: "Weird enough to stop the thumb." },

  // --- permission ---
  { name: "You don't need expensive", category: "permission", template: "You don't need a {expensive_solution}.", notes: "Relief. Removes the hard path." },
  { name: "You don't need a gym", category: "permission", template: "You don't need a gym.", notes: "Barrier down." },
  { name: "You don't need to suffer mornings", category: "permission", template: "You don't need to suffer mornings.", notes: "Permission + outcome." },
  { name: "You can do this on the floor", category: "permission", template: "You can do this on the floor.", notes: "Place permission." },
  { name: "You don't need to be flexible first", category: "permission", template: "You don't need to be flexible first.", notes: "Kills the prerequisite myth." },

  // --- relatable ---
  { name: "When your back says no", category: "relatable", template: "When your back says no to {activity}.", notes: "Shared moment humor." },
  { name: "Get-out-of-bed wince", category: "relatable", template: "That get-out-of-bed wince.", notes: "Named micro-moment." },
  { name: "Me vs a low couch", category: "relatable", template: "Me vs. a low couch.", notes: "Vs-format, visual." },
  { name: "Shoe-tying squat of shame", category: "relatable", template: "The shoe-tying squat of shame.", notes: "Specific and funny." },
  { name: "That 3pm I need to lie down", category: "relatable", template: "That 3pm \"I need to lie down.\"", notes: "Quoted inner monologue." },
  { name: "First step out of bed", category: "relatable", template: "The first step out of bed.", notes: "Scene, no joke needed." },

  // --- challenge ---
  { name: "Day 1 follow along", category: "challenge", template: "Day 1. Follow along.", notes: "Series native." },
  { name: "Try this for N days", category: "challenge", template: "Try this for {n} days.", notes: "Bounded invite." },
  { name: "Come back on day N", category: "challenge", template: "Come back on day {n}.", notes: "Open loop across posts." },
  { name: "N weeks I'll show the chart", category: "challenge", template: "{week_n} weeks. I'll show the chart.", notes: "Proof tease." },

  // --- stat ---
  { name: "Percent of us get this", category: "stat_based", template: "{stat_percent}% of us get this.", notes: "Inclusive stat, incomplete." },
  { name: "You sit hours", category: "stat_based", template: "You sit {hours} hours. Your back felt all of them.", notes: "Personal stat." },
  { name: "N minutes is the session", category: "stat_based", template: "{minutes} minutes is the whole session.", notes: "Product number as hook." },
  { name: "You sit more than you sleep", category: "stat_based", template: "You sit more than you sleep.", notes: "Comparison stat, no fake research." },
  { name: "Bare percent", category: "stat_based", template: "{stat_percent}%.", notes: "Big number as the whole slide. Swipe explains." },
  { name: "N out of 5", category: "stat_based", template: "4 out of 5 adults.", notes: "Same 80% lifetime fact, different shape." },
  { name: "N hours in a chair", category: "stat_based", template: "{hours} hours in a chair.", notes: "Personal desk-day number." },
  { name: "Hours vs minutes", category: "stat_based", template: "{hours} hours vs {minutes} minutes.", notes: "Sit-day vs session contrast." },
  { name: "Year of chair hours", category: "stat_based", template: "2,000 hours in that chair.", notes: "8h × ~250 workdays. Felt, not a fake study." },
  { name: "N exercises is the session", category: "stat_based", template: "{n} exercises. That's the session.", notes: "Product count as hook." },
  { name: "Week X of Y", category: "stat_based", template: "Week {week_n} of 5.", notes: "Program position as the number." },
  { name: "N days not 7", category: "stat_based", template: "{n} days. Not 7.", notes: "Frequency constraint as a stat." },
  { name: "Clock flare", category: "stat_based", template: "3pm. That's the flare.", notes: "Clock time as the statistic." },
  { name: "You sit more than you walk", category: "stat_based", template: "You sit more than you walk.", notes: "Ratio, no fake percent." },
  { name: "Zero equipment", category: "stat_based", template: "0 equipment.", notes: "Zero as the number." },
  { name: "Workday vs session", category: "stat_based", template: "8 hours down. {minutes} minutes up.", notes: "Contrast pair." },
  // Study-backed (WHO fact sheet + Lancet Rheumatol 2023 / GBD 2021). Do not invent new percents.
  { name: "619 million", category: "stat_based", template: "619 million.", notes: "WHO/GBD 2020 prevalent cases. Big number, swipe explains." },
  { name: "1 in 13 right now", category: "stat_based", template: "1 in 13. Right now.", notes: "WHO 2020: ~1 in 13 people had LBP that year." },
  { name: "Leading cause of disability", category: "stat_based", template: "#1 cause of disability.", notes: "WHO: LBP is the single leading cause of disability worldwide." },
  { name: "843 million by 2050", category: "stat_based", template: "843 million by 2050.", notes: "WHO/GBD projection if nothing changes." },

  // --- myth ---
  { name: "Myth vs fact short", category: "myth_bust", template: "Myth: {myth}. Fact: {fact}.", notes: "Two-beat. Keep each half tiny." },
  { name: "Rest doesn't fix it", category: "myth_bust", template: "Rest doesn't fix it.", notes: "One-line myth kill." },
  { name: "A better chair isn't the fix", category: "myth_bust", template: "A better chair isn't the fix.", notes: "Gadget myth." },

  // --- onboarding / tailored plan (pairs with img_0524–0540) ---
  { name: "It asked where it hurts", category: "open_loop", template: "It asked where it hurts.", notes: "Onboarding location. Pairs with img_0530 / your-program." },
  { name: "Not a generic plan", category: "punchy", template: "Not a generic plan.", notes: "Onboarding wedge. Pairs with questions + match SS." },
  { name: "Built from your answers", category: "how_to", template: "Built from your answers.", notes: "Onboarding. Pairs with building-plan / match." },
  { name: "Where does yours hurt", category: "callout", template: "Where does yours hurt?", notes: "Onboarding location as the hook." },
  { name: "4 in 5 of us", category: "stat_based", template: "4 in 5 of us.", notes: "Founder screen lifetime fact." },

  // --- content pillars (controversial + PT cost + playlist + persona) ---
  { name: "PT is expensive as fuck", category: "punchy", template: "PT is expensive as fuck.", notes: "Organic only. Pillar 1." },
  { name: "1200 average PT course", category: "stat_based", template: "$1,200. That's the average PT course.", notes: "Meta-clean money hook. Pillar 1." },
  { name: "PT is 150 a session", category: "stat_based", template: "PT is $150 a session.", notes: "Meta-clean. Pillar 1." },
  { name: "Never from YouTube", category: "contrarian", template: "You will never get your back right from YouTube.", notes: "Playlist vs program. Pillar 2." },
  { name: "Never from TikTok", category: "contrarian", template: "You will never get your back right from TikTok.", notes: "Playlist vs program. Pillar 2." },
  { name: "Plan problem", category: "contrarian", template: "You don't have a back problem. You have a plan problem.", notes: "Playlist vs program. Pillar 2." },
  { name: "That's why you're still hurting", category: "mistake", template: "That's why you're still hurting.", notes: "Payoff after fake 3-exercise fixes. Pillar 2." },
  { name: "Killing your back stretching", category: "contrarian", template: "You are killing your back by stretching it.", notes: "Payoff: tight isn't the whole problem. Weak is." },
  { name: "Worst is rest and wait", category: "contrarian", template: "The worst thing you can do is rest it and wait.", notes: "Stuck-advice pillar." },
  { name: "80 of adults get back pain", category: "stat_based", template: "80% of adults get back pain.", notes: "Lifetime. One huge-stat per batch." },
  { name: "2 in 5 last 3 months", category: "stat_based", template: "2 in 5 adults. Last 3 months.", notes: "CDC NCHS Data Brief 415 (~39%). Use if 80% is mid." },
  { name: "1 cause on earth", category: "stat_based", template: "#1 cause of disability on earth.", notes: "WHO. Don't stack with 80% / 619M." },
  { name: "Starts at 20", category: "identity", template: "Nobody tells you this starts at 20.", notes: "Age persona. Quiet 18–29 fact: ~28% in a 3-month window." },
  { name: "Desk stretches do nothing", category: "identity", template: "I sit 9 hours. Desk stretches do nothing.", notes: "Desk persona. Show a real session, not a stretch-reminder." },
  { name: "Deadlifts light it up", category: "identity", template: "My back isn't injured. Deadlifts light it up.", notes: "Gym-bro. Remedy = get back to training." },
  { name: "No hour for PT", category: "constraint", template: "You don't have an hour for PT.", notes: "Time persona. Payoff: you have 15 minutes." },
  { name: "You have 15 minutes", category: "constraint", template: "You have 15 minutes.", notes: "Time persona pair." },

  // --- distribution jobs (steal the meaning, not a fixed phrase) ---
  { name: "If you avatar situation", category: "callout", template: "If you {avatar_situation}.", notes: "Avatar filter. Incomplete on purpose." },
  { name: "Most avatar pillar deal", category: "identity", template: "Most {avatar} {pillar_deal}.", notes: "Most-of-group + one pillar problem." },
  { name: "N ways verb", category: "listicle", template: "{n} ways to {ways_verb}.", notes: "Numbered container. Topic stays back pain." },
  { name: "Top N ways verb", category: "listicle", template: "Top {n} ways to {ways_verb}.", notes: "Same job as numbered ways. Wording can vary." },
  { name: "Avatar call bare", category: "callout", template: "{avatar_call}.", notes: "The line IS the audience." },
  { name: "Avatar call listen", category: "callout", template: "{avatar_call}. Listen up.", notes: "Bare callout + command. Keep to 2 lines." },
  { name: "The reason belief", category: "open_loop", template: "The reason {common_belief}.", notes: "Belief autopsy. Name the belief." },
  { name: "Why belief", category: "myth_bust", template: "Why {common_belief}.", notes: "Same job as the-reason. Don't copy the opener every time." },
];

/** Ready-to-use first slides. Prefer these over LLM output. High-signal + diverse on purpose. */
export const SEED_HOOKS: SeedHookDef[] = [
  // punchy
  { text: "Hear me out.", category: "punchy" },
  { text: "Your chair is lying.", category: "punchy" },
  { text: "Stop stretching it.", category: "punchy" },
  { text: "Rest made it worse.", category: "punchy" },
  { text: "This is the one.", category: "punchy" },
  { text: "Desk job tax.", category: "punchy" },
  { text: "Stretching isn't a plan.", category: "punchy" },
  { text: "Wait for slide 5.", category: "punchy" },
  { text: "Why is no one talking about this?", category: "punchy" },
  { text: "Save this.", category: "punchy" },
  { text: "You're stretching wrong.", category: "punchy" },
  { text: "Ibuprofen isn't a plan.", category: "punchy" },
  { text: "Tight isn't the problem.", category: "punchy" },
  { text: "One thing changed.", category: "punchy" },
  { text: "Then this happened.", category: "punchy" },
  { text: "Don't skip this.", category: "punchy" },
  { text: "I was wrong.", category: "punchy" },
  { text: "Strength over stretch.", category: "punchy" },
  { text: "15 minutes. That's it.", category: "punchy" },
  { text: "No foam roller needed.", category: "punchy" },
  { text: "You don't need another gadget.", category: "punchy" },
  { text: "Sit less. Strengthen more.", category: "punchy" },
  { text: "This isn't a playlist.", category: "punchy" },
  { text: "Your mornings can change.", category: "punchy" },
  { text: "Read this twice.", category: "punchy" },
  { text: "Soft couches are a trap.", category: "punchy" },
  { text: "Core first. Always.", category: "punchy" },
  { text: "The playlist failed you.", category: "punchy" },
  { text: "Morning wince? Yeah.", category: "punchy" },
  { text: "Socks shouldn't hurt.", category: "punchy" },
  { text: "Getting out of bed is the test.", category: "punchy" },
  { text: "Your lumbar is bored.", category: "punchy" },
  { text: "Movement, not rest.", category: "punchy" },
  { text: "Random stretches. Random results.", category: "punchy" },
  { text: "A program, not vibes.", category: "punchy" },
  { text: "Follow along. Every rep.", category: "punchy" },
  { text: "Back pain? Not random.", category: "punchy" },
  { text: "The chair is winning.", category: "punchy" },
  { text: "Fix the muscles. Not the mattress.", category: "punchy" },
  { text: "YouTube is not PT.", category: "punchy" },
  { text: "Five weeks. Not five videos.", category: "punchy" },
  { text: "Under 20 minutes.", category: "punchy" },
  { text: "Pick your days.", category: "punchy" },
  { text: "Show up. That's the program.", category: "punchy" },
  { text: "Stiff can ease.", category: "punchy" },
  { text: "Your back remembers sitting.", category: "punchy" },

  // callout
  { text: "If you sit 8 hours.", category: "callout" },
  { text: "If mornings feel 80.", category: "callout" },
  { text: "If you've tried YouTube.", category: "callout" },
  { text: "If your back hates Mondays.", category: "callout" },
  { text: "If you can't tie your shoes.", category: "callout" },
  { text: "If you stand up like you're 80.", category: "callout" },
  { text: "If sitting is the trigger.", category: "callout" },
  { text: "If you've given up on YouTube.", category: "callout" },
  { text: "If the stretches aren't sticking.", category: "callout" },
  { text: "Desk workers. Read this.", category: "callout" },
  { text: "If you work from the couch.", category: "callout" },
  { text: "If you drive more than you walk.", category: "callout" },
  { text: "If you pop ibuprofen at 10am.", category: "callout" },
  { text: "Remote workers. This is you.", category: "callout" },
  { text: "If you dread getting out of bed.", category: "callout" },
  { text: "If you've bought three mattresses.", category: "callout" },
  { text: "If you foam roll and still hurt.", category: "callout" },
  { text: "If \"just stretch\" didn't work.", category: "callout" },
  { text: "If you sit through pain at work.", category: "callout" },

  // mistake
  { text: "Stop only stretching.", category: "mistake" },
  { text: "Stop resting it.", category: "mistake" },
  { text: "Stop random YouTube.", category: "mistake" },
  { text: "You're foam rolling wrong.", category: "mistake" },
  { text: "The advice that's hurting you.", category: "mistake" },
  { text: "Rest is the trap.", category: "mistake" },
  { text: "Stretching it made it worse.", category: "mistake" },
  { text: "Stop treating it like tightness.", category: "mistake" },
  { text: "Stop guessing exercises.", category: "mistake" },
  { text: "Stop buying gadgets.", category: "mistake" },
  { text: "Stop waiting it out.", category: "mistake" },
  { text: "The stretch making it worse.", category: "mistake" },
  { text: "You're skipping the strength part.", category: "mistake" },
  { text: "Stop stretching a weak back.", category: "mistake" },

  // open_loop
  { text: "Nobody talks about this.", category: "open_loop" },
  { text: "The one thing your back needs.", category: "open_loop" },
  { text: "Wait until slide 6.", category: "open_loop" },
  { text: "This isn't what you think.", category: "open_loop" },
  { text: "Your stretches aren't the plan. This is.", category: "open_loop" },
  { text: "I changed one thing.", category: "open_loop" },
  { text: "Then this.", category: "open_loop" },
  { text: "Strength first. Then mobility.", category: "open_loop" },
  { text: "The part nobody shows you.", category: "open_loop" },
  { text: "There's a reason it keeps coming back.", category: "open_loop" },
  { text: "This is why it flares at 3pm.", category: "open_loop" },
  { text: "The missing piece isn't flexibility.", category: "open_loop" },
  { text: "You'll want slide 4.", category: "open_loop" },
  { text: "Most people miss this.", category: "open_loop" },
  { text: "Here's the part they skip.", category: "open_loop" },

  // listicle
  { text: "5 things I wish I knew.", category: "listicle" },
  { text: "3 mistakes. #2 is the one.", category: "listicle" },
  { text: "7 signs it's not tightness.", category: "listicle" },
  { text: "4 desk habits to drop.", category: "listicle" },
  { text: "Things nobody tells you about back pain.", category: "listicle" },
  { text: "3 swaps that changed my mornings.", category: "listicle" },
  { text: "6 signs you need a plan.", category: "listicle" },
  { text: "5 desk fixes. No equipment.", category: "listicle" },
  { text: "4 things I stopped doing.", category: "listicle" },
  { text: "3 reasons stretching failed.", category: "listicle" },
  { text: "8 minutes that matter more than an hour.", category: "listicle" },

  // contrarian
  { text: "Stretching is overrated.", category: "contrarian" },
  { text: "You don't need more rest.", category: "contrarian" },
  { text: "Your mattress isn't the issue.", category: "contrarian" },
  { text: "Standing desks won't save you.", category: "contrarian" },
  { text: "Core work isn't optional.", category: "contrarian" },
  { text: "The worst advice I got.", category: "contrarian" },
  { text: "Unpopular: rest makes it worse.", category: "contrarian" },
  { text: "Flexibility isn't the goal.", category: "contrarian" },
  { text: "Pain isn't a flexibility problem.", category: "contrarian" },
  { text: "Your back doesn't need a vacation.", category: "contrarian" },
  { text: "More stretching made it worse.", category: "contrarian" },
  { text: "Sitting isn't the villain. Weakness is.", category: "contrarian" },
  { text: "Strong beats flexible.", category: "contrarian" },

  // story
  { text: "I almost quit on my back.", category: "story" },
  { text: "Six months ago I couldn't sit.", category: "story" },
  { text: "I was doing everything wrong.", category: "story" },
  { text: "I started with strength. Not stretches.", category: "story" },
  { text: "I spent a year on YouTube.", category: "story" },
  { text: "Then I got a real plan.", category: "story" },
  { text: "I used to dread mornings.", category: "story" },
  { text: "I thought I needed a new chair.", category: "story" },
  { text: "I was the person who couldn't sit through a movie.", category: "story" },
  { text: "Week 3 is when it clicked.", category: "story" },

  // result
  { text: "3 weeks. Different mornings.", category: "result" },
  { text: "21 days of this.", category: "result" },
  { text: "Before: ibuprofen. After: a plan.", category: "result" },
  { text: "I tracked it for 5 weeks.", category: "result" },
  { text: "From stiff to showing up.", category: "result" },
  { text: "14 days. That's the test.", category: "result" },
  { text: "My pain trend actually went down.", category: "result" },
  { text: "I stopped dreading the alarm.", category: "result" },
  { text: "Five weeks in, mornings felt different.", category: "result" },

  // constraint
  { text: "15 minutes. No gym.", category: "constraint" },
  { text: "No equipment. Still works.", category: "constraint" },
  { text: "If you only have 3 days.", category: "constraint" },
  { text: "Desk-friendly. That's the point.", category: "constraint" },
  { text: "No foam roller. No bands.", category: "constraint" },
  { text: "Lunch-break length.", category: "constraint" },
  { text: "Three days a week. That's enough.", category: "constraint" },
  { text: "If you only have mornings.", category: "constraint" },
  { text: "Apartment floor. That's the gym.", category: "constraint" },
  { text: "Under 20 minutes. On purpose.", category: "constraint" },

  // identity
  { text: "POV: you stand up without wincing.", category: "identity" },
  { text: "Tell me you have desk back.", category: "identity" },
  { text: "For everyone who sits too much.", category: "identity" },
  { text: "POV: socks don't scare you anymore.", category: "identity" },
  { text: "For the person who gave up on YouTube.", category: "identity" },
  { text: "Tell me without telling me: desk job.", category: "identity" },
  { text: "This is for the 3pm slump people.", category: "identity" },
  { text: "POV: your back finally cooperates.", category: "identity" },

  // how_to
  { text: "Do this instead of stretching.", category: "how_to" },
  { text: "My 15-minute back reset.", category: "how_to" },
  { text: "How I stopped dreading mornings.", category: "how_to" },
  { text: "Instead of foam rolling, this.", category: "how_to" },
  { text: "The first thing I do at 7am.", category: "how_to" },
  { text: "How to sit without paying for it later.", category: "how_to" },
  { text: "Swap this one habit.", category: "how_to" },
  { text: "Start here. Not with stretches.", category: "how_to" },

  // wish_i_knew
  { text: "Things I wish I knew at 25.", category: "wish_i_knew" },
  { text: "What I wish someone told me.", category: "wish_i_knew" },
  { text: "I wish I'd stopped stretching sooner.", category: "wish_i_knew" },
  { text: "Things I wish I knew about mornings.", category: "wish_i_knew" },
  { text: "I wish I'd strengthened first.", category: "wish_i_knew" },
  { text: "I wish I'd had a plan.", category: "wish_i_knew" },
  { text: "Things nobody told me at 30.", category: "wish_i_knew" },
  { text: "I wish I'd ignored the mattress ads.", category: "wish_i_knew" },

  // save_bait
  { text: "Save this if you sit all day.", category: "save_bait" },
  { text: "Screenshot this before work.", category: "save_bait" },
  { text: "Send this to your back.", category: "save_bait" },
  { text: "Save this for your 3pm slump.", category: "save_bait" },
  { text: "Bookmark this for Mondays.", category: "save_bait" },
  { text: "Save this. Your chair isn't.", category: "save_bait" },

  // permission
  { text: "You don't need a new mattress.", category: "permission" },
  { text: "You don't need a gym.", category: "permission" },
  { text: "You don't need to suffer mornings.", category: "permission" },
  { text: "You don't need a standing desk.", category: "permission" },
  { text: "You don't need new equipment.", category: "permission" },
  { text: "You don't need another stretch video.", category: "permission" },
  { text: "You can do this on the floor.", category: "permission" },
  { text: "You don't need to be flexible first.", category: "permission" },

  // relatable
  { text: "When your back says no to socks.", category: "relatable" },
  { text: "That get-out-of-bed wince.", category: "relatable" },
  { text: "Me vs. a low couch.", category: "relatable" },
  { text: "The shoe-tying squat of shame.", category: "relatable" },
  { text: "When the office chair wins.", category: "relatable" },
  { text: "That 3pm \"I need to lie down.\"", category: "relatable" },
  { text: "Getting up after a long drive.", category: "relatable" },
  { text: "The first step out of bed.", category: "relatable" },

  // challenge
  { text: "Day 1. Follow along.", category: "challenge" },
  { text: "Try this for 14 days.", category: "challenge" },
  { text: "Week 1 starts now.", category: "challenge" },
  { text: "21 days. I'm posting it.", category: "challenge" },
  { text: "Come back on day 14.", category: "challenge" },
  { text: "Five weeks. I'll show the chart.", category: "challenge" },

  // stat
  { text: "80% of us get this.", category: "stat_based" },
  { text: "8 hours. Your back felt all of them.", category: "stat_based" },
  { text: "20 minutes is the whole session.", category: "stat_based" },
  { text: "5 weeks. That's the arc.", category: "stat_based" },
  { text: "You sit more than you sleep.", category: "stat_based" },

  // myth
  { text: "Rest doesn't fix it.", category: "myth_bust" },
  { text: "A better chair isn't the fix.", category: "myth_bust" },
  { text: "Myth: just stretch. Fact: get strong.", category: "myth_bust" },

  // extra non-"If you" hooks — balance the self-diagnosis pile
  { text: "Same stretches. Same pain.", category: "punchy" },
  { text: "Your plan is missing.", category: "punchy" },
  { text: "Weak back. Loud mornings.", category: "punchy" },
  { text: "Not another stretch video.", category: "punchy" },
  { text: "Floor. Ten minutes. Go.", category: "punchy" },
  { text: "The mattress ads lied.", category: "punchy" },
  { text: "Standing isn't the workout.", category: "punchy" },
  { text: "Skip the gadget aisle.", category: "punchy" },
  { text: "Your back wants load.", category: "punchy" },
  { text: "Tight today. Weak tomorrow.", category: "punchy" },
  { text: "Week 1 looks like this.", category: "open_loop" },
  { text: "The order is the thing.", category: "open_loop" },
  { text: "Here's what I dropped.", category: "open_loop" },
  { text: "Slide 3 is the swap.", category: "open_loop" },
  { text: "This is the missing week.", category: "open_loop" },
  { text: "Don't stretch a tired back.", category: "mistake" },
  { text: "Hoping is not a program.", category: "mistake" },
  { text: "Drop the midnight YouTube.", category: "mistake" },
  { text: "Warm-up isn't the whole plan.", category: "mistake" },
  { text: "Week 2, I sat longer.", category: "result" },
  { text: "Mornings felt less loud.", category: "result" },
  { text: "The chart started down.", category: "result" },
  { text: "I showed up 12 times.", category: "result" },
  { text: "The car-seat shuffle.", category: "relatable" },
  { text: "Standing in line is a workout.", category: "relatable" },
  { text: "That first sit of the day.", category: "relatable" },
  { text: "Reaching the bottom shelf.", category: "relatable" },
  { text: "I thought tightness was the enemy.", category: "story" },
  { text: "I copied every reel. Still stiff.", category: "story" },
  { text: "I started on the floor.", category: "story" },
  { text: "Nobody handed me a plan.", category: "story" },
  { text: "Strengthen first. I learned late.", category: "wish_i_knew" },
  { text: "I wish I'd tracked it.", category: "wish_i_knew" },
  { text: "Flexibility came after strength.", category: "wish_i_knew" },
  { text: "Build the muscles around it.", category: "how_to" },
  { text: "Put strength before stretch.", category: "how_to" },
  { text: "Film-along. No guessing.", category: "how_to" },
  { text: "Start without buying anything.", category: "permission" },
  { text: "You can start on carpet.", category: "permission" },
  { text: "More rest isn't the answer.", category: "contrarian" },
  { text: "A new chair won't do it.", category: "contrarian" },
  { text: "Tightness is the symptom.", category: "contrarian" },
  { text: "2 swaps. That's the whole list.", category: "listicle" },
  { text: "Notes from week 1.", category: "listicle" },
  { text: "What I dropped first.", category: "listicle" },
  { text: "For people who sit for a living.", category: "identity" },
  { text: "This is a desk-body problem.", category: "identity" },
  { text: "POV: you pick your days.", category: "identity" },
  { text: "Desk body. Read this.", category: "callout" },
  { text: "Morning people who wince.", category: "callout" },
  { text: "Long-drive club. This is you.", category: "callout" },
  { text: "Couch-office crew.", category: "callout" },
  { text: "Start on the floor tonight.", category: "challenge" },
  { text: "Three sessions this week.", category: "challenge" },
  { text: "Most sessions are under 20.", category: "stat_based" },
  { text: "Three days can be a week.", category: "stat_based" },

  // statistic-first — add only, leave the rest of the bank alone
  { text: "80%.", category: "stat_based" },
  { text: "80% of adults.", category: "stat_based" },
  { text: "4 out of 5.", category: "stat_based" },
  { text: "4 in 5 get this.", category: "stat_based" },
  { text: "Most adults. At least once.", category: "stat_based" },
  { text: "80%. At least once.", category: "stat_based" },
  { text: "8 hours in a chair.", category: "stat_based" },
  { text: "10 hours. Sitting.", category: "stat_based" },
  { text: "8 hours. Every workday.", category: "stat_based" },
  { text: "You sit 8 hours. Then more.", category: "stat_based" },
  { text: "6 hours before lunch.", category: "stat_based" },
  { text: "Half your day. Sitting.", category: "stat_based" },
  { text: "2,000 hours in that chair.", category: "stat_based" },
  { text: "2,000 chair hours a year.", category: "stat_based" },
  { text: "Your workday is 8 hours.", category: "stat_based" },
  { text: "8 hours vs 15 minutes.", category: "stat_based" },
  { text: "20 minutes. After 8 hours.", category: "stat_based" },
  { text: "15 minutes vs the other 8.", category: "stat_based" },
  { text: "8 hours down. 20 minutes up.", category: "stat_based" },
  { text: "19 minutes. 5 exercises.", category: "stat_based" },
  { text: "5 exercises. That's the session.", category: "stat_based" },
  { text: "5 weeks. 3 days a week.", category: "stat_based" },
  { text: "Week 4 of 5.", category: "stat_based" },
  { text: "3 days. Not 7.", category: "stat_based" },
  { text: "0 equipment.", category: "stat_based" },
  { text: "14 reps. That's the set.", category: "stat_based" },
  { text: "45 minutes. Then stand.", category: "stat_based" },
  { text: "3pm. That's the flare.", category: "stat_based" },
  { text: "7am. That's the test.", category: "stat_based" },
  { text: "10am. Ibuprofen o'clock.", category: "stat_based" },
  { text: "Monday. 9am. Already.", category: "stat_based" },
  { text: "You sit more than you walk.", category: "stat_based" },
  { text: "More chair than floor.", category: "stat_based" },
  { text: "It comes back. That's common.", category: "stat_based" },
  { text: "Second time? Third?", category: "stat_based" },
  { text: "8 hrs.", category: "stat_based" },
  { text: "15 min.", category: "stat_based" },
  { text: "5 wks.", category: "stat_based" },
  { text: "3 days.", category: "stat_based" },
  { text: "2,000 hrs.", category: "stat_based" },
  { text: "1 workday. 1 back.", category: "stat_based" },
  { text: "5 weeks on the chart.", category: "stat_based" },
  { text: "12 sessions. That's a month.", category: "stat_based" },
  { text: "3x a week. That's the dose.", category: "stat_based" },
  { text: "Under 20 minutes. Every time.", category: "stat_based" },
  { text: "It asked where it hurts.", category: "open_loop" },
  { text: "Not a generic plan.", category: "punchy" },
  { text: "Built from your answers.", category: "how_to" },
  { text: "Where does yours hurt?", category: "callout" },
  { text: "4 in 5 of us.", category: "stat_based" },
  { text: "9 to 5. Then this.", category: "stat_based" },
  { text: "40 hours at a desk.", category: "stat_based" },
  { text: "5 days sitting. 3 days training.", category: "stat_based" },
  { text: "160 hours a month. Sitting.", category: "stat_based" },
  { text: "1% of your day. This session.", category: "stat_based" },

  // actual studies — WHO fact sheet + Lancet Rheumatol 2023 (GBD 2021). Add only.
  { text: "619 million.", category: "stat_based" },
  { text: "619 million people.", category: "stat_based" },
  { text: "619 million. And rising.", category: "stat_based" },
  { text: "1 in 13. Right now.", category: "stat_based" },
  { text: "#1 cause of disability.", category: "stat_based" },
  { text: "The leading cause of disability.", category: "stat_based" },
  { text: "843 million by 2050.", category: "stat_based" },
  { text: "Most people. At some point.", category: "stat_based" },
  { text: "Up to 84% of adults.", category: "stat_based" },

  // content pillars — add only
  { text: "PT is expensive as fuck.", category: "punchy" },
  { text: "$1,200. That's the average PT course.", category: "stat_based" },
  { text: "PT is $150 a session.", category: "stat_based" },
  { text: "You will never get your back right from YouTube.", category: "contrarian" },
  { text: "You will never get your back right from TikTok.", category: "contrarian" },
  { text: "You don't have a back problem. You have a plan problem.", category: "contrarian" },
  { text: "That's why you're still hurting.", category: "mistake" },
  { text: "You are killing your back by stretching it.", category: "contrarian" },
  { text: "The worst thing you can do is rest it and wait.", category: "contrarian" },
  { text: "80% of adults get back pain.", category: "stat_based" },
  { text: "2 in 5 adults. Last 3 months.", category: "stat_based" },
  { text: "#1 cause of disability on earth.", category: "stat_based" },
  { text: "Nobody tells you this starts at 20.", category: "identity" },
  { text: "I sit 9 hours. Desk stretches do nothing.", category: "identity" },
  { text: "I sit 9 hours.", category: "identity" },
  { text: "My back isn't injured. Deadlifts light it up.", category: "identity" },
  { text: "Can't deadlift without it lighting up.", category: "identity" },
  { text: "You don't have an hour for PT.", category: "constraint" },
  { text: "You have 15 minutes.", category: "constraint" },
  { text: "28% of 18–29. Already.", category: "stat_based" },

  // distribution jobs — same meanings, different wording
  { text: "If your lower back lights up at 3pm.", category: "callout" },
  { text: "If desk days wreck your back.", category: "callout" },
  { text: "Most desk workers treat tightness like the whole problem.", category: "identity" },
  { text: "Most people with back pain collect YouTube playlists.", category: "identity" },
  { text: "Most back-pain people never get a real plan.", category: "identity" },
  { text: "7 ways a weak back stays loud.", category: "listicle" },
  { text: "5 ways to get through a desk day.", category: "listicle" },
  { text: "Desk people with a stubborn back.", category: "callout" },
  { text: "People with back pain. Start here.", category: "callout" },
  { text: "Busy people who can't shake back pain.", category: "callout" },
  { text: "The reason stretching feels like the fix.", category: "open_loop" },
  { text: "The reason rest sounds like the back-pain fix.", category: "open_loop" },
  { text: "Why everyone tells you to just stretch.", category: "myth_bust" },
];

export const HOOK_RULES = [
  "First slide is a mute thumbnail: 1–2 on-screen lines, one claim, no brand name, no logo. Three lines is too long — do not write those.",
  "Distribution first. Name the viewer (avatar) or the back-pain problem in the line. If the hook could be about any app or any niche, it is a miss.",
  "Prefer the JOB of these shapes, not a fixed phrase: avatar filter, most-of-group + a pillar problem, numbered ways/mistakes/signs about back pain, bare audience callout, belief autopsy (the reason X).",
  "Length is not a quality score. A clear 10-word hook beats a vague 3-word hook. Stay inside 1–2 lines.",
  "Listicles need a named back-pain topic (ways to improve it, mistakes desk workers make) so swipe has a job. Empty '5 things' is a miss.",
  "Never start two hooks in the same batch with the same first word.",
  "Pay off the hook. Don't promise a cure, a permanent fix, or a guarantee — promise a plan, a morning, a swap.",
  "Never bash physical therapists, chiropractors, or clinicians. YouTube, rest-only, stretch-only, and gadgets are fair game.",
  "Never claim Remedy has a PT, used a PT, or that a PT designed / filmed / approved the product. Authority copy may say backed by physiological studies.",
  "Undefined-this, save/bookmark commands, and 'wait until slide N' are old-gen. Almost never generate them. Never make them the batch.",
  "Stat-first hooks only when the number is tied to back pain, sitting, PT cost, or a session — not a bare 80%.",
  "Every carousel sits in one content pillar: PT cost, playlist vs program, stuck advice, huge-and-untreated, or persona. Prefer controversial (you're doing X wrong / trusted advice is the trap).",
  "One huge-problem stat per video (80% lifetime / 2 in 5 last 3 months / #1 disability / 619 million). Never stack those in the same carousel.",
  "PT is expensive is a product wedge, not clinician-bashing. Organic: 'PT is expensive as fuck.' Meta-clean: $150 a session or $1,200 course.",
];

/** Old rules still sitting in `learnings` — seed deletes these so they leave the prompt. */
export const RETIRED_HOOK_RULES = [
  "First slide is a mute thumbnail: 3–8 words, one claim, no brand name, no logo. Never a lecture title or '5 tips for your back'.",
  "Name the viewer or open a gap. If the hook could be about any app, rewrite it.",
  "Prefer self-diagnosis (If you…), mistake (Stop…), and undefined-this over generic problem statements.",
  "At least half of a batch should be 6 words or fewer. Diversity of length AND opening word.",
  "Listicles need a twist (#2 is the one, things I stopped) so swipe has a job.",
  "Steal the mechanic from viral slideshows (this / if you / wait until slide N), not the niche wording.",
  "Stat-first hooks are first-class: a bold number can be the whole slide (80%, 8 hours, 15 min). Only use numbers we can stand behind — no fake studies.",
];
