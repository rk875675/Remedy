// Email deep-link bridge — second-generation router.
//
// Routes Supabase auth tokens to the correct in-app screen via a bodyless 302.
//
// Why this exists (all pitfalls documented at the call site):
//  - Gmail strips raw custom-scheme (remedy://) links, so the email template must
//    point at HTTPS. This function is that URL; it 302-redirects to the app scheme.
//  - Returns 302 with NO body. Supabase rewrites text/html GET responses on
//    *.supabase.co/functions/v1 to text/plain (anti-phishing). A bodyless 302 is not
//    rewritten — the browser follows the Location header and iOS opens the app.
//  - All params go in the QUERY STRING, not #fragment. Fragments are silently dropped
//    across the iOS custom-scheme handoff.
//  - We do NOT call verifyOtp here: email link prefetchers follow the HTTPS link but
//    the token is only consumed when the app calls verifyOtp.
//  - The redirect target is computed from APP_URL_SCHEME and the type param — we never
//    reflect a client-supplied redirect_to (open-redirect / token-theft vector).

const CONFIRM_TYPES = new Set(["signup", "email", "email_change", "magiclink", "invite"]);

Deno.serve((req: Request) => {
  const scheme = Deno.env.get("APP_URL_SCHEME") ?? "remedy";
  const url = new URL(req.url);

  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") ?? "";
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");
  const errorCode = url.searchParams.get("error_code");

  const isConfirmType = CONFIRM_TYPES.has(type);
  const path = isConfirmType ? "auth-confirm" : "password-recovery";
  const normalizedType = isConfirmType ? (type || "signup") : "recovery";

  // Build target URL with all params in the query string (never the fragment).
  const deepLink = new URL(`${scheme}://${path}`);
  if (tokenHash) deepLink.searchParams.set("token_hash", tokenHash);
  deepLink.searchParams.set("type", normalizedType);
  if (code) deepLink.searchParams.set("code", code);
  if (error) deepLink.searchParams.set("error", error);
  if (errorDescription) deepLink.searchParams.set("error_description", errorDescription);
  if (errorCode) deepLink.searchParams.set("error_code", errorCode);

  return new Response(null, {
    status: 302,
    headers: {
      location: deepLink.toString(),
      "cache-control": "no-store",
    },
  });
});
