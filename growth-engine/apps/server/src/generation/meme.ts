import { z } from "zod";

/**
 * Wallpaper meme. Measured from the Formats inbox on 2026-10-17
 * (thememesclub01, memesource060, povthatsme).
 *
 * Layers, back to front: full-bleed wallpaper, one reaction GIF in the lower
 * half, centered caption, then a music bed. Reference captions are not reused.
 * Wallpaper, GIF, and music have to be files we own.
 *
 * `planMemeReel` only locks the frame. Finding and mixing owned parts is
 * `findMemes` / `mixMemes` in meme-mix.ts. Rendering waits until a wallpaper
 * and a reaction file are actually in assets/memes/.
 */

export const MEME_W = 1080;
export const MEME_H = 1920;
export const MEME_FPS = 30;
export const MEME_SECONDS = 8;

/** Caption sits in the upper-middle, above the reaction. White, black stroke. */
export const MEME_CAPTION = {
  minLines: 2,
  maxLines: 4,
  minWords: 8,
  maxWords: 18,
  maxCharsPerLine: 42,
  topPct: 0.22,
} as const;

/** Reaction covers roughly the lower-center. It does not fill the frame. */
export const MEME_REACTION = {
  widthPct: 0.46,
  topPct: 0.5,
} as const;

export const memeLineSchema = z.string().trim().min(1).max(MEME_CAPTION.maxCharsPerLine);

export const MemePlanSchema = z
  .object({
    wallpaperFile: z.string().trim().min(1).max(200),
    reactionFile: z.string().trim().min(1).max(200),
    musicId: z.string().trim().min(1).max(40),
    lines: z.array(memeLineSchema).min(MEME_CAPTION.minLines).max(MEME_CAPTION.maxLines),
  })
  .strict();

/** Why a caption cannot go on the locked frame. Null means it fits. */
export function memeCaptionIssue(lines: readonly string[]): string | null {
  if (lines.length < MEME_CAPTION.minLines || lines.length > MEME_CAPTION.maxLines) {
    return `Caption must be ${MEME_CAPTION.minLines}-${MEME_CAPTION.maxLines} lines`;
  }
  for (const line of lines) {
    if (line.trim() !== line || line.length < 1 || line.length > MEME_CAPTION.maxCharsPerLine) {
      return `Each line must be 1-${MEME_CAPTION.maxCharsPerLine} characters`;
    }
    if (!/[a-z]/i.test(line)) return "Each line needs letters";
  }
  const words = lines.join(" ").split(/\s+/).filter(Boolean);
  if (words.length < MEME_CAPTION.minWords || words.length > MEME_CAPTION.maxWords) {
    return `Caption must be ${MEME_CAPTION.minWords}-${MEME_CAPTION.maxWords} words (got ${words.length})`;
  }
  return null;
}

export type MemePlan = z.infer<typeof MemePlanSchema>;

export interface MemeRenderPlan extends MemePlan {
  width: typeof MEME_W;
  height: typeof MEME_H;
  fps: typeof MEME_FPS;
  seconds: typeof MEME_SECONDS;
  captionTopPct: typeof MEME_CAPTION.topPct;
  reactionWidthPct: typeof MEME_REACTION.widthPct;
  reactionTopPct: typeof MEME_REACTION.topPct;
}

export function planMemeReel(input: unknown): MemeRenderPlan {
  const plan = MemePlanSchema.parse(input);
  const issue = memeCaptionIssue(plan.lines);
  if (issue) throw new Error(issue);
  return {
    ...plan,
    width: MEME_W,
    height: MEME_H,
    fps: MEME_FPS,
    seconds: MEME_SECONDS,
    captionTopPct: MEME_CAPTION.topPct,
    reactionWidthPct: MEME_REACTION.widthPct,
    reactionTopPct: MEME_REACTION.topPct,
  };
}
