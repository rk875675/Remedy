import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse } from "./response.ts";

const ACCESS_VALID_STATUSES = ["trial", "active"];

export type EntitlementResult =
  | { ok: true }
  | { ok: false; response: Response };

export async function requireEntitlement(
  supabase: SupabaseClient,
  userId: string,
  requestId: string,
): Promise<EntitlementResult> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_dev")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.is_dev === true) {
    return { ok: true };
  }

  const { data, error } = await supabase
    .from("entitlements")
    .select("status, expires_at")
    .eq("user_id", userId)
    .single();

  const denied = (): EntitlementResult => ({
    ok: false,
    response: errorResponse(
      403,
      "ENTITLEMENT_REQUIRED",
      "Active subscription required",
      requestId,
    ),
  });

  if (error || !data || !ACCESS_VALID_STATUSES.includes(data.status)) {
    return denied();
  }

  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    await supabase
      .from("entitlements")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("user_id", userId);

    await supabase.from("entitlement_events").insert({
      user_id: userId,
      event_type: "auto_expired",
      metadata: {
        previous_status: data.status,
        expires_at: data.expires_at,
      },
    });

    return denied();
  }

  return { ok: true };
}
