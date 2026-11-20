import type { Context } from "hono";
import { Hono } from "hono";
import { env } from "../config.js";
import { objectSize, openObject } from "../publish/r2.js";
import { emailFromHeaders, resolveIdentity } from "../ugc/role.js";
import {
  AddEditorClipSchema,
  CompleteEditorJobSchema,
  CreateEditorJobSchema,
  DropEditorCutSchema,
  EDITOR_PART_BYTES,
  FixEditorCutSchema,
  PatchEditorClipSchema,
  PatchEditorJobSchema,
  ReorderEditorClipsSchema,
} from "./schema.js";
import {
  EditorError,
  addEditorClip,
  approveEditorCut,
  completeEditorClip,
  createEditorJob,
  createEditorProject,
  deleteEditorClip,
  deleteEditorJob,
  dropEditorCut,
  editorFileTarget,
  getEditorJob,
  listEditorJobs,
  storedEditorJob,
  parseJobId,
  patchEditorClip,
  patchEditorJob,
  reorderEditorClips,
  requestEditorFix,
  saveEditorPart,
} from "./store.js";

function operatorDenied(c: Context): Response | null {
  const me = resolveIdentity(emailFromHeaders(c.req.raw.headers), env.UGC_OPERATOR_EMAILS, env.UGC_CREATORS);
  if (me.role === "operator") return null;
  return c.json({ ok: false, error: "This action is for the studio operator." }, 403);
}

function fail(c: Context, err: unknown): Response {
  if (err instanceof EditorError) return c.json({ ok: false, error: err.message }, err.status);
  const message = err instanceof Error ? err.message : "Editor request failed.";
  return c.json({ ok: false, error: message.slice(0, 180) }, 500);
}

function idOf(c: Context, name: string): string | null {
  return parseJobId(c.req.param(name) ?? "");
}

export function registerEditorRoutes(app: Hono): void {
  app.get("/api/editor/jobs", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    try {
      return c.json({ ok: true, jobs: await listEditorJobs() });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.post("/api/editor/jobs", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const body = CreateEditorJobSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, error: "Send a video name, or a file name and size." }, 400);
    try {
      if ("fileName" in body.data) {
        const created = await createEditorJob(body.data);
        return c.json({ ok: true, job: created.job, clipId: created.clipId, partBytes: created.partBytes });
      }
      return c.json({ ok: true, job: await createEditorProject(body.data.title) });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.get("/api/editor/jobs/:id", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    if (!id) return c.json({ ok: false, error: "Unknown video." }, 404);
    try {
      return c.json({ ok: true, job: await getEditorJob(id) });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.patch("/api/editor/jobs/:id", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    if (!id) return c.json({ ok: false, error: "Unknown video." }, 404);
    const body = PatchEditorJobSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, error: "The name, notes, or reference link is invalid." }, 400);
    try {
      return c.json({
        ok: true,
        job: await patchEditorJob(
          id,
          body.data.title,
          body.data.notes,
          body.data.referenceUrl,
          body.data.postTitle,
          body.data.postCaption,
          body.data.postHashtags,
        ),
      });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.post("/api/editor/jobs/:id/cut/drop", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    if (!id) return c.json({ ok: false, error: "Unknown video." }, 404);
    const body = DropEditorCutSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, error: "That cut was not found." }, 400);
    try {
      return c.json({ ok: true, job: await dropEditorCut(id, body.data.clipId, body.data.startSec) });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.post("/api/editor/jobs/:id/cut/fix", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    if (!id) return c.json({ ok: false, error: "Unknown video." }, 404);
    const body = FixEditorCutSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, error: "Say what to fix." }, 400);
    try {
      return c.json({ ok: true, job: await requestEditorFix(id, body.data.note) });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.post("/api/editor/jobs/:id/cut/approve", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    if (!id) return c.json({ ok: false, error: "Unknown video." }, 404);
    try {
      return c.json({ ok: true, job: await approveEditorCut(id) });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.delete("/api/editor/jobs/:id", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    if (!id) return c.json({ ok: false, error: "Unknown video." }, 404);
    try {
      await deleteEditorJob(id);
      return c.json({ ok: true });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.post("/api/editor/jobs/:id/clips", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    if (!id) return c.json({ ok: false, error: "Unknown video." }, 404);
    const body = AddEditorClipSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, error: "Send a file name and size." }, 400);
    try {
      const created = await addEditorClip(id, body.data);
      return c.json({ ok: true, job: created.job, clipId: created.clipId, partBytes: created.partBytes });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.patch("/api/editor/jobs/:id/clips/:clipId", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    const clipId = idOf(c, "clipId");
    if (!id || !clipId) return c.json({ ok: false, error: "Unknown clip." }, 404);
    const body = PatchEditorClipSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, error: "Give the clip a name." }, 400);
    try {
      return c.json({ ok: true, job: await patchEditorClip(id, clipId, body.data.name, body.data.kind) });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.delete("/api/editor/jobs/:id/clips/:clipId", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    const clipId = idOf(c, "clipId");
    if (!id || !clipId) return c.json({ ok: false, error: "Unknown clip." }, 404);
    try {
      return c.json({ ok: true, job: await deleteEditorClip(id, clipId) });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.post("/api/editor/jobs/:id/reorder", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    if (!id) return c.json({ ok: false, error: "Unknown video." }, 404);
    const body = ReorderEditorClipsSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, error: "The clip order is invalid." }, 400);
    try {
      return c.json({ ok: true, job: await reorderEditorClips(id, body.data.clipIds) });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.put("/api/editor/jobs/:id/clips/:clipId/parts/:part", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    const clipId = idOf(c, "clipId");
    const partNumber = Number(c.req.param("part"));
    if (!id || !clipId || !Number.isInteger(partNumber)) return c.json({ ok: false, error: "Unknown part." }, 404);
    const declared = Number(c.req.header("content-length"));
    if (!Number.isInteger(declared) || declared <= 0 || declared > EDITOR_PART_BYTES) {
      return c.json({ ok: false, error: "This part is the wrong size." }, 400);
    }
    const body = new Uint8Array(await c.req.arrayBuffer());
    try {
      const saved = await saveEditorPart(id, clipId, partNumber, body);
      return c.json({ ok: true, partNumber, etag: saved.etag });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.post("/api/editor/jobs/:id/clips/:clipId/complete", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    const clipId = idOf(c, "clipId");
    if (!id || !clipId) return c.json({ ok: false, error: "Unknown clip." }, 404);
    const body = CompleteEditorJobSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ ok: false, error: "The part list is invalid." }, 400);
    try {
      return c.json({ ok: true, job: await completeEditorClip(id, clipId, body.data.parts) });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.on(["GET", "HEAD"], "/api/editor/jobs/:id/cut/file", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    if (!id) return c.json({ ok: false, error: "Unknown video." }, 404);
    try {
      const job = await storedEditorJob(id);
      const key = job?.cut?.previewKey;
      if (!key) return c.json({ ok: false, error: "The compiled video is not ready." }, 404);
      if (c.req.method === "HEAD") {
        const size = await objectSize(key);
        if (size == null) return c.json({ ok: false, error: "File missing." }, 404);
        return new Response(null, { status: 200, headers: fileHeaders("video/mp4", size, null) });
      }
      const range = c.req.header("range") ?? null;
      if (range && !/^bytes=\d*-\d*$/.test(range)) return c.json({ ok: false, error: "Bad range." }, 416);
      const opened = await openObject(key, range);
      if (!opened || (opened.status !== 200 && opened.status !== 206)) {
        return c.json({ ok: false, error: "Could not read the compiled video." }, 502);
      }
      return new Response(opened.body, {
        status: opened.status,
        headers: fileHeaders("video/mp4", opened.headers.get("content-length"), opened.headers.get("content-range")),
      });
    } catch (err) {
      return fail(c, err);
    }
  });

  app.on(["GET", "HEAD"], "/api/editor/jobs/:id/clips/:clipId/file", async (c) => {
    const denied = operatorDenied(c);
    if (denied) return denied;
    const id = idOf(c, "id");
    const clipId = idOf(c, "clipId");
    if (!id || !clipId) return c.json({ ok: false, error: "Unknown clip." }, 404);
    try {
      const full = await editorFileTarget(id, clipId);
      if (!full) return c.json({ ok: false, error: "That clip is not ready." }, 404);
      if (c.req.method === "HEAD") {
        const size = await objectSize(full.key);
        if (size == null) return c.json({ ok: false, error: "File missing." }, 404);
        return new Response(null, { status: 200, headers: fileHeaders(full.mimeType, size, null) });
      }
      const range = c.req.header("range") ?? null;
      if (range && !/^bytes=\d*-\d*$/.test(range)) {
        return c.json({ ok: false, error: "Bad range." }, 416);
      }
      const opened = await openObject(full.key, range);
      if (!opened) return c.json({ ok: false, error: "File missing." }, 404);
      if (opened.status !== 200 && opened.status !== 206) {
        return c.json({ ok: false, error: "Could not read the original." }, 502);
      }
      return new Response(opened.body, {
        status: opened.status,
        headers: fileHeaders(full.mimeType, opened.headers.get("content-length"), opened.headers.get("content-range")),
      });
    } catch (err) {
      return fail(c, err);
    }
  });
}

function fileHeaders(mimeType: string, length: string | number | null, contentRange: string | null): Headers {
  const headers = new Headers();
  headers.set("Content-Type", mimeType);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", "inline");
  if (length != null) headers.set("Content-Length", String(length));
  if (contentRange) headers.set("Content-Range", contentRange);
  return headers;
}
