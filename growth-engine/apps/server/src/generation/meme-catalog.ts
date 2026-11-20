import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { ROOT_DIR } from "../config.js";
import { memeCaptionIssue } from "./meme.js";
import { knownBeds } from "./short.js";

/**
 * Owned wallpaper-meme parts. The rows live in assets/memes/catalog.json
 * so the dashboard library and the mixer read the same file.
 * Captions are original. Wallpapers are CC0 photos in assets/memes/wallpapers
 * (see sources.json). Reaction GIFs have to be CC0 or another license we can
 * name there. side-eye.gif is the CC0 eye-roll. The other reaction slots are
 * still empty. Music ids are the CC beds in short.ts.
 */

export const MEME_TONES = [
  "wince",
  "denial",
  "caught",
  "recognize",
  "gave-up",
  "fake-fine",
  "tired",
  "embarrassed",
] as const;

export const MemeToneSchema = z.enum(MEME_TONES);
export type MemeTone = z.infer<typeof MemeToneSchema>;

const idSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40);
const tagSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(24);

const CaptionSchema = z
  .object({
    id: idSchema,
    situation: tagSchema,
    tones: z.array(MemeToneSchema).min(1).max(2),
    tags: z.array(tagSchema).min(1).max(8),
    lines: z.array(z.string().trim().min(1).max(42)).min(2).max(4),
  })
  .strict();

const WallpaperSchema = z
  .object({
    id: idSchema,
    file: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.jpg$/),
    tones: z.array(MemeToneSchema).min(1).max(3),
    tags: z.array(tagSchema).min(1).max(8),
    look: z.string().trim().min(12).max(160),
  })
  .strict();

const ReactionSchema = z
  .object({
    id: idSchema,
    file: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*\.gif$/),
    tones: z.array(MemeToneSchema).min(1).max(3),
    tags: z.array(tagSchema).min(1).max(8),
    look: z.string().trim().min(12).max(160),
  })
  .strict();

const MusicSchema = z
  .object({
    id: idSchema,
    title: z.string().trim().min(1).max(80),
    mood: z.enum(["piano", "ambient", "folk", "pastoral", "warm"]),
    tones: z.array(MemeToneSchema).min(1).max(3),
  })
  .strict();

export type MemeCaption = z.infer<typeof CaptionSchema>;
export type MemeWallpaper = z.infer<typeof WallpaperSchema>;
export type MemeReaction = z.infer<typeof ReactionSchema>;
export type MemeMusicSlot = z.infer<typeof MusicSchema>;

const BANNED: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bfree\b/i, "free"],
  [/\bcures?\b/i, "cure"],
  [/\bdiagnos/i, "diagnosis"],
  [/\bsciatica\b/i, "sciatica"],
  [/\bherniat/i, "herniated"],
  [/\blisten up\b/i, "listen up"],
  [/\bwatch this\b/i, "watch this"],
  [/\blink in bio\b/i, "link in bio"],
  [/\bphysical therapy\b/i, "physical therapy"],
  [/\bremedy\b/i, "Remedy"],
];

export const MEME_CATALOG_FILE = path.join(ROOT_DIR, "assets", "memes", "catalog.json");

function uniqueIds<T extends { id: string }>(rows: T[], label: string, problems: string[]): void {
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) problems.push(`Duplicate ${label} id ${row.id}`);
    seen.add(row.id);
  }
}

function uniqueList(values: readonly string[], label: string, problems: string[]): void {
  if (new Set(values).size !== values.length) problems.push(`Duplicate ${label}`);
}

function parseCatalog(): {
  captions: MemeCaption[];
  wallpapers: MemeWallpaper[];
  reactions: MemeReaction[];
  music: MemeMusicSlot[];
} {
  const problems: string[] = [];
  const raw: unknown = JSON.parse(fs.readFileSync(MEME_CATALOG_FILE, "utf8"));
  const file = z
    .object({
      captions: z.array(CaptionSchema).min(24),
      wallpapers: z.array(WallpaperSchema).min(6),
      reactions: z.array(ReactionSchema).min(6),
      music: z.array(MusicSchema).min(8),
    })
    .strict()
    .parse(raw);
  const { captions, wallpapers, reactions, music } = file;

  uniqueIds(captions, "caption", problems);
  uniqueIds(wallpapers, "wallpaper", problems);
  uniqueIds(reactions, "reaction", problems);
  uniqueIds(music, "music", problems);

  const firstLines = new Set<string>();
  for (const caption of captions) {
    uniqueList(caption.tags, `${caption.id} tags`, problems);
    uniqueList(caption.tones, `${caption.id} tones`, problems);
    const issue = memeCaptionIssue(caption.lines);
    if (issue) problems.push(`${caption.id}: ${issue}`);
    const first = caption.lines[0] ?? "";
    if (firstLines.has(first)) problems.push(`Duplicate first line: ${first}`);
    firstLines.add(first);
    const text = caption.lines.join(" ");
    for (const [pattern, name] of BANNED) {
      if (pattern.test(text)) problems.push(`${caption.id} says ${name}`);
    }
  }

  for (const wallpaper of wallpapers) {
    if (wallpaper.file !== `${wallpaper.id}.jpg`) problems.push(`${wallpaper.id} file must be ${wallpaper.id}.jpg`);
    uniqueList(wallpaper.tags, `${wallpaper.id} tags`, problems);
  }
  for (const reaction of reactions) {
    if (reaction.file !== `${reaction.id}.gif`) problems.push(`${reaction.id} file must be ${reaction.id}.gif`);
    uniqueList(reaction.tags, `${reaction.id} tags`, problems);
  }

  const beds = new Map(knownBeds().map((bed) => [bed.id, bed]));
  for (const slot of music) {
    const bed = beds.get(slot.id);
    if (!bed) problems.push(`Music ${slot.id} is not a CC bed`);
    else {
      if (bed.title !== slot.title) problems.push(`Music ${slot.id} title must be ${bed.title}`);
      if (bed.mood !== slot.mood) problems.push(`Music ${slot.id} mood must be ${bed.mood}`);
    }
    uniqueList(slot.tones, `${slot.id} tones`, problems);
  }

  if (problems.length > 0) throw new Error(`Meme catalog\n${problems.join("\n")}`);
  return { captions, wallpapers, reactions, music };
}

const parsed = parseCatalog();

export const MEME_CAPTIONS: readonly MemeCaption[] = parsed.captions;
export const MEME_WALLPAPERS: readonly MemeWallpaper[] = parsed.wallpapers;
export const MEME_REACTIONS: readonly MemeReaction[] = parsed.reactions;
export const MEME_MUSIC: readonly MemeMusicSlot[] = parsed.music;

export function isMemeTone(value: string): value is MemeTone {
  return (MEME_TONES as readonly string[]).includes(value);
}
