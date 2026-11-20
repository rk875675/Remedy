/**
 * Read-only audit of everything queued on Zernio across every login: lists
 * scheduled posts by account and flags duplicates, collisions, failures, and
 * anything on a hand-posted (curated) account that the IG schedule does not own.
 *
 *   npx tsx src/publish/_audit-scheduled.ts [--days 8]
 */
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { getDb, posts, ugcVideos } from "@remedy-growth/db";
import { env } from "../config.js";
import { loadMemePlans } from "../memes/week.js";
import { IG_DIR } from "../generation/ig-static.js";
import { isCuratedAccount, loadZernioCache, zernioKeys } from "./zernio.js";

const PostSchema = z
  .object({
    _id: z.string(),
    status: z.string().optional(),
    scheduledFor: z.string().nullable().optional(),
    title: z.string().nullable().optional(),
    content: z.string().nullable().optional(),
    platforms: z
      .array(
        z
          .object({
            platform: z.string().optional(),
            accountId: z.union([z.string(), z.object({ _id: z.string() }).passthrough()]).optional(),
            status: z.string().optional(),
            errorMessage: z.string().nullable().optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

const ListSchema = z
  .object({
    posts: z.array(PostSchema).default([]),
    pagination: z.object({ pages: z.number().optional(), page: z.number().optional() }).passthrough().optional(),
  })
  .passthrough();

type Row = { id: string; slot: string; at: Date; status: string; account: string; handle: string; text: string; error: string };

async function list(slot: string, key: string, status: string): Promise<z.infer<typeof PostSchema>[]> {
  const base = env.ZERNIO_BASE_URL.replace(/\/$/, "");
  const out: z.infer<typeof PostSchema>[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${base}/posts?status=${status}&limit=100&page=${page}`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`key ${slot} /posts ${status} -> ${res.status}`);
    const data = ListSchema.parse(await res.json());
    out.push(...data.posts);
    const pages = data.pagination?.pages ?? 1;
    if (page >= pages || data.posts.length === 0) break;
  }
  return out;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const days = Number(args[args.indexOf("--days") + 1]) || 8;
  const until = Date.now() + days * 86_400_000;
  const accounts = new Map((loadZernioCache()?.accounts ?? []).map((a) => [a.id, a]));
  const igOwned = new Set(
    Object.values(JSON.parse(fs.readFileSync(path.join(IG_DIR, "posted.json"), "utf8")) as Record<string, { zernioPostId: string }>).map((p) => p.zernioPostId),
  );

  const source = new Map<string, string>();
  const ids = (v: unknown): string[] => JSON.stringify(v ?? "").match(/[a-f0-9]{24}/g) ?? [];
  for (const id of igOwned) source.set(id, "ig");
  const crossFile = path.join(IG_DIR, "crossposted.json");
  if (fs.existsSync(crossFile)) for (const id of ids(JSON.parse(fs.readFileSync(crossFile, "utf8")))) source.set(id, "ig");
  for (const plan of loadMemePlans()) for (const id of ids(plan.days)) source.set(id, "meme");
  for (const p of getDb().select({ pp: posts.platformPosts }).from(posts).all()) for (const id of ids(p.pp)) source.set(id, "slide");
  for (const u of getDb().select({ pp: ugcVideos.platformPosts }).from(ugcVideos).all()) for (const id of ids(u.pp)) source.set(id, "ugc");

  const rows: Row[] = [];
  const problems: string[] = [];
  for (const { slot, key } of zernioKeys()) {
    for (const status of ["scheduled", "failed"]) {
      for (const p of await list(slot, key, status)) {
        for (const child of p.platforms.length ? p.platforms : [{ platform: "?", status: p.status }]) {
          const accId = typeof child.accountId === "string" ? child.accountId : (child.accountId?._id ?? "");
          const acct = accounts.get(accId);
          const row: Row = {
            id: p._id,
            slot,
            at: new Date(p.scheduledFor ?? 0),
            status: child.status ?? p.status ?? status,
            account: `${acct?.mapped ?? child.platform ?? "?"}`,
            handle: acct?.handle ?? accId,
            text: `[${source.get(p._id) ?? "unknown"}] ${(p.title || p.content || "").replace(/\s+/g, " ").slice(0, 60)}`,
            error: child.errorMessage ?? "",
          };
          if (status === "failed" && row.at.getTime() > Date.now() - 2 * 86_400_000) problems.push(`FAILED ${row.account}:${row.handle} ${row.at.toLocaleString()} "${row.text}" ${row.error}`);
          if (status === "scheduled") rows.push(row);
          if (status === "scheduled" && acct && isCuratedAccount(acct) && !igOwned.has(p._id)) problems.push(`CURATED account ${row.account}:${row.handle} has a post the IG schedule does not own: ${p._id} ${row.at.toLocaleString()} "${row.text}"`);
        }
      }
    }
  }

  const upcoming = rows.filter((r) => r.at.getTime() <= until).sort((a, b) => a.at.getTime() - b.at.getTime());
  const past = rows.filter((r) => r.at.getTime() < Date.now() - 30 * 60_000);
  for (const r of past) problems.push(`STUCK scheduled in the past: ${r.account}:${r.handle} ${r.at.toLocaleString()} "${r.text}"`);

  const byAccount = new Map<string, Row[]>();
  for (const r of upcoming) byAccount.set(`${r.account}:${r.handle}`, [...(byAccount.get(`${r.account}:${r.handle}`) ?? []), r]);
  for (const [acct, list] of byAccount) {
    const seen = new Map<string, Row>();
    for (let i = 0; i < list.length; i++) {
      const r = list[i]!;
      const prev = list[i - 1];
      if (prev && r.at.getTime() - prev.at.getTime() < 45 * 60_000)
        problems.push(`CLOSE ${acct}: ${prev.at.toLocaleString()} ${prev.id} and ${r.at.toLocaleString()} ${r.id} ("${prev.text}" / "${r.text}")`);
      const k = r.text.toLowerCase();
      if (k && seen.has(k)) problems.push(`DUPLICATE ${acct}: "${r.text}" at ${seen.get(k)!.at.toLocaleString()} and ${r.at.toLocaleString()}`);
      seen.set(k, r);
    }
  }

  console.log(`Scheduled in the next ${days} days: ${upcoming.length} (all queued: ${rows.length})\n`);
  for (const [acct, list] of [...byAccount].sort()) {
    const perDay = new Map<string, number>();
    for (const r of list) {
      const d = r.at.toLocaleDateString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" });
      perDay.set(d, (perDay.get(d) ?? 0) + 1);
    }
    const bySource = new Map<string, number>();
    for (const r of list) {
      const s = r.text.slice(1, r.text.indexOf("]"));
      bySource.set(s, (bySource.get(s) ?? 0) + 1);
    }
    console.log(`${acct.padEnd(36)} ${String(list.length).padStart(3)}  ${[...bySource].map(([s, n]) => `${s}=${n}`).join(" ")}`);
    console.log(`${"".padEnd(41)}${[...perDay].map(([d, n]) => `${d}:${n}`).join(" ")}`);
  }
  const show = args.includes("--list") ? args[args.indexOf("--list") + 1] : undefined;
  if (show) for (const r of byAccount.get(show) ?? []) console.log(`  ${r.at.toLocaleString("en-US", { timeZone: "America/Chicago" })}  ${r.id}  ${r.text}`);
  console.log(`\n${problems.length ? problems.join("\n") : "No problems found."}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
