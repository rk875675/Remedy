import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function createServiceClient() {
  // Prefer the new secret key (set as the SB_SECRET_KEY function secret —
  // an sb_secret_... value). Fall back to the legacy auto-injected
  // service_role only during the migration window; once the legacy HS256
  // key is revoked the fallback stops working but SB_SECRET_KEY keeps it live.
  const key = Deno.env.get("SB_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(Deno.env.get("SUPABASE_URL")!, key);
}
