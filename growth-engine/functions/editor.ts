/**
 * Founder video inbox on the live studio.
 * A video is an ordered list of original clips. Parts are stored with the R2
 * multipart API. Nothing is transcoded.
 * Keep limits and JSON keys in sync with apps/server/src/editor/schema.ts.
 */

const PART_BYTES = 8 * 1024 * 1024;
const MAX_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_JOBS = 40;
const MAX_CLIPS = 12;
const INDEX_KEY = "growth/editor/index.json";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERENCE_HOSTS = new Set(["tiktok.com", "vm.tiktok.com", "vt.tiktok.com", "instagram.com"]);
const AUDIO = new Set(["m4a", "mp3", "wav", "aac", "caf"]);

type Ext = "mp4" | "mov" | "m4v" | "m4a" | "mp3" | "wav" | "aac" | "caf";
type Mime =
  | "video/mp4"
  | "video/quicktime"
  | "video/x-m4v"
  | "audio/mp4"
  | "audio/mpeg"
  | "audio/wav"
  | "audio/aac"
  | "audio/x-caf";
type Kind = "talking" | "screen" | "voice" | "other";
type ProjectStatus = "uploading" | "uploaded" | "ready";

interface Clip {
  id: string;
  name: string;
  kind: Kind;
  fileName: string;
  mimeType: Mime;
  byteSize: number;
  ext: Ext;
  r2Key: string;
  uploadId: string | null;
  status: "uploading" | "uploaded";
  error: string | null;
  createdAt: string;
}

interface CutSpan {
  clipId: string;
  startSec: number;
  endSec: number;
  reason: string;
}

interface Cut {
  phase: "cutting" | "review" | "redo" | "approved";
  summary: string;
  fixNote: string;
  previewKey: string | null;
  startedAt: string | null;
  updatedAt: string;
  redo: Array<{ clipId: string; note: string }>;
  cuts: CutSpan[];
}

interface Job {
  id: string;
  title: string;
  notes: string;
  referenceUrl: string;
  postTitle: string;
  postCaption: string;
  postHashtags: string;
  createdAt: string;
  updatedAt: string;
  clips: Clip[];
  cut: Cut | null;
}

interface IndexEntry {
  id: string;
  title: string;
  clipCount: number;
  byteSize: number;
  status: ProjectStatus;
  createdAt: string;
  error: string | null;
}

interface EditorObject {
  text(): Promise<string>;
  body: ReadableStream | null;
  size: number;
  range?: { offset?: number; end?: number };
  writeHttpMetadata(headers: Headers): void;
}

interface EditorMultipart {
  uploadId: string;
  uploadPart(partNumber: number, value: ReadableStream): Promise<{ partNumber: number; etag: string }>;
  complete(parts: Array<{ partNumber: number; etag: string }>): Promise<unknown>;
  abort(): Promise<void>;
}

interface EditorBucket {
  get(key: string, options?: { range?: Headers }): Promise<EditorObject | null>;
  head(key: string): Promise<{ size: number } | null>;
  put(key: string, value: string, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  delete(key: string): Promise<void>;
  createMultipartUpload(
    key: string,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } },
  ): Promise<EditorMultipart>;
  resumeMultipartUpload(key: string, uploadId: string): EditorMultipart;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function jobKey(id: string): string {
  return `growth/editor/${id}/job.json`;
}

function clipKey(projectId: string, clipId: string, ext: Ext): string {
  return `growth/editor/${projectId}/clips/${clipId}/original.${ext}`;
}

function legacyKey(projectId: string, ext: Ext): string {
  return `growth/editor/${projectId}/original.${ext}`;
}

function fileExt(fileName: string): Ext | null {
  const match = /\.(mp4|mov|m4v|m4a|mp3|wav|aac|caf)$/i.exec(fileName.trim());
  const ext = match?.[1]?.toLowerCase();
  if (ext === "mp4" || ext === "mov" || ext === "m4v" || ext === "m4a" || ext === "mp3" || ext === "wav" || ext === "aac" || ext === "caf") {
    return ext;
  }
  return null;
}

function cleanFileName(name: string): string | null {
  const base = name.split(/[/\\]/).pop()?.replace(/[\u0000-\u001f]/g, "").trim() ?? "";
  if (!fileExt(base) || base.length > 180) return null;
  return base;
}

function displayName(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 80);
  return cleaned || fallback;
}

function nameFromFile(fileName: string): string {
  return displayName(fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "), "Clip");
}

function mimeForExt(ext: Ext): Mime {
  if (ext === "mov") return "video/quicktime";
  if (ext === "m4v") return "video/x-m4v";
  if (ext === "m4a") return "audio/mp4";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "aac") return "audio/aac";
  if (ext === "caf") return "audio/x-caf";
  return "video/mp4";
}

function isKind(value: unknown): value is Kind {
  return value === "talking" || value === "screen" || value === "voice" || value === "other";
}

function isExt(value: unknown): value is Ext {
  return value === "mp4" || value === "mov" || value === "m4v" || value === "m4a" || value === "mp3" || value === "wav" || value === "aac" || value === "caf";
}

function isMime(value: unknown): value is Mime {
  return (
    value === "video/mp4" ||
    value === "video/quicktime" ||
    value === "video/x-m4v" ||
    value === "audio/mp4" ||
    value === "audio/mpeg" ||
    value === "audio/wav" ||
    value === "audio/aac" ||
    value === "audio/x-caf"
  );
}

function keyAllowed(projectId: string, clip: Clip): boolean {
  return clip.r2Key === clipKey(projectId, clip.id, clip.ext) || clip.r2Key === legacyKey(projectId, clip.ext);
}

function projectStatus(job: Job): ProjectStatus {
  if (job.clips.some((clip) => clip.status === "uploading")) return "uploading";
  if (job.notes.trim()) return "ready";
  return "uploaded";
}

function publicClip(jobId: string, clip: Clip): Record<string, unknown> {
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
    media: AUDIO.has(clip.ext) ? "audio" : "video",
    fileUrl: clip.status === "uploading" ? null : `/api/editor/jobs/${jobId}/clips/${clip.id}/file`,
  };
}

function publicJob(job: Job): Record<string, unknown> {
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
    clips: job.clips.map((clip) => publicClip(job.id, clip)),
  };
}

function indexEntry(job: Job): IndexEntry {
  const pub = publicJob(job);
  return {
    id: job.id,
    title: job.title,
    clipCount: job.clips.length,
    byteSize: pub.byteSize as number,
    status: pub.status as ProjectStatus,
    createdAt: job.createdAt,
    error: (pub.error as string | null) ?? null,
  };
}

function normalizeReference(raw: string): string | null {
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

function readClip(value: unknown, projectId: string): Clip | null {
  if (!isRecord(value)) return null;
  const keys = ["id", "name", "kind", "fileName", "mimeType", "byteSize", "ext", "r2Key", "uploadId", "status", "error", "createdAt"];
  if (Object.keys(value).length !== keys.length || keys.some((key) => !(key in value))) return null;
  if (typeof value.id !== "string" || !UUID_RE.test(value.id)) return null;
  if (typeof value.name !== "string" || value.name.length < 1 || value.name.length > 80) return null;
  if (!isKind(value.kind) || !isMime(value.mimeType) || !isExt(value.ext)) return null;
  if (typeof value.fileName !== "string" || value.fileName.length < 1 || value.fileName.length > 180) return null;
  if (typeof value.byteSize !== "number" || !Number.isInteger(value.byteSize) || value.byteSize < 1 || value.byteSize > MAX_BYTES) return null;
  if (typeof value.r2Key !== "string") return null;
  if (!(value.uploadId === null || (typeof value.uploadId === "string" && value.uploadId.length > 0 && value.uploadId.length <= 1024))) return null;
  if (value.status !== "uploading" && value.status !== "uploaded") return null;
  if (!(value.error === null || (typeof value.error === "string" && value.error.length <= 300))) return null;
  if (typeof value.createdAt !== "string") return null;
  const clip: Clip = {
    id: value.id,
    name: value.name,
    kind: value.kind,
    fileName: value.fileName,
    mimeType: value.mimeType,
    byteSize: value.byteSize,
    ext: value.ext,
    r2Key: value.r2Key,
    uploadId: value.uploadId,
    status: value.status,
    error: value.error,
    createdAt: value.createdAt,
  };
  if (!keyAllowed(projectId, clip)) return null;
  return clip;
}

function readCut(value: unknown): Cut | null {
  if (value == null) return null;
  if (!isRecord(value)) return null;
  const phase = value.phase;
  if (phase !== "cutting" && phase !== "review" && phase !== "redo" && phase !== "approved") return null;
  if (typeof value.summary !== "string" || typeof value.updatedAt !== "string") return null;
  if (!(value.startedAt === null || typeof value.startedAt === "string")) return null;
  if (!Array.isArray(value.redo) || !Array.isArray(value.cuts)) return null;
  const redo: Cut["redo"] = [];
  for (const row of value.redo) {
    if (!isRecord(row) || typeof row.clipId !== "string" || typeof row.note !== "string") return null;
    redo.push({ clipId: row.clipId, note: row.note });
  }
  const cuts: CutSpan[] = [];
  for (const row of value.cuts) {
    if (!isRecord(row) || typeof row.clipId !== "string" || typeof row.startSec !== "number" || typeof row.endSec !== "number" || typeof row.reason !== "string") {
      return null;
    }
    cuts.push({ clipId: row.clipId, startSec: row.startSec, endSec: row.endSec, reason: row.reason });
  }
  return {
    phase,
    summary: value.summary,
    fixNote: typeof value.fixNote === "string" ? value.fixNote.slice(0, 2000) : "",
    previewKey: typeof value.previewKey === "string" ? value.previewKey : null,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    redo,
    cuts,
  };
}

function byteRange(header: string, fullSize: number): { offset: number; length: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match || fullSize <= 0) return null;
  const startRaw = match[1] ?? "";
  const endRaw = match[2] ?? "";
  if (startRaw === "" && endRaw === "") return null;
  if (startRaw === "") {
    const suffix = Math.min(Number(endRaw), fullSize);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    return { offset: fullSize - suffix, length: suffix };
  }
  const offset = Number(startRaw);
  if (!Number.isFinite(offset) || offset < 0 || offset >= fullSize) return null;
  const end = endRaw === "" ? fullSize - 1 : Math.min(Number(endRaw), fullSize - 1);
  if (!Number.isFinite(end) || end < offset) return null;
  return { offset, length: end - offset + 1 };
}

function readJobRecord(value: unknown): Job | null {
  if (!isRecord(value) || !Array.isArray(value.clips)) return null;
  const required = ["id", "title", "notes", "referenceUrl", "createdAt", "updatedAt", "clips"];
  const allowed = new Set([...required, "cut", "postTitle", "postCaption", "postHashtags"]);
  const keys = Object.keys(value);
  if (required.some((key) => !(key in value)) || keys.some((key) => !allowed.has(key))) return null;
  if (typeof value.id !== "string" || !UUID_RE.test(value.id)) return null;
  if (typeof value.title !== "string" || value.title.length < 1 || value.title.length > 80) return null;
  if (typeof value.notes !== "string" || value.notes.length > 8000) return null;
  if (typeof value.referenceUrl !== "string" || value.referenceUrl.length > 500) return null;
  if (value.postTitle !== undefined && (typeof value.postTitle !== "string" || value.postTitle.length > 90)) return null;
  if (value.postCaption !== undefined && (typeof value.postCaption !== "string" || value.postCaption.length > 2000)) return null;
  if (value.postHashtags !== undefined && (typeof value.postHashtags !== "string" || value.postHashtags.length > 200)) return null;
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return null;
  if (value.clips.length > MAX_CLIPS) return null;
  const clips: Clip[] = [];
  for (const row of value.clips) {
    const clip = readClip(row, value.id);
    if (!clip) return null;
    clips.push(clip);
  }
  return {
    id: value.id,
    title: value.title,
    notes: value.notes,
    referenceUrl: value.referenceUrl,
    postTitle: typeof value.postTitle === "string" ? value.postTitle : "",
    postCaption: typeof value.postCaption === "string" ? value.postCaption : "",
    postHashtags: typeof value.postHashtags === "string" ? value.postHashtags : "",
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    clips,
    cut: "cut" in value ? readCut(value.cut) : null,
  };
}

function readLegacy(value: unknown): Job | null {
  if (!isRecord(value) || "clips" in value) return null;
  if (typeof value.id !== "string" || !UUID_RE.test(value.id)) return null;
  if (typeof value.fileName !== "string" || typeof value.byteSize !== "number") return null;
  if (value.ext !== "mp4" && value.ext !== "mov" && value.ext !== "m4v") return null;
  if (value.mimeType !== "video/mp4" && value.mimeType !== "video/quicktime" && value.mimeType !== "video/x-m4v") return null;
  if (typeof value.r2Key !== "string" || typeof value.notes !== "string" || typeof value.referenceUrl !== "string") return null;
  if (typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return null;
  if (!(value.uploadId === null || typeof value.uploadId === "string")) return null;
  if (!(value.error === null || typeof value.error === "string")) return null;
  const status = value.status === "uploading" ? "uploading" : "uploaded";
  const clip: Clip = {
    id: crypto.randomUUID(),
    name: nameFromFile(value.fileName),
    kind: "other",
    fileName: value.fileName,
    mimeType: value.mimeType,
    byteSize: value.byteSize,
    ext: value.ext,
    r2Key: value.r2Key,
    uploadId: value.uploadId,
    status,
    error: value.error,
    createdAt: value.createdAt,
  };
  if (!keyAllowed(value.id, clip)) return null;
  return {
    id: value.id,
    title: nameFromFile(value.fileName),
    notes: value.notes,
    referenceUrl: value.referenceUrl,
    postTitle: "",
    postCaption: "",
    postHashtags: "",
    cut: null,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    clips: [clip],
  };
}

async function saveIndex(bucket: EditorBucket, jobs: IndexEntry[]): Promise<void> {
  const sorted = [...jobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  await bucket.put(INDEX_KEY, JSON.stringify({ jobs: sorted }), { httpMetadata: { contentType: "application/json" } });
}

async function loadIndex(bucket: EditorBucket): Promise<IndexEntry[]> {
  const obj = await bucket.get(INDEX_KEY);
  if (!obj) return [];
  const parsed = JSON.parse(await obj.text()) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.jobs)) throw new Error("Editor index is unreadable.");
  const jobs: IndexEntry[] = [];
  let legacy = false;
  for (const row of parsed.jobs) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.createdAt !== "string") {
      throw new Error("Editor index is unreadable.");
    }
    if (typeof row.title === "string" && typeof row.clipCount === "number" && typeof row.byteSize === "number") {
      const status = row.status === "uploading" || row.status === "uploaded" || row.status === "ready" ? row.status : null;
      if (!status || !(row.error === null || typeof row.error === "string")) throw new Error("Editor index is unreadable.");
      jobs.push({
        id: row.id,
        title: row.title,
        clipCount: row.clipCount,
        byteSize: row.byteSize,
        status,
        createdAt: row.createdAt,
        error: row.error,
      });
      continue;
    }
    if (typeof row.fileName !== "string" || typeof row.byteSize !== "number") throw new Error("Editor index is unreadable.");
    const status = row.status === "uploading" || row.status === "uploaded" || row.status === "ready" ? row.status : null;
    if (!status) throw new Error("Editor index is unreadable.");
    legacy = true;
    jobs.push({
      id: row.id,
      title: nameFromFile(row.fileName),
      clipCount: 1,
      byteSize: row.byteSize,
      status,
      createdAt: row.createdAt,
      error: typeof row.error === "string" ? row.error : null,
    });
  }
  if (legacy) await saveIndex(bucket, jobs);
  return jobs;
}

async function saveJob(bucket: EditorBucket, job: Job): Promise<void> {
  await bucket.put(jobKey(job.id), JSON.stringify(job), { httpMetadata: { contentType: "application/json" } });
  const jobs = (await loadIndex(bucket)).filter((row) => row.id !== job.id);
  jobs.push(indexEntry(job));
  await saveIndex(bucket, jobs);
}

async function loadJob(bucket: EditorBucket, id: string): Promise<Job | null> {
  const obj = await bucket.get(jobKey(id));
  if (!obj) return null;
  const parsed = JSON.parse(await obj.text()) as unknown;
  const current = readJobRecord(parsed);
  if (current) return current;
  const legacy = readLegacy(parsed);
  if (!legacy) return null;
  await saveJob(bucket, legacy);
  return legacy;
}

async function startClip(bucket: EditorBucket, projectId: string, fileNameRaw: string, byteSize: number, name: string | undefined, kind: Kind): Promise<Clip> {
  const fileName = cleanFileName(fileNameRaw);
  const ext = fileName ? fileExt(fileName) : null;
  if (!fileName || !ext) throw new Error("Upload an mp4, mov, m4v, or an audio file (m4a, mp3, wav).");
  const id = crypto.randomUUID();
  const r2Key = clipKey(projectId, id, ext);
  const mimeType = mimeForExt(ext);
  const upload = await bucket.createMultipartUpload(r2Key, {
    httpMetadata: { contentType: mimeType, cacheControl: "private, no-store" },
  });
  return {
    id,
    name: displayName(name ?? "", nameFromFile(fileName)),
    kind,
    fileName,
    mimeType,
    byteSize,
    ext,
    r2Key,
    uploadId: upload.uploadId,
    status: "uploading",
    error: null,
    createdAt: new Date().toISOString(),
  };
}

function partsOf(url: string): string[] {
  return new URL(url).pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
}

export async function handleEditor(request: Request, bucketUnknown: unknown, role: "operator" | "creator"): Promise<Response> {
  if (role !== "operator") return json({ ok: false, error: "This action is for the studio operator." }, 403);
  const bucket = bucketUnknown as EditorBucket;
  const parts = partsOf(request.url);
  const method = request.method;
  try {
    if (method === "GET" && parts.length === 2 && parts[1] === "jobs") {
      const jobs = await loadIndex(bucket);
      jobs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return json({ ok: true, jobs });
    }
    if (method === "POST" && parts.length === 2 && parts[1] === "jobs") {
      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body)) return json({ ok: false, error: "Send a video name, or a file name and size." }, 400);
      const keys = Object.keys(body);
      if (keys.length === 1 && keys[0] === "title" && typeof body.title === "string") {
        const existing = await loadIndex(bucket);
        if (existing.length >= MAX_JOBS) return json({ ok: false, error: "Delete an old video first. The inbox holds 40." }, 400);
        const now = new Date().toISOString();
        const job: Job = {
          id: crypto.randomUUID(),
          title: displayName(body.title, "Untitled video"),
          notes: "",
          referenceUrl: "",
          postTitle: "",
          postCaption: "",
          postHashtags: "",
          createdAt: now,
          updatedAt: now,
          clips: [],
          cut: null,
        };
        await saveJob(bucket, job);
        return json({ ok: true, job: publicJob(job) });
      }
      if (typeof body.fileName !== "string" || typeof body.mimeType !== "string" || typeof body.byteSize !== "number") {
        return json({ ok: false, error: "Send a video name, or a file name and size." }, 400);
      }
      if (!Number.isInteger(body.byteSize) || body.byteSize < 1 || body.byteSize > MAX_BYTES) {
        return json({ ok: false, error: "That file is empty or over 4GB." }, 400);
      }
      const existing = await loadIndex(bucket);
      if (existing.length >= MAX_JOBS) return json({ ok: false, error: "Delete an old video first. The inbox holds 40." }, 400);
      const projectId = crypto.randomUUID();
      const kind = isKind(body.kind) ? body.kind : "other";
      const clip = await startClip(bucket, projectId, body.fileName, body.byteSize, undefined, kind);
      const now = new Date().toISOString();
      const job: Job = {
        id: projectId,
        title: displayName(typeof body.title === "string" ? body.title : "", clip.name),
        notes: "",
        referenceUrl: "",
        postTitle: "",
        postCaption: "",
        postHashtags: "",
        createdAt: now,
        updatedAt: now,
        clips: [clip],
        cut: null,
      };
      try {
        await saveJob(bucket, job);
      } catch (err) {
        if (clip.uploadId) await bucket.resumeMultipartUpload(clip.r2Key, clip.uploadId).abort().catch(() => undefined);
        throw err;
      }
      return json({ ok: true, job: publicJob(job), clipId: clip.id, partBytes: PART_BYTES });
    }

    const id = parts[2] ?? "";
    if (!UUID_RE.test(id) || parts[1] !== "jobs") return json({ ok: false, error: "Not found" }, 404);

    if ((method === "GET" || method === "HEAD") && parts[3] === "cut" && parts[4] === "file" && parts.length === 5) {
      const job = await loadJob(bucket, id);
      const key = job?.cut?.previewKey;
      if (!job || !key) return json({ ok: false, error: "The compiled video is not ready." }, 404);
      const rangeHeader = request.headers.get("range");
      const object = await bucket.get(key, rangeHeader ? { range: request.headers } : undefined);
      if (!object) return json({ ok: false, error: "File missing." }, 404);
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Content-Type", "video/mp4");
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "private, no-store");
      headers.set("Content-Disposition", "inline");
      const slice = rangeHeader ? byteRange(rangeHeader, object.size) : null;
      if (slice) {
        headers.set("Content-Range", `bytes ${slice.offset}-${slice.offset + slice.length - 1}/${object.size}`);
        headers.set("Content-Length", String(slice.length));
      }
      if (method === "HEAD") return new Response(null, { status: slice ? 206 : 200, headers });
      return new Response(object.body, { status: slice ? 206 : 200, headers });
    }

    if ((method === "GET" || method === "HEAD") && parts[3] === "clips" && parts[5] === "file" && parts.length === 6) {
      const clipId = parts[4] ?? "";
      if (!UUID_RE.test(clipId)) return json({ ok: false, error: "Unknown clip." }, 404);
      const job = await loadJob(bucket, id);
      const clip = job?.clips.find((row) => row.id === clipId);
      if (!job || !clip || clip.status === "uploading") return json({ ok: false, error: "That clip is not ready." }, 404);
      const rangeHeader = request.headers.get("range");
      const object = await bucket.get(clip.r2Key, rangeHeader ? { range: request.headers } : undefined);
      if (!object) return json({ ok: false, error: "File missing." }, 404);
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set("Content-Type", clip.mimeType);
      headers.set("Accept-Ranges", "bytes");
      headers.set("Cache-Control", "private, no-store");
      headers.set("Content-Disposition", "inline");
      const slice = rangeHeader ? byteRange(rangeHeader, object.size) : null;
      if (slice) {
        headers.set("Content-Range", `bytes ${slice.offset}-${slice.offset + slice.length - 1}/${object.size}`);
        headers.set("Content-Length", String(slice.length));
      }
      if (method === "HEAD") return new Response(null, { status: slice ? 206 : 200, headers });
      return new Response(object.body, { status: slice ? 206 : 200, headers });
    }

    if (method === "GET" && parts.length === 3) {
      const job = await loadJob(bucket, id);
      if (!job) return json({ ok: false, error: "That video is gone." }, 404);
      return json({ ok: true, job: publicJob(job) });
    }

    if (method === "PATCH" && parts.length === 3) {
      const job = await loadJob(bucket, id);
      if (!job) return json({ ok: false, error: "That video is gone." }, 404);
      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body) || typeof body.title !== "string" || typeof body.notes !== "string" || typeof body.referenceUrl !== "string") {
        return json({ ok: false, error: "The name, notes, or reference link is invalid." }, 400);
      }
      if (body.title.trim().length < 1 || body.title.length > 80 || body.notes.length > 8000 || body.referenceUrl.length > 500) {
        return json({ ok: false, error: "The name, notes, or reference link is invalid." }, 400);
      }
      const postTitle = typeof body.postTitle === "string" ? body.postTitle.trim() : job.postTitle;
      const postCaption = typeof body.postCaption === "string" ? body.postCaption.trim() : job.postCaption;
      const postHashtags = typeof body.postHashtags === "string" ? body.postHashtags.trim() : job.postHashtags;
      if (postTitle.length > 90 || postCaption.length > 2000 || postHashtags.length > 200) {
        return json({ ok: false, error: "The title or caption is too long." }, 400);
      }
      const referenceUrl = normalizeReference(body.referenceUrl);
      if (referenceUrl === null) return json({ ok: false, error: "Use an https TikTok or Instagram link, or leave it blank." }, 400);
      const trimmed = body.notes.trim();
      if (trimmed && (job.clips.length === 0 || job.clips.some((clip) => clip.status !== "uploaded"))) {
        return json({ ok: false, error: "Wait until every clip has finished uploading." }, 409);
      }
      const next: Job = {
        ...job,
        title: displayName(body.title, job.title),
        notes: trimmed,
        referenceUrl,
        postTitle,
        postCaption,
        postHashtags,
        updatedAt: new Date().toISOString(),
      };
      await saveJob(bucket, next);
      return json({ ok: true, job: publicJob(next) });
    }

    if (method === "POST" && parts.length === 5 && parts[3] === "cut" && parts[4] === "drop") {
      const job = await loadJob(bucket, id);
      if (!job?.cut) return json({ ok: false, error: "There is no cut to change." }, 409);
      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body) || typeof body.clipId !== "string" || typeof body.startSec !== "number") {
        return json({ ok: false, error: "That cut was not found." }, 400);
      }
      const cuts = job.cut.cuts.filter((cut) => !(cut.clipId === body.clipId && Math.abs(cut.startSec - (body.startSec as number)) < 0.05));
      const now = new Date().toISOString();
      const next: Job = {
        ...job,
        cut: { ...job.cut, cuts, phase: "review", summary: "Removed a cut you wanted to keep.", updatedAt: now },
        updatedAt: now,
      };
      await saveJob(bucket, next);
      return json({ ok: true, job: publicJob(next) });
    }

    if (method === "POST" && parts.length === 5 && parts[3] === "cut" && parts[4] === "fix") {
      const job = await loadJob(bucket, id);
      if (!job?.cut) return json({ ok: false, error: "Start a cut first." }, 409);
      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body) || typeof body.note !== "string" || body.note.trim().length < 1 || body.note.length > 2000) {
        return json({ ok: false, error: "Say what to fix." }, 400);
      }
      const now = new Date().toISOString();
      const next: Job = {
        ...job,
        cut: { ...job.cut, phase: "cutting", startedAt: null, fixNote: body.note.trim(), summary: "Fixing the cut.", updatedAt: now },
        updatedAt: now,
      };
      await saveJob(bucket, next);
      return json({ ok: true, job: publicJob(next) });
    }

    if (method === "POST" && parts.length === 5 && parts[3] === "cut" && parts[4] === "approve") {
      const job = await loadJob(bucket, id);
      if (!job) return json({ ok: false, error: "That video is gone." }, 404);
      if (job.cut?.phase !== "review") return json({ ok: false, error: "The cut is not ready to approve." }, 409);
      const next: Job = {
        ...job,
        cut: { ...job.cut, phase: "approved", updatedAt: new Date().toISOString() },
        updatedAt: new Date().toISOString(),
      };
      await saveJob(bucket, next);
      return json({ ok: true, job: publicJob(next) });
    }

    if (method === "DELETE" && parts.length === 3) {
      const job = await loadJob(bucket, id);
      if (job) {
        for (const clip of job.clips) {
          if (clip.uploadId && clip.status === "uploading") {
            await bucket.resumeMultipartUpload(clip.r2Key, clip.uploadId).abort().catch(() => undefined);
          }
          if (keyAllowed(job.id, clip)) await bucket.delete(clip.r2Key).catch(() => undefined);
        }
      }
      await bucket.delete(jobKey(id)).catch(() => undefined);
      await saveIndex(bucket, (await loadIndex(bucket)).filter((row) => row.id !== id));
      return json({ ok: true });
    }

    if (method === "POST" && parts[3] === "clips" && parts.length === 4) {
      const job = await loadJob(bucket, id);
      if (!job) return json({ ok: false, error: "That video is gone." }, 404);
      if (job.clips.some((clip) => clip.status === "uploading")) return json({ ok: false, error: "Wait until the current clip finishes." }, 409);
      if (job.clips.length >= MAX_CLIPS) return json({ ok: false, error: "This video already has 12 clips." }, 400);
      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body) || typeof body.fileName !== "string" || typeof body.byteSize !== "number") {
        return json({ ok: false, error: "Send a file name and size." }, 400);
      }
      if (!Number.isInteger(body.byteSize) || body.byteSize < 1 || body.byteSize > MAX_BYTES) {
        return json({ ok: false, error: "That file is empty or over 4GB." }, 400);
      }
      const clip = await startClip(
        bucket,
        id,
        body.fileName,
        body.byteSize,
        typeof body.name === "string" ? body.name : undefined,
        isKind(body.kind) ? body.kind : "other",
      );
      const next: Job = { ...job, clips: [...job.clips, clip], updatedAt: new Date().toISOString() };
      try {
        await saveJob(bucket, next);
      } catch (err) {
        if (clip.uploadId) await bucket.resumeMultipartUpload(clip.r2Key, clip.uploadId).abort().catch(() => undefined);
        throw err;
      }
      return json({ ok: true, job: publicJob(next), clipId: clip.id, partBytes: PART_BYTES });
    }

    if (method === "POST" && parts[3] === "reorder" && parts.length === 4) {
      const job = await loadJob(bucket, id);
      if (!job) return json({ ok: false, error: "That video is gone." }, 404);
      if (job.clips.some((clip) => clip.status === "uploading")) return json({ ok: false, error: "Wait until the current clip finishes." }, 409);
      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body) || !Array.isArray(body.clipIds)) return json({ ok: false, error: "The clip order is invalid." }, 400);
      const clipIds = body.clipIds.filter((item): item is string => typeof item === "string" && UUID_RE.test(item));
      const current = job.clips.map((clip) => clip.id);
      const same = clipIds.length === current.length && current.every((clipId) => clipIds.includes(clipId)) && new Set(clipIds).size === clipIds.length;
      if (!same) return json({ ok: false, error: "The clip order does not match this video." }, 400);
      const byId = new Map(job.clips.map((clip) => [clip.id, clip]));
      const next: Job = {
        ...job,
        clips: clipIds.map((clipId) => byId.get(clipId)!),
        updatedAt: new Date().toISOString(),
      };
      await saveJob(bucket, next);
      return json({ ok: true, job: publicJob(next) });
    }

    const clipId = parts[4] ?? "";
    if (parts[3] !== "clips" || !UUID_RE.test(clipId)) return json({ ok: false, error: "Not found" }, 404);
    const job = await loadJob(bucket, id);
    if (!job) return json({ ok: false, error: "That video is gone." }, 404);
    const clip = job.clips.find((row) => row.id === clipId);
    if (!clip) return json({ ok: false, error: "That clip is gone." }, 404);

    if (method === "PATCH" && parts.length === 5) {
      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body) || typeof body.name !== "string" || !isKind(body.kind)) {
        return json({ ok: false, error: "Give the clip a name." }, 400);
      }
      if (body.name.trim().length < 1 || body.name.length > 80) return json({ ok: false, error: "Give the clip a name." }, 400);
      const next: Job = {
        ...job,
        clips: job.clips.map((row) => (row.id === clipId ? { ...row, name: displayName(body.name as string, row.name), kind: body.kind as Kind } : row)),
        updatedAt: new Date().toISOString(),
      };
      await saveJob(bucket, next);
      return json({ ok: true, job: publicJob(next) });
    }

    if (method === "DELETE" && parts.length === 5) {
      if (clip.uploadId && clip.status === "uploading") {
        await bucket.resumeMultipartUpload(clip.r2Key, clip.uploadId).abort().catch(() => undefined);
      }
      await bucket.delete(clip.r2Key).catch(() => undefined);
      const next: Job = {
        ...job,
        clips: job.clips.filter((row) => row.id !== clipId),
        updatedAt: new Date().toISOString(),
      };
      await saveJob(bucket, next);
      return json({ ok: true, job: publicJob(next) });
    }

    if (method === "PUT" && parts[5] === "parts" && parts.length === 7) {
      const partNumber = Number(parts[6]);
      if (clip.status !== "uploading" || !clip.uploadId) return json({ ok: false, error: "This upload already finished." }, 409);
      const count = Math.ceil(clip.byteSize / PART_BYTES);
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > count) {
        return json({ ok: false, error: "That part is out of range." }, 400);
      }
      const expected = partNumber < count ? PART_BYTES : clip.byteSize - (count - 1) * PART_BYTES;
      const declared = Number(request.headers.get("content-length"));
      if (!Number.isInteger(declared) || declared !== expected) {
        return json({ ok: false, error: "This part is the wrong size. The original was not changed." }, 400);
      }
      if (!request.body) return json({ ok: false, error: "This part is empty." }, 400);
      const uploaded = await bucket.resumeMultipartUpload(clip.r2Key, clip.uploadId).uploadPart(partNumber, request.body);
      return json({ ok: true, partNumber: uploaded.partNumber, etag: uploaded.etag });
    }

    if (method === "POST" && parts[5] === "complete" && parts.length === 6) {
      if (clip.status !== "uploading") return json({ ok: true, job: publicJob(job) });
      if (!clip.uploadId) return json({ ok: false, error: "This upload has no open session." }, 409);
      const body: unknown = await request.json().catch(() => null);
      if (!isRecord(body) || !Array.isArray(body.parts)) return json({ ok: false, error: "The part list is invalid." }, 400);
      const partsIn: Array<{ partNumber: number; etag: string }> = [];
      for (const row of body.parts) {
        if (!isRecord(row) || typeof row.partNumber !== "number" || typeof row.etag !== "string") {
          return json({ ok: false, error: "The part list is invalid." }, 400);
        }
        partsIn.push({ partNumber: row.partNumber, etag: row.etag });
      }
      const count = Math.ceil(clip.byteSize / PART_BYTES);
      const numbers = partsIn.map((part) => part.partNumber).sort((a, b) => a - b);
      const expectedNumbers = Array.from({ length: count }, (_, i) => i + 1);
      const same = numbers.length === expectedNumbers.length && numbers.every((n, i) => n === expectedNumbers[i]);
      if (!same) return json({ ok: false, error: "Some parts of the original are missing. Upload it again." }, 400);
      const upload = bucket.resumeMultipartUpload(clip.r2Key, clip.uploadId);
      const writeFailed = async (error: string) => {
        const failed: Clip = { ...clip, uploadId: null, error, status: "uploading" };
        await saveJob(bucket, {
          ...job,
          clips: job.clips.map((row) => (row.id === clip.id ? failed : row)),
          updatedAt: new Date().toISOString(),
        });
        return json({ ok: false, error }, 502);
      };
      try {
        await upload.complete([...partsIn].sort((a, b) => a.partNumber - b.partNumber));
      } catch {
        await upload.abort().catch(() => undefined);
        return writeFailed("The upload did not finish. Delete this clip and try again.");
      }
      const head = await bucket.head(clip.r2Key);
      if (!head || head.size !== clip.byteSize) {
        await bucket.delete(clip.r2Key).catch(() => undefined);
        return writeFailed("The saved file size did not match the phone file. Delete this clip and upload again.");
      }
      const saved: Clip = { ...clip, uploadId: null, status: "uploaded", error: null };
      const next: Job = {
        ...job,
        clips: job.clips.map((row) => (row.id === clip.id ? saved : row)),
        updatedAt: new Date().toISOString(),
      };
      await saveJob(bucket, next);
      return json({ ok: true, job: publicJob(next) });
    }

    return json({ ok: false, error: "Not found" }, 404);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Editor request failed.";
    const status = message.startsWith("Upload an") ? 400 : 500;
    return json({ ok: false, error: message.slice(0, 180) }, status);
  }
}
