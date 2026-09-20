import { z } from "https://esm.sh/zod@3";

const YmdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Device-local calendar day from `X-Local-Date` (YYYY-MM-DD).
 * Fallback: UTC calendar date (legacy clients / curl).
 */
export function resolveLocalTodayYmd(req: Request): string {
  const raw = req.headers.get("X-Local-Date")?.trim();
  const parsed = raw ? YmdSchema.safeParse(raw) : { success: false as const };
  if (parsed.success) return parsed.data;
  const n = new Date();
  const y = n.getUTCFullYear();
  const m = String(n.getUTCMonth() + 1).padStart(2, "0");
  const d = String(n.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** First Home load sets program start when this header is `home`. */
export function parseProgramAnchor(req: Request): string | null {
  const v = req.headers.get("X-Program-Anchor")?.trim().toLowerCase();
  return v || null;
}
