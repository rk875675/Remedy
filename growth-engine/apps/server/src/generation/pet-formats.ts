/**
 * Pet-native formats (HELD). Offline groundwork for the armadillo launch.
 *
 * - Nothing here is imported by the scheduler, the autopilot, the daily cycle, generation/index.ts
 *   or the meme week. It cannot enter the live rotation by itself.
 * - Previews always go to output/pet-held/ (never to output/posts, R2 or Zernio).
 * - Anything that would feed a live queue must check `petContentLive()` (PET_CONTENT_ENABLED, default false).
 * - The locked last-slide CTA is not touched or reproduced. The stage-reveal sample ends on a plain
 *   closing slide; whether a live version ends on the locked CTA is an owner decision.
 *
 * Art comes from assets/pet/ (registered in assets/pet/registry.json). Voice lines are the real in-app
 * lines from constants/petMoodLines.ts, copied into assets/pet-formats/formats.json.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { ROOT_DIR, env } from "../config.js";

export const PET_ASSET_DIR = path.join(ROOT_DIR, "assets", "pet");
export const PET_FORMATS_FILE = path.join(ROOT_DIR, "assets", "pet-formats", "formats.json");
export const PET_HELD_DIR = path.join(ROOT_DIR, "output", "pet-held");

const COLORS = { green: "#3E6B4E", greenDark: "#2F5239", terracotta: "#AE5636", tan: "#F6EDE0", ink: "#2A2A28" } as const;
const W = 1080;
const H = 1920;
const FONT = "Segoe UI, Helvetica, Arial, sans-serif";

export function petContentLive(): boolean {
  return env.PET_CONTENT_ENABLED === true;
}

// ---------- registry + format definitions (Zod strict) ----------

const RegistrySchema = z
  .object({
    note: z.string(),
    stages: z.array(z.object({ stage: z.number().int().min(1).max(5), sessions: z.number().int().min(0), label: z.string(), file: z.string() }).strict()),
    moods: z.record(z.string(), z.string()),
  })
  .strict();

const FormatSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    kind: z.enum(["meme", "carousel", "sheet"]),
    status: z.literal("held"),
    hypothesis: z.string().min(10),
    mechanic: z.string().min(10),
    accounts: z.array(z.string()),
    cta: z.string(),
    rules: z.array(z.string()),
  })
  .strict();
const FormatsSchema = z.object({ formats: z.array(FormatSchema) }).strict();
export type PetFormat = z.infer<typeof FormatSchema>;

export function loadPetRegistry() {
  return RegistrySchema.parse(JSON.parse(fs.readFileSync(path.join(PET_ASSET_DIR, "registry.json"), "utf8")));
}

export function loadPetFormats(): PetFormat[] {
  return FormatsSchema.parse(JSON.parse(fs.readFileSync(PET_FORMATS_FILE, "utf8"))).formats;
}

function petFile(name: string): string {
  const p = path.join(PET_ASSET_DIR, name);
  if (!fs.existsSync(p)) throw new Error(`Pet asset missing: ${name}`);
  return p;
}

// ---------- drawing helpers ----------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function textBlock(text: string, x: number, y: number, size: number, fill: string, opts?: { maxChars?: number; anchor?: "start" | "middle"; weight?: number; lh?: number }): { svg: string; bottom: number } {
  const lines = wrap(text, opts?.maxChars ?? 22);
  const lh = (opts?.lh ?? 1.18) * size;
  const svg = lines
    .map((l, i) => `<text x="${x}" y="${y + i * lh}" font-family="${FONT}" font-size="${size}" font-weight="${opts?.weight ?? 700}" fill="${fill}" text-anchor="${opts?.anchor ?? "middle"}">${esc(l)}</text>`)
    .join("");
  return { svg, bottom: y + lines.length * lh };
}

async function pet(file: string, size: number): Promise<Buffer> {
  return sharp(petFile(file)).resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
}

function bubbleSvg(text: string, x: number, y: number, w: number, tailX: number): string {
  const lines = wrap(text, 16);
  const size = 56;
  const h = lines.length * size * 1.2 + 56;
  const txt = lines.map((l, i) => `<text x="${x + w / 2}" y="${y + 40 + size + i * size * 1.2 - 12}" font-family="${FONT}" font-size="${size}" font-weight="600" fill="${COLORS.ink}" text-anchor="middle">${esc(l)}</text>`).join("");
  return (
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="36" fill="#fff" stroke="${COLORS.ink}" stroke-width="5"/>` +
    `<path d="M ${tailX - 30} ${y + h - 2} L ${tailX} ${y + h + 60} L ${tailX + 34} ${y + h - 2} Z" fill="#fff" stroke="${COLORS.ink}" stroke-width="5" stroke-linejoin="round"/>` +
    `<rect x="${tailX - 26}" y="${y + h - 8}" width="56" height="10" fill="#fff"/>` +
    txt
  );
}

// ---------- format 1: "my armadillo is mad at me" meme ----------

export interface MadMemeInput {
  setup: string; // "me: poking it one more time"
  reply: string; // "my armadillo:"
  bubble: string; // a real in-app line
  file: string; // e.g. s4_angry.png
}

export async function renderMadMeme(input: MadMemeInput): Promise<Buffer> {
  const a = textBlock(input.setup, W / 2, 230, 76, COLORS.ink, { maxChars: 24 });
  const b = textBlock(input.reply, W / 2, a.bottom + 40, 76, COLORS.terracotta, { maxChars: 24 });
  const hillTop = 1130;
  const bg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="${COLORS.tan}"/>` +
    a.svg +
    b.svg +
    `<ellipse cx="${W / 2}" cy="${H + 120}" rx="1000" ry="${H - hillTop + 120}" fill="${COLORS.green}"/>` +
    `<ellipse cx="${W / 2}" cy="${hillTop + 640}" rx="360" ry="46" fill="#000" opacity="0.18"/>` +
    bubbleSvg(input.bubble, 130, 640, 820, 640) +
    `</svg>`;
  const art = await pet(input.file, 900);
  return sharp(Buffer.from(bg)).composite([{ input: art, left: (W - 900) / 2, top: hillTop - 160 }]).jpeg({ quality: 92 }).toBuffer();
}

// ---------- format 2: stage-reveal carousel ----------

export interface StageSlideInput {
  file: string;
  title: string; // "0 sessions"
  line: string;
  dark?: boolean;
}

export async function renderStageSlide(input: StageSlideInput): Promise<Buffer> {
  const dark = input.dark !== false;
  const fg = dark ? COLORS.tan : COLORS.ink;
  const t = textBlock(input.title, W / 2, 250, 120, fg, { maxChars: 18, weight: 800 });
  const l = textBlock(input.line, W / 2, 1500, 64, fg, { maxChars: 26, weight: 600 });
  const bg =
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="${dark ? COLORS.green : COLORS.tan}"/>` +
    `<ellipse cx="${W / 2}" cy="1330" rx="380" ry="48" fill="#000" opacity="0.2"/>` +
    t.svg +
    l.svg +
    `</svg>`;
  const art = await pet(input.file, 960);
  return sharp(Buffer.from(bg)).composite([{ input: art, left: (W - 960) / 2, top: 400 }]).jpeg({ quality: 92 }).toBuffer();
}

// ---------- format 3: mood sheet (2x2) ----------

export interface MoodCell {
  file: string;
  label: string;
}

export async function renderMoodSheet(title: string, cells: [MoodCell, MoodCell, MoodCell, MoodCell]): Promise<Buffer> {
  const cw = W / 2;
  const top = 360;
  const ch = (H - top) / 2;
  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="${COLORS.tan}"/>`;
  svg += textBlock(title, W / 2, 190, 78, COLORS.ink, { maxChars: 26 }).svg;
  cells.forEach((c, i) => {
    const x = (i % 2) * cw;
    const y = top + Math.floor(i / 2) * ch;
    svg += `<rect x="${x + 24}" y="${y + 12}" width="${cw - 48}" height="${ch - 24}" rx="44" fill="${i % 3 === 0 ? COLORS.green : COLORS.greenDark}"/>`;
    svg += textBlock(c.label, x + cw / 2, y + ch - 80, 46, COLORS.tan, { maxChars: 20, weight: 600 }).svg;
  });
  svg += `</svg>`;
  const comps: sharp.OverlayOptions[] = [];
  for (let i = 0; i < cells.length; i++) {
    const x = (i % 2) * cw;
    const y = top + Math.floor(i / 2) * ch;
    comps.push({ input: await pet(cells[i]!.file, 520), left: Math.round(x + (cw - 520) / 2), top: Math.round(y + 30) });
  }
  return sharp(Buffer.from(svg)).composite(comps).jpeg({ quality: 92 }).toBuffer();
}

// ---------- held output ----------

export function writeHeld(relPath: string, data: Buffer): string {
  const out = path.join(PET_HELD_DIR, relPath);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, data);
  return out;
}
