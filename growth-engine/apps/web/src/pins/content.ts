/**
 * One-time pinned slideshows. Not part of the queue, generate, or CTA gallery.
 * Copy on the art is the introduction, the method, and the callout.
 * The medical line stays in the caption only.
 */

export const PIN_W = 1080;
export const PIN_H = 1350;
export const PIN_SITE_URL = "https://remedyrecoveries.com";
export const PIN_CTA = "Download Remedy on the App Store — link in bio";

export type PinBg = "cream" | "green";
export type PinShot = "session" | "progress" | "workout_days" | "pain_check" | "session_preview" | "cat_cow";

export type PinSlide = {
  bg: PinBg;
  /** Pre-broken Georgia lines. Two lines is the frame style. */
  headline: readonly string[];
  sub: readonly string[];
  shot?: PinShot;
  /** Default: centered under the type. top: big phone, type at the bottom. tilt: angled, bleeds right, type left. */
  phoneLayout?: "center" | "top" | "tilt";
  /** Full-bleed photo. Never on a cover. Path is relative to the repo root. */
  photo?: string;
  /** Where the type sits on a photo. Bottom keeps a face clear. */
  photoText?: "top" | "bottom";
  /** App icon above the headline. Covers only. */
  mark?: boolean;
  /** Sub in the headline color. Use when the line under should hit, not explain. */
  subStrong?: boolean;
};

export type PinPost = {
  id: "what" | "why" | "who";
  slot: string;
  label: string;
  /** Why this pin exists. Shown in the tab, not on the art. */
  purpose: string;
  title: string;
  caption: string;
  hashtags: string;
  slides: readonly PinSlide[];
};

export function pinSlideFile(postId: string, index: number): string {
  return `${postId}-${String(index + 1).padStart(2, "0")}.jpg`;
}

export function pinSlideSrc(postId: string, index: number): string {
  return `/pins/${pinSlideFile(postId, index)}`;
}

export function pinCaption(post: PinPost): string {
  return [post.caption.trim(), post.hashtags.trim()].filter(Boolean).join("\n\n");
}

const TAGS = "#backpain #backpainrelief #lowerbackpain #posture #physicaltherapy";

export const PIN_POSTS: readonly PinPost[] = [
  {
    id: "what",
    slot: "Pin 1",
    label: "What is Remedy?",
    purpose: "The introduction. What it is, why we built it, then the session.",
    title: "What is Remedy — a back relief program",
    caption: `What is Remedy?

We build a program for your back. A structured back relief program, from your answers, for your back pain.

A video ends. Your back pain does not. The app shows the session. The back program moves each week.

Educational exercise guidance, not medical care.`,
    hashtags: TAGS,
    slides: [
      {
        bg: "cream",
        mark: true,
        headline: ["What is", "Remedy?"],
        sub: ["We build a program for your back.", "For your back pain. Not a random video."],
      },
      {
        bg: "cream",
        photo: "growth-engine/assets/pins/bed-edge-young.jpg",
        photoText: "bottom",
        headline: ["Why we", "built Remedy."],
        sub: ["A video ends.", "Your back pain does not."],
      },
      {
        bg: "cream",
        shot: "session",
        phoneLayout: "top",
        headline: ["A session", "for your back."],
        sub: ["One day of your back program.", "You follow the video."],
      },
      {
        bg: "green",
        shot: "progress",
        phoneLayout: "tilt",
        headline: ["Your back program", "moves each week."],
        sub: ["The weeks stay in order.", "You do not start over."],
      },
      {
        bg: "green",
        headline: ["A program", "for your back."],
        sub: ["Your back pain.", "Your answers. Your plan."],
      },
    ],
  },
  {
    id: "why",
    slot: "Pin 2",
    label: "Why Remedy works",
    purpose: "Personalized program, then consistency.",
    title: "Why Remedy works — your program, then you keep it",
    caption: `Why Remedy works.

Your answers build a back program. Not one list for every back. Then consistency: the same back program, on your days, every week.

Educational exercise guidance, not medical care.`,
    hashtags: TAGS,
    slides: [
      {
        bg: "cream",
        mark: true,
        headline: ["Why Remedy", "works."],
        sub: ["A back program that is yours.", "The same one each week."],
      },
      {
        bg: "cream",
        photo: "growth-engine/assets/pins/floor-phone.jpg",
        headline: ["Built for", "your back."],
        sub: ["Your answers write your back program.", "Not one list for every back."],
      },
      {
        bg: "green",
        shot: "workout_days",
        headline: ["Your back days.", "You keep them."],
        sub: ["Same back program.", "Week after week."],
      },
      {
        bg: "cream",
        photo: "growth-engine/assets/pins/glute-bridge-real.jpg",
        headline: ["Consistency is", "the whole plan."],
        sub: ["Your back program picks up", "where you left off."],
      },
    ],
  },
  {
    id: "who",
    slot: "Pin 3",
    label: "Who should use Remedy?",
    purpose: "A direct callout. The feeling, then the moments they already know.",
    title: "This is for you if your back hurts",
    caption: `Who has back pain.

You think about your back pain. Getting up from the chair hurts. The first rep is hard. The first step out of bed tells you the day. Being careful is not a back program.

Educational exercise guidance, not medical care.`,
    hashtags: TAGS,
    slides: [
      {
        bg: "cream",
        mark: true,
        subStrong: true,
        headline: ["Who has", "back pain."],
        sub: ["You are tired of the pain.", "Your back still hurts."],
      },
      {
        bg: "cream",
        photo: "growth-engine/assets/illustrations/people/woman-window-back-ache.jpg",
        photoText: "bottom",
        subStrong: true,
        headline: ["You think about", "your back pain."],
        sub: ["Before you stand.", "Before you even try."],
      },
      {
        bg: "cream",
        subStrong: true,
        headline: ["Getting up hurts", "your back."],
        sub: ["The chair. Every time.", "You wait for the pain."],
      },
      {
        bg: "cream",
        photo: "growth-engine/assets/illustrations/people/man-garage-deadlift-pain.jpg",
        subStrong: true,
        headline: ["You still want", "to train."],
        sub: ["Your back pain makes", "the first rep hard."],
      },
      {
        bg: "cream",
        photo: "growth-engine/assets/illustrations/people/man-bed-morning-wince.jpg",
        photoText: "bottom",
        subStrong: true,
        headline: ["Your back hurts", "getting out of bed."],
        sub: ["The first step.", "You already know the day."],
      },
      {
        bg: "green",
        subStrong: true,
        headline: ["Back pain needs", "a program."],
        sub: ["Being careful", "is not a back plan."],
      },
    ],
  },
];
