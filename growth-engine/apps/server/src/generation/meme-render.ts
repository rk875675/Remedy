import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT_DIR } from "../config.js";
import { MEME_CAPTION, MEME_FPS, MEME_H, MEME_REACTION, MEME_SECONDS, MEME_W } from "./meme.js";
import { MEME_REACTION_DIR, MEME_WALLPAPER_DIR, type MemeMix } from "./meme-mix.js";
import { knownBeds } from "./short.js";

const FONT_CANDIDATES = [
  "C:/Windows/Fonts/arialbd.ttf",
  "C:/Windows/Fonts/Arial.ttf",
  "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
  "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
];

function fontFile(): string {
  const found = FONT_CANDIDATES.find((file) => fs.existsSync(file));
  if (!found) throw new Error("No caption font found (Arial or DejaVu Sans Bold)");
  return found;
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%")
    .replace(/,/g, "\\,")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]");
}

function fontForFilter(file: string): string {
  return file.replace(/\\/g, "/").replace(/:/g, "\\:");
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk) => {
      err += String(chunk);
    });
    child.on("error", (error) => {
      reject(new Error(`ffmpeg missing or failed to start: ${error.message}`));
    });
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${err.slice(-700)}`));
    });
  });
}

export function memeOutputPath(mix: MemeMix): string {
  return path.join(ROOT_DIR, "output", "memes", `${mix.captionId}-${mix.reactionId}.mp4`);
}

/** Burn one mixed meme to an 8-second 9:16 mp4. Wallpaper, reaction, and music must be on disk. */
export async function renderMeme(mix: MemeMix, outPath = memeOutputPath(mix)): Promise<string> {
  const wallpaper = path.join(MEME_WALLPAPER_DIR, mix.plan.wallpaperFile);
  const reaction = path.join(MEME_REACTION_DIR, mix.plan.reactionFile);
  const bed = knownBeds().find((item) => item.id === mix.musicId);
  if (!fs.existsSync(wallpaper)) throw new Error(`Missing wallpaper ${wallpaper}`);
  if (!fs.existsSync(reaction)) throw new Error(`Missing reaction ${reaction}`);
  if (!bed || !fs.existsSync(bed.file)) throw new Error(`Missing music ${mix.musicId}`);

  const reactionW = Math.round((MEME_W * MEME_REACTION.widthPct) / 2) * 2;
  const reactionTop = Math.round(MEME_H * MEME_REACTION.topPct);
  const captionTop = Math.round(MEME_H * MEME_CAPTION.topPct);
  const fontSize = 52;
  const lineGap = 16;
  const font = fontForFilter(fontFile());
  const draw = mix.plan.lines
    .map((line, index) => {
      const y = captionTop + index * (fontSize + lineGap);
      return `drawtext=fontfile='${font}':text='${escapeDrawtext(line)}':fontsize=${fontSize}:fontcolor=white:borderw=6:bordercolor=black:x=(w-text_w)/2:y=${y}`;
    })
    .join(",");
  const filter = [
    `[0:v]scale=${MEME_W}:${MEME_H}:force_original_aspect_ratio=increase,crop=${MEME_W}:${MEME_H},setsar=1,fps=${MEME_FPS}[bg]`,
    `[1:v]scale=${reactionW}:-1:flags=lanczos[rx]`,
    `[bg][rx]overlay=(W-w)/2:${reactionTop}:format=auto[layered]`,
    `[layered]${draw}[out]`,
    `[2:a]atrim=0:${MEME_SECONDS},asetpts=PTS-STARTPTS,afade=t=out:st=${MEME_SECONDS - 0.6}:d=0.6,volume=0.35[a]`,
  ].join(";");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await runFfmpeg([
    "-y",
    "-loop",
    "1",
    "-t",
    String(MEME_SECONDS),
    "-i",
    wallpaper,
    "-stream_loop",
    "-1",
    "-i",
    reaction,
    "-t",
    String(MEME_SECONDS),
    "-i",
    bed.file,
    "-filter_complex",
    filter,
    "-map",
    "[out]",
    "-map",
    "[a]",
    "-t",
    String(MEME_SECONDS),
    "-r",
    String(MEME_FPS),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    outPath,
  ]);
  return outPath;
}
