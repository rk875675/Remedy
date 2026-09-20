/**
 * Presigned GET URLs for exercise clips stored in Cloudflare R2.
 *
 * Why this exists
 * ---------------
 * `exercises.video_url` holds a public custom-domain URL
 * (https://videos.remedyrecoveries.com/exercises/<slug>.mp4). Those URLs need no
 * authentication and the slugs are guessable, so the clip library — the paid product —
 * was downloadable by anyone. Any signed-in free account could also read every URL
 * straight out of the `exercises` table.
 *
 * Presigning targets the S3 API endpoint (<account>.r2.cloudflarestorage.com), which
 * always requires a signature, independent of whether the bucket's custom domain is
 * public. So this closes the app's dependency on public access first; revoking public
 * access on the bucket afterwards then costs nothing.
 *
 * Deliberately NOT column-level security: revoking `video_url` from `authenticated`
 * would break every `select('*')` against `exercises`. Once the bucket is private the
 * stored URL is an identifier that returns 403 on its own, so it is safe to keep readable.
 */
import { AwsClient } from 'https://esm.sh/aws4fetch@1.0.20';

/** Presigned URLs only need to survive the download that immediately follows. */
const DEFAULT_TTL_SECONDS = 3600;

let client: AwsClient | null = null;

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBase: string;
};

/**
 * Reads R2 settings from the environment. Returns null when unset so callers can fall
 * back to the stored public URL — a missing secret must degrade to today's behaviour
 * rather than break playback.
 */
export function getR2Config(): R2Config | null {
  const accountId = Deno.env.get('R2_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('R2_VIDEO_ACCESS_KEY_ID');
  const secretAccessKey = Deno.env.get('R2_VIDEO_SECRET_ACCESS_KEY');
  if (!accountId || !accessKeyId || !secretAccessKey) return null;
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket: Deno.env.get('R2_VIDEO_BUCKET') ?? 'remedy-videos',
    publicBase: Deno.env.get('R2_VIDEO_PUBLIC_BASE') ?? 'https://videos.remedyrecoveries.com',
  };
}

/**
 * Maps a stored public clip URL to its R2 object key, or null when the URL does not
 * belong to the configured bucket (e.g. a legacy Supabase Storage URL, which must keep
 * being served as-is).
 */
export function objectKeyFromPublicUrl(videoUrl: string, config: R2Config): string | null {
  let parsed: URL;
  let base: URL;
  try {
    parsed = new URL(videoUrl);
    base = new URL(config.publicBase);
  } catch {
    return null;
  }
  if (parsed.host !== base.host) return null;
  const key = parsed.pathname.replace(/^\/+/, '');
  return key.length > 0 ? decodeURIComponent(key) : null;
}

/**
 * Builds the S3 API origin from R2_ACCOUNT_ID.
 *
 * Tolerates a bare account id ("abc123") as well as the full endpoint Cloudflare's R2
 * dashboard displays ("https://abc123.r2.cloudflarestorage.com"), because pasting the
 * latter is the obvious thing to do — and blindly appending the domain to it produced
 * `https://https://abc123.r2.cloudflarestorage.com.r2.cloudflarestorage.com/...`, which
 * fails DNS rather than erroring usefully.
 */
export function s3Origin(accountId: string): string {
  const host = accountId
    .trim()
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    .replace(/\.$/, '');
  return host.toLowerCase().endsWith('.r2.cloudflarestorage.com')
    ? `https://${host}`
    : `https://${host}.r2.cloudflarestorage.com`;
}

function getClient(config: R2Config): AwsClient {
  if (!client) {
    client = new AwsClient({
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      service: 's3',
      region: 'auto',
    });
  }
  return client;
}

/**
 * Signs a time-limited GET for one object. Throws only if aws4fetch cannot sign; callers
 * treat a throw as "fall back to the public URL".
 */
export async function presignGet(
  key: string,
  config: R2Config,
  ttlSeconds = DEFAULT_TTL_SECONDS,
): Promise<string> {
  const endpoint = `${s3Origin(config.accountId)}/${config.bucket}/${key
    .split('/')
    .map(encodeURIComponent)
    .join('/')}?X-Amz-Expires=${ttlSeconds}`;
  const signed = await getClient(config).sign(endpoint, {
    method: 'GET',
    aws: { signQuery: true },
  });
  return signed.url;
}
