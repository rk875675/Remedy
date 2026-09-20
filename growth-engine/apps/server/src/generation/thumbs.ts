import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { ASSETS_DIR, r2Configured } from "../config.js";
import { SCREENSHOT_R2_PREFIX, uploadBuffer, deleteObject } from "../publish/r2.js";

export function thumbFileName(file: string): string {
  return `${path.basename(file).replace(/\.[^.]+$/, "")}.jpg`;
}

export function thumbR2Key(file: string): string {
  return `${SCREENSHOT_R2_PREFIX}thumbs/${thumbFileName(file)}`;
}

export function thumbLocalPath(file: string): string {
  return path.join(ASSETS_DIR, "thumbs", thumbFileName(file));
}

export async function makeThumbBuffer(input: Buffer | string): Promise<Buffer> {
  return sharp(input).rotate().resize({ width: 540, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
}

export async function persistThumb(file: string, input: Buffer | string): Promise<void> {
  const buf = await makeThumbBuffer(input);
  const dest = thumbLocalPath(file);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  if (r2Configured()) {
    await uploadBuffer(thumbR2Key(file), buf, "image/jpeg");
  }
}

export async function deleteThumb(file: string): Promise<void> {
  const local = thumbLocalPath(file);
  if (fs.existsSync(local)) fs.unlinkSync(local);
  if (r2Configured()) await deleteObject(thumbR2Key(file));
}
