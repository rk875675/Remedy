# Illustration curation (do not ignore)

The live dashboard Reject list is the source of truth for taste. Do not
re-add or re-enable assets that match a rejected style.

## Permanently out (user rejected)

See `blocklist.json` → `rejectedIds`. These stay `enabled: false` in the
manifest. Do not vendor more like them:

- Gym / equipment scenes (gym guy, exercise bike, gym time, healthy-habits tile, sport bicycle)
- Object-only still lifes (a lone coffee cup)
- Empty interiors (living room, TV room, cafe, sweet home)
- Duplicate “busy coding desk / app-dev monitors” tiles
- Cute couple / “self care” doodles (`loving`)

## Never restore the old exercise silhouettes

`bridge`, `stretching`, `cat_cow`, `knee_to_chest` were homemade form diagrams.
They looked bad and must not come back.

## Never add a red `!`

Pain is a warm coral glow on the lower back — never a red circle + bang,
never radiating red rays with an “!” badge.

## Keepers from the old set

Restored (no bang) as `custom/`:

- `desk-worker` — hunched at a desk, hand on the back
- `phone-app` — standing, looking at the app
- `spine` — vertebrae with a warm lumbar highlight

## Remedy flat (`source: Remedy flat`, `license: owned`)

Same generated scene style as the app onboarding tiles (cream canvas, no
outlines, faceless people, mustard / sage / coral / teal, paper grain).
Source art lives in `flat/src/`; `scripts/wrap_flat_illustrations.py` embeds
it in SVG so Sharp and the SVGs tab render the actual picture — do not
replace these with a geometric redraw.

These are a separate type from `Remedy original`. The picker may use either
owned kit on a post; it will not mix them with each other or with third-party
tiles in the same carousel.

## Remedy originals (`license: owned`)

`desk-worker`, `phone-app`, `spine`, and the `custom/*.svg` figures built by
`scripts/build_remedy_figures.py` are original vector drawings for Remedy.
They are not traces of Humaaans, Open Doodles, or illlustrations.co.
Style resemblance (flat people, simple shapes) is not copyright.

When adding more:

- Same kit: viewBox 600×700, skin `#f5cba7`, shirt `#4a7c59`, pants `#3d3d3d`,
  coral glow for pain, Remedy-green phone UI.
- **Action only.** One person + one prop, mid-struggle. No idle standing
  portraits (just standing there smiling / holding keys).
- **Keep it simple.** No multi-monitor desks, no 4-tile video calls, no
  furniture catalogs.
- **Funny-wonky is good.** `tying-shoes` and `floor-reach` are keepers because
  they look a little broken — play into that for everyday stretch-struggles
  (sock hop, sneeze, hovering over a chair). It has to read as a relatable
  moment, not a yoga form-check and not uncanny/weird.
- Never overwrite `desk-worker.svg` or `phone-app.svg`.
- Prefer these over third-party tiles on new slides (the picker already does).

## What to add later

More Remedy-owned figures in this kit, tailored to hooks. Do not vendor more
third-party packs unless asked. If it looks like a gym ad, a furniture catalog,
or a form-check diagram, skip it.
