/**
 * Compile a deck's `shots` into exact image briefs, or import the results.
 *
 *   npx tsx src/generation/_shot-prompts.ts <deck.json | dir> [--only <file-prefix>] [--missing] [--json]
 *   npx tsx src/generation/_shot-prompts.ts <deck.json | dir> --import <generated-dir> [--force]
 *
 * Without --import it prints, per shot: output file, aspect, the ordered reference
 * images with their role, and the full prompt. Paste these into the image tool as is
 * (one call per shot; the reference order matters). --missing skips shots whose
 * photo already exists. --json prints the same as JSON for scripts.
 *
 * With --import it copies <generated-dir>/<basename> into the character folder for
 * each shot, then checks size and aspect. The GenerateImage tool writes to
 * C:\Users\<you>\.cursor\projects\<workspace>\assets\ by default.
 */
import fs from "node:fs";
import path from "node:path";
import { DeckSchema } from "./character-deck.js";
import { compileShot, importShot, photoFileProblems, type CompiledShot } from "./shots.js";

const args = process.argv.slice(2);
const WITH_VALUE = new Set(["--only", "--import"]);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const positional = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && WITH_VALUE.has(args[i - 1]!)));
const target = positional[0];
if (!target) throw new Error("Usage: _shot-prompts.ts <deck.json | dir> [--only <prefix>] [--missing] [--json] [--import <dir> [--force]]");

const files = fs.statSync(target).isDirectory()
  ? fs.readdirSync(target).filter((f) => f.endsWith(".json")).sort().map((f) => path.join(target, f))
  : [target];
const only = flag("--only");
const importDir = flag("--import");
const missingOnly = args.includes("--missing");
const asJson = args.includes("--json");
const force = args.includes("--force");

const compiled: Array<{ deck: string; shot: CompiledShot; person: string; exists: boolean }> = [];
const errors: string[] = [];
for (const file of files) {
  const parsed = DeckSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    errors.push(`${path.basename(file)}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
    continue;
  }
  const deck = parsed.data;
  if (!deck.shots?.length) {
    errors.push(`${path.basename(file)}: no "shots" array; add one shot per photo in beats`);
    continue;
  }
  for (const shot of deck.shots) {
    if (only && !path.basename(shot.file).startsWith(only)) continue;
    try {
      const c = compileShot(deck.character, shot);
      const exists = fs.existsSync(c.outPath);
      if (missingOnly && exists && !importDir) continue;
      compiled.push({ deck: path.basename(file), shot: c, person: shot.person, exists });
    } catch (err) {
      errors.push(`${path.basename(file)}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
for (const e of errors) console.error(`  ✗ ${e}`);
if (errors.length) process.exit(1);

if (importDir) {
  let copied = 0;
  const problems: string[] = [];
  for (const { shot } of compiled) {
    const r = await importShot(shot, importDir, force);
    if (r.copied) copied++;
    problems.push(...r.problems.map((p) => `${shot.file}: ${p}`));
  }
  // Re-check everything that exists so a deck is never built on a wrong-shaped photo.
  for (const { shot } of compiled) {
    if (fs.existsSync(shot.outPath)) problems.push(...(await photoFileProblems(shot.outPath, shot.aspect)).map((p) => `${shot.file}: ${p}`));
  }
  const unique = [...new Set(problems)];
  console.log(`${copied} photo(s) imported, ${compiled.filter((c) => fs.existsSync(c.shot.outPath)).length}/${compiled.length} present, ${unique.length} problem(s).`);
  for (const p of unique) console.log(`  ✗ ${p}`);
  process.exit(unique.filter((p) => !p.includes("not generated yet")).length ? 1 : 0);
}

if (asJson) {
  console.log(JSON.stringify(compiled.map((c) => ({ deck: c.deck, ...c.shot, person: c.person, exists: c.exists })), null, 2));
  process.exit(0);
}

console.log(`${compiled.length} shot(s)${missingOnly ? " still to generate" : ""}.\n`);
for (const { deck, shot, person, exists } of compiled) {
  console.log(`━━ ${shot.file}  (${deck}, person: ${person}${exists ? ", exists" : ""})`);
  console.log(`   aspect: ${shot.aspect}    save as: ${shot.toolFileName}`);
  shot.refs.forEach((r, i) => console.log(`   ref ${i + 1}: ${r}\n          ${shot.refRoles[i]}`));
  console.log(`   prompt:\n   ${shot.prompt}\n`);
}
