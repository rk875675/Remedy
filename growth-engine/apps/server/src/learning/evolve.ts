import { z } from "zod";
import { getDb, hooks, isLowSignalHook, posts } from "@remedy-growth/db";
import { and, eq } from "drizzle-orm";
import { BRAND } from "../config.js";
import { generateJson } from "../generation/llm.js";
import { getRating } from "./ratings.js";

const VariationsSchema = z
  .object({
    variations: z.array(z.string().min(5).max(120)).min(1).max(5),
  })
  .strict();

/** Cheap offline mutations of a winning hook when no LLM is available. */
function mutateHook(text: string): string[] {
  const out: string[] = [];
  if (text.endsWith("?")) {
    out.push(text.replace(/\?$/, ". Here's the fix."));
  } else {
    out.push(`${text} (yes, really)`);
  }
  out.push(`POV: ${text.charAt(0).toLowerCase()}${text.slice(1).replace(/[.?!]$/, "")}`);
  out.push(`Nobody tells you this: ${text.charAt(0).toLowerCase()}${text.slice(1)}`);
  return out.slice(0, 3);
}

/**
 * For every winner post whose hook has no evolved children yet, generate 3
 * hook variations (same promise, different angle) as new candidates.
 */
export async function evolveWinners(): Promise<number> {
  const db = getDb();
  const winners = db.select().from(posts).where(eq(posts.diagnosis, "winner")).all();

  let created = 0;
  for (const post of winners) {
    const hook = db.select().from(hooks).where(eq(hooks.id, post.hookId)).get();
    if (!hook) continue;
    const formulaRating = hook.formulaId ? getRating("formula", String(hook.formulaId)) : null;
    const catRating = getRating("hook_category", hook.category);
    const rated = formulaRating ?? catRating;
    if (rated.samples < 3 || rated.score < 62) continue;
    const children = db
      .select()
      .from(hooks)
      .where(and(eq(hooks.parentHookId, hook.id), eq(hooks.source, "evolved")))
      .all();
    if (children.length > 0) continue; // already evolved

    const prompt = `This TikTok carousel hook for ${BRAND.appName} (a ${BRAND.niche} app) performed above the median on both views and engagement:
"${hook.text}"

Write 3 variations that keep the same core promise but change ONE element each
(angle, framing, specificity, or emotional register). 1–2 on-screen lines (about 5–14 words).
Keep the avatar or back-pain noun. No vague "this" / save / slide-N lines.
Fragments are good. No emojis, no brand name, no "How I fixed".
Return JSON: {"variations":["...","...","..."]}`;

    const result = await generateJson(prompt, VariationsSchema);
    const variations = result?.variations ?? mutateHook(hook.text);

    for (const text of variations.slice(0, 3)) {
      if (isLowSignalHook(text)) continue;
      db.insert(hooks)
        .values({
          text,
          category: hook.category,
          formulaId: hook.formulaId,
          source: "evolved",
          parentHookId: hook.id,
        })
        .run();
      created++;
    }
    console.log(`Evolved winner hook #${hook.id} into ${Math.min(variations.length, 3)} variations.`);
  }
  return created;
}
