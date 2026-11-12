import { z } from "zod";
import {
  getDb,
  hooks,
  hookFormulas,
  HOOK_MECHANISMS,
  fillHookTemplate,
  hookOpeningWord,
  hookWordCount,
  hookSlideLines,
  isLowSignalHook,
  isUnsafeHook,
  pickDiverseHooks,
  pickHooksAcrossPillars,
  CONTENT_PILLARS,
  CONTROVERSIAL_CATEGORIES,
  contentPillarsPromptBlock,
  factoryHooksForPillar,
  isHugeProblemStat,
  matchContentPillar,
} from "@remedy-growth/db";
import { and, eq, inArray } from "drizzle-orm";
import { BRAND, env } from "../config.js";
import { generateJson } from "./llm.js";
import { dimensionPromptBlock, getKnowledgeContext } from "../learning/knowledge.js";
import { screenshotCatalogForPrompt } from "./screenshots.js";
import type { CarouselTemplate, SlideKind } from "./templates.js";

const PRIMARY_MECHANISMS = HOOK_MECHANISMS.filter(
  (m) =>
    !["problem_solution", "curiosity", "transformation", "social_proof"].includes(m.id),
);

const HookBatchSchema = z
  .object({
    hooks: z
      .array(
        z.object({
          text: z.string().min(2).max(90),
          category: z.string(),
        }).strict(),
      )
      .min(1),
  })
  .strict();

function sampleFormulas<T extends { category: string; score: number }>(all: T[], perCategory = 2): T[] {
  const byCat = new Map<string, T[]>();
  for (const f of all) {
    const list = byCat.get(f.category) ?? [];
    list.push(f);
    byCat.set(f.category, list);
  }
  const sampled: T[] = [];
  for (const list of byCat.values()) {
    const ranked = [...list].sort((a, b) => b.score - a.score || Math.random() - 0.5);
    sampled.push(...ranked.slice(0, perCategory));
  }
  return sampled;
}

function uniqueAgainst(existing: Set<string>, text: string): boolean {
  return !existing.has(text.trim().toLowerCase());
}

function fillFromFormulas(
  formulas: Array<{ id: number; category: string; template: string }>,
  n: number,
  existing: Set<string>,
): Array<{ text: string; category: string; formulaId: number | null; source: "generated" }> {
  const shuffled = [...formulas].sort(() => Math.random() - 0.5);
  const usedStarts = new Set<string>();
  const out: Array<{ text: string; category: string; formulaId: number | null; source: "generated" }> = [];
  for (const f of shuffled) {
    if (out.length >= n) break;
    const text = fillHookTemplate(f.template);
    const key = text.trim().toLowerCase();
    const start = hookOpeningWord(text);
    if (!uniqueAgainst(existing, text) || usedStarts.has(start) || isUnsafeHook(text) || isLowSignalHook(text) || !matchContentPillar(text)) continue;
    existing.add(key);
    usedStarts.add(start);
    out.push({ text, category: f.category, formulaId: f.id, source: "generated" });
  }
  return out;
}

export async function generateHooks(n: number): Promise<Array<typeof hooks.$inferSelect>> {
  const db = getDb();
  const knowledge = getKnowledgeContext();
  const activeIds = new Set<string>(PRIMARY_MECHANISMS.map((m) => m.id));
  const formulas = db
    .select()
    .from(hookFormulas)
    .all()
    .filter((f) => activeIds.has(f.category) || f.score > 0);
  const allHookRows = db.select().from(hooks).all();
  const existingTexts = new Set(allHookRows.map((h) => h.text.trim().toLowerCase()));

  const unusedBank = db
    .select()
    .from(hooks)
    .where(and(eq(hooks.status, "candidate"), inArray(hooks.source, ["seed", "evolved"])))
    .all()
    .filter((h) => !isUnsafeHook(h.text) && matchContentPillar(h.text));
  const highSignal = unusedBank.filter((h) => !isLowSignalHook(h.text));
  const lowSignal = unusedBank.filter((h) => isLowSignalHook(h.text));
  const evolvedFirst = pickHooksAcrossPillars(
    highSignal.filter((h) => h.source === "evolved"),
    n,
  );
  const takenIds = new Set(evolvedFirst.map((h) => h.id));
  const taken = [
    ...evolvedFirst,
    ...pickHooksAcrossPillars(
      highSignal.filter((h) => h.source === "seed" && !takenIds.has(h.id)),
      n - evolvedFirst.length,
    ),
  ];
  if (taken.length < n && n >= 8) {
    const filler = pickDiverseHooks(
      lowSignal.filter((h) => !taken.some((t) => t.id === h.id)),
      1,
    )[0];
    if (filler) taken.push(filler);
  }
  function swapSeed(pred: (h: (typeof unusedBank)[number]) => boolean, pickFrom: typeof unusedBank): void {
    const usedIds = new Set(taken.map((h) => h.id));
    const next = pickDiverseHooks(
      pickFrom.filter((h) => !usedIds.has(h.id)),
      1,
    )[0];
    if (!next) return;
    let swapAt = -1;
    for (let i = taken.length - 1; i >= 0; i--) {
      const row = taken[i];
      if (row && row.source === "seed" && pred(row)) {
        swapAt = i;
        break;
      }
    }
    if (swapAt >= 0) taken[swapAt] = next;
  }

  if (n >= 4 && !taken.some((h) => h.category === "stat_based")) {
    swapSeed((row) => row.category !== "stat_based", highSignal.filter((h) => h.category === "stat_based"));
  }
  if (n >= 3 && !taken.some((h) => CONTROVERSIAL_CATEGORIES.has(h.category))) {
    swapSeed(
      (row) => !CONTROVERSIAL_CATEGORIES.has(row.category),
      highSignal.filter((h) => CONTROVERSIAL_CATEGORIES.has(h.category)),
    );
  }
  const hugeIdx = taken
    .map((h, i) => (isHugeProblemStat(h.text) ? i : -1))
    .filter((i) => i >= 0);
  if (hugeIdx.length > 1) {
    for (const i of hugeIdx.slice(1)) {
      const row = taken[i];
      if (!row) continue;
      const replacement = pickDiverseHooks(
        highSignal.filter((h) => !taken.some((t) => t.id === h.id) && !isHugeProblemStat(h.text)),
        1,
      )[0];
      if (replacement) taken[i] = replacement;
    }
  }

  const inserted: Array<typeof hooks.$inferSelect> = [...taken];
  const gap = n - inserted.length;
  if (gap > 0) {
    const used = new Set(existingTexts);
    for (const h of inserted) used.add(h.text.trim().toLowerCase());
    const factoryTexts: string[] = [];
    let guard = 0;
    while (factoryTexts.length < gap && guard < 20) {
      guard++;
      let added = 0;
      for (const p of CONTENT_PILLARS) {
        if (factoryTexts.length >= gap) break;
        const next = factoryHooksForPillar(p.id, 20, used)[0];
        if (!next) continue;
        used.add(next.trim().toLowerCase());
        factoryTexts.push(next);
        added++;
      }
      if (added === 0) break;
    }
    for (const text of factoryTexts) {
      const row = db
        .insert(hooks)
        .values({ text, category: "callout", formulaId: null, source: "seed" })
        .returning()
        .get();
      if (row) inserted.push(row);
    }
  }
  const need = n - inserted.length;
  if (need <= 0) return inserted.slice(0, n);

  const usedStarts = new Set(inserted.map((h) => hookOpeningWord(h.text)));
  const sampled = sampleFormulas(formulas, 2);
  const mechanismBlock = PRIMARY_MECHANISMS.map((m) => `- ${m.id}: ${m.why}`).join("\n");
  const covered = new Set(
    inserted
      .map((h) => matchContentPillar(h.text)?.id)
      .filter((id): id is (typeof CONTENT_PILLARS)[number]["id"] => Boolean(id)),
  );
  const missing = CONTENT_PILLARS.filter((p) => !covered.has(p.id));
  const missingLine = missing.length
    ? `Fill these missing pillars first: ${missing.map((p) => p.title).join(", ")}. Then mix.`
    : "Mix the nine pillars. Do not write two of the same pillar until all nine appear.";

  const prompt = `You write FIRST SLIDES for TikTok photo carousels for ${BRAND.appName} (${BRAND.niche}).
Audience: ${BRAND.audience}

A slideshow hook is 1–2 lines of huge on-screen text. Not a caption. Not a paragraph.
Two jobs, in order:
1. Distribution — name who this is for or what back-pain problem it is. TikTok and Instagram classify the post from these words. If the line could be about skincare, finance, or any app, it fails.
2. Retention — after that noun is on screen, make swiping away feel like a miss.

Write the MEANING of these jobs. Do not copy the wording. Do not treat any phrase as a locked template:
- Avatar / constraint: someone with back pain. Simple words. Plain mental side. Stay-line: listen up / watch this / read this / hear this. Mix openings. Not a desk worker. Not clever.
- Mistake correction: one specific object. Not "you're only stretching." Not "stop resting it and waiting." Do not stack foam rolling.
- Activity + pain: named WHEN plus why/how. Vary the when.
- Huge-and-untreated: short. One real number, the person with back pain, then no plan or no program. Vary the number. Never a lone stat.
- Self-test: do-this plus the problem it solves. Never diagnose.
- Reverse psychology: the pain stays if they keep the habit. Mix the opening. Name the pain. Do not start every line with "Don't want."

"If you have oily skin, stop using this" → name the back-pain person, not a leftover "this".
"Top 5 ways to clear acne" → numbered ways that stay on back pain / desk / sitting.
Do NOT write "Wait until slide N", "Then this", "Hear me out", "I changed one thing", "21 days of this", or bare save/bookmark commands.

Mechanics and why they work:
${mechanismBlock}

Example formulas (vary — steal the job, not the words):
${sampled.map((f) => `- [${f.category}] ${f.template}`).join("\n")}

${knowledge.promptBlock}

${dimensionPromptBlock("Hooks", knowledge.hook, knowledge.hook.experimentInsights)}

${contentPillarsPromptBlock()}

Already used — do not repeat or near-duplicate:
${[...existingTexts].slice(-80).map((t) => `- ${t}`).join("\n")}

We now have onboarding screenshots (where it hurts, how long, goals, equipment, your matched program, 4 in 5). A few hooks in the batch should open that door — tailored plan, not a YouTube playlist — so those screens have copy to match.

Write ${need} NEW first-slide hooks. Each MUST sit in one of the nine content pillars — unmatched lines are discarded. ${missingLine} Content pillars override any older hook preference above. Spread the batch across pillars. Do not write two of one pillar while another pillar is missing. Do not write a whole batch of stretch-vs-strength.

HARD RULES:
- 1–2 on-screen lines. Three lines is a miss. About 5–14 words. Fragments are fine.
- Do NOT chase short for short's sake. A specific 11-word hook beats a vague 3-word hook.
- Every hook must contain a targeting noun: back, desk, sitting, PT, YouTube, foam roll, stretch-as-the-trap, pain, or a named avatar.
- Almost never write undefined-this, save/bookmark/screenshot commands, "wait until slide N", "hear me out", "I changed one thing", or "21 days of this". Zero of those in this batch.
- NEVER start two hooks with the same word.
- NEVER use the same mechanic twice in this batch if ${need} >= 6.
- At least half the batch should be mistake, contrarian, myth_bust, callout, identity, or listicle when ${need} >= 4.
- At most ONE huge-problem stat (80% / 2 in 5 / #1 disability / 619 million) in this batch. The number must sit next to back pain or adults — not a bare "80%".
- Do not write "How I fixed my back pain", "Me explaining", or "Day 1 of fixing my back" — those are exhausted.
- Slide 1 is a hook, not a lecture title. Numbered ways are fine when they name back pain.
- Never bash physical therapists, chiropractors, or clinicians. Do not say you don't need them, that they hid something, or that they failed. PT cost, YouTube, rest-only, stretch-only, and gadgets are fair game.
- Never claim Remedy has a PT, used a PT, or that a PT designed / filmed / approved / is on the team. Authority copy may say backed by physiological studies — not "PT-designed" or "PT-approved".
- Never claim a permanent fix, a guarantee, "cured", or "forever". Promise a plan, a morning, a swap, a missing piece.
- Never say Remedy is free or a free app.
- No emojis, no hashtags, no brand name on the slide.
- Do not invent new swearing. The organic line "PT is expensive as fuck" already exists — do not generate more "as fuck" hooks.
- Mix: punchy, callout, mistake, open_loop, listicle, contrarian, story, result, constraint, identity, how_to, wish_i_knew, permission, relatable, challenge, stat_based, myth_bust.

Return JSON: {"hooks":[{"text":"...","category":"..."}]}`;

  const result = await generateJson(prompt, HookBatchSchema);
  const rows: Array<{ text: string; category: string; formulaId: number | null; source: "generated" }> = [];
  if (result) {
    for (const h of result.hooks) {
      const text = h.text.trim();
      const start = hookOpeningWord(text);
      if (
        !uniqueAgainst(existingTexts, text) ||
        usedStarts.has(start) ||
        hookWordCount(text) > 16 ||
        hookSlideLines(text) >= 3 ||
        isUnsafeHook(text) ||
        isLowSignalHook(text) ||
        !matchContentPillar(text)
      ) continue;
      existingTexts.add(text.toLowerCase());
      usedStarts.add(start);
      const formula = formulas.find((f) => f.category === h.category);
      rows.push({ text, category: h.category, formulaId: formula?.id ?? null, source: "generated" });
      if (rows.length >= need) break;
    }
  }
  if (rows.length < need) {
    rows.push(...fillFromFormulas(formulas, need - rows.length, existingTexts));
  }

  for (const r of rows) {
    const row = db
      .insert(hooks)
      .values({ text: r.text, category: r.category, formulaId: r.formulaId, source: r.source })
      .returning()
      .get();
    if (row) inserted.push(row);
  }
  return inserted.slice(0, n);
}

// ---- Carousel copy generation ----

const CarouselCopySchema = z
  .object({
    slides: z
      .array(
        z.object({
          headline: z.string().min(2).max(90),
          sub: z.string().max(120).default(""),
        }).strict(),
      )
      .min(3),
    caption: z.string().min(10).max(2000),
    tiktokTitle: z.string().min(5).max(90),
    hashtags: z.string().max(200),
  })
  .strict();

export interface CarouselCopy {
  slides: Array<{ headline: string; sub: string }>;
  caption: string;
  tiktokTitle: string;
  hashtags: string;
}

const MAX_HASHTAGS = 5;

/** Cap hashtag count and drop banned tags (future-generated copy only). */
export function normalizeHashtags(raw: string): string {
  return raw
    .split(/\s+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag) => !/^#?deskjob$/i.test(tag))
    .slice(0, MAX_HASHTAGS)
    .join(" ");
}

const FALLBACK_LINES: Record<SlideKind, Array<{ headline: string; sub: string }>> = {
  hook: [{ headline: "", sub: "" }],
  problem: [
    { headline: "Random stretches aren't a plan.", sub: "That's why the pain keeps coming back." },
    { headline: "Your back doesn't need rest.", sub: "It needs a program." },
  ],
  before_after: [
    { headline: "Before: stiff mornings, endless YouTube.", sub: "After: a 5-week plan that adapts to you." },
  ],
  screenshot: [
    { headline: "Here's the swap.", sub: "Strength first. Stretching second." },
    { headline: "This is what that looks like.", sub: "A session, not another three-exercise reel." },
    { headline: "Do this instead.", sub: "Same time you already spend stretching." },
    { headline: "A program, not a playlist.", sub: "Same movements, in order, for weeks." },
    { headline: "Personal, not generic.", sub: "Your answers pick the plan — when the hook is about that." },
  ],
  proof: [{ headline: "Backed by physiological studies.", sub: "Strengthen, don't just stretch." }],
  cta: [{ headline: "Your back won't fix itself.", sub: "Get Remedy — link in bio." }],
  tip: [
    { headline: "Strengthen your core daily.", sub: "Even 10 minutes makes a difference." },
    { headline: "Move every 45 minutes.", sub: "Set a timer. Your back notices." },
    { headline: "Stop sitting on soft couches.", sub: "Your lumbar needs support." },
    { headline: "Glute bridges before bed.", sub: "Takes 3 minutes. Huge payoff." },
    { headline: "Morning mobility first.", sub: "Don't skip the warm-up." },
  ],
  stat: [
    { headline: "80%", sub: "of adults experience back pain in their lifetime." },
    { headline: "20 min", sub: "is all it takes per session." },
    { headline: "5 weeks", sub: "to build a stronger, pain-free back." },
  ],
  text_story: [
    { headline: "I used to dread mornings.", sub: "Every day started with stiffness and frustration." },
    { headline: "YouTube videos didn't cut it.", sub: "Random exercises without a plan never stick." },
    { headline: "Then I found a structured program.", sub: "5 weeks. Video-guided. Adapted to my pain." },
  ],
  full_text: [
    { headline: "Most back pain isn't about your back.", sub: "It's about the muscles that support it." },
  ],
  illustration: [
    { headline: "This is you at your desk.", sub: "Your back is screaming for attention." },
    { headline: "Your body needs movement.", sub: "Not more rest, not another pill." },
    { headline: "Strengthening beats stretching.", sub: "Build the muscles that protect your spine." },
  ],
  photo_person: [
    { headline: "This is you at your desk.", sub: "Your back is screaming for attention." },
    { headline: "Your body needs movement.", sub: "Not more rest, not another pill." },
    { headline: "Strengthening beats stretching.", sub: "Build the muscles that protect your spine." },
  ],
  exercise_photo: [
    { headline: "This is what your sessions look like.", sub: "Video-guided. Every rep shown." },
    { headline: "Real exercises. Every rep shown.", sub: "Backed by physiological studies, not random YouTube stretches." },
    { headline: "This is your first session.", sub: "You have no idea how good your back will feel in 5 weeks." },
    { headline: "Follow along. Every rep.", sub: "The video shows exactly what to do — no guessing." },
    { headline: "This is what fixing your back looks like.", sub: "Not a pill. Not a stretch. A structured program." },
  ],
};

/** Infer the promise the body slides must pay off. Category from the hooks table, with text overrides when the wording is more specific. */
export function inferHookShape(hookText: string, category?: string): string {
  const t = hookText.toLowerCase();
  if (/\b(\d+|two|three|four|five|six)\s+(mistakes?|things?|reasons?|signs?|tips?|habits?|moves?|stretches)\b/.test(t) || /#\d/.test(t)) {
    return "listicle";
  }
  if (/wait until slide|keep swiping|last slide|the one nobody|nobody (tells|shows) you this/.test(t)) {
    return "open_loop";
  }
  if (category && category.trim()) return category.trim().toLowerCase();
  if (/\b(weeks?|days?)\b.*\b(morning|felt|chart|showed up|different|alarm)\b/.test(t) || /\b(stopped dreading|from stiff to|mornings felt)\b/.test(t)) {
    return "result";
  }
  if (/%|\$\d|\b\d+\s*(min|minutes|hours|weeks|exercises)\b|\bin \d\b/.test(t)) return "stat_based";
  if (/\b(wrong|stop|killing|worst thing|myth|don't|dont)\b/.test(t)) return "mistake";
  if (/\b(if you|you sit|desk|deadlift)\b/.test(t)) return "callout";
  return "punchy";
}

/** Deterministic payoff brief for the copy LLM. No extra model call. */
export function hookPayoffContract(hookText: string, category?: string): string {
  const shape = inferHookShape(hookText, category);
  const named = hookNamedThing(hookText);
  const pillar = matchContentPillar(hookText);
  const lines = [
    `HOOK PAYOFF — this carousel is ONE argument. Hook: "${hookText.trim()}". Shape: ${shape}.`,
    pillar
      ? `PILLAR ${pillar.title}: ${pillar.payoff} Stay in this pillar.`
      : "This hook must sit in one content pillar. Pick the closest and stay there.",
    pillar?.id === "never_feeling"
      ? "SLIDE 2 IS ONLY THE WHY. State the gotcha and stop. Do not mention Remedy, the app, a download, a program, or a plan on slide 2. Those can show up on a later slide."
      : "",
    "Every slide after slide 1 must continue THIS hook, in time order inside one scene. If you hide the hook and the body could follow a different opener, rewrite it.",
    "SCENARIO ORDER beats any pillar line that says slide 2 is \"that's you\". Slide 2 is the moment. Do not write \"that's you\", \"this is the\", \"never the fix\", \"stays quiet\", or \"your back needed\".",
    "Slide 2 must start the payoff (name the thing, begin the reveal, or state the consequence). Do not jump to generic Remedy lines (program vs playlist, video-guided, 5 weeks, daily check-ins) unless the hook itself was about a missing plan / YouTube / playlists.",
    "Screenshot, illustration, and exercise slides may show the app, but the HEADLINE must answer the hook — not describe the UI in isolation.",
    "The app is at most one late proof slide. Exercise stills teach the movement — they are not a second product tour.",
    "CTA and caption close the same promise. Do not introduce a second thesis.",
  ];
  if (named) {
    lines.push(`The hook names "${named}". Slide 2's headline must include that idea (same noun or a direct synonym).`);
  }
  switch (shape) {
    case "listicle":
      lines.push("LISTICLE: body slides ARE the items. If the hook numbers them or says \"#N is the one\", deliver those items in order; the highlighted one is the strongest slide. If this template has no tip slots, screenshot/problem/illustration headlines become the items. Do not skip the list for generic app benefits.");
      break;
    case "open_loop":
      lines.push("OPEN LOOP: slide 2 starts revealing \"this\" / the withheld thing. Pay off on the last content slide before the CTA. If the hook says \"wait until slide N\" but this template is shorter, pay off on that last content slide — do not invent extra slides.");
      break;
    case "mistake":
    case "myth_bust":
    case "contrarian":
      lines.push("MISTAKE/CONTRARIAN: slide 2 names the specific wrong behavior from the hook. Later slides: why it fails, then the replacement — still about that behavior.");
      break;
    case "stat_based":
      lines.push("STAT: slide 2 explains or lands THAT number (or its implication). Do not introduce a second huge-problem stat (80% / 619 million / #1 disability).");
      break;
    case "story":
      lines.push("STORY: stay in the same first-person beat through every slide. Do not switch to third-person product copy mid-carousel.");
      break;
    case "how_to":
    case "wish_i_knew":
      lines.push("HOW-TO: body slides are the steps or the missing piece the hook promised — not unrelated tips.");
      break;
    case "result":
      lines.push("RESULT: slide 2 names the specific after-state from the hook (mornings, sitting longer, the chart, the alarm). Later slides show what changed and the small habit that got them there — still THAT result, not a generic app tour.");
      break;
    case "permission":
      lines.push("PERMISSION: slide 2 names the expensive or hard path they can skip. Later slides are the simpler path — still the permission the hook gave.");
      break;
    case "challenge":
      lines.push("CHALLENGE: body slides are the follow-along beats (tonight, day 1, the session). Do not switch to a product tour.");
      break;
    case "callout":
    case "identity":
    case "constraint":
    case "relatable":
      lines.push("CALLOUT: slide 2 is the exact moment from the hook, already happening. Later slides stay in that room and fix that moment.");
      break;
    default:
      lines.push("DEFAULT: treat the hook as a specific claim. Slide 2 unpacks that claim. Remaining slides prove or complete it.");
  }
  return lines.filter(Boolean).join("\n");
}

function hookNamedThing(hookText: string): string | undefined {
  const t = hookText.trim();
  const patterns: RegExp[] = [
    /\bfoam roll(?:ing)?\b/i,
    /\bstretch(?:ing|es)?\b/i,
    /\bYouTube\b/i,
    /\bTikTok\b/i,
    /\bmattress\b/i,
    /\brest(?:ing)?\b/i,
    /\bplaylist\b/i,
    /\bphysical therapy\b/i,
    /\bPT\b/,
    /\bdeadlift/i,
    /\bdesk\b/i,
    /\bibuprofen\b/i,
    /\bheat pad\b/i,
    /\bchiro\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m?.[0]) return m[0];
  }
  return undefined;
}

function fallbackCopy(hookText: string, template: CarouselTemplate, cta?: CtaReviewOption): CarouselCopy {
  let screenshotIdx = 0;
  let tipIdx = 0;
  const named = hookNamedThing(hookText);
  const slides = template.slides.map((s, i) => {
    if (s.kind === "hook") return { headline: hookText, sub: "" };
    if ((s.kind === "illustration" || s.kind === "photo_person") && i === 0) {
      return { headline: hookText, sub: "This is the part nobody shows you." };
    }
    if (i === 1 && s.kind !== "cta") {
      return {
        headline: named ? `That's the ${named} problem.` : "Here's what that actually means.",
        sub: "And why the pain keeps coming back.",
      };
    }
    if (s.kind === "screenshot") {
      const line = FALLBACK_LINES.screenshot[screenshotIdx % FALLBACK_LINES.screenshot.length]!;
      screenshotIdx++;
      return line;
    }
    if (s.kind === "tip") {
      const line = FALLBACK_LINES.tip[tipIdx % FALLBACK_LINES.tip.length]!;
      tipIdx++;
      return line;
    }
    const options = FALLBACK_LINES[s.kind] ?? FALLBACK_LINES.full_text;
    return options[Math.floor(Math.random() * options.length)]!;
  });
  const meta = ensureDistributionMeta(hookText, buildDistributionTitle(hookText), buildDistributionCaption(hookText));
  return withLaunchCta(
    {
      slides,
      caption: meta.caption,
      tiktokTitle: meta.tiktokTitle,
      hashtags: "#backpain #backpainrelief #posture #physicaltherapy #lowerbackpain",
    },
    template,
    cta,
  );
}

/** Tip slides already have a number badge — drop "1." / "Tip 2:" prefixes. */
export function stripTipNumberPrefix(text: string): string {
  return text
    .replace(/^\s*(?:tip\s*)?(?:#\s*)?\d{1,2}\s*[\.\:\)\-–—]\s*/i, "")
    .replace(/^\s*\(\d{1,2}\)\s*/i, "")
    .trim();
}

/** Never claim the app is free. 'Pain-free' and similar stay. */
export function stripFalseFreeClaims(text: string): string {
  return text
    .replace(/\bget\s+remedy\s+free\b/gi, "Get Remedy")
    .replace(/\btry\s+remedy\s+free\b/gi, "Get Remedy")
    .replace(/\bdownload\s+remedy\s+free\b/gi, "Download Remedy")
    .replace(/\bremedy\s+is\s+free\b/gi, "Remedy")
    .replace(/\bremedy\s+for\s+free\b/gi, "Remedy")
    .replace(/\bfree\s+on\s+the\s+app\s+store\b/gi, "on the App Store")
    .replace(/\b(?:a\s+)?free\s+app\b/gi, "app")
    .replace(/\bfree\s+download\b/gi, "download")
    .replace(/\bfree\s+trial\b/gi, "the app")
    .replace(/\bit'?s\s+free\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

/** Last-slide + caption while the App Store listing is not live. Does not change BRAND.cta. */
export const PRELAUNCH_CTA = {
  headline: "Get out of bed without wincing",
  sub: "Coming soon on the App Store",
  captionLine: "Remedy is coming soon on the App Store.",
} as const;

/**
 * LOCKED last-slide lines. Do not edit, add, or rewrite unless the user
 * explicitly asks. Generate only picks from this pool via CTA_REVIEW_OPTIONS.
 */
export const CTA_COPY_POOL = [
  { headline: "Get out of bed without wincing", sub: "Remedy: Back Pain Relief" },
  { headline: "Stop praying it'll be gone tomorrow", sub: "Remedy: Back Pain Relief" },
  { headline: "Stop worrying every time you bend over", sub: "Remedy: Back Pain Relief" },
  { headline: "Stop thinking about your back all day", sub: "Remedy: Back Pain Relief" },
  { headline: "Stop bracing before you even stand", sub: "Remedy: Back Pain Relief" },
  { headline: "Stop hoping rest will fix it", sub: "Remedy: Back Pain Relief" },
  { headline: "Stop guessing what your back needs", sub: "Remedy: Back Pain Relief" },
  { headline: "Stop starting over every time it flares", sub: "Remedy: Back Pain Relief" },
  { headline: "The worry doesn't get the whole day", sub: "Remedy: Back Pain Relief" },
  { headline: "Stop living around your back pain", sub: "Remedy: Back Pain Relief" },
] as const;

export function pickCtaCopy(seed: number): (typeof CTA_COPY_POOL)[number] {
  const i = Math.abs(seed) % CTA_COPY_POOL.length;
  return CTA_COPY_POOL[i]!;
}

export function hookSeed(text: string): number {
  let seed = 0;
  for (let i = 0; i < text.length; i++) seed = (seed + text.charCodeAt(i) * (i + 1)) | 0;
  return seed;
}

/**
 * LOCKED last-slide set (7). Generate picks one. Do not edit layouts, copy,
 * atmospheres, or screenshots unless the user explicitly asks.
 */
export const CTA_REVIEW_OPTIONS = [
  {
    layout: "phone" as const,
    label: "Phone · mornings",
    atmosphere: "field" as const,
    ...CTA_COPY_POOL[0],
    screenshot: "progress.png",
    textStyle: "clean" as const,
    topics: ["morning", "bed", "wincing", "stiff", "wake", "get up", "get out of bed", "alarm"],
  },
  {
    layout: "phone" as const,
    label: "Phone · tomorrow",
    atmosphere: "dusk" as const,
    ...CTA_COPY_POOL[1],
    screenshot: "progress.png",
    textStyle: "bold" as const,
    topics: ["tomorrow", "pray", "hope", "wait it out", "gone tomorrow", "heal on its own"],
  },
  {
    layout: "phone" as const,
    label: "Phone · bend",
    atmosphere: "haze" as const,
    ...CTA_COPY_POOL[2],
    screenshot: "progress.png",
    textStyle: "clean" as const,
    topics: ["bend", "bending", "pick up", "reach", "worry", "scared to"],
  },
  {
    layout: "bleed" as const,
    label: "Bleed · 50%",
    atmosphere: "field" as const,
    ...CTA_COPY_POOL[5],
    screenshot: "img_0525.png",
    textStyle: "clean" as const,
    topics: ["rest", "resting", "couch", "lie down", "bed rest"],
  },
  {
    layout: "bleed" as const,
    label: "Bleed · plan",
    atmosphere: "dusk" as const,
    ...CTA_COPY_POOL[6],
    screenshot: "img_0539.png",
    textStyle: "bold" as const,
    topics: ["guess", "guessing", "youtube", "playlist", "random", "which exercise"],
  },
  {
    layout: "bleed" as const,
    label: "Bleed · flares",
    atmosphere: "haze" as const,
    ...CTA_COPY_POOL[7],
    screenshot: "img_0540.png",
    textStyle: "clean" as const,
    topics: ["flare", "flares", "starting over", "comes back", "keeps coming"],
  },
  {
    layout: "diagonal" as const,
    label: "Diagonal · mental",
    atmosphere: "dusk" as const,
    ...CTA_COPY_POOL[3],
    screenshot: "progress.png",
    textStyle: "bold" as const,
    topics: ["think", "worry", "mental", "all day", "obsess", "can't stop thinking"],
  },
] as const;

export type CtaReviewOption = (typeof CTA_REVIEW_OPTIONS)[number];

/** Best matching last-slide from the review set. Tie / no match falls back to seed. */
export function pickBestCtaOption(hookText: string, seed = hookSeed(hookText)): CtaReviewOption {
  const t = hookText.toLowerCase();
  let bestIdx = 0;
  let bestScore = -1;
  for (let i = 0; i < CTA_REVIEW_OPTIONS.length; i++) {
    const option = CTA_REVIEW_OPTIONS[i]!;
    let score = 0;
    for (const word of option.topics) {
      if (t.includes(word)) score += word.includes(" ") ? 3 : 2;
    }
    for (const word of option.headline.toLowerCase().split(/\W+/).filter((w) => w.length > 3)) {
      if (t.includes(word)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  if (bestScore <= 0) {
    return CTA_REVIEW_OPTIONS[Math.abs(seed) % CTA_REVIEW_OPTIONS.length]!;
  }
  return CTA_REVIEW_OPTIONS[bestIdx]!;
}

const AUDIENCES: Array<{ key: string; re: RegExp; who: string; titles: string[] }> = [
  {
    key: "parents",
    re: /\b(toddler|niece|nephew|grand ?kid|grandson|granddaughter|baby|buckl(?:e|ing)|new moms?)\b/i,
    who: "parents with a bad back",
    titles: [
      "Parents with a bad back",
      "For moms and dads with back pain",
      "If you're a parent with a sore back",
      "Little kids, bad back",
    ],
  },
  {
    key: "train",
    re: /\b(deadlift|dumbbell|squat|gym)\b/i,
    who: "lifters with a bad back",
    titles: [
      "For lifters with a bad back",
      "Gym days, sore back",
      "If training flares your back",
      "Lifting with a sore back",
    ],
  },
  {
    key: "drive",
    re: /\b(stuck in the car|won'?t let me out|get(?:ting)? out of the car|parking lot)\b/i,
    who: "drivers with a bad back",
    titles: [
      "For drivers with a bad back",
      "Too much time in the car",
      "If driving hurts your back",
      "Long drives, sore back",
    ],
  },
  {
    key: "carry",
    re: /\b(grocer(?:y|ies)?|stairs|stair|toolbox|box(?:es)?|carrying|carry)\b/i,
    who: "anyone who carries heavy stuff",
    titles: [
      "Carrying stuff with a bad back",
      "For anyone who hauls things",
      "If carrying wrecks your back",
      "Heavy stuff, sore back",
    ],
  },
  {
    key: "commute",
    re: /\b(commute|train|bus)\b/i,
    who: "commuters with a bad back",
    titles: ["For commuters with a bad back", "The ride to work hurts"],
  },
  {
    key: "drive",
    re: /\b(driv(?:e|ing)|pickup|truck|\bcar\b)\b/i,
    who: "drivers with a bad back",
    titles: [
      "For drivers with a bad back",
      "Too much time in the car",
      "If driving hurts your back",
      "Long drives, sore back",
    ],
  },
  {
    key: "sit",
    re: /\b(desk|laptop|gaming|gamer|movie|coding|calls|sat|sit(?:ting)? all|sit(?:ting)? at|work(?:ing)? (?:in bed|from (?:home|bed)))\b/i,
    who: "desk workers with a sore back",
    titles: [
      "Desk job, sore back",
      "For desk workers with a bad back",
      "If you sit all day",
      "Stuck in a chair all day",
      "For anyone who works sitting down",
      "Office days, bad back",
    ],
  },
  {
    key: "chores",
    re: /\b(rake|raking|yard|garden|kneel(?:ing)?|off my knees)\b/i,
    who: "anyone whose chores flare their back",
    titles: [
      "Weekend chores, bad back",
      "For anyone sore after housework",
      "If chores flare your back",
      "Housework with a bad back",
    ],
  },
  {
    key: "bend",
    re: /\b(bend|bending|pick(?:ing)? up|shoes)\b/i,
    who: "anyone whose back grabs when they bend",
    titles: [
      "If bending down grabs your back",
      "For anyone who dreads bending over",
      "Bending over, bad back",
      "Your back when you bend down",
    ],
  },
  {
    key: "morning",
    re: /\b(wake|waking|morning|get(?:ting)? out of bed|night shift)\b/i,
    who: "anyone who wakes up stiff",
    titles: [
      "Waking up stiff",
      "For anyone stiff in the morning",
      "If mornings are the worst for your back",
      "Stiff back when you wake up",
    ],
  },
  {
    key: "stand",
    re: /\b(standing all|on (?:their|your) feet|stand(?:ing)?|counter|dishes|plates?|sink|nurses?)\b/i,
    who: "anyone on their feet all day",
    titles: [
      "On your feet all day",
      "For anyone who stands for work",
      "Long day on your feet",
      "Standing all day, sore back",
    ],
  },
  {
    key: "stretch",
    re: /\b(stretch(?:ing|es)?|yoga)\b/i,
    who: "anyone who stretches and still hurts",
    titles: ["Stretching and still hurting", "If stretching didn't fix it", "Yoga didn't fix your back"],
  },
  {
    key: "rest",
    re: /\b(rest|couch|recliner|cream|brace|insoles?|floor)\b/i,
    who: "anyone who rests and still hurts",
    titles: [
      "Rest didn't fix your back",
      "For anyone who rested and still hurts",
      "Time off, same pain",
      "The couch didn't help",
      "Still hurting after you rest",
    ],
  },
  {
    key: "videos",
    re: /\b(youtube|tiktok|playlist)\b/i,
    who: "anyone stuck on random exercise videos",
    titles: ["Stuck on random exercise videos", "YouTube didn't fix your back"],
  },
  {
    key: "flare",
    re: /\b(flare|comes back|keeps coming|bad night)\b/i,
    who: "anyone whose back pain keeps coming back",
    titles: ["If your back pain keeps coming back", "Same back pain, again", "For anyone whose pain returns"],
  },
];

const FALLBACK_AUDIENCE = {
  key: "fallback",
  who: "anyone whose back pain keeps coming back",
  titles: ["If your back pain keeps coming back", "Same back pain, again", "Back pain that won't stay gone"],
};

export function audienceFor(text: string): { key: string; who: string; titles: string[] } {
  for (const row of AUDIENCES) {
    if (row.re.test(text)) return row;
  }
  return FALLBACK_AUDIENCE;
}

const TITLE_WHO_CUE =
  /\b(desk|sit|sitting|morning|stiff|stretch|youtube|tiktok|playlist|bend|flare|gym|deadlift|posture|driver|parent|sleep|mattress|chronic|recurring|office|chair|train|leg|ibuprofen|foam|commute|pt|3pm)\b/i;

export function inferAudienceWho(hookText: string): string {
  return audienceFor(hookText).who;
}

/** A title for this audience. Salt rotates the wording so a batch doesn't all match. */
export function audienceTitle(text: string, salt = ""): string {
  const titles = audienceFor(text).titles;
  let h = 0;
  const seed = `${salt}\n${text}`;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return titles[h % titles.length]!.slice(0, 88);
}

export function buildDistributionTitle(hookText: string, _existing?: string): string {
  return audienceTitle(hookText);
}

export function buildDistributionCaption(hookText: string): string {
  const who = inferAudienceWho(hookText);
  const topic = hookText.replace(/[.!?]+$/g, "").trim();
  return [
    `${topic}.`,
    `This is for ${who}.`,
    `If that's you, these slides stay on that problem — why it keeps happening and what to do instead of another random stretch.`,
    `What does your back do in that moment?`,
  ].join("\n\n");
}

/** Title + description name the problem and who should see the post. */
export function ensureDistributionMeta(
  hookText: string,
  title: string,
  caption: string,
): { tiktokTitle: string; caption: string } {
  const topicWords = hookText.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  let tiktokTitle = stripFalseFreeClaims(title).trim();
  const nicheWho = /\b(nurses?|retirees?|uncles?|aunts?|gamers?|devs?|tradesm|grandparents?|weekend warriors?|walk-up|homeowners?|older drivers?)\b/i;
  const allowed = new Set(audienceFor(hookText).titles);
  if (!allowed.has(tiktokTitle) || nicheWho.test(tiktokTitle)) tiktokTitle = buildDistributionTitle(hookText);

  let body = stripFalseFreeClaims(caption)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(BRAND.cta, "")
    .replace(/download remedy on the app store[^\n]*/gi, "")
    .replace(/get remedy\s*[—–-]\s*link in bio\.?/gi, "")
    .replace(/Remedy is coming soon on the App Store\.?/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const words = body.split(/\s+/).filter(Boolean).length;
  const capHasWho = TITLE_WHO_CUE.test(body) || /this is for /i.test(body);
  const capHasTopic = topicWords.some((w) => body.toLowerCase().includes(w));
  if (words < 55 || !capHasWho || !capHasTopic) {
    body = buildDistributionCaption(hookText);
  }
  return {
    tiktokTitle,
    caption: env.PRELAUNCH ? ensureComingSoonCaption(body) : ensureAppStoreCaption(body),
  };
}

/** Captions stay tappable-CTA only. Store URLs in the caption do not get copied. */
export function ensureAppStoreCaption(caption: string): string {
  let next = stripFalseFreeClaims(caption)
    .replace(/https?:\/\/apps\.apple\.com\/\S+/gi, "")
    .replace(/Remedy is coming soon on the App Store\.?/gi, "")
    .replace(/coming soon (on|to) (the )?(app store|ios)\.?/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!next.toLowerCase().includes("link in bio") && !next.includes(BRAND.cta)) {
    next += `\n\n${BRAND.cta}`;
  }
  return next;
}

/** Same as App Store captions, but no download CTA and no store URL. */
export function ensureComingSoonCaption(caption: string): string {
  let next = stripFalseFreeClaims(caption)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(BRAND.cta, "")
    .replace(/download remedy on the app store[^\n]*/gi, "")
    .replace(/get remedy\s*[—–-]\s*link in bio\.?/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!/coming soon (on|to) (the )?(app store|ios)/i.test(next)) {
    next += `\n\n${PRELAUNCH_CTA.captionLine}`;
  }
  return next;
}

function cleanSlideLine(
  s: { headline: string; sub: string },
  kind: SlideKind | undefined,
): { headline: string; sub: string } {
  const raw = stripFalseFreeClaims(s.headline);
  return {
    headline: kind === "tip" ? stripTipNumberPrefix(raw) : raw,
    sub: stripFalseFreeClaims(s.sub),
  };
}

function withAppStoreCta(copy: CarouselCopy, hookText: string, template: CarouselTemplate): CarouselCopy {
  const meta = ensureDistributionMeta(hookText, copy.tiktokTitle, copy.caption);
  return {
    ...copy,
    slides: copy.slides.map((s, i) => cleanSlideLine(s, template.slides[i]?.kind)),
    caption: meta.caption,
    tiktokTitle: meta.tiktokTitle,
    hashtags: normalizeHashtags(copy.hashtags),
  };
}

function withLaunchCta(copy: CarouselCopy, template: CarouselTemplate, cta?: CtaReviewOption): CarouselCopy {
  const hook = copy.slides[0]?.headline ?? copy.tiktokTitle;
  const picked = cta ?? pickBestCtaOption(hook);
  const meta = ensureDistributionMeta(hook, copy.tiktokTitle, copy.caption);
  return {
    ...copy,
    slides: copy.slides.map((s, i) => {
      if (template.slides[i]?.kind === "cta") {
        return { headline: picked.headline, sub: picked.sub };
      }
      return cleanSlideLine(s, template.slides[i]?.kind);
    }),
    caption: meta.caption,
    tiktokTitle: meta.tiktokTitle,
    hashtags: normalizeHashtags(copy.hashtags),
  };
}

const SLOGAN_PATTERNS: RegExp[] = [
  /\b\w+ is the (trap|swap|fix|work|load|break|key|answer|missing piece|real problem)\b/i,
  /^this is (the|how|why|what|where)\b/i,
  /\bnever gave you\b/i,
  /\bthe \w+ (is|was|could) not\b/i,
  /\bis not\.?$/i,
  /\bloses its hold\b/i,
  /\b(running|wearing) out\.?$/i,
  /that'?s you\b/i,
  /\bstays quiet\b/i,
  /\bnever the fix\b/i,
  /\byour back needed\b/i,
  /\bthis is the\b/i,
];

const CONCRETE_WORDS =
  /\d|\b(seconds?|reps?|minutes?|mins?|morning|tonight|bed|chair|couch|car|desk|floor|wall|knees?|hips?|glutes?|core|spine|feet|hands?|elbows?|breathe|squeeze|hold|lift|press|bridge|hinge|tilt|roll|squat|plank|walk|stand up|sit up|lie|lying|sock|shoes|sink|stairs|laptop|phone)\b/i;

/** A line shaped like a motivational poster ("X is the trap", "this is the ..."). Decks reject these outright. */
export function isSloganLine(line: string): boolean {
  return SLOGAN_PATTERNS.some((re) => re.test(line.trim()));
}

/** A line with nothing the viewer can picture: no number, time, place, object, or body part. */
export function lacksConcreteDetail(line: string): boolean {
  return !CONCRETE_WORDS.test(line);
}

/** A body line that reads like a slogan or gives the viewer nothing concrete to try or picture. */
export function isVagueSlideLine(headline: string, sub = ""): boolean {
  const text = `${headline} ${sub}`.trim();
  if (!text) return true;
  if (SLOGAN_PATTERNS.some((re) => re.test(headline.trim()) || re.test(sub.trim()))) return true;
  return !CONCRETE_WORDS.test(text);
}

const CONTENT_KINDS = new Set<SlideKind>(["problem", "tip", "text_story", "full_text", "before_after", "proof", "stat", "illustration", "photo_person"]);

/** Vague body slides out of the content slides (no hook, CTA, or screenshot slides). */
export function vagueBodyCount(slides: Array<{ headline: string; sub: string }>, template: CarouselTemplate): { vague: number; body: number } {
  let vague = 0;
  let body = 0;
  slides.forEach((s, i) => {
    const kind = template.slides[i]?.kind;
    if (i === 0 || !kind || !CONTENT_KINDS.has(kind)) return;
    body++;
    if (isVagueSlideLine(s.headline, s.sub)) vague++;
  });
  return { vague, body };
}

const VALUE_CONTRACT = `VALUE — this is what gets saves and shares. Every body slide must hand the viewer something they can DO, CHECK, or PICTURE tonight:
- a concrete move or position (knees bent, feet flat, squeeze glutes, hinge at the hips), a count (10 reps, 30 seconds, 2 minutes), or a specific everyday moment (putting on socks, the car seat, the first step out of bed, 3pm at the desk).
- Write like a friend texting what actually worked — plain spoken English, full thoughts, not ad copy.
- BANNED slogan shapes: "X is the trap", "X is the swap", "This is the ___ that ___", "the ___ never gave you", "___ is not", "that's you", "never the fix", "stays quiet", "your back needed", mirrored two-word aphorisms. If a line could be a motivational poster, rewrite it as a specific instruction or a specific moment.
- Order the body like a short scene: the moment, the thing they already tried, why that failed, the move with a count, then the app. Do not open the body with a thesis.
- A viewer who only reads the slides (no app) should still learn one thing worth screenshotting.`;

export async function generateCarouselCopy(
  hookText: string,
  template: CarouselTemplate,
  hookCategory?: string,
  cta?: CtaReviewOption,
): Promise<CarouselCopy> {
  const knowledge = getKnowledgeContext();
  const slideRoles = template.slides.map((s, i) => `${i + 1}. ${s.kind}${s.kind === "tip" ? " (numbered tip — write a specific, actionable back-pain tip)" : ""}`).join("\n");

  const cropCatalog = screenshotCatalogForPrompt();
  const pillar = matchContentPillar(hookText);
  const pillarLine = pillar
    ? `This carousel is pillar "${pillar.title}". Thesis: ${pillar.thesis} Payoff: ${pillar.payoff} Stay in this pillar. Do not add a second huge-problem stat.`
    : "This hook must sit in one of the nine content pillars. Pick the single closest and stay there. Do not stack 80% + 619 million + #1 disability.";
  const payoff = hookPayoffContract(hookText, hookCategory);

  const prompt = `You write TikTok photo-carousel copy for ${BRAND.appName}, a ${BRAND.niche} app.
Audience: ${BRAND.audience}
Value props:\n${BRAND.valueProps.map((v) => `- ${v}`).join("\n")}

${knowledge.promptBlock}

${dimensionPromptBlock("Slide copy", knowledge.copy)}

${contentPillarsPromptBlock()}

${pillarLine}

${cropCatalog}

The carousel hook (slide 1 concept) is: "${hookText}"
Template "${template.name}" slide roles, in order:
${slideRoles}

${payoff}

${VALUE_CONTRACT}
${template.slides.length >= 6 ? `\nLONG CAROUSEL (${template.slides.length} slides): every extra slide must advance the same argument. Do not pad with generic app-feature screens that could follow any hook.` : ""}

Write copy for EVERY slide in order (${template.slides.length} slides total).
- "hook" slide: use the hook text as the headline (tighten if needed), empty sub.
- "screenshot" slides: this is the late proof, not a feature tour. Headline continues the hook's teach (the swap, the rule, the list item). Sub may nod at what the screen shows. Only use UI benefits (program vs playlist, video-guided, 5 weeks, check-ins) when the hook itself was about a missing plan / YouTube / playlists. Onboarding screens (where it hurts, how long, goals, equipment, your program) stay first-class when the hook is about a tailored / personal plan — still as proof of that hook, not a tour. Write for the library item that matches (see catalog).
- "tip" slides: headline is the tip itself — do NOT prefix with 1. / 2. / Tip 1. The slide already has a number badge. Sub is a quick detail.
- "stat" slides: headline is ONLY a short number (e.g. "80%" or "20 min"). The explanation goes in sub. Never put a sentence in the headline — that overlaps the sub.
- "text_story" slides: 1-2 sentence narrative beat that continues the hook, building a personal story arc.
- "full_text" slides: punchy insight that unpacks the hook, headline is the claim, sub is the supporting line.
- "illustration" slides: the SVG is the visual. Slide 1 MUST use the hook as the headline. Slides 2 and 3: short caption that continues the hook (not a generic "this is you right now" unless the hook was about that), sub is 1 line.
- "photo_person" slides: a photoreal person is the visual. Slide 1 MUST use the hook as the headline (sub one short line or empty). Later photo_person slides: short caption that continues the hook — not a description of the photo (no "woman on a couch").
- "exercise_photo" slides: real exercise video still from the app (either glute bridge or cat-cow — you don't know which). Headline must connect the session to the hook (why this is the fix for what slide 1 opened). Do not name a specific exercise. Sub = one line on how it feels or why it works. This slide teaches the movement — it is not a second product tour.
- "problem"/"before_after"/"proof" slides: punchy, specific to the hook, no fluff.
- "cta" slide: continue the exact promise of the hook. Sub: max 8 words, e.g. "Get Remedy — link in bio." Never put a URL in the sub. Never say Remedy is free or a free app.
Rules: headlines max 9 words, subs max 14 words, no emojis on slides. Headline and sub must never occupy the same vertical space. NEVER say Remedy is free. Never claim Remedy has a PT, used a PT, or that a PT designed / filmed / approved the product. Authority copy may say backed by physiological studies.
Also write title + description.
- tiktokTitle is only who the post is for. One broad group, worded like a person wrote it, not the same "For people who..." shape every time. Name them a little more specifically than "people". Good: "Desk job, sore back", "For desk workers with a bad back", "Parents with a bad back", "Waking up stiff", "On your feet all day", "For drivers with a bad back", "If bending down grabs your back". Bad: a scene ("getting out of the car at the grocery store"), a job ("for nurses on a 12-hour shift"), or a tiny slice ("for uncles", "for retirees with a small dog"). Do not describe what happens in the video.
- caption (the DESCRIPTION, 4–6 short sentences / about 80–140 words): sentence 1 names the situation; sentence 2 names that same person; then why the slides matter for them; end with a question they would answer. The person has to be in the first two sentences.
- caption (the DESCRIPTION, 4–6 short sentences / about 80–140 words): sentence 1–2 name the problem as it appears on screen; sentence 2–3 name the person; then why the slides matter for that person; end with a question that person would answer. End the caption with "${BRAND.cta}". Never put an App Store URL or any other URL in the caption or on slides.
Also hashtags (max 5, space-separated, include #backpain; never #deskjob).
Return JSON: {"slides":[{"headline":"...","sub":"..."}],"caption":"...","tiktokTitle":"...","hashtags":"..."}`;

  let result = await generateJson(prompt, CarouselCopySchema);
  if (result) {
    const first = result.slides.map((s) => ({ headline: s.headline, sub: s.sub ?? "" }));
    const score = vagueBodyCount(first, template);
    if (score.body > 0 && score.vague * 2 > score.body) {
      const flagged = first
        .filter((s, i) => i > 0 && isVagueSlideLine(s.headline, s.sub))
        .map((s) => `- "${s.headline}${s.sub ? ` / ${s.sub}` : ""}"`)
        .join("\n");
      const retry = await generateJson(
        `${prompt}\n\nYOUR LAST DRAFT FAILED THE VALUE RULE. These lines were slogans or gave the viewer nothing concrete:\n${flagged}\nRewrite every body slide with a specific move, count, or everyday moment.`,
        CarouselCopySchema,
      );
      if (retry) {
        const again = retry.slides.map((s) => ({ headline: s.headline, sub: s.sub ?? "" }));
        if (vagueBodyCount(again, template).vague < score.vague) result = retry;
      }
    }
    const normalized = result.slides.map((s) => ({ headline: s.headline, sub: s.sub ?? "" }));
    if (normalized.length >= template.slides.length) {
      return withLaunchCta({ ...result, slides: normalized.slice(0, template.slides.length) }, template, cta);
    }
    const fb = fallbackCopy(hookText, template, cta);
    return withLaunchCta({ ...result, slides: [...normalized, ...fb.slides.slice(normalized.length)] }, template, cta);
  }
  return fallbackCopy(hookText, template, cta);
}
