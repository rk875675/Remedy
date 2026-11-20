/**
 * Renders HELD sample previews of the pet-native formats into output/pet-held/previews/.
 * Offline only: no R2, no Zernio, no queue, no scheduler. Safe to run any time.
 *
 *   npx tsx src/generation/_pet-preview.ts
 */
import sharp from "sharp";
import { loadPetFormats, loadPetRegistry, petContentLive, renderMadMeme, renderMoodSheet, renderStageSlide, writeHeld, PET_HELD_DIR } from "./pet-formats.js";

async function main(): Promise<void> {
  const formats = loadPetFormats();
  const reg = loadPetRegistry();
  console.log(`Pet formats (held): ${formats.map((f) => f.id).join(", ")}. PET_CONTENT_ENABLED=${petContentLive()}`);

  // 1. mad meme: three samples, bubbles are real in-app lines
  const memes = [
    { id: "mad-01", setup: "me: poking it one more time", reply: "my armadillo:", bubble: "I am NOT amused.", file: reg.moods.angry! },
    { id: "mad-02", setup: "me: it is just a tiny poke", reply: "my armadillo:", bubble: "Rude. Just rude.", file: "s5_angry.png" },
    { id: "mad-03", setup: "me at 3pm, asking for a rest day", reply: "my armadillo:", bubble: "Five more minutes.", file: reg.moods.sleepy! },
  ];
  for (const m of memes) console.log("wrote", writeHeld(`previews/pet-mad-meme/${m.id}.jpg`, await renderMadMeme(m)));

  // 2. stage reveal: cover + five stages + plain closing slide
  const stageLines = [
    "no sessions yet. closed for business.",
    "one session. one eye out. testing the air.",
    "four sessions. sitting up. has opinions.",
    "nine sessions. standing. stretching.",
    "fifteen sessions. fully grown. still naps.",
  ];
  const slides: Buffer[] = [];
  slides.push(await renderStageSlide({ file: reg.stages[0]!.file, title: "he starts curled up", line: "he is not sure about you yet.", dark: false }));
  for (const [i, s] of reg.stages.entries()) {
    slides.push(await renderStageSlide({ file: s.file, title: s.sessions === 1 ? "1 session" : `${s.sessions} sessions`, line: stageLines[i]! }));
  }
  slides.push(await renderStageSlide({ file: reg.stages[4]!.file, title: "he never shrinks", line: "miss a day and he just waits.", dark: false }));
  for (const [i, s] of slides.entries()) writeHeld(`previews/pet-stage-reveal/slide-${String(i + 1).padStart(2, "0")}.jpg`, s);
  const tw = 270;
  const th = 480;
  const sheet = await sharp({ create: { width: tw * slides.length, height: th, channels: 3, background: "#444" } })
    .composite(await Promise.all(slides.map(async (s, i) => ({ input: await sharp(s).resize(tw, th).toBuffer(), left: i * tw, top: 0 }))))
    .jpeg({ quality: 85 })
    .toBuffer();
  console.log("wrote", writeHeld("previews/pet-stage-reveal/_contact.jpg", sheet));

  // 3. mood sheet: two samples
  const sheets = [
    { id: "sheet-01", title: "how the armadillo takes a rest day", cells: [
      { file: reg.moods.sleepy!, label: "five more minutes" },
      { file: reg.moods.reading!, label: "reading, upside down" },
      { file: reg.moods.stretching!, label: "stretching, barely" },
      { file: reg.moods.angry!, label: "do not poke" },
    ] as const },
    { id: "sheet-02", title: "four moods, one armadillo", cells: [
      { file: reg.moods.happy!, label: "pleased with itself" },
      { file: reg.moods.sad!, label: "i will just sit here" },
      { file: reg.moods.celebrating!, label: "session done" },
      { file: reg.moods.bed!, label: "bed at night" },
    ] as const },
  ];
  for (const s of sheets) console.log("wrote", writeHeld(`previews/pet-mood-sheet/${s.id}.jpg`, await renderMoodSheet(s.title, [...s.cells] as never)));
  console.log(`Previews are in ${PET_HELD_DIR}. Nothing was queued, uploaded or scheduled.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
