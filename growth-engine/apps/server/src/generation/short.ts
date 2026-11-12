import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { BRAND, ROOT_DIR } from "../config.js";

/** YouTube Shorts canvas. Carousel slides are 4:5; we letterbox them here. */
export const SHORT_W = 1080;
export const SHORT_H = 1920;
const SECONDS_PER_SLIDE = 2.2;
const AUDIO_DIR = path.join(ROOT_DIR, "assets", "audio");

export type BedMood = "piano" | "ambient" | "folk" | "pastoral" | "warm";

export interface ShortBed {
  id: string;
  file: string;
  title: string;
  artist: string;
  mood: BedMood;
  /** Default Shorts pool. Legacy beds omit this and only play when a post already names them. */
  upbeat?: boolean;
}

const BEDS: Array<Omit<ShortBed, "file"> & { file: string }> = [
  { id: "monkeys-spinning-monkeys", file: "monkeys-spinning-monkeys.m4a", title: "Monkeys Spinning Monkeys", artist: "Kevin MacLeod", mood: "folk", upbeat: true },
  { id: "electrodoodle", file: "electrodoodle.m4a", title: "Electrodoodle", artist: "Kevin MacLeod", mood: "ambient", upbeat: true },
  { id: "sneaky-snitch", file: "sneaky-snitch.m4a", title: "Sneaky Snitch", artist: "Kevin MacLeod", mood: "folk", upbeat: true },
  { id: "fluffing-a-duck", file: "fluffing-a-duck.m4a", title: "Fluffing a Duck", artist: "Kevin MacLeod", mood: "folk", upbeat: true },
  { id: "cipher", file: "cipher.m4a", title: "Cipher", artist: "Kevin MacLeod", mood: "ambient", upbeat: true },
  { id: "carefree", file: "carefree.m4a", title: "Carefree", artist: "Kevin MacLeod", mood: "pastoral", upbeat: true },
  { id: "life-of-riley", file: "life-of-riley.m4a", title: "Life of Riley", artist: "Kevin MacLeod", mood: "pastoral", upbeat: true },
  { id: "scheming-weasel", file: "scheming-weasel.m4a", title: "Scheming Weasel (faster version)", artist: "Kevin MacLeod", mood: "piano", upbeat: true },
  { id: "pixel-peeker", file: "pixel-peeker.m4a", title: "Pixel Peeker Polka - faster", artist: "Kevin MacLeod", mood: "folk", upbeat: true },
  { id: "who-likes-to-party", file: "who-likes-to-party.m4a", title: "Who Likes to Party", artist: "Kevin MacLeod", mood: "warm", upbeat: true },
  { id: "hyperfun", file: "hyperfun.m4a", title: "Hyperfun", artist: "Kevin MacLeod", mood: "warm", upbeat: true },
  { id: "local-forecast", file: "local-forecast.m4a", title: "Local Forecast", artist: "Kevin MacLeod", mood: "ambient", upbeat: true },
  { id: "bossa-antigua", file: "bossa-antigua.m4a", title: "Bossa Antigua", artist: "Kevin MacLeod", mood: "pastoral", upbeat: true },
  { id: "investigations", file: "investigations.m4a", title: "Investigations", artist: "Kevin MacLeod", mood: "piano", upbeat: true },
  { id: "show-must-be-go", file: "show-must-be-go.m4a", title: "The Show Must Be Go", artist: "Kevin MacLeod", mood: "warm", upbeat: true },
  { id: "quirky-dog", file: "quirky-dog.m4a", title: "Quirky Dog", artist: "Kevin MacLeod", mood: "folk", upbeat: true },
  { id: "bit-quest", file: "bit-quest.m4a", title: "Bit Quest", artist: "Kevin MacLeod", mood: "ambient", upbeat: true },
  { id: "meditation-01", file: "meditation-01.m4a", title: "Meditation Impromptu 01", artist: "Kevin MacLeod", mood: "piano" },
  { id: "meditation-02", file: "meditation-02.m4a", title: "Meditation Impromptu 02", artist: "Kevin MacLeod", mood: "piano" },
  { id: "frost-waltz", file: "frost-waltz.m4a", title: "Frost Waltz", artist: "Kevin MacLeod", mood: "piano" },
  { id: "dreamy-flashback", file: "dreamy-flashback.m4a", title: "Dreamy Flashback", artist: "Kevin MacLeod", mood: "ambient" },
  { id: "wallpaper", file: "wallpaper.m4a", title: "Wallpaper", artist: "Kevin MacLeod", mood: "ambient" },
  { id: "mellowtron", file: "mellowtron.m4a", title: "Mellowtron", artist: "Kevin MacLeod", mood: "ambient" },
  { id: "inspired", file: "inspired.m4a", title: "Inspired", artist: "Kevin MacLeod", mood: "ambient" },
  { id: "folk-round", file: "folk-round.m4a", title: "Folk Round", artist: "Kevin MacLeod", mood: "folk" },
  { id: "forest-and-trees", file: "forest-and-trees.m4a", title: "The Forest and the Trees", artist: "Kevin MacLeod", mood: "folk" },
  { id: "porch-swing", file: "porch-swing.m4a", title: "Porch Swing Days", artist: "Kevin MacLeod", mood: "folk" },
  { id: "easy-lemon", file: "easy-lemon.m4a", title: "Easy Lemon", artist: "Kevin MacLeod", mood: "folk" },
  { id: "enchanted-valley", file: "enchanted-valley.m4a", title: "Enchanted Valley", artist: "Kevin MacLeod", mood: "pastoral" },
  { id: "teller-of-the-tales", file: "teller-of-the-tales.m4a", title: "Teller of the Tales", artist: "Kevin MacLeod", mood: "pastoral" },
  { id: "heartwarming", file: "heartwarming.m4a", title: "Heartwarming", artist: "Kevin MacLeod", mood: "warm" },
  { id: "deliberate-thought", file: "deliberate-thought.m4a", title: "Deliberate Thought", artist: "Kevin MacLeod", mood: "warm" },
];

function withAbs(bed: (typeof BEDS)[number]): ShortBed {
  return { ...bed, file: path.join(AUDIO_DIR, bed.file) };
}

export function listBeds(): ShortBed[] {
  return BEDS.filter((b) => fs.existsSync(path.join(AUDIO_DIR, b.file))).map(withAbs);
}

/** Every CC bed we ship, even if the file is not on disk yet. */
export function knownBeds(): ShortBed[] {
  return BEDS.map(withAbs);
}

export const SILENT_BED_ID = "silent";

export const SILENT_BED: ShortBed = {
  id: SILENT_BED_ID,
  file: "",
  title: "No sound",
  artist: "",
  mood: "ambient",
};

export function resolveBed(id: string | undefined): ShortBed | null {
  if (!id || id === SILENT_BED_ID || id === "none") return SILENT_BED;
  const beds = listBeds();
  return beds.find((b) => b.id === id) ?? null;
}

/** Diversity-first pick from the shipping pool: cold mood, then cold track, then rating weights. */
export function pickShortBed(opts?: {
  exclude?: string[];
  shipped?: Map<string, number>;
  weights?: Record<string, number>;
}): ShortBed {
  const shipping = listBeds().filter((b) => b.upbeat);
  const beds = shipping.length ? shipping : listBeds();
  if (beds.length === 0) throw new Error("No YouTube beds in assets/audio/");
  const exclude = new Set(opts?.exclude ?? []);
  const pool = beds.filter((b) => !exclude.has(b.id));
  const candidates = pool.length ? pool : beds;
  const shipped = opts?.shipped ?? new Map<string, number>();
  const weights = opts?.weights ?? {};

  const moodShipped = new Map<BedMood, number>();
  for (const b of candidates) {
    moodShipped.set(b.mood, (moodShipped.get(b.mood) ?? 0) + (shipped.get(b.id) ?? 0));
  }
  const coldestMood = [...moodShipped.entries()].sort((a, b) => a[1] - b[1])[0]?.[0];
  const moodPool = coldestMood ? candidates.filter((b) => b.mood === coldestMood) : candidates;
  const ranked = [...moodPool].sort((a, b) => {
    const sa = shipped.get(a.id) ?? 0;
    const sb = shipped.get(b.id) ?? 0;
    if (sa !== sb) return sa - sb;
    return (weights[b.id] ?? 50) - (weights[a.id] ?? 50);
  });
  const top = ranked.slice(0, Math.min(3, ranked.length));
  return top[Math.floor(Math.random() * top.length)] ?? candidates[0]!;
}

/** Real silence only when a post asks for "none". Unset and the old "silent" default get an upbeat bed. */
export const NO_MUSIC_BED_ID = "none";

function shortBedFor(postId: number, preferredId?: string): ShortBed {
  if (preferredId === NO_MUSIC_BED_ID) return SILENT_BED;
  const beds = listBeds();
  const chosen = preferredId && preferredId !== SILENT_BED_ID ? beds.find((b) => b.id === preferredId) : undefined;
  if (chosen) return chosen;
  const upbeat = beds.filter((b) => b.upbeat);
  const pool = upbeat.length ? upbeat : beds;
  return pool.length ? pool[Math.abs(postId) % pool.length]! : SILENT_BED;
}

/** Dashboard label for the bed a post's Short will actually use. */
export function shortBedLabel(postId: number, preferredId?: string): string {
  const bed = shortBedFor(postId, preferredId);
  return bed.id === SILENT_BED_ID ? "No sound" : `${bed.title} (${bed.mood})`;
}

export function bedForPost(postId: number, preferredId?: string): ShortBed {
  const resolved = resolveBed(preferredId);
  if (resolved) return resolved;
  const beds = listBeds();
  if (beds.length === 0) throw new Error("No YouTube beds in assets/audio/");
  return beds[postId % beds.length]!;
}

export function youtubeMusicCredit(bed: ShortBed): string {
  if (bed.id === SILENT_BED_ID) return "";
  return `Music: "${bed.title}" by ${bed.artist} (incompetech.com), Licensed under Creative Commons: By Attribution 4.0 https://creativecommons.org/licenses/by/4.0/`;
}

export function shortOutputPath(postDir: string): string {
  return path.join(postDir, "short.mp4");
}

export function shortObjectKey(postId: number): string {
  return `growth/posts/${postId}/short.mp4`;
}

function metaPath(outPath: string): string {
  return `${outPath}.meta.json`;
}

function slideSignature(slidePaths: string[], bedId: string): string {
  const parts = slidePaths.map((p) => {
    try {
      const st = fs.statSync(p);
      return `${path.basename(p)}:${st.size}:${st.mtimeMs}`;
    } catch {
      return path.basename(p);
    }
  });
  return `${bedId}|${parts.join(",")}`;
}

function ffmpegBin(): string {
  return "ffmpeg";
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegBin(), args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("error", (e) => {
      reject(new Error(`ffmpeg missing or failed to start: ${e.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-500)}`));
    });
  });
}

function concatEscape(filePath: string): string {
  return path.resolve(filePath).replace(/\\/g, "/").replace(/'/g, "'\\''");
}

/**
 * Turn carousel JPGs into a vertical Short with a CC music bed (faded in
 * and out). Skips ffmpeg when the same slides and bed were already rendered.
 */
export async function renderSlideshowShort(
  slidePaths: string[],
  outPath: string,
  postId: number,
  preferredBedId?: string,
): Promise<{ file: string; bed: ShortBed; durationSec: number; reused: boolean }> {
  if (slidePaths.length < 2) throw new Error("Need at least 2 slides for a Short");
  const bed = shortBedFor(postId, preferredBedId);
  const sig = slideSignature(slidePaths, bed.id);
  const metaFile = metaPath(outPath);
  if (fs.existsSync(outPath) && fs.existsSync(metaFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(metaFile, "utf8")) as { sig?: string };
      if (prev.sig === sig) {
        return { file: outPath, bed, durationSec: 0, reused: true };
      }
    } catch {
      // rerender
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const listPath = `${outPath}.concat.txt`;
  const lines: string[] = [];
  for (const slide of slidePaths) {
    lines.push(`file '${concatEscape(slide)}'`);
    lines.push(`duration ${SECONDS_PER_SLIDE}`);
  }
  lines.push(`file '${concatEscape(slidePaths[slidePaths.length - 1]!)}'`);
  fs.writeFileSync(listPath, `${lines.join("\n")}\n`, "utf8");

  const durationSec = Math.round(slidePaths.length * SECONDS_PER_SLIDE * 10) / 10;
  const pad = BRAND.colors.dark.replace("#", "");
  const vf = `scale=${SHORT_W}:${SHORT_H}:force_original_aspect_ratio=decrease,pad=${SHORT_W}:${SHORT_H}:(ow-iw)/2:(oh-ih)/2:color=0x${pad},fps=30,format=yuv420p`;
  const fadeOut = Math.max(0, durationSec - 1.2);
  const audioArgs = bed.file
    ? [
        "-map",
        "0:v",
        "-map",
        "1:a",
        "-af",
        `afade=t=in:d=0.3,afade=t=out:st=${fadeOut}:d=1.2`,
        "-c:a",
        "aac",
        "-b:a",
        "160k",
      ]
    : ["-an"];
  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    ...(bed.file ? ["-i", bed.file] : []),
    "-t",
    String(durationSec),
    "-vf",
    vf,
    ...audioArgs,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "23",
    "-movflags",
    "+faststart",
    outPath,
  ]);
  try {
    fs.unlinkSync(listPath);
  } catch {
    // ignore
  }
  fs.writeFileSync(metaFile, JSON.stringify({ sig, bed: bed.id }), "utf8");
  return { file: outPath, bed, durationSec, reused: false };
}
