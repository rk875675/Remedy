export default {
  async fetch(request) {
    const url = new URL(request.url);
    url.hostname = "remedyrecoveries.com";
    url.protocol = "https:";
    if (url.pathname.endsWith(".html")) {
      url.pathname = url.pathname.slice(0, -5);
    }
    if (url.pathname === "/index" || url.pathname === "") {
      url.pathname = "/";
    }
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return Response.redirect(url.toString(), 301);
  },
};
