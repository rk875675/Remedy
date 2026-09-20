/** Slideshow copy is different on purpose — same wording on every UGC clip gets flagged. */
const UGC_COPY_VARIANTS: ReadonlyArray<{ title: string; caption: string }> = [
  {
    title: "Improve your back pain",
    caption: "Remedy is a back pain rehab app. Follow-along exercises that help you improve. Get it — link in bio.",
  },
  {
    title: "Treat back pain at home",
    caption: "A rehab app built to treat back pain — not random stretches. Open Remedy and start. Link in bio.",
  },
  {
    title: "Rehab for backpain",
    caption: "backpain rehab on your phone. Remedy walks you through each exercise. Link in bio.",
  },
];

export const DEFAULT_UGC_TITLE = UGC_COPY_VARIANTS[0].title;
export const DEFAULT_UGC_CAPTION = UGC_COPY_VARIANTS[0].caption;

function pickIndex(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % UGC_COPY_VARIANTS.length;
}

/** We do not parse the uploaded video. Seed (uuid) picks a slightly different generic CTA. */
export function defaultUgcCopy(seed = ""): { title: string; caption: string } {
  const picked = UGC_COPY_VARIANTS[pickIndex(seed)];
  return { title: picked.title, caption: picked.caption };
}

export function clipTitleFromFileName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || "Untitled clip";
}

export function withShortsIfNeeded(text: string, durationSec: number | null, max: number): string {
  const shortEnough = durationSec == null || durationSec <= 60;
  if (!shortEnough || /#shorts/i.test(text)) return text.slice(0, max);
  return `${text.trim()} #Shorts`.slice(0, max);
}
