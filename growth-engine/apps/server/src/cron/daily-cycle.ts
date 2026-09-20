import { getDb, posts } from "@remedy-growth/db";
import { eq } from "drizzle-orm";
import { env, configuredPlatforms } from "../config.js";
import { brightbeanConfigured, publisherReady } from "../publish/brightbean.js";
import { pullAnalytics } from "../analytics/pull.js";
import { runDiagnosis } from "../learning/diagnosis.js";
import { evolveWinners } from "../learning/evolve.js";
import { concludeExperiments } from "../learning/experiments.js";
import { refreshSummaries } from "../learning/summaries.js";
import { advanceRounds } from "../learning/rounds.js";
import { generateBatch } from "../generation/index.js";
import { expirePostedMedia } from "../generation/storage.js";
import { assignSchedule } from "../publish/scheduler.js";

export interface DailyCycleReport {
  analyticsPulled: number;
  diagnosed: number;
  winners: number;
  experimentsConcluded: number;
  evolvedHooks: number;
  generated: number;
  autoApproved: number;
  scheduled: number;
  round: string;
}

/**
 * The full autonomous loop, run once per day:
 * 1. Pull BrightBean audience (followers) + per-post metrics
 * 2. Diagnose mature posts against the same follower era; only replicated gaps become rules
 * 3. Conclude A/B experiments whose posts are measured — results become signals
 * 4. Evolve winners into hook variations
 * 5. Generate the next batch using accumulated learnings
 * 6. Schedule approved posts into today's slots
 */
export async function runDailyCycle(): Promise<DailyCycleReport> {
  console.log(`\n=== Daily cycle started ${new Date().toISOString()} ===`);

  let analyticsPulled = 0;
  if (!env.ANALYTICS_ENABLED) {
    console.log("Skipping analytics pull — ANALYTICS_ENABLED=false.");
  } else if (brightbeanConfigured() || configuredPlatforms().some((p) => publisherReady(p))) {
    const pull = await pullAnalytics();
    analyticsPulled = pull.pulled;
  } else {
    console.log("Skipping analytics pull (no BrightBean / platforms configured yet).");
  }

  let diagnosed = 0;
  let winners = 0;
  let experimentsConcluded = 0;
  let evolvedHooks = 0;
  let roundNote = "learning paused";
  if (!env.LEARNING_ENABLED) {
    console.log("Skipping learning — LEARNING_ENABLED=false.");
  } else {
    const diagnosis = runDiagnosis();
    diagnosed = diagnosis.diagnosed;
    winners = diagnosis.winners.length;
    experimentsConcluded = concludeExperiments().concluded;
    refreshSummaries();
    const roundResult = await advanceRounds().catch((err) => {
      console.warn("Round advancement failed:", err instanceof Error ? err.message : err);
      return { advanced: false, variantsCreated: 0, note: "round advancement failed" };
    });
    roundNote = roundResult.note;
    console.log(`Learning cycle: ${roundNote}`);
    evolvedHooks = await evolveWinners();
  }
  const queuedLeft = getDb().select().from(posts).where(eq(posts.status, "queued")).all().length;
  let generated: Awaited<ReturnType<typeof generateBatch>> = [];
  if (!env.GENERATE_ENABLED) {
    console.log("Skipping generate — GENERATE_ENABLED=false (ramp date does not turn it on).");
  } else if (queuedLeft > 0) {
    console.log(`Skipping generate — ${queuedLeft} still in the review queue. Approve all first.`);
  } else {
    generated = await generateBatch(env.POSTS_PER_DAY);
  }
  const autoApproved = generated.filter((g) => g.status === "approved").length;
  const scheduled = assignSchedule();
  const expired = env.EXPIRE_SHORTS
    ? await expirePostedMedia().catch((err) => {
        console.warn("Short expiry failed:", err instanceof Error ? err.message : err);
        return { shorts: 0 };
      })
    : { shorts: 0 };
  if (expired.shorts) console.log(`Expired ${expired.shorts} short(s) past the 48h post window.`);

  const report: DailyCycleReport = {
    analyticsPulled,
    diagnosed,
    winners,
    experimentsConcluded,
    evolvedHooks,
    generated: generated.length,
    autoApproved,
    scheduled,
    round: roundNote,
  };
  console.log(`=== Daily cycle done ===`, JSON.stringify(report));
  await notifyBatchReady(report);
  return report;
}

/** Optional webhook ping (ntfy.sh, Discord, etc.) when the day's batch is ready for review. */
async function notifyBatchReady(report: DailyCycleReport): Promise<void> {
  if (!env.NOTIFY_WEBHOOK_URL) return;
  const queued = report.generated - report.autoApproved;
  const message = `Remedy Growth Engine: ${report.generated} posts generated (${queued} awaiting approval, ${report.autoApproved} auto-approved). Winners so far: ${report.winners}.`;
  try {
    // Discord-style webhooks expect JSON {content}; ntfy and most others accept a plain body.
    const isDiscord = env.NOTIFY_WEBHOOK_URL.includes("discord.com/api/webhooks");
    await fetch(env.NOTIFY_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": isDiscord ? "application/json" : "text/plain" },
      body: isDiscord ? JSON.stringify({ content: message }) : message,
    });
  } catch (err) {
    console.warn("Batch-ready notification failed:", err instanceof Error ? err.message : err);
  }
}
