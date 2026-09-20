# Remedy Growth Engine

Autonomous carousel/slideshow marketing engine for the Remedy app. Generates TikTok/Instagram photo carousels from app screenshots, publishes them directly through each platform's own API, tracks performance, and iteratively hones in on what works.

**Cost: $0/month.** Text generation runs through the Cursor CLI on your existing plan credits (formula fallback if offline), slides render locally (Sharp), slide hosting is Cloudflare R2 free tier, publishing uses your own free TikTok/Meta developer apps, and the learning loop runs locally in SQLite.

## The loop

1. **Generate** — hooks (Cursor agent + learned formulas) -> per-slide copy -> 6-7 rendered slides per post (1080x1920, screenshots + text overlays, seeded visual variations)
2. **Approve** — mobile-first dashboard, batch-approve the day's queue in 30 seconds
3. **Drafts, then live** — approved posts go to your TikTok inbox as drafts (`Send approved to TikTok drafts`). You finish them in the TikTok app. Instagram/Facebook have no draft API, so they stay off until you set `LIVE_PUBLISH=true`.
4. **Learn** — analytics pulled daily from each platform's API, each post classified in a 2x2 diagnosis matrix (views x engagement); winners get evolved into 3 hook variations, duds get logged as failures, and rules/best-times/best-screens accumulate in the knowledge base that feeds the next batch

## Setup

```powershell
cd growth-engine
npm install
copy .env.example .env   # then fill in the keys below
npm run db:push          # create/migrate the SQLite schema
npm run db:seed          # seed hook formulas + starter rules
```

### 1. Text generation — Cursor CLI (no API key)

```powershell
irm 'https://cursor.com/install?win32=true' | iex
agent login   # opens your browser once
```

That's it — `LLM_PROVIDER=cursor` uses your Cursor plan's auto usage. Optional: set `GEMINI_API_KEY` (free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)) as a backup.

### 2. Slide hosting — Cloudflare R2 (free tier)

TikTok and Instagram fetch images from public HTTPS URLs, so slides need a public home:

1. Cloudflare dashboard -> R2 -> **Create bucket** (e.g. `remedy-growth`)
2. Bucket -> Settings -> **enable public access** (r2.dev subdomain is fine) -> that's your `R2_PUBLIC_BASE_URL`
3. R2 -> **Manage R2 API Tokens** -> create token with Object Read & Write -> fills `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` (`R2_ACCOUNT_ID` is in the dashboard URL)

### 3. TikTok — your own developer app ($0)

1. [developers.tiktok.com](https://developers.tiktok.com) -> Manage apps -> **Create app**
2. Add products: **Login Kit** + **Content Posting API** (enable Direct Post)
3. Scopes: `user.info.basic`, `video.upload`, `video.publish`, `video.list`
4. Register a redirect URI (must be HTTPS) and put it in `TIKTOK_REDIRECT_URI`; copy client key/secret into `.env`
5. Under "Manage URL properties", verify the domain your slides are served from (your R2 public domain)
6. Start the server, open the dashboard **Settings** tab -> **Connect TikTok** -> approve -> paste the `code` from the redirect URL

**Draft mode vs direct post:** `TIKTOK_POST_MODE=MEDIA_UPLOAD` (default) sends each carousel to your TikTok inbox as a draft — you open TikTok, optionally add trending audio, and tap post (~15s each; also warms up the account naturally). Once you submit TikTok's free app **audit** and pass, set `TIKTOK_POST_MODE=DIRECT_POST` for fully autonomous public posting (~15/day/account cap).

### 4. Instagram / Facebook — Meta Graph API ($0)

1. Instagram account must be a **professional** account (free switch in IG settings)
2. [developers.facebook.com](https://developers.facebook.com) -> create an app -> add Instagram Graph API
3. Generate a long-lived access token with `instagram_content_publish` (+ `pages_manage_posts` if using Facebook) — for your own account this works in dev mode, no app review
4. Fill `IG_USER_ID` + `IG_ACCESS_TOKEN` (and optionally `FB_PAGE_ID` + `FB_PAGE_TOKEN`)

Note: long-lived Meta tokens last ~60 days — regenerate when metrics pulls start failing.

## Deploy the live dashboard (slide.remedyrecoveries.com)

Cloudflare Pages project: `remedy-growth`. Production branch: `main`. Custom domain: https://slide.remedyrecoveries.com

```powershell
cd growth-engine
npm run deploy
```

That is the only deploy command. It builds `apps/web` and runs `wrangler pages deploy` with `--branch=main`.

The studio is gated by a shared password. Set it once as a Pages secret (`npx wrangler pages secret put STUDIO_PASSWORD --project-name=remedy-growth`); each browser logs in once (~180-day cookie). If the secret is unset, the gate is off.

**Do not** run `npx wrangler pages deploy` without `--branch=main`. Wrangler then defaults to this repo's git branch (`master`) and lands in Cloudflare **Preview**. The custom domain only serves **Production** (`main`), so the deploy "succeeds" on a `*.pages.dev` preview URL and the live site never updates. If edits look missing after a deploy, that is almost always why — rerun `npm run deploy`, then hard-refresh the custom domain.

## Run

```powershell
npm run build:web   # build the dashboard once
npm run dev         # server + dashboard at http://localhost:3000 (cron included)
```

CLI (no server needed):

```powershell
npm run generate        # generate a batch of posts into the queue
npm run daily           # full cycle: pull -> diagnose -> evolve -> generate -> schedule
npm run pull            # pull analytics from TikTok/IG/FB
npm run diagnose        # run the 2x2 diagnosis matrix
npm run publish-due     # publish approved posts whose slot arrived
```

## Warm-up ramp (avoid tripping spam heuristics on a fresh account)

Set `RAMP_START_DATE` to the day you start posting. With the default `RAMP_SCHEDULE=1:2,8:5,15:10`:

- days 1-7: **2 posts/day**
- days 8-14: **5 posts/day**
- day 15+: **10 posts/day**

The scheduler and daily generation both respect the ramp (today's cap shows in the dashboard Settings tab).

## Autonomy

With the server running:

- **6:00 AM daily** — full cycle runs, new batch lands in the queue
- **You** — open the dashboard, tap "Approve all" (or reject the odd one); in TikTok draft mode, also tap post on the drafts in your TikTok inbox
- **Every 15 min** — approved posts get scheduled into slots and published when their time arrives

To go fully hands-off later: pass TikTok's audit, set `TIKTOK_POST_MODE=DIRECT_POST`, and set `AUTO_APPROVE_CONFIDENCE=65` — posts whose confidence clears the bar skip the queue entirely.

## Layout

```
apps/server/src
  config.ts               env (Zod-validated) + Remedy brand config
  generation/             hooks (Cursor CLI + fallback), templates A/B/C, seeded variations, Sharp compositor
  publish/                r2.ts (slide hosting), tiktok.ts, instagram.ts, facebook.ts, slot scheduler + ramp
  analytics/              per-post metrics pull (native platform APIs) + storage
  learning/               knowledge base, diagnosis matrix, winner evolution
  cron/daily-cycle.ts     the full autonomous loop
  server/index.ts         Hono API + dashboard + TikTok OAuth + cron
apps/web                  React + Tailwind approval dashboard
packages/db               Drizzle schema + seed (SQLite: growth.sqlite)
assets/screenshots        app screenshots used as slide bases
output/posts/<id>/        rendered slides
```
