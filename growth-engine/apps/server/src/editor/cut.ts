import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { generateEditorCutJson } from "../generation/llm.js";
import { deleteObject, downloadBuffer, uploadBuffer } from "../publish/r2.js";
import { editorPreviewKey, type EditorClip, type EditorCut, type EditorJob } from "./schema.js";
import { listEditorJobs, storeEditorJob, storedEditorJob } from "./store.js";

let running = false;

const PlanSchema = z
  .object({
    talking: z.array(z.string().uuid()).max(6),
    screen: z.array(z.string().uuid()).max(8),
    voice: z.string().uuid().nullable(),
    summary: z.string().max(500),
  })
  .strict();

interface Probe {
  duration: number;
  hasVideo: boolean;
  hasAudio: boolean;
}

interface Plan {
  talking: EditorClip[];
  screen: EditorClip[];
  voice: EditorClip | null;
  summary: string;
}

function runCmd(cmd: string, args: string[], timeoutMs: number): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${cmd} timed out`));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

async function probeFile(file: string): Promise<Probe> {
  const result = await runCmd(
    "ffprobe",
    ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file],
    60_000,
  );
  if (result.code !== 0) throw new Error(result.err.slice(0, 200) || "Could not read a clip");
  const parsed = JSON.parse(result.out) as {
    format?: { duration?: string };
    streams?: Array<{ codec_type?: string }>;
  };
  const streams = parsed.streams ?? [];
  return {
    duration: Number(parsed.format?.duration ?? 0),
    hasVideo: streams.some((stream) => stream.codec_type === "video"),
    hasAudio: streams.some((stream) => stream.codec_type === "audio"),
  };
}

function byId(job: EditorJob, ids: string[]): EditorClip[] {
  const map = new Map(job.clips.map((clip) => [clip.id, clip]));
  return ids.map((id) => map.get(id)).filter((clip): clip is EditorClip => Boolean(clip));
}

function heuristicPlan(job: EditorJob, durations: Map<string, number>): Plan {
  const screens = job.clips.filter((clip) => clip.kind === "screen" || /screen/i.test(clip.fileName));
  const rest = job.clips.filter((clip) => !screens.includes(clip));
  const sorted = [...rest].sort((a, b) => (durations.get(a.id) ?? 0) - (durations.get(b.id) ?? 0));
  const voice = sorted.length >= 2 ? sorted[0]! : rest.find((clip) => clip.kind === "voice") ?? null;
  const talking = rest.filter((clip) => clip !== voice);
  return {
    talking,
    screen: screens,
    voice,
    summary: "Talking head first, then the screen recordings with the voiceover as the sound.",
  };
}

async function choosePlan(job: EditorJob, durations: Map<string, number>): Promise<Plan> {
  const labeled = job.clips.every((clip) => clip.kind !== "other");
  if (labeled) {
    return {
      talking: job.clips.filter((clip) => clip.kind === "talking"),
      screen: job.clips.filter((clip) => clip.kind === "screen"),
      voice: job.clips.find((clip) => clip.kind === "voice") ?? null,
      summary: "Using the labels on each clip.",
    };
  }
  const model = await generateEditorCutJson(
    [
      "Assign each clip to one role for a single compiled video.",
      "talking = the person on camera, played first with their own voice.",
      "screen = app demo / screen recording. These play after the talking head, with their own audio removed.",
      "voice = the separate voiceover (often a black screen). Its sound replaces the screen-recording audio. Use null if there is no separate voiceover.",
      "Every clip id must appear in exactly one place.",
      job.cut?.fixNote ? `The last version was wrong. The user said: ${job.cut.fixNote}` : "",
      `Notes: ${job.notes}`,
      `Clips: ${JSON.stringify(
        job.clips.map((clip) => ({
          id: clip.id,
          name: clip.name,
          fileName: clip.fileName,
          kind: clip.kind,
          durationSec: Math.round((durations.get(clip.id) ?? 0) * 10) / 10,
        })),
      )}`,
      'Return JSON: {"talking":[""],"screen":[""],"voice":null,"summary":""}',
    ]
      .filter(Boolean)
      .join("\n"),
    PlanSchema,
  );
  if (!model) return heuristicPlan(job, durations);
  const used = new Set<string>([...model.talking, ...model.screen, ...(model.voice ? [model.voice] : [])]);
  const all = job.clips.every((clip) => used.has(clip.id)) && used.size === job.clips.length;
  if (!all) return heuristicPlan(job, durations);
  return {
    talking: byId(job, model.talking),
    screen: byId(job, model.screen),
    voice: model.voice ? (job.clips.find((clip) => clip.id === model.voice) ?? null) : null,
    summary: model.summary,
  };
}

function videoNorm(input: string, out: string): string {
  return `[${input}]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p[${out}]`;
}

function audioNorm(input: string, out: string): string {
  return `[${input}]aformat=sample_rates=44100:channel_layouts=stereo,aresample=async=1:first_pts=0[${out}]`;
}

async function pauseSpans(file: string): Promise<Array<{ start: number; end: number }>> {
  const result = await runCmd(
    "ffmpeg",
    ["-hide_banner", "-i", file, "-af", "silencedetect=noise=-30dB:d=0.32", "-f", "null", "-"],
    3 * 60 * 1000,
  );
  const starts = [...result.err.matchAll(/silence_start:\s*(-?\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
  const ends = [...result.err.matchAll(/silence_end:\s*(-?\d+(?:\.\d+)?)/g)].map((match) => Number(match[1]));
  const spans: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < starts.length; i++) {
    const start = (starts[i] ?? 0) + 0.06;
    const end = (ends[i] ?? start) - 0.05;
    if (end - start >= 0.18) spans.push({ start, end });
  }
  return spans;
}

function keepSpans(duration: number, pauses: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const keeps: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  for (const pause of pauses) {
    if (pause.start > cursor + 0.08) keeps.push({ start: cursor, end: pause.start });
    cursor = Math.max(cursor, pause.end);
  }
  if (duration - cursor > 0.08) keeps.push({ start: cursor, end: duration });
  return keeps.filter((span) => span.end - span.start >= 0.12);
}

/** Later screen recordings keep more of their length. The first one is cut so they all fit the voiceover. */
function screenTakes(durations: number[], voiceDur: number): number[] {
  const total = durations.reduce((sum, value) => sum + value, 0);
  if (durations.length === 0) return [];
  if (total <= voiceDur + 0.05) return [...durations];
  if (durations.length === 1) return [Math.min(durations[0] ?? 0, voiceDur)];
  const rest = durations.slice(1);
  const restSum = rest.reduce((sum, value) => sum + value, 0);
  const restBudget = Math.min(restSum, voiceDur * 0.65);
  const first = Math.min(durations[0] ?? 0, Math.max(0.8, voiceDur - restBudget));
  const takes = [first];
  let remaining = Math.max(0, voiceDur - first);
  const scale = restSum > 0 ? remaining / restSum : 0;
  for (const duration of rest) {
    const take = Math.min(duration, duration * scale);
    takes.push(take);
    remaining -= take;
  }
  return takes;
}

async function renderCut(
  dir: string,
  plan: Plan,
  files: Map<string, string>,
  durations: Map<string, number>,
): Promise<{ output: string; summary: string }> {
  const inputs: string[] = [];
  const filters: string[] = [];
  const talking = plan.talking.filter((clip) => files.has(clip.id));
  const screens = plan.screen.filter((clip) => files.has(clip.id));
  let index = 0;
  for (const clip of [...talking, ...screens, ...(plan.voice ? [plan.voice] : [])]) {
    inputs.push("-i", files.get(clip.id)!);
    index += 1;
  }
  void index;
  const notes: string[] = [];
  let piece = 0;
  const headPieces: string[] = [];
  for (let i = 0; i < talking.length; i++) {
    const clip = talking[i]!;
    const duration = durations.get(clip.id) ?? 0;
    const pauses = await pauseSpans(files.get(clip.id)!);
    const keeps = keepSpans(duration, pauses);
    const used = keeps.reduce((sum, span) => sum + (span.end - span.start), 0);
    notes.push(
      `${clip.name}: ${pauses.length} pause${pauses.length === 1 ? "" : "s"} removed, ${used.toFixed(1)}s kept of ${duration.toFixed(1)}s.`,
    );
    const ranges = keeps.length > 0 ? keeps : [{ start: 0, end: duration }];
    ranges.forEach((range) => {
      const id = piece++;
      filters.push(
        `[${i}:v]trim=start=${range.start.toFixed(3)}:end=${range.end.toFixed(3)},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p[tv${id}]`,
      );
      filters.push(
        `[${i}:a]atrim=start=${range.start.toFixed(3)}:end=${range.end.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_rates=44100:channel_layouts=stereo,aresample=async=1:first_pts=0[ta${id}]`,
      );
      headPieces.push(String(id));
    });
  }
  let headV = "";
  let headA = "";
  if (headPieces.length === 1) {
    headV = `tv${headPieces[0]}`;
    headA = `ta${headPieces[0]}`;
  } else if (headPieces.length > 1) {
    filters.push(`${headPieces.map((id) => `[tv${id}][ta${id}]`).join("")}concat=n=${headPieces.length}:v=1:a=1[hv][ha]`);
    headV = "hv";
    headA = "ha";
  }
  const screenOffset = talking.length;
  const voiceDur = plan.voice ? durations.get(plan.voice.id) ?? 0 : 0;
  const screenDurs = screens.map((clip) => durations.get(clip.id) ?? 0);
  const takes = voiceDur > 0.3 ? screenTakes(screenDurs, voiceDur) : screenDurs;
  screens.forEach((clip, i) => {
    const take = Math.max(0.4, takes[i] ?? 0);
    const full = screenDurs[i] ?? take;
    notes.push(`${clip.name}: using ${take.toFixed(1)}s of ${full.toFixed(1)}s${i === 0 && take + 0.2 < full ? " (cut so the next demo fits)" : ""}.`);
    filters.push(
      `[${screenOffset + i}:v]trim=start=0:end=${Math.min(take, full).toFixed(3)},setpts=PTS-STARTPTS,scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30,format=yuv420p[sv${i}]`,
    );
  });
  let screenLabel = "";
  if (screens.length === 1) screenLabel = "sv0";
  else if (screens.length > 1) {
    filters.push(`${screens.map((_, i) => `[sv${i}]`).join("")}concat=n=${screens.length}:v=1:a=0[sc]`);
    screenLabel = "sc";
  }
  const voiceIndex = talking.length + screens.length;
  if (plan.voice && screens.length > 0 && voiceDur > 0.3) {
    filters.push(audioNorm(`${voiceIndex}:a`, "va"));
    const planned = takes.reduce((sum, take) => sum + take, 0);
    const pad = Math.max(0, voiceDur - planned);
    const padFilter = pad > 0.05 ? `tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)},` : "";
    filters.push(`[${screenLabel}]${padFilter}trim=duration=${voiceDur.toFixed(3)},setpts=PTS-STARTPTS[sv]`);
    filters.push(`[va]atrim=duration=${voiceDur.toFixed(3)},asetpts=PTS-STARTPTS[voa]`);
    notes.push(`${plan.voice.name} is the sound under the demos (${voiceDur.toFixed(1)}s), not its own shot.`);
  }
  let mapV = "";
  let mapA = "";
  if (headV && filters.some((line) => line.includes("[sv]"))) {
    filters.push(`[${headV}][${headA}][sv][voa]concat=n=2:v=1:a=1[outv][outa]`);
    mapV = "outv";
    mapA = "outa";
  } else if (filters.some((line) => line.includes("[sv]"))) {
    mapV = "sv";
    mapA = "voa";
  } else if (headV) {
    mapV = headV;
    mapA = headA;
  } else {
    throw new Error("Nothing to compile.");
  }
  const output = path.join(dir, "cut.mp4");
  const args = [
    "-y",
    "-hide_banner",
    ...inputs,
    "-filter_complex",
    filters.join(";"),
    "-map",
    `[${mapV}]`,
    "-map",
    `[${mapA}]`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "160k",
    "-movflags",
    "+faststart",
    output,
  ];
  const rendered = await runCmd("ffmpeg", args, 20 * 60 * 1000);
  if (rendered.code !== 0) throw new Error(rendered.err.slice(-400) || "Could not compile the video");
  return { output, summary: notes.join(" ") };
}

async function cutJob(job: EditorJob, claim: string): Promise<void> {
  const dir = path.join(os.tmpdir(), "remedy-editor-cut", job.id);
  fs.mkdirSync(dir, { recursive: true });
  const files = new Map<string, string>();
  const durations = new Map<string, number>();
  const probes = new Map<string, Probe>();
  try {
    for (const clip of job.clips) {
      const bytes = await downloadBuffer(clip.r2Key);
      if (!bytes) throw new Error(`${clip.name} is missing from storage.`);
      const file = path.join(dir, `${clip.id}.${clip.ext}`);
      fs.writeFileSync(file, bytes);
      files.set(clip.id, file);
      const info = await probeFile(file);
      probes.set(clip.id, info);
      durations.set(clip.id, info.duration);
    }
    const plan = await choosePlan(job, durations);
    if (plan.voice && !probes.get(plan.voice.id)?.hasAudio) {
      throw new Error(`${plan.voice.name} has no audio to lay over the app demo.`);
    }
    if (plan.talking.some((clip) => !probes.get(clip.id)?.hasVideo || !probes.get(clip.id)?.hasAudio)) {
      throw new Error("The talking-head clip needs picture and sound.");
    }
    if (plan.screen.some((clip) => !probes.get(clip.id)?.hasVideo)) {
      throw new Error("A screen recording has no picture.");
    }
    if (plan.screen.length > 0 && !plan.voice) {
      throw new Error("Mark which clip is the voiceover. That sound goes over the app demo, it is not its own shot.");
    }
    const renderedCut = await renderCut(dir, plan, files, durations);
    const output = renderedCut.output;
    const previewKey = editorPreviewKey(job.id);
    const previous = job.cut?.previewKey;
    if (previous && previous !== previewKey) await deleteObject(previous).catch(() => undefined);
    await uploadBuffer(previewKey, fs.readFileSync(output), "video/mp4", "private, no-store");
    const fresh = await storedEditorJob(job.id);
    if (!fresh || fresh.cut?.startedAt !== claim) return;
    const cut: EditorCut = {
      phase: "review",
      summary: renderedCut.summary.slice(0, 2000),
      startedAt: claim,
      updatedAt: new Date().toISOString(),
      redo: [],
      cuts: [],
      fixNote: "",
      previewKey,
    };
    await storeEditorJob({ ...fresh, cut, updatedAt: cut.updatedAt });
    console.log(`editor compile ${job.title}: ${cut.summary}`);
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 500) : "Could not compile the video.";
    const fresh = await storedEditorJob(job.id);
    if (!fresh || fresh.cut?.startedAt !== claim) return;
    const cut: EditorCut = {
      phase: "redo",
      summary: message,
      startedAt: claim,
      updatedAt: new Date().toISOString(),
      redo: [{ clipId: job.clips[0]?.id ?? job.id, note: message }],
      cuts: [],
      fixNote: "",
      previewKey: fresh.cut?.previewKey ?? null,
    };
    if (!job.clips[0]) {
      cut.redo = [];
      cut.summary = message;
    }
    await storeEditorJob({ ...fresh, cut, updatedAt: cut.updatedAt });
    console.warn("editor compile failed:", message);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function claimIsFresh(startedAt: string | null): boolean {
  if (!startedAt) return false;
  const age = Date.now() - Date.parse(startedAt);
  return Number.isFinite(age) && age >= 0 && age < 30 * 60 * 1000;
}

export async function cutPendingOnce(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const rows = await listEditorJobs();
    for (const row of rows) {
      const job = await storedEditorJob(row.id);
      if (!job || !job.notes.trim()) continue;
      if (job.clips.length === 0 || job.clips.some((clip) => clip.status !== "uploaded")) continue;
      const phase = job.cut?.phase;
      if (phase === "review" || phase === "redo" || phase === "approved") continue;
      if (phase === "cutting" && claimIsFresh(job.cut?.startedAt ?? null)) continue;
      if (phase !== "cutting" && job.cut) continue;
      const claim = new Date().toISOString();
      const claimed: EditorJob = {
        ...job,
        cut: {
          phase: "cutting",
          summary: "Building one video you can watch.",
          startedAt: claim,
          updatedAt: claim,
          redo: [],
          cuts: [],
          fixNote: job.cut?.fixNote ?? "",
          previewKey: job.cut?.previewKey ?? null,
        },
      };
      await storeEditorJob(claimed);
      await cutJob(claimed, claim);
    }
  } catch (err) {
    console.warn("editor cut pass:", err instanceof Error ? err.message.slice(0, 200) : err);
  } finally {
    running = false;
  }
}

export function startEditorWatch(): void {
  void cutPendingOnce();
  setInterval(() => {
    void cutPendingOnce();
  }, 15_000);
  console.log("Editor cut watch: every 15s");
}
