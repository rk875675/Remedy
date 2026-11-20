import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { ROOT_DIR } from "../config.js";

/**
 * @remedy.stories Instagram grid. A different account from @remedyrecoveries:
 * closer photos, a warm grade, one small sans line, no wordmark, no type card,
 * no white box. The boxed caption stays on the Stories A/B twin only.
 */

export const STORIES_DIR = path.join(ROOT_DIR, "assets", "ig", "stories");
const W = 1080;
const H = 1350;
const INK = "#1A1612";
const PAPER = "#FFFFFF";
const SANS = "'Segoe UI', Helvetica, Arial, sans-serif";

export const StoriesPostSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    photo: z.string().min(1),
    line: z.string().min(1).max(42),
    textAt: z.enum(["top", "bottom"]).default("bottom"),
    focus: z.enum(["centre", "north", "south", "east", "west", "attention"]).default("attention"),
    caption: z.string().min(1),
  })
  .strict();
export const StoriesPlanSchema = z.object({ posts: z.array(StoriesPostSchema).min(1) }).strict();
export type StoriesPost = z.infer<typeof StoriesPostSchema>;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Warm and a little closer than the Recoveries grade. No grain, no haze, no box behind the type. */
async function warmPhoto(file: string, focus: StoriesPost["focus"]): Promise<Buffer> {
  const src = path.join(STORIES_DIR, "photos", file);
  if (!fs.existsSync(src)) throw new Error(`Missing photo: ${src}`);
  const base = await sharp(src).rotate().resize(W, H, { fit: "cover", position: focus }).png().toBuffer();
  const mean = (await sharp(base).greyscale().stats()).channels[0]!.mean;
  const brightness = mean < 90 ? 1.08 : 1;
  const tint = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${W}" height="${H}" fill="#E2A56A" fill-opacity="0.14"/></svg>`,
  );
  return sharp(base).modulate({ brightness, saturation: 0.92 }).composite([{ input: tint, blend: "soft-light" }]).png().toBuffer();
}

export async function renderStoriesPost(post: StoriesPost): Promise<Buffer> {
  const photo = await warmPhoto(post.photo, post.focus);
  const size = 40;
  const y = post.textAt === "top" ? 168 : H - 96;
  const raw = await sharp(photo).extract({ left: 72, top: y - 30, width: 520, height: 36 }).removeAlpha().raw().toBuffer();
  let sum = 0;
  for (let i = 0; i < raw.length; i += 3) sum += raw[i]! + raw[i + 1]! + raw[i + 2]!;
  const fill = sum / raw.length > 118 ? INK : PAPER;
  const shadow = fill === INK ? "rgba(244,239,232,0.55)" : "rgba(20,16,12,0.55)";
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <text x="72" y="${y + 2}" font-family="${SANS}" font-size="${size}" font-weight="600" fill="${shadow}">${esc(post.line)}</text>
    <text x="72" y="${y}" font-family="${SANS}" font-size="${size}" font-weight="600" fill="${fill}">${esc(post.line)}</text>
  </svg>`;
  return sharp(photo).composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
}
