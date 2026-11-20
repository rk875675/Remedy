---
name: character-deck-build
description: >-
  Build a Remedy growth-engine character carousel (single, split or quad deck) end to end
  with the deterministic shots engine: write the deck JSON with shots, compile exact photo
  briefs, generate, import, validate, render, review. Use when the user asks for new decks,
  slideshows or carousels for Remedy Recoveries / Stories, to redo or rebuild a deck in
  review, or to regenerate deck photos.
---

# Character deck build

Every step is a command or a file edit. Do them in order. Do not improvise the photo
prompts; the compiler prints them.

```
Progress:
- [ ] 1 Pick character, feeling, format
- [ ] 2 Write the deck JSON (beats + shots)
- [ ] 3 --check passes (ignoring "missing photo")
- [ ] 4 Compile briefs
- [ ] 5 Generate each shot from its printed brief
- [ ] 6 Import, look at every photo, regenerate rejects
- [ ] 7 --check passes clean
- [ ] 8 Build (queued) and read the sheets
- [ ] 9 Snapshot
```

All commands run from `growth-engine/apps/server`. Rules of record: `.cursor/rules/growth-engine.mdc`
(sections "References are starting points", "Generated photos — the shots engine",
"Character decks", "Split-comparison decks", "Quad decks", "Deck quality system").

## 1. Pick

- Start from the plan: `npx tsx src/learning/_playbook.ts --plan <N>` writes
  `output/playbook/plan-<date>.json`, one slot per deck (80% exploit arms, 20% explore tests from
  `assets/playbook/tests.json`). Each deck takes its slot's arms (hook kind, format, crop kind,
  length) and copies them into a `plan` field: `{ "slot", "test"?, "arms" }`. In an explore slot,
  follow the test's `brief` and change only the tested arms.
- Character: a folder in `growth-engine/assets/characters/<id>/` with an `anchor.jpg` and an
  entry in `CHARACTERS` in `src/generation/shots.ts`. New character: add both first.
- Feeling: one of `anger | curiosity | mystery | sadness | relief | pride`. Vary across a batch.
- Format: from the plan slot (no fixed mix; the playbook picks it from results).

## 2. Write the deck JSON

Path: `growth-engine/output/deck-queue/<batch>/<character>-<format>-<n>.json`. Copy the shape
from an existing file in `output/deck-queue/oct31/` (`ray-quad-1.json` quad, `andre-split-1.json`
split, `marcus-single-1.json` single). Schema is `DeckSchema` in `src/generation/character-deck.ts`
(Zod strict: unknown keys fail).

Beats (4–9, then the locked CTA is appended automatically):

| Slide | Job | Beat |
|---|---|---|
| 1 | the moment; `headline` == `hook` | photo / split / quad |
| 2 | what it cost or was tried | photo / split / quad (labels carry a number) |
| 3 | the turn, with a count | photo / split / quad |
| any but 1–2 | the proof: exactly one `screenshot` beat, library crop only, `bg` a no-face deck photo | `{ "screenshot": "crop_*.png", "bg": "...", "headline": "..." }` |
| last | the payoff: the character doing the thing they got back, or an object/place | photo, `textAt: "top"` |

Copy rules the check enforces: hook 6–10 words, lowercase, one concrete anchor, no all-caps, no
question; body lines ≤12 words (≤10 for split halves and quad headlines), no slogan shapes, no
banned wording; quad labels ≤5 words with a price/count/time/place; `hookB` for the Stories twin
(different first three words; split hookB also has ` / `).

Shots: required. One entry per photo file in beats (bg photos too); the check fails a new deck
without them. Fields:

```json
{ "file": "q/ray-q1-a2.jpg", "aspect": "3:4",
  "scene": "place and the objects that carry the story, one or two sentences",
  "person": "none | hands | feet | behind | profile | mid | face",
  "doing": "required unless person is none",
  "light": "window-side | dim-morning | overcast-out | low-sun | evening-lamp | car-day | fluorescent | garage-door",
  "textZone": "top (single photos, quad bottom cells) | middle (split halves) | bottom (quad top cells) | none (bg only)",
  "sameRoomAs": "another file in the character folder, when it is the same place",
  "wears": "only when not the character's default clothes",
  "notes": "a detail that must be there" }
```

Defaults for people (reasons in the rules; break them on purpose, note why in `title`/`caption`):
about half the shots show the character, at least one `mid` or `face`, the camera different in
every shot. Quad: the character in about half the cells, one face per cover. Split: same person,
same place in both halves of a slide (`sameRoomAs`). Aspect: `3:4` for single photos and quad
cells, `16:9` for split halves.

## 3. First check

```
npx tsx src/generation/_character-batch.ts ../../output/deck-queue/<batch> --check
```

Fix every `✗` that is not `missing photo`. Read the `·` notes; they are research-backed defaults,
not errors.

## 4. Compile briefs

```
npx tsx src/generation/_shot-prompts.ts ../../output/deck-queue/<batch>/<deck>.json --missing
```

For each shot it prints `save as`, `aspect`, the references in order with their role, and the prompt.

## 5. Generate

One image-tool call per shot, nothing changed:

- `description` = the printed prompt, verbatim
- `filename` = the printed `save as`
- `aspect_ratio` = the printed aspect
- `reference_image_paths` = the printed refs, same order (anchor first whenever a body part shows)

With GenerateImage the files land in `C:\Users\<you>\.cursor\projects\<workspace>\assets\`.
Another model or tool: same prompt, same refs in the same order, same aspect, saved under the
same name in one folder.

## 6. Import and inspect

```
npx tsx src/generation/_shot-prompts.ts ../../output/deck-queue/<batch>/<deck>.json --import "<generated-dir>"
```

It copies into `assets/characters/<id>/` and reports size and aspect problems. Then open every new
photo (Read tool) and reject on any of: a flat band or hard horizontal edge, fused fingers or
toes, floating objects, readable text / labels / digits / logos, glossy skin, a prop that does not
belong in that place (a phone charger on a patio), the wrong person. Regenerate a reject with the
same brief first; if it fails twice, sharpen `scene` or `doing` in the JSON, recompile, regenerate.
`--import --force` overwrites an imported photo.

## 7. Clean check

Step 3 again. It must print `0 problem(s)`.

## 8. Build

```
npx tsx src/generation/_character-batch.ts ../../output/deck-queue/<batch> --only <deck-file-prefix>
```

Builds the Recoveries post as `queued` and its Stories B twin. A deck JSON with `postId` re-renders
that post and its twin in place instead of making new ones; after the first build, add the printed
`#id` to the JSON as `"postId"`. `--approve` schedules without review (only when asked).

Read the sheets: `growth-engine/output/previews/character-batch/<id>-<character>.jpg` and
`<twinId>-<character>-B.jpg`. Open any slide you doubt at full size:
`growth-engine/output/posts/<id>/slide-N-v*.jpg`. Check: text not on a face, labels readable,
no photo used twice, the app slide quotes what the crop shows.

## 9. Snapshot

```
npm run cli -w apps/server -- snapshot
```

(from `growth-engine/`) so Review shows the new slides. Report the post ids, the twin ids, the
format mix line, and anything you chose to test against a default.

## Rebuilding a deck already in review

Edit its queue JSON (it has `postId`), swap or add photos through steps 2–7 with new filenames
(`-a2`, `-thesis2`), then step 8. The old photos stay in the folder; nothing scheduled is touched
unless its JSON is rebuilt.
