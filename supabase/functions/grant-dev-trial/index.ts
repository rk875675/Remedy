import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'missing_auth' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'invalid_auth' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_dev')
      .eq('id', user.id)
      .single();

    if (!profile?.is_dev) {
      return new Response(
        JSON.stringify({ success: false, error: 'not_dev_user' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const idempotencyKey = `dev_trial_${user.id}`;

    const { error: upsertError } = await supabaseAdmin
      .from('entitlements')
      .upsert(
        {
          user_id: user.id,
          is_premium: true,
          subscription_status: 'dev_trial',
          expires_at: expiresAt.toISOString(),
          updated_at: now.toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (upsertError) {
      return new Response(
        JSON.stringify({ success: false, error: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    await supabaseAdmin.from('billing_events').upsert(
      {
        user_id: user.id,
        event_type: 'trial_started',
        idempotency_key: idempotencyKey,
        metadata: { type: 'dev_trial', granted_at: now.toISOString() },
      },
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    );

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'internal_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
