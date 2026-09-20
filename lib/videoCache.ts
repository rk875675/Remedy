/**
 * On-device cache for exercise clips.
 *
 * Why this exists
 * ---------------
 * Exercise clips are ~8-11s loops that never change once published — static
 * assets, not streaming video. Without a cache the app re-downloads every clip
 * on every session: roughly 121 downloads per user per month at 4 sessions/week
 * with ~7 exercises per session. Caching turns that into one download per clip
 * per device, for the life of the install.
 *
 * That removes bandwidth as a scaling cost, and makes playback instant (and
 * offline-capable) after first view.
 *
 * Storage location
 * ----------------
 * Uses `Paths.cache`, not `Paths.document`, deliberately. These clips are always
 * re-downloadable, and Apple expects re-downloadable content in Caches so the OS
 * can reclaim it under storage pressure — content in Documents also counts toward
 * iCloud backup and the user-visible "Documents & Data" figure. If the OS does
 * evict a clip, `getVideoUri` transparently re-downloads it.
 *
 * Failure behaviour
 * -----------------
 * Video is not critical to completing a session, so nothing here throws. If a
 * download fails, callers get the original remote URL back and the player falls
 * back to streaming it directly — same behaviour as before this cache existed.
 */
import { Directory, File, Paths } from 'expo-file-system';

const CACHE_DIR_NAME = 'exercise-videos';

/**
 * Dedupes concurrent requests for the same URL. The session player can ask for a
 * clip from both the prefetch path and the main load effect; without this the
 * same bytes would be downloaded twice.
 */
const inFlight = new Map<string, Promise<string>>();

/**
 * Non-cryptographic djb2 hash. Used only to derive a collision-resistant cache
 * filename — never for security.
 */
function hashUrl(url: string): string {
  let hash = 5381;
  for (let i = 0; i < url.length; i += 1) {
    hash = ((hash << 5) + hash + url.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}

/**
 * Cache filename for a remote URL.
 *
 * Hashes the URL with the query string REMOVED. Signed URLs (R2 presigned GETs from
 * get-video-url) carry a fresh signature and timestamp on every request, so hashing the
 * full URL gave every playback a brand-new filename — the cache would never hit and each
 * clip would re-download every session, which is exactly what this module exists to
 * prevent. The path still identifies the object, so re-hosting a clip or re-uploading it
 * under a new key continues to invalidate naturally.
 */
function cacheFileName(remoteUrl: string): string {
  const withoutQuery = remoteUrl.split('?')[0];
  const lastSegment = withoutQuery.substring(withoutQuery.lastIndexOf('/') + 1);
  const safeSegment = lastSegment.replace(/[^a-zA-Z0-9._-]/g, '_') || 'clip.mp4';
  return `${hashUrl(withoutQuery)}-${safeSegment}`;
}

function cacheDirectory(): Directory {
  return new Directory(Paths.cache, CACHE_DIR_NAME);
}

function ensureCacheDirectory(): Directory {
  const dir = cacheDirectory();
  if (!dir.exists) {
    dir.create({ intermediates: true, idempotent: true });
  }
  return dir;
}

function cacheFileFor(remoteUrl: string): File {
  return new File(cacheDirectory(), cacheFileName(remoteUrl));
}

/**
 * Synchronous cache hit check. Returns a `file://` URI, or null when the clip
 * isn't cached yet. Useful for deciding whether playback can start immediately.
 *
 * A zero-byte file is treated as a miss — on Android an interrupted download can
 * leave a partial file behind.
 */
export function getCachedVideoUri(remoteUrl: string): string | null {
  try {
    const file = cacheFileFor(remoteUrl);
    return file.exists && file.size > 0 ? file.uri : null;
  } catch {
    return null;
  }
}

/**
 * Resolves a playable URI for a clip, downloading and caching it on first use.
 *
 * Returns a local `file://` URI when the clip is cached or the download succeeds,
 * and falls back to `remoteUrl` if anything goes wrong so playback still works.
 */
export function getVideoUri(remoteUrl: string): Promise<string> {
  const cached = getCachedVideoUri(remoteUrl);
  if (cached) return Promise.resolve(cached);

  const existing = inFlight.get(remoteUrl);
  if (existing) return existing;

  const download = (async (): Promise<string> => {
    try {
      ensureCacheDirectory();
      const destination = cacheFileFor(remoteUrl);

      // idempotent so retrying after a partial or evicted file overwrites rather
      // than rejecting with DestinationAlreadyExists.
      const downloaded = await File.downloadFileAsync(remoteUrl, destination, {
        idempotent: true,
      });

      if (!downloaded.exists || downloaded.size <= 0) {
        safeDelete(destination);
        return remoteUrl;
      }
      return downloaded.uri;
    } catch {
      safeDelete(cacheFileFor(remoteUrl));
      return remoteUrl;
    } finally {
      inFlight.delete(remoteUrl);
    }
  })();

  inFlight.set(remoteUrl, download);
  return download;
}

/**
 * Warms the cache without caring about the result. Intended for the rest phase,
 * where the next exercise's clip can be fetched while the user recovers.
 */
export async function prefetchVideo(remoteUrl: string): Promise<void> {
  try {
    await getVideoUri(remoteUrl);
  } catch {
    // Prefetching is best-effort; the main load path will retry.
  }
}

function safeDelete(file: File): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // Nothing actionable — a stale file is a cache miss, not a failure.
  }
}

/** Total bytes currently cached. Returns 0 when the cache is empty or unreadable. */
export function getVideoCacheSize(): number {
  try {
    const dir = cacheDirectory();
    if (!dir.exists) return 0;
    return dir
      .list()
      .reduce((total, entry) => total + (entry instanceof File ? entry.size : 0), 0);
  } catch {
    return 0;
  }
}

/** Removes every cached clip. Exposed for a debug/settings "clear cache" action. */
export function clearVideoCache(): void {
  try {
    const dir = cacheDirectory();
    if (dir.exists) dir.delete();
  } catch {
    // Non-fatal: the cache is disposable by definition.
  }
}
