/**
 * Preview one split-comparison slide. No database, no queue.
 *
 *   npx tsx src/generation/_preview-split.ts <top.jpg> <bottom.jpg> "top line / bottom line" [--look B] [--grade natural] [--hook] [--out name]
 *
 * Writes output/previews/split/<name>.jpg and prints the path.
 */
import fs from "node:fs";
import path from "node:path";
import { OUTPUT_DIR } from "../config.js";
import { renderSplitSlide, type NativeLook, type SplitGrade } from "./composer.js";

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const positional = args.filter((a, i) => !a.startsWith("--") && !["--look", "--grade", "--out"].includes(args[i - 1] ?? ""));
const [top, bottom, headline] = positional;
if (!top || !bottom || !headline) {
  throw new Error('Usage: _preview-split.ts <top.jpg> <bottom.jpg> "top line / bottom line" [--look B] [--grade natural] [--hook] [--out name]');
}
const look: NativeLook = flag("--look") === "B" ? "B" : "A";
const grade: SplitGrade = flag("--grade") === "natural" ? "natural" : "contrast";
const outDir = path.join(OUTPUT_DIR, "previews", "split");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${flag("--out") ?? `split-${Date.now()}`}.jpg`);
await renderSplitSlide(path.resolve(top), path.resolve(bottom), headline, out, { hook: args.includes("--hook"), look, grade });
console.log(out);
