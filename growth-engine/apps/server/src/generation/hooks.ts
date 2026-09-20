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
  CONTROVERSIAL_CATEGORIES,
  contentPillarsPromptBlock,
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
    if (!uniqueAgainst(existing, text) || usedStarts.has(start) || isUnsafeHook(text) || isLowSignalHook(text)) continue;
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
    .filter((h) => !isUnsafeHook(h.text));
  const highSignal = unusedBank.filter((h) => !isLowSignalHook(h.text));
  const lowSignal = unusedBank.filter((h) => isLowSignalHook(h.text));
  const evolvedFirst = pickDiverseHooks(
    highSignal.filter((h) => h.source === "evolved"),
    n,
  );
  const taken = [
    ...evolvedFirst,
    ...pickDiverseHooks(
      highSignal.filter((h) => h.source === "seed"),
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
  const need = n - inserted.length;
  if (need <= 0) return inserted.slice(0, n);

  const usedStarts = new Set(inserted.map((h) => hookOpeningWord(h.text)));
  const sampled = sampleFormulas(formulas, 2);
  const mechanismBlock = PRIMARY_MECHANISMS.map((m) => `- ${m.id}: ${m.why}`).join("\n");

  const prompt = `You write FIRST SLIDES for TikTok photo carousels for ${BRAND.appName} (${BRAND.niche}).
Audience: ${BRAND.audience}

A slideshow hook is 1–2 lines of huge on-screen text. Not a caption. Not a paragraph.
Two jobs, in order:
1. Distribution — name who this is for or what back-pain problem it is. TikTok and Instagram classify the post from these words. If the line could be about skincare, finance, or any app, it fails.
2. Retention — after that noun is on screen, make swiping away feel like a miss.

Write the MEANING of these jobs. Do not copy the wording. Do not treat any phrase as a locked template:
- Avatar filter: the first thing they read is themselves (desk / busy / back pain / sit-all-day / gym-back).
- Most-of-group + a pillar problem: a group + one specific stuck thing from the content pillars (playlist vs plan, stretch-only, rest-and-wait, PT cost, never taken seriously, no program).
- Numbered ways / mistakes / signs about back pain — the number is a container; the topic stays back pain.
- Bare callout: the line IS the audience.
- Belief autopsy: why a common back-pain belief exists or fails. The belief is in the line.

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

Write ${need} NEW first-slide hooks. Each must sit in one content pillar. Prefer controversial (mistake / contrarian) and the jobs above.

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
        isLowSignalHook(text)
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
  const lines = [
    `HOOK PAYOFF — this carousel is ONE argument. Hook: "${hookText.trim()}". Shape: ${shape}.`,
    "Every slide after slide 1 must continue THIS hook. If you hide the hook and the body could follow a different opener, rewrite it.",
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
      lines.push("CALLOUT: slide 2 is \"that's you\" for the exact situation in the hook. Later slides fix THAT situation, not a generic back-pain pitch.");
      break;
    default:
      lines.push("DEFAULT: treat the hook as a specific claim. Slide 2 unpacks that claim. Remaining slides prove or complete it.");
  }
  return lines.join("\n");
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
  { headline: "Get out of bed without wincing", sub: "Coming soon on the App Store" },
  { headline: "Stop praying it'll be gone tomorrow", sub: "Coming soon on the App Store" },
  { headline: "Stop worrying every time you bend over", sub: "Coming soon on the App Store" },
  { headline: "Stop thinking about your back all day", sub: "Coming soon on the App Store" },
  { headline: "Stop bracing before you even stand", sub: "Coming soon on the App Store" },
  { headline: "Stop hoping rest will fix it", sub: "Coming soon on the App Store" },
  { headline: "Stop guessing what your back needs", sub: "Coming soon on the App Store" },
  { headline: "Stop starting over every time it flares", sub: "Coming soon on the App Store" },
  { headline: "The worry doesn't get the whole day", sub: "Coming soon on the App Store" },
  { headline: "Stop living around your back pain", sub: "Coming soon on the App Store" },
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

const WHO_FOR_HOOK: Array<{ re: RegExp; who: string }> = [
  { re: /\b(desk|office|chair|sit(?:ting)? all|sit(?:ting)? at)\b/i, who: "people who sit all day" },
  { re: /\b(morning|wake|winc|get out of bed|stiff morning)\b/i, who: "people with morning back stiffness" },
  { re: /\b(bend|bending|pick(?:ing)? up|reach)\b/i, who: "people who tense up before they bend" },
  { re: /\b(youtube|tiktok|playlist|random (stretch|exercise))\b/i, who: "people stuck on random exercise videos" },
  { re: /\b(stretch(?:ing|es)?|yoga)\b/i, who: "people who only stretch" },
  { re: /\b(rest|couch|lie down|bed rest)\b/i, who: "people hoping rest will fix it" },
  { re: /\b(flare|flares|comes back|keeps coming)\b/i, who: "people whose back pain keeps flaring" },
  { re: /\b(gym|deadlift|lift(?:ing)?|squat)\b/i, who: "people who flare when they train" },
  { re: /\b(posture|slouch)\b/i, who: "people told they have bad posture" },
  { re: /\b(sciatica|down the leg|leg pain)\b/i, who: "people with pain down the leg" },
  { re: /\b(driv(?:e|ing)|car|commute)\b/i, who: "drivers with lower back pain" },
  { re: /\b(parent|kid|toddler|baby)\b/i, who: "parents with back pain" },
  { re: /\b(sleep|mattress|overnight)\b/i, who: "people who wake up in pain" },
  { re: /\b(pt is|\$150|\$1,?200|expensive as fuck)\b/i, who: "people who can't keep paying for PT" },
  { re: /\b(ibuprofen|advil|10am)\b/i, who: "people who reach for ibuprofen by mid-morning" },
  { re: /\b(3pm|afternoon slump)\b/i, who: "people whose back flares mid-afternoon" },
  { re: /\bfoam\s*roll/i, who: "people who foam roll and still hurt" },
];

const TITLE_WHO_CUE =
  /\b(desk|sit|sitting|morning|stiff|stretch|youtube|tiktok|playlist|bend|flare|gym|deadlift|posture|driver|parent|sleep|mattress|chronic|recurring|office|chair|train|leg|ibuprofen|foam|commute|pt|3pm)\b/i;

export function inferAudienceWho(hookText: string): string {
  for (const row of WHO_FOR_HOOK) {
    if (row.re.test(hookText)) return row.who;
  }
  return "people with recurring back pain";
}

export function buildDistributionTitle(hookText: string, existing?: string): string {
  const who = inferAudienceWho(hookText);
  const topic = hookText.replace(/[.!?]+$/g, "").trim();
  const source = existing && existing.trim().length >= 40
    ? existing.replace(/[.!?]+$/g, "").trim()
    : topic;
  const hasWho =
    TITLE_WHO_CUE.test(source) ||
    /for (people|desk|anyone who)/i.test(source) ||
    who.split(/\s+/).some((w) => w.length > 3 && source.toLowerCase().includes(w.toLowerCase()));
  let title = hasWho ? source : `${source} — for ${who}`;
  if (title.length > 88) {
    const shortWho = who.replace(/^people (with|who) /, "");
    const keep = Math.max(24, 88 - shortWho.length - 3);
    title = `${topic.slice(0, keep).trim()} — ${shortWho}`;
  }
  return title.slice(0, 88);
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
  const titleHasTopic = topicWords.some((w) => tiktokTitle.toLowerCase().includes(w));
  const titleHasWho = TITLE_WHO_CUE.test(tiktokTitle) || /for (people|desk|anyone who)/i.test(tiktokTitle);
  if (!titleHasTopic || !titleHasWho || tiktokTitle.length < 36) {
    tiktokTitle = buildDistributionTitle(hookText, tiktokTitle);
  } else if (tiktokTitle.length > 88) {
    tiktokTitle = tiktokTitle.slice(0, 88);
  }

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
  if (!env.PRELAUNCH) return withAppStoreCta(copy, hook, template);
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
    : "Pick the single closest content pillar and stay there. Do not stack 80% + 619 million + #1 disability.";
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
Also write title + description. Both must do two jobs, in this order:
1. Name the exact back-pain problem or situation in THIS video (from the hook — mornings, bending, stretching-only, flares, desk sitting, etc.).
2. Name who TikTok should show it to, in plain words (desk workers, people with morning stiffness, people who only stretch, people whose pain keeps flaring). That person has to be in the first two sentences of the description and in the title.
- tiktokTitle (55–88 chars): problem first, then who it is for. Not vague ("this helped my back"). Not a joke. Not the hook copied verbatim unless the hook already does both jobs.
- caption (the DESCRIPTION, 4–6 short sentences / about 80–140 words): sentence 1–2 name the problem as it appears on screen; sentence 2–3 name the person; then why the slides matter for that person; end with a question that person would answer. End the caption with "${BRAND.cta}". Never put an App Store URL or any other URL in the caption or on slides.
Also hashtags (max 5, space-separated, include #backpain; never #deskjob).
Return JSON: {"slides":[{"headline":"...","sub":"..."}],"caption":"...","tiktokTitle":"...","hashtags":"..."}`;

  const result = await generateJson(prompt, CarouselCopySchema);
  if (result) {
    const normalized = result.slides.map((s) => ({ headline: s.headline, sub: s.sub ?? "" }));
    if (normalized.length >= template.slides.length) {
      return withLaunchCta({ ...result, slides: normalized.slice(0, template.slides.length) }, template, cta);
    }
    const fb = fallbackCopy(hookText, template, cta);
    return withLaunchCta({ ...result, slides: [...normalized, ...fb.slides.slice(normalized.length)] }, template, cta);
  }
  return fallbackCopy(hookText, template, cta);
}
