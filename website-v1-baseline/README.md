# Remedy marketing site — remedyrecoveries.com

Static site (no build step) deployed to Cloudflare Pages, project `remedy-web`.

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

- `index.html` — landing page (hero, how it works, why Remedy, CTA)
- `privacy.html` / `terms.html` — draft legal pages (attorney review pending)
- `styles.css` — brand tokens mirrored from `constants/colors.ts`
- `assets/` — logo + favicon copied from `assets/brand/` (logo downscaled to 512px)

Clean URLs (`/privacy`, `/terms`) work automatically on Pages — `.html` is optional.
