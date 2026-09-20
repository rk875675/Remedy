import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { env } from "../config.js";

/**
 * Text generation with pluggable providers:
 * - "cursor": shells out to the Cursor CLI (`agent -p`) — uses your Cursor plan's
 *   auto usage, no API key needed. Requires `agent login` once.
 * - "gemini": Gemini Flash REST API (free tier for text).
 * - "none": always fall back to formula-based generation.
 * Callers get null on any failure so the pipeline keeps working offline.
 */

// ---------------------------------------------------------------------------
// In-process rate limiter — hard ceiling on LLM calls to prevent runaway
// Cursor auto usage. Works alongside Cloudflare Access (defense-in-depth).
// ---------------------------------------------------------------------------

class LlmRateLimiter {
  private timestamps: number[] = [];
  private activeCount = 0;

  constructor(
    private maxPerMinute: number,
    private maxPerHour: number,
    private maxPerDay: number,
    private maxConcurrent: number,
  ) {}

  private prune(now: number): void {
    const cutoff = now - 86_400_000;
    let i = 0;
    while (i < this.timestamps.length && this.timestamps[i]! < cutoff) i++;
    if (i > 0) this.timestamps.splice(0, i);
  }

  canProceed(): { allowed: boolean; reason?: string } {
    const now = Date.now();
    this.prune(now);

    if (this.activeCount >= this.maxConcurrent) {
      return { allowed: false, reason: `concurrent limit (${this.maxConcurrent})` };
    }

    const oneMinAgo = now - 60_000;
    const oneHourAgo = now - 3_600_000;
    let lastMinute = 0;
    let lastHour = 0;
    for (const t of this.timestamps) {
      if (t >= oneMinAgo) lastMinute++;
      if (t >= oneHourAgo) lastHour++;
    }

    if (lastMinute >= this.maxPerMinute) {
      return { allowed: false, reason: `per-minute limit (${this.maxPerMinute}/min)` };
    }
    if (lastHour >= this.maxPerHour) {
      return { allowed: false, reason: `per-hour limit (${this.maxPerHour}/hr)` };
    }
    if (this.timestamps.length >= this.maxPerDay) {
      return { allowed: false, reason: `daily budget exhausted (${this.maxPerDay}/day)` };
    }
    return { allowed: true };
  }

  acquire(): { ok: true } | { ok: false; reason: string } {
    const check = this.canProceed();
    if (!check.allowed) {
      console.warn(`LLM rate limit hit: ${check.reason}`);
      return { ok: false, reason: check.reason! };
    }
    this.timestamps.push(Date.now());
    this.activeCount++;
    return { ok: true };
  }

  release(): void {
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  stats(): LlmRateStats {
    const now = Date.now();
    this.prune(now);
    const oneMinAgo = now - 60_000;
    const oneHourAgo = now - 3_600_000;
    let lastMinute = 0;
    let lastHour = 0;
    for (const t of this.timestamps) {
      if (t >= oneMinAgo) lastMinute++;
      if (t >= oneHourAgo) lastHour++;
    }
    return {
      lastMinute,
      lastHour,
      last24h: this.timestamps.length,
      active: this.activeCount,
      limits: {
        perMinute: this.maxPerMinute,
        perHour: this.maxPerHour,
        perDay: this.maxPerDay,
        concurrent: this.maxConcurrent,
      },
    };
  }
}

export interface LlmRateStats {
  lastMinute: number;
  lastHour: number;
  last24h: number;
  active: number;
  limits: { perMinute: number; perHour: number; perDay: number; concurrent: number };
}

const rateLimiter = new LlmRateLimiter(
  env.LLM_MAX_PER_MINUTE,
  env.LLM_MAX_PER_HOUR,
  env.LLM_MAX_PER_DAY,
  env.LLM_MAX_CONCURRENT,
);

export function llmRateStats(): LlmRateStats {
  return rateLimiter.stats();
}

// ---------------------------------------------------------------------------
// Model rotation — picks randomly from CURSOR_MODEL (comma-separated list)
// ---------------------------------------------------------------------------

const cursorModels: string[] = env.CURSOR_MODEL
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
if (cursorModels.length === 0) cursorModels.push("auto");

function pickModel(): string {
  return cursorModels[Math.floor(Math.random() * cursorModels.length)]!;
}

/** Extract the first JSON object from possibly-chatty model output. */
function extractJson(text: string): unknown | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Resolve the Cursor CLI to a directly-spawnable [command, ...baseArgs].
 * On Windows the `agent` command is a .cmd/.ps1 launcher that ultimately runs
 * `node.exe index.js` from a versioned folder — spawning that directly avoids
 * shell quoting problems with multi-line prompts.
 */
function resolveCursorCli(): string[] | null {
  if (process.platform === "win32") {
    const base = path.join(process.env.LOCALAPPDATA ?? "", "cursor-agent", "versions");
    try {
      const versions = fs
        .readdirSync(base)
        .filter((n) => /^\d{4}\.\d{1,2}\.\d{1,2}(-\d{2}-\d{2}-\d{2})?-[a-f0-9]+$/.test(n))
        .sort()
        .reverse();
      for (const v of versions) {
        const nodeExe = path.join(base, v, "node.exe");
        const indexJs = path.join(base, v, "index.js");
        if (fs.existsSync(nodeExe) && fs.existsSync(indexJs)) return [nodeExe, indexJs];
      }
    } catch {
      // fall through
    }
    return null;
  }
  return [env.CURSOR_AGENT_BIN];
}

function runCursorAgent(prompt: string, timeoutMs = 180_000): Promise<string | null> {
  const gate = rateLimiter.acquire();
  if (!gate.ok) return Promise.resolve(null);

  return new Promise<string | null>((resolve) => {
    const done = (val: string | null) => {
      rateLimiter.release();
      resolve(val);
    };

    const cli = resolveCursorCli();
    if (!cli) {
      console.warn("Cursor CLI not found — install it with: irm 'https://cursor.com/install?win32=true' | iex");
      done(null);
      return;
    }
    const [cmd, ...baseArgs] = cli;
    const model = pickModel();
    const workDir = path.join(os.tmpdir(), "remedy-growth-agent");
    fs.mkdirSync(workDir, { recursive: true });
    const child = spawn(
      cmd!,
      [...baseArgs, "-p", prompt, "--output-format", "text", "--model", model, "--trust"],
      { cwd: workDir, windowsHide: true },
    );
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      done(null);
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => (out += d.toString()));
    child.stderr.on("data", (d: Buffer) => (err += d.toString()));
    child.on("error", () => {
      clearTimeout(timer);
      done(null);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        console.warn(`cursor-agent exited ${code} [model=${model}]: ${err.slice(0, 300)}`);
        done(null);
      } else {
        done(out);
      }
    });
  });
}

async function runGemini(prompt: string): Promise<string | null> {
  if (!env.GEMINI_API_KEY) return null;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.9, responseMimeType: "application/json" },
      }),
    });
    if (!res.ok) {
      console.warn(`Gemini API error ${res.status}: ${await res.text()}`);
      return null;
    }
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return body.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch (err) {
    console.warn("Gemini call failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function generateJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T | null> {
  let raw: string | null = null;
  if (env.LLM_PROVIDER === "cursor") {
    const wrapped = `${prompt}\n\nIMPORTANT: Respond with ONLY the JSON object, no markdown fences, no commentary.`;
    raw = await runCursorAgent(wrapped);
    if (raw === null && env.GEMINI_API_KEY) raw = await runGemini(prompt); // optional backup
  } else if (env.LLM_PROVIDER === "gemini") {
    raw = await runGemini(prompt);
  }
  if (raw === null) return null;

  const json = extractJson(raw);
  if (json === null) {
    console.warn("LLM output contained no parseable JSON:", raw.slice(0, 200));
    return null;
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    console.warn("LLM response failed schema validation:", parsed.error.message);
    return null;
  }
  return parsed.data;
}
