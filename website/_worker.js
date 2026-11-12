const HOST_HOME = {
  "marketing.remedyrecoveries.com": "/marketing",
  "promo.remedyrecoveries.com": "/promo-admin",
};

const SESSION_COOKIE = "marketing_session";
const SESSION_TTL_SECONDS = 180 * 24 * 60 * 60;
const textEncoder = new TextEncoder();

function isMarketingPage(url) {
  if (url.pathname === "/api/marketing-state") return false;
  if (url.hostname === "marketing.remedyrecoveries.com") return true;
  return url.pathname === "/marketing" || url.pathname === "/marketing.html";
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

function looksLikeState(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && value.days && typeof value.days === "object");
}

const FOLLOWER_DM_KEYS = ["followers", "saves", "viewed", "likes"];

function normalizeFollowerDms(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  let any = false;
  for (const key of FOLLOWER_DM_KEYS) {
    if (typeof value[key] !== "string") continue;
    out[key] = value[key].slice(0, 2000);
    any = true;
  }
  return any ? out : null;
}

const CREATOR_LIST_KEYS = [
  "opinion-medium",
  "opinion-large",
  "opinion-huge",
  "cofounder-medium",
  "cofounder-large",
  "cofounder-huge",
  "ugc",
];

function creatorHandle(row) {
  if (!row || typeof row !== "object") return "";
  return String(row.handle || "").replace(/^@/, "").trim().toLowerCase();
}

function unionRemoved(current, incoming) {
  const out = {};
  for (const key of CREATOR_LIST_KEYS) {
    const bag = {
      ...(current?.removedCreators?.[key] && typeof current.removedCreators[key] === "object" ? current.removedCreators[key] : {}),
      ...(incoming?.removedCreators?.[key] && typeof incoming.removedCreators[key] === "object" ? incoming.removedCreators[key] : {}),
    };
    const clean = {};
    for (const handle of Object.keys(bag)) {
      const normalized = handle.replace(/^@/, "").trim().toLowerCase();
      if (/^[a-z0-9._]{1,30}$/.test(normalized)) clean[normalized] = String(bag[handle] || "");
    }
    out[key] = clean;
  }
  return out;
}

function unionTpls(current, incoming) {
  const cur = Array.isArray(current) ? current : [];
  const inc = Array.isArray(incoming) ? incoming : [];
  const byId = new Map();
  for (const row of cur) {
    if (!row || typeof row !== "object" || !row.id) continue;
    const id = String(row.id);
    byId.set(id, { ...row, id });
  }
  for (const row of inc) {
    if (!row || typeof row !== "object" || !row.id) continue;
    const id = String(row.id);
    const prev = byId.get(id);
    const next = { ...row, id };
    if (!prev) {
      byId.set(id, next);
      continue;
    }
    const prevAt = Date.parse(prev.updatedAt || "") || 0;
    const nextAt = Date.parse(next.updatedAt || "") || 0;
    if (nextAt > prevAt) byId.set(id, next);
  }
  const seen = new Set();
  const out = [];
  for (const row of [...cur, ...inc]) {
    if (!row || !row.id || seen.has(String(row.id))) continue;
    seen.add(String(row.id));
    const picked = byId.get(String(row.id));
    if (picked) out.push(picked);
  }
  return out;
}

function unionCreatorLists(current, incoming, removed) {
  const out = {};
  for (const key of CREATOR_LIST_KEYS) {
    const gone = removed?.[key] || {};
    const seen = new Set();
    const list = [];
    for (const source of [current?.[key], incoming?.[key]]) {
      if (!Array.isArray(source)) continue;
      for (const row of source) {
        const handle = creatorHandle(row);
        if (!/^[a-z0-9._]{1,30}$/.test(handle) || seen.has(handle)) continue;
        const removedAt = Date.parse(gone[handle] || "") || 0;
        const added = Date.parse(row.addedAt || "") || 0;
        if (gone[handle] && !(added && removedAt && added > removedAt)) continue;
        if (gone[handle]) delete gone[handle];
        seen.add(handle);
        list.push({ ...row, handle });
      }
    }
    out[key] = list;
  }
  return out;
}

async function requireMarketing(request, env) {
  const password = (env.MARKETING_PASSWORD ?? "").trim();
  if (!password) return { ok: false, response: json({ ok: false, error: "not_configured" }, 503) };
  const ok = await verifySession(readCookie(request, SESSION_COOKIE), password);
  if (!ok) return { ok: false, response: json({ ok: false, error: "auth_required" }, 401) };
  return { ok: true, password };
}

async function handleMarketingState(request, env) {
  const auth = await requireMarketing(request, env);
  if (!auth.ok) return auth.response;
  if (!env.MARKETING_KV) return json({ ok: false, error: "not_configured" }, 503);

  if (request.method === "GET") {
    const raw = await env.MARKETING_KV.get("state");
    if (!raw) return json({ ok: true, empty: true });
    try {
      const data = JSON.parse(raw);
      if (!looksLikeState(data)) return json({ ok: true, empty: true });
      return json({ ok: true, empty: false, state: data });
    } catch {
      return json({ ok: true, empty: true });
    }
  }

  if (request.method === "PUT") {
    const text = await request.text();
    if (text.length > 200000) return json({ ok: false, error: "too_large" }, 413);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return json({ ok: false, error: "invalid" }, 400);
    }
    if (!looksLikeState(data)) return json({ ok: false, error: "invalid" }, 400);
    const existingRaw = await env.MARKETING_KV.get("state");
    let existing = null;
    try {
      existing = existingRaw ? JSON.parse(existingRaw) : null;
    } catch {
      existing = null;
    }
    const base = typeof data.baseUpdatedAt === "string" ? data.baseUpdatedAt : "";
    if (existing && looksLikeState(existing) && base !== (existing.updatedAt || "")) {
      data.removedCreators = unionRemoved(existing, data);
      data.creators = unionCreatorLists(existing.creators, data.creators, data.removedCreators);
      data.opinion = unionTpls(existing.opinion, data.opinion);
      data.cofounder = unionTpls(existing.cofounder, data.cofounder);
      data.ugc = unionTpls(existing.ugc, data.ugc);
    }
    const incomingDms = normalizeFollowerDms(data.followerDms);
    const existingDms = normalizeFollowerDms(existing?.followerDms);
    if (incomingDms) data.followerDms = { ...(existingDms || {}), ...incomingDms };
    else if (existingDms) data.followerDms = existingDms;
    else delete data.followerDms;
    delete data.baseUpdatedAt;
    data.v = 4;
    data.updatedAt = new Date().toISOString();
    await env.MARKETING_KV.put("state", JSON.stringify(data));
    return json({
      ok: true,
      updatedAt: data.updatedAt,
      creators: data.creators || {},
      removedCreators: data.removedCreators || {},
    });
  }

  return json({ ok: false, error: "method" }, 405);
}

function b64urlEncode(bytes) {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s) {
  try {
    const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacSha256(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload)));
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function safeEqual(a, b) {
  const [da, db] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(a)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(b)),
  ]);
  return bytesEqual(new Uint8Array(da), new Uint8Array(db));
}

async function signSession(secret) {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sig = await hmacSha256(secret, `ok|${exp}`);
  return `ok.${exp}.${b64urlEncode(sig)}`;
}

async function verifySession(token, secret) {
  const [mark, expStr, sigB64] = token.split(".");
  if (mark !== "ok" || !expStr || !sigB64) return false;
  const sig = b64urlDecode(sigB64);
  if (!sig) return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = await hmacSha256(secret, `ok|${exp}`);
  return bytesEqual(expected, sig);
}

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") ?? "";
  for (const part of raw.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return "";
}

function sessionCookieHeader(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function loginPage(error, action) {
  const dest = escapeAttr(action || "/");
  const err = error
    ? `<p style="color:#a94433;font-size:13px;margin:10px 0 0">${error}</p>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Remedy — Marketing</title>
<style>
  body { margin:0; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; background:#f6f5f1; color:#1d221f; }
  .wrap { max-width:420px; margin:12vh auto; padding:0 20px; }
  h1 { font-family:Georgia,serif; font-size:26px; margin:0 0 6px; }
  .sub { color:#6b7570; font-size:14px; margin:0 0 22px; }
  .card { background:#fff; border:1px solid #e3e1da; border-radius:12px; padding:20px; }
  label { display:block; font-size:12px; color:#6b7570; margin:0 0 6px; }
  input { width:100%; box-sizing:border-box; padding:9px 10px; border:1px solid #e3e1da; border-radius:8px; font-size:14px; }
  button { margin-top:14px; padding:10px 18px; background:#3E6B4E; color:#fff; border:0; border-radius:8px; font-size:14px; cursor:pointer; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Marketing OS</h1>
  <p class="sub">Internal. Not the public site.</p>
  <form class="card" method="post" action="${dest}">
    <label for="pw">Password</label>
    <input id="pw" name="password" type="password" autocomplete="current-password" autofocus>
    <button type="submit">Log in</button>
    ${err}
  </form>
</div>
</body>
</html>`;
}

function html(body, status, headers) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
      ...headers,
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === "remedy-web-434.pages.dev") {
      url.hostname = "remedyrecoveries.com";
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    const home = HOST_HOME[url.hostname];
    if (home && (url.pathname === "/" || url.pathname === "")) {
      url.pathname = home;
    }

    if (url.pathname === "/api/marketing-state") {
      return handleMarketingState(request, env);
    }

    if (isMarketingPage(url)) {
      const password = (env.MARKETING_PASSWORD ?? "").trim();
      const returnTo = url.pathname + url.search;
      if (!password) {
        return html(loginPage("Gate is not configured.", returnTo), 503);
      }

      if (url.searchParams.get("logout") === "1") {
        url.searchParams.delete("logout");
        return new Response(null, {
          status: 302,
          headers: {
            Location: url.pathname,
            "Set-Cookie": sessionCookieHeader("", 0),
            "Cache-Control": "no-store",
          },
        });
      }

      if (request.method === "POST") {
        const form = await request.formData();
        if (form.has("password")) {
          const guess = String(form.get("password") ?? "");
          if (!guess || !(await safeEqual(guess, password))) {
            return html(loginPage("Wrong password.", returnTo), 401);
          }
          const token = await signSession(password);
          return new Response(null, {
            status: 303,
            headers: {
              Location: returnTo || url.pathname,
              "Set-Cookie": sessionCookieHeader(token, SESSION_TTL_SECONDS),
              "Cache-Control": "no-store",
            },
          });
        }
        const shared = [form.get("title"), form.get("text"), form.get("url")]
          .filter(Boolean)
          .map((part) => String(part))
          .join("\n")
          .slice(0, 2000);
        if (shared) url.searchParams.set("add", shared);
      }

      const ok = await verifySession(readCookie(request, SESSION_COOKIE), password);
      if (!ok) return html(loginPage("", url.pathname + url.search), 401);
      if (request.method === "POST") {
        return new Response(null, {
          status: 303,
          headers: {
            Location: url.pathname + url.search,
            "Cache-Control": "no-store",
          },
        });
      }
    }

    return env.ASSETS.fetch(new Request(url.toString(), request));
  },
};
