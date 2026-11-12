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

## Removed — do not restore

Remedy original (`custom/`), illlustrations.co, and Open Doodles were deleted.
Do not vendor them back and do not run `scripts/build_remedy_figures.py`.

## Remedy flat (`source: Remedy flat`, `license: owned`)

Same generated scene style as the app onboarding tiles (cream canvas, no
outlines, faceless people, mustard / sage / coral / teal, paper grain).
Source art lives in `flat/src/`; `scripts/wrap_flat_illustrations.py` embeds
it in SVG so Sharp and the SVGs tab render the actual picture — do not
replace these with a geometric redraw.

New SVG slides use this kit only. About 34% of visual covers are Remedy flat.
About 66% are Remedy people photos. 95% of new posts get one or the other on slide 1.

## Remedy people (`source: Remedy people`, `license: owned`)

Photographs in `people/`. Documentary, candid, real rooms. Not flat illustrations,
not gym ads, not yoga form-checks. Reject anything that looks fake.

## What to add later

More Remedy flat scenes and more real people photos. Do not restore Remedy
original, illlustrations.co, or Open Doodles. If it looks like a gym ad, a
furniture catalog, or a form-check diagram, skip it.
