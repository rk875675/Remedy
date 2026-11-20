/**
 * Read-only: Zernio metrics for every curated Instagram post, its TikTok/Stories
 * cross-posts, and the Instagram @remedy.stories grid. Writes output/ig-perf.json.
 *
 *   npx tsx src/publish/_ig-perf.ts
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { OUTPUT_DIR } from "../config.js";
import { IG_DIR } from "../generation/ig-static.js";
import { fetchPostAnalytics, zernioKeys, type ZernioKeySlot, type ZernioMetrics } from "./zernio.js";

const PostedSchema = z.record(z.string(), z.object({ zernioPostId: z.string(), at: z.string() }).passthrough());
const CrossSchema = z.record(z.string(), z.record(z.string(), z.object({ zernioPostId: z.string(), at: z.string() }).passthrough()));

type Row = { id: string; account: string; at: string; zernioPostId: string; metrics: ZernioMetrics | null; error: string };

async function metricsAnySlot(id: string): Promise<{ metrics: ZernioMetrics | null; error: string }> {
  let error = "";
  for (const { slot } of zernioKeys()) {
    try {
      const m = await fetchPostAnalytics(id, slot as ZernioKeySlot);
      if (m) return { metrics: m, error: "" };
    } catch (err) {
      error = err instanceof Error ? err.message.slice(0, 120) : String(err);
    }
  }
  return { metrics: null, error };
}

async function main(): Promise<void> {
  const jobs: Array<Omit<Row, "metrics" | "error">> = [];
  const main = PostedSchema.parse(JSON.parse(fs.readFileSync(path.join(IG_DIR, "posted.json"), "utf8")));
  for (const [id, p] of Object.entries(main)) jobs.push({ id, account: "instagram:remedyrecoveries", at: p.at, zernioPostId: p.zernioPostId });
  const crossFile = path.join(IG_DIR, "crossposted.json");
  if (fs.existsSync(crossFile)) {
    for (const [id, byAccount] of Object.entries(CrossSchema.parse(JSON.parse(fs.readFileSync(crossFile, "utf8"))))) {
      for (const [account, p] of Object.entries(byAccount)) jobs.push({ id, account, at: p.at, zernioPostId: p.zernioPostId });
    }
  }
  const storiesFile = path.join(IG_DIR, "stories", "posted.json");
  if (fs.existsSync(storiesFile)) {
    for (const [id, p] of Object.entries(PostedSchema.parse(JSON.parse(fs.readFileSync(storiesFile, "utf8"))))) {
      jobs.push({ id, account: "instagram:remedy.stories(grid)", at: p.at, zernioPostId: p.zernioPostId });
    }
  }
  const now = Date.now();
  const rows: Row[] = [];
  for (const job of jobs) {
    if (Date.parse(job.at) > now) continue;
    rows.push({ ...job, ...(await metricsAnySlot(job.zernioPostId)) });
  }
  const out = path.join(OUTPUT_DIR, "ig-perf.json");
  fs.writeFileSync(out, JSON.stringify(rows, null, 2));
  for (const r of rows) {
    const m = r.metrics;
    console.log(`${r.account.padEnd(32)} ${r.id.padEnd(22)} ${r.at.slice(0, 16)}  ${m ? `v=${m.views} l=${m.likes} c=${m.comments} s=${m.shares} sv=${m.saves}` : `- ${r.error}`}`);
  }
  console.log(`\n${rows.length} live posts. Wrote ${out}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
