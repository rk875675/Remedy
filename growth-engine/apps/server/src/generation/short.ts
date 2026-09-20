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
}

const BEDS: Array<Omit<ShortBed, "file"> & { file: string }> = [
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

/** Diversity-first pick: cold mood, then cold track, then rating weights. */
export function pickShortBed(opts?: {
  exclude?: string[];
  shipped?: Map<string, number>;
  weights?: Record<string, number>;
}): ShortBed {
  const beds = listBeds();
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

export function bedForPost(postId: number, preferredId?: string): ShortBed {
  const resolved = resolveBed(preferredId);
  if (resolved) return resolved;
  const beds = listBeds();
  if (beds.length === 0) throw new Error("No YouTube beds in assets/audio/");
  return beds[postId % beds.length]!;
}

export function youtubeMusicCredit(bed: ShortBed): string {
  if (bed.id === SILENT_BED_ID) return "";
  return `Music: "${bed.title}" by ${bed.artist} (incompetech.com) — CC BY 4.0`;
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
 * Turn carousel JPGs into a vertical Short with no audio so you can add
 * a catalog track when you post. Skips ffmpeg when the same slides were
 * already rendered silent.
 */
export async function renderSlideshowShort(
  slidePaths: string[],
  outPath: string,
  _postId: number,
  _preferredBedId?: string,
): Promise<{ file: string; bed: ShortBed; durationSec: number; reused: boolean }> {
  if (slidePaths.length < 2) throw new Error("Need at least 2 slides for a Short");
  const bed = SILENT_BED;
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
  await runFfmpeg([
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-t",
    String(durationSec),
    "-vf",
    vf,
    "-an",
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
