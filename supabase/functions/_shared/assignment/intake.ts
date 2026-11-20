/**
 * Mirror of lib/intake.ts — keep the rules in sync.
 * Deno edge functions cannot import from the app client tree.
 */
import { z } from 'https://esm.sh/zod@3.23.8';

export const INTAKE_VERSION = 1 as const;

export const HARD_NOW = [
  'bed',
  'bending',
  'stairs',
  'walking',
  'sitting',
  'standing',
  'twisting',
  'overhead',
  'sleep',
  'exercise',
] as const;
export const SPREAD = ['one_spot', 'one_side', 'moves', 'leg', 'unsure'] as const;
export const LEG_REACH = ['above_knee', 'below_knee', 'foot'] as const;
export const DURATION_DETAIL = ['lt_2w', '2w_3m', '3_12m', '1_5y', '5y_plus'] as const;
export const ONSET = ['injury', 'lifting', 'surgery', 'gradual', 'sudden', 'pregnancy', 'unsure'] as const;
export const MOVEMENT_FEEL = ['stiff', 'weak', 'unstable', 'uneven', 'unsafe', 'guarded'] as const;
export const RELIEF_DIRECTION = ['flexion', 'extension', 'neither'] as const;
export const FLARE_SETTLE = ['none', 'minutes', 'hours', 'day', 'days'] as const;
export const TREND = ['better', 'same', 'worse', 'up_down'] as const;
export const LIMITATION = ['none', 'little', 'some_days', 'most_days', 'a_lot', 'unsure'] as const;
export const NS_PREDICTABLE = ['yes', 'varies', 'no'] as const;
export const NS_LEVEL = ['no', 'sometimes', 'yes'] as const;
export const TRIED = ['doctor', 'pt', 'chiro', 'massage', 'acupuncture', 'medication', 'stretching', 'rest'] as const;
export const CONDITIONS = [
  'sciatica',
  'herniated_disc',
  'arthritis',
  'stenosis',
  'scoliosis',
  'fibromyalgia',
  'osteoporosis',
  'post_surgery',
  'postpartum',
  'pregnant',
] as const;
export const AGE_BAND = ['u30', '30_44', '45_59', '60_69', '70p'] as const;
export const SESSION_MINUTES = [15, 20, 30] as const;
export const RED_FLAGS = [
  'saddle_bladder',
  'leg_weakness',
  'fever_unwell',
  'trauma',
  'cancer_history',
  'weight_loss',
  'surgery_uncleared',
] as const;

const LEGACY_TRIGGER_ORDER = ['sitting', 'bending', 'standing', 'morning', 'exercise', 'other'] as const;

export type PainTrigger = (typeof LEGACY_TRIGGER_ORDER)[number];
export type DurationBucket = 'acute' | 'subacute' | 'chronic';

export type LegacyAnswers = {
  pain_location: 'upper' | 'lower' | 'all';
  pain_duration: DurationBucket;
  pain_type: readonly ('stiffness' | 'ache' | 'sharp' | 'nerve')[];
  activity_level: 'sedentary' | 'light' | 'active' | 'athlete';
  pain_trigger: readonly PainTrigger[];
  equipment: 'open_space' | 'bands_dumbbells' | 'gym';
  main_goal: readonly ('reduce_pain' | 'return_to_exercise' | 'sleep' | 'mobility')[];
  sessions_per_week_preference: number | null;
};

export const intakeSchema = z
  .object({
    v: z.literal(1),
    hard_now: z.array(z.enum(HARD_NOW)).max(10),
    spread: z.enum(SPREAD),
    leg_reach: z.enum(LEG_REACH).nullable(),
    duration_detail: z.enum(DURATION_DETAIL),
    onset: z.enum(ONSET),
    intensity: z.number().int().min(0).max(10),
    movement_feel: z.array(z.enum(MOVEMENT_FEEL)).max(6),
    relief_direction: z.enum(RELIEF_DIRECTION),
    flare_settle: z.enum(FLARE_SETTLE),
    trend: z.enum(TREND),
    limitation: z.enum(LIMITATION),
    ns: z
      .object({
        predictable: z.enum(NS_PREDICTABLE),
        small_triggers: z.enum(NS_LEVEL),
        stress: z.enum(NS_LEVEL),
        anticipation: z.enum(NS_LEVEL),
        avoidance: z.enum(NS_LEVEL),
      })
      .strict(),
    // No longer asked. A missing list normalizes to []. Older rows may still contain answers.
    tried: z.array(z.enum(TRIED)).max(8),
    conditions: z.array(z.enum(CONDITIONS)).max(10),
    age_band: z.enum(AGE_BAND),
    minutes: z.union([z.literal(15), z.literal(20), z.literal(30)]),
    red_flags: z.array(z.enum(RED_FLAGS)).max(7),
    red_flag_ack: z.boolean(),
  })
  .strict();

export type Intake = z.infer<typeof intakeSchema>;

export type Irritability = 'low' | 'moderate' | 'high';
export type Bias = 'flexion_sensitive' | 'extension_sensitive' | 'neutral';
export type Level3 = 'low' | 'some' | 'high';
export type Mode = 'calm' | 'control' | 'build';
export type AvoidTag =
  | 'flexion_endrange'
  | 'flexion_loaded'
  | 'extension_endrange'
  | 'extension_loaded'
  | 'rotation_endrange'
  | 'rotation_loaded'
  | 'neural_tension'
  | 'prone'
  | 'high_iap'
  | 'balance_challenge';
export type FunctionTarget = (typeof HARD_NOW)[number];
export type LoadCap = 'bodyweight' | 'light' | 'full';

export type ClinicalProfile = {
  irritability: Irritability;
  irritabilityScore: number;
  bias: Bias;
  biasStrength: 'clear' | 'lean' | 'none';
  sensitization: Level3;
  nsScore: number;
  fear: Level3;
  radicular: 'none' | 'referred' | 'below_knee';
  mode: Mode;
  emphasis: { mobility: number; control: number; strength: number; relaxation: number };
  exposureBending: boolean;
  unilateralFocus: boolean;
  functionTargets: FunctionTarget[];
  avoid: AvoidTag[];
  avoidEarly: AvoidTag[];
  earlyWeeks: number;
  gentleStart: boolean;
  loadCap: LoadCap;
  capacity: 1 | 2 | 3;
  tierCap: number;
  slotDelta: -1 | 0;
  flags: {
    redFlag: boolean;
    clinicianFirst: boolean;
    postSurgery: boolean;
    pregnant: boolean;
    postpartum: boolean;
    osteoporosis: boolean;
    fibromyalgia: boolean;
    olderAdult: boolean;
  };
};

const AVOID_ORDER: readonly AvoidTag[] = [
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
];

const NS_LEVEL_POINTS: Record<(typeof NS_LEVEL)[number], number> = {
  no: 0,
  sometimes: 1,
  yes: 2,
};

const PREDICTABLE_POINTS: Record<(typeof NS_PREDICTABLE)[number], number> = {
  yes: 0,
  varies: 1,
  no: 2,
};

function has<T extends string>(values: readonly T[], item: T): boolean {
  return values.includes(item);
}

function isListed<T extends string>(order: readonly T[], item: unknown): item is T {
  return typeof item === 'string' && order.some((entry) => entry === item);
}

function isLongDuration(detail: (typeof DURATION_DETAIL)[number]): boolean {
  return detail === '3_12m' || detail === '1_5y' || detail === '5y_plus';
}

function canonicalList<T extends string>(value: unknown, order: readonly T[]): unknown {
  if (!Array.isArray(value)) return value;
  const rank = new Map<string, number>(order.map((item, index) => [item, index]));
  const seen = new Set<string>();
  const known: T[] = [];
  const unknown: unknown[] = [];
  for (const item of value) {
    const key = typeof item === 'string' ? item : JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    if (isListed(order, item)) known.push(item);
    else unknown.push(item);
  }
  known.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
  return [...known, ...unknown];
}

function inOrder<T extends string>(order: readonly T[], selected: ReadonlySet<T>): T[] {
  return order.filter((item) => selected.has(item));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function fromThousandths(millis: number): number {
  return Number((millis / 1000).toFixed(3));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Dedupe and canonically sort intake arrays, then validate.
 * `leg_reach` stays when spread is leg, pain type includes nerve, or sciatica
 * is selected. Those are the cases that show the leg question.
 */
export function normalizeIntake(partial: unknown, painType: readonly string[] = []): Intake | null {
  if (partial === null || typeof partial !== 'object' || Array.isArray(partial)) return null;
  const src = partial as Record<string, unknown>;
  const next: Record<string, unknown> = { ...src };
  next.hard_now = canonicalList(src.hard_now, HARD_NOW);
  next.movement_feel = canonicalList(src.movement_feel, MOVEMENT_FEEL);
  next.tried = src.tried === undefined ? [] : canonicalList(src.tried, TRIED);
  next.conditions = canonicalList(src.conditions, CONDITIONS);
  next.red_flags = canonicalList(src.red_flags, RED_FLAGS);
  const keepsLegReach =
    src.spread === 'leg' ||
    painType.includes('nerve') ||
    (Array.isArray(next.conditions) && next.conditions.includes('sciatica'));
  if (!keepsLegReach) next.leg_reach = null;
  const parsed = intakeSchema.safeParse(next);
  return parsed.success ? parsed.data : null;
}

export function deriveLegacyTriggers(hardNow: readonly string[]): PainTrigger[] {
  const mapped = new Set<PainTrigger>();
  for (const item of hardNow) {
    if (item === 'sitting') mapped.add('sitting');
    else if (item === 'bending') mapped.add('bending');
    else if (item === 'standing' || item === 'walking') mapped.add('standing');
    else if (item === 'bed') mapped.add('morning');
    else if (item === 'exercise') mapped.add('exercise');
  }
  if (mapped.size === 0) return ['other'];
  return LEGACY_TRIGGER_ORDER.filter((trigger) => mapped.has(trigger));
}

export function durationBucketFor(detail: (typeof DURATION_DETAIL)[number]): DurationBucket {
  if (detail === 'lt_2w') return 'acute';
  if (detail === '2w_3m') return 'subacute';
  return 'chronic';
}

export function isLegLike(
  painType: readonly string[],
  spread: string | undefined,
  conditions?: readonly string[],
): boolean {
  return spread === 'leg' || painType.includes('nerve') || (conditions?.includes('sciatica') ?? false);
}

export function nsScoreOf(
  ns: {
    predictable: (typeof NS_PREDICTABLE)[number];
    small_triggers: (typeof NS_LEVEL)[number];
    stress: (typeof NS_LEVEL)[number];
    anticipation: (typeof NS_LEVEL)[number];
    avoidance: (typeof NS_LEVEL)[number];
  },
  spread: string,
): number {
  const score =
    PREDICTABLE_POINTS[ns.predictable] +
    NS_LEVEL_POINTS[ns.small_triggers] +
    NS_LEVEL_POINTS[ns.stress] +
    NS_LEVEL_POINTS[ns.anticipation] +
    NS_LEVEL_POINTS[ns.avoidance] +
    (spread === 'moves' ? 1 : 0);
  return clamp(score, 0, 10);
}

function intensityPoints(intensity: number): number {
  if (intensity <= 3) return 0;
  if (intensity <= 5) return 1;
  if (intensity <= 7) return 2;
  return 3;
}

function flarePoints(flare: Intake['flare_settle']): number {
  if (flare === 'hours') return 1;
  if (flare === 'day') return 2;
  if (flare === 'days') return 3;
  return 0;
}

function limitationPoints(limitation: Intake['limitation']): number {
  if (limitation === 'some_days') return 0.5;
  if (limitation === 'most_days') return 1;
  if (limitation === 'a_lot') return 1.5;
  return 0;
}

function irritabilityOf(answers: LegacyAnswers, intake: Intake): { level: Irritability; score: number } {
  let score = intensityPoints(intake.intensity);
  score += flarePoints(intake.flare_settle);
  score += NS_LEVEL_POINTS[intake.ns.small_triggers];
  score += limitationPoints(intake.limitation);
  if (intake.trend === 'worse') score += 1;
  else if (intake.trend === 'better') score -= 0.5;
  if (has(answers.pain_type, 'sharp')) score += 0.5;
  if (has(answers.pain_type, 'nerve')) score += 0.5;
  if (intake.duration_detail === 'lt_2w') score += 1;
  const rounded = round1(clamp(score, 0, 10));
  const level: Irritability = rounded >= 6.5 ? 'high' : rounded >= 3 ? 'moderate' : 'low';
  return { level, score: rounded };
}

function fearOf(intake: Intake): Level3 {
  let points = NS_LEVEL_POINTS[intake.ns.avoidance];
  if (has(intake.movement_feel, 'unsafe')) points += 2;
  if (has(intake.movement_feel, 'guarded')) points += 1;
  if (intake.ns.anticipation === 'yes') points += 1;
  if (points >= 3) return 'high';
  if (points >= 1) return 'some';
  return 'low';
}

function biasOf(
  intake: Intake,
  sensitization: Level3,
): { bias: Bias; biasStrength: ClinicalProfile['biasStrength'] } {
  let flexion = 0;
  if (has(intake.hard_now, 'sitting')) flexion += 1;
  if (has(intake.hard_now, 'bending')) flexion += 1;
  if (has(intake.hard_now, 'bed')) flexion += 0.5;
  if (intake.relief_direction === 'extension') flexion += 2;
  if (has(intake.conditions, 'herniated_disc')) flexion += 1;
  if (has(intake.conditions, 'sciatica')) flexion += 0.5;

  let extension = 0;
  if (has(intake.hard_now, 'standing')) extension += 1;
  if (has(intake.hard_now, 'walking')) extension += 1;
  if (has(intake.hard_now, 'overhead')) extension += 0.5;
  if (intake.relief_direction === 'flexion') extension += 2;
  if (has(intake.conditions, 'stenosis')) extension += 1.5;
  if (has(intake.conditions, 'arthritis')) extension += 0.5;
  if (intake.age_band === '60_69' || intake.age_band === '70p') extension += 0.5;

  const diff = flexion - extension;
  let bias: Bias = 'neutral';
  let biasStrength: ClinicalProfile['biasStrength'] = 'none';
  if (diff >= 2) {
    bias = 'flexion_sensitive';
    biasStrength = 'clear';
  } else if (diff >= 1) {
    bias = 'flexion_sensitive';
    biasStrength = 'lean';
  } else if (diff <= -2) {
    bias = 'extension_sensitive';
    biasStrength = 'clear';
  } else if (diff <= -1) {
    bias = 'extension_sensitive';
    biasStrength = 'lean';
  }

  if (sensitization === 'high' && intake.spread === 'moves' && biasStrength === 'lean') {
    return { bias: 'neutral', biasStrength: 'none' };
  }
  return { bias, biasStrength };
}

function emphasisOf(
  mode: Mode,
  intake: Intake,
  answers: LegacyAnswers,
  sensitization: Level3,
): ClinicalProfile['emphasis'] {
  const base = {
    calm: { mobility: 350, control: 350, strength: 50, relaxation: 250 },
    control: { mobility: 200, control: 450, strength: 250, relaxation: 100 },
    build: { mobility: 150, control: 300, strength: 500, relaxation: 50 },
  }[mode];

  let mobility = base.mobility;
  let control = base.control;
  let strength = base.strength;
  let relaxation = base.relaxation;

  if (has(intake.movement_feel, 'stiff')) mobility += 150;
  if (has(intake.movement_feel, 'weak')) strength += 150;
  if (has(intake.movement_feel, 'unstable')) control += 150;
  if (has(intake.movement_feel, 'uneven')) control += 100;
  if (has(intake.movement_feel, 'unsafe')) relaxation += 50;
  if (has(intake.movement_feel, 'guarded')) relaxation += 100;
  if (has(answers.main_goal, 'mobility')) mobility += 100;
  if (has(answers.main_goal, 'return_to_exercise')) strength += 150;
  if (has(answers.main_goal, 'sleep')) relaxation += 100;
  if (has(answers.main_goal, 'reduce_pain')) control += 50;
  if (sensitization === 'high') {
    relaxation += 150;
    strength -= 100;
  }

  mobility = Math.max(20, mobility);
  control = Math.max(20, control);
  strength = Math.max(20, strength);
  relaxation = Math.max(20, relaxation);

  const sum = mobility + control + strength + relaxation;
  const mobilityMillis = Math.round((mobility / sum) * 1000);
  const strengthMillis = Math.round((strength / sum) * 1000);
  const relaxationMillis = Math.round((relaxation / sum) * 1000);
  const controlMillis = 1000 - mobilityMillis - strengthMillis - relaxationMillis;

  return {
    mobility: fromThousandths(mobilityMillis),
    control: fromThousandths(controlMillis),
    strength: fromThousandths(strengthMillis),
    relaxation: fromThousandths(relaxationMillis),
  };
}

export function deriveProfile(answers: LegacyAnswers, intake: Intake): ClinicalProfile {
  const pregnant = has(intake.conditions, 'pregnant');
  const postSurgery = has(intake.conditions, 'post_surgery') || intake.onset === 'surgery';
  const postpartum = has(intake.conditions, 'postpartum') && !pregnant;
  const osteoporosis = has(intake.conditions, 'osteoporosis');
  const fibromyalgia = has(intake.conditions, 'fibromyalgia');
  const olderAdult = intake.age_band === '60_69' || intake.age_band === '70p';
  const redFlag = intake.red_flags.length > 0;

  const irritability = irritabilityOf(answers, intake);
  const nsScore = nsScoreOf(intake.ns, intake.spread);
  const sensitization: Level3 =
    (nsScore >= 6 && isLongDuration(intake.duration_detail)) || fibromyalgia
      ? 'high'
      : nsScore >= 3
        ? 'some'
        : 'low';
  const fear = fearOf(intake);
  const { bias, biasStrength } = biasOf(intake, sensitization);

  const legLike = isLegLike(answers.pain_type, intake.spread, intake.conditions);
  const radicular: ClinicalProfile['radicular'] = !legLike
    ? 'none'
    : intake.leg_reach === 'below_knee' || intake.leg_reach === 'foot'
      ? 'below_knee'
      : 'referred';

  const mode: Mode = irritability.level === 'high' ? 'calm' : irritability.level === 'moderate' ? 'control' : 'build';

  let capacity: 1 | 2 | 3 = 1;
  if (irritability.level === 'low') {
    const ready =
      (answers.activity_level === 'active' || answers.activity_level === 'athlete') &&
      (intake.limitation === 'none' || intake.limitation === 'little');
    capacity = ready ? 3 : 2;
  }
  if (intake.age_band === '70p') capacity = 1;
  else if (intake.age_band === '60_69' && capacity === 3) capacity = 2;

  let tierCap = 5;
  if (intake.age_band === '70p') tierCap = Math.min(tierCap, 3);
  if (intake.age_band === '60_69') tierCap = Math.min(tierCap, 4);
  if (pregnant || postSurgery) tierCap = Math.min(tierCap, 2);
  if (postpartum || osteoporosis) tierCap = Math.min(tierCap, 3);

  let loadCap: LoadCap = 'full';
  if (osteoporosis || postpartum) loadCap = 'light';
  if (pregnant || postSurgery || redFlag) loadCap = 'bodyweight';

  const gentleStart =
    irritability.level === 'high' ||
    sensitization === 'high' ||
    fibromyalgia ||
    pregnant ||
    postSurgery ||
    redFlag ||
    intake.duration_detail === 'lt_2w';

  const slotDelta: -1 | 0 = fibromyalgia || irritability.level === 'high' ? -1 : 0;
  const unilateralFocus = intake.spread === 'one_side' || has(intake.movement_feel, 'uneven');
  const exposureBending = has(intake.hard_now, 'bending') || fear !== 'low';

  const avoid = new Set<AvoidTag>();
  const avoidEarly = new Set<AvoidTag>();
  let earlyWeeks = 0;

  if (bias === 'flexion_sensitive') {
    avoidEarly.add('flexion_endrange');
    avoidEarly.add('flexion_loaded');
    earlyWeeks = Math.max(earlyWeeks, biasStrength === 'clear' ? 3 : 2);
  }
  if (bias === 'extension_sensitive') {
    avoidEarly.add('extension_endrange');
    avoidEarly.add('extension_loaded');
    earlyWeeks = Math.max(earlyWeeks, biasStrength === 'clear' ? 3 : 2);
    if (has(intake.conditions, 'stenosis')) {
      avoidEarly.delete('extension_endrange');
      avoidEarly.delete('extension_loaded');
      avoid.add('extension_endrange');
      avoid.add('extension_loaded');
    }
  }
  if (radicular === 'below_knee') {
    avoid.add('neural_tension');
  } else if (radicular === 'referred') {
    avoidEarly.add('neural_tension');
    earlyWeeks = Math.max(earlyWeeks, 2);
  }
  if (osteoporosis) {
    avoid.add('flexion_endrange');
    avoid.add('flexion_loaded');
    avoid.add('rotation_endrange');
    avoid.add('rotation_loaded');
  }
  if (pregnant) {
    avoid.add('prone');
    avoid.add('high_iap');
    avoid.add('flexion_loaded');
  }
  if (postpartum) {
    avoidEarly.add('high_iap');
    earlyWeeks = Math.max(earlyWeeks, 3);
  }
  if (postSurgery) {
    avoidEarly.add('flexion_endrange');
    avoidEarly.add('extension_endrange');
    avoidEarly.add('rotation_endrange');
    earlyWeeks = Math.max(earlyWeeks, 3);
  }
  if (intake.age_band === '70p') {
    avoidEarly.add('balance_challenge');
    earlyWeeks = Math.max(earlyWeeks, 2);
  }
  if (has(answers.pain_type, 'sharp') || has(answers.pain_type, 'nerve')) {
    avoidEarly.add('flexion_loaded');
    earlyWeeks = Math.max(earlyWeeks, 2);
  }
  for (const tag of avoid) avoidEarly.delete(tag);

  return {
    irritability: irritability.level,
    irritabilityScore: irritability.score,
    bias,
    biasStrength,
    sensitization,
    nsScore,
    fear,
    radicular,
    mode,
    emphasis: emphasisOf(mode, intake, answers, sensitization),
    exposureBending,
    unilateralFocus,
    functionTargets: inOrder(HARD_NOW, new Set(intake.hard_now)),
    avoid: inOrder(AVOID_ORDER, avoid),
    avoidEarly: inOrder(AVOID_ORDER, avoidEarly),
    earlyWeeks,
    gentleStart,
    loadCap,
    capacity,
    tierCap,
    slotDelta,
    flags: {
      redFlag,
      clinicianFirst: redFlag || pregnant || postSurgery,
      postSurgery,
      pregnant,
      postpartum,
      osteoporosis,
      fibromyalgia,
      olderAdult,
    },
  };
}

export const MIN_PROGRAM_WEEKS = 10;
export const MAX_PROGRAM_WEEKS = 16;

const DURATION_EXTRA_WEEKS: Record<(typeof DURATION_DETAIL)[number], number> = {
  lt_2w: 0,
  '2w_3m': 0,
  '3_12m': 1,
  '1_5y': 2,
  '5y_plus': 3,
};

/** Program length: 10 weeks, plus weeks for long-standing pain, a sensitive back, a slow-healing context, or a return to training. */
export function programWeeks(answers: LegacyAnswers, intake: Intake, profile: ClinicalProfile): number {
  let weeks = MIN_PROGRAM_WEEKS + DURATION_EXTRA_WEEKS[intake.duration_detail];
  if (profile.irritability === 'high' || profile.sensitization === 'high') weeks += 1;
  if (profile.flags.postSurgery || profile.flags.postpartum || intake.age_band === '70p') weeks += 1;
  if (has(answers.main_goal, 'return_to_exercise')) weeks += 1;
  return Math.min(MAX_PROGRAM_WEEKS, weeks);
}
