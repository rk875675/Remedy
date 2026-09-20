import { eq } from "drizzle-orm";
import { getDb, hookFormulas, hooks, learnings, ugcCreators } from "./index.js";
import { HOOK_FORMULAS, HOOK_RULES, RETIRED_HOOK_RULES, SEED_HOOKS, isUnsafeHook } from "./hook-bank.js";

async function main() {
  const db = getDb();

  const wantedNames = new Set(HOOK_FORMULAS.map((f) => f.name));
  const referencedIds = new Set(
    db
      .select()
      .from(hooks)
      .all()
      .map((h) => h.formulaId)
      .filter((id): id is number => typeof id === "number"),
  );
  const existingFormulas = db.select().from(hookFormulas).all();
  let formulasRemoved = 0;
  for (const row of existingFormulas) {
    if (wantedNames.has(row.name) || row.wins > 0 || referencedIds.has(row.id)) continue;
    db.delete(hookFormulas).where(eq(hookFormulas.id, row.id)).run();
    formulasRemoved++;
  }

  const formulaByName = new Map(
    db
      .select()
      .from(hookFormulas)
      .all()
      .map((f) => [f.name, f]),
  );
  let formulasInserted = 0;
  let formulasUpdated = 0;
  for (const f of HOOK_FORMULAS) {
    const ex = formulaByName.get(f.name);
    if (ex) {
      db.update(hookFormulas)
        .set({ category: f.category, template: f.template, notes: f.notes, seeded: true })
        .where(eq(hookFormulas.id, ex.id))
        .run();
      formulasUpdated++;
    } else {
      db.insert(hookFormulas)
        .values({ name: f.name, category: f.category, template: f.template, notes: f.notes, seeded: true })
        .run();
      formulasInserted++;
    }
  }

  const formulaByCategory = new Map<string, number>();
  for (const row of db.select().from(hookFormulas).all()) {
    if (!formulaByCategory.has(row.category)) formulaByCategory.set(row.category, row.id);
  }

  const existingHooks = db.select().from(hooks).all();
  const wantedHookTexts = new Set(SEED_HOOKS.map((h) => h.text.trim().toLowerCase()));
  let hooksRetired = 0;
  for (const row of existingHooks) {
    if (row.source !== "seed" || row.status !== "candidate") continue;
    const key = row.text.trim().toLowerCase();
    if (wantedHookTexts.has(key) && !isUnsafeHook(row.text)) continue;
    db.delete(hooks).where(eq(hooks.id, row.id)).run();
    hooksRetired++;
  }

  const hookByText = new Set(
    db
      .select()
      .from(hooks)
      .all()
      .map((h) => h.text.trim().toLowerCase()),
  );
  let hooksInserted = 0;
  for (const h of SEED_HOOKS) {
    const key = h.text.trim().toLowerCase();
    if (hookByText.has(key) || isUnsafeHook(h.text)) continue;
    db.insert(hooks)
      .values({
        text: h.text,
        category: h.category,
        formulaId: formulaByCategory.get(h.category) ?? null,
        source: "seed",
        status: "candidate",
      })
      .run();
    hookByText.add(key);
    hooksInserted++;
  }

  const existingRules = db
    .select()
    .from(learnings)
    .where(eq(learnings.kind, "rule"))
    .all();
  const retired = new Set(RETIRED_HOOK_RULES);
  let rulesRetired = 0;
  for (const row of existingRules) {
    if (!retired.has(row.content)) continue;
    db.delete(learnings).where(eq(learnings.id, row.id)).run();
    rulesRetired++;
  }
  const remainingRules = new Set(
    db
      .select()
      .from(learnings)
      .where(eq(learnings.kind, "rule"))
      .all()
      .map((r) => r.content),
  );
  let rulesInserted = 0;
  for (const rule of HOOK_RULES) {
    if (remainingRules.has(rule)) continue;
    db.insert(learnings).values({ kind: "rule", content: rule, score: 1 }).run();
    rulesInserted++;
  }

  const sohan = db.select().from(ugcCreators).where(eq(ugcCreators.slug, "sohan")).get();
  if (!sohan) {
    db.insert(ugcCreators).values({ slug: "sohan", displayName: "Sohan", email: "" }).run();
    console.log("Seeded UGC creator Sohan.");
  }
  const ai = db.select().from(ugcCreators).where(eq(ugcCreators.slug, "ai")).get();
  if (!ai) {
    db.insert(ugcCreators).values({ slug: "ai", displayName: "AI", email: "" }).run();
    console.log("Seeded UGC creator AI.");
  }

  console.log(
    `Hook bank: +${formulasInserted} formulas (${formulasUpdated} updated, ${formulasRemoved} retired), +${hooksInserted} seed hooks (${hooksRetired} retired), +${rulesInserted} rules (${rulesRetired} retired).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
