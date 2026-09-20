export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "remedy-web-434.pages.dev") {
      url.hostname = "remedyrecoveries.com";
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    return env.ASSETS.fetch(request);
  },
};
