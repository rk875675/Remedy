// Pure, dependency-free program assignment engine.
//
// This module contains NO Supabase / Deno IO so it can be unit tested in isolation.
// The edge function (assign-program/index.ts) loads data from the DB, calls buildPlan(),
// and writes the resolved snapshot.
//
// Design (see migrations 013–015):
//   - Layer 1 tagged catalog -> CatalogExercise[]
//   - Layer 2 slot templates  -> TemplateInput
//   - Layer 3 rules config     -> AssignmentRulesConfig
//   => Layer 4 resolved plan   -> ResolvedPlan (frozen snapshot)

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export type EquipmentTier = 'open_space' | 'bands_dumbbells' | 'gym';
export type PainLocation = 'upper' | 'lower' | 'all';
export type PainDuration = 'acute' | 'subacute' | 'chronic';
// 'multiple' removed — multi-select replaces it.
export type PainType = 'stiffness' | 'ache' | 'sharp';
export type ActivityLevel = 'sedentary' | 'light' | 'active' | 'athlete';
export type PainTrigger = 'sitting' | 'bending' | 'standing' | 'morning' | 'exercise' | 'other';
export type MainGoal = 'reduce_pain' | 'return_to_exercise' | 'sleep' | 'mobility';

export interface Answers {
  pain_location: PainLocation;
  pain_duration: PainDuration;
  // Multi-select arrays — >=1 element each.
  pain_type: PainType[];
  activity_level: ActivityLevel;
  pain_trigger: PainTrigger[];
  equipment: EquipmentTier;
  main_goal: MainGoal[];
  sessions_per_week_preference: number | null;
}

export interface CatalogExercise {
  id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number;
  equipment_tier: EquipmentTier;
  pain_areas: string[];
  intensity_tier: number;
  movement_pattern: string;
  pain_types_safe: string[];
  triggers_addressed: string[];
  goals_weight: Record<string, number>;
  effectiveness: number;
  fatigue_cost: number;
  usefulness: number;
  aggravates: string[];
  phase: string;
  duration_minutes_est: number;
}

export interface SlotCriteria {
  movement_pattern?: string;
  phase?: string;
  pain_area_bias?: string;
  target_intensity_tier?: number;
  label?: string;
}

export interface TemplateSlot {
  slot_order: number;
  selection_criteria: SlotCriteria;
}

export interface TemplateSession {
  session_index: number;
  title_template: string;
  phase: string;
  slots: TemplateSlot[];
}

export interface TemplateInput {
  week_phase_plan: Record<string, Record<string, number>>;
  sessions: TemplateSession[];
}

export interface ReplacementEntry {
  movement_pattern: string;
  exercise_id: string;
  priority: number;
}

interface Contraindication {
  when: Record<string, string[]>;
  exclude_aggravates: string[];
  apply_until_week_fraction: number;
}

export interface AssignmentRulesConfig {
  global: {
    duration_weeks: Record<string, number>;
    bodyweight_only_early_weeks: number;
    early_weeks: number;
    scoring: {
      effectiveness: number;
      pain_area_match: number;
      goal_weight: number;
      trigger_match: number;
      pain_type_pref: number;
      usefulness: number;
      phase_match: number;
    };
  };
  activity_level: {
    intensity_multiplier: Record<string, number>;
    rest_multiplier: Record<string, number>;
    fatigue_budget: Record<string, number>;
  };
  pain_duration: {
    starting_intensity_offset: Record<string, number>;
    strength_phase_start_fraction: Record<string, number>;
  };
  pain_location: {
    area_filter: Record<string, string[]>;
    all_week_bias: { first_half: string; second_half: string };
    contraindications: Contraindication[];
    title_focus: Record<string, string>;
  };
  pain_type: {
    require_pain_types_safe: Record<string, boolean>;
    sharp_bodyweight_only_early: boolean;
    exclude_aggravates_early: Record<string, string[]>;
  };
  pain_trigger: {
    swap_per_session: number;
    emphasis: Record<
      string,
      {
        movement_patterns: string[];
        exclude_aggravates_early?: string[];
        first_session_mobility_bias?: boolean;
      }
    >;
  };
  main_goal: {
    goal_key_for_weight: Record<string, string>;
    load_progression_accel_after_week: Record<string, number>;
    title_focus: Record<string, string>;
  };
  equipment: {
    tier_rank: Record<string, number>;
    subtitle_when: Record<string, string>;
  };
  sessions_per_week_preference: {
    recommendation: Record<string, Record<string, number>>;
    options: number[];
    avoid_consecutive_for: string[];
  };
}

export interface BuildPlanInput {
  answers: Answers;
  rules: AssignmentRulesConfig;
  rulesVersion: number;
  exercises: CatalogExercise[];
  template: TemplateInput;
  replacements: ReplacementEntry[];
  startWeek?: number;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface ResolvedExercise {
  exercise_id: string;
  order_index: number;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number;
  load_tier: number;
}

export interface ResolvedSession {
  week_number: number;
  session_number: number;
  title: string;
  phase: string;
  estimated_minutes: number;
  intensity_tier: number;
  exercises: ResolvedExercise[];
}

export interface ResolvedPlan {
  program_name: string;
  subtitle: string | null;
  tagline: string | null;
  duration_weeks: number;
  sessions_per_week: number;
  start_week: number;
  rules_version: number;
  primary_focus: string;
  secondary_focus: string;
  sessions: ResolvedSession[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TITLE_AREA: Record<PainLocation, string> = {
  upper: 'Thoracic',
  lower: 'Lumbar',
  all: 'Full Back',
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function weekFraction(week: number, durationWeeks: number): number {
  if (durationWeeks <= 1) return 0;
  return clamp((week - 1) / (durationWeeks - 1), 0, 1);
}

function phaseBucket(fraction: number): 'early' | 'mid' | 'late' {
  if (fraction < 0.34) return 'early';
  if (fraction < 0.67) return 'mid';
  return 'late';
}

function tierRank(rules: AssignmentRulesConfig, tier: string): number {
  return rules.equipment.tier_rank[tier] ?? 0;
}

// Compute the recommended sessions/week from activity_level x pain_duration.
export function recommendedSessionsPerWeek(
  rules: AssignmentRulesConfig,
  activity: ActivityLevel,
  duration: PainDuration,
): number {
  const row = rules.sessions_per_week_preference.recommendation[activity];
  return row?.[duration] ?? 3;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function buildPlan(input: BuildPlanInput): ResolvedPlan {
  const { answers, rules, exercises, template, replacements, rulesVersion } = input;
  const requestedStart = input.startWeek ?? 1;

  const durationWeeks = rules.global.duration_weeks[answers.pain_duration] ?? 5;
  // A retake can request a start week beyond a (possibly shorter) new duration — in that
  // case rebuild the whole program from week 1.
  const startWeek = requestedStart > durationWeeks ? 1 : requestedStart;
  const sessionsPerWeek =
    answers.sessions_per_week_preference ??
    recommendedSessionsPerWeek(rules, answers.activity_level, answers.pain_duration);

  const userTierRank = tierRank(rules, answers.equipment);
  const intensityMult = rules.activity_level.intensity_multiplier[answers.activity_level] ?? 1;
  const restMult = rules.activity_level.rest_multiplier[answers.activity_level] ?? 1;
  const fatigueBudget = rules.activity_level.fatigue_budget[answers.activity_level] ?? 12;
  const startingOffset = rules.pain_duration.starting_intensity_offset[answers.pain_duration] ?? 0;
  const strengthStartFraction =
    rules.pain_duration.strength_phase_start_fraction[answers.pain_duration] ?? 0.4;
  const strengthStartWeek = Math.max(1, Math.ceil(strengthStartFraction * durationWeeks));
  const earlyWeeks = rules.global.early_weeks ?? 2;
  const bodyweightEarlyWeeks = rules.global.bodyweight_only_early_weeks ?? 2;
  // Decision: if exactly 1 goal use it; if >1 use first for scoring / accel.
  const primaryGoal = answers.main_goal[0];
  const goalKey = rules.main_goal.goal_key_for_weight[primaryGoal] ?? primaryGoal;
  const accelAfterWeek = rules.main_goal.load_progression_accel_after_week[primaryGoal] ?? null;

  // Hard equipment filter — never above the user's tier.
  const equipmentPool = exercises.filter(
    (ex) => tierRank(rules, ex.equipment_tier) <= userTierRank,
  );

  // Replacement lookup by movement pattern, ordered by priority.
  const replacementByPattern = new Map<string, string[]>();
  for (const r of [...replacements].sort((a, b) => a.priority - b.priority)) {
    const list = replacementByPattern.get(r.movement_pattern) ?? [];
    list.push(r.exercise_id);
    replacementByPattern.set(r.movement_pattern, list);
  }

  // Pick the first `sessionsPerWeek` session blueprints.
  const blueprints = [...template.sessions]
    .sort((a, b) => a.session_index - b.session_index)
    .slice(0, sessionsPerWeek);

  const sessions: ResolvedSession[] = [];

  for (let week = startWeek; week <= durationWeeks; week++) {
    const fraction = weekFraction(week, durationWeeks);
    const bucket = phaseBucket(fraction);
    const isEarly = week <= earlyWeeks;
    const isBodyweightOnly =
      answers.pain_type.includes('sharp') &&
      rules.pain_type.sharp_bodyweight_only_early &&
      week <= bodyweightEarlyWeeks;

    // Aggravations to exclude this week (contraindications + pain-type rules).
    const excludeAggravates = new Set<string>();
    for (const c of rules.pain_location.contraindications) {
      // Any-match: if an answer field is an array, the condition matches when ANY element matches.
      const matches = Object.entries(c.when).every(([key, vals]) => {
        const raw = (answers as unknown as Record<string, string | string[]>)[key];
        if (Array.isArray(raw)) return raw.some((v) => vals.includes(v));
        return vals.includes(raw);
      });
      if (matches && fraction <= c.apply_until_week_fraction) {
        c.exclude_aggravates.forEach((a) => excludeAggravates.add(a));
      }
    }
    if (isEarly) {
      // Union aggravation exclusions across all selected pain types.
      for (const pt of answers.pain_type) {
        (rules.pain_type.exclude_aggravates_early[pt] ?? []).forEach((a) => excludeAggravates.add(a));
      }
      // Union exclusions across all selected pain triggers.
      for (const trig of answers.pain_trigger) {
        (rules.pain_trigger.emphasis[trig]?.exclude_aggravates_early ?? []).forEach((a) =>
          excludeAggravates.add(a),
        );
      }
    }

    for (let s = 0; s < blueprints.length; s++) {
      const bp = blueprints[s];
      const sessionNumber = s + 1;
      const sessionArea = resolveSessionArea(answers, rules, sessionNumber, sessionsPerWeek);
      const title = bp.title_template.replace('{area}', TITLE_AREA[answers.pain_location]);
      // morning bias applies if 'morning' is among selected triggers.
      const morningFirstMobility =
        answers.pain_trigger.includes('morning') &&
        sessionNumber === 1 &&
        (rules.pain_trigger.emphasis['morning']?.first_session_mobility_bias ?? false);

      const chosen: ResolvedExercise[] = [];
      const usedIds = new Set<string>();
      let fatigue = 0;
      let estMinutes = 0;

      for (const slot of [...bp.slots].sort((a, b) => a.slot_order - b.slot_order)) {
        const crit = slot.selection_criteria;
        // Strength is gated until the strength phase starts; downgrade to activation.
        let effectivePhase = crit.phase;
        if (effectivePhase === 'strength' && week < strengthStartWeek) {
          effectivePhase = 'activation';
        }

        const slotArea =
          crit.pain_area_bias === 'match_user' ? sessionArea : answers.pain_location;

        const candidate = selectForSlot({
          pool: equipmentPool,
          rules,
          answers,
          crit,
          effectivePhase,
          slotArea,
          usedIds,
          excludeAggravates,
          isBodyweightOnly,
          fatigue,
          fatigueBudget,
          hasPicked: chosen.length > 0,
          morningFirstMobility,
          replacementByPattern,
          byId: makeById(equipmentPool),
        });

        if (!candidate) continue;
        usedIds.add(candidate.id);
        fatigue += candidate.fatigue_cost;
        estMinutes += candidate.duration_minutes_est;

        chosen.push(
          resolveExercise(candidate, chosen.length + 1, {
            fraction,
            week,
            intensityMult,
            restMult,
            startingOffset,
            isEarly,
            accelAfterWeek,
          }),
        );
      }

      sessions.push({
        week_number: week,
        session_number: sessionNumber,
        title,
        phase: bp.phase,
        estimated_minutes: estMinutes,
        intensity_tier: clamp(1 + Math.round(fraction * 4), 1, 5),
        exercises: chosen,
      });
    }
  }

  const naming = buildNaming(answers, rules);

  return {
    program_name: naming.name,
    subtitle: naming.subtitle,
    tagline: naming.tagline,
    duration_weeks: durationWeeks,
    sessions_per_week: sessionsPerWeek,
    start_week: startWeek,
    rules_version: rulesVersion,
    primary_focus: answers.pain_location,
    secondary_focus: answers.main_goal[0],
    sessions,
  };
}

// ---------------------------------------------------------------------------
// Slot resolution + scoring
// ---------------------------------------------------------------------------

function makeById(pool: CatalogExercise[]): Map<string, CatalogExercise> {
  const m = new Map<string, CatalogExercise>();
  for (const ex of pool) m.set(ex.id, ex);
  return m;
}

interface SelectArgs {
  pool: CatalogExercise[];
  rules: AssignmentRulesConfig;
  answers: Answers;
  crit: SlotCriteria;
  effectivePhase?: string;
  slotArea: string;
  usedIds: Set<string>;
  excludeAggravates: Set<string>;
  isBodyweightOnly: boolean;
  fatigue: number;
  fatigueBudget: number;
  hasPicked: boolean;
  morningFirstMobility: boolean;
  replacementByPattern: Map<string, string[]>;
  byId: Map<string, CatalogExercise>;
}

function passesHardFilters(ex: CatalogExercise, args: SelectArgs): boolean {
  const { rules, answers, slotArea, usedIds, excludeAggravates, isBodyweightOnly } = args;
  if (usedIds.has(ex.id)) return false;
  if (isBodyweightOnly && ex.equipment_tier !== 'open_space') return false;
  // pain-area filter
  const allowedAreas = rules.pain_location.area_filter[answers.pain_location] ?? ['general'];
  if (!ex.pain_areas.some((a) => allowedAreas.includes(a))) return false;
  // pain-type safety: apply if ANY selected pain type requires it.
  // Each such type must be covered by pain_types_safe (or 'all').
  const typesNeedingSafe = answers.pain_type.filter((pt) => rules.pain_type.require_pain_types_safe[pt]);
  if (typesNeedingSafe.length > 0) {
    const allCovered = typesNeedingSafe.every(
      (pt) => ex.pain_types_safe.includes(pt) || ex.pain_types_safe.includes('all'),
    );
    if (!allCovered) return false;
  }
  // contraindicated movement properties
  if (ex.aggravates.some((a) => excludeAggravates.has(a))) return false;
  // fatigue budget — allow exceeding only if the session has nothing yet
  if (args.hasPicked && args.fatigue + ex.fatigue_cost > args.fatigueBudget) return false;
  // unused slotArea kept for scoring; referenced there
  void slotArea;
  return true;
}

function scoreExercise(ex: CatalogExercise, args: SelectArgs): number {
  const { rules, answers, crit, slotArea, effectivePhase, morningFirstMobility } = args;
  const w = rules.global.scoring;
  const primaryGoal = answers.main_goal[0];
  const goalKey = rules.main_goal.goal_key_for_weight[primaryGoal] ?? primaryGoal;

  const areaMatch = ex.pain_areas.includes(slotArea)
    ? 1
    : ex.pain_areas.includes('general')
      ? 0.4
      : 0;
  const goalWeight = ex.goals_weight[goalKey] ?? 0;
  // Any-match: trigger score is 1 if exercise addresses ANY selected trigger.
  const triggerMatch = answers.pain_trigger.some((t) => ex.triggers_addressed.includes(t)) ? 1 : 0;
  // Any-match: pain type pref is 1 if safe for ANY selected type.
  const painTypePref = answers.pain_type.some((pt) => ex.pain_types_safe.includes(pt))
    ? 1
    : ex.pain_types_safe.includes('all')
      ? 0.5
      : 0;
  const phaseMatch = effectivePhase && ex.phase === effectivePhase ? 1 : 0;
  const patternMatch = crit.movement_pattern && ex.movement_pattern === crit.movement_pattern ? 2 : 0;
  const morningBonus = morningFirstMobility && ex.phase === 'mobility' ? 0.75 : 0;

  return (
    w.effectiveness * (ex.effectiveness / 5) +
    w.pain_area_match * areaMatch +
    w.goal_weight * goalWeight +
    w.trigger_match * triggerMatch +
    w.pain_type_pref * painTypePref +
    w.usefulness * (ex.usefulness / 5) +
    w.phase_match * phaseMatch +
    patternMatch +
    morningBonus
  );
}

// Returns the best exercise for a slot, or null. Falls back: pattern -> replacement
// pool -> phase-only.
function selectForSlot(args: SelectArgs): CatalogExercise | null {
  const { crit, effectivePhase, replacementByPattern, byId } = args;

  const rank = (ex: CatalogExercise): [number, number, string] => [
    scoreExercise(ex, args),
    ex.usefulness,
    ex.id,
  ];
  const better = (a: CatalogExercise, b: CatalogExercise): CatalogExercise => {
    const [sa, ua, ia] = rank(a);
    const [sb, ub, ib] = rank(b);
    if (sa !== sb) return sa > sb ? a : b;
    if (ua !== ub) return ua > ub ? a : b;
    return ia < ib ? a : b;
  };
  const pickBest = (cands: CatalogExercise[]): CatalogExercise | null =>
    cands.length ? cands.reduce(better) : null;

  // 1) Exact movement_pattern + phase (effectivePhase if downgraded).
  if (crit.movement_pattern) {
    const byPattern = args.pool.filter(
      (ex) =>
        ex.movement_pattern === crit.movement_pattern &&
        (!effectivePhase || ex.phase === effectivePhase || ex.phase === crit.phase) &&
        passesHardFilters(ex, args),
    );
    const best = pickBest(byPattern);
    if (best) return best;

    // 2) Replacement pool for the movement pattern (already hard-filtered).
    const repl = replacementByPattern.get(crit.movement_pattern) ?? [];
    const replCands = repl
      .map((id) => byId.get(id))
      .filter((ex): ex is CatalogExercise => !!ex && passesHardFilters(ex, args));
    const replBest = pickBest(replCands);
    if (replBest) return replBest;
  }

  // 3) Phase-only fallback (any equipment-appropriate exercise in the phase).
  const targetPhase = effectivePhase ?? crit.phase;
  const byPhase = args.pool.filter(
    (ex) => (!targetPhase || ex.phase === targetPhase) && passesHardFilters(ex, args),
  );
  const phaseBest = pickBest(byPhase);
  if (phaseBest) return phaseBest;

  // 4) Last resort: any equipment-appropriate, area/type-safe exercise.
  const anyCands = args.pool.filter((ex) => passesHardFilters(ex, args));
  return pickBest(anyCands);
}

// ---------------------------------------------------------------------------
// Intensity resolution
// ---------------------------------------------------------------------------

interface IntensityCtx {
  fraction: number;
  week: number;
  intensityMult: number;
  restMult: number;
  startingOffset: number;
  isEarly: boolean;
  accelAfterWeek: number | null;
}

function resolveExercise(
  ex: CatalogExercise,
  orderIndex: number,
  ctx: IntensityCtx,
): ResolvedExercise {
  // Reps grow ~0.9x -> 1.2x across the program, scaled by activity multiplier.
  let repsFactor = ctx.intensityMult * (0.9 + 0.3 * ctx.fraction);
  // Acute / negative starting offset: start gentler in the early weeks.
  if (ctx.startingOffset < 0 && ctx.isEarly) repsFactor *= 0.85;
  // return_to_exercise: accelerate loading after the configured week.
  if (ctx.accelAfterWeek !== null && ctx.week > ctx.accelAfterWeek) repsFactor *= 1.1;

  const reps = ex.reps !== null ? Math.max(3, Math.round(ex.reps * repsFactor)) : null;
  const durationSeconds =
    ex.duration_seconds !== null
      ? Math.max(10, Math.round(ex.duration_seconds * (0.9 + 0.2 * ctx.fraction)))
      : null;
  const restSeconds = Math.max(10, Math.round(ex.rest_seconds * ctx.restMult));
  const loadTier = clamp(
    1 + Math.round(ctx.fraction * 3) + (ctx.accelAfterWeek !== null && ctx.week > ctx.accelAfterWeek ? 1 : 0),
    1,
    5,
  );

  return {
    exercise_id: ex.id,
    order_index: orderIndex,
    sets: ex.sets,
    reps,
    duration_seconds: durationSeconds,
    rest_seconds: restSeconds,
    load_tier: loadTier,
  };
}

// ---------------------------------------------------------------------------
// 'all' area biasing + naming
// ---------------------------------------------------------------------------

function resolveSessionArea(
  answers: Answers,
  rules: AssignmentRulesConfig,
  sessionNumber: number,
  sessionsPerWeek: number,
): string {
  if (answers.pain_location !== 'all') return answers.pain_location;
  // first half of the week biases upper, second half biases lower
  const half = Math.ceil(sessionsPerWeek / 2);
  return sessionNumber <= half
    ? rules.pain_location.all_week_bias.first_half
    : rules.pain_location.all_week_bias.second_half;
}

function buildNaming(
  answers: Answers,
  rules: AssignmentRulesConfig,
): { name: string; subtitle: string | null; tagline: string } {
  const primary = rules.pain_location.title_focus[answers.pain_location] ?? 'Back';
  const primaryGoal = answers.main_goal[0];

  // Decision: 1 goal → "<area> <goalFocus> Program"; >1 goals → generic name.
  let name: string;
  if (answers.main_goal.length === 1) {
    const secondary = rules.main_goal.title_focus[primaryGoal] ?? 'Relief';
    name = `${primary} ${secondary} Program`;
  } else {
    name = 'Personalized Recovery Program';
  }

  const subtitle = rules.equipment.subtitle_when[answers.equipment] ?? null;

  const durationWord: Record<PainDuration, string> = {
    acute: 'recent',
    subacute: 'ongoing',
    chronic: 'long-standing',
  };
  const goalPhrase: Record<MainGoal, string> = {
    reduce_pain: 'calming your pain',
    return_to_exercise: 'getting you back to training',
    sleep: 'easing tension for better rest',
    mobility: 'restoring your range of motion',
  };
  const areaPhrase = answers.pain_location === 'all' ? 'back' : `${primary.toLowerCase()} pain`;
  // Tagline always uses primary goal for focus phrase.
  const tagline = `A plan for ${durationWord[answers.pain_duration]} ${areaPhrase}, focused on ${goalPhrase[primaryGoal]}.`;

  return { name, subtitle, tagline };
}
