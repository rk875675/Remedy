// Email deep-link bridge for confirmation / password-reset links.
//
// Why this exists (rule 5):
//  - Gmail and other clients strip raw custom-scheme (remedy://) links, so the email
//    template must point at an HTTPS URL. This function is that URL; it 302-redirects to
//    the app scheme.
//  - We return a 302 with NO body. Serving an HTML "open the app" page from the
//    *.supabase.co/functions/v1 domain doesn't work — that domain rewrites text/html GET
//    responses to text/plain (anti-phishing), so the page would render as source. A
//    bodyless 302 sidesteps that and just opens the app.
//  - The credential rides in the QUERY STRING (not the URL #fragment) — fragments are
//    dropped across the iOS custom-scheme handoff.
//  - We do NOT call verifyOtp here, so email link prefetchers (which follow the link)
//    can't burn the token. The token is consumed only when the app calls verifyOtp.

Deno.serve((req: Request) => {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const redirectTo = url.searchParams.get('redirect_to') || 'remedy://auth-callback';

  if (!tokenHash || !type) {
    return new Response(null, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(redirectTo);
  } catch {
    return new Response(null, { status: 400 });
  }

  target.searchParams.set('token_hash', tokenHash);
  target.searchParams.set('type', type);

  return new Response(null, {
    status: 302,
    headers: { Location: target.toString() },
  });
});
