import { eq, asc } from "drizzle-orm";
import { getDb, posts, slides } from "@remedy-growth/db";
import { env, GENERATE_PAUSED_MESSAGE, EXPIRE_SHORTS_PAUSED_MESSAGE, ANALYTICS_PAUSED_MESSAGE, LEARNING_PAUSED_MESSAGE } from "./config.js";
import { applyBestCtasInPlace, applyPrelaunchCta, applyPrelaunchQueue, generateBatch, generateCtaReviewPosts, generateForcedIllustrationPosts, lengthenInReviewPosts, rebuildPostOnTemplate, refreshApprovedPosts, remakeQueuedCopy, remakeQueuedPosts, rerenderAllPosts, rerenderInReviewPosts, rerenderQueuedPosts } from "./generation/index.js";
import { completeManualPost, loadManualPosting, setManualCurrent } from "./manual/queue.js";
import { deleteShortNow, expirePostedMedia, keepShortForReview, pruneAllLocalOutput } from "./generation/storage.js";
import { ensureScreenshotMeta, listAssignableScreenshots, persistScreenshotMetaToR2 } from "./generation/screenshots.js";
import { syncScreenshotsFromR2 } from "./publish/r2.js";
import { postOutputDir } from "./generation/composer.js";
import { renderSlideshowShort, shortOutputPath } from "./generation/short.js";
import { publishPost, publishDue, sendApprovedToDrafts } from "./publish/index.js";
import { publishDashboardSnapshot } from "./publish/snapshot.js";
import { buildAuthUrl, consumePendingOAuth, tiktokConnected } from "./publish/tiktok.js";
import { assignSchedule } from "./publish/scheduler.js";
import { pullAnalytics } from "./analytics/pull.js";
import { runDiagnosis } from "./learning/diagnosis.js";
import { evolveWinners } from "./learning/evolve.js";
import { runDailyCycle } from "./cron/daily-cycle.js";

const [command, arg, arg2] = process.argv.slice(2);

async function main() {
  switch (command) {
    case "generate": {
      if (!env.GENERATE_ENABLED) {
        console.log(GENERATE_PAUSED_MESSAGE);
        break;
      }
      const count = arg ? Number(arg) : env.POSTS_PER_DAY;
      const generated = await generateBatch(count);
      console.log(`\nGenerated ${generated.length} posts (status breakdown: ${generated.filter((g) => g.status === "approved").length} auto-approved, ${generated.filter((g) => g.status === "queued").length} queued for review).`);
      break;
    }
    case "fix-approved": {
      if (!env.GENERATE_ENABLED) {
        console.log(GENERATE_PAUSED_MESSAGE);
        break;
      }
      const result = await refreshApprovedPosts();
      console.log(`\nRefreshed ${result.postIds.length} approved post(s). Hook swaps: ${result.hookSwaps.length}. Cover moves: ${result.coverMoves.length}.`);
      for (const s of result.hookSwaps) console.log(`  #${s.postId}: ${s.from} → ${s.to}`);
      for (const c of result.coverMoves) console.log(`  #${c.postId}: ${c.from} → ${c.to}`);
      break;
    }
    case "pull": {
      if (!env.ANALYTICS_ENABLED) {
        console.log(ANALYTICS_PAUSED_MESSAGE);
        break;
      }
      await pullAnalytics();
      break;
    }
    case "diagnose": {
      if (!env.LEARNING_ENABLED) {
        console.log(LEARNING_PAUSED_MESSAGE);
        break;
      }
      runDiagnosis();
      break;
    }
    case "evolve": {
      if (!env.LEARNING_ENABLED) {
        console.log(LEARNING_PAUSED_MESSAGE);
        break;
      }
      const n = await evolveWinners();
      console.log(`Created ${n} evolved hook variations.`);
      break;
    }
    case "complete-manual": {
      if (!arg) throw new Error("Usage: cli complete-manual <postId>");
      const state = await completeManualPost(Number(arg));
      console.log(`Completed #${arg}. Current: ${state.currentPostId ?? "none"}. Done: ${state.completedIds.join(",")}`);
      break;
    }
    case "prune-posted-shorts": {
      const completed = new Set(loadManualPosting().completedIds);
      const rows = getDb().select({ id: posts.id, status: posts.status }).from(posts).all();
      let n = 0;
      for (const row of rows) {
        if (keepShortForReview(row.id, row.status, completed)) continue;
        if (await deleteShortNow(row.id)) n++;
      }
      console.log(`Deleted shorts for ${n} posted / completed posts.`);
      break;
    }
    case "schedule": {
      const n = assignSchedule();
      console.log(`Scheduled ${n} posts.`);
      break;
    }
    case "coming-soon": {
      if (!arg) throw new Error("Usage: cli coming-soon <postId>");
      const postId = Number(arg);
      await applyPrelaunchCta(postId);
      const row = getDb().select().from(posts).where(eq(posts.id, postId)).get();
      const cta = getDb()
        .select()
        .from(slides)
        .where(eq(slides.postId, postId))
        .all()
        .find((s) => s.kind === "cta");
      console.log(`Post #${postId} is a coming-soon teaser.`);
      console.log(`CTA: ${cta?.headline ?? "?"} / ${cta?.sub ?? "?"}`);
      console.log(`Caption:\n${row?.caption ?? ""}`);
      break;
    }
    case "svg-review": {
      const generated = await generateForcedIllustrationPosts([
        { templateId: "F", illustrationIds: ["flat-ottoman-feet", "flat-garden-water", "", ""] },
        { templateId: "A", illustrationIds: ["flat-packing-tote", "", "", ""] },
      ]);
      const next = generated[0];
      if (next) setManualCurrent(next.postId);
      console.log(`SVG review: ${generated.map((g) => `#${g.postId} [${g.templateId}]`).join(", ")}. Next manual: #${next?.postId ?? "none"}.`);
      break;
    }
    case "cta-review": {
      // Locked: do not run unless the user explicitly asks to remake CTA teasers.
      const pinned = loadManualPosting().currentPostId;
      const generated = await generateCtaReviewPosts();
      const after = loadManualPosting().currentPostId;
      console.log(
        `CTA review: ${generated.map((g) => `#${g.postId}`).join(", ") || "none"}. This post stayed #${after ?? "none"} (was #${pinned ?? "none"}).`,
      );
      break;
    }
    case "cover-review": {
      const generated = await generateForcedIllustrationPosts([
        { templateId: "V", illustrationIds: ["person-desk-slouch", "person-morning-bed", "", "", "", "", ""] },
        { templateId: "U", illustrationIds: ["person-couch-ache", "", "", "person-bend-reach", "", "", "", ""] },
        { templateId: "Q", illustrationIds: ["flat-ottoman-feet", "", "", "", "", "", ""] },
      ]);
      const next = generated[0];
      if (next) setManualCurrent(next.postId);
      console.log(`Cover review: ${generated.map((g) => `#${g.postId} [${g.templateId}]`).join(", ")}. Next manual: #${next?.postId ?? "none"}.`);
      break;
    }
    case "set-manual": {
      if (!arg) throw new Error("Usage: cli set-manual <postId>");
      const state = setManualCurrent(Number(arg));
      console.log(`This post: #${state.currentPostId}`);
      break;
    }
    case "rebuild": {
      const templateId = arg2;
      if (!arg || !templateId) throw new Error("Usage: cli rebuild <postId> <templateId>");
      await rebuildPostOnTemplate(Number(arg), templateId);
      console.log(`Rebuilt #${arg} onto ${templateId}.`);
      break;
    }
    case "prelaunch-queue": {
      const result = await applyPrelaunchQueue();
      console.log(
        `Coming-soon queue: converted ${result.converted}, already done ${result.skipped}, current #${result.currentPostId ?? "none"}, ${result.remaining} left.`,
      );
      break;
    }
    case "publish": {
      if (!arg) throw new Error("Usage: cli publish <postId>");
      const result = await publishPost(Number(arg));
      console.log(result);
      break;
    }
    case "retry": {
      if (!arg) throw new Error("Usage: cli retry <postId>");
      const result = await publishPost(Number(arg), { retryFailed: true });
      console.log(result);
      break;
    }
    case "publish-due": {
      const n = await publishDue();
      console.log(`Published ${n} due posts.`);
      break;
    }
    case "tiktok-connect": {
      if (tiktokConnected()) {
        console.log("TikTok already connected.");
        break;
      }
      const consumed = await consumePendingOAuth().catch(() => false);
      if (consumed || tiktokConnected()) {
        console.log("TikTok connected from the slide. callback.");
        break;
      }
      console.log("Open this URL, approve access, then run this command again:\n");
      console.log(buildAuthUrl());
      break;
    }
    case "snapshot": {
      const url = await publishDashboardSnapshot();
      console.log(url ?? "R2 not configured");
      break;
    }
    case "rerender": {
      const n = await rerenderAllPosts();
      console.log(`Re-rendered ${n} post(s).`);
      break;
    }
    case "rerender-queued": {
      const ids = await rerenderQueuedPosts();
      console.log(`Re-rendered queued #${ids.join(", ") || "none"}.`);
      break;
    }
    case "rerender-review": {
      const ids = await rerenderInReviewPosts();
      console.log(`Re-rendered in-review #${ids.join(", ") || "none"}.`);
      break;
    }
    case "remake": {
      if (!env.GENERATE_ENABLED) {
        console.log(GENERATE_PAUSED_MESSAGE);
        break;
      }
      const { rejectedIds, generated, staleCrops } = await remakeQueuedPosts();
      if (staleCrops.length) console.log(`Removed stale R2 crops: ${staleCrops.join(", ")}`);
      console.log(`Rejected queued #${rejectedIds.join(", ") || "none"}.`);
      console.log(`Remade ${generated.length} post(s): ${generated.map((g) => `#${g.postId}[${g.templateId}]`).join(", ") || "none"}`);
      break;
    }
    case "apply-ctas": {
      const { postIds } = await applyBestCtasInPlace();
      console.log(`Applied best CTA + titles in place for #${postIds.join(", ") || "none"}.`);
      break;
    }
    case "remake-copy": {
      if (!env.GENERATE_ENABLED) {
        console.log(GENERATE_PAUSED_MESSAGE);
        break;
      }
      const { postIds } = await remakeQueuedCopy();
      console.log(`Rewrote copy for queued #${postIds.join(", ") || "none"}. Hooks and templates kept.`);
      break;
    }
    case "lengthen": {
      const { postIds, map } = await lengthenInReviewPosts();
      console.log(
        `Lengthened ${postIds.length} in-review post(s): ${postIds.map((id) => `#${id}→${map[id]}`).join(", ") || "none"}.`,
      );
      break;
    }
    case "prune-storage": {
      const result = pruneAllLocalOutput();
      console.log(`Pruned ${result.files} leftover files across ${result.posts} post folders.`);
      break;
    }
    case "ingest-screenshots": {
      const n = await syncScreenshotsFromR2();
      const { added } = ensureScreenshotMeta();
      await persistScreenshotMetaToR2();
      const assignable = listAssignableScreenshots();
      console.log(`Synced ${n} file(s). Described ${added.length}: ${added.join(", ") || "none new"}.`);
      console.log(`Assignable: ${assignable.length} — ${assignable.join(", ")}`);
      break;
    }
    case "expire-shorts": {
      if (!env.EXPIRE_SHORTS) {
        console.log(EXPIRE_SHORTS_PAUSED_MESSAGE);
        break;
      }
      const result = await expirePostedMedia();
      console.log(`Expired ${result.shorts} short(s) past the 48h post window.`);
      break;
    }
    case "shorts-preview": {
      const db = getDb();
      const rows = db.select().from(posts).all().filter((p) => p.status === "queued" || p.status === "approved");
      let n = 0;
      for (const post of rows) {
        const slideRows = db.select().from(slides).where(eq(slides.postId, post.id)).orderBy(asc(slides.idx)).all();
        if (slideRows.length < 2) continue;
        const bed = (post.variation as { shortBed?: string } | null)?.shortBed;
        await renderSlideshowShort(slideRows.map((s) => s.filePath), shortOutputPath(postOutputDir(post.id)), post.id, bed);
        n++;
        console.log(`Short #${post.id}`);
      }
      console.log(`Rendered ${n} Short preview(s).`);
      break;
    }
    case "short": {
      if (!arg) throw new Error("Usage: cli short <postId>");
      const postId = Number(arg);
      const db = getDb();
      const post = db.select().from(posts).where(eq(posts.id, postId)).get();
      if (!post) throw new Error(`Post ${postId} not found`);
      const rows = db.select().from(slides).where(eq(slides.postId, postId)).orderBy(asc(slides.idx)).all();
      const bed = (post.variation as { shortBed?: string } | null)?.shortBed;
      const out = await renderSlideshowShort(rows.map((s) => s.filePath), shortOutputPath(postOutputDir(postId)), postId, bed);
      console.log(`Wrote ${out.file} (${out.bed.title})`);
      break;
    }
    case "send-drafts": {
      const result = await sendApprovedToDrafts();
      console.log(`Sent ${result.sent} approved post(s) (TikTok draft, IG/FB/YouTube live).`);
      if (result.errors.length) {
        for (const e of result.errors) console.error(`  #${e.postId}: ${e.error}`);
      }
      break;
    }
    case "daily": {
      await runDailyCycle();
      break;
    }
    default:
      console.log(`Remedy Growth Engine CLI
Usage: npm run cli -w apps/server -- <command>

Commands:
  complete-manual <id>  Mark one post posted-by-hand and delete its Short
  prune-posted-shorts   Delete shorts for published / completed posts
  coming-soon <id>   Rewrite one post's CTA + caption for pre-store
  prelaunch-queue    Convert all approved posts to coming-soon and set the phone queue
  svg-review         Generate 2 queued SVG-cover posts and pin the first as next manual
  cta-review         Generate 3 queued CTA-layout options without replacing This post
  cover-review       Generate 2 long person-cover + 1 SVG-cover posts and pin the first
  set-manual <id>    Pin this post as the current manual item
  rebuild <id> <T>   Rebuild one post onto template T (keeps hook + cover person)
  retry <id>         Retry only platforms that failed on an already-sent post
  generate [count]   Generate a batch of carousel posts (default ${env.POSTS_PER_DAY})
  fix-approved       Swap vague hooks + put illustrations on approved text covers
  pull               Pull analytics from TikTok/IG/FB for published posts
  diagnose           Run the 2x2 diagnosis matrix and update learnings
  evolve             Generate hook variations from winners
  schedule           Assign posting slots to approved posts
  publish <id>       Publish one post now (drafts or live, depending on LIVE_PUBLISH)
  rerender           Re-render all existing slides (safe zone, CTA, music cue)
  remake             Reject queued drafts and generate replacements
  apply-ctas         Best-match last-slide CTA + distribution title/caption on queued/approved
  remake-copy        Rewrite queued body copy in place (keeps hooks + templates)
  lengthen           Rebuild short in-review posts onto 6–10 slide templates
  send-drafts        Send approved posts now (TikTok draft, IG/FB/YouTube live)
  short <id>         Render a YouTube Short MP4 from an existing post's slides
  prune-storage      Delete leftover local slide revisions (keeps current rev + shorts)
  ingest-screenshots Pull new SS from R2 and write descriptions so generate can use them
  expire-shorts      Delete shorts older than 48h after publish (frees R2 + disk)
  snapshot           Upload the phone dashboard snapshot + slides to R2
  tiktok-connect     Print the TikTok login URL, or finish connect after the callback
  publish-due        Publish all approved posts whose slot has arrived
  daily              Run the full daily cycle (pull -> diagnose -> evolve -> generate -> schedule)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
