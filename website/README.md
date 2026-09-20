# Remedy marketing site — remedyrecoveries.com

Static site (no build step) deployed to Cloudflare Pages, project `remedy-web`.
`_worker.js` 301s the production `*.pages.dev` host to the apex so Google does not
treat it as a second copy of the site.

## Deploy

```bash
npx wrangler login   # once, browser OAuth — same flow as scripts/upload_r2.py
npx wrangler pages deploy website --project-name=remedy-web --branch main --commit-dirty=true
```

Run from the repo root. `--branch main` is required: the Pages production branch is
`main` but this repo's git branch is `master`, and without the flag the deploy lands
as a preview. Every deploy is atomic; the production URL updates immediately.

Production URL: https://remedy-web-434.pages.dev

## Custom domain

Live at https://remedyrecoveries.com (and www). DNS CNAMEs (proxied) point at
`remedy-web-434.pages.dev`. Domain was already on Cloudflare Registrar in this
account — no nameserver change needed.

If you ever re-attach:

1. Workers & Pages → `remedy-web` → Custom domains → add apex + www.
2. DNS records (proxied CNAME): `@` and `www` → `remedy-web-434.pages.dev`.

## Files

- `index.html` — landing page (hero, how it works, compare, FAQ, CTA)
- `back-pain-app.html` / `how.html` / `desk.html` — intent pages for search + assistants
- `privacy.html` / `terms.html` / `contact.html` / `unsubscribe.html` — legal + support
- `robots.txt` / `sitemap.xml` / `sitemap.txt` / `llms.txt` / `*.md` — crawl + assistant citation
- IndexNow key file at the site root (public verification file, not a secret)
- www → apex: Worker `www-redirect` (`scripts/www-redirect-worker`), route `www.remedyrecoveries.com/*` only. Apex stays static so Google can fetch `/sitemap.xml`.
- `styles.css` — brand tokens mirrored from `constants/colors.ts`
- `assets/` — logo + favicon copied from `assets/brand/` (logo downscaled to 512px)

Clean URLs (`/privacy`, `/terms`) work automatically on Pages — `.html` is optional.
