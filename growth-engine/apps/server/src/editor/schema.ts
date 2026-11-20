import { z } from "zod";

/** Keep in sync with growth-engine/functions/editor.ts */
export const EDITOR_PART_BYTES = 8 * 1024 * 1024;
export const EDITOR_MAX_BYTES = 4 * 1024 * 1024 * 1024;
export const EDITOR_MAX_JOBS = 40;
export const EDITOR_MAX_CLIPS = 12;
export const EDITOR_INDEX_KEY = "growth/editor/index.json";

export const EDITOR_STATUSES = ["uploading", "uploaded", "ready"] as const;
export const CLIP_STATUSES = ["uploading", "uploaded"] as const;
export const CLIP_KINDS = ["talking", "screen", "voice", "other"] as const;
export const EDITOR_MIMES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/aac",
  "audio/x-caf",
] as const;
export const EDITOR_EXTS = ["mp4", "mov", "m4v", "m4a", "mp3", "wav", "aac", "caf"] as const;
export const AUDIO_EXTS = ["m4a", "mp3", "wav", "aac", "caf"] as const;

const statusSchema = z.enum(EDITOR_STATUSES);
const clipStatusSchema = z.enum(CLIP_STATUSES);
const kindSchema = z.enum(CLIP_KINDS);
const mimeSchema = z.enum(EDITOR_MIMES);
const extSchema = z.enum(EDITOR_EXTS);

export const EditorClipSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().min(1).max(80),
    kind: kindSchema,
    fileName: z.string().min(1).max(180),
    mimeType: mimeSchema,
    byteSize: z.number().int().positive().max(EDITOR_MAX_BYTES),
    ext: extSchema,
    r2Key: z.string().min(1).max(300),
    uploadId: z.string().min(1).max(1024).nullable(),
    status: clipStatusSchema,
    error: z.string().max(300).nullable(),
    createdAt: z.string().min(1).max(40),
  })
  .strict();

export type EditorClip = z.infer<typeof EditorClipSchema>;
export type ClipKind = (typeof CLIP_KINDS)[number];
export type EditorExt = (typeof EDITOR_EXTS)[number];
export type EditorMime = (typeof EDITOR_MIMES)[number];

export const EditorCutSchema = z
  .object({
    phase: z.enum(["cutting", "review", "redo", "approved"]),
    summary: z.string().max(2000),
    fixNote: z.string().max(2000).default(""),
    previewKey: z.string().max(300).nullable().default(null),
    startedAt: z.string().min(1).max(40).nullable(),
    updatedAt: z.string().min(1).max(40),
    redo: z
      .array(
        z
          .object({
            clipId: z.string().uuid(),
            note: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(20),
    cuts: z
      .array(
        z
          .object({
            clipId: z.string().uuid(),
            startSec: z.number().min(0).max(60 * 60 * 4),
            endSec: z.number().min(0).max(60 * 60 * 4),
            reason: z.string().min(1).max(300),
          })
          .strict(),
      )
      .max(400),
  })
  .strict();

export type EditorCut = z.infer<typeof EditorCutSchema>;

export const EditorJobSchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(80),
    notes: z.string().max(8000),
    referenceUrl: z.string().max(500),
    postTitle: z.string().max(90).default(""),
    postCaption: z.string().max(2000).default(""),
    postHashtags: z.string().max(200).default(""),
    createdAt: z.string().min(1).max(40),
    updatedAt: z.string().min(1).max(40),
    clips: z.array(EditorClipSchema).max(EDITOR_MAX_CLIPS),
    cut: EditorCutSchema.nullable(),
  })
  .strict();

export type EditorJob = z.infer<typeof EditorJobSchema>;

/** Older saved videos have no cut field. Treat that as "not started". */
export function withCut(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const row = value as Record<string, unknown>;
  if (!("clips" in row) || "cut" in row) return value;
  return { ...row, cut: null };
}

export function freshCut(): EditorCut {
  const now = new Date().toISOString();
  return {
    phase: "cutting",
    summary: "Building one video you can watch.",
    startedAt: null,
    updatedAt: now,
    redo: [],
    cuts: [],
    fixNote: "",
    previewKey: null,
  };
}

export function editorPreviewKey(id: string): string {
  return `growth/editor/${id}/cut.mp4`;
}

/** Single-file jobs from the first inbox. Read once, then stored as a clip list. */
export const LegacyEditorJobSchema = z
  .object({
    id: z.string().uuid(),
    fileName: z.string().min(1).max(180),
    mimeType: z.enum(["video/mp4", "video/quicktime", "video/x-m4v"]),
    byteSize: z.number().int().positive().max(EDITOR_MAX_BYTES),
    ext: z.enum(["mp4", "mov", "m4v"]),
    r2Key: z.string().min(1).max(300),
    uploadId: z.string().min(1).max(1024).nullable(),
    status: statusSchema,
    notes: z.string().max(8000),
    referenceUrl: z.string().max(500),
    createdAt: z.string().min(1).max(40),
    updatedAt: z.string().min(1).max(40),
    error: z.string().max(300).nullable(),
  })
  .strict();

export const EditorIndexEntrySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(80),
    clipCount: z.number().int().min(0).max(EDITOR_MAX_CLIPS),
    byteSize: z.number().int().min(0).max(EDITOR_MAX_BYTES * EDITOR_MAX_CLIPS),
    status: statusSchema,
    createdAt: z.string().min(1).max(40),
    error: z.string().max(300).nullable(),
  })
  .strict();

export const LegacyIndexEntrySchema = z
  .object({
    id: z.string().uuid(),
    fileName: z.string().min(1).max(180),
    byteSize: z.number().int().positive().max(EDITOR_MAX_BYTES),
    mimeType: z.enum(["video/mp4", "video/quicktime", "video/x-m4v"]),
    status: statusSchema,
    createdAt: z.string().min(1).max(40),
    error: z.string().max(300).nullable(),
  })
  .strict();

export const EditorIndexSchema = z
  .object({
    jobs: z.array(EditorIndexEntrySchema).max(EDITOR_MAX_JOBS),
  })
  .strict();

export type EditorIndex = z.infer<typeof EditorIndexSchema>;
export type EditorIndexEntry = z.infer<typeof EditorIndexEntrySchema>;

export const CreateEditorJobSchema = z.union([
  z.object({ title: z.string().min(1).max(80) }).strict(),
  z
    .object({
      fileName: z.string().min(1).max(180),
      mimeType: z.string().max(100),
      byteSize: z.number().int().positive().max(EDITOR_MAX_BYTES),
      title: z.string().min(1).max(80).optional(),
      kind: kindSchema.optional(),
    })
    .strict(),
]);

export const AddEditorClipSchema = z
  .object({
    fileName: z.string().min(1).max(180),
    mimeType: z.string().max(100),
    byteSize: z.number().int().positive().max(EDITOR_MAX_BYTES),
    name: z.string().min(1).max(80).optional(),
    kind: kindSchema.optional(),
  })
  .strict();

export const CompleteEditorJobSchema = z
  .object({
    parts: z
      .array(
        z
          .object({
            partNumber: z.number().int().min(1).max(512),
            etag: z.string().min(1).max(200),
          })
          .strict(),
      )
      .min(1)
      .max(512),
  })
  .strict();

export const PatchEditorJobSchema = z
  .object({
    title: z.string().min(1).max(80),
    notes: z.string().max(8000),
    referenceUrl: z.string().max(500),
    postTitle: z.string().max(90).default(""),
    postCaption: z.string().max(2000).default(""),
    postHashtags: z.string().max(200).default(""),
  })
  .strict();

export const PatchEditorClipSchema = z
  .object({
    name: z.string().min(1).max(80),
    kind: kindSchema,
  })
  .strict();

export const DropEditorCutSchema = z
  .object({
    clipId: z.string().uuid(),
    startSec: z.number().min(0),
  })
  .strict();

export const FixEditorCutSchema = z
  .object({
    note: z.string().min(1).max(2000),
  })
  .strict();

export const ReorderEditorClipsSchema = z
  .object({
    clipIds: z.array(z.string().uuid()).min(1).max(EDITOR_MAX_CLIPS),
  })
  .strict();

export function editorJobKey(id: string): string {
  return `growth/editor/${id}/job.json`;
}

export function editorClipKey(projectId: string, clipId: string, ext: EditorExt): string {
  return `growth/editor/${projectId}/clips/${clipId}/original.${ext}`;
}

export function editorLegacyKey(projectId: string, ext: EditorExt): string {
  return `growth/editor/${projectId}/original.${ext}`;
}

export function clipKeyAllowed(projectId: string, clip: EditorClip): boolean {
  return clip.r2Key === editorClipKey(projectId, clip.id, clip.ext) || clip.r2Key === editorLegacyKey(projectId, clip.ext);
}

export function expectedPartCount(byteSize: number): number {
  return Math.ceil(byteSize / EDITOR_PART_BYTES);
}

export function fileExt(fileName: string): EditorExt | null {
  const match = /\.(mp4|mov|m4v|m4a|mp3|wav|aac|caf)$/i.exec(fileName.trim());
  const ext = match?.[1]?.toLowerCase();
  if (
    ext === "mp4" ||
    ext === "mov" ||
    ext === "m4v" ||
    ext === "m4a" ||
    ext === "mp3" ||
    ext === "wav" ||
    ext === "aac" ||
    ext === "caf"
  ) {
    return ext;
  }
  return null;
}

export function cleanFileName(name: string): string | null {
  const base = name.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f]/g, "").trim() ?? "";
  if (!fileExt(base) || base.length > 180) return null;
  return base;
}

export function displayName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
  return cleaned || fallback;
}

export function nameFromFile(fileName: string): string {
  const stem = fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return displayName(stem, "Clip");
}

export function mimeForExt(ext: EditorExt): EditorMime {
  if (ext === "mov") return "video/quicktime";
  if (ext === "m4v") return "video/x-m4v";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "aac") return "audio/aac";
  if (ext === "caf") return "audio/x-caf";
  return "video/mp4";
}

export function mediaKind(ext: EditorExt): "audio" | "video" {
  return (AUDIO_EXTS as readonly string[]).includes(ext) ? "audio" : "video";
}

export function projectStatus(job: EditorJob): (typeof EDITOR_STATUSES)[number] {
  if (job.clips.some((clip) => clip.status === "uploading")) return "uploading";
  if (job.notes.trim()) return "ready";
  return "uploaded";
}

const REFERENCE_HOSTS = new Set(["tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "instagram.com"]);

/** Empty is allowed. Otherwise an https TikTok or Instagram link. */
export function normalizeReferenceUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return "";
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (!REFERENCE_HOSTS.has(host)) return null;
  return url.toString();
}

export function toPublicClip(jobId: string, clip: EditorClip): {
  id: string;
  name: string;
  kind: ClipKind;
  fileName: string;
  mimeType: EditorMime;
  byteSize: number;
  status: EditorClip["status"];
  error: string | null;
  createdAt: string;
  media: "audio" | "video";
  fileUrl: string | null;
} {
  return {
    id: clip.id,
    name: clip.name,
    kind: clip.kind,
    fileName: clip.fileName,
    mimeType: clip.mimeType,
    byteSize: clip.byteSize,
    status: clip.status,
    error: clip.error,
    createdAt: clip.createdAt,
    media: mediaKind(clip.ext),
    fileUrl: clip.status === "uploading" ? null : `/api/editor/jobs/${jobId}/clips/${clip.id}/file`,
  };
}

export function toPublicJob(job: EditorJob): {
  id: string;
  title: string;
  notes: string;
  referenceUrl: string;
  postTitle: string;
  postCaption: string;
  postHashtags: string;
  status: (typeof EDITOR_STATUSES)[number];
  byteSize: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  cut: (EditorCut & { previewUrl: string | null }) | null;
  clips: ReturnType<typeof toPublicClip>[];
} {
  return {
    id: job.id,
    title: job.title,
    notes: job.notes,
    referenceUrl: job.referenceUrl,
    postTitle: job.postTitle,
    postCaption: job.postCaption,
    postHashtags: job.postHashtags,
    status: projectStatus(job),
    byteSize: job.clips.reduce((sum, clip) => sum + clip.byteSize, 0),
    error: job.clips.find((clip) => clip.error)?.error ?? null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    cut: job.cut
      ? {
          ...job.cut,
          previewUrl: job.cut.previewKey
            ? `/api/editor/jobs/${job.id}/cut/file?t=${encodeURIComponent(job.cut.updatedAt)}`
            : null,
        }
      : null,
    clips: job.clips.map((clip) => toPublicClip(job.id, clip)),
  };
}

export function toIndexEntry(job: EditorJob): EditorIndexEntry {
  const pub = toPublicJob(job);
  return {
    id: job.id,
    title: job.title,
    clipCount: job.clips.length,
    byteSize: pub.byteSize,
    status: pub.status,
    createdAt: job.createdAt,
    error: pub.error,
  };
}
