/**
 * Cloud-authoritative reject/delete list for the illustration + screenshot
 * libraries. The live dashboard (Cloudflare Pages) writes this to R2 so
 * Reject / Delete work from the phone without the PC engine. The engine
 * pulls the same file before generate / snapshot so new slides respect it.
 * Already-rendered slides are left alone.
 */

import fs from "node:fs";
import path from "node:path";
import { ASSETS_DIR, r2Configured } from "../config.js";
import { downloadText, uploadBuffer } from "../publish/r2.js";

export const LIBRARY_OVERRIDES_KEY = "growth/library-overrides.json";

export interface LibraryOverrides {
  rejectedIllustrations: string[];
  deletedScreenshots: string[];
}

const LOCAL_PATH = path.join(ASSETS_DIR, "library-overrides.json");

const EMPTY: LibraryOverrides = { rejectedIllustrations: [], deletedScreenshots: [] };

let cache: LibraryOverrides | null = null;

function normalize(raw: unknown): LibraryOverrides {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rejected = Array.isArray(obj.rejectedIllustrations)
    ? obj.rejectedIllustrations.filter((id): id is string => typeof id === "string")
    : [];
  const deleted = Array.isArray(obj.deletedScreenshots)
    ? obj.deletedScreenshots.filter((file): file is string => typeof file === "string")
    : [];
  return {
    rejectedIllustrations: [...new Set(rejected)],
    deletedScreenshots: [...new Set(deleted)],
  };
}

export function readLibraryOverrides(): LibraryOverrides {
  if (cache) return cache;
  try {
    if (fs.existsSync(LOCAL_PATH)) {
      cache = normalize(JSON.parse(fs.readFileSync(LOCAL_PATH, "utf-8")));
      return cache;
    }
  } catch {
    /* fall through */
  }
  cache = { ...EMPTY, rejectedIllustrations: [], deletedScreenshots: [] };
  return cache;
}

export function writeLibraryOverrides(next: LibraryOverrides): LibraryOverrides {
  cache = normalize(next);
  fs.mkdirSync(ASSETS_DIR, { recursive: true });
  fs.writeFileSync(LOCAL_PATH, JSON.stringify(cache, null, 2) + "\n");
  return cache;
}

export async function persistLibraryOverrides(next: LibraryOverrides): Promise<LibraryOverrides> {
  const saved = writeLibraryOverrides(next);
  if (r2Configured()) {
    await uploadBuffer(LIBRARY_OVERRIDES_KEY, Buffer.from(JSON.stringify(saved), "utf8"), "application/json");
  }
  return saved;
}

function applyDeletedScreenshots(overrides: LibraryOverrides): void {
  for (const file of overrides.deletedScreenshots) {
    // Never auto-wipe user crops from a stale delete list.
    if (path.basename(file).startsWith("crop_")) continue;
    const local = path.join(ASSETS_DIR, path.basename(file));
    if (fs.existsSync(local)) fs.unlinkSync(local);
  }
}

/** Pull the cloud list, write it locally, delete any screenshots marked gone. */
export async function syncLibraryOverridesFromR2(): Promise<LibraryOverrides> {
  if (r2Configured()) {
    const raw = await downloadText(LIBRARY_OVERRIDES_KEY);
    if (raw) {
      try {
        writeLibraryOverrides(normalize(JSON.parse(raw)));
      } catch {
        /* keep local cache */
      }
    }
  }
  const overrides = readLibraryOverrides();
  applyDeletedScreenshots(overrides);
  return overrides;
}

export async function setRejectedIllustration(id: string, enabled: boolean): Promise<LibraryOverrides> {
  const current = readLibraryOverrides();
  const rejected = new Set(current.rejectedIllustrations);
  if (enabled) rejected.delete(id);
  else rejected.add(id);
  return persistLibraryOverrides({
    ...current,
    rejectedIllustrations: [...rejected],
  });
}

export async function markScreenshotDeleted(file: string): Promise<LibraryOverrides> {
  const current = readLibraryOverrides();
  const deleted = new Set(current.deletedScreenshots);
  deleted.add(file);
  return persistLibraryOverrides({
    ...current,
    deletedScreenshots: [...deleted],
  });
}

export async function unmarkScreenshotDeleted(file: string): Promise<LibraryOverrides> {
  const current = readLibraryOverrides();
  if (!current.deletedScreenshots.includes(file)) return current;
  return persistLibraryOverrides({
    ...current,
    deletedScreenshots: current.deletedScreenshots.filter((f) => f !== file),
  });
}

export function isIllustrationRejected(id: string): boolean {
  return readLibraryOverrides().rejectedIllustrations.includes(id);
}

export function isScreenshotDeleted(file: string): boolean {
  return readLibraryOverrides().deletedScreenshots.includes(file);
}
