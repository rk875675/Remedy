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
//  - The redirect target is HARDCODED to the app scheme. We deliberately ignore any
//    client-supplied `redirect_to` query param: reflecting it into the Location header
//    was an open redirect that let an attacker steal the one-time recovery/confirm token
//    (account takeover) by appending their own host to a legitimate link.

const APP_CALLBACK = 'remedy://auth-callback';

Deno.serve((req: Request) => {
  const url = new URL(req.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');

  if (!tokenHash || !type) {
    return new Response(null, { status: 400 });
  }

  const target = new URL(APP_CALLBACK);
  target.searchParams.set('token_hash', tokenHash);
  target.searchParams.set('type', type);

  return new Response(null, {
    status: 302,
    headers: { Location: target.toString() },
  });
});
