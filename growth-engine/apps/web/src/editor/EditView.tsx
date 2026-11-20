import { useEffect, useRef, useState } from "react";
import { api, type EditorClip, type EditorClipKind, type EditorJob, type EditorJobSummary } from "../api";

const GREEN = "#33663f";
const KINDS: Array<[EditorClipKind, string]> = [
  ["talking", "Talking head"],
  ["screen", "Screen"],
  ["voice", "Voiceover"],
  ["other", "Other"],
];

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function clock(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function copyText(value: string): Promise<boolean> {
  const text = value.trim();
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function statusLabel(status: EditorJobSummary["status"]): string {
  if (status === "ready") return "Notes saved";
  if (status === "uploaded") return "Clips saved";
  return "Upload unfinished";
}

function uploadName(file: File): string {
  const name = file.name.trim() || "clip.mov";
  if (/\.(mp4|mov|m4v|m4a|mp3|wav|aac|caf)$/i.test(name)) return name;
  if (file.type === "video/mp4") return `${name}.mp4`;
  if (file.type === "audio/mpeg") return `${name}.mp3`;
  if (file.type.startsWith("audio/")) return `${name}.m4a`;
  return `${name}.mov`;
}

async function putPart(id: string, clipId: string, partNumber: number, blob: Blob): Promise<string> {
  let last = "Could not store that part.";
  for (let attempt = 1; attempt <= 3; attempt++) {
    const result = await api.uploadEditorPart(id, clipId, partNumber, blob);
    if (result.ok && result.etag) return result.etag;
    last = result.error ?? last;
    await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
  }
  throw new Error(last);
}

function CutBar({
  duration,
  cuts,
  onJump,
}: {
  duration: number;
  cuts: Array<{ startSec: number; endSec: number; reason: string }>;
  onJump: (startSec: number, endSec: number) => void;
}) {
  if (duration <= 0) return null;
  return (
    <div className="relative h-12 rounded-xl bg-green-800 overflow-hidden">
      {cuts.map((cut) => {
        const left = (cut.startSec / duration) * 100;
        const width = Math.max(((cut.endSec - cut.startSec) / duration) * 100, 1.4);
        return (
          <button
            key={`${cut.startSec}`}
            type="button"
            title={`${clock(cut.startSec)}–${clock(cut.endSec)} ${cut.reason}`}
            onClick={() => onJump(cut.startSec, cut.endSec)}
            className="absolute inset-y-0 bg-red-500"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        );
      })}
    </div>
  );
}

export function EditView({ onMessage }: { onMessage: (message: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const fetchGen = useRef(0);
  const [jobs, setJobs] = useState<EditorJobSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [job, setJob] = useState<EditorJob | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [postTitle, setPostTitle] = useState("");
  const [postCaption, setPostCaption] = useState("");
  const [postHashtags, setPostHashtags] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [kindOverride, setKindOverride] = useState<Record<string, EditorClipKind>>({});
  const kindRef = useRef<Record<string, EditorClipKind>>({});

  const load = async () => {
    const result = await api.editorJobs();
    if (!result.ok) throw new Error(result.error ?? "Could not load videos");
    setJobs(result.jobs);
  };

  useEffect(() => {
    load().catch((err) => onMessage(err instanceof Error ? err.message : "Could not load videos"));
  }, [onMessage]);

  useEffect(() => {
    if (!progress) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [progress]);

  useEffect(() => {
    if (!selectedId) {
      setJob(null);
      return;
    }
    const gen = ++fetchGen.current;
    api
      .editorJob(selectedId)
      .then((result) => {
        if (gen !== fetchGen.current) return;
        if (!result.ok) {
          onMessage(result.error ?? "Could not open that video");
          return;
        }
        setJob(result.job);
        setTitle(result.job.title);
        setNotes(result.job.notes);
        setReferenceUrl(result.job.referenceUrl);
        setPostTitle(result.job.postTitle);
        setPostCaption(result.job.postCaption);
        setPostHashtags(result.job.postHashtags);
        setPlayError(null);
      })
      .catch((err) => {
        if (gen === fetchGen.current) onMessage(err instanceof Error ? err.message : "Could not open that video");
      });
  }, [selectedId, onMessage]);

  useEffect(() => {
    if (!job || job.cut?.phase !== "cutting") return;
    const timer = window.setInterval(() => {
      void api.editorJob(job.id).then((result) => {
        if (result.ok) setJob(result.job);
      });
    }, 4000);
    return () => window.clearInterval(timer);
  }, [job]);

  const applyJob = (next: EditorJob) => {
    fetchGen.current += 1;
    for (const clip of next.clips) kindRef.current[clip.id] = clip.kind;
    setKindOverride({});
    setJob(next);
    setSelectedId(next.id);
  };

  const kindOf = (clip: EditorClip): EditorClipKind => kindOverride[clip.id] ?? clip.kind;

  const uploadFiles = async (list: FileList | File[] | undefined) => {
    const files = list ? [...list] : [];
    if (!files.length || progress) return;
    for (const file of files) {
      if (file.size < 1) {
        onMessage("One of those files is empty.");
        return;
      }
      if (file.size > 4 * 1024 * 1024 * 1024) {
        onMessage("Each clip has to be 4GB or smaller.");
        return;
      }
    }
    setLocalError(null);
    setProgress("Starting…");
    let projectId = selectedId;
    try {
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex]!;
        const label = `Clip ${fileIndex + 1} of ${files.length}`;
        const created = projectId
          ? await api.addEditorClip(projectId, uploadName(file), file.type || "video/quicktime", file.size)
          : await api.createEditorJob(uploadName(file), file.type || "video/quicktime", file.size);
        if (!created.ok || !created.job || !created.clipId || !created.partBytes) {
          throw new Error(created.error ?? "Could not start the upload");
        }
        projectId = created.job.id;
        const partBytes = created.partBytes;
        const count = Math.ceil(file.size / partBytes);
        const parts: Array<{ partNumber: number; etag: string }> = [];
        for (let index = 0; index < count; index++) {
          const start = index * partBytes;
          const blob = file.slice(start, Math.min(file.size, start + partBytes));
          setProgress(`${label} · part ${index + 1} of ${count}`);
          const etag = await putPart(created.job.id, created.clipId, index + 1, blob);
          parts.push({ partNumber: index + 1, etag });
        }
        setProgress(`${label} · checking the file`);
        const done = await api.completeEditorClip(created.job.id, created.clipId, parts);
        if (!done.ok || !done.job) throw new Error(done.error ?? "The upload did not finish");
        applyJob(done.job);
      }
      await load();
      onMessage(files.length === 1 ? "Clip saved." : `${files.length} clips saved.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setLocalError(message);
      onMessage(message);
      await load().catch(() => undefined);
    } finally {
      setProgress(null);
    }
  };

  const createVideo = async () => {
    if (progress) return;
    const result = await api.createEditorProject("Untitled video");
    if (!result.ok || !result.job) {
      onMessage(result.error ?? "Could not create a video");
      return;
    }
    applyJob(result.job);
    setTitle(result.job.title);
    setNotes("");
    setReferenceUrl("");
    setPostTitle("");
    setPostCaption("");
    setPostHashtags("");
    await load();
  };

  const saveDetails = async () => {
    if (!job) return;
    const nextTitle = title.trim();
    if (!nextTitle) {
      onMessage("Give the video a name.");
      return;
    }
    const result = await api.saveEditorVideo(job.id, nextTitle, notes, referenceUrl, postTitle, postCaption, postHashtags);
    if (!result.ok || !result.job) {
      onMessage(result.error ?? "Could not save");
      return;
    }
    applyJob(result.job);
    setTitle(result.job.title);
    setNotes(result.job.notes);
    setReferenceUrl(result.job.referenceUrl);
    setPostTitle(result.job.postTitle);
    setPostCaption(result.job.postCaption);
    setPostHashtags(result.job.postHashtags);
    await load();
    onMessage(result.job.cut?.previewUrl ? "Your video is ready." : "Saved.");
  };

  const saveClip = async (clip: EditorClip, name: string, kind: EditorClipKind) => {
    if (!job) return;
    const nextName = name.trim();
    if (!nextName) {
      onMessage("Give the clip a name.");
      return;
    }
    if (nextName === clip.name && kind === clip.kind) return;
    const result = await api.saveEditorClip(job.id, clip.id, nextName, kind);
    if (!result.ok || !result.job) {
      onMessage(result.error ?? "Could not update that clip");
      return;
    }
    applyJob(result.job);
    await load();
  };

  const moveClip = async (index: number, direction: -1 | 1) => {
    if (!job) return;
    const next = index + direction;
    if (next < 0 || next >= job.clips.length) return;
    const ids = job.clips.map((clip) => clip.id);
    const swapped = [...ids];
    const current = swapped[index];
    const target = swapped[next];
    if (!current || !target) return;
    swapped[index] = target;
    swapped[next] = current;
    const result = await api.reorderEditorClips(job.id, swapped);
    if (!result.ok || !result.job) {
      onMessage(result.error ?? "Could not reorder");
      return;
    }
    applyJob(result.job);
  };

  const removeClip = async (clip: EditorClip) => {
    if (!job) return;
    if (!window.confirm(`Remove “${clip.name}” from this video?`)) return;
    const result = await api.deleteEditorClip(job.id, clip.id);
    if (!result.ok || !result.job) {
      onMessage(result.error ?? "Could not remove that clip");
      return;
    }
    applyJob(result.job);
    await load();
  };

  const removeVideo = async (id: string) => {
    if (!window.confirm("Delete this video and all of its clips?")) return;
    const result = await api.deleteEditorJob(id);
    if (!result.ok) {
      onMessage(result.error ?? "Could not delete");
      return;
    }
    if (selectedId === id) {
      fetchGen.current += 1;
      setSelectedId(null);
      setJob(null);
    }
    await load();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => void createVideo()}
          disabled={progress !== null}
          className="w-full rounded-2xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
          style={{ backgroundColor: GREEN }}
        >
          New video
        </button>
        <div className="space-y-2">
          {jobs.length === 0 && (
            <p className="rounded-2xl border border-stone-200 bg-white px-4 py-6 text-sm text-stone-500 text-center">
              No videos yet.
            </p>
          )}
          {jobs.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelectedId(row.id)}
              className={`w-full text-left rounded-2xl border bg-white px-4 py-3 ${selectedId === row.id ? "border-green-800" : "border-stone-200"}`}
            >
              <p className="text-sm font-extrabold text-stone-900 truncate">{row.title}</p>
              <p className="text-[12px] text-stone-500 mt-1">
                {row.clipCount} {row.clipCount === 1 ? "clip" : "clips"} · {statusLabel(row.status)} · {formatWhen(row.createdAt)}
              </p>
              {row.error && <p className="text-[12px] text-red-700 mt-1">{row.error}</p>}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-4 space-y-4">
        {!job && <p className="text-sm text-stone-500">Create a video, then add the talking head, the screen recording, and the voiceover.</p>}
        {job && (
          <>
            <div className="flex items-start justify-between gap-3">
              <label className="block flex-1">
                <span className="text-[12px] font-bold text-stone-500">Video name</span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-extrabold text-stone-900"
                />
              </label>
              <button type="button" onClick={() => void removeVideo(job.id)} className="mt-6 text-[12px] font-bold text-red-700">
                Delete
              </button>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3 space-y-3">
              <p className="text-[12px] font-bold text-stone-500">Paste on TikTok or Instagram</p>
              <label className="block">
                <span className="text-[12px] font-bold text-stone-500">Title</span>
                <textarea
                  value={postTitle}
                  onChange={(event) => setPostTitle(event.target.value)}
                  maxLength={90}
                  rows={2}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm font-bold text-stone-900"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  void copyText(postTitle).then((ok) => onMessage(ok ? "Title copied" : "Nothing to copy"));
                }}
                className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                style={{ backgroundColor: GREEN }}
              >
                Copy title
              </button>
              <label className="block">
                <span className="text-[12px] font-bold text-stone-500">Caption</span>
                <textarea
                  value={postCaption}
                  onChange={(event) => setPostCaption(event.target.value)}
                  maxLength={2000}
                  rows={8}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
                />
              </label>
              <label className="block">
                <span className="text-[12px] font-bold text-stone-500">Hashtags</span>
                <input
                  value={postHashtags}
                  onChange={(event) => setPostHashtags(event.target.value)}
                  maxLength={200}
                  className="mt-1 w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  const text = [postCaption.trim(), postHashtags.trim()].filter(Boolean).join("\n\n");
                  void copyText(text).then((ok) => onMessage(ok ? "Caption copied" : "Nothing to copy"));
                }}
                className="rounded-xl px-4 py-2 text-sm font-bold text-white"
                style={{ backgroundColor: GREEN }}
              >
                Copy caption
              </button>
            </div>
            <p className="text-[12px] text-stone-500">
              {job.clips.length} {job.clips.length === 1 ? "clip" : "clips"}
              {job.byteSize > 0 ? ` · ${formatBytes(job.byteSize)}` : ""} · originals are not recompressed
            </p>
            {job.cut && job.cut.previewUrl && (
              <div className="rounded-2xl border border-stone-200 bg-stone-50 px-3 py-3 space-y-3">
                <p className="text-base font-extrabold text-stone-900">Your video</p>
                <video
                  key={job.cut.previewUrl}
                  src={job.cut.previewUrl}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full max-h-[70vh] bg-black rounded-2xl"
                />
              </div>
            )}

            <div className="space-y-3">
              {job.clips.map((clip, index) => (
                <article key={clip.id} className="rounded-2xl border border-stone-200 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] font-bold text-stone-500">Clip {index + 1}</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={index === 0 || progress !== null}
                        onClick={() => void moveClip(index, -1)}
                        className="text-[12px] font-bold text-stone-600 disabled:opacity-30"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        disabled={index === job.clips.length - 1 || progress !== null}
                        onClick={() => void moveClip(index, 1)}
                        className="text-[12px] font-bold text-stone-600 disabled:opacity-30"
                      >
                        Down
                      </button>
                      <button type="button" onClick={() => void removeClip(clip)} className="text-[12px] font-bold text-red-700">
                        Remove
                      </button>
                    </div>
                  </div>
                  <input
                    id={`clip-name-${clip.id}`}
                    defaultValue={clip.name}
                    key={`${clip.id}:${clip.name}`}
                    maxLength={80}
                    onBlur={(event) => void saveClip(clip, event.target.value, kindRef.current[clip.id] ?? clip.kind)}
                    className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-bold text-stone-900"
                  />
                  <div className="flex flex-wrap gap-2">
                    {KINDS.map(([kind, label]) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => {
                          kindRef.current[clip.id] = kind;
                          setKindOverride((current) => ({ ...current, [clip.id]: kind }));
                          const input = document.getElementById(`clip-name-${clip.id}`);
                          const name = input instanceof HTMLInputElement ? input.value : clip.name;
                          void saveClip(clip, name, kind);
                        }}
                        className={`rounded-full px-3 py-1 text-[12px] font-bold ${kindOf(clip) === kind ? "text-white" : "bg-stone-100 text-stone-600"}`}
                        style={kindOf(clip) === kind ? { backgroundColor: GREEN } : undefined}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {clip.error && <p className="text-sm text-red-700">{clip.error}</p>}
                  {clip.status === "uploading" && (
                    <p className="text-sm text-stone-600">This clip did not finish. Remove it and add the file again.</p>
                  )}
                  {playError === clip.id && (
                    <p className="text-[12px] text-stone-500 leading-snug">
                      This browser can’t play that file. It is still saved unchanged.
                    </p>
                  )}
                </article>
              ))}
            </div>

            <label className={`relative block rounded-2xl px-4 py-4 text-center text-white ${progress ? "opacity-70" : "cursor-pointer"}`} style={{ backgroundColor: GREEN }}>
              <input
                ref={fileRef}
                type="file"
                accept="video/*,audio/*,.mp4,.mov,.m4v,.m4a,.mp3,.wav,.aac,.caf"
                multiple
                disabled={progress !== null}
                className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                onChange={(event) => {
                  const picked = event.target.files ? Array.from(event.target.files) : [];
                  event.target.value = "";
                  if (!picked.length) {
                    setLocalError("No file came through. Choose it again.");
                    return;
                  }
                  void uploadFiles(picked);
                }}
              />
              <span className="text-sm font-bold">{progress ?? "Add clips"}</span>
              <span className="block text-[12px] text-white/85 mt-1">
                {progress
                  ? "Keep this tab open. Files are sent in pieces and are not recompressed."
                  : "Talking head, screen recording, or voiceover. A Voice Memo is under Files, not Photos."}
              </span>
            </label>
            {localError && <p className="text-sm text-red-700">{localError}</p>}

            <label className="block">
              <span className="text-[12px] font-bold text-stone-500">What should the finished video do?</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                maxLength={8000}
                rows={6}
                placeholder="Talking head opens, then the app demo with the voiceover under it."
                className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900"
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-bold text-stone-500">Reference video (optional)</span>
              <input
                value={referenceUrl}
                onChange={(event) => setReferenceUrl(event.target.value)}
                maxLength={500}
                placeholder="https://www.tiktok.com/… or an Instagram reel"
                className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900"
              />
            </label>
            <button
              type="button"
              onClick={() => void saveDetails()}
              disabled={progress !== null}
              className="rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              style={{ backgroundColor: GREEN }}
            >
              Make video
            </button>
          </>
        )}
      </section>
    </div>
  );
}
