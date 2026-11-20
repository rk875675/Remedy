/**
 * Slideshow playbook report and batch plan (src/learning/playbook.ts).
 *
 *   npx tsx src/learning/_playbook.ts                 what is working, per arm and platform, and every test
 *   npx tsx src/learning/_playbook.ts --plan 10       plan 10 decks (about 80% exploit, 20% explore)
 *   npx tsx src/learning/_playbook.ts --plan 10 --seed 42
 *
 * Writes output/playbook/report.json, and output/playbook/plan-<date>.json with --plan.
 */
import fs from "node:fs";
import path from "node:path";
import {
  PLAYBOOK_DIR,
  armStats,
  loadObservations,
  loadTests,
  planBatch,
  probBest,
  testResults,
  type ArmStat,
} from "./playbook.js";

const args = process.argv.slice(2);
const planN = args.includes("--plan") ? Number(args[args.indexOf("--plan") + 1]) : 0;
const seed = args.includes("--seed") ? Number(args[args.indexOf("--seed") + 1]) : Date.now();

const { obs, thresholds } = loadObservations();
const stats = armStats(obs);
fs.mkdirSync(PLAYBOOK_DIR, { recursive: true });

const pct = (x: number) => `${Math.round(100 * x)}%`;
console.log(`Mature Recoveries decks: ${new Set(obs.map((o) => o.postId)).size} (YouTube ${obs.filter((o) => o.platform === "youtube").length}, TikTok ${obs.filter((o) => o.platform === "tiktok").length}).`);
console.log(`Hit = top quarter of the account in the last 45 days: YouTube >= ${thresholds.youtube} views, TikTok >= ${thresholds.tiktok} views.\n`);

const dims = [...new Set(stats.map((s) => s.dim))].sort();
const report: Record<string, Array<ArmStat & { pBest?: number }>> = {};
for (const dim of dims) {
  const rows = stats.filter((s) => s.dim === dim);
  const arms = [...new Set(rows.map((r) => r.arm))];
  const best = arms.length > 1 ? probBest(stats, dim, arms) : {};
  console.log(`${dim}`);
  for (const arm of arms.sort((a, b) => (best[b] ?? 0) - (best[a] ?? 0))) {
    const yt = rows.find((r) => r.arm === arm && r.platform === "youtube");
    const tt = rows.find((r) => r.arm === arm && r.platform === "tiktok");
    const cell = (s?: ArmStat) => (s ? `n=${String(s.n).padStart(2)} hit ${pct(s.hits / s.n).padStart(4)} med ${String(s.medianViews).padStart(4)}` : "n= 0".padEnd(25));
    console.log(`  ${arm.padEnd(26)} YT ${cell(yt)}  |  TT ${cell(tt)}  |  P(best) ${best[arm] !== undefined ? pct(best[arm]!) : "-"}`);
  }
  report[dim] = rows.map((r) => ({ ...r, pBest: best[r.arm] }));
}

const results = testResults(obs, loadTests());
console.log(`\nTests (${results.length}):`);
for (const r of results) {
  console.log(`  ${r.test.id.padEnd(28)} ${r.test.status.padEnd(7)} ${r.verdict.padEnd(12)} ${r.posts}/${r.test.minPosts} posts  hit ${pct(r.hitRate)} vs exploit ${pct(r.baselineHitRate)}  P(beats) ${pct(r.pBeatsBaseline)}`);
}

const slotOf = (s: string) => obs.filter((o) => o.platform === "youtube" && o.slot === s);
for (const s of ["exploit", "explore", "unplanned"]) {
  const list = slotOf(s);
  if (list.length) console.log(`  ${s.padEnd(10)} YouTube n=${list.length} hit ${pct(list.filter((o) => o.hit).length / list.length)}`);
}

fs.writeFileSync(path.join(PLAYBOOK_DIR, "report.json"), JSON.stringify({ at: new Date().toISOString(), thresholds, arms: report, tests: results }, null, 2));

if (planN > 0) {
  const { slots } = planBatch(planN, seed);
  const file = path.join(PLAYBOOK_DIR, `plan-${new Date().toISOString().slice(0, 10)}.json`);
  fs.writeFileSync(file, JSON.stringify({ seed, slots }, null, 2));
  console.log(`\nPlan for ${planN} decks (seed ${seed}):`);
  slots.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)} ${s.slot.padEnd(7)} ${s.test ? `[${s.test}] ` : ""}${Object.entries(s.arms).map(([k, v]) => `${k}=${v}`).join(" ")}`));
  console.log(`Wrote ${file}. Put each slot in its deck JSON as "plan": { "slot", "test", "arms" }.`);
}
