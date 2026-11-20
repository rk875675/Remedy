import { z } from "zod";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObject,
  downloadText,
  objectSize,
  uploadBuffer,
  uploadMultipartPart,
} from "../publish/r2.js";
import {
  EDITOR_INDEX_KEY,
  EDITOR_MAX_CLIPS,
  EDITOR_MAX_JOBS,
  EDITOR_PART_BYTES,
  AddEditorClipSchema,
  EditorIndexSchema,
  EditorJobSchema,
  LegacyEditorJobSchema,
  LegacyIndexEntrySchema,
  clipKeyAllowed,
  cleanFileName,
  displayName,
  editorClipKey,
  editorJobKey,
  expectedPartCount,
  fileExt,
  mimeForExt,
  nameFromFile,
  normalizeReferenceUrl,
  toIndexEntry,
  toPublicJob,
  withCut,
  type ClipKind,
  type EditorClip,
  type EditorIndex,
  type EditorIndexEntry,
  type EditorJob,
} from "./schema.js";

export class EditorError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 500 | 502,
  ) {
    super(message);
  }
}

function emptyIndex(): EditorIndex {
  return { jobs: [] };
}

async function persistIndex(jobs: EditorIndexEntry[]): Promise<void> {
  const sorted = [...jobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  await uploadBuffer(
    EDITOR_INDEX_KEY,
    Buffer.from(JSON.stringify({ jobs: sorted }), "utf8"),
    "application/json",
    "private, no-store",
  );
}

async function readIndex(): Promise<EditorIndex> {
  const text = await downloadText(EDITOR_INDEX_KEY);
  if (!text) return emptyIndex();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new EditorError("Editor index is unreadable.", 500);
  }
  const current = EditorIndexSchema.safeParse(parsed);
  if (current.success) return current.data;
  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { jobs?: unknown }).jobs)) {
    throw new EditorError("Editor index is unreadable.", 500);
  }
  const jobs: EditorIndexEntry[] = [];
  for (const row of (parsed as { jobs: unknown[] }).jobs) {
    const next = EditorIndexSchema.shape.jobs.element.safeParse(row);
    if (next.success) {
      jobs.push(next.data);
      continue;
    }
    const legacy = LegacyIndexEntrySchema.safeParse(row);
    if (!legacy.success) throw new EditorError("Editor index is unreadable.", 500);
    jobs.push({
      id: legacy.data.id,
      title: nameFromFile(legacy.data.fileName),
      clipCount: 1,
      byteSize: legacy.data.byteSize,
      status: legacy.data.status,
      createdAt: legacy.data.createdAt,
      error: legacy.data.error,
    });
  }
  await persistIndex(jobs);
  return { jobs };
}

async function writeJob(job: EditorJob): Promise<void> {
  const checked = EditorJobSchema.parse(job);
  await uploadBuffer(
    editorJobKey(checked.id),
    Buffer.from(JSON.stringify(checked), "utf8"),
    "application/json",
    "private, no-store",
  );
  const index = await readIndex();
  const jobs = index.jobs.filter((row) => row.id !== checked.id);
  jobs.push(toIndexEntry(checked));
  await persistIndex(jobs);
}

function legacyToJob(legacy: z.infer<typeof LegacyEditorJobSchema>): EditorJob {
  const now = legacy.updatedAt;
  const clip: EditorClip = {
    id: crypto.randomUUID(),
    name: nameFromFile(legacy.fileName),
    kind: "other",
    fileName: legacy.fileName,
    mimeType: legacy.mimeType,
    byteSize: legacy.byteSize,
    ext: legacy.ext,
    r2Key: legacy.r2Key,
    uploadId: legacy.uploadId,
    status: legacy.status === "uploading" ? "uploading" : "uploaded",
    error: legacy.error,
    createdAt: legacy.createdAt,
  };
  return {
    id: legacy.id,
    title: nameFromFile(legacy.fileName),
    notes: legacy.notes,
    referenceUrl: legacy.referenceUrl,
    postTitle: "",
    postCaption: "",
    postHashtags: "",
    createdAt: legacy.createdAt,
    updatedAt: now,
    clips: [clip],
    cut: null,
  };
}

async function readJob(id: string): Promise<EditorJob | null> {
  const text = await downloadText(editorJobKey(id));
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  const job = EditorJobSchema.safeParse(withCut(parsed));
  if (job.success) return job.data;
  const legacy = LegacyEditorJobSchema.safeParse(parsed);
  if (!legacy.success) return null;
  const migrated = legacyToJob(legacy.data);
  await writeJob(migrated);
  return migrated;
}

function requireJob(job: EditorJob | null): EditorJob {
  if (!job) throw new EditorError("That video is gone.", 404);
  for (const clip of job.clips) {
    if (!clipKeyAllowed(job.id, clip)) throw new EditorError("A clip is stored under the wrong key.", 500);
  }
  return job;
}

function requireClip(job: EditorJob, clipId: string): EditorClip {
  const clip = job.clips.find((row) => row.id === clipId);
  if (!clip) throw new EditorError("That clip is gone.", 404);
  return clip;
}

export async function listEditorJobs(): Promise<EditorIndex["jobs"]> {
  const index = await readIndex();
  return [...index.jobs].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getEditorJob(id: string): Promise<ReturnType<typeof toPublicJob>> {
  return toPublicJob(requireJob(await readJob(id)));
}

async function beginClip(input: {
  projectId: string;
  fileName: string;
  byteSize: number;
  name?: string;
  kind?: ClipKind;
}): Promise<EditorClip> {
  const fileName = cleanFileName(input.fileName);
  const ext = fileName ? fileExt(fileName) : null;
  if (!fileName || !ext) throw new EditorError("Upload an mp4, mov, m4v, or an audio file (m4a, mp3, wav).", 400);
  const id = crypto.randomUUID();
  const r2Key = editorClipKey(input.projectId, id, ext);
  const mimeType = mimeForExt(ext);
  let uploadId: string;
  try {
    uploadId = await createMultipartUpload(r2Key, mimeType);
  } catch (err) {
    console.warn("editor multipart start:", err instanceof Error ? err.message.slice(0, 180) : err);
    throw new EditorError("Could not start the upload.", 502);
  }
  return {
    id,
    name: displayName(input.name ?? "", nameFromFile(fileName)),
    kind: input.kind ?? "other",
    fileName,
    mimeType,
    byteSize: input.byteSize,
    ext,
    r2Key,
    uploadId,
    status: "uploading",
    error: null,
    createdAt: new Date().toISOString(),
  };
}

export async function createEditorProject(title: string): Promise<ReturnType<typeof toPublicJob>> {
  const index = await readIndex();
  if (index.jobs.length >= EDITOR_MAX_JOBS) {
    throw new EditorError("Delete an old video first. The inbox holds 40.", 400);
  }
  const now = new Date().toISOString();
  const job: EditorJob = {
    id: crypto.randomUUID(),
    title: displayName(title, "Untitled video"),
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
  await writeJob(job);
  return toPublicJob(job);
}

export async function createEditorJob(input: {
  fileName: string;
  byteSize: number;
  title?: string;
  kind?: ClipKind;
}): Promise<{ job: ReturnType<typeof toPublicJob>; clipId: string; partBytes: number }> {
  const index = await readIndex();
  if (index.jobs.length >= EDITOR_MAX_JOBS) {
    throw new EditorError("Delete an old video first. The inbox holds 40.", 400);
  }
  const projectId = crypto.randomUUID();
  const clip = await beginClip({
    projectId,
    fileName: input.fileName,
    byteSize: input.byteSize,
    name: nameFromFile(cleanFileName(input.fileName) ?? input.fileName),
    kind: input.kind,
  });
  const now = new Date().toISOString();
  const job: EditorJob = {
    id: projectId,
    title: displayName(input.title ?? "", clip.name),
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
    await writeJob(job);
  } catch (err) {
    if (clip.uploadId) await abortMultipartUpload(clip.r2Key, clip.uploadId).catch(() => undefined);
    throw err;
  }
  return { job: toPublicJob(job), clipId: clip.id, partBytes: EDITOR_PART_BYTES };
}

export async function addEditorClip(
  projectId: string,
  input: z.infer<typeof AddEditorClipSchema>,
): Promise<{ job: ReturnType<typeof toPublicJob>; clipId: string; partBytes: number }> {
  const job = requireJob(await readJob(projectId));
  if (job.clips.some((clip) => clip.status === "uploading")) {
    throw new EditorError("Wait until the current clip finishes.", 409);
  }
  if (job.clips.length >= EDITOR_MAX_CLIPS) {
    throw new EditorError("This video already has 12 clips.", 400);
  }
  const clip = await beginClip({
    projectId,
    fileName: input.fileName,
    byteSize: input.byteSize,
    name: input.name,
    kind: input.kind,
  });
  const next: EditorJob = { ...job, clips: [...job.clips, clip], updatedAt: new Date().toISOString() };
  try {
    await writeJob(next);
  } catch (err) {
    if (clip.uploadId) await abortMultipartUpload(clip.r2Key, clip.uploadId).catch(() => undefined);
    throw err;
  }
  return { job: toPublicJob(next), clipId: clip.id, partBytes: EDITOR_PART_BYTES };
}

export async function saveEditorPart(
  projectId: string,
  clipId: string,
  partNumber: number,
  body: Uint8Array,
): Promise<{ etag: string }> {
  const job = requireJob(await readJob(projectId));
  const clip = requireClip(job, clipId);
  if (clip.status !== "uploading" || !clip.uploadId) {
    throw new EditorError("This upload already finished.", 409);
  }
  const count = expectedPartCount(clip.byteSize);
  if (partNumber < 1 || partNumber > count) throw new EditorError("That part is out of range.", 400);
  const expected = partNumber < count ? EDITOR_PART_BYTES : clip.byteSize - (count - 1) * EDITOR_PART_BYTES;
  if (body.byteLength !== expected) {
    throw new EditorError("This part is the wrong size. The original was not changed.", 400);
  }
  try {
    const etag = await uploadMultipartPart(clip.r2Key, clip.uploadId, partNumber, body);
    return { etag };
  } catch (err) {
    console.warn("editor part:", err instanceof Error ? err.message.slice(0, 180) : err);
    throw new EditorError("Could not store that part. Try again.", 502);
  }
}

export async function completeEditorClip(
  projectId: string,
  clipId: string,
  parts: Array<{ partNumber: number; etag: string }>,
): Promise<ReturnType<typeof toPublicJob>> {
  const job = requireJob(await readJob(projectId));
  const clip = requireClip(job, clipId);
  if (clip.status !== "uploading") return toPublicJob(job);
  if (!clip.uploadId) throw new EditorError("This upload has no open session.", 409);
  const count = expectedPartCount(clip.byteSize);
  const numbers = parts.map((part) => part.partNumber).sort((a, b) => a - b);
  const expectedNumbers = Array.from({ length: count }, (_, i) => i + 1);
  const same = numbers.length === expectedNumbers.length && numbers.every((n, i) => n === expectedNumbers[i]);
  if (!same) throw new EditorError("Some parts of the original are missing. Upload it again.", 400);
  const failClip = async (error: string) => {
    if (clip.uploadId) await abortMultipartUpload(clip.r2Key, clip.uploadId).catch(() => undefined);
    const failed: EditorClip = { ...clip, uploadId: null, error, status: "uploading" };
    await writeJob({
      ...job,
      clips: job.clips.map((row) => (row.id === clip.id ? failed : row)),
      updatedAt: new Date().toISOString(),
    });
  };
  try {
    await completeMultipartUpload(clip.r2Key, clip.uploadId, parts);
  } catch (err) {
    await failClip("The upload did not finish. Delete this clip and try again.");
    console.warn("editor complete:", err instanceof Error ? err.message.slice(0, 180) : err);
    throw new EditorError("The upload did not finish. Delete this clip and try again.", 502);
  }
  const size = await objectSize(clip.r2Key);
  if (size !== clip.byteSize) {
    await deleteObject(clip.r2Key);
    await failClip("The saved file size did not match the phone file. Delete this clip and upload again.");
    throw new EditorError("The saved file size did not match the phone file. Delete this clip and upload again.", 502);
  }
  const saved: EditorClip = { ...clip, uploadId: null, status: "uploaded", error: null };
  const next: EditorJob = {
    ...job,
    clips: job.clips.map((row) => (row.id === clip.id ? saved : row)),
    updatedAt: new Date().toISOString(),
  };
  await writeJob(next);
  return toPublicJob(next);
}

export async function patchEditorJob(
  id: string,
  title: string,
  notes: string,
  referenceRaw: string,
  postTitle: string,
  postCaption: string,
  postHashtags: string,
): Promise<ReturnType<typeof toPublicJob>> {
  const job = requireJob(await readJob(id));
  const referenceUrl = normalizeReferenceUrl(referenceRaw);
  if (referenceUrl === null) {
    throw new EditorError("Use an https TikTok or Instagram link, or leave it blank.", 400);
  }
  const trimmed = notes.trim();
  if (trimmed && (job.clips.length === 0 || job.clips.some((clip) => clip.status !== "uploaded"))) {
    throw new EditorError("Wait until every clip has finished uploading.", 409);
  }
  const next: EditorJob = {
    ...job,
    title: displayName(title, job.title),
    notes: trimmed,
    referenceUrl,
    postTitle: postTitle.trim(),
    postCaption: postCaption.trim(),
    postHashtags: postHashtags.trim(),
    updatedAt: new Date().toISOString(),
  };
  await writeJob(next);
  return toPublicJob(next);
}

export async function dropEditorCut(id: string, clipId: string, startSec: number): Promise<ReturnType<typeof toPublicJob>> {
  const job = requireJob(await readJob(id));
  if (!job.cut || (job.cut.phase !== "review" && job.cut.phase !== "redo" && job.cut.phase !== "approved")) {
    throw new EditorError("There is no cut to change.", 409);
  }
  const cuts = job.cut.cuts.filter((cut) => !(cut.clipId === clipId && Math.abs(cut.startSec - startSec) < 0.05));
  const now = new Date().toISOString();
  const next: EditorJob = {
    ...job,
    cut: {
      ...job.cut,
      cuts,
      phase: "review",
      summary: cuts.length === job.cut.cuts.length ? job.cut.summary : "Removed a cut you wanted to keep.",
      updatedAt: now,
    },
    updatedAt: now,
  };
  await writeJob(next);
  return toPublicJob(next);
}

export async function requestEditorFix(id: string, note: string): Promise<ReturnType<typeof toPublicJob>> {
  const job = requireJob(await readJob(id));
  if (!job.cut) throw new EditorError("Start a cut first.", 409);
  const trimmed = note.trim();
  if (!trimmed) throw new EditorError("Say what to fix.", 400);
  const now = new Date().toISOString();
  const next: EditorJob = {
    ...job,
    cut: {
      ...job.cut,
      phase: "cutting",
      startedAt: null,
      fixNote: trimmed,
      summary: "Fixing the cut.",
      updatedAt: now,
    },
    updatedAt: now,
  };
  await writeJob(next);
  return toPublicJob(next);
}

export async function approveEditorCut(id: string): Promise<ReturnType<typeof toPublicJob>> {
  const job = requireJob(await readJob(id));
  if (job.cut?.phase !== "review") throw new EditorError("The cut is not ready to approve.", 409);
  const next: EditorJob = {
    ...job,
    cut: { ...job.cut, phase: "approved", updatedAt: new Date().toISOString() },
    updatedAt: new Date().toISOString(),
  };
  await writeJob(next);
  return toPublicJob(next);
}

export async function storedEditorJob(id: string): Promise<EditorJob | null> {
  const job = await readJob(id);
  return job ? requireJob(job) : null;
}

export async function storeEditorJob(job: EditorJob): Promise<void> {
  await writeJob(job);
}

export async function patchEditorClip(
  projectId: string,
  clipId: string,
  name: string,
  kind: ClipKind,
): Promise<ReturnType<typeof toPublicJob>> {
  const job = requireJob(await readJob(projectId));
  requireClip(job, clipId);
  const next: EditorJob = {
    ...job,
    clips: job.clips.map((clip) => (clip.id === clipId ? { ...clip, name: displayName(name, clip.name), kind } : clip)),
    updatedAt: new Date().toISOString(),
  };
  await writeJob(next);
  return toPublicJob(next);
}

export async function reorderEditorClips(projectId: string, clipIds: string[]): Promise<ReturnType<typeof toPublicJob>> {
  const job = requireJob(await readJob(projectId));
  if (job.clips.some((clip) => clip.status === "uploading")) {
    throw new EditorError("Wait until the current clip finishes.", 409);
  }
  const current = job.clips.map((clip) => clip.id);
  const same =
    clipIds.length === current.length &&
    current.every((id) => clipIds.includes(id)) &&
    new Set(clipIds).size === clipIds.length;
  if (!same) throw new EditorError("The clip order does not match this video.", 400);
  const byId = new Map(job.clips.map((clip) => [clip.id, clip]));
  const next: EditorJob = {
    ...job,
    clips: clipIds.map((id) => byId.get(id)!),
    updatedAt: new Date().toISOString(),
  };
  await writeJob(next);
  return toPublicJob(next);
}

export async function deleteEditorClip(projectId: string, clipId: string): Promise<ReturnType<typeof toPublicJob>> {
  const job = requireJob(await readJob(projectId));
  const clip = requireClip(job, clipId);
  if (clip.uploadId && clip.status === "uploading") {
    await abortMultipartUpload(clip.r2Key, clip.uploadId).catch(() => undefined);
  }
  await deleteObject(clip.r2Key);
  const next: EditorJob = {
    ...job,
    clips: job.clips.filter((row) => row.id !== clipId),
    updatedAt: new Date().toISOString(),
  };
  await writeJob(next);
  return toPublicJob(next);
}

export async function deleteEditorJob(id: string): Promise<void> {
  const job = await readJob(id);
  if (job) {
    for (const clip of job.clips) {
      if (clip.uploadId && clip.status === "uploading") {
        await abortMultipartUpload(clip.r2Key, clip.uploadId).catch(() => undefined);
      }
      if (clipKeyAllowed(job.id, clip)) await deleteObject(clip.r2Key);
    }
  }
  await deleteObject(editorJobKey(id));
  const index = await readIndex();
  await persistIndex(index.jobs.filter((row) => row.id !== id));
}

export async function editorFileTarget(
  projectId: string,
  clipId: string,
): Promise<{ key: string; mimeType: EditorClip["mimeType"] } | null> {
  const job = await readJob(projectId);
  if (!job) return null;
  const clip = job.clips.find((row) => row.id === clipId);
  if (!clip || clip.status === "uploading" || !clipKeyAllowed(job.id, clip)) return null;
  return { key: clip.r2Key, mimeType: clip.mimeType };
}

export function parseJobId(id: string): string | null {
  const parsed = z.string().uuid().safeParse(id);
  return parsed.success ? parsed.data : null;
}
