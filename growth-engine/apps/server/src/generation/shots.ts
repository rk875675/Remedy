/**
 * Shot specs → exact image prompts. The deterministic half of photo generation.
 *
 * A deck's `shots` describe every photo it needs in a few fixed fields (place,
 * how the person appears, light, where the headline will sit). This module
 * turns each spec into the exact prompt text, the exact reference images in a
 * fixed order, the aspect ratio and the output filename, so the same spec
 * always produces the same brief for any image model. The creative work is the
 * spec; the realism recipe (real references, phone-photo spine, no text) is
 * applied here every time and cannot be forgotten.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import { ROOT_DIR } from "../config.js";

export const ShotAspect = z.enum(["3:4", "16:9", "4:3", "1:1", "9:16"]);
/** How the deck's character appears. Anything but "none" puts the anchor first in the references. */
export const ShotPerson = z.enum(["none", "hands", "feet", "behind", "profile", "mid", "face"]);
/** Light recipes. Each maps to one fixed phrase and one real reference photo. */
export const ShotLight = z.enum(["window-side", "dim-morning", "overcast-out", "low-sun", "evening-lamp", "car-day", "fluorescent", "garage-door"]);
export const ShotSpec = z
  .object({
    /** Path relative to assets/characters/<id>/, e.g. "q/ray-q1-a.jpg". Also the tool's output filename (basename). */
    file: z.string().min(1),
    aspect: ShotAspect,
    /** The place and what is in it. One or two plain sentences. Objects carry the story; name them. */
    scene: z.string().min(12),
    person: ShotPerson.default("none"),
    /** What the person is doing. Required unless person is "none". */
    doing: z.string().optional(),
    light: ShotLight,
    /**
     * Where text will sit on the rendered slide; that band is kept calm. Single photos: "top".
     * Quad cells: the headline crosses the middle seam, so top cells use "bottom" and bottom cells "top".
     */
    textZone: z.enum(["top", "middle", "bottom", "none"]).default("top"),
    /** Another shot's `file` in this deck (or any existing photo in the character folder): passed as a reference so the place stays the same. */
    sameRoomAs: z.string().optional(),
    /** Clothes for this shot. Defaults to the character's usual outfit. */
    wears: z.string().optional(),
    /** Extra specifics (season, a detail that must be there). Appended as is. */
    notes: z.string().optional(),
  })
  .strict();
export type ShotSpecT = z.infer<typeof ShotSpec>;

/** Who each character is, for the prompt, their default clothes, and the real photo whose skin texture to borrow. */
export const CHARACTERS: Record<string, { who: string; wears: string; skinRef: string }> = {
  andre: { who: "a Black man in his early forties with short hair", wears: "a light blue button-down shirt", skinRef: "ref-real-iphone-selfie-man.jpg" },
  chris: { who: "a heavyset white man in his mid thirties with short brown hair and stubble", wears: "a grey zip hoodie over a black t-shirt", skinRef: "ref-real-car-selfie.jpg" },
  dana: { who: "a white woman in her mid thirties with shoulder-length brown hair", wears: "a grey sweatshirt and black leggings", skinRef: "ref-real-skin-woman.jpg" },
  jess: { who: "a white woman in her late twenties with blonde hair in a messy bun", wears: "an oversized grey hoodie and black leggings", skinRef: "ref-real-skin-woman.jpg" },
  linda: { who: "a white woman in her early sixties with a grey bob and reading glasses on a beaded chain", wears: "a cream knit cardigan over a blue top", skinRef: "ref-street-old-woman.jpg" },
  marcus: { who: "a white man in his mid thirties with short dark hair and a trimmed beard", wears: "an olive t-shirt and grey sweatpants", skinRef: "ref-real-car-selfie.jpg" },
  maria: { who: "a Latina woman in her late thirties with dark hair clipped up", wears: "navy scrubs", skinRef: "ref-real-skin-woman.jpg" },
  priya: { who: "a South Asian woman in her late twenties with dark hair in a low ponytail", wears: "a navy crewneck sweater", skinRef: "ref-real-skin-woman.jpg" },
  ray: { who: "a white man in his late fifties with grey hair and a short grey beard", wears: "a tan canvas work jacket, jeans and worn work boots", skinRef: "ref-real-car-selfie.jpg" },
  sam: { who: "a South Asian man in his mid twenties with messy black hair and light stubble", wears: "a grey hoodie and dark joggers", skinRef: "ref-real-iphone-selfie-man.jpg" },
};

type Where = "indoor" | "outdoor" | "car";
const LIGHT: Record<z.infer<typeof ShotLight>, { phrase: string; ref: string; where: Where }> = {
  "window-side": { phrase: "natural window light from one side only, the other side of the room in shadow", ref: "ref-real-desk-window.jpg", where: "indoor" },
  "dim-morning": { phrase: "dim grey early-morning light from one window, the rest of the room still dark", ref: "ref-real-bed-selfie.jpg", where: "indoor" },
  "overcast-out": { phrase: "flat overcast daylight outdoors, pavement still wet", ref: "ref-street-old-woman.jpg", where: "outdoor" },
  "low-sun": { phrase: "low late-afternoon sun from one side, long shadows", ref: "ref-window-film.jpg", where: "outdoor" },
  "evening-lamp": { phrase: "one warm lamp in the evening and a little dusk from the window, the rest of the room dim", ref: "ref-window-film.jpg", where: "indoor" },
  "car-day": { phrase: "grey daylight through a car windshield, dust on the dashboard", ref: "ref-real-car-selfie.jpg", where: "car" },
  fluorescent: { phrase: "dull fluorescent ceiling light mixed with a little daylight from one window", ref: "ref-office-late.jpg", where: "indoor" },
  "garage-door": { phrase: "daylight from an open garage door on one side, the back of the garage in shadow", ref: "ref-real-desk-window.jpg", where: "indoor" },
};

/** The "it's a real place" clause. Indoor details on a patio (a phone charger on the paving) read as fake, so it follows the light recipe. */
const LIVED_IN: Record<Where, string> = {
  indoor: "Tidy but lived in: small real details like an outlet, a charger cable or a mug, no mess.",
  outdoor: "Ordinary and unstaged: small real details like a hose end, a dropped glove or moss between the slabs, no mess.",
  car: "Ordinary and unstaged: small real details like a charging cable in the console or a jacket on the back seat, no mess.",
};

/**
 * Phrased as camera position, not as "keep a band empty": asked for a calm band, image
 * models paint a flat plane with a hard edge. Headroom and a receding floor look natural.
 */
const TEXT_ZONE = {
  top: "Framed with generous headroom, the subject in the lower two thirds and plain wall or sky above, the way a phone photo looks when you step back.",
  middle: "Framed so the subject and objects sit low in the picture and the wall behind is plain at mid height.",
  bottom: "Shot from slightly above eye level so the subject sits in the upper two thirds and the floor or ground recedes toward the camera in natural perspective, nothing else in the foreground.",
  none: "",
} as const;

/** The approved generated photo every no-person shot borrows its look from. */
const APPROVED_LOOK = path.join(ROOT_DIR, "assets", "pins", "bed-edge-young.jpg");
const REFS_DIR = path.join(ROOT_DIR, "assets", "pins", "refs");

function personClause(who: string, wears: string, person: ShotSpecT["person"], doing: string | undefined): string {
  const act = (doing ?? "").replace(/\.$/, "");
  const dressed = `${who} wearing ${wears}`;
  switch (person) {
    case "none":
      return "No people anywhere in the frame.";
    case "hands":
      return `Only the hands and forearms of ${dressed} are in the frame, ${act}. No face.`;
    case "feet":
      return `Only the legs and feet of ${dressed} are in the frame, ${act}. No face.`;
    case "behind":
      return `${cap(dressed)}, seen from directly behind at hip height, ${act}. The face is not visible.`;
    case "profile":
      return `${cap(dressed)}, seen from the side at mid distance, ${act}. The face is in profile or turned away and under a third of the frame height.`;
    case "mid":
      return `${cap(dressed)} at mid distance, ${act}. The whole figure is under two thirds of the frame height; the face is small, plain, no makeup, slightly messy hair.`;
    case "face":
      return `${cap(dressed)}, ${act}, a candid phone photo from about an arm and a half away. Plain face, no makeup, slightly messy hair, soft natural light on the skin, the face under a third of the frame height.`;
  }
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface CompiledShot {
  file: string;
  /** Absolute output path inside the character folder. */
  outPath: string;
  /** Filename to give the image tool (its basename). */
  toolFileName: string;
  aspect: ShotSpecT["aspect"];
  prompt: string;
  /** Absolute reference paths, in the order they must be passed. */
  refs: string[];
  refRoles: string[];
}

/** Build the exact brief for one shot. Same inputs, same output, every time. */
export function compileShot(character: string, shot: ShotSpecT): CompiledShot {
  const profile = CHARACTERS[character];
  if (!profile) throw new Error(`No CHARACTERS entry for "${character}" in shots.ts`);
  if (shot.person !== "none" && !shot.doing) throw new Error(`${shot.file}: "doing" is required when person is "${shot.person}"`);
  const charDir = path.join(ROOT_DIR, "assets", "characters", character);
  const light = LIGHT[shot.light];

  const refs: string[] = [];
  const roles: string[] = [];
  if (shot.person !== "none") {
    refs.push(path.join(charDir, "anchor.jpg"));
    roles.push("identity: same person, same skin tone, hair and build");
    refs.push(path.join(REFS_DIR, profile.skinRef));
    roles.push("real photo: skin texture, grain and light only, never the person");
  } else {
    refs.push(APPROVED_LOOK);
    roles.push("approved look: grain, colour and realism only");
  }
  const lightRef = path.join(REFS_DIR, light.ref);
  if (!refs.includes(lightRef)) {
    refs.push(lightRef);
    roles.push("real photo: lighting and colour only");
  }
  if (shot.sameRoomAs) {
    refs.push(path.join(charDir, shot.sameRoomAs));
    roles.push("same place: keep its walls, furniture, plants and light; only the camera moved");
  }

  const samePlace = "The last reference is the same place: keep its walls, furniture, plants and light; only the camera moved.";
  const refClause =
    shot.person !== "none"
      ? `Reference 1 is the same person: keep their identity, skin tone, hair and build exactly. Reference 2 is a real photo: take only skin texture, grain and light from it, never the person.${shot.sameRoomAs ? ` ${samePlace}` : ""} Any other reference is for lighting, grain and colour realism only; the place is different.`
      : `${shot.sameRoomAs ? `${samePlace} ` : ""}The other references are for lighting, grain, colour and realism only; the place and objects are completely different.`;

  const prompt = [
    `Candid documentary photo, Fujifilm, 35mm, ${light.phrase}.`,
    shot.scene.trim().replace(/\.?$/, "."),
    personClause(profile.who, shot.wears ?? profile.wears, shot.person, shot.doing),
    TEXT_ZONE[shot.textZone],
    shot.notes?.trim().replace(/\.?$/, ".") ?? "",
    LIVED_IN[light.where],
    "Slight grain, a touch soft, slightly off-center, muted colors, not retouched, not a stock photo, not an ad.",
    "No readable text, no labels, no packaging with words, no logos, no digits anywhere.",
    refClause,
  ]
    .filter(Boolean)
    .join(" ");

  return { file: shot.file, outPath: path.join(charDir, shot.file), toolFileName: path.basename(shot.file), aspect: shot.aspect, prompt, refs, refRoles: roles };
}

function aspectRatio(aspect: ShotSpecT["aspect"]): number {
  const [w, h] = aspect.split(":").map(Number) as [number, number];
  return w / h;
}

/** Problems with a photo file against its spec: missing, wrong aspect, too small. */
export async function photoFileProblems(absPath: string, aspect: ShotSpecT["aspect"]): Promise<string[]> {
  if (!fs.existsSync(absPath)) return [`missing photo ${absPath}`];
  const meta = await sharp(absPath).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const out: string[] = [];
  if (Math.min(w, h) < 700) out.push(`${path.basename(absPath)} is ${w}x${h}; need at least 700px on the short side`);
  const want = aspectRatio(aspect);
  if (w && h && Math.abs(w / h - want) / want > 0.06) out.push(`${path.basename(absPath)} is ${w}x${h} (${(w / h).toFixed(2)}); spec says ${aspect} (${want.toFixed(2)})`);
  return out;
}

/** Copy a generated image from the tool's output folder into the character folder. Returns the problems found after copying. */
export async function importShot(compiled: CompiledShot, fromDir: string, force = false): Promise<{ copied: boolean; problems: string[] }> {
  const src = path.join(fromDir, compiled.toolFileName);
  if (fs.existsSync(compiled.outPath) && !force) return { copied: false, problems: [] };
  if (!fs.existsSync(src)) return { copied: false, problems: [`not generated yet: ${src}`] };
  fs.mkdirSync(path.dirname(compiled.outPath), { recursive: true });
  fs.copyFileSync(src, compiled.outPath);
  return { copied: true, problems: await photoFileProblems(compiled.outPath, compiled.aspect) };
}
