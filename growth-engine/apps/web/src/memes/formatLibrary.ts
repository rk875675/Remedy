import formatLibrary from "../../../../assets/memes/format-library.json";

export type FormatStats = {
  views: number;
  likes: number;
  comments: number;
  shares?: number;
};

export type FormatPart = {
  label: string;
  kind: "image" | "gif" | "audio" | "text";
  file: string;
  caption: string;
  body?: string;
};

export type LibraryShelf = "formats" | "backgrounds" | "gif" | "text" | "music";

export function partMatchesShelf(part: FormatPart, shelf: LibraryShelf): boolean {
  if (shelf === "backgrounds") return part.kind === "image";
  if (shelf === "gif") return part.kind === "gif";
  if (shelf === "text") return part.kind === "text";
  if (shelf === "music") return part.kind === "audio";
  return false;
}

export type FormatStudy = {
  id: string;
  title: string;
  hook: string;
  summary: string;
  sourceUrl: string;
  poster: string;
  clip: string;
  stats: FormatStats;
  songTitle: string;
  songArtist: string;
  songNote: string;
  sort: number;
  parts: FormatPart[];
};

const formats = [...(formatLibrary.formats as FormatStudy[])].sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));

export const FORMAT_STUDIES: readonly FormatStudy[] = formats;

export function formatAssetUrl(relativeFile: string): string {
  return `/memes/format-library/${relativeFile}`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}
