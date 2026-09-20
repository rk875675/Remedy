import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit } from '../_shared/ratelimit.ts';
import { generateRequestId } from '../_shared/response.ts';
import { getR2Config, objectKeyFromPublicUrl, presignGet } from '../_shared/r2.ts';

// Cloudflare Stream signed URL generation
// Requires CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN set via `supabase secrets set`

const SIGNED_URL_TTL = 3600; // 1 hour

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'missing_auth' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // `exerciseIds` resolves a whole session in one call. Without it, routing playback
    // through this function would turn each session load into one round trip per
    // exercise (~7), each repeating auth + entitlement + presign.
    const body = (await req.json()) as { exerciseId?: unknown; exerciseIds?: unknown };
    const batch = Array.isArray(body.exerciseIds)
      ? body.exerciseIds.filter((v): v is string => typeof v === 'string' && v.length > 0)
      : null;
    const exerciseId = typeof body.exerciseId === 'string' ? body.exerciseId : null;

    if (!exerciseId && (!batch || batch.length === 0)) {
      return new Response(
        JSON.stringify({ error: 'missing_exercise_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    // Bounded so one request cannot fan out into an unbounded number of signatures.
    if (batch && batch.length > 30) {
      return new Response(
        JSON.stringify({ error: 'too_many_exercise_ids' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // --- Entitlement gate -----------------------------------------------------
    // Signed Cloudflare HLS URLs are premium content. Derive a trusted identity from the
    // verified token (not the unverified rate-limit decode) and require an active
    // entitlement or a dev profile before minting a stream token.
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'invalid_auth' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Rate limited on the VERIFIED user id, after auth. The previous version keyed on an
    // unverified JWT decode via extractUserIdFromJwt(), an export that no longer exists
    // in _shared/ratelimit.ts — that stale import was a module-level resolution failure,
    // which is why every call to this function returned 503 BOOT_ERROR.
    const rl = await checkRateLimit(user.id, generateRequestId(), 'authenticated-read');
    if (!rl.ok) return rl.response;

    const [{ data: ent }, { data: prof }] = await Promise.all([
      supabase
        .from('entitlements')
        .select('is_premium, subscription_status, expires_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('profiles').select('is_dev').eq('id', user.id).maybeSingle(),
    ]);

    const notExpired = !ent?.expires_at || new Date(ent.expires_at).getTime() > Date.now();
    // `cancelled` = auto-renew off, period still paid — same access as active until expires_at.
    const entitled =
      !!ent &&
      ent.is_premium === true &&
      notExpired &&
      ['active', 'trial', 'dev_trial', 'cancelled'].includes(ent.subscription_status);
    const isDev = prof?.is_dev === true;

    if (!entitled && !isDev) {
      return new Response(
        JSON.stringify({ error: 'not_entitled' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const wanted = batch ?? [exerciseId!];
    const { data: rows, error: dbError } = await supabase
      .from('exercises')
      .select('id, cloudflare_stream_id, video_url')
      .in('id', wanted);

    if (dbError) {
      return new Response(
        JSON.stringify({ error: 'no_video' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');
    const r2 = getR2Config();

    type Row = { id: string; cloudflare_stream_id: string | null; video_url: string | null };

    /**
     * Resolution order per exercise:
     *   1. Cloudflare Stream signed HLS, when the clip lives in Stream and Stream is
     *      configured.
     *   2. R2 presigned GET, when the stored URL points at the clip bucket and R2
     *      secrets are set. This is the live path.
     *   3. The stored URL as-is. Only reached when R2 secrets are missing, so a
     *      configuration gap degrades to the previous behaviour instead of blacking out
     *      every video mid-session.
     */
    async function resolve(row: Row): Promise<string | null> {
      if (row.cloudflare_stream_id && accountId && apiToken) {
        try {
          const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${row.cloudflare_stream_id}/token`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL }),
            },
          );
          const cfData = await cfResponse.json();
          if (cfData.success && cfData.result?.token) {
            return `https://customer-${accountId}.cloudflarestream.com/${cfData.result.token}/manifest/video.m3u8`;
          }
        } catch {
          // Fall through to the R2 / stored URL paths.
        }
      }

      if (!row.video_url) return null;

      if (r2) {
        const key = objectKeyFromPublicUrl(row.video_url, r2);
        if (key) {
          try {
            return await presignGet(key, r2, SIGNED_URL_TTL);
          } catch {
            // Signing failure must not black out the video.
          }
        }
      }

      return row.video_url;
    }

    const resolved = await Promise.all(
      ((rows ?? []) as Row[]).map(async (row) => [row.id, await resolve(row)] as const),
    );

    if (batch) {
      const urls: Record<string, string> = {};
      for (const [id, url] of resolved) {
        if (url) urls[id] = url;
      }
      return new Response(
        JSON.stringify({ urls, expires_in: SIGNED_URL_TTL }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const url = resolved.find(([id]) => id === exerciseId)?.[1] ?? null;
    if (!url) {
      return new Response(
        JSON.stringify({ error: 'no_video' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ url, expires_in: SIGNED_URL_TTL }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
