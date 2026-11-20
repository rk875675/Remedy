// Program engine v2. Pure and deterministic: no I/O, no Date, no Math.random.
// Used only when a valid intake exists and exercise_details loaded.
// v1 (engine.ts buildPlan) is unchanged.

import {
  TITLE_AREA,
  buildNaming,
  clampProgressionLevel,
  type Answers,
  type CatalogExercise,
  type ResolvedExercise,
  type ResolvedPlan,
  type ResolvedSession,
} from './engine.ts';
import {
  deriveProfile,
  programWeeks,
  type ClinicalProfile,
  type Intake,
} from './intake.ts';

export type DoseClass =
  | 'mobility_dynamic'
  | 'stretch_static'
  | 'motor_control'
  | 'isometric_core'
  | 'strength_endurance'
  | 'loaded_strength'
  | 'neural_mobilization'
  | 'breathing'
  | 'aerobic';

export type SpineBias = 'flexion' | 'extension' | 'neutral' | 'rotation' | 'lateral';

export interface ExerciseDetail {
  exercise_id: string;
  slug: string;
  dose_class: DoseClass;
  spine_bias: SpineBias;
  contra: string[];
  function_targets: string[];
  per_side: boolean;
}

export interface BuildPlanV2Input {
  answers: Answers;
  intake: Intake;
  exercises: CatalogExercise[];
  details: ExerciseDetail[];
  startWeek?: number;
  progressionLevel?: number;
}

export type DoseColumn = 'high' | 'moderate' | 'low';
export type SessionType = 'A' | 'B' | 'C';
export type SlotKind =
  | 'prep'
  | 'mobility'
  | 'control'
  | 'glute'
  | 'hinge'
  | 'legs'
  | 'pull'
  | 'cooldown';

export const SLOT_KINDS: readonly SlotKind[] = [
  'prep',
  'mobility',
  'control',
  'glute',
  'hinge',
  'legs',
  'pull',
  'cooldown',
];

export interface PlanOutlineWeek {
  week: number;
  mode: 'calm' | 'control' | 'build';
  column: DoseColumn;
  target_tier: number;
  sessions: number;
  avg_minutes: number;
  exercise_count: number;
}

export interface PlanOutline {
  weeks: PlanOutlineWeek[];
  total_sessions: number;
  unique_exercises: number;
}

export interface PlanInspection {
  plan: ResolvedPlan;
  outline: PlanOutline;
  profile: ClinicalProfile;
  emptyByKind: Record<SlotKind, number>;
  holds: { key: string; week: number; exerciseId: string }[];
}

const DOSE_CLASSES: readonly DoseClass[] = [
  'mobility_dynamic',
  'stretch_static',
  'motor_control',
  'isometric_core',
  'strength_endurance',
  'loaded_strength',
  'neural_mobilization',
  'breathing',
  'aerobic',
];

const KNOWN_CONTRA = new Set<string>([
  'flexion_endrange',
  'flexion_loaded',
  'extension_endrange',
  'extension_loaded',
  'rotation_endrange',
  'rotation_loaded',
  'neural_tension',
  'prone',
  'high_iap',
  'balance_challenge',
]);

const EQUIPMENT_RANK: Record<string, number> = {
  open_space: 0,
  bands_dumbbells: 1,
  gym: 2,
};

const SESSIONS_RECOMMENDATION: Record<
  Answers['activity_level'],
  Record<Answers['pain_duration'], number>
> = {
  sedentary: { acute: 3, subacute: 3, chronic: 3 },
  light: { acute: 3, subacute: 3, chronic: 4 },
  active: { acute: 3, subacute: 4, chronic: 4 },
  athlete: { acute: 4, subacute: 4, chronic: 5 },
};

// Progression is set by the week number, not by how far through the program a
// week is, so a longer program keeps the same early pace and climbs further.
/** Weeks at which the target tier rises one step, per starting mode. */
const TIER_STEP_WEEKS: Record<'calm' | 'control' | 'build', readonly number[]> = {
  calm: [3, 8],
  control: [2, 4, 8],
  build: [2, 3, 5],
};
const LOAD_STEP_WEEKS: readonly number[] = [2, 3, 5];
const CALM_TO_CONTROL_WEEK = 3;
const CALM_TO_BUILD_WEEK = 9;
const CONTROL_TO_BUILD_WEEK = 4;
/** Moderate-irritability backs move to the full dose column from this week. */
const FULL_DOSE_WEEK = 5;
/** Held strength work may earn one extra set from this week. */
const EXTRA_SET_WEEK = 4;
/** Weeks an exercise stays in a slot before it rotates out, when it cannot step up. */
const ROTATE_AFTER_WEEKS = 4;

const ROTATION: Record<'calm' | 'control' | 'build', readonly SessionType[]> = {
  calm: ['A', 'B', 'A', 'B', 'A', 'B', 'A'],
  control: ['A', 'B', 'C', 'B', 'A', 'C', 'B'],
  build: ['B', 'C', 'A', 'C', 'B', 'C', 'A'],
};

const BASE_RECIPE: Record<SessionType, readonly SlotKind[]> = {
  A: ['prep', 'control', 'mobility', 'cooldown', 'glute', 'mobility'],
  B: ['prep', 'control', 'control', 'glute', 'cooldown', 'hinge'],
  C: ['prep', 'hinge', 'legs', 'control', 'glute', 'pull'],
};

const SESSION_META: Record<SessionType, { suffix: string; phase: string }> = {
  A: { suffix: 'Mobility & Relief', phase: 'mobility' },
  B: { suffix: 'Stability & Core', phase: 'activation' },
  C: { suffix: 'Strength & Function', phase: 'strength' },
};

const DISPLAY_ORDER: readonly SlotKind[] = SLOT_KINDS;

const WORK_SLOTS = new Set<SlotKind>(['control', 'glute', 'hinge', 'legs', 'pull']);

const LADDER_PATTERNS = new Set<string>([
  'core_activation',
  'spinal_stability',
  'anti_rotation',
  'glute_activation',
  'hip_abduction',
  'hip_hinge',
  'lower_body_strength',
  'functional',
  'posterior_chain_strength',
  'scapular',
]);

const SET_FILL_ORDER: readonly DoseClass[] = [
  'loaded_strength',
  'strength_endurance',
  'motor_control',
  'isometric_core',
];

const CONTROL_PATTERNS = ['core_activation', 'spinal_stability', 'anti_rotation'] as const;

const REP_CAP: Partial<Record<DoseClass, number>> = {
  loaded_strength: 12,
  strength_endurance: 15,
  motor_control: 12,
  mobility_dynamic: 12,
  neural_mobilization: 10,
  isometric_core: 6,
};

const VOLUME_CLASSES = new Set<DoseClass>([
  'motor_control',
  'strength_endurance',
  'loaded_strength',
]);

const LIVE_NAMING = {
  pain_location: {
    title_focus: { upper: 'Upper Back', lower: 'Lower Back', all: 'Full Back' },
  },
  main_goal: {
    title_focus: {
      reduce_pain: 'Pain Relief',
      return_to_exercise: 'Strength & Return',
      sleep: 'Recovery',
      mobility: 'Mobility',
    },
  },
  equipment: { subtitle_when: { open_space: 'Bodyweight' } },
};

interface RecipeSlot {
  kind: SlotKind;
  priorityIndex: number;
  occurrence: number;
  patterns: readonly string[];
  key: string;
}

interface HeldState {
  exerciseId: string;
  tier: number;
  weeksHeld: number;
}

interface FilledSlot {
  slot: RecipeSlot;
  exercise: CatalogExercise;
  detail: ExerciseDetail;
  weeksHeld: number;
  sets: number;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number;
  load_tier: number;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function stepsReached(steps: readonly number[], week: number): number {
  return steps.filter((at) => week >= at).length;
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  if (left.length === 0 || right.length === 0) return false;
  const set = new Set(right);
  return left.some((item) => set.has(item));
}

function unique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

function sessionsPerWeekOf(answers: Answers): number {
  const raw =
    answers.sessions_per_week_preference ??
    SESSIONS_RECOMMENDATION[answers.activity_level][answers.pain_duration] ??
    3;
  return clamp(raw, 3, 7);
}

function columnFor(week: number, profile: ClinicalProfile, intake: Intake): DoseColumn {
  if (profile.gentleStart && week <= 2) return 'high';
  if (profile.irritability === 'high') return 'moderate';
  if (profile.irritability === 'low') return 'low';
  if (week >= FULL_DOSE_WEEK && intake.trend !== 'worse') return 'low';
  return 'moderate';
}

function modeForWeek(
  week: number,
  profile: ClinicalProfile,
): 'calm' | 'control' | 'build' {
  if (profile.mode === 'calm') {
    if (week >= CALM_TO_BUILD_WEEK) return 'build';
    return week >= CALM_TO_CONTROL_WEEK ? 'control' : 'calm';
  }
  if (profile.mode === 'control') return week >= CONTROL_TO_BUILD_WEEK ? 'build' : 'control';
  return 'build';
}

function targetTierFor(
  week: number,
  profile: ClinicalProfile,
  level: number,
): number {
  const raw =
    1 + profile.capacity + stepsReached(TIER_STEP_WEEKS[profile.mode], week) + level;
  return clamp(raw, 2, Math.max(2, profile.tierCap));
}

function slotCeiling(kind: SlotKind, target: number, profile: ClinicalProfile): number {
  if (kind === 'hinge' && profile.exposureBending) return Math.max(target, 2);
  if (WORK_SLOTS.has(kind)) return target;
  return 2;
}

function patternsFor(
  kind: SlotKind,
  profile: ClinicalProfile,
  answers: Answers,
  column: DoseColumn,
): string[] {
  if (kind === 'prep') {
    let patterns: string[];
    if (profile.bias === 'flexion_sensitive') patterns = ['lumbar_extension', 'lumbar_mobility'];
    else if (profile.bias === 'extension_sensitive') patterns = ['lumbar_flexion', 'lumbar_mobility'];
    else patterns = ['lumbar_mobility', 'lumbar_extension'];
    if (answers.pain_location === 'upper') patterns = ['thoracic_mobility', ...patterns];
    if (profile.sensitization === 'high' || column === 'high') patterns = ['breathing', ...patterns];
    return patterns;
  }
  if (kind === 'mobility') {
    const patterns = ['hip_mobility', 'thoracic_mobility', 'lumbar_mobility'];
    if (
      profile.radicular !== 'none' &&
      answers.pain_duration === 'chronic' &&
      column !== 'high'
    ) {
      return ['nerve_glide', ...patterns];
    }
    return patterns;
  }
  if (kind === 'control') return ['core_activation', 'spinal_stability', 'anti_rotation'];
  if (kind === 'glute') return ['glute_activation', 'hip_abduction'];
  if (kind === 'hinge') return ['hip_hinge'];
  if (kind === 'legs') return ['lower_body_strength', 'functional'];
  if (kind === 'pull') return ['posterior_chain_strength', 'scapular'];
  const cooldown = ['stretch_recovery', 'breathing'];
  if (profile.bias === 'extension_sensitive') return ['lumbar_flexion', ...cooldown];
  return cooldown;
}

function moveTo(list: SlotKind[], kind: SlotKind, index: number): void {
  const from = list.indexOf(kind);
  if (from < 0 || from === index) return;
  const [item] = list.splice(from, 1);
  if (!item) return;
  list.splice(Math.min(Math.max(index, 0), list.length), 0, item);
}

function recipeFor(
  type: SessionType,
  typeOccurrence: number,
  week: number,
  mode: 'calm' | 'control' | 'build',
  column: DoseColumn,
  profile: ClinicalProfile,
  answers: Answers,
): RecipeSlot[] {
  const list: SlotKind[] = [...BASE_RECIPE[type]];
  if (answers.pain_location === 'upper' && mode !== 'calm') {
    for (let i = 0; i < list.length; i++) {
      const kind = list[i];
      if (kind === 'hinge') list[i] = 'pull';
      else if (kind === 'legs') list[i] = 'mobility';
    }
  }
  if (profile.emphasis.relaxation >= 0.2 && (type === 'A' || type === 'B')) {
    moveTo(list, 'cooldown', 2);
  }
  if (profile.emphasis.mobility >= 0.3 && (type === 'B' || type === 'C')) {
    list.splice(2, 0, 'mobility');
  }
  if (profile.emphasis.strength >= 0.4) {
    if (type === 'B') moveTo(list, 'hinge', 3);
    if (type === 'A') moveTo(list, 'glute', 2);
  }
  if (profile.exposureBending && week >= 2) {
    const hingeAt = list.indexOf('hinge');
    if (hingeAt > 3) moveTo(list, 'hinge', 3);
  }
  const kept = mode === 'calm' ? list.filter((kind) => kind !== 'legs' && kind !== 'pull') : list;
  // Calm drops pull before the upper-back swap, so the swap has to run after
  // that filter or the hinge replacement is removed with the other pulls.
  if (mode === 'calm' && answers.pain_location === 'upper') {
    for (let i = 0; i < kept.length; i++) {
      const kind = kept[i];
      if (kind === 'hinge') kept[i] = 'pull';
      else if (kind === 'legs') kept[i] = 'mobility';
    }
  }
  // A 15-minute extension-sensitive plan otherwise spends its slots on strength
  // and never reaches the flexion stretch the bias is there to select.
  if (profile.bias === 'extension_sensitive') {
    const cooldownAt = kept.indexOf('cooldown');
    if (cooldownAt > 3) moveTo(kept, 'cooldown', 3);
  }
  const seen: Partial<Record<SlotKind, number>> = {};
  return kept.map((kind, priorityIndex) => {
    const occurrence = seen[kind] ?? 0;
    seen[kind] = occurrence + 1;
    return {
      kind,
      priorityIndex,
      occurrence,
      patterns: patternsFor(kind, profile, answers, column),
      key: `${type}:${typeOccurrence}:${kind}:${occurrence}`,
    };
  });
}

function doseClassFor(exercise: CatalogExercise): DoseClass {
  const pattern = exercise.movement_pattern;
  if (
    pattern === 'lumbar_mobility' ||
    pattern === 'thoracic_mobility' ||
    pattern === 'lumbar_extension' ||
    pattern === 'lumbar_flexion'
  ) {
    return 'mobility_dynamic';
  }
  if (pattern === 'hip_mobility' || pattern === 'stretch_recovery') return 'stretch_static';
  if (pattern === 'core_activation' || pattern === 'anti_rotation') return 'motor_control';
  if (pattern === 'spinal_stability') {
    return exercise.duration_seconds != null ? 'isometric_core' : 'motor_control';
  }
  if (
    pattern === 'glute_activation' ||
    pattern === 'hip_abduction' ||
    pattern === 'functional' ||
    pattern === 'scapular'
  ) {
    return 'strength_endurance';
  }
  if (
    pattern === 'hip_hinge' ||
    pattern === 'lower_body_strength' ||
    pattern === 'posterior_chain_strength'
  ) {
    return exercise.equipment_tier === 'open_space' ? 'strength_endurance' : 'loaded_strength';
  }
  if (pattern === 'nerve_glide') return 'neural_mobilization';
  if (pattern === 'breathing') return 'breathing';
  return 'strength_endurance';
}

function detailFor(exercise: CatalogExercise, byId: ReadonlyMap<string, ExerciseDetail>): ExerciseDetail {
  const row = byId.get(exercise.id);
  if (row) return row;
  return {
    exercise_id: exercise.id,
    slug: exercise.id,
    dose_class: doseClassFor(exercise),
    spine_bias: 'neutral',
    contra: exercise.aggravates.filter((tag) => KNOWN_CONTRA.has(tag)),
    function_targets: [],
    per_side: false,
  };
}

function areaOk(exercise: CatalogExercise, location: Answers['pain_location']): boolean {
  if (location === 'all') return true;
  const allowed = location === 'upper' ? ['upper', 'general'] : ['lower', 'general'];
  return exercise.pain_areas.some((area) => allowed.includes(area));
}

function equipmentOk(
  exercise: CatalogExercise,
  answers: Answers,
  profile: ClinicalProfile,
): boolean {
  const userRank = EQUIPMENT_RANK[answers.equipment] ?? 0;
  const exerciseRank = EQUIPMENT_RANK[exercise.equipment_tier] ?? 99;
  if (exerciseRank > userRank) return false;
  if (profile.loadCap === 'bodyweight' && exercise.equipment_tier !== 'open_space') return false;
  if (profile.loadCap === 'light' && (exercise.equipment_tier === 'gym' || exercise.intensity_tier > 3)) {
    return false;
  }
  return true;
}

function contraOk(detail: ExerciseDetail, profile: ClinicalProfile, week: number): boolean {
  if (intersects(detail.contra, profile.avoid)) return false;
  if (week <= profile.earlyWeeks && intersects(detail.contra, profile.avoidEarly)) return false;
  return true;
}

function passes(
  exercise: CatalogExercise,
  detail: ExerciseDetail,
  patterns: readonly string[] | null,
  ceiling: number,
  used: ReadonlySet<string>,
  answers: Answers,
  profile: ClinicalProfile,
  week: number,
  allowedId: string | null = null,
): boolean {
  if (used.has(exercise.id) && exercise.id !== allowedId) return false;
  if (patterns && !patterns.includes(exercise.movement_pattern)) return false;
  if (!equipmentOk(exercise, answers, profile)) return false;
  if (!areaOk(exercise, answers.pain_location)) return false;
  if (!contraOk(detail, profile, week)) return false;
  if (exercise.intensity_tier > ceiling) return false;
  return true;
}

function scoreExercise(
  exercise: CatalogExercise,
  detail: ExerciseDetail,
  slot: RecipeSlot,
  patterns: readonly string[],
  target: number,
  ceiling: number,
  column: DoseColumn,
  weekUsed: ReadonlyMap<string, number>,
  answers: Answers,
  profile: ClinicalProfile,
): number {
  let score = 0;
  // Work slots keep a small first-vs-second gap so a pattern already used this
  // week (or held long enough to rotate) can lose to the slot's second pattern.
  // Prep, mobility, and cooldown stay on the wider gap.
  if (slot.kind === 'control') {
    if (exercise.movement_pattern === 'core_activation' || exercise.movement_pattern === 'spinal_stability') {
      score += 1.5;
    } else if (exercise.movement_pattern === 'anti_rotation') score += 1.25;
  } else if (slot.kind === 'glute' || slot.kind === 'legs' || slot.kind === 'pull') {
    const patternIndex = patterns.indexOf(exercise.movement_pattern);
    if (patternIndex === 0) score += 1.5;
    else if (patternIndex === 1) score += 1.25;
  } else {
    const patternIndex = patterns.indexOf(exercise.movement_pattern);
    if (patternIndex === 0) score += 2;
    else if (patternIndex === 1) score += 1;
  }

  if (slot.kind === 'prep' || slot.kind === 'mobility' || slot.kind === 'cooldown') {
    if (profile.bias === 'flexion_sensitive' && detail.spine_bias === 'extension') score += 1.5;
    else if (profile.bias === 'extension_sensitive' && detail.spine_bias === 'flexion') score += 1.5;
    else if (detail.spine_bias === 'neutral') score += 0.75;
  }

  let overlap = 0;
  const targets = new Set(profile.functionTargets);
  for (const targetName of detail.function_targets) {
    if (targets.has(targetName as (typeof profile.functionTargets)[number])) overlap += 1;
  }
  score += Math.min(1.5, overlap * 0.75);

  const desired = Math.min(target, ceiling);
  score += 1 - Math.abs(exercise.intensity_tier - desired) / 3;

  let goalScore = 0;
  answers.main_goal.forEach((goal, index) => {
    const weight = exercise.goals_weight[goal] ?? 0;
    goalScore = Math.max(goalScore, weight * (index === 0 ? 1 : 0.7));
  });
  score += goalScore;

  if (intersects(exercise.triggers_addressed, answers.pain_trigger)) score += 0.75;
  score += (0.25 * exercise.effectiveness) / 5 + (0.15 * exercise.usefulness) / 5;
  if (
    profile.unilateralFocus &&
    detail.per_side &&
    (slot.kind === 'control' || slot.kind === 'glute' || slot.kind === 'hinge' || slot.kind === 'legs')
  ) {
    score += 0.75;
  }
  const alreadyThisWeek = weekUsed.get(exercise.id) ?? 0;
  if (alreadyThisWeek > 0) score -= (slot.kind === 'prep' ? 0.25 : 1) * alreadyThisWeek;
  if (column === 'high') score -= (0.5 * exercise.fatigue_cost) / 5;
  return score;
}

function betterCandidate(
  left: { exercise: CatalogExercise; score: number },
  right: { exercise: CatalogExercise; score: number },
): boolean {
  if (left.score !== right.score) return left.score > right.score;
  if (left.exercise.intensity_tier !== right.exercise.intensity_tier) {
    return left.exercise.intensity_tier < right.exercise.intensity_tier;
  }
  return left.exercise.id < right.exercise.id;
}

function nearestFive(value: number, floor: number): number {
  return Math.max(floor, Math.round(value / 5) * 5);
}

function secPerRep(doseClass: DoseClass): number {
  if (doseClass === 'motor_control' || doseClass === 'loaded_strength') return 5;
  return 4;
}

function doseExercise(
  exercise: CatalogExercise,
  detail: ExerciseDetail,
  column: DoseColumn,
  weeksHeld: number,
  week: number,
  level: number,
  answers: Answers,
  profile: ClinicalProfile,
  intake: Intake,
): Omit<ResolvedExercise, 'order_index' | 'exercise_id'> {
  const baseSets = exercise.sets ?? 2;
  const p = Math.min(weeksHeld, 3);
  let sets = baseSets;
  if (column === 'high') sets = Math.max(1, baseSets - 1);
  if (intake.age_band === '70p' && week <= 2) sets = Math.min(sets, 2);
  sets = clamp(sets, 1, 4);

  let reps: number | null = null;
  if (exercise.reps != null) {
    let factor =
      column === 'high' ? 0.6 : column === 'moderate' ? Math.min(1, 0.85 + 0.05 * p) : Math.min(1.25, 1 + 0.08 * p);
    if (VOLUME_CLASSES.has(detail.dose_class)) {
      if (answers.activity_level === 'sedentary') factor *= 0.9;
      factor *= 1 + 0.1 * level;
    }
    const floor = exercise.duration_seconds != null ? 3 : 4;
    reps = Math.max(floor, Math.round(exercise.reps * factor));
    const cap = REP_CAP[detail.dose_class];
    if (cap != null) reps = Math.min(reps, cap);
  }

  let duration: number | null = null;
  if (detail.dose_class === 'isometric_core' && exercise.duration_seconds != null) {
    duration = Math.min(10, exercise.duration_seconds);
    if (reps == null) {
      const factor =
        column === 'high' ? 0.6 : column === 'moderate' ? Math.min(1, 0.85 + 0.05 * p) : Math.min(1.25, 1 + 0.08 * p);
      const implied = Math.max(1, Math.round(exercise.duration_seconds / duration));
      reps = Math.max(3, Math.round(implied * factor));
    }
  } else if (exercise.duration_seconds != null && exercise.reps != null) {
    if (column === 'high') duration = Math.min(exercise.duration_seconds, 5);
    else if (column === 'moderate') duration = Math.min(exercise.duration_seconds, 10, 8 + p);
    else duration = Math.min(exercise.duration_seconds, 10);
    duration = Math.min(10, Math.max(1, Math.round(duration)));
  } else if (exercise.duration_seconds != null) {
    const base = exercise.duration_seconds;
    let seconds: number;
    if (column === 'high') seconds = Math.max(15, base * 0.5);
    else if (column === 'moderate') seconds = Math.min(base, base * (0.75 + 0.08 * p));
    else seconds = Math.min(45, base * (1 + 0.05 * p));
    duration = nearestFive(seconds, 10);
  }

  let rest = column === 'high' ? Math.min(90, exercise.rest_seconds + 15) : exercise.rest_seconds;
  if (profile.flags.fibromyalgia) rest += 15;
  rest = Math.min(120, nearestFive(rest, 10));

  let load = clamp(1 + stepsReached(LOAD_STEP_WEEKS, week) + level, 1, 5);
  if (profile.loadCap === 'bodyweight') load = 1;
  else if (profile.loadCap === 'light') load = Math.min(load, 3);

  return {
    sets,
    reps,
    duration_seconds: duration,
    rest_seconds: rest,
    load_tier: load,
  };
}

function exerciseSeconds(
  detail: ExerciseDetail,
  dose: { sets: number | null; reps: number | null; duration_seconds: number | null; rest_seconds: number },
): number {
  const sets = dose.sets ?? 1;
  let work = 0;
  if (dose.reps != null && dose.duration_seconds != null) work = dose.reps * (dose.duration_seconds + 3);
  else if (dose.reps != null) work = dose.reps * secPerRep(detail.dose_class);
  else work = dose.duration_seconds ?? 0;
  if (detail.per_side) work *= 2;
  return sets * work + Math.max(0, sets - 1) * dose.rest_seconds + 30;
}

interface PatternProgress {
  tier: number;
  weeks: Set<number>;
}

interface EngineState {
  profile: ClinicalProfile;
  answers: Answers;
  intake: Intake;
  level: number;
  catalog: CatalogExercise[];
  detailById: ReadonlyMap<string, ExerciseDetail>;
  byExerciseId: ReadonlyMap<string, CatalogExercise>;
  patterns: Map<string, PatternProgress>;
}

function candidatesFor(
  state: EngineState,
  slot: RecipeSlot,
  patterns: readonly string[],
  ceiling: number,
  target: number,
  column: DoseColumn,
  week: number,
  used: ReadonlySet<string>,
  weekUsed: ReadonlyMap<string, number>,
): { exercise: CatalogExercise; detail: ExerciseDetail; score: number }[] {
  const found: { exercise: CatalogExercise; detail: ExerciseDetail; score: number }[] = [];
  for (const exercise of state.catalog) {
    const detail = detailFor(exercise, state.detailById);
    if (!passes(exercise, detail, patterns, ceiling, used, state.answers, state.profile, week)) continue;
    found.push({
      exercise,
      detail,
      score: scoreExercise(
        exercise,
        detail,
        slot,
        patterns,
        target,
        ceiling,
        column,
        weekUsed,
        state.answers,
        state.profile,
      ),
    });
  }
  found.sort((left, right) => (betterCandidate(left, right) ? -1 : betterCandidate(right, left) ? 1 : 0));
  return found;
}

function lowestEligibleTier(state: EngineState, pattern: string, ceiling: number, week: number): number | null {
  let lowest: number | null = null;
  for (const exercise of state.catalog) {
    if (exercise.movement_pattern !== pattern || exercise.intensity_tier > ceiling) continue;
    const detail = detailFor(exercise, state.detailById);
    if (!equipmentOk(exercise, state.answers, state.profile)) continue;
    if (!areaOk(exercise, state.answers.pain_location)) continue;
    if (!contraOk(detail, state.profile, week)) continue;
    if (lowest === null || exercise.intensity_tier < lowest) lowest = exercise.intensity_tier;
  }
  return lowest;
}

function tierCapFor(
  state: EngineState,
  pattern: string,
  ceiling: number,
  week: number,
  target: number,
): number {
  const lowest = lowestEligibleTier(state, pattern, ceiling, week);
  if (lowest === null) return 0;
  const progress = state.patterns.get(pattern);
  if (!progress) return Math.min(ceiling, lowest + state.profile.capacity - 1);
  if (progress.weeks.size >= 2 && target > progress.tier) return Math.min(ceiling, progress.tier + 1);
  return Math.min(ceiling, progress.tier);
}

function allowedByLadder(
  state: EngineState,
  slot: RecipeSlot,
  exercise: CatalogExercise,
  ceiling: number,
  week: number,
  target: number,
): boolean {
  if (!WORK_SLOTS.has(slot.kind) || !LADDER_PATTERNS.has(exercise.movement_pattern)) return true;
  return exercise.intensity_tier <= tierCapFor(state, exercise.movement_pattern, ceiling, week, target);
}

function chooseSlot(
  state: EngineState,
  slot: RecipeSlot,
  held: ReadonlyMap<string, HeldState>,
  column: DoseColumn,
  target: number,
  week: number,
  used: ReadonlySet<string>,
  lockedBy: ReadonlyMap<string, string>,
  weekUsed: ReadonlyMap<string, number>,
  fallbackPatterns: readonly string[],
): FilledSlot | null {
  const ceiling = slotCeiling(slot.kind, target, state.profile);
  const withinLadder = (candidate: { exercise: CatalogExercise }) =>
    allowedByLadder(state, slot, candidate.exercise, ceiling, week, target);
  const primary = candidatesFor(
    state,
    slot,
    slot.patterns,
    ceiling,
    target,
    column,
    week,
    used,
    weekUsed,
  ).filter(withinLadder);
  const previous = held.get(slot.key);
  const previousExercise = previous ? state.byExerciseId.get(previous.exerciseId) : undefined;
  const previousDetail = previousExercise ? detailFor(previousExercise, state.detailById) : undefined;
  const coreOk =
    previous != null &&
    previousExercise != null &&
    previousDetail != null &&
    passes(
      previousExercise,
      previousDetail,
      null,
      ceiling,
      used,
      state.answers,
      state.profile,
      week,
      previous.exerciseId,
    );
  const patternOk = previousExercise != null && slot.patterns.includes(previousExercise.movement_pattern);
  const ladderOk =
    previousExercise == null || allowedByLadder(state, slot, previousExercise, ceiling, week, target);
  // A fallback fill is not in the slot's own patterns, so rule 2 would drop it
  // every week and the slot would churn. Keep it until it has been held twice,
  // then allow a real pattern match to take over.
  // Two slots can carry the same exercise from different weeks. Only the slot
  // that locked it this session keeps it.
  const owner = previous ? lockedBy.get(previous.exerciseId) : undefined;
  const previousStillFits =
    owner === slot.key &&
    coreOk &&
    ladderOk &&
    (patternOk || (previous != null && previous.weeksHeld < 2));

  let chosen: { exercise: CatalogExercise; detail: ExerciseDetail } | null = null;
  let weeksHeld = 0;

  if (previousStillFits && previous && previousExercise && previousDetail) {
    const stepTier =
      WORK_SLOTS.has(slot.kind) &&
      previous.weeksHeld >= 1 &&
      previousExercise.intensity_tier <
        tierCapFor(state, previousExercise.movement_pattern, ceiling, week, target)
        ? previousExercise.intensity_tier + 1
        : null;
    let progressed: { exercise: CatalogExercise; detail: ExerciseDetail; score: number } | null = null;
    if (stepTier !== null) {
      for (const candidate of primary) {
        if (candidate.exercise.movement_pattern !== previousExercise.movement_pattern) continue;
        if (candidate.exercise.intensity_tier !== stepTier) continue;
        if (!progressed || betterCandidate(candidate, progressed)) progressed = candidate;
      }
    }
    // At its ceiling, an exercise held for ROTATE_AFTER_WEEKS gives way to the
    // best other fit for the slot, never an easier tier.
    const rotated =
      !progressed && previous.weeksHeld + 1 >= ROTATE_AFTER_WEEKS
        ? primary.find((candidate) => candidate.exercise.intensity_tier >= previousExercise.intensity_tier)
        : undefined;
    if (progressed) {
      chosen = progressed;
      weeksHeld = 0;
    } else if (rotated) {
      chosen = rotated;
      weeksHeld = 0;
    } else {
      chosen = { exercise: previousExercise, detail: previousDetail };
      weeksHeld = previous.weeksHeld + 1;
    }
  } else {
    const controlPool = candidatesFor(
      state,
      slot,
      CONTROL_PATTERNS,
      ceiling,
      target,
      column,
      week,
      used,
      weekUsed,
    ).filter(withinLadder);
    const mobilityPool = candidatesFor(
      state,
      slot,
      fallbackPatterns,
      ceiling,
      target,
      column,
      week,
      used,
      weekUsed,
    ).filter(withinLadder);
    const pool = primary.length > 0 ? primary : controlPool.length > 0 ? controlPool : mobilityPool;
    const best = pool[0];
    if (!best) return null;
    chosen = best;
    weeksHeld = 0;
  }

  const dose = doseExercise(
    chosen.exercise,
    chosen.detail,
    column,
    weeksHeld,
    week,
    state.level,
    state.answers,
    state.profile,
    state.intake,
  );
  return {
    slot,
    exercise: chosen.exercise,
    detail: chosen.detail,
    weeksHeld,
    sets: dose.sets ?? 1,
    reps: dose.reps,
    duration_seconds: dose.duration_seconds,
    rest_seconds: dose.rest_seconds,
    load_tier: dose.load_tier,
  };
}

function evaluateSession(
  state: EngineState,
  slots: readonly RecipeSlot[],
  held: ReadonlyMap<string, HeldState>,
  column: DoseColumn,
  target: number,
  week: number,
  weekUsed: ReadonlyMap<string, number>,
  fallbackPatterns: readonly string[],
): { filled: FilledSlot[]; minutes: number; empty: SlotKind[] } {
  const ordered = [...slots].sort((a, b) => a.priorityIndex - b.priorityIndex);
  const used = new Set<string>();
  const lockedBy = new Map<string, string>();
  // Lock every slot's current exercise before anyone picks a new one, so an
  // earlier slot cannot steal the exercise a later slot is already holding.
  for (const slot of ordered) {
    const previous = held.get(slot.key);
    if (!previous || used.has(previous.exerciseId)) continue;
    const exercise = state.byExerciseId.get(previous.exerciseId);
    if (!exercise) continue;
    const detail = detailFor(exercise, state.detailById);
    const ceiling = slotCeiling(slot.kind, target, state.profile);
    const coreOk = passes(
      exercise,
      detail,
      null,
      ceiling,
      used,
      state.answers,
      state.profile,
      week,
      previous.exerciseId,
    );
    const patternOk = slot.patterns.includes(exercise.movement_pattern);
    const ladderOk = allowedByLadder(state, slot, exercise, ceiling, week, target);
    if (coreOk && ladderOk && (patternOk || previous.weeksHeld < 2)) {
      used.add(previous.exerciseId);
      lockedBy.set(previous.exerciseId, slot.key);
    }
  }
  const filled: FilledSlot[] = [];
  const empty: SlotKind[] = [];
  for (const slot of ordered) {
    const pick = chooseSlot(
      state,
      slot,
      held,
      column,
      target,
      week,
      used,
      lockedBy,
      weekUsed,
      fallbackPatterns,
    );
    if (!pick) {
      empty.push(slot.kind);
      continue;
    }
    used.add(pick.exercise.id);
    filled.push(pick);
  }
  const seconds = filled.reduce(
    (sum, item) =>
      sum +
      exerciseSeconds(item.detail, {
        sets: item.sets,
        reps: item.reps,
        duration_seconds: item.duration_seconds,
        rest_seconds: item.rest_seconds,
      }),
    0,
  );
  return { filled, minutes: Math.max(5, Math.round(seconds / 60)), empty };
}

function fitSession(
  state: EngineState,
  recipe: readonly RecipeSlot[],
  held: ReadonlyMap<string, HeldState>,
  column: DoseColumn,
  target: number,
  week: number,
  weekUsed: ReadonlyMap<string, number>,
  fallbackPatterns: readonly string[],
): { chosen: RecipeSlot[]; result: ReturnType<typeof evaluateSession> } {
  const budget = state.intake.minutes;
  const baseCount = budget === 15 ? 4 : budget === 20 ? 5 : 6;
  const sessionCap = 6;
  const n0 = clamp(
    baseCount + state.profile.slotDelta - (column === 'high' ? 1 : 0),
    3,
    sessionCap,
  );
  let chosen = recipe.slice(0, Math.min(n0, recipe.length));

  const run = (slots: readonly RecipeSlot[]) =>
    evaluateSession(state, slots, held, column, target, week, weekUsed, fallbackPatterns);

  const minutesOf = (filled: readonly FilledSlot[]) => {
    const seconds = filled.reduce((sum, item) => sum + exerciseSeconds(item.detail, item), 0);
    return Math.max(5, Math.round(seconds / 60));
  };

  while (run(chosen).filled.length < 3) {
    const next = recipe.find((slot) => !chosen.some((item) => item.priorityIndex === slot.priorityIndex));
    if (!next) break;
    chosen = [...chosen, next];
  }

  let result = run(chosen);
  while (result.minutes > budget + 3 && result.filled.length > 3) {
    const lowest = result.filled.reduce((best, item) =>
      item.slot.priorityIndex > best.slot.priorityIndex ? item : best,
    );
    chosen = chosen.filter((slot) => slot.priorityIndex !== lowest.slot.priorityIndex);
    result = run(chosen);
  }

  while (result.minutes < budget - 6 && result.filled.length < sessionCap) {
    const next = recipe.find((slot) => !chosen.some((item) => item.priorityIndex === slot.priorityIndex));
    if (!next) break;
    const trial = [...chosen, next];
    const trialResult = run(trial);
    if (trialResult.minutes > budget + 3) break;
    chosen = trial;
    result = trialResult;
  }

  const setsCapped = state.intake.age_band === '70p' && week <= 2;
  if (result.minutes < budget - 6) {
    let grew = true;
    while (grew && result.minutes < budget - 6) {
      grew = false;
      for (const doseClass of SET_FILL_ORDER) {
        for (const item of result.filled) {
          if (item.detail.dose_class !== doseClass || item.sets >= 4) continue;
          if (setsCapped && item.sets >= 2) continue;
          item.sets += 1;
          const minutes = minutesOf(result.filled);
          if (minutes > budget + 3) {
            item.sets -= 1;
            continue;
          }
          result = { ...result, minutes };
          grew = true;
          if (result.minutes >= budget - 6) break;
        }
        if (result.minutes >= budget - 6) break;
      }
    }
  }

  if (column === 'low' && week >= EXTRA_SET_WEEK) {
    for (const item of result.filled) {
      const baseSets = item.exercise.sets ?? 2;
      if (item.weeksHeld < 2 || baseSets > 3 || item.sets !== baseSets || item.sets >= 4) continue;
      if (setsCapped && item.sets >= 2) continue;
      if (
        item.detail.dose_class !== 'strength_endurance' &&
        item.detail.dose_class !== 'loaded_strength'
      ) {
        continue;
      }
      item.sets += 1;
      const minutes = minutesOf(result.filled);
      if (minutes > budget + 3) item.sets -= 1;
      else result = { ...result, minutes };
    }
  }

  while (result.minutes > budget + 6) {
    const longest = result.filled.reduce((best, item) =>
      exerciseSeconds(item.detail, item) > exerciseSeconds(best.detail, best) ? item : best,
    );
    if (longest.sets <= 1) break;
    const before = result.minutes;
    longest.sets -= 1;
    const minutes = minutesOf(result.filled);
    if (minutes >= before) {
      longest.sets += 1;
      break;
    }
    result = { ...result, minutes };
  }

  return { chosen, result };
}

function emptyRecord(): Record<SlotKind, number> {
  return {
    prep: 0,
    mobility: 0,
    control: 0,
    glute: 0,
    hinge: 0,
    legs: 0,
    pull: 0,
    cooldown: 0,
  };
}

export function inspectPlanV2(input: BuildPlanV2Input): PlanInspection {
  const profile = deriveProfile(input.answers, input.intake);
  const level = clampProgressionLevel(input.progressionLevel);
  const durationWeeks = programWeeks(input.answers, input.intake, profile);
  let startWeek = input.startWeek ?? 1;
  if (startWeek > durationWeeks) startWeek = 1;
  const sessionsPerWeek = sessionsPerWeekOf(input.answers);
  const catalog = [...input.exercises].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const detailById = new Map(input.details.map((detail) => [detail.exercise_id, detail]));
  const byExerciseId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const state: EngineState = {
    profile,
    answers: input.answers,
    intake: input.intake,
    level,
    catalog,
    detailById,
    byExerciseId,
    patterns: new Map(),
  };
  const held = new Map<string, HeldState>();
  const sessions: ResolvedSession[] = [];
  const emptyByKind = emptyRecord();
  const holds: { key: string; week: number; exerciseId: string }[] = [];

  for (let week = 1; week <= durationWeeks; week++) {
    const column = columnFor(week, profile, input.intake);
    const mode = modeForWeek(week, profile);
    const target = targetTierFor(week, profile, level);
    const fallbackPatterns = unique([
      ...patternsFor('prep', profile, input.answers, column),
      ...patternsFor('mobility', profile, input.answers, column),
    ]);
    const types = ROTATION[mode].slice(0, sessionsPerWeek);
    const typeCount: Partial<Record<SessionType, number>> = {};
    const weekUsed = new Map<string, number>();
    const weekUses: { pattern: string; tier: number }[] = [];
    types.forEach((type, sessionIndex) => {
      const typeOccurrence = typeCount[type] ?? 0;
      typeCount[type] = typeOccurrence + 1;
      const recipe = recipeFor(type, typeOccurrence, week, mode, column, profile, input.answers);
      const fitted = fitSession(
        state,
        recipe,
        held,
        column,
        target,
        week,
        weekUsed,
        fallbackPatterns,
      );
      for (const kind of fitted.result.empty) emptyByKind[kind] += 1;
      for (const item of fitted.result.filled) {
        held.set(item.slot.key, {
          exerciseId: item.exercise.id,
          tier: item.exercise.intensity_tier,
          weeksHeld: item.weeksHeld,
        });
        weekUsed.set(item.exercise.id, (weekUsed.get(item.exercise.id) ?? 0) + 1);
        holds.push({ key: item.slot.key, week, exerciseId: item.exercise.id });
        if (LADDER_PATTERNS.has(item.exercise.movement_pattern)) {
          weekUses.push({ pattern: item.exercise.movement_pattern, tier: item.exercise.intensity_tier });
        }
      }
      if (week < startWeek) return;
      const shown = [...fitted.result.filled].sort((a, b) => {
        const order = DISPLAY_ORDER.indexOf(a.slot.kind) - DISPLAY_ORDER.indexOf(b.slot.kind);
        if (order !== 0) return order;
        return a.slot.priorityIndex - b.slot.priorityIndex;
      });
      let maxTier = 1;
      const exercises: ResolvedExercise[] = shown.map((item, index) => {
        maxTier = Math.max(maxTier, item.exercise.intensity_tier);
        return {
          exercise_id: item.exercise.id,
          order_index: index + 1,
          sets: item.sets,
          reps: item.reps,
          duration_seconds: item.duration_seconds,
          rest_seconds: item.rest_seconds,
          load_tier: item.load_tier,
        };
      });
      const meta = SESSION_META[type];
      sessions.push({
        week_number: week,
        session_number: sessionIndex + 1,
        title: `${TITLE_AREA[input.answers.pain_location]} ${meta.suffix}`,
        phase: meta.phase,
        estimated_minutes: fitted.result.minutes,
        intensity_tier: clamp(shown.length === 0 ? 1 : maxTier, 1, 5),
        exercises,
      });
    });
    for (const use of weekUses) {
      const progress = state.patterns.get(use.pattern) ?? { tier: 0, weeks: new Set<number>() };
      if (progress.tier === 0 || use.tier > progress.tier) {
        progress.tier = use.tier;
        progress.weeks = new Set([week]);
      } else if (use.tier === progress.tier) {
        progress.weeks.add(week);
      }
      state.patterns.set(use.pattern, progress);
    }
  }

  const naming = buildNaming(input.answers, LIVE_NAMING);
  const plan: ResolvedPlan = {
    program_name: naming.name,
    subtitle: naming.subtitle,
    tagline: naming.tagline,
    duration_weeks: durationWeeks,
    sessions_per_week: sessionsPerWeek,
    start_week: startWeek,
    rules_version: 2,
    primary_focus: input.answers.pain_location,
    secondary_focus: input.answers.main_goal[0] ?? 'reduce_pain',
    sessions,
  };
  const weeks: PlanOutlineWeek[] = [];
  for (let week = startWeek; week <= durationWeeks; week++) {
    const column = columnFor(week, profile, input.intake);
    const mode = modeForWeek(week, profile);
    const target = targetTierFor(week, profile, level);
    const weekSessions = sessions.filter((session) => session.week_number === week);
    const minuteSum = weekSessions.reduce((sum, session) => sum + session.estimated_minutes, 0);
    const exerciseCount = weekSessions.reduce((sum, session) => sum + session.exercises.length, 0);
    weeks.push({
      week,
      mode,
      column,
      target_tier: target,
      sessions: weekSessions.length,
      avg_minutes: weekSessions.length === 0 ? 0 : Math.round(minuteSum / weekSessions.length),
      exercise_count: exerciseCount,
    });
  }
  const uniqueExercises = new Set<string>();
  for (const session of sessions) {
    for (const exercise of session.exercises) uniqueExercises.add(exercise.exercise_id);
  }
  return {
    plan,
    outline: {
      weeks,
      total_sessions: sessions.length,
      unique_exercises: uniqueExercises.size,
    },
    profile,
    emptyByKind,
    holds,
  };
}

export function buildPlanV2(input: BuildPlanV2Input): ResolvedPlan {
  return inspectPlanV2(input).plan;
}

export function planOutline(input: BuildPlanV2Input): PlanOutline {
  return inspectPlanV2(input).outline;
}

export function buildPlanWithFallback(args: {
  intake: Intake | null;
  details: ExerciseDetail[];
  input: Omit<BuildPlanV2Input, 'intake' | 'details'>;
  buildV1: () => ResolvedPlan;
}): { plan: ResolvedPlan; engine: 1 | 2; outline: PlanOutline | null; profile: ClinicalProfile | null } {
  if (args.intake && args.details.length > 0) {
    try {
      const inspected = inspectPlanV2({
        ...args.input,
        intake: args.intake,
        details: args.details,
      });
      return {
        plan: inspected.plan,
        engine: 2,
        outline: inspected.outline,
        profile: inspected.profile,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('engine_v2_failed', message);
    }
  }
  return { plan: args.buildV1(), engine: 1, outline: null, profile: null };
}

export function isDoseClass(value: string): value is DoseClass {
  return (DOSE_CLASSES as readonly string[]).includes(value);
}
