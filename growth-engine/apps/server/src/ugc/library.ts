import fs from "node:fs";
import path from "node:path";
import { OUTPUT_DIR, r2Configured } from "../config.js";
import { downloadText, uploadBuffer } from "../publish/r2.js";
import { clipTitleFromFileName } from "./caption.js";

export const UGC_LIBRARY_KEY = "growth/ugc-library.json";

export interface UgcFolder {
  id: string;
  name: string;
  creatorSlug: string;
  createdAt: string;
  coverUuid: string | null;
}

export interface UgcClipMeta {
  folderId: string | null;
  clipTitle: string;
}

export interface UgcLibrary {
  folders: UgcFolder[];
  clips: Record<string, UgcClipMeta>;
}

const EMPTY: UgcLibrary = { folders: [], clips: {} };
const localPath = () => path.join(OUTPUT_DIR, "ugc-library.json");

function normalize(raw: unknown): UgcLibrary {
  if (!raw || typeof raw !== "object") return { folders: [], clips: {} };
  const o = raw as Partial<UgcLibrary>;
  const folders = Array.isArray(o.folders)
    ? o.folders.filter((f): f is UgcFolder => Boolean(f && typeof f.id === "string" && typeof f.name === "string" && typeof f.creatorSlug === "string"))
    : [];
  const clips: Record<string, UgcClipMeta> = {};
  if (o.clips && typeof o.clips === "object") {
    for (const [uuid, meta] of Object.entries(o.clips)) {
      if (!meta || typeof meta !== "object") continue;
      const folderId = typeof meta.folderId === "string" ? meta.folderId : null;
      const clipTitle = typeof meta.clipTitle === "string" ? meta.clipTitle.trim() : "";
      clips[uuid] = { folderId, clipTitle };
    }
  }
  return { folders, clips };
}

export async function loadLibrary(): Promise<UgcLibrary> {
  try {
    if (fs.existsSync(localPath())) {
      return normalize(JSON.parse(fs.readFileSync(localPath(), "utf8")));
    }
  } catch {
    /* fall through */
  }
  if (r2Configured()) {
    const text = await downloadText(UGC_LIBRARY_KEY);
    if (text) {
      const lib = normalize(JSON.parse(text));
      try {
        fs.mkdirSync(path.dirname(localPath()), { recursive: true });
        fs.writeFileSync(localPath(), JSON.stringify(lib));
      } catch {
        /* cache miss is fine */
      }
      return lib;
    }
  }
  return { ...EMPTY, folders: [], clips: {} };
}

export async function saveLibrary(lib: UgcLibrary): Promise<void> {
  const normalized = normalize(lib);
  fs.mkdirSync(path.dirname(localPath()), { recursive: true });
  fs.writeFileSync(localPath(), JSON.stringify(normalized));
  if (r2Configured()) {
    await uploadBuffer(UGC_LIBRARY_KEY, Buffer.from(JSON.stringify(normalized), "utf8"), "application/json");
  }
}

export function applyLibraryToVideos<T extends { uuid: string; fileName: string }>(
  videos: T[],
  lib: UgcLibrary,
): Array<T & { clipTitle: string; folderId: string | null }> {
  return videos.map((v) => {
    const meta = lib.clips[v.uuid];
    return {
      ...v,
      clipTitle: meta?.clipTitle?.trim() || clipTitleFromFileName(v.fileName),
      folderId: meta?.folderId ?? null,
    };
  });
}

function clipOf(lib: UgcLibrary, uuid: string, fileName = ""): UgcClipMeta {
  return lib.clips[uuid] ?? { folderId: null, clipTitle: clipTitleFromFileName(fileName) };
}

function refreshCover(lib: UgcLibrary, folderId: string): void {
  const folder = lib.folders.find((f) => f.id === folderId);
  if (!folder) return;
  const members = Object.entries(lib.clips)
    .filter(([, c]) => c.folderId === folderId)
    .map(([uuid]) => uuid);
  if (folder.coverUuid && members.includes(folder.coverUuid)) return;
  folder.coverUuid = members[0] ?? null;
}

export async function createFolder(name: string, creatorSlug: string): Promise<UgcFolder> {
  const lib = await loadLibrary();
  const folder: UgcFolder = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 80) || "Untitled",
    creatorSlug,
    createdAt: new Date().toISOString(),
    coverUuid: null,
  };
  lib.folders.unshift(folder);
  await saveLibrary(lib);
  return folder;
}

export async function renameFolder(id: string, name: string): Promise<UgcFolder | null> {
  const lib = await loadLibrary();
  const folder = lib.folders.find((f) => f.id === id);
  if (!folder) return null;
  folder.name = name.trim().slice(0, 80) || folder.name;
  await saveLibrary(lib);
  return folder;
}

export async function deleteFolder(id: string): Promise<boolean> {
  const lib = await loadLibrary();
  const before = lib.folders.length;
  lib.folders = lib.folders.filter((f) => f.id !== id);
  for (const clip of Object.values(lib.clips)) {
    if (clip.folderId === id) clip.folderId = null;
  }
  if (lib.folders.length === before) return false;
  await saveLibrary(lib);
  return true;
}

export async function organizeClip(params: {
  uuid: string;
  fileName?: string;
  folderId?: string | null;
  clipTitle?: string;
}): Promise<UgcClipMeta> {
  const lib = await loadLibrary();
  const current = clipOf(lib, params.uuid, params.fileName ?? "");
  const next: UgcClipMeta = {
    folderId: params.folderId === undefined ? current.folderId : params.folderId,
    clipTitle: params.clipTitle !== undefined ? params.clipTitle.trim().slice(0, 80) : current.clipTitle,
  };
  if (!next.clipTitle) next.clipTitle = clipTitleFromFileName(params.fileName ?? "") || current.clipTitle;
  const prevFolder = current.folderId;
  lib.clips[params.uuid] = next;
  if (next.folderId) {
    const folder = lib.folders.find((f) => f.id === next.folderId);
    if (folder && !folder.coverUuid) folder.coverUuid = params.uuid;
  }
  if (prevFolder && prevFolder !== next.folderId) refreshCover(lib, prevFolder);
  if (next.folderId) refreshCover(lib, next.folderId);
  await saveLibrary(lib);
  return next;
}

export async function ensureClipTitle(uuid: string, fileName: string): Promise<string> {
  const lib = await loadLibrary();
  const existing = lib.clips[uuid];
  if (existing?.clipTitle.trim()) return existing.clipTitle;
  const clipTitle = clipTitleFromFileName(fileName);
  lib.clips[uuid] = { folderId: existing?.folderId ?? null, clipTitle };
  await saveLibrary(lib);
  return clipTitle;
}
