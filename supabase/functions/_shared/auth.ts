import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { errorResponse } from "./response.ts";

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: Response };

export async function getUser(
  req: Request,
  supabase: SupabaseClient,
  requestId: string,
): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return {
      ok: false,
      response: errorResponse(
        401,
        "UNAUTHENTICATED",
        "Missing or invalid authorization header",
        requestId,
      ),
    };
  }

  const token = authHeader.slice(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return {
      ok: false,
      response: errorResponse(
        401,
        "UNAUTHENTICATED",
        "Invalid or expired token",
        requestId,
      ),
    };
  }

  return { ok: true, userId: user.id };
}
