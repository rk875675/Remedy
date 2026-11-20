/**
 * Preview one quad slide (2x2 grid, centered line, optional cell labels). No database, no queue.
 *
 *   npx tsx src/generation/_preview-quad.ts <a.jpg> <b.jpg> <c.jpg> <d.jpg> "headline" [--labels "one|two|three|four"] [--label-at center] [--look B] [--grade contrast] [--hook] [--out name]
 *
 * Writes output/previews/quad/<name>.jpg and prints the path.
 */
import fs from "node:fs";
import path from "node:path";
import { OUTPUT_DIR } from "../config.js";
import { renderQuadSlide, type NativeLook, type Quad, type QuadGrade, type QuadLabelAt } from "./composer.js";

const args = process.argv.slice(2);
const FLAGS_WITH_VALUE = ["--labels", "--look", "--grade", "--out", "--label-at"];
const flag = (name: string): string | undefined => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const positional = args.filter((a, i) => !a.startsWith("--") && !FLAGS_WITH_VALUE.includes(args[i - 1] ?? ""));
const [a, b, c, d, headline] = positional;
if (!a || !b || !c || !d || !headline) {
  throw new Error('Usage: _preview-quad.ts <a> <b> <c> <d> "headline" [--labels "one|two|three|four"] [--look B] [--grade contrast] [--hook] [--out name]');
}
const labelsRaw = flag("--labels")?.split("|").map((s) => s.trim());
if (labelsRaw && labelsRaw.length !== 4) throw new Error("--labels needs exactly four entries separated by |");
const labels = labelsRaw as Quad<string> | undefined;
const look: NativeLook = flag("--look") === "B" ? "B" : "A";
const grade: QuadGrade = flag("--grade") === "contrast" ? "contrast" : "natural";
const outDir = path.join(OUTPUT_DIR, "previews", "quad");
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${flag("--out") ?? `quad-${Date.now()}`}.jpg`);
const labelAt: QuadLabelAt = flag("--label-at") === "center" ? "center" : "edge";
await renderQuadSlide([a, b, c, d].map((p) => path.resolve(p)) as Quad<string>, headline, out, { labels, labelAt, hook: args.includes("--hook"), look, grade });
console.log(out);
