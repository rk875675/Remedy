import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "../config.js";
import {
  MEME_CAPTION,
  MEME_H,
  MEME_REACTION,
  MEME_SECONDS,
  MEME_W,
  planMemeReel,
  type MemeRenderPlan,
} from "./meme.js";
import {
  MEME_CAPTIONS,
  MEME_MUSIC,
  MEME_REACTIONS,
  MEME_TONES,
  MEME_WALLPAPERS,
  isMemeTone,
  type MemeCaption,
  type MemeMusicSlot,
  type MemeReaction,
  type MemeTone,
  type MemeWallpaper,
} from "./meme-catalog.js";
import { knownBeds, youtubeMusicCredit, type ShortBed } from "./short.js";

export const MEME_WALLPAPER_DIR = path.join(ROOT_DIR, "assets", "memes", "wallpapers");
export const MEME_REACTION_DIR = path.join(ROOT_DIR, "assets", "memes", "reactions");

export interface MixRequest {
  seed?: number;
  query?: string;
  situation?: string;
  tone?: MemeTone;
  captionId?: string;
  wallpaperId?: string;
  reactionId?: string;
  musicId?: string;
  excludeCaptionIds?: readonly string[];
}

export interface MemeMix {
  id: string;
  plan: MemeRenderPlan;
  captionId: string;
  situation: string;
  tone: MemeTone;
  wallpaperId: string;
  reactionId: string;
  musicId: string;
  musicTitle: string;
  musicCredit: string;
  wallpaperLook: string;
  reactionLook: string;
  ready: { wallpaper: boolean; reaction: boolean; music: boolean };
  missing: string[];
  matched: string[];
}

export interface MemePartHit {
  id: string;
  label: string;
  score: number;
}

export interface MemePartSearch {
  captions: MemePartHit[];
  wallpapers: MemePartHit[];
  reactions: MemePartHit[];
  music: MemePartHit[];
}

const STOP = new Set([
  "the",
  "and",
  "you",
  "your",
  "for",
  "it",
  "its",
  "is",
  "to",
  "of",
  "that",
  "a",
  "an",
  "on",
  "in",
  "with",
  "my",
  "was",
  "this",
  "are",
  "be",
  "at",
  "from",
  "just",
  "not",
  "but",
  "did",
  "had",
  "have",
  "been",
  "then",
  "than",
]);

function lcg(seed: number): number {
  return (Math.imul(seed >>> 0, 1664525) + 1013904223) >>> 0;
}

function shuffle<T>(arr: readonly T[], seed: number): T[] {
  const copy = [...arr];
  let m = copy.length;
  let s = seed >>> 0;
  while (m > 0) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const i = s % m;
    m -= 1;
    const swap = copy[m]!;
    copy[m] = copy[i]!;
    copy[i] = swap;
  }
  return copy;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function tokens(query: string): string[] {
  return normalize(query)
    .split(" ")
    .filter((word) => word.length > 2 && !STOP.has(word));
}

function wordsOf(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter(Boolean));
}

/** Whole word, or a short suffix on a 4+ letter token (hurt/hurts). */
function tokenHits(words: Set<string>, token: string): boolean {
  if (words.has(token)) return true;
  if (token.length < 4) return false;
  for (const word of words) {
    if (word.startsWith(token) && word.length <= token.length + 3) return true;
  }
  return false;
}

function scoreText(
  blobSource: string,
  tags: readonly string[],
  id: string,
  query: string,
  toks: readonly string[],
): { score: number; matched: string[]; all: boolean } {
  const words = wordsOf(blobSource);
  const phrase = normalize(query);
  const idParts = id.split("-");
  const matched: string[] = [];
  let score = 0;
  for (const token of toks) {
    const named = id === token || tags.includes(token);
    if (!named && !tokenHits(words, token)) continue;
    score += named ? 6 : 2;
    if (idParts.includes(token)) score += 3;
    matched.push(token);
  }
  if (phrase.length > 3 && normalize(blobSource).includes(phrase)) score += 8;
  const all = toks.every((token) => namedToken(token, tags, id, idParts, words));
  return { score, matched, all };
}

function namedToken(token: string, tags: readonly string[], id: string, idParts: string[], words: Set<string>): boolean {
  return id === token || tags.includes(token) || idParts.includes(token) || tokenHits(words, token);
}

function mustFind<T extends { id: string }>(rows: readonly T[], id: string, label: string): T {
  const row = rows.find((item) => item.id === id);
  if (!row) {
    const names = rows.map((item) => item.id).join(", ");
    throw new Error(`Unknown ${label} "${id}". Known: ${names}`);
  }
  return row;
}

function sharedTones(groups: readonly (readonly MemeTone[])[]): MemeTone[] {
  const first = groups[0];
  if (!first) return [];
  return first.filter((tone) => groups.every((group) => group.includes(tone)));
}

function matchesNeedle(caption: MemeCaption, needle: string): boolean {
  const n = needle.toLowerCase();
  return caption.id === n || caption.situation === n || caption.tags.includes(n) || (isMemeTone(n) && caption.tones.includes(n));
}

function situationExamples(): string {
  return [...new Set(MEME_CAPTIONS.map((caption) => caption.situation))].sort().slice(0, 12).join(", ");
}

function poolFor<T extends { tones: readonly MemeTone[] }>(items: readonly T[], tone: MemeTone): T[] {
  return items.filter((item) => item.tones.includes(tone));
}

function takePartner<T extends { id: string }>(
  items: readonly T[],
  used: Map<string, number>,
  seed: number,
  label: string,
): T {
  if (items.length === 0) throw new Error(`No ${label}`);
  const cold = Math.min(...items.map((item) => used.get(item.id) ?? 0));
  const pool = items.filter((item) => (used.get(item.id) ?? 0) === cold);
  return pool[lcg(seed) % pool.length]!;
}

function bedFor(id: string): ShortBed {
  const bed = knownBeds().find((item) => item.id === id);
  if (!bed) throw new Error(`Unknown music bed ${id}`);
  return bed;
}

function buildMix(
  caption: MemeCaption,
  tone: MemeTone,
  wallpaper: MemeWallpaper,
  reaction: MemeReaction,
  music: MemeMusicSlot,
  matched: string[],
): MemeMix {
  const plan = planMemeReel({
    wallpaperFile: wallpaper.file,
    reactionFile: reaction.file,
    musicId: music.id,
    lines: caption.lines,
  });
  const bed = bedFor(music.id);
  const wallpaperPath = path.join(MEME_WALLPAPER_DIR, wallpaper.file);
  const reactionPath = path.join(MEME_REACTION_DIR, reaction.file);
  const wallpaperReady = fs.existsSync(wallpaperPath);
  const reactionReady = fs.existsSync(reactionPath);
  const musicReady = fs.existsSync(bed.file);
  const missing = [
    wallpaperReady ? "" : wallpaperPath,
    reactionReady ? "" : reactionPath,
    musicReady ? "" : bed.file,
  ].filter((item) => item.length > 0);
  return {
    id: `${caption.id}+${wallpaper.id}+${reaction.id}+${music.id}`,
    plan,
    captionId: caption.id,
    situation: caption.situation,
    tone,
    wallpaperId: wallpaper.id,
    reactionId: reaction.id,
    musicId: music.id,
    musicTitle: bed.title,
    musicCredit: musicReady ? youtubeMusicCredit(bed) : "",
    wallpaperLook: wallpaper.look,
    reactionLook: reaction.look,
    ready: { wallpaper: wallpaperReady, reaction: reactionReady, music: musicReady },
    missing,
    matched,
  };
}

function toneFor(
  caption: MemeCaption,
  req: MixRequest,
  pinTones: readonly MemeTone[] | null,
  salt: number,
): MemeTone | null {
  let choices = caption.tones.filter((tone) => !pinTones || pinTones.includes(tone));
  if (req.tone) choices = choices.filter((tone) => tone === req.tone);
  if (choices.length === 0) return null;
  const named = tokens(req.query ?? "").find((token): token is MemeTone => isMemeTone(token) && choices.includes(token));
  if (named) return named;
  return choices[lcg(salt) % choices.length] ?? null;
}

/**
 * Build up to `count` memes. Pins force that part. A query ranks captions.
 * With no query, the seed shuffles the catalog so a batch does not repeat.
 */
export function mixMemes(count: number, req: MixRequest = {}): MemeMix[] {
  if (!Number.isInteger(count) || count < 1 || count > 48) throw new Error("Meme count must be 1-48");
  const seed = req.seed ?? 1;
  const wallpaper = req.wallpaperId ? mustFind(MEME_WALLPAPERS, req.wallpaperId, "wallpaper") : undefined;
  const reaction = req.reactionId ? mustFind(MEME_REACTIONS, req.reactionId, "reaction") : undefined;
  const music = req.musicId ? mustFind(MEME_MUSIC, req.musicId, "music") : undefined;
  const pinned = [wallpaper, reaction, music].filter((item): item is MemeWallpaper | MemeReaction | MemeMusicSlot => Boolean(item));

  let pinTones: MemeTone[] | null = null;
  if (pinned.length > 0) {
    pinTones = sharedTones(pinned.map((item) => item.tones));
    if (pinTones.length === 0) {
      const detail = pinned.map((item) => `${item.id} (${item.tones.join(", ")})`).join("; ");
      throw new Error(`Those parts do not share a tone: ${detail}`);
    }
    if (req.tone && !pinTones.includes(req.tone)) throw new Error(`Tone ${req.tone} is not shared by the pinned parts`);
  }

  let captions = [...MEME_CAPTIONS];
  if (req.captionId) captions = [mustFind(MEME_CAPTIONS, req.captionId, "caption")];
  if (req.situation) {
    const next = captions.filter((caption) => matchesNeedle(caption, req.situation ?? ""));
    if (next.length === 0) throw new Error(`No caption matches "${req.situation}". Try: ${situationExamples()}`);
    captions = next;
  }
  if (req.tone) {
    const tone = req.tone;
    const next = captions.filter((caption) => caption.tones.includes(tone));
    if (next.length === 0) {
      throw new Error(
        req.captionId ? `Caption ${req.captionId} does not use tone ${req.tone}` : `No caption uses tone ${req.tone}`,
      );
    }
    captions = next;
  }
  if (pinTones) {
    const tones = pinTones;
    const next = captions.filter((caption) => caption.tones.some((tone) => tones.includes(tone)));
    if (next.length === 0) throw new Error("No caption shares a tone with those parts");
    captions = next;
  }
  if (req.excludeCaptionIds && req.excludeCaptionIds.length > 0) {
    const exclude = new Set(req.excludeCaptionIds);
    captions = captions.filter((caption) => !exclude.has(caption.id));
    if (captions.length === 0) throw new Error("No caption left to mix");
  }

  const query = req.query?.trim() ?? "";
  let ranked: Array<{ caption: MemeCaption; matched: string[] }>;
  if (query) {
    const toks = tokens(query);
    const scored = captions.map((caption) => {
      const blob = [caption.id, caption.situation, ...caption.tones, ...caption.tags, ...caption.lines].join(" ");
      const hit = scoreText(blob, [...caption.tags, caption.situation, caption.id], caption.id, query, toks);
      return { caption, ...hit };
    });
    const positive = scored.filter((row) => row.score > 0);
    const strict = positive.filter((row) => row.all);
    ranked = (strict.length > 0 ? strict : positive)
      .sort((a, b) => b.score - a.score || a.caption.id.localeCompare(b.caption.id))
      .map((row) => ({ caption: row.caption, matched: row.matched }));
  } else {
    ranked = shuffle(captions, seed).map((caption) => ({ caption, matched: [] }));
  }

  const wallUsed = new Map<string, number>();
  const reactUsed = new Map<string, number>();
  const musicUsed = new Map<string, number>();
  const out: MemeMix[] = [];
  for (let i = 0; i < ranked.length && out.length < count; i += 1) {
    const row = ranked[i];
    if (!row) break;
    const tone = toneFor(row.caption, req, pinTones, seed + i + 1);
    if (!tone) continue;
    const pickedWall = wallpaper ?? takePartner(poolFor(MEME_WALLPAPERS, tone), wallUsed, seed + i * 3 + 1, `wallpaper (${tone})`);
    const pickedReact = reaction ?? takePartner(poolFor(MEME_REACTIONS, tone), reactUsed, seed + i * 5 + 1, `reaction (${tone})`);
    const pickedMusic = music ?? takePartner(poolFor(MEME_MUSIC, tone), musicUsed, seed + i * 7 + 1, `music (${tone})`);
    if (!pickedWall.tones.includes(tone) || !pickedReact.tones.includes(tone) || !pickedMusic.tones.includes(tone)) {
      throw new Error(`Pinned part does not fit tone ${tone}`);
    }
    wallUsed.set(pickedWall.id, (wallUsed.get(pickedWall.id) ?? 0) + 1);
    reactUsed.set(pickedReact.id, (reactUsed.get(pickedReact.id) ?? 0) + 1);
    musicUsed.set(pickedMusic.id, (musicUsed.get(pickedMusic.id) ?? 0) + 1);
    out.push(buildMix(row.caption, tone, pickedWall, pickedReact, pickedMusic, row.matched));
  }
  return out;
}

export function findMemes(query: string, opts?: { limit?: number; seed?: number }): MemeMix[] {
  const q = query.trim();
  if (!q) throw new Error("Say what to find");
  return mixMemes(opts?.limit ?? 8, { seed: opts?.seed ?? 1, query: q });
}

export function searchMemeParts(query: string): MemePartSearch {
  const q = query.trim();
  if (!q) throw new Error("Say what to find");
  const toks = tokens(q);
  const take = (hits: Array<MemePartHit & { all: boolean }>): MemePartHit[] => {
    const positive = hits.filter((hit) => hit.score > 0);
    const strict = positive.filter((hit) => hit.all);
    return (strict.length > 0 ? strict : positive)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, 5)
      .map(({ id, label, score }) => ({ id, label, score }));
  };

  const captions = take(
    MEME_CAPTIONS.map((caption) => {
      const blob = [caption.id, caption.situation, ...caption.tones, ...caption.tags, ...caption.lines].join(" ");
      const scored = scoreText(blob, [...caption.tags, caption.situation, caption.id], caption.id, q, toks);
      return { id: caption.id, label: caption.lines.join(" / "), score: scored.score, all: scored.all };
    }),
  );
  const wallpapers = take(
    MEME_WALLPAPERS.map((item) => {
      const blob = [item.id, item.look, ...item.tones, ...item.tags].join(" ");
      const scored = scoreText(blob, [...item.tags, item.id], item.id, q, toks);
      return { id: item.id, label: item.look, score: scored.score, all: scored.all };
    }),
  );
  const reactions = take(
    MEME_REACTIONS.map((item) => {
      const blob = [item.id, item.look, ...item.tones, ...item.tags].join(" ");
      const scored = scoreText(blob, [...item.tags, item.id], item.id, q, toks);
      return { id: item.id, label: item.look, score: scored.score, all: scored.all };
    }),
  );
  const music = take(
    MEME_MUSIC.map((slot) => {
      const bed = bedFor(slot.id);
      const blob = [slot.id, bed.title, bed.mood, ...slot.tones].join(" ");
      const scored = scoreText(blob, [slot.id, ...slot.tones, bed.mood], slot.id, q, toks);
      return { id: slot.id, label: `${bed.title} (${bed.mood})`, score: scored.score, all: scored.all };
    }),
  );
  return { captions, wallpapers, reactions, music };
}

export function formatMemeMix(mix: MemeMix, mode: "short" | "full"): string {
  const head = `${mix.captionId} | ${mix.tone} | ${mix.situation}`;
  const lines = mix.plan.lines.map((line) => `  ${line}`);
  if (mode === "short") {
    const matched = mix.matched.length > 0 ? [`  matched: ${mix.matched.join(", ")}`] : [];
    return [head, ...lines, `  ${mix.plan.wallpaperFile} | ${mix.plan.reactionFile} | ${mix.musicId}`, ...matched].join("\n");
  }
  const wall = mix.ready.wallpaper ? "on disk" : `missing — ${mix.wallpaperLook}`;
  const react = mix.ready.reaction ? "on disk" : `missing — ${mix.reactionLook}`;
  const music = mix.ready.music ? mix.musicTitle : "file not on disk";
  const extra = [
    `  wallpaper ${mix.plan.wallpaperFile} | ${wall}`,
    `  reaction ${mix.plan.reactionFile} | ${react}`,
    `  music ${mix.musicId} | ${music}`,
  ];
  if (mix.musicCredit) extra.push(`  ${mix.musicCredit}`);
  return [head, ...lines, ...extra].join("\n");
}

export function formatMemeCatalog(): string {
  const wallReady = MEME_WALLPAPERS.filter((item) => fs.existsSync(path.join(MEME_WALLPAPER_DIR, item.file))).length;
  const reactReady = MEME_REACTIONS.filter((item) => fs.existsSync(path.join(MEME_REACTION_DIR, item.file))).length;
  const musicReady = MEME_MUSIC.filter((slot) => fs.existsSync(bedFor(slot.id).file)).length;
  const situations = [...new Set(MEME_CAPTIONS.map((caption) => caption.situation))].sort();
  return [
    `Frame ${MEME_W}x${MEME_H}, ${MEME_SECONDS}s. Caption starts ${Math.round(MEME_CAPTION.topPct * 100)}% down. Reaction is ${Math.round(MEME_REACTION.widthPct * 100)}% wide and starts halfway down.`,
    `${MEME_CAPTIONS.length} captions, ${MEME_WALLPAPERS.length} wallpapers, ${MEME_REACTIONS.length} reactions, ${MEME_MUSIC.length} music beds.`,
    `On disk: wallpapers ${wallReady}/${MEME_WALLPAPERS.length}, reactions ${reactReady}/${MEME_REACTIONS.length}, music ${musicReady}/${MEME_MUSIC.length}.`,
    `Drop wallpapers in ${MEME_WALLPAPER_DIR}`,
    `Drop reactions in ${MEME_REACTION_DIR}`,
    `Situations: ${situations.join(", ")}`,
    `Tones: ${MEME_TONES.join(", ")}`,
  ].join("\n");
}

export function formatMissingMemeAssets(): string {
  const walls = MEME_WALLPAPERS.filter((item) => !fs.existsSync(path.join(MEME_WALLPAPER_DIR, item.file)));
  const reacts = MEME_REACTIONS.filter((item) => !fs.existsSync(path.join(MEME_REACTION_DIR, item.file)));
  const music = MEME_MUSIC.filter((slot) => !fs.existsSync(bedFor(slot.id).file));
  if (walls.length === 0 && reacts.length === 0 && music.length === 0) {
    return "Wallpaper, reaction, and music files are all on disk.";
  }
  const lines: string[] = [];
  if (walls.length > 0) {
    lines.push(`Wallpapers (${walls.length}) — ${MEME_WALLPAPER_DIR}`);
    for (const item of walls) lines.push(`  ${item.file} — ${item.look}`);
  }
  if (reacts.length > 0) {
    lines.push(`Reactions (${reacts.length}) — ${MEME_REACTION_DIR}`);
    for (const item of reacts) lines.push(`  ${item.file} — ${item.look}`);
  }
  if (music.length > 0) {
    lines.push("Music");
    for (const slot of music) lines.push(`  ${slot.id} — ${bedFor(slot.id).file}`);
  }
  return lines.join("\n");
}

export function formatMemeParts(found: MemePartSearch): string {
  const blocks: string[] = [];
  const write = (title: string, hits: MemePartHit[]): void => {
    if (hits.length === 0) return;
    blocks.push(title);
    for (const hit of hits) blocks.push(`  ${hit.id}  ${hit.label}`);
  };
  write("Captions", found.captions);
  write("Wallpapers", found.wallpapers);
  write("Reactions", found.reactions);
  write("Music", found.music);
  return blocks.length > 0 ? blocks.join("\n") : "No part matched.";
}

function problemMessage(err: unknown): string {
  return err instanceof Error ? err.message : "mix failed";
}

/** Pairing, search, and frame checks. Empty means the catalog can mix. */
export function auditMemeCatalog(): string[] {
  const problems: string[] = [];

  for (const tone of MEME_TONES) {
    if (!MEME_WALLPAPERS.some((item) => item.tones.includes(tone))) problems.push(`No wallpaper for ${tone}`);
    if (!MEME_REACTIONS.some((item) => item.tones.includes(tone))) problems.push(`No reaction for ${tone}`);
    if (!MEME_MUSIC.some((item) => item.tones.includes(tone))) problems.push(`No music for ${tone}`);
    if (!MEME_CAPTIONS.some((item) => item.tones.includes(tone))) problems.push(`No caption for ${tone}`);
  }

  try {
    const all = mixMemes(MEME_CAPTIONS.length, { seed: 1 });
    if (all.length !== MEME_CAPTIONS.length) problems.push(`Expected ${MEME_CAPTIONS.length} mixes, got ${all.length}`);
    const ids = new Set(all.map((mix) => mix.captionId));
    if (ids.size !== all.length) problems.push("Batch repeated a caption");
    for (const mix of all) {
      if (mix.plan.width !== MEME_W || mix.plan.seconds !== MEME_SECONDS) problems.push(`${mix.captionId} left the locked frame`);
      if (!mix.plan.lines.length) problems.push(`${mix.captionId} has no lines`);
    }
  } catch (err) {
    problems.push(problemMessage(err));
  }

  for (const item of MEME_WALLPAPERS) {
    try {
      const mix = mixMemes(1, { seed: 1, wallpaperId: item.id });
      if (mix[0]?.wallpaperId !== item.id) problems.push(`Could not pin wallpaper ${item.id}`);
    } catch (err) {
      problems.push(`wallpaper ${item.id}: ${problemMessage(err)}`);
    }
  }
  for (const item of MEME_REACTIONS) {
    try {
      const mix = mixMemes(1, { seed: 1, reactionId: item.id });
      if (mix[0]?.reactionId !== item.id) problems.push(`Could not pin reaction ${item.id}`);
    } catch (err) {
      problems.push(`reaction ${item.id}: ${problemMessage(err)}`);
    }
  }
  for (const item of MEME_MUSIC) {
    try {
      const mix = mixMemes(1, { seed: 3, musicId: item.id });
      if (mix[0]?.musicId !== item.id) problems.push(`Could not pin music ${item.id}`);
      const onDisk = fs.existsSync(bedFor(item.id).file);
      if (mix[0] && mix[0].ready.music !== onDisk) problems.push(`Music ready flag wrong for ${item.id}`);
    } catch (err) {
      problems.push(`music ${item.id}: ${problemMessage(err)}`);
    }
  }

  try {
    mixMemes(1, { seed: 1, wallpaperId: "office-flat", reactionId: "wince" });
    problems.push("office-flat and wince should not share a tone");
  } catch (err) {
    if (!problemMessage(err).includes("do not share a tone")) problems.push(`Unexpected pair error: ${problemMessage(err)}`);
  }

  try {
    const mix = mixMemes(1, { seed: 1, wallpaperId: "office-flat", reactionId: "side-eye" });
    if (mix[0]?.wallpaperId !== "office-flat" || mix[0]?.reactionId !== "side-eye") {
      problems.push("office-flat and side-eye should mix");
    }
  } catch (err) {
    problems.push(`office-flat + side-eye: ${problemMessage(err)}`);
  }

  const expectFirst = (query: string, captionId: string): void => {
    const hits = findMemes(query, { limit: 3, seed: 1 });
    if (hits[0]?.captionId !== captionId) {
      problems.push(`find "${query}" got ${hits[0]?.captionId ?? "nothing"}, expected ${captionId}`);
    }
  };
  expectFirst("heating pad", "heat-quiet");
  expectFirst("getting out of bed", "bed-edge");
  const bedHits = findMemes("getting out of bed", { limit: 8, seed: 1 });
  if (bedHits.some((hit) => hit.captionId === "cream-on" || hit.captionId === "dinner-laugh")) {
    problems.push("bed search matched a caption that does not say bed");
  }
  expectFirst("standing desk", "standing-desk");
  expectFirst("massage gun", "gun-after");
  expectFirst("seatbelt", "seatbelt");
  expectFirst("high shelf", "high-shelf");
  if (findMemes("zzzzqqq", { limit: 3, seed: 1 }).length !== 0) problems.push("Nonsense query should miss");

  const morning = searchMemeParts("morning");
  if (!morning.captions.some((hit) => hit.id === "bed-edge") && !morning.captions.some((hit) => hit.id === "same-morning")) {
    problems.push("parts search missed morning captions");
  }
  if (!morning.wallpapers.some((hit) => hit.id === "morning-soft")) problems.push("parts search missed morning-soft");

  return problems;
}
