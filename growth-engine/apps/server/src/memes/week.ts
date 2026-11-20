import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getDb, posts } from "@remedy-growth/db";
import { isNotNull } from "drizzle-orm";
import { ROOT_DIR, env, type Platform } from "../config.js";
import { generateJson } from "../generation/llm.js";
import { knownBeds, youtubeMusicCredit, type ShortBed } from "../generation/short.js";
import { downloadText } from "../publish/r2.js";
import {
  accountsFor,
  cancelZernioPost,
  fetchPostAnalytics,
  fetchZernioPost,
  accountGroup,
  isCuratedAccount,
  publishToAccount,
  refreshZernioAccounts,
  uploadVideoFile,
  replaceZernioPost,
  updateZernioScheduledAt,
  type ZernioAccount,
  type ZernioKeySlot,
} from "../publish/zernio.js";

/**
 * Weekly memes. One a day, TikTok and YouTube, both brands, including
 * YouTube @remedystories. Recoveries gets cut A and Stories gets cut B:
 * same line and position, different font and size, plus a small trim, zoom,
 * and speed change. The meme's own sound stays. Instagram and Facebook do
 * not get memes. A reject in Review cancels the post.
 */

const TEMPLATES_FILE = path.join(ROOT_DIR, "assets", "memes", "templates.json");
const BUILDS_DIR = path.join(ROOT_DIR, "assets", "memes", "builds");
const WEEKS_DIR = path.join(ROOT_DIR, "assets", "memes", "weeks");
const OUTPUT_DIR = path.join(ROOT_DIR, "output", "memes");
const BUILD_SCRIPT = path.join(ROOT_DIR, "scripts", "meme_build", "build.py");

const CTA = "Download Remedy on the App Store — link in bio";
const HASHTAGS = "#backpain #backpainrelief #posture #physicaltherapy #lowerbackpain";
const MAX_LINE = 34;
const PLATFORMS: readonly Platform[] = ["tiktok", "instagram", "facebook", "youtube"];
const DAYS = 7;

const BANNED: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bremedy\b/i, "Remedy"],
  [/\bfree\b/i, "free"],
  [/\bcures?\b/i, "cure"],
  [/\bheal(s|ed|ing)?\b/i, "heal"],
  [/\bfix(es|ed)?\b/i, "fix"],
  [/\bguarantee/i, "guarantee"],
  [/\bdiagnos/i, "diagnosis"],
  [/\bsciatica\b/i, "sciatica"],
  [/\bherniat/i, "herniated"],
  [/\blink in bio\b/i, "link in bio"],
  [/\bphysical therapy\b/i, "physical therapy"],
  [/#/, "hashtag"],
  [/\bheating pad\b/i, "heating pad"],
  [/\bice pack\b/i, "ice pack"],
  [/\bbrace\b/i, "brace"],
  [/\bibuprofen\b/i, "ibuprofen"],
  [/\bfoam roller\b/i, "foam roller"],
  [/\bsay less\b/i, "say less"],
];

// ---------- templates ----------

const TemplateSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]{1,24}$/),
    format: z.string().min(1),
    background: z.string().min(1),
    gif: z.object({ file: z.string().min(1), x: z.number(), y: z.number(), width: z.number().positive() }).strict(),
    audio: z.object({ file: z.string().min(1), start: z.number().min(0) }).strict(),
    seconds: z.number().min(3).max(60),
    textY: z.number().int().min(0).max(1800),
    /** Name tags over the characters, centred at x. The first is always the "Me" character. */
    labels: z.array(z.object({ x: z.number().int().min(0).max(1080), y: z.number().int().min(0).max(1860) }).strict()).max(3).optional(),
    scene: z.string().min(10).max(300),
    slot: z.string().min(10).max(400),
    examples: z.array(z.array(z.string().min(1).max(MAX_LINE)).min(1).max(4)).min(1),
    description: z.string().min(1).max(200),
    musicCredit: z.string().min(1).max(200),
  })
  .strict();

type MemeTemplate = z.infer<typeof TemplateSchema>;

export function loadMemeTemplates(): MemeTemplate[] {
  const raw: unknown = JSON.parse(fs.readFileSync(TEMPLATES_FILE, "utf8"));
  return z.object({ templates: z.array(TemplateSchema).min(1) }).strict().parse(raw).templates;
}

// ---------- plan file ----------

const ScheduledSchema = z
  .object({
    accountId: z.string(),
    platform: z.enum(["tiktok", "instagram", "facebook", "youtube"]),
    handle: z.string(),
    keySlot: z.enum(["1", "2", "3", "4"]),
    scheduledFor: z.string(),
    zernioPostId: z.string().default(""),
    status: z.enum(["scheduled", "published", "failed", "cancelled", "skipped"]),
    error: z.string().default(""),
    views: z.number().nullable().default(null),
    likes: z.number().nullable().default(null),
    shares: z.number().nullable().default(null),
    comments: z.number().nullable().default(null),
    metricsAt: z.string().default(""),
  })
  .strict();

const PlanPostSchema = z
  .object({
    specId: z.string(),
    variant: z.string().regex(/^[a-z]$/),
    group: z.string(),
    lines: z.array(z.string()),
    video: z.string(),
    youtubeVideo: z.string().default(""),
    scheduled: z.array(ScheduledSchema),
  })
  .strict();

const PlanDaySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    template: z.string(),
    test: z.string(),
    posts: z.array(PlanPostSchema),
  })
  .strict();

const PlanSchema = z
  .object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    createdAt: z.string(),
    autopost: z.boolean(),
    groups: z.array(z.object({ key: z.string(), handles: z.array(z.string()) }).strict()),
    days: z.array(PlanDaySchema),
  })
  .strict();

export type MemePlan = z.infer<typeof PlanSchema>;
type Scheduled = z.infer<typeof ScheduledSchema>;

function planPath(weekStart: string): string {
  return path.join(WEEKS_DIR, `${weekStart}.json`);
}

function writePlan(plan: MemePlan): void {
  fs.mkdirSync(WEEKS_DIR, { recursive: true });
  fs.writeFileSync(planPath(plan.weekStart), `${JSON.stringify(PlanSchema.parse(plan), null, 2)}\n`, "utf8");
}

export function loadMemePlans(): MemePlan[] {
  if (!fs.existsSync(WEEKS_DIR)) return [];
  return fs
    .readdirSync(WEEKS_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .map((f) => PlanSchema.parse(JSON.parse(fs.readFileSync(path.join(WEEKS_DIR, f), "utf8"))));
}

// ---------- dates ----------

function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseLocal(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(text: string): number {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// ---------- accounts ----------

/** Same brand across platforms collapses to one key: remedy.recoveries, remedyrecoveries, "Remedy Recoveries". */
function groupKey(account: { handle: string }): string {
  return account.handle.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Hand-posted or paused accounts. Memes never go to these. */
function blocked(account: ZernioAccount): boolean {
  if (isCuratedAccount(account) || (account.mapped === "instagram" && groupKey(account) === "remedyrecoveries")) return true;
  // Facebook stays paused. Stories Instagram does not get memes.
  // Stories YouTube gets memes. Slideshows stay off that channel in publish/_cut-cadence.ts.
  if (account.mapped === "facebook") return true;
  if (account.mapped === "instagram" && accountGroup(account) === "2") return true;
  return false;
}

function accountGroups(): Map<string, ZernioAccount[]> {
  const groups = new Map<string, ZernioAccount[]>();
  for (const platform of PLATFORMS) {
    for (const account of accountsFor(platform)) {
      if (blocked(account)) continue;
      const key = groupKey(account);
      groups.set(key, [...(groups.get(key) ?? []), account]);
    }
  }
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(0, 6));
}

// ---------- copy ----------

const VariantSchema = z
  .object({
    lines: z.array(z.string().trim().min(1).max(MAX_LINE)).min(1).max(4),
    /** Only for templates with name tags, one per character, left to right. */
    labels: z.array(z.string().trim().min(1).max(18)).max(3).optional(),
    title: z.string().trim().min(8).max(90),
  })
  .strict();

const WeekCopySchema = z
  .object({
    days: z
      .array(
        z
          .object({
            day: z.number().int().min(1).max(DAYS),
            /** Only in hand-written copy files; the model's copy follows the planned rotation. */
            template: z.string().optional(),
            test: z.string().trim().min(5).max(140),
            variants: z.array(VariantSchema).min(1).max(6),
          })
          .strict(),
      )
      .min(1)
      .max(DAYS),
  })
  .strict();

type WeekCopy = z.infer<typeof WeekCopySchema>;

function copyProblem(
  variant: { lines: readonly string[]; labels?: readonly string[] },
  template: MemeTemplate,
  used: ReadonlySet<string>,
): string | null {
  const text = [...variant.lines, ...(variant.labels ?? [])].join(" ");
  for (const [pattern, name] of BANNED) if (pattern.test(text)) return `says ${name}`;
  const words = variant.lines.join(" ").split(/\s+/).filter(Boolean).length;
  if (words < 4 || words > 24) return `has ${words} words`;
  const want = template.labels?.length ?? 0;
  if ((variant.labels?.length ?? 0) !== want) return want ? `needs ${want} labels` : "has labels this template does not use";
  if (want && variant.labels![0]!.toLowerCase() !== "me") return 'first label must be "Me"';
  if (!/\bback\b/i.test(text)) return "never says back";
  if (/\bmy back (won't|wont|said|says|keeps|told)\b/i.test(text)) return "makes the back talk";
  if (/\b(me and my back|my back and i)\b/i.test(text)) return "makes the back a second person";
  if (used.has(normalize(variant.lines.join(" ")))) return "repeats an earlier line";
  return null;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function usedLines(): Set<string> {
  const out = new Set<string>();
  const walk = (dir: string): void => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".json")) {
        try {
          const spec = JSON.parse(fs.readFileSync(full, "utf8")) as { text?: Array<{ lines?: string[] }> };
          const lines = spec.text?.[0]?.lines ?? [];
          if (lines.length) out.add(normalize(lines.join(" ")));
        } catch {
          // not a spec
        }
      }
    }
  };
  walk(BUILDS_DIR);
  return out;
}

function rotation(templates: MemeTemplate[], count: number, seed: number): MemeTemplate[] {
  const rng = mulberry32(seed);
  const out: MemeTemplate[] = [];
  const uses = new Map<string, number>();
  for (let i = 0; i < count; i++) {
    const prev = out[i - 1]?.id;
    const pool = templates
      .filter((t) => t.id !== prev)
      .sort((a, b) => (uses.get(a.id) ?? 0) - (uses.get(b.id) ?? 0) || rng() - 0.5);
    const coldest = uses.get(pool[0]!.id) ?? 0;
    const cold = pool.filter((t) => (uses.get(t.id) ?? 0) === coldest);
    const pick = cold[Math.floor(rng() * cold.length)]!;
    uses.set(pick.id, (uses.get(pick.id) ?? 0) + 1);
    out.push(pick);
  }
  return out;
}

function copyPrompt(grid: MemeTemplate[][], used: ReadonlySet<string>, avoid: string[]): string {
  const dayBlocks = grid
    .map((slots, i) =>
      [
        `Day ${i + 1}:`,
        ...slots.map((t, j) =>
          [
            `  Post ${String.fromCharCode(97 + j)}: template "${t.id}"`,
            `    Scene: ${t.scene}`,
            `    Slot: ${t.slot}`,
            t.labels?.length
              ? `    Name tags: ${t.labels.length} ("labels"). First is always "Me"; the others are "My back". Do not name a pad, a brace, or a product.`
              : `    Name tags: none (omit "labels").`,
            `    Approved example (do not reuse): ${t.examples.map((e) => e.join(" / ")).join(" | ")}`,
          ].join("\n"),
        ),
      ].join("\n"),
    )
    .join("\n");
  const recent = [...used].slice(-40).join("\n  ");
  return `You write on-screen captions for back-pain meme videos posted to TikTok, Instagram Reels, YouTube Shorts and Facebook.
Each video is a still photo, a famous moving cutout (the GIF), and 2-4 lines of white caption on top. The GIF's motion is the punchline.

Audience: adults 25-60 with nagging back pain from desks, lifting, sleep, kids, chores, the gym.
Keep the viral caption's shape. Same opening, same length, same rhythm. The line has to say "back", or a stranger will not know what it is about. "Why did I laugh so hard" becomes "Why did I throw my back out". Do not turn it into a different joke. The app name stays in the post caption, not on the video.

Both posts on a day use the SAME format, photo, GIF, and sound. Post a is Recoveries. Post b is Stories: different words and a different moment in the same slot, so the two videos are not copies. In "test", name the two moments.

Rules:
- Fill the template's slot exactly in its rhythm. Keep "Doctor:" and "Me:" lines where the slot has them.
- One concrete moment (reaching, standing up, bending, a sneeze, the car, the couch). The person did it. The back did not go with them, talk, or run an errand.
- Each line ${MAX_LINE} characters or fewer. Match the original's line count, 1-4 lines. 4-24 words total. Plain words a person would actually say.
- Funny and relatable, never mean. No medical claims, no promises, no product or app names, no hashtags, no emojis.
- Never use: Remedy, free, cure, heal, fix, guarantee, diagnosis, sciatica, herniated, physical therapy, link in bio.
- "title" is the caption as one natural sentence for the post title (8-90 characters).
- Do not repeat any of these earlier captions:
  ${recent || "(none)"}
${avoid.length ? `- Your last attempt had problems, fix them: ${avoid.join("; ")}` : ""}

${dayBlocks}

Duo name tags stay "Me" and "My back". The caption still follows the viral line. It is not a conversation with the back.

Return JSON: {"days":[{"day":1,"test":"...","variants":[{"lines":["..."],"labels":["Me","My back"],"title":"..."}]}]} with all ${grid.length} days. Each day has exactly ${grid[0]?.length ?? 1} variants, in the same order as that day's posts. Include "labels" only on the variant whose template has name tags.`;
}

async function writeCopy(grid: MemeTemplate[][]): Promise<WeekCopy> {
  const used = usedLines();
  let avoid: string[] = [];
  for (let attempt = 1; attempt <= 4; attempt++) {
    const copy = await generateJson(copyPrompt(grid, used, avoid), WeekCopySchema);
    if (!copy) {
      avoid = ["return valid JSON matching the shape exactly"];
      continue;
    }
    const problems: string[] = [];
    const seen = new Set(used);
    for (let i = 0; i < grid.length; i++) {
      const day = copy.days.find((d) => d.day === i + 1);
      if (!day) {
        problems.push(`day ${i + 1} missing`);
        continue;
      }
      const slots = grid[i]!;
      if (day.variants.length !== slots.length) problems.push(`day ${i + 1} needs ${slots.length} variants`);
      slots.forEach((template, j) => {
        const v = day.variants[j];
        if (!v) return;
        const issue = copyProblem(v, template, seen);
        if (issue) problems.push(`day ${i + 1} ${template.id} "${v.lines.join(" / ")}" ${issue}`);
        seen.add(normalize(v.lines.join(" ")));
      });
    }
    if (problems.length === 0) return copy;
    avoid = problems.slice(0, 8);
    console.warn(`Meme copy attempt ${attempt} rejected: ${avoid.join("; ")}`);
  }
  throw new Error("Could not write meme copy that passes the rules after 4 tries");
}

/** A hand-written week: same shape as the model's copy plus a template per day, held to the same rules. */
function handCopy(file: string, templates: MemeTemplate[], days: number, variants: number): WeekCopy {
  const copy = WeekCopySchema.parse(JSON.parse(fs.readFileSync(path.resolve(ROOT_DIR, file), "utf8")));
  const problems: string[] = [];
  const seen = usedLines();
  if (copy.days.length !== days) problems.push(`needs ${days} days`);
  copy.days.sort((a, b) => a.day - b.day);
  for (const day of copy.days) {
    const template = templates.find((t) => t.id === day.template);
    if (!template) {
      problems.push(`day ${day.day} template "${day.template}" unknown`);
      continue;
    }
    if (day.variants.length !== variants) problems.push(`day ${day.day} needs ${variants} variants`);
    for (const v of day.variants) {
      const issue = copyProblem(v, template, seen);
      if (issue) problems.push(`day ${day.day} "${v.lines.join(" / ")}" ${issue}`);
      seen.add(normalize(v.lines.join(" ")));
    }
  }
  if (problems.length) throw new Error(`Copy file: ${problems.join("; ")}`);
  return copy;
}

// ---------- build ----------

function runPython(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("python", [BUILD_SCRIPT, ...args], {
      cwd: ROOT_DIR,
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });
    let err = "";
    child.stdout.on("data", (d: Buffer) => process.stdout.write(d));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`build.py exited ${code}: ${err.slice(-600)}`))));
  });
}

function specFor(
  id: string,
  base: string,
  template: MemeTemplate,
  lines: string[],
  title: string,
  labels: readonly string[] = [],
  stories = false,
): Record<string, unknown> {
  const tags = (template.labels ?? []).map((pos, i) => ({
    lines: [labels[i] ?? ""],
    x: pos.x,
    y: Math.min(1860, pos.y),
    size: stories ? 46 : 60,
    font: stories ? "black" : "impact",
  }));
  const caption: Record<string, unknown> = {
    lines,
    y: Math.min(1800, template.textY),
    size: stories ? 40 : 64,
    font: stories ? "black" : "impact",
  };
  return {
    id,
    format: template.format,
    variantOf: id === base ? null : base,
    changed: stories ? "cut b" : "cut a",
    background: template.background,
    gif: template.gif,
    audio: template.audio,
    seconds: template.seconds,
    trim: stories ? 0.5 : 0.3,
    zoom: stories ? 1.08 : 1.06,
    pan: stories ? 0.2 : 0.5,
    speed: stories ? 0.94 : 1.05,
    text: [caption, ...tags.filter((t) => t.lines[0])],
    title,
    caption: lines.join(" "),
    description: template.description,
    musicCredit: template.musicCredit,
    results: [],
  };
}

function postContent(lines: readonly string[], youtubeBedUsed: ShortBed | null): string {
  return [lines.join(" "), CTA, HASHTAGS, youtubeBedUsed ? youtubeMusicCredit(youtubeBedUsed) : ""].filter(Boolean).join("\n\n");
}

/** Beds already burned into meme YouTube copies. Slideshow Shorts use the shipping pool instead. */
const MEME_YOUTUBE_BEDS = ["wallpaper", "inspired", "folk-round", "forest-and-trees", "porch-swing", "easy-lemon", "heartwarming"];

function youtubeBed(seed: number): ShortBed | null {
  const byId = new Map(knownBeds().map((bed) => [bed.id, bed]));
  const beds = MEME_YOUTUBE_BEDS.map((id) => byId.get(id)).filter((bed): bed is ShortBed => Boolean(bed && fs.existsSync(bed.file)));
  return beds.length ? beds[seed % beds.length]! : null;
}

// ---------- timing ----------

const PREFERRED = { weekday: [17 * 60 + 30, 21 * 60], weekend: [10 * 60, 13 * 60] } as const;
const FALLBACK = [11 * 60, 21 * 60 + 30] as const;
const SLIDE_GAP_MIN = 45;
const MEME_GAP_MIN = 45;

/**
 * One TikTok time per group, local time: weekday evenings 5:30-9pm, weekend
 * late mornings 10am-1pm. Each is at least 45 min from any slide post and from
 * the other memes that day; if the window is full, the widest gap from
 * 11am-9:30pm wins, then the later meme is pushed until the two are 45 min apart.
 * Groups take turns posting first.
 */
function slotTimes(date: string, groupCount: number, dayIndex: number): Date[] {
  const day = parseLocal(date);
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  const rng = mulberry32(seedOf(`meme-${date}`));
  const dayStart = day.getTime();
  const taken = slideTimes()
    .filter((t) => t >= dayStart - 3 * 3_600_000 && t < dayStart + 27 * 3_600_000)
    .map((t) => (t - dayStart) / 60_000);
  const chosen: number[] = [];
  const distance = (m: number): number => Math.min(...[...taken, ...chosen].map((t) => Math.abs(t - m)), 24 * 60);
  const candidates = (lo: number, hi: number): number[] => {
    const out: number[] = [];
    for (let m = lo; m <= hi; m += 3) out.push(m);
    return out;
  };
  const [lo, hi] = weekend ? PREFERRED.weekend : PREFERRED.weekday;
  for (let g = 0; g < groupCount; g++) {
    const good = candidates(lo, hi).filter(
      (m) => taken.every((t) => Math.abs(t - m) >= SLIDE_GAP_MIN) && chosen.every((c) => Math.abs(c - m) >= MEME_GAP_MIN),
    );
    let pick: number;
    if (good.length) pick = good[Math.floor(rng() * good.length)]!;
    else pick = candidates(FALLBACK[0], FALLBACK[1]).sort((a, b) => distance(b) - distance(a) || a - b)[0]!;
    chosen.push(pick % 5 === 0 ? pick + 1 + Math.floor(rng() * 2) : pick);
  }
  const ordered = [...chosen].sort((a, b) => a - b);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]! - ordered[i - 1]! < MEME_GAP_MIN) ordered[i] = ordered[i - 1]! + MEME_GAP_MIN;
  }
  return ordered.map((_, g) => {
    const m = ordered[(g + dayIndex) % ordered.length]!;
    const at = new Date(day);
    at.setHours(0, m, Math.floor(rng() * 50), 0);
    return at;
  });
}

function slideTimes(): number[] {
  return getDb()
    .select({ at: posts.scheduledAt })
    .from(posts)
    .where(isNotNull(posts.scheduledAt))
    .all()
    .map((r) => Date.parse(r.at ?? ""))
    .filter((n) => Number.isFinite(n));
}

function platformOffsetMs(specId: string, platform: Platform, group = ""): number {
  if (platform === "tiktok") return 0;
  const rng = mulberry32(seedOf(`${specId}-${group}-${platform}`));
  return (4 + Math.floor(rng() * 22)) * 60_000 + Math.floor(rng() * 50) * 1000;
}

// ---------- plan a week ----------

function coveredDates(): Set<string> {
  return new Set(loadMemePlans().flatMap((p) => p.days.map((d) => d.date)));
}

/**
 * Plan, render, and schedule the next 7 uncovered days, starting tomorrow
 * (Sunday-night run) or today (morning catch-up when Sunday was missed).
 * Does nothing when the first day is already covered, unless `force`.
 */
export async function ensureMemeWeek(
  opts: { force?: boolean; now?: Date; from?: "today" | "tomorrow"; copyFile?: string } = {},
): Promise<MemePlan | null> {
  const now = opts.now ?? new Date();
  const covered = coveredDates();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (opts.from === "today" ? 0 : 1));
  if (covered.has(localDate(tomorrow)) && !opts.force) {
    console.log(`Memes: ${localDate(tomorrow)} is already planned.`);
    return null;
  }
  const dates: string[] = [];
  for (let d = 0; dates.length < DAYS && d < 21; d++) {
    const date = localDate(new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate() + d));
    if (!covered.has(date)) dates.push(date);
  }
  const weekStart = dates[0]!;
  if (fs.existsSync(planPath(weekStart)) && !opts.force) {
    console.log(`Memes: plan ${weekStart} already exists.`);
    return null;
  }

  await refreshZernioAccounts().catch((err) => console.warn("Zernio refresh failed:", err instanceof Error ? err.message : err));
  const groups = accountGroups();
  if (groups.size === 0) throw new Error("No Zernio accounts to post memes to.");
  const groupKeys = [...groups.keys()];
  const templates = loadMemeTemplates();
  let daysTemplates: MemeTemplate[] = [];
  let grid: MemeTemplate[][] = [];
  console.log(`Memes: planning ${weekStart}, ${dates.length} days x ${groupKeys.length} formats (${groupKeys.join(", ")}).`);

  let copy: WeekCopy;
  if (opts.copyFile) {
    copy = handCopy(opts.copyFile, templates, dates.length, groupKeys.length);
    daysTemplates = copy.days.map((d) => templates.find((t) => t.id === d.template)!);
  } else {
    const picked = rotation(templates, dates.length, seedOf(weekStart));
    grid = picked.map((t) => Array.from({ length: groupKeys.length }, () => t));
    copy = await writeCopy(grid);
  }
  const weekDir = path.join(BUILDS_DIR, "weekly", weekStart);
  fs.mkdirSync(weekDir, { recursive: true });

  const plan: MemePlan = {
    weekStart,
    createdAt: new Date().toISOString(),
    autopost: env.MEME_AUTOPOST,
    groups: groupKeys.map((key) => ({ key, handles: groups.get(key)!.map((a) => `${a.mapped}:${a.handle}`) })),
    days: [],
  };

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!;
    const day = copy.days.find((d) => d.day === i + 1)!;
    const dayTemplates = opts.copyFile ? [daysTemplates[i]!] : grid[i]!;
    const mmdd = date.slice(5).replace("-", "");
    const times = slotTimes(date, groupKeys.length, i);
    const planDay: MemePlan["days"][number] = { date, template: dayTemplates[0]!.id, test: day.test, posts: [] };
    plan.days.push(planDay);

    for (let g = 0; g < groupKeys.length; g++) {
      const template = opts.copyFile ? daysTemplates[i]! : grid[i]![0]!;
      const stories = groupKeys[g] === "remedystories";
      const variant = stories ? "b" : "a";
      const v = day.variants[0]!;
      const specId = opts.copyFile ? `m${mmdd}-${template.id}-${variant}` : `m${mmdd}-${template.id}${stories ? "-s" : ""}`;
      const specFile = path.join(weekDir, `${specId}.json`);
      const base = opts.copyFile ? `m${mmdd}-${template.id}-a` : `m${mmdd}-${template.id}`;
      fs.writeFileSync(specFile, `${JSON.stringify(specFor(specId, base, template, v.lines, v.title, v.labels, stories), null, 2)}\n`, "utf8");

      await runPython([specFile, "--publish"]);
      const video = path.join(OUTPUT_DIR, `${specId}.mp4`);
      const accounts = groups.get(groupKeys[g]!)!;
      const bed = null;
      const youtubeVideo = video;

      const tiktokAt = times[g]!;
      const scheduled: Scheduled[] = [];
      const uploads = new Map<string, string>();
      for (const account of accounts) {
        const isYoutube = account.mapped === "youtube";
        const file = isYoutube ? youtubeVideo : video;
        const at = new Date(tiktokAt.getTime() + platformOffsetMs(specId, account.mapped, groupKeys[g]!));
        const row: Scheduled = {
          accountId: account.id,
          platform: account.mapped,
          handle: account.handle,
          keySlot: account.keySlot,
          scheduledFor: at.toISOString(),
          zernioPostId: "",
          status: "skipped",
          error: "",
          views: null,
          likes: null,
          shares: null,
          comments: null,
          metricsAt: "",
        };
        if (!file) {
          row.error = "no YouTube render";
        } else if (!plan.autopost) {
          row.error = "MEME_AUTOPOST is false";
        } else if (blocked(account)) {
          row.error = "hand-posted account";
        } else {
          try {
            const key = `${file}|${account.keySlot}`;
            const url = uploads.get(key) ?? (await uploadVideoFile(file, account.keySlot));
            uploads.set(key, url);
            const content = postContent(v.lines, isYoutube ? bed : null);
            const res = await publishToAccount({
              platform: account.mapped,
              accountId: account.id,
              title: v.title,
              caption: content,
              mediaUrls: [url],
              mediaKind: "video",
              mode: "live",
              scheduledAt: row.scheduledFor,
              idempotencyKey: `meme:${specId}:${account.id}`,
            });
            row.zernioPostId = res.zernioPostId;
            row.status = res.status === "failed" ? "failed" : "scheduled";
            row.error = res.error ?? "";
          } catch (err) {
            row.status = "failed";
            row.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
          }
        }
        scheduled.push(row);
        console.log(`  ${date} ${specId} -> ${account.mapped}:${account.handle} ${row.status} ${row.scheduledFor} ${row.error}`);
      }
      planDay.posts.push({ specId, variant, group: groupKeys[g]!, lines: v.lines, video, youtubeVideo, scheduled });
      writePlan(plan);
    }
  }
  writePlan(plan);
  return plan;
}

const FORMAT_SWAPS: ReadonlyArray<{ date: string; group: string; specId: string; lines: string[]; title: string }> = [
  { date: "2026-11-05", group: "remedystories", specId: "m1105-duo-always-together", lines: ["you and your heating pad", "are always together,", "don't you get bored?"], title: "You and your heating pad are always together, don't you get bored?" },
  { date: "2026-11-05", group: "remedyrecoveries", specId: "m1105-duo-getting-ready", lines: ["Me and my back getting", "ready to go out like we", "didn't hear a pop this morning"], title: "Me and my back getting ready to go out like we didn't hear a pop this morning" },
  { date: "2026-11-06", group: "remedyrecoveries", specId: "m1106-duo-barber", lines: ["My back won't stop talking", "about that couch nap.", "Me: say less."], title: "My back won't stop talking about that couch nap. Me: say less." },
  { date: "2026-11-06", group: "remedystories", specId: "m1106-duo-first-shot", lines: ["Me and my back after", "one good night of sleep"], title: "Me and my back after one good night of sleep" },
  { date: "2026-11-07", group: "remedystories", specId: "m1107-duo-reunion", lines: ["Me and my heating pad", "after a full day at the desk"], title: "Me and my heating pad after a full day at the desk" },
  { date: "2026-11-07", group: "remedyrecoveries", specId: "m1107-duo-inside-jokes", lines: ["When my back and I are", "supposed to rest but we", "both go do the laundry"], title: "When my back and I are supposed to rest but we both go do the laundry" },
];

/**
 * Cancel meme posts that have not gone out yet, and put one new format on each
 * remaining Thu-Sat slot. Tonight and Sunday have no new format left, so those
 * repeats are cancelled and not replaced.
 */
export async function swapUpcomingFormats(weekStart: string, now = new Date()): Promise<number> {
  const plan = loadMemePlans().find((p) => p.weekStart === weekStart);
  if (!plan) throw new Error(`No meme plan ${weekStart}`);
  await refreshZernioAccounts().catch((err) => console.warn("Zernio refresh failed:", err instanceof Error ? err.message : err));
  const swaps = new Map(FORMAT_SWAPS.map((s) => [`${s.date}|${s.group}`, s]));
  const cutoff = now.getTime() + 90_000;
  let scheduled = 0;

  for (const day of plan.days) {
    for (const post of day.posts) {
      for (const row of post.scheduled) {
        if (row.status !== "scheduled" || !row.zernioPostId || Date.parse(row.scheduledFor) <= cutoff) continue;
        try {
          await cancelZernioPost(row.zernioPostId, row.keySlot);
          row.status = "cancelled";
          row.error = "replaced: each format posts once";
          console.log(`cancelled ${post.specId} ${row.platform}:${row.handle}`);
        } catch (err) {
          row.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
          console.warn(`cancel failed ${post.specId} ${row.platform}: ${row.error}`);
        }
      }
    }
    const added: MemePlan["days"][number]["posts"] = [];
    for (const post of day.posts) {
      const swap = swaps.get(`${day.date}|${post.group}`);
      if (!swap) continue;
      const slots = post.scheduled.filter((r) => r.error === "replaced: each format posts once");
      if (!slots.length) continue;
      const video = path.join(OUTPUT_DIR, `${swap.specId}.mp4`);
      if (!fs.existsSync(video)) throw new Error(`Missing render ${video}`);
      const uploads = new Map<string, string>();
      const scheduledRows: Scheduled[] = [];
      for (const row of slots) {
        try {
          const key = `${video}|${row.keySlot}`;
          const url = uploads.get(key) ?? (await uploadVideoFile(video, row.keySlot));
          uploads.set(key, url);
          const res = await publishToAccount({
            platform: row.platform,
            accountId: row.accountId,
            title: swap.title,
            caption: postContent(swap.lines, null),
            mediaUrls: [url],
            mediaKind: "video",
            mode: "live",
            scheduledAt: row.scheduledFor,
            idempotencyKey: `meme:${swap.specId}:${row.accountId}`,
          });
          scheduledRows.push({
            ...row,
            zernioPostId: res.zernioPostId,
            status: res.status === "failed" ? "failed" : "scheduled",
            error: res.error ?? "",
          });
          if (res.status !== "failed") scheduled++;
          console.log(`scheduled ${swap.specId} ${row.platform}:${row.handle} ${row.scheduledFor} ${res.status} ${res.error ?? ""}`);
        } catch (err) {
          scheduledRows.push({ ...row, zernioPostId: "", status: "failed", error: (err instanceof Error ? err.message : String(err)).slice(0, 300) });
          console.warn(`schedule failed ${swap.specId} ${row.platform}: ${err instanceof Error ? err.message : err}`);
        }
      }
      added.push({ specId: swap.specId, variant: "a", group: post.group, lines: [...swap.lines], video, youtubeVideo: video, scheduled: scheduledRows });
    }
    if (added.length) {
      day.posts.push(...added);
      day.template = added.map((p) => p.specId.replace(/^m\d+-/, "")).join("+");
      day.test = "One format each: different room, cutout, line, and sound";
    }
    writePlan(plan);
  }
  writePlan(plan);
  return scheduled;
}

const BOTH_ACCOUNTS: ReadonlyArray<{
  date: string;
  recoveriesId: string;
  storiesId: string;
  recoveriesLines: readonly string[];
  storiesLines: readonly string[];
  recoveriesTitle: string;
  storiesTitle: string;
}> = [
  {
    date: "2026-11-05",
    recoveriesId: "m1105-duo-always-together",
    storiesId: "m1105-duo-always-together-s",
    recoveriesLines: ["you and your heating pad", "are always together,", "don't you get bored?"],
    storiesLines: ["how are you and that", "heating pad always", "in the same room?"],
    recoveriesTitle: "You and your heating pad are always together, don't you get bored?",
    storiesTitle: "How are you and that heating pad always in the same room?",
  },
  {
    date: "2026-11-06",
    recoveriesId: "m1105-duo-getting-ready",
    storiesId: "m1105-duo-getting-ready-s",
    recoveriesLines: ["Me and my back getting", "ready to go out like we", "didn't hear a pop this morning"],
    storiesLines: ["Me and my back heading", "out like this morning", "never even happened"],
    recoveriesTitle: "Me and my back getting ready to go out like we didn't hear a pop this morning",
    storiesTitle: "Me and my back heading out like this morning never even happened",
  },
  {
    date: "2026-11-07",
    recoveriesId: "m1106-duo-barber",
    storiesId: "m1106-duo-barber-s",
    recoveriesLines: ["My back won't stop talking", "about that couch nap.", "Me: say less."],
    storiesLines: ["My back brought up", "the couch nap again.", "Me: we're fine."],
    recoveriesTitle: "My back won't stop talking about that couch nap. Me: say less.",
    storiesTitle: "My back brought up the couch nap again. Me: we're fine.",
  },
  {
    date: "2026-11-08",
    recoveriesId: "m1106-duo-first-shot",
    storiesId: "m1106-duo-first-shot-s",
    recoveriesLines: ["Me and my back after", "one good night of sleep"],
    storiesLines: ["Me and my back when", "the night actually worked"],
    recoveriesTitle: "Me and my back after one good night of sleep",
    storiesTitle: "Me and my back when the night actually worked",
  },
  {
    date: "2026-11-09",
    recoveriesId: "m1107-duo-reunion",
    storiesId: "m1107-duo-reunion-s",
    recoveriesLines: ["Me and my heating pad", "after a full day at the desk"],
    storiesLines: ["Me and my heating pad", "back together after work"],
    recoveriesTitle: "Me and my heating pad after a full day at the desk",
    storiesTitle: "Me and my heating pad back together after work",
  },
  {
    date: "2026-11-10",
    recoveriesId: "m1107-duo-inside-jokes",
    storiesId: "m1107-duo-inside-jokes-s",
    recoveriesLines: ["When my back and I are", "supposed to rest but we", "both go do the laundry"],
    storiesLines: ["When my back and I", "were told to rest", "and did the laundry"],
    recoveriesTitle: "When my back and I are supposed to rest but we both go do the laundry",
    storiesTitle: "When my back and I were told to rest and did the laundry",
  },
];

/** Each new format posts to both account groups. Stories uses its own caption file. */
export async function sendFormatsToBoth(weekStart: string, now = new Date()): Promise<number> {
  const plan = loadMemePlans().find((p) => p.weekStart === weekStart);
  if (!plan) throw new Error(`No meme plan ${weekStart}`);
  await refreshZernioAccounts().catch((err) => console.warn("Zernio refresh failed:", err instanceof Error ? err.message : err));
  const groups = accountGroups();
  const groupKeys = [...groups.keys()];
  if (!groupKeys.includes("remedyrecoveries") || !groupKeys.includes("remedystories")) {
    throw new Error(`Need both account groups, have ${groupKeys.join(", ") || "none"}.`);
  }
  const cutoff = now.getTime() + 90_000;
  for (const day of plan.days) {
    for (const post of day.posts) {
      if (!post.specId.includes("-duo-")) continue;
      for (const row of post.scheduled) {
        if (row.status !== "scheduled" || !row.zernioPostId || Date.parse(row.scheduledFor) <= cutoff) continue;
        try {
          await cancelZernioPost(row.zernioPostId, row.keySlot);
          row.status = "cancelled";
          row.error = "moved: both accounts get each meme";
          console.log(`cancelled ${post.specId} ${row.platform}:${row.handle}`);
        } catch (err) {
          row.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
          console.warn(`cancel failed ${post.specId} ${row.platform}: ${row.error}`);
        }
      }
    }
  }

  let scheduled = 0;
  for (let i = 0; i < BOTH_ACCOUNTS.length; i++) {
    const item = BOTH_ACCOUNTS[i]!;
    const times = slotTimes(item.date, groupKeys.length, i);
    let day = plan.days.find((d) => d.date === item.date);
    if (!day) {
      day = { date: item.date, template: item.recoveriesId.replace(/^m\d+-/, ""), test: "Same meme on both accounts. Stories text is the copyright cut.", posts: [] };
      plan.days.push(day);
    } else {
      day.template = item.recoveriesId.replace(/^m\d+-/, "");
      day.test = "Same meme on both accounts. Stories text is the copyright cut.";
    }
    for (let g = 0; g < groupKeys.length; g++) {
      const stories = groupKeys[g] === "remedystories";
      const specId = stories ? item.storiesId : item.recoveriesId;
      const lines = stories ? item.storiesLines : item.recoveriesLines;
      const title = stories ? item.storiesTitle : item.recoveriesTitle;
      const video = path.join(OUTPUT_DIR, `${specId}.mp4`);
      if (!fs.existsSync(video)) throw new Error(`Missing render ${video}`);
      const tiktokAt = times[g]!;
      const uploads = new Map<string, string>();
      const rows: Scheduled[] = [];
      for (const account of groups.get(groupKeys[g]!)!) {
        const at = new Date(tiktokAt.getTime() + platformOffsetMs(specId, account.mapped, groupKeys[g]!));
        try {
          const key = `${video}|${account.keySlot}`;
          const url = uploads.get(key) ?? (await uploadVideoFile(video, account.keySlot));
          uploads.set(key, url);
          const res = await publishToAccount({
            platform: account.mapped,
            accountId: account.id,
            title,
            caption: postContent(lines, null),
            mediaUrls: [url],
            mediaKind: "video",
            mode: "live",
            scheduledAt: at.toISOString(),
            idempotencyKey: `meme:${specId}:${account.id}:both`,
          });
          rows.push({
            accountId: account.id,
            platform: account.mapped,
            handle: account.handle,
            keySlot: account.keySlot,
            scheduledFor: at.toISOString(),
            zernioPostId: res.zernioPostId,
            status: res.status === "failed" ? "failed" : "scheduled",
            error: res.error ?? "",
            views: null,
            likes: null,
            shares: null,
            comments: null,
            metricsAt: "",
          });
          if (res.status !== "failed") scheduled++;
          console.log(`scheduled ${specId} ${account.mapped}:${account.handle} ${at.toISOString()} ${res.status} ${res.error ?? ""}`);
        } catch (err) {
          console.warn(`schedule failed ${specId} ${account.mapped}: ${err instanceof Error ? err.message : err}`);
        }
      }
      day.posts.push({ specId, variant: stories ? "b" : "a", group: groupKeys[g]!, lines: [...lines], video, youtubeVideo: video, scheduled: rows });
    }
    writePlan(plan);
  }
  writePlan(plan);
  return scheduled;
}

/** Swap the video and line on posts already scheduled for this meme. Times stay. */
export async function replaceClipOnSchedule(specId: string, lines: readonly string[], title: string): Promise<number> {
  const video = path.join(OUTPUT_DIR, `${specId}.mp4`);
  if (!fs.existsSync(video)) throw new Error(`Missing render ${video}`);
  const uploads = new Map<string, string>();
  let replaced = 0;
  for (const plan of loadMemePlans()) {
    for (const day of plan.days) {
      for (const post of day.posts) {
        if (post.specId !== specId) continue;
        post.lines = [...lines];
        post.video = video;
        post.youtubeVideo = video;
        for (const row of post.scheduled) {
          if (row.status !== "scheduled" || !row.zernioPostId) continue;
          const key = `${video}|${row.keySlot}`;
          const url = uploads.get(key) ?? (await uploadVideoFile(video, row.keySlot));
          uploads.set(key, url);
          await replaceZernioPost(row.zernioPostId, row.keySlot, {
            title,
            content: postContent(lines, null),
            mediaItems: [{ type: "video", url }],
            scheduledFor: row.scheduledFor,
          });
          replaced++;
          console.log(`updated ${specId} ${row.platform}:${row.handle}`);
        }
      }
    }
    writePlan(plan);
  }
  return replaced;
}

/** Post cut A and cut B to TikTok once, one brand each, so we can see if the auto check lets them through. */
export async function postTikTokCutsOnce(now = new Date()): Promise<number> {
  const lines = ["Why did I throw my back out"];
  const title = "Why did I throw my back out";
  const cuts = [
    { specId: "pizza-cut-a", group: "remedyrecoveries", variant: "a" },
    { specId: "pizza-cut-b", group: "remedystories", variant: "b" },
  ] as const;
  await refreshZernioAccounts().catch((err) => console.warn("Zernio refresh failed:", err instanceof Error ? err.message : err));
  const groups = accountGroups();
  const plan = loadMemePlans().find((p) => p.days.some((d) => d.date === localDate(now))) ?? null;
  let posted = 0;
  for (const cut of cuts) {
    const video = path.join(OUTPUT_DIR, `${cut.specId}.mp4`);
    if (!fs.existsSync(video)) throw new Error(`Missing render ${video}`);
    const account = (groups.get(cut.group) ?? []).find((a) => a.mapped === "tiktok");
    if (!account) throw new Error(`No TikTok account for ${cut.group}. Have ${[...groups.keys()].join(", ") || "none"}.`);
    const url = await uploadVideoFile(video, account.keySlot);
    const res = await publishToAccount({
      platform: "tiktok",
      accountId: account.id,
      title,
      caption: postContent(lines, null),
      mediaUrls: [url],
      mediaKind: "video",
      mode: "live",
      scheduledAt: null,
      idempotencyKey: `meme:${cut.specId}:${account.id}:probe`,
    });
    const status = res.status === "failed" ? "failed" : res.status === "published" ? "published" : "scheduled";
    console.log(`posted ${cut.specId} tiktok:${account.handle} ${res.status} ${res.error ?? ""}`);
    if (status !== "failed") posted++;
    const day = plan?.days.find((d) => d.date === localDate(now));
    day?.posts.push({
      specId: cut.specId,
      variant: cut.variant,
      group: cut.group,
      lines: [...lines],
      video,
      youtubeVideo: video,
      scheduled: [{
        accountId: account.id,
        platform: "tiktok",
        handle: account.handle,
        keySlot: account.keySlot,
        scheduledFor: now.toISOString(),
        zernioPostId: res.zernioPostId,
        status,
        error: res.error ?? "",
        views: null,
        likes: null,
        shares: null,
        comments: null,
        metricsAt: "",
      }],
    });
  }
  if (plan) writePlan(plan);
  return posted;
}

/** Recoveries gets cut A, Stories gets cut B. The same file is never sent to both. */
function cutIdFor(specId: string, stories: boolean): string {
  const sibling = (from: string, to: string) => (specId.endsWith(from) ? `${specId.slice(0, -from.length)}${to}` : "");
  const candidates = stories
    ? [sibling("-a", "-b"), specId.includes("cut-a") ? specId.replace("cut-a", "cut-b") : "", specId.endsWith("-s") ? specId : `${specId}-s`, `${specId}-b`]
    : [sibling("-b", "-a"), specId.includes("cut-b") ? specId.replace("cut-b", "cut-a") : "", specId.endsWith("-s") ? specId.slice(0, -2) : specId];
  const seen = new Set<string>();
  for (const id of candidates) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (fs.existsSync(path.join(OUTPUT_DIR, `${id}.mp4`))) return id;
  }
  throw new Error(
    stories
      ? `Stories needs its own cut of ${specId}. Render Cut B before scheduling both accounts.`
      : `Recoveries needs its own cut of ${specId}. Render Cut A before scheduling both accounts.`,
  );
}

/** Put one meme on TikTok and YouTube for both brands, each with its own cut and time. */
export async function scheduleClipDay(date: string, specId: string, lines: readonly string[], title: string): Promise<number> {
  const recoveriesId = cutIdFor(specId, false);
  const storiesId = cutIdFor(specId, true);
  if (recoveriesId === storiesId) throw new Error(`Cut A and Cut B resolved to the same file (${recoveriesId}).`);
  await refreshZernioAccounts().catch((err) => console.warn("Zernio refresh failed:", err instanceof Error ? err.message : err));
  const groups = accountGroups();
  const groupKeys = [...groups.keys()];
  if (!groupKeys.includes("remedyrecoveries") || !groupKeys.includes("remedystories")) {
    throw new Error(`Need both account groups, have ${groupKeys.join(", ") || "none"}.`);
  }
  const plan = loadMemePlans().find((p) => p.days.some((d) => d.date === date));
  const times = slotTimes(date, groupKeys.length, 0);
  let scheduled = 0;
  const posts: MemePlan["days"][number]["posts"] = [];
  for (let g = 0; g < groupKeys.length; g++) {
    const stories = groupKeys[g] === "remedystories";
    const cutId = stories ? storiesId : recoveriesId;
    const video = path.join(OUTPUT_DIR, `${cutId}.mp4`);
    const tiktokAt = times[g]!;
    const uploads = new Map<string, string>();
    const rows: Scheduled[] = [];
    for (const account of groups.get(groupKeys[g]!)!) {
      if (account.mapped !== "tiktok" && account.mapped !== "youtube") continue;
      const at = new Date(tiktokAt.getTime() + platformOffsetMs(cutId, account.mapped, groupKeys[g]!));
      try {
        const key = `${video}|${account.keySlot}`;
        const url = uploads.get(key) ?? (await uploadVideoFile(video, account.keySlot));
        uploads.set(key, url);
        const res = await publishToAccount({
          platform: account.mapped,
          accountId: account.id,
          title,
          caption: postContent(lines, null),
          mediaUrls: [url],
          mediaKind: "video",
          mode: "live",
          scheduledAt: at.toISOString(),
          idempotencyKey: `meme:${cutId}:${account.id}:clip`,
        });
        rows.push({
          accountId: account.id,
          platform: account.mapped,
          handle: account.handle,
          keySlot: account.keySlot,
          scheduledFor: at.toISOString(),
          zernioPostId: res.zernioPostId,
          status: res.status === "failed" ? "failed" : "scheduled",
          error: res.error ?? "",
          views: null,
          likes: null,
          shares: null,
          comments: null,
          metricsAt: "",
        });
        if (res.status !== "failed") scheduled++;
        console.log(`scheduled ${cutId} ${account.mapped}:${account.handle} ${at.toISOString()} ${res.status} ${res.error ?? ""}`);
      } catch (err) {
        console.warn(`schedule failed ${cutId} ${account.mapped}:${account.handle}: ${err instanceof Error ? err.message : err}`);
      }
    }
    posts.push({ specId: cutId, variant: stories ? "b" : "a", group: groupKeys[g]!, lines: [...lines], video, youtubeVideo: video, scheduled: rows });
  }
  if (plan) {
    let day = plan.days.find((d) => d.date === date);
    if (!day) {
      day = { date, template: specId, test: "One clip. The line is the moment, the video is the reaction.", posts: [] };
      plan.days.push(day);
    } else {
      day.template = specId;
      day.test = "One clip. The line is the moment, the video is the reaction.";
    }
    day.posts.push(...posts);
    writePlan(plan);
  }
  return scheduled;
}

/** Move a planned week onto fresh slot times (after slides change). Posts already out are left alone. */
export async function retimeMemeWeek(weekStart: string, now = new Date()): Promise<number> {
  const plan = loadMemePlans().find((p) => p.weekStart === weekStart);
  if (!plan) throw new Error(`No meme plan ${weekStart}`);
  const keys = plan.groups.map((g) => g.key);
  let moved = 0;
  for (let i = 0; i < plan.days.length; i++) {
    const day = plan.days[i]!;
    const times = slotTimes(day.date, keys.length, i);
    for (const post of day.posts) {
      const tiktokAt = times[keys.indexOf(post.group)];
      if (!tiktokAt) continue;
      for (const row of post.scheduled) {
        const at = new Date(tiktokAt.getTime() + platformOffsetMs(post.specId, row.platform, post.group));
        if (at.getTime() < now.getTime() + 5 * 60_000 || Date.parse(row.scheduledFor) < now.getTime() + 5 * 60_000) continue;
        if (row.status === "scheduled" && row.zernioPostId) {
          await updateZernioScheduledAt(row.zernioPostId, at.toISOString(), row.keySlot as ZernioKeySlot);
          moved++;
        }
        if (row.status === "scheduled" || row.status === "failed") row.scheduledFor = at.toISOString();
      }
    }
  }
  writePlan(plan);
  return moved;
}

/** Point a week's scheduled YouTube posts at the original-sound video (or back to the CC copy). */
export async function setYoutubeSound(weekStart: string, original: boolean, now = new Date()): Promise<number> {
  const plan = loadMemePlans().find((p) => p.weekStart === weekStart);
  if (!plan) throw new Error(`No meme plan ${weekStart}`);
  let changed = 0;
  for (const day of plan.days) {
    for (const post of day.posts) {
      for (const row of post.scheduled) {
        if (row.platform !== "youtube" || row.status !== "scheduled" || !row.zernioPostId) continue;
        if (Date.parse(row.scheduledFor) < now.getTime() + 10 * 60_000) continue;
        const ccFile = path.join(OUTPUT_DIR, `${post.specId}-yt.mp4`);
        const file = original ? post.video : ccFile;
        if (!fs.existsSync(file)) continue;
        const url = await uploadVideoFile(file, row.keySlot as ZernioKeySlot);
        await replaceZernioPost(row.zernioPostId, row.keySlot as ZernioKeySlot, {
          title: specTitle(plan.weekStart, post.specId),
          content: postContent(post.lines, original ? null : youtubeBed(seedOf(post.specId))),
          mediaItems: [{ type: "video", url }],
          scheduledFor: row.scheduledFor,
        });
        post.youtubeVideo = file;
        changed++;
      }
    }
  }
  writePlan(plan);
  return changed;
}

function specTitle(weekStart: string, specId: string): string {
  const file = path.join(BUILDS_DIR, "weekly", weekStart, `${specId}.json`);
  const spec = JSON.parse(fs.readFileSync(file, "utf8")) as { title?: string };
  return spec.title ?? "";
}

/** Retry posts that never reached Zernio (network blips) while their slot is still ahead. */
async function retryFailed(plan: MemePlan, now: Date): Promise<number> {
  let fixed = 0;
  const accounts = new Map(PLATFORMS.flatMap((p) => accountsFor(p)).map((a) => [a.id, a]));
  for (const day of plan.days) {
    for (const post of day.posts) {
      for (const row of post.scheduled) {
        if (row.status !== "failed" || row.zernioPostId) continue;
        if (Date.parse(row.scheduledFor) < now.getTime() + 15 * 60_000) continue;
        const account = accounts.get(row.accountId);
        if (!account || blocked(account)) continue;
        const isYoutube = row.platform === "youtube";
        const file = isYoutube ? post.youtubeVideo : post.video;
        if (!file || !fs.existsSync(file)) continue;
        try {
          const url = await uploadVideoFile(file, account.keySlot);
          const res = await publishToAccount({
            platform: account.mapped,
            accountId: account.id,
            title: specTitle(plan.weekStart, post.specId),
            caption: postContent(post.lines, isYoutube && file !== post.video ? youtubeBed(seedOf(post.specId)) : null),
            mediaUrls: [url],
            mediaKind: "video",
            mode: "live",
            scheduledAt: row.scheduledFor,
            idempotencyKey: `meme:${post.specId}:${account.id}`,
          });
          row.zernioPostId = res.zernioPostId;
          row.status = res.status === "failed" ? "failed" : "scheduled";
          row.error = res.error ?? "";
          if (row.status === "scheduled") fixed++;
        } catch (err) {
          row.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
        }
      }
    }
  }
  return fixed;
}

/** Draft a week of captions without rendering or scheduling anything. */
export async function previewMemeCopy(variants = 2): Promise<string> {
  const templates = loadMemeTemplates();
  const picked = rotation(templates, DAYS, seedOf(new Date().toISOString().slice(0, 10)));
  const grid = picked.map((t) => Array.from({ length: variants }, () => t));
  const copy = await writeCopy(grid);
  return copy.days
    .map((d) => {
      const slots = grid[d.day - 1]!;
      return [`Day ${d.day} — ${d.test}`, ...d.variants.map((v, i) => `  ${slots[i]?.id ?? "?"}: ${v.lines.join(" / ")}`)].join("\n");
    })
    .join("\n");
}

// ---------- daily sync ----------

const ReviewSchema = z.object({ items: z.array(z.object({ id: z.string(), status: z.string() }).passthrough()) }).passthrough();

async function rejectedIds(): Promise<Set<string>> {
  const text = await downloadText("growth/memes.json").catch(() => null);
  if (!text) return new Set();
  const parsed = ReviewSchema.safeParse(JSON.parse(text));
  if (!parsed.success) return new Set();
  return new Set(parsed.data.items.filter((i) => i.status === "rejected").map((i) => i.id));
}

/** Cancel rejected memes and any meme still queued for Instagram @remedy.stories, then pull views. */
export async function syncMemes(now = new Date()): Promise<{ cancelled: number; measured: number }> {
  const plans = loadMemePlans();
  if (plans.length === 0) return { cancelled: 0, measured: 0 };
  const rejected = await rejectedIds();
  let cancelled = 0;
  let measured = 0;
  for (const plan of plans) {
    let dirty = (await retryFailed(plan, now)) > 0;
    for (const day of plan.days) {
      for (const post of day.posts) {
        for (const row of post.scheduled) {
          if (!row.zernioPostId || row.status === "cancelled" || row.status === "skipped") continue;
          const slot = row.keySlot as ZernioKeySlot;
          const due = Date.parse(row.scheduledFor);
          const storiesInstagram = row.platform === "instagram" && accountGroup({ handle: row.handle }) === "2";
          if ((rejected.has(post.specId) || storiesInstagram) && row.status === "scheduled" && due > now.getTime() + 2 * 60_000) {
            try {
              await cancelZernioPost(row.zernioPostId, slot);
              row.status = "cancelled";
              if (storiesInstagram) row.error = "Stories Instagram does not get memes";
              cancelled++;
              dirty = true;
            } catch (err) {
              row.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
            }
            continue;
          }
          if (due > now.getTime() - 60 * 60_000) continue;
          try {
            if (row.status === "scheduled") {
              const live = await fetchZernioPost(row.zernioPostId, slot);
              const child = live.platforms[0];
              const s = (child?.status ?? live.status ?? "").toLowerCase();
              if (s === "published") row.status = "published";
              else if (s === "failed") {
                row.status = "failed";
                row.error = String(child?.errorMessage ?? "failed").slice(0, 300);
              }
              dirty = true;
            }
            const ageDays = (now.getTime() - due) / 86_400_000;
            if (row.status === "published" && ageDays <= 14) {
              const m = await fetchPostAnalytics(row.zernioPostId, slot);
              if (m) {
                row.views = m.views;
                row.likes = m.likes;
                row.shares = m.shares;
                row.comments = m.comments;
                row.metricsAt = now.toISOString();
                measured++;
                dirty = true;
              }
            }
          } catch (err) {
            row.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
            dirty = true;
          }
        }
      }
    }
    if (dirty) writePlan(plan);
  }
  return { cancelled, measured };
}

/**
 * A/B readout. Each account's views are divided by that account's median meme
 * views, so a bigger account does not win every test.
 */
export function memeResults(): string {
  const plans = loadMemePlans();
  const byAccount = new Map<string, number[]>();
  for (const plan of plans)
    for (const day of plan.days)
      for (const post of day.posts)
        for (const row of post.scheduled)
          if (row.views !== null) byAccount.set(row.accountId, [...(byAccount.get(row.accountId) ?? []), row.views]);
  const median = (xs: number[]): number => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)]! || 1 : 1;
  };
  const out: string[] = [];
  for (const plan of plans) {
    for (const day of plan.days) {
      out.push(`${day.date} ${day.template} — ${day.test}`);
      for (const post of day.posts) {
        const rows = post.scheduled.filter((r) => r.views !== null);
        const views = rows.reduce((a, r) => a + (r.views ?? 0), 0);
        const lift = rows.length
          ? rows.reduce((a, r) => a + (r.views ?? 0) / median(byAccount.get(r.accountId) ?? []), 0) / rows.length
          : null;
        const status = post.scheduled.map((r) => `${r.platform}:${r.status}`).join(" ");
        out.push(
          `  ${post.variant} [${post.group}] ${post.lines.join(" / ")}\n     views ${views}  vs-account-median ${lift === null ? "-" : lift.toFixed(2)}  ${status}`,
        );
      }
    }
  }
  return out.join("\n");
}
