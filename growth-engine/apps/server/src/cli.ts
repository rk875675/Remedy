import { eq, asc } from "drizzle-orm";
import { getDb, posts, slides } from "@remedy-growth/db";
import { env, GENERATE_PAUSED_MESSAGE, EXPIRE_SHORTS_PAUSED_MESSAGE, ANALYTICS_PAUSED_MESSAGE, LEARNING_PAUSED_MESSAGE } from "./config.js";
import { applyBestCtasInPlace, applyLiveStoreCtas, applyPrelaunchCta, applyPrelaunchQueue, generateBatch, generateCtaReviewPosts, generateForcedIllustrationPosts, lengthenInReviewPosts, rebuildPostOnTemplate, refreshApprovedPosts, remakeQueuedCopy, remakeQueuedPosts, rerenderAllPosts, rerenderInReviewPosts, rerenderQueuedPosts } from "./generation/index.js";
import { CONTENT_PILLARS, hooks, matchContentPillar } from "@remedy-growth/db";
import { TEMPLATES } from "./generation/templates.js";
import { vagueBodyCount } from "./generation/hooks.js";
import { parseVariation } from "./generation/variations.js";
import { completeManualPost, loadManualPosting, setManualCurrent } from "./manual/queue.js";
import { deleteShortNow, expirePostedMedia, keepShortForReview, pruneAllLocalOutput } from "./generation/storage.js";
import { ensureScreenshotMeta, listAssignableScreenshots, persistScreenshotMetaToR2 } from "./generation/screenshots.js";
import { syncScreenshotsFromR2 } from "./publish/r2.js";
import { postOutputDir } from "./generation/composer.js";
import { renderSlideshowShort, shortOutputPath } from "./generation/short.js";
import {
  auditMemeCatalog,
  findMemes,
  formatMemeCatalog,
  formatMemeMix,
  formatMemeParts,
  formatMissingMemeAssets,
  mixMemes,
  searchMemeParts,
} from "./generation/meme-mix.js";
import { isMemeTone } from "./generation/meme-catalog.js";
import { memeOutputPath, renderMeme } from "./generation/meme-render.js";
import { publishPost, publishDue, handoffScheduled, sendApprovedToDrafts } from "./publish/index.js";
import { quietStoriesSlideshows } from "./publish/stories-quiet.js";
import { publishDashboardSnapshot } from "./publish/snapshot.js";
import { buildAuthUrl, consumePendingOAuth, tiktokConnected } from "./publish/tiktok.js";
import { assignSchedule, planSchedule } from "./publish/scheduler.js";
import { reskinScheduledPost } from "./publish/reskin.js";
import { pullAnalytics } from "./analytics/pull.js";
import { runDiagnosis } from "./learning/diagnosis.js";
import { evolveWinners } from "./learning/evolve.js";
import { runDailyCycle } from "./cron/daily-cycle.js";
import { ensureAccountTwins } from "./learning/experiments.js";
import { refreshZernioAccounts, zernioPublicStatus } from "./publish/zernio.js";
import { draftCommunityReply, parseCommunityArgs } from "./community/draft.js";
import { ensureMemeWeek, memeResults, postTikTokCutsOnce, previewMemeCopy, replaceClipOnSchedule, retimeMemeWeek, scheduleClipDay, sendFormatsToBoth, setYoutubeSound, swapUpcomingFormats, syncMemes } from "./memes/week.js";

const [command, arg, arg2, arg3] = process.argv.slice(2);

async function main() {
  switch (command) {
    case "generate-new-pillars": {
      if (!env.GENERATE_ENABLED) {
        console.log(GENERATE_PAUSED_MESSAGE);
        break;
      }
      const ids = ["bought_once", "already_did_the_work", "never_feeling"] as const;
      const hookTexts = ids.flatMap((id) => {
        const pillar = CONTENT_PILLARS.find((p) => p.id === id);
        return pillar ? pillar.hooks.slice(0, 2) : [];
      });
      const generated = await generateBatch(hookTexts.length, 1, { hookTexts: [...hookTexts], forceQueued: true });
      console.log(`\nQueued ${generated.length} posts for review. Approved untouched.`);
      for (const g of generated) console.log(`#${g.postId} [${g.status}] ${g.hookText}`);
      break;
    }
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
    case "account-twins": {
      const zn = zernioPublicStatus();
      for (const account of zn.accounts) {
        console.log(`key ${account.keySlot} ${account.group === "2" ? "second" : "main"} ${account.mapped} @${account.handle} ${account.status}`);
      }
      const only = arg ? [Number(arg)] : undefined;
      const result = await ensureAccountTwins(only);
      console.log(`Account twins: ${result.created} created, ${result.skipped} skipped, ${result.failed.length} failed.`);
      for (const fail of result.failed) console.log(`  #${fail.postId}: ${fail.error}`);
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
    case "reskin": {
      if (!arg || !arg2) throw new Error("Usage: cli reskin <postId> <slideDir> [characterId]");
      const n = await reskinScheduledPost(Number(arg), arg2, {
        characterId: arg3,
        updateSlides: process.argv[6] !== "noslides",
      });
      console.log(`Replaced media on ${n} scheduled post(s) for #${arg}.`);
      break;
    }
    case "schedule": {
      const n = assignSchedule(arg ? Number(arg) : 1);
      console.log(`Scheduled ${n} posts.`);
      break;
    }
    case "schedule-preview": {
      const plan = planSchedule(arg ? Number(arg) : 7);
      let lastDay = "";
      for (const a of plan) {
        const when = new Date(a.scheduledAt);
        const day = when.toLocaleDateString("en-US", { timeZone: env.CRON_TZ, weekday: "short", month: "short", day: "numeric" });
        if (day !== lastDay) {
          const count = plan.filter((p) => new Date(p.scheduledAt).toLocaleDateString("en-US", { timeZone: env.CRON_TZ, weekday: "short", month: "short", day: "numeric" }) === day);
          console.log(`\n${day}: ${count.length} posts, ${count.filter((p) => p.platforms.includes("instagram")).length} on Instagram/Facebook`);
          lastDay = day;
        }
        const time = when.toLocaleTimeString("en-US", { timeZone: env.CRON_TZ, hour: "numeric", minute: "2-digit" });
        console.log(`  ${time.padStart(8)}  #${a.postId}  ${a.platforms.join(", ")}`);
      }
      console.log(`\n${plan.length} posts planned (preview only, nothing written).`);
      break;
    }
    case "coming-soon": {
      if (!env.PRELAUNCH) {
        console.log("Coming-soon is off. The app is live — use launch-queue.");
        break;
      }
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
      if (!env.PRELAUNCH) {
        console.log("Coming-soon is off. The app is live — use launch-queue.");
        break;
      }
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
    case "launch-queue": {
      const { postIds } = await applyLiveStoreCtas();
      console.log(`Live App Store CTA on #${postIds.join(", ") || "none"}.`);
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
    case "meme": {
      await memeCli(process.argv.slice(3));
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
    case "community-reply": {
      const { platform, text } = parseCommunityArgs(process.argv.slice(3));
      const draft = await draftCommunityReply(platform, text);
      if (draft.skip) {
        console.log(`Skip (${platform}): ${draft.reason}`);
      } else {
        console.log(draft.reply);
        if (draft.reason) console.log(`\nNote: ${draft.reason}`);
      }
      console.log("\nNot posted. Copy it onto the official account if it still sounds right.");
      break;
    }
    case "copy-audit": {
      // Read-only: how many body slides in each held post are slogans or say nothing concrete.
      const db = getDb();
      const status = arg === "published" ? "published" : "approved";
      const rows = db.select().from(posts).where(eq(posts.status, status)).all();
      const scored = rows.map((post) => {
        const slideRows = db.select().from(slides).where(eq(slides.postId, post.id)).orderBy(asc(slides.idx)).all();
        const template = TEMPLATES[post.templateId ?? ""];
        const hook = post.hookId ? db.select().from(hooks).where(eq(hooks.id, post.hookId)).get() : undefined;
        const score = template
          ? vagueBodyCount(slideRows.map((s) => ({ headline: s.headline ?? "", sub: s.sub ?? "" })), template)
          : { vague: 0, body: 0 };
        return {
          id: post.id,
          twin: parseVariation(post.variation).zernioSlot === "2",
          pillar: matchContentPillar(hook?.text ?? "")?.id ?? "none",
          hook: hook?.text ?? "",
          ...score,
          ratio: score.body ? score.vague / score.body : 1,
        };
      });
      const pass = scored.filter((s) => s.ratio <= 0.34);
      console.log(`${rows.length} posts. Pass (a third or fewer vague body slides): ${pass.length}. Fail: ${rows.length - pass.length}.`);
      const byPillar = new Map<string, number>();
      for (const s of scored) byPillar.set(s.pillar, (byPillar.get(s.pillar) ?? 0) + 1);
      console.log("By pillar:", [...byPillar.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
      for (const s of scored.sort((a, b) => a.ratio - b.ratio)) {
        console.log(`${s.ratio <= 0.34 ? "PASS" : "fail"} #${s.id}${s.twin ? " (twin)" : ""} ${s.vague}/${s.body} vague [${s.pillar}] ${s.hook}`);
      }
      break;
    }
    case "autopilot": {
      // One unattended pass for the Windows task: stats, fill the next week, hand it to Zernio.
      await refreshZernioAccounts().catch((err) => console.warn("Zernio account refresh failed:", err instanceof Error ? err.message : err));
      if (env.ANALYTICS_ENABLED) await pullAnalytics();
      else console.log(ANALYTICS_PAUSED_MESSAGE);
      const scheduled = assignSchedule(arg ? Number(arg) : 7);
      const quiet = await quietStoriesSlideshows().catch((err) => {
        console.error("Stories quiet failed:", err instanceof Error ? err.message : err);
        return 0;
      });
      console.log(`Stories: cancelled ${quiet} slideshow/meme posts that should not go out.`);
      const handed = await handoffScheduled();
      const due = await publishDue();
      console.log(`Autopilot ${new Date().toISOString()}: scheduled ${scheduled}, handed to Zernio ${handed}, published due ${due}.`);
      // Sunday night's task plans the meme week; any other morning, catch up if today has none.
      if (new Date().getDay() !== 0) {
        await ensureMemeWeek({ from: "today" }).catch((err) => console.error("Meme week failed:", err instanceof Error ? err.message : err));
      }
      const memes = await syncMemes().catch((err) => {
        console.error("Meme sync failed:", err instanceof Error ? err.message : err);
        return { cancelled: 0, measured: 0 };
      });
      console.log(`Memes: cancelled ${memes.cancelled} rejected, measured ${memes.measured}.`);
      break;
    }
    case "meme-week": {
      // Sunday-night task: plan, render, and schedule the next 7 days of memes.
      if (arg === "preview") {
        console.log(await previewMemeCopy());
        break;
      }
      if (arg?.startsWith("youtube-sound=")) {
        const original = arg2 !== "cc";
        console.log(`Switched ${await setYoutubeSound(arg.slice(14), original)} YouTube posts to ${original ? "the original sound" : "the CC bed"}.`);
        break;
      }
      if (arg?.startsWith("retime=")) {
        console.log(`Re-timed ${await retimeMemeWeek(arg.slice(7))} scheduled meme posts.`);
        break;
      }
      if (arg?.startsWith("formats=")) {
        console.log(`Scheduled ${await swapUpcomingFormats(arg.slice(8))} posts on new formats.`);
        break;
      }
      if (arg?.startsWith("both=")) {
        console.log(`Scheduled ${await sendFormatsToBoth(arg.slice(5))} posts, both accounts per meme.`);
        break;
      }
      if (arg?.startsWith("clip=")) {
        const n = await scheduleClipDay(
          arg.slice(5),
          "clip-pizza-reach",
          ["Why did I throw my back out"],
          "Why did I throw my back out",
        );
        console.log(`Scheduled ${n} posts for the pizza clip.`);
        break;
      }
      if (arg === "probe") {
        console.log(`Posted ${await postTikTokCutsOnce()} TikTok cuts.`);
        break;
      }
      if (arg === "clip-text") {
        const n = await replaceClipOnSchedule(
          "clip-pizza-reach",
          ["Why did I throw my back out"],
          "Why did I throw my back out",
        );
        console.log(`Updated ${n} scheduled posts.`);
        break;
      }
      const copyArg = [arg, arg2].find((a) => a?.startsWith("copy="));
      const plan = await ensureMemeWeek({ force: arg === "force", copyFile: copyArg?.slice(5) });
      if (plan) console.log(`Planned ${plan.days.length} days from ${plan.weekStart}. Autopost: ${plan.autopost}.`);
      break;
    }
    case "meme-sync": {
      const res = await syncMemes();
      console.log(`Cancelled ${res.cancelled} rejected, measured ${res.measured}.`);
      console.log(memeResults());
      break;
    }
    case "stories-quiet": {
      const n = await quietStoriesSlideshows();
      const memes = await syncMemes();
      console.log(`Stories quiet: cancelled ${n} queued posts. Meme sync cancelled ${memes.cancelled}, measured ${memes.measured}.`);
      break;
    }
    default:
      console.log(`Remedy Growth Engine CLI
Usage: npm run cli -w apps/server -- <command>

Commands:
  community-reply [--platform tiktok] "<comment>"
                        Draft a reply. Does not post.
  complete-manual <id>  Mark one post posted-by-hand and delete its Short
  prune-posted-shorts   Delete shorts for published / completed posts
  coming-soon <id>   Rewrite one post's CTA + caption for pre-store (blocked while live)
  prelaunch-queue    Convert all approved posts to coming-soon (blocked while live)
  launch-queue       Live App Store last-slide + caption on queued/approved posts
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
  meme               Mix and find wallpaper memes. Run: meme help
  meme-week [force]  Plan, render, and schedule the next 7 days of format memes (A/B text per account group)
  meme-sync          Cancel rejected memes, pull views, print the A/B readout
  prune-storage      Delete leftover local slide revisions (keeps current rev + shorts)
  ingest-screenshots Pull new SS from R2 and write descriptions so generate can use them
  expire-shorts      Delete shorts older than 48h after publish (frees R2 + disk)
  snapshot           Upload the phone dashboard snapshot + slides to R2
  tiktok-connect     Print the TikTok login URL, or finish connect after the callback
  publish-due        Publish all approved posts whose slot has arrived
  daily              Run the full daily cycle (pull -> diagnose -> evolve -> generate -> schedule)`);
  }
}

const MEME_PAIR_KEYS = new Set(["seed", "wallpaper", "reaction", "music", "caption", "tone"]);

/** `wallpaper=office-flat` survives `npm run`. npm eats a bare `--wallpaper`. */
function expandMemeArgs(args: string[], keys: ReadonlySet<string>): string[] {
  const out: string[] = [];
  for (const arg of args) {
    const eq = arg.indexOf("=");
    if (eq > 0 && !arg.startsWith("-") && keys.has(arg.slice(0, eq))) {
      out.push(`--${arg.slice(0, eq)}`, arg.slice(eq + 1));
    } else {
      out.push(arg);
    }
  }
  return out;
}

function takeFlag(args: string[], name: string): { value?: string; rest: string[] } {
  const idx = args.indexOf(name);
  if (idx < 0) return { rest: args };
  const value = args[idx + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  return { value, rest: [...args.slice(0, idx), ...args.slice(idx + 2)] };
}

function memeHelp(): string {
  return `Wallpaper memes. 8 seconds, 9:16. Owned parts only.
Usage: npm run cli -w apps/server -- meme <command>

  audit                         Check captions, pairing, and search
  list                          Counts, situations, tones, what is on disk
  missing                       Shot list for wallpaper and reaction files
  parts <words>                 Find captions, wallpapers, reactions, music
  find <words> [seed=n]         Rank full memes for a phrase
  compose [situation] [flags]   Mix one meme
  render [situation] [flags]    Mix one meme and write the mp4
  batch [n] [situation] [flags] Mix several, default 8

Flags use key=value so npm does not eat them:
  wallpaper=id  reaction=id  music=id  caption=id  tone=tone  seed=n`;
}

async function memeCli(argv: string[]): Promise<void> {
  const subPeek = argv.find((arg) => !arg.startsWith("-") && !arg.includes("="));
  const keys = subPeek === "compose" || subPeek === "batch" || subPeek === "render" ? MEME_PAIR_KEYS : new Set(["seed"]);
  const expanded = expandMemeArgs(argv, keys);
  const seeded = takeFlag(expanded, "--seed");
  if (seeded.value !== undefined && !/^\d+$/.test(seeded.value)) throw new Error("--seed must be a whole number");
  const seed = seeded.value === undefined ? undefined : Number(seeded.value);
  const [sub, ...rest0] = seeded.rest;
  if (!sub || sub === "help") {
    console.log(memeHelp());
    return;
  }
  if (sub === "audit") {
    const problems = auditMemeCatalog();
    if (problems.length > 0) {
      console.error(problems.join("\n"));
      throw new Error(`Meme catalog has ${problems.length} problem(s)`);
    }
    console.log("Meme catalog ok.");
    console.log(formatMemeCatalog());
    return;
  }
  if (sub === "list") {
    console.log(formatMemeCatalog());
    return;
  }
  if (sub === "missing") {
    console.log(formatMissingMemeAssets());
    return;
  }
  if (sub === "parts" || sub === "find") {
    const query = rest0.join(" ").trim();
    if (!query) throw new Error(`Usage: meme ${sub} <words>`);
    if (sub === "parts") {
      console.log(formatMemeParts(searchMemeParts(query)));
      return;
    }
    const mixes = findMemes(query, { limit: 8, seed: seed ?? 1 });
    if (mixes.length === 0) {
      console.log("No meme matched that.");
      return;
    }
    console.log(mixes.map((mix) => formatMemeMix(mix, "short")).join("\n\n"));
    return;
  }

  const walled = takeFlag(rest0, "--wallpaper");
  const reacted = takeFlag(walled.rest, "--reaction");
  const musiced = takeFlag(reacted.rest, "--music");
  const captioned = takeFlag(musiced.rest, "--caption");
  const toned = takeFlag(captioned.rest, "--tone");
  if (toned.value !== undefined && !isMemeTone(toned.value)) {
    throw new Error(`Unknown tone "${toned.value}". Check meme list.`);
  }
  const tone = toned.value && isMemeTone(toned.value) ? toned.value : undefined;
  const req = {
    seed: seed ?? Math.floor(Math.random() * 1_000_000_000),
    wallpaperId: walled.value,
    reactionId: reacted.value,
    musicId: musiced.value,
    captionId: captioned.value,
    tone,
  };
  if (sub === "compose" || sub === "render") {
    if (toned.rest.length > 1) throw new Error(`${sub} takes one situation word. For a phrase, use meme find.`);
    const mixes = mixMemes(1, { ...req, situation: toned.rest[0] });
    const mix = mixes[0];
    if (!mix) throw new Error("No meme matched. Try meme list.");
    console.log(`seed ${req.seed}`);
    console.log(formatMemeMix(mix, "full"));
    if (sub === "render") {
      const file = await renderMeme(mix, memeOutputPath(mix));
      console.log(file);
    }
    return;
  }
  if (sub === "batch") {
    const rest = toned.rest;
    let count = 8;
    let situation: string | undefined;
    if (rest[0] && /^\d+$/.test(rest[0])) {
      count = Number(rest[0]);
      situation = rest[1];
      if (rest.length > 2) throw new Error("Usage: meme batch [n] [situation]");
    } else {
      situation = rest[0];
      if (rest.length > 1) throw new Error("Usage: meme batch [n] [situation]");
    }
    const mixes = mixMemes(count, { ...req, situation });
    console.log(`seed ${req.seed}`);
    console.log(formatMemeCatalog().split("\n")[0]);
    console.log(mixes.map((mix) => formatMemeMix(mix, "short")).join("\n\n"));
    return;
  }
  throw new Error(`Unknown meme command "${sub}".\n${memeHelp()}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
