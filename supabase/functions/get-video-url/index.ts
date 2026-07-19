import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { checkRateLimit, extractUserIdFromJwt } from '../_shared/ratelimit.ts';

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

    // Rate limiting: 60 requests per 60 seconds per user
    const jwtUserId = extractUserIdFromJwt(authHeader);
    if (jwtUserId) {
      const redisUrl = Deno.env.get('UPSTASH_REDIS_REST_URL');
      const redisToken = Deno.env.get('UPSTASH_REDIS_REST_TOKEN');
      if (redisUrl && redisToken) {
        const rl = await checkRateLimit(
          redisUrl,
          redisToken,
          `ratelimit:get-video-url:${jwtUserId}`,
          60,
          60,
        );
        if (!rl.allowed) {
          return new Response(
            JSON.stringify({ error: 'rate_limited', retryAfter: rl.retryAfter }),
            {
              status: 429,
              headers: {
                ...corsHeaders,
                'Content-Type': 'application/json',
                'Retry-After': String(rl.retryAfter),
              },
            },
          );
        }
      }
    }

    const { exerciseId } = await req.json();
    if (!exerciseId) {
      return new Response(
        JSON.stringify({ error: 'missing_exercise_id' }),
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

    const [{ data: ent }, { data: prof }] = await Promise.all([
      supabase
        .from('entitlements')
        .select('is_premium, subscription_status, expires_at')
        .eq('user_id', user.id)
        .maybeSingle(),
      supabase.from('profiles').select('is_dev').eq('id', user.id).maybeSingle(),
    ]);

    const notExpired = !ent?.expires_at || new Date(ent.expires_at).getTime() > Date.now();
    const entitled =
      !!ent &&
      ent.is_premium === true &&
      notExpired &&
      ['active', 'trial', 'dev_trial'].includes(ent.subscription_status);
    const isDev = prof?.is_dev === true;

    if (!entitled && !isDev) {
      return new Response(
        JSON.stringify({ error: 'not_entitled' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: exercise, error: dbError } = await supabase
      .from('exercises')
      .select('cloudflare_stream_id')
      .eq('id', exerciseId)
      .single();

    if (dbError || !exercise?.cloudflare_stream_id) {
      return new Response(
        JSON.stringify({ error: 'no_video' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = Deno.env.get('CLOUDFLARE_STREAM_API_TOKEN');

    if (!accountId || !apiToken) {
      return new Response(
        JSON.stringify({ error: 'cloudflare_not_configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Request a signed token from Cloudflare Stream
    const cfResponse = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${exercise.cloudflare_stream_id}/token`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          exp: Math.floor(Date.now() / 1000) + SIGNED_URL_TTL,
        }),
      },
    );

    const cfData = await cfResponse.json();

    if (!cfData.success || !cfData.result?.token) {
      return new Response(
        JSON.stringify({ error: 'cloudflare_error' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const hlsUrl = `https://customer-${accountId}.cloudflarestream.com/${cfData.result.token}/manifest/video.m3u8`;

    return new Response(
      JSON.stringify({ url: hlsUrl }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
