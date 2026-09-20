import { useEffect, useMemo, useRef, useState } from "react";
import { api, type StudioMe, type UgcFolder, type UgcInsights, type UgcVideo } from "../api";

const GREEN = "#33663f";

function statusTone(status: string): string {
  if (status === "published" || status === "winner") return "bg-green-100 text-green-800";
  if (status === "scheduled" || status === "approved") return "bg-green-50 text-green-800";
  if (status === "rejected" || status === "failed" || status === "dud") return "bg-red-100 text-red-700";
  if (status === "pending_review" || status === "uploaded") return "bg-amber-100 text-amber-800";
  return "bg-stone-200 text-stone-700";
}

function labelStatus(status: string): string {
  if (status === "pending_review" || status === "uploaded") return "Uploaded";
  if (status === "approved") return "Approved";
  if (status === "scheduled") return "Queued to post";
  if (status === "published") return "Posted";
  if (status === "rejected") return "Not using this one";
  if (status === "failed") return "Post failed";
  return status;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function isUgcVideoFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (!name || name.startsWith(".")) return false;
  if (file.type.startsWith("video/")) return true;
  return /\.(mp4|mov)$/i.test(name);
}

function clipTitleOf(video: UgcVideo): string {
  if (video.clipTitle?.trim()) return video.clipTitle.trim();
  const base = video.fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base || "Untitled clip";
}

function VideoPoster({ src, className }: { src: string; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let gone = false;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = src;
    const draw = () => {
      if (gone) return;
      const canvas = canvasRef.current;
      if (!canvas || !video.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    };
    const seek = () => {
      try {
        video.currentTime = Math.min(0.12, (video.duration || 1) * 0.05);
      } catch {
        draw();
      }
    };
    video.addEventListener("loadeddata", seek);
    video.addEventListener("seeked", draw);
    return () => {
      gone = true;
      video.removeAttribute("src");
      video.load();
    };
  }, [src]);
  return <canvas ref={canvasRef} className={className} />;
}

function ClipTitleField({
  video,
  onSaved,
  onMessage,
}: {
  video: UgcVideo;
  onSaved: () => Promise<void>;
  onMessage: (s: string) => void;
}) {
  const [value, setValue] = useState(clipTitleOf(video));
  useEffect(() => {
    setValue(clipTitleOf(video));
  }, [video.uuid, video.clipTitle, video.fileName]);
  return (
    <input
      value={value}
      onChange={(ev) => setValue(ev.target.value)}
      onBlur={async () => {
        const next = value.trim();
        if (!next || next === clipTitleOf(video)) return;
        const result = await api.organizeUgc(video.uuid, { clipTitle: next });
        if (!result.ok) {
          onMessage(result.error ?? "Could not save clip title");
          return;
        }
        await onSaved();
      }}
      placeholder="What makes this clip different"
      className="w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-sm font-extrabold text-stone-900"
    />
  );
}

function Pill({ status }: { status: string }) {
  return (
    <span className={`shrink-0 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide ${statusTone(status)}`}>
      {labelStatus(status)}
    </span>
  );
}

async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

async function shareUgcToPhotos(video: UgcVideo): Promise<void> {
  const res = await fetch(video.fileUrl, { credentials: "include" });
  if (!res.ok) throw new Error("Could not load the video. Hard-refresh and try again.");
  const blob = await res.blob();
  if (!blob.type.startsWith("video/") && blob.size < 1000) {
    throw new Error("Video file is missing. Hard-refresh and try again.");
  }
  const ext = video.fileName.toLowerCase().endsWith(".mov") ? "mov" : "mp4";
  const file = new File([blob], `remedy-ugc-${video.uuid}.${ext}`, { type: blob.type || "video/mp4" });
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
  if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: video.title || "Remedy UGC" });
    return;
  }
  window.location.href = `${video.fileUrl}${video.fileUrl.includes("?") ? "&" : "?"}download=1`;
}

function CopySaveRow({ video, onMessage }: { video: UgcVideo; onMessage: (s: string) => void }) {
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          try {
            await shareUgcToPhotos(video);
            onMessage("Share sheet opened — tap Save Video");
          } catch (err) {
            onMessage(err instanceof Error ? err.message : "Could not download the video");
          } finally {
            setSaving(false);
          }
        }}
        className="w-full py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40"
        style={{ backgroundColor: GREEN }}
      >
        {saving ? "Loading video…" : "Download to Photos"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => copyText(video.title).then(() => onMessage("Title copied"))}
          className="py-2.5 rounded-xl bg-stone-100 text-sm font-bold"
        >
          Copy title
        </button>
        <button
          type="button"
          onClick={() => copyText(video.caption).then(() => onMessage("Caption copied"))}
          className="py-2.5 rounded-xl bg-stone-800 text-white text-sm font-bold"
        >
          Copy caption
        </button>
      </div>
    </div>
  );
}

function VideoCard({
  video,
  folders,
  onMessage,
  onReload,
}: {
  video: UgcVideo;
  folders: UgcFolder[];
  onMessage: (s: string) => void;
  onReload: () => Promise<void>;
}) {
  const when = video.publishedAt
    ? `Posted ${formatWhen(video.publishedAt)}`
    : video.scheduledAt
      ? `Goes out ${formatWhen(video.scheduledAt)}`
      : formatWhen(video.createdAt);
  return (
    <li
      draggable
      onDragStart={(ev) => {
        ev.dataTransfer.setData("text/ugc-uuid", video.uuid);
        ev.dataTransfer.setData("text/plain", video.uuid);
        ev.dataTransfer.effectAllowed = "move";
      }}
      className="rounded-2xl border border-stone-200 bg-white overflow-hidden p-4 space-y-3 cursor-grab active:cursor-grabbing"
    >
      <ClipTitleField video={video} onSaved={onReload} onMessage={onMessage} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-stone-500">Post title</p>
          <p className="text-sm font-bold leading-snug">{video.title}</p>
          {when && <p className="text-[12px] text-stone-500 mt-1">{when}</p>}
          {video.rejectReason && <p className="text-[12px] text-red-700 mt-1">{video.rejectReason}</p>}
        </div>
        <Pill status={video.status} />
      </div>
      <video
        src={video.fileUrl}
        controls
        playsInline
        preload="metadata"
        className="w-full max-w-[220px] mx-auto lg:max-w-none rounded-xl bg-black aspect-[9/16] object-contain"
      />
      <p className="text-sm text-stone-700 whitespace-pre-wrap">{video.caption}</p>
      {folders.length > 0 && (
        <label className="block text-xs font-semibold text-stone-600">
          Move to folder
          <select
            value={video.folderId ?? ""}
            onChange={async (ev) => {
              const folderId = ev.target.value || null;
              const result = await api.organizeUgc(video.uuid, { folderId });
              if (!result.ok) {
                onMessage(result.error ?? "Could not move the video");
                return;
              }
              await onReload();
            }}
            className="mt-1 w-full rounded-xl border border-stone-200 px-3 py-2 text-sm"
          >
            <option value="">Main page</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <CopySaveRow video={video} onMessage={onMessage} />
      {video.error && <p className="text-xs text-red-700">{video.error}</p>}
      {video.analytics.length > 0 && (
        <p className="text-[12px] text-stone-500">
          {video.analytics.map((a) => `${a.platform} ${a.views} views`).join(" · ")}
        </p>
      )}
    </li>
  );
}

function FolderCard({
  folder,
  cover,
  count,
  onOpen,
  onDropVideo,
}: {
  folder: UgcFolder;
  cover: UgcVideo | null;
  count: number;
  onOpen: () => void;
  onDropVideo: (uuid: string) => void;
}) {
  const [over, setOver] = useState(false);
  const ignoreClick = useRef(false);
  return (
    <button
      type="button"
      onClick={() => {
        if (ignoreClick.current) {
          ignoreClick.current = false;
          return;
        }
        onOpen();
      }}
      onDragOver={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        setOver(false);
        const uuid = ev.dataTransfer.getData("text/ugc-uuid") || ev.dataTransfer.getData("text/plain");
        if (!uuid) return;
        ignoreClick.current = true;
        onDropVideo(uuid);
      }}
      className={`group relative w-full aspect-[9/16] rounded-2xl overflow-hidden text-left cursor-pointer ring-1 ring-white/15 ${over ? "ring-2 ring-green-700" : ""}`}
    >
      {cover ? (
        <VideoPoster src={cover.fileUrl} className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
      ) : (
        <div className="absolute inset-0 bg-stone-800 flex items-center justify-center text-white/70 text-sm font-bold">Empty</div>
      )}
      <span className="absolute top-2.5 left-2.5 z-10 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-bold tracking-wide text-white">
        Open ›
      </span>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pt-10 pb-3">
        <p className="text-sm font-extrabold text-white truncate">{folder.name}</p>
        <p className="text-[12px] text-white/80">{count === 1 ? "1 video" : `${count} videos`}</p>
      </div>
    </button>
  );
}

function InsightsPane({ insights }: { insights: UgcInsights | null }) {
  if (!insights || insights.videos.length === 0) {
    return (
      <div className="rounded-2xl bg-white border border-stone-200 px-4 py-8 text-center">
        <p className="text-sm font-bold">No numbers yet</p>
        <p className="text-[13px] text-stone-500 mt-1 leading-relaxed">
          After a video posts, views and likes show up here so you can see what landed.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-4 pb-8">
      {insights.whatWorked.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-extrabold px-1">What worked</h3>
          {insights.whatWorked.map((v) => (
            <div key={v.uuid} className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
              <p className="text-sm font-bold">{v.title}</p>
              <p className="text-[12px] text-stone-500 mt-0.5">
                {v.views} views{v.diagnosis ? ` · ${v.diagnosis}` : ""}
              </p>
            </div>
          ))}
        </section>
      )}
      <section className="space-y-2">
        <h3 className="text-sm font-extrabold px-1">Every video</h3>
        {insights.videos.map((v) => (
          <div key={v.uuid} className="rounded-2xl border border-stone-200 bg-white px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-bold leading-snug">{v.title}</p>
              <Pill status={v.status} />
            </div>
            <p className="text-[12px] text-stone-500 mt-2">
              {v.views} views · {v.likes} likes · {v.comments} comments
            </p>
            {(v.publishedAt || v.scheduledAt) && (
              <p className="text-[12px] text-stone-400 mt-1">{formatWhen(v.publishedAt ?? v.scheduledAt)}</p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}

export function UgcView({
  me,
  sub,
  onSub,
  onMessage,
}: {
  me: StudioMe;
  sub: "sohan" | "ai";
  onSub: (next: "sohan" | "ai") => void;
  onMessage: (s: string) => void;
}) {
  const filesRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [allVideos, setAllVideos] = useState<UgcVideo[]>([]);
  const [folders, setFolders] = useState<UgcFolder[]>([]);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

  const load = async () => {
    const pack = await api.ugc();
    setAllVideos(pack.videos);
    setFolders(pack.folders ?? []);
  };

  useEffect(() => {
    load().catch((err) => onMessage(err instanceof Error ? err.message : "Failed to load UGC"));
  }, []);

  useEffect(() => {
    setOpenFolderId(null);
    setNewFolderName("");
  }, [sub]);

  const videos = useMemo(() => allVideos.filter((v) => v.creatorSlug === sub), [allVideos, sub]);
  const tabFolders = useMemo(
    () =>
      folders
        .filter((f) => f.creatorSlug === sub)
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.name.localeCompare(b.name)),
    [folders, sub],
  );
  const openFolder = tabFolders.find((f) => f.id === openFolderId) ?? null;
  const rest = useMemo(() => {
    if (openFolderId) return videos.filter((v) => v.folderId === openFolderId);
    return videos.filter((v) => !v.folderId);
  }, [videos, openFolderId]);

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list).filter(isUgcVideoFile);
    if (files.length === 0) {
      onMessage("No mp4 or mov files in that selection.");
      if (filesRef.current) filesRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
      return;
    }
    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });
    let ok = 0;
    const errors: string[] = [];
    try {
      for (const file of files) {
        try {
          const result = await api.uploadUgc(file, { creatorSlug: sub, uuid: crypto.randomUUID() });
          if (!result.ok || !result.video) throw new Error(result.error ?? "Upload failed");
          const check = await fetch(result.video.fileUrl, { credentials: "include" });
          if (!check.ok) throw new Error("Upload reported ok but the file is missing. Try again — nothing else was deleted.");
          if (openFolderId && result.video) {
            await api.organizeUgc(result.video.uuid, { folderId: openFolderId });
          }
          ok += 1;
        } catch (err) {
          errors.push(`${file.name}: ${err instanceof Error ? err.message : "failed"}`);
        }
        setUploadProgress({ done: ok + errors.length, total: files.length });
      }
      await load();
      if (errors.length === 0) {
        onMessage(ok === 1 ? "Uploaded." : `Uploaded ${ok} videos.`);
      } else {
        onMessage(`Uploaded ${ok} of ${files.length}. ${errors[0]}`);
      }
    } finally {
      setUploading(false);
      setUploadProgress(null);
      if (filesRef.current) filesRef.current.value = "";
      if (folderRef.current) folderRef.current.value = "";
    }
  };

  const moveToFolder = async (uuid: string, folderId: string | null) => {
    const result = await api.organizeUgc(uuid, { folderId });
    if (!result.ok) {
      onMessage(result.error ?? "Could not move the video");
      return;
    }
    await load();
  };

  const makeFolder = async () => {
    const name = newFolderName.trim();
    if (!name) {
      onMessage("Name the folder.");
      return;
    }
    const result = await api.createUgcFolder(name, sub);
    if (!result.ok || !result.folder) {
      onMessage(result.error ?? "Could not make the folder");
      return;
    }
    setNewFolderName("");
    setOpenFolderId(result.folder.id);
    await load();
    onMessage(`Folder “${result.folder.name}” is open. Uploads go here.`);
  };

  return (
    <div className="max-w-xl mx-auto lg:max-w-4xl space-y-4 pb-8">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => onSub("sohan")}
          className={`min-h-11 rounded-xl text-sm font-bold ${sub === "sohan" ? "text-white" : "bg-white border border-stone-200 text-stone-700"}`}
          style={sub === "sohan" ? { backgroundColor: GREEN } : undefined}
        >
          Sohan
        </button>
        <button
          type="button"
          onClick={() => onSub("ai")}
          className={`min-h-11 rounded-xl text-sm font-bold ${sub === "ai" ? "text-white" : "bg-white border border-stone-200 text-stone-700"}`}
          style={sub === "ai" ? { backgroundColor: GREEN } : undefined}
        >
          AI
        </button>
      </div>

      <div className="space-y-4">
          <section className="rounded-2xl bg-white border border-stone-200 px-4 py-4">
            <p className="text-base font-extrabold">How this works</p>
            <ol className="mt-2 space-y-1.5 text-[13px] text-stone-600 leading-snug">
              <li>1. You upload videos — one, several, or a whole folder.</li>
              <li>2. They show up under Your videos. Group iterations in a folder.</li>
              <li>3. Download a clip to Photos when you want it on your phone.</li>
            </ol>
          </section>

          <section
            className={`rounded-2xl overflow-hidden ${uploading ? "pointer-events-none opacity-70" : ""}`}
            style={{ backgroundColor: GREEN }}
          >
            <div className="px-5 pt-6 pb-4 text-center text-white">
              <p className="text-lg font-extrabold">
                {uploading && uploadProgress
                  ? `Uploading ${uploadProgress.done} of ${uploadProgress.total}…`
                  : uploading
                    ? "Uploading…"
                    : "Upload"}
              </p>
              <p className="text-[13px] text-white/85 mt-1 leading-snug">
                {uploading
                  ? "Keep this tab open until it finishes."
                  : openFolder
                    ? `Goes into “${openFolder.name}” · mp4 or mov · under 100MB`
                    : "mp4 or mov · under 100MB each · videos or a folder"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-px bg-white/25">
              <label className="relative block bg-[#33663f] px-4 py-3.5 text-center cursor-pointer">
                <input
                  ref={filesRef}
                  type="file"
                  accept="video/*"
                  multiple
                  disabled={uploading}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                  onChange={(ev) => onFiles(ev.target.files)}
                />
                <span className="text-sm font-bold text-white">Videos</span>
              </label>
              <label className="relative block bg-[#33663f] px-4 py-3.5 text-center cursor-pointer">
                <input
                  ref={folderRef}
                  type="file"
                  multiple
                  disabled={uploading}
                  className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                  onChange={(ev) => onFiles(ev.target.files)}
                  {...{ webkitdirectory: "", directory: "" }}
                />
                <span className="text-sm font-bold text-white">Folder</span>
              </label>
            </div>
          </section>

          <section className="space-y-3">
            {openFolder ? (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setOpenFolderId(null)}
                  className="min-h-11 px-4 rounded-xl bg-stone-100 text-sm font-bold"
                >
                  All videos
                </button>
                <input
                  value={openFolder.name}
                  onChange={(ev) =>
                    setFolders((prev) => prev.map((f) => (f.id === openFolder.id ? { ...f, name: ev.target.value } : f)))
                  }
                  onBlur={async () => {
                    const name = openFolder.name.trim();
                    if (!name) return;
                    const result = await api.renameUgcFolder(openFolder.id, name);
                    if (!result.ok) onMessage(result.error ?? "Could not rename");
                    else await load();
                  }}
                  className="flex-1 min-w-[8rem] rounded-xl border border-stone-200 px-3 py-2.5 text-sm font-extrabold"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const result = await api.deleteUgcFolder(openFolder.id);
                    if (!result.ok) {
                      onMessage(result.error ?? "Could not remove the folder");
                      return;
                    }
                    setOpenFolderId(null);
                    await load();
                    onMessage("Folder removed. Videos are back on the main page.");
                  }}
                  className="min-h-11 px-4 rounded-xl bg-stone-200 text-sm font-bold"
                >
                  Remove folder
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={newFolderName}
                  onChange={(ev) => setNewFolderName(ev.target.value)}
                  placeholder="New folder name"
                  maxLength={80}
                  className="flex-1 rounded-xl border border-stone-200 px-3 py-2.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => makeFolder()}
                  className="min-h-11 px-4 rounded-xl text-white text-sm font-bold"
                  style={{ backgroundColor: GREEN }}
                >
                  New folder
                </button>
              </div>
            )}

            {!openFolder && tabFolders.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {tabFolders.map((folder) => {
                  const members = videos.filter((v) => v.folderId === folder.id);
                  const cover =
                    members.find((v) => v.uuid === folder.coverUuid) ??
                    members[0] ??
                    null;
                  return (
                    <FolderCard
                      key={folder.id}
                      folder={folder}
                      cover={cover}
                      count={members.length}
                      onOpen={() => setOpenFolderId(folder.id)}
                      onDropVideo={(uuid) => moveToFolder(uuid, folder.id)}
                    />
                  );
                })}
              </div>
            )}

            <h3 className="text-sm font-extrabold px-1">{openFolder ? openFolder.name : "Your videos"}</h3>
            {rest.length === 0 ? (
              <div
                className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-8 text-center"
                onDragOver={(ev) => ev.preventDefault()}
                onDrop={(ev) => {
                  ev.preventDefault();
                  const uuid = ev.dataTransfer.getData("text/ugc-uuid");
                  if (uuid) moveToFolder(uuid, openFolderId);
                }}
              >
                <p className="text-sm font-bold">{openFolder ? "Drop videos here" : "None yet"}</p>
                <p className="text-[13px] text-stone-500 mt-1 leading-relaxed">
                  {openFolder
                    ? "Drag a clip onto this folder, or use Move to folder on a card."
                    : "After you upload, it shows up here. Put iterations in a folder so this page stays clean."}
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {rest.map((video) => (
                  <VideoCard
                    key={video.uuid}
                    video={video}
                    folders={tabFolders}
                    onMessage={onMessage}
                    onReload={load}
                  />
                ))}
              </ul>
            )}
          </section>
      </div>
    </div>
  );
}
