// Dev utility: rasterize every vendored illustration into one labeled grid
// so the library can be visually vetted. Not part of the runtime pipeline.
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "illustrations");
const out = process.argv[2] ?? path.join(root, "..", "..", "output", "contact-sheet.png");

const files = [];
for (const dir of ["illlustrations", "opendoodles", "custom"]) {
  const full = path.join(root, dir);
  if (!fs.existsSync(full)) continue;
  for (const f of fs.readdirSync(full).filter((f) => f.endsWith(".svg"))) {
    files.push({ dir, f, p: path.join(full, f) });
  }
}

const CELL = 240;
const LABEL_H = 30;
const COLS = 7;
const rows = Math.ceil(files.length / COLS);

const composites = [];
for (let i = 0; i < files.length; i++) {
  const { dir, f, p } = files[i];
  const x = (i % COLS) * CELL;
  const y = Math.floor(i / COLS) * (CELL + LABEL_H);
  let thumb;
  try {
    thumb = await sharp(p, { density: 96 })
      .resize(CELL - 16, CELL - 16 - LABEL_H, { fit: "inside" })
      .png()
      .toBuffer();
  } catch (err) {
    console.error(`RASTER FAIL ${dir}/${f}: ${err.message}`);
    continue;
  }
  const meta = await sharp(thumb).metadata();
  composites.push({
    input: thumb,
    left: x + Math.round((CELL - meta.width) / 2),
    top: y + Math.round((CELL - LABEL_H - meta.height) / 2),
  });
  const label = `<svg width="${CELL}" height="${LABEL_H}"><text x="${CELL / 2}" y="20" text-anchor="middle" font-family="Arial" font-size="13" fill="#333">${f.replace(".svg", "")}</text></svg>`;
  composites.push({ input: Buffer.from(label), left: x, top: y + CELL - LABEL_H + 4 });
}

await sharp({
  create: { width: COLS * CELL, height: rows * (CELL + LABEL_H), channels: 4, background: "#f7f2e9" },
})
  .composite(composites)
  .png()
  .toFile(out);
console.log(`wrote ${out} (${files.length} files)`);
