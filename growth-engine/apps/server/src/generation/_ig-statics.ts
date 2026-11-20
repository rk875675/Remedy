/**
 * The @remedyrecoveries curated feed. Statics in assets/ig/plan.json, carousels in
 * assets/ig/carousels.json; generated photos live in assets/ig/photos/gen/ and are
 * described by a `shot` next to the slide that uses them.
 *
 *   npx tsx src/generation/_ig-statics.ts                 render everything into output/ig/
 *   npx tsx src/generation/_ig-statics.ts --only <id>     one static or carousel
 *   npx tsx src/generation/_ig-statics.ts --prompts       print briefs for missing generated photos (JSON)
 *   npx tsx src/generation/_ig-statics.ts --import <dir>  copy generated files (named by basename) into gen/
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { OUTPUT_DIR } from "../config.js";
import { compileShot, IG_DIR, IgCarouselsSchema, IgPlanSchema, renderGridPreview, renderIgCarousel, renderIgPost, type IgShot } from "./ig-static.js";

interface Need {
  photo: string;
  shot: IgShot;
  textAt: "top" | "bottom";
}

function load() {
  const plan = IgPlanSchema.parse(JSON.parse(fs.readFileSync(path.join(IG_DIR, "plan.json"), "utf8")));
  const carousels = IgCarouselsSchema.parse(JSON.parse(fs.readFileSync(path.join(IG_DIR, "carousels.json"), "utf8")));
  const sources = JSON.parse(fs.readFileSync(path.join(IG_DIR, "sources.json"), "utf8")) as Record<string, unknown>;
  const needs: Need[] = [];
  for (const p of plan.posts) if (p.photo?.startsWith("gen/") && p.shot) needs.push({ photo: p.photo, shot: p.shot, textAt: p.textAt });
  for (const c of carousels.carousels)
    for (const s of c.slides) if (s.kind === "still" && s.photo.startsWith("gen/") && s.shot) needs.push({ photo: s.photo, shot: s.shot, textAt: s.textAt });

  const seen = new Set<string>();
  for (const n of needs) {
    if (seen.has(n.photo)) throw new Error(`Photo used twice: ${n.photo}`);
    seen.add(n.photo);
  }
  const photos = [...plan.posts.flatMap((p) => (p.photo ? [p.photo] : [])), ...carousels.carousels.flatMap((c) => c.slides.flatMap((s) => (s.kind === "still" ? [s.photo] : [])))];
  for (const ph of photos) {
    if (ph.startsWith("gen/")) {
      if (!needs.some((n) => n.photo === ph)) throw new Error(`${ph}: generated photo without a shot`);
    } else if (!sources[ph]) throw new Error(`${ph} has no entry in assets/ig/sources.json`);
  }
  return { plan, carousels, needs };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
  const { plan, carousels, needs } = load();
  const genDir = path.join(IG_DIR, "photos", "gen");
  fs.mkdirSync(genDir, { recursive: true });

  if (args.includes("--prompts")) {
    const missing = needs.filter((n) => !fs.existsSync(path.join(IG_DIR, "photos", n.photo)));
    console.log(JSON.stringify(missing.map((n) => ({ file: path.basename(n.photo), ...compileShot(n.shot, n.textAt) })), null, 1));
    console.error(`${missing.length} missing of ${needs.length}`);
    return;
  }
  if (args.includes("--import")) {
    const dir = args[args.indexOf("--import") + 1]!;
    for (const n of needs) {
      const name = path.basename(n.photo);
      const src = path.join(dir, name);
      const dst = path.join(IG_DIR, "photos", n.photo);
      if (!fs.existsSync(src) || (fs.existsSync(dst) && !args.includes("--force"))) continue;
      const m = await sharp(src).metadata();
      if (Math.min(m.width ?? 0, m.height ?? 0) < 700) console.log(`  small: ${name} ${m.width}x${m.height}`);
      fs.copyFileSync(src, dst);
      console.log(`imported ${name}`);
    }
    return;
  }

  const out = path.join(OUTPUT_DIR, "ig");
  fs.mkdirSync(out, { recursive: true });
  const captions: string[] = [];
  const staticFiles: string[] = [];
  for (const [i, post] of plan.posts.entries()) {
    const file = path.join(out, `${String(i + 1).padStart(2, "0")}-${post.id}.jpg`);
    staticFiles.push(file);
    captions.push(`static ${post.id}\n${post.caption}\n`);
    if (only && post.id !== only) continue;
    if (post.photo && !fs.existsSync(path.join(IG_DIR, "photos", post.photo))) {
      console.log(`skip ${post.id}: photo not generated yet`);
      continue;
    }
    fs.writeFileSync(file, await renderIgPost(post));
    console.log(`rendered ${path.basename(file)}`);
  }
  for (const c of carousels.carousels) {
    captions.push(`carousel ${c.id}\n${c.caption}\n`);
    if (only && c.id !== only) continue;
    const missing = c.slides.filter((s) => s.kind === "still" && !fs.existsSync(path.join(IG_DIR, "photos", s.photo)));
    if (missing.length) {
      console.log(`skip carousel ${c.id}: ${missing.length} photo(s) not generated yet`);
      continue;
    }
    const dir = path.join(out, "c", c.id);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    const slides = await renderIgCarousel(c);
    slides.forEach((b, i) => fs.writeFileSync(path.join(dir, `slide-${i + 1}.jpg`), b));
    await renderGridPreview(slides.map((_, i) => path.join(dir, `slide-${i + 1}.jpg`)), path.join(dir, "sheet.jpg"));
    console.log(`rendered carousel ${c.id} (${slides.length} slides)`);
  }
  fs.writeFileSync(path.join(out, "captions.txt"), captions.join("\n"));
  if (!only) await renderGridPreview([...staticFiles].reverse().filter((f) => fs.existsSync(f)), path.join(out, "grid-preview.jpg"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
