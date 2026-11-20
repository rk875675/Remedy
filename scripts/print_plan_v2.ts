// Print a v2 plan for a named persona, or every persona.
// Usage: npx tsx scripts/print_plan_v2.ts <personaName|all>
import Module, { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  deriveLegacyTriggers,
  deriveProfile,
  durationBucketFor,
  type Intake,
  type LegacyAnswers,
} from '../lib/intake';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

type CatalogExercise = {
  id: string;
  name: string;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number;
  equipment_tier: 'open_space' | 'bands_dumbbells' | 'gym';
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
};

type ExerciseDetail = {
  exercise_id: string;
  slug: string;
  dose_class: string;
  spine_bias: string;
  contra: string[];
  function_targets: string[];
  per_side: boolean;
};

export type PlanExercise = {
  exercise_id: string;
  order_index: number;
  sets: number | null;
  reps: number | null;
  duration_seconds: number | null;
  rest_seconds: number;
  load_tier: number;
};

export type PlanSession = {
  week_number: number;
  session_number: number;
  title: string;
  phase: string;
  estimated_minutes: number;
  intensity_tier: number;
  exercises: PlanExercise[];
};

export type ResolvedPlan = {
  program_name: string;
  subtitle: string | null;
  tagline: string | null;
  duration_weeks: number;
  sessions_per_week: number;
  start_week: number;
  rules_version: number;
  primary_focus: string;
  secondary_focus: string;
  sessions: PlanSession[];
};

export type PlanOutline = {
  weeks: {
    week: number;
    mode: string;
    column: string;
    target_tier: number;
    sessions: number;
    avg_minutes: number;
    exercise_count: number;
  }[];
  total_sessions: number;
  unique_exercises: number;
};

export type PlanInput = {
  answers: LegacyAnswers;
  intake: Intake;
  exercises: CatalogExercise[];
  details: ExerciseDetail[];
  startWeek?: number;
  progressionLevel?: number;
};

export type Inspection = {
  plan: ResolvedPlan;
  outline: PlanOutline;
  profile: ReturnType<typeof deriveProfile>;
  emptyByKind: Record<string, number>;
  holds: { key: string; week: number; exerciseId: string }[];
};

export type EngineModule = {
  buildPlanV2: (input: PlanInput) => ResolvedPlan;
  planOutline: (input: PlanInput) => PlanOutline;
  inspectPlanV2: (input: PlanInput) => Inspection;
};

type NodeModuleWithResolve = {
  _resolveFilename: (
    request: string,
    parent: NodeJS.Module | null | undefined,
    isMain: boolean,
    options?: { paths?: string[] },
  ) => string;
  __remedyZod?: boolean;
};

export function loadEngine(): EngineModule {
  const runtime = Module as unknown as NodeModuleWithResolve;
  if (!runtime.__remedyZod) {
    const original = runtime._resolveFilename;
    const wrapped: NodeModuleWithResolve['_resolveFilename'] = (request, parent, isMain, options) => {
      const specifier = request.startsWith('https://esm.sh/zod') ? 'zod' : request;
      return original.call(runtime, specifier, parent, isMain, options);
    };
    runtime._resolveFilename = wrapped;
    runtime.__remedyZod = true;
  }
  const require = createRequire(pathToFileURL(join(root, 'package.json')));
  return require(join(root, 'supabase/functions/_shared/assignment/engineV2.ts')) as EngineModule;
}

export function loadFixture(): { exercises: CatalogExercise[]; details: ExerciseDetail[] } {
  const raw = readFileSync(join(root, 'scripts/fixtures/catalog_v2.json'), 'utf8');
  return JSON.parse(raw) as { exercises: CatalogExercise[]; details: ExerciseDetail[] };
}

const QUIET_NS: Intake['ns'] = {
  predictable: 'yes',
  small_triggers: 'no',
  stress: 'no',
  anticipation: 'no',
  avoidance: 'no',
};

type IntakeOver = Partial<Omit<Intake, 'ns'>> & { ns?: Partial<Intake['ns']> };

function makeIntake(over: IntakeOver = {}): Intake {
  const { ns, ...rest } = over;
  return {
    v: 1,
    hard_now: [],
    spread: 'one_spot',
    leg_reach: null,
    duration_detail: '3_12m',
    onset: 'gradual',
    intensity: 3,
    movement_feel: [],
    relief_direction: 'neither',
    flare_settle: 'hours',
    trend: 'same',
    limitation: 'some_days',
    tried: [],
    conditions: [],
    age_band: '30_44',
    minutes: 20,
    red_flags: [],
    red_flag_ack: false,
    ...rest,
    ns: { ...QUIET_NS, ...ns },
  };
}

export function makePersona(
  over: {
    location?: LegacyAnswers['pain_location'];
    painType?: LegacyAnswers['pain_type'];
    activity?: LegacyAnswers['activity_level'];
    equipment?: LegacyAnswers['equipment'];
    goals?: LegacyAnswers['main_goal'];
    sessions?: number;
    intake?: IntakeOver;
  } = {},
): { answers: LegacyAnswers; intake: Intake } {
  const intake = makeIntake(over.intake);
  const painType = over.painType ?? ['ache'];
  if (intake.spread !== 'leg' && !painType.includes('nerve')) intake.leg_reach = null;
  const answers: LegacyAnswers = {
    pain_location: over.location ?? 'lower',
    pain_duration: durationBucketFor(intake.duration_detail),
    pain_type: painType,
    activity_level: over.activity ?? 'light',
    pain_trigger: deriveLegacyTriggers(intake.hard_now),
    equipment: over.equipment ?? 'open_space',
    main_goal: over.goals ?? ['reduce_pain'],
    sessions_per_week_preference: over.sessions ?? 4,
  };
  return { answers, intake };
}

export const PERSONA_NAMES = [
  'desk_chronic',
  'acute_sharp',
  'sciatica_below_knee',
  'stenosis_older',
  'sensitized_fibro',
  'gym_returner',
  'postpartum',
  'upper_desk',
  'fearful_bender',
  'one_sided_unstable',
] as const;

export type PersonaName = (typeof PERSONA_NAMES)[number];

export function personaByName(name: PersonaName): { answers: LegacyAnswers; intake: Intake } {
  switch (name) {
    case 'desk_chronic':
      return makePersona({
        painType: ['stiffness', 'ache'],
        activity: 'sedentary',
        equipment: 'open_space',
        sessions: 4,
        intake: {
          duration_detail: '1_5y',
          hard_now: ['sitting', 'bed'],
          relief_direction: 'extension',
          intensity: 4,
          flare_settle: 'hours',
          trend: 'same',
          limitation: 'some_days',
          minutes: 15,
          ns: { predictable: 'varies', small_triggers: 'sometimes', stress: 'sometimes', anticipation: 'sometimes', avoidance: 'sometimes' },
        },
      });
    case 'acute_sharp':
      return makePersona({
        painType: ['sharp'],
        activity: 'light',
        equipment: 'open_space',
        sessions: 3,
        intake: {
          duration_detail: 'lt_2w',
          hard_now: ['bending', 'bed'],
          onset: 'lifting',
          intensity: 8,
          flare_settle: 'days',
          trend: 'same',
          limitation: 'a_lot',
          minutes: 15,
          ns: { small_triggers: 'yes' },
        },
      });
    case 'sciatica_below_knee':
      return makePersona({
        painType: ['nerve', 'ache'],
        activity: 'light',
        equipment: 'bands_dumbbells',
        sessions: 4,
        intake: {
          duration_detail: '3_12m',
          spread: 'leg',
          leg_reach: 'below_knee',
          conditions: ['sciatica', 'herniated_disc'],
          hard_now: ['sitting', 'bending'],
          relief_direction: 'extension',
          intensity: 6,
          flare_settle: 'day',
          minutes: 20,
        },
      });
    case 'stenosis_older':
      return makePersona({
        painType: ['ache', 'stiffness'],
        activity: 'light',
        equipment: 'open_space',
        sessions: 3,
        intake: {
          duration_detail: '5y_plus',
          conditions: ['stenosis', 'arthritis'],
          hard_now: ['walking', 'standing'],
          relief_direction: 'flexion',
          intensity: 5,
          flare_settle: 'hours',
          age_band: '70p',
          minutes: 15,
        },
      });
    case 'sensitized_fibro':
      return makePersona({
        location: 'all',
        painType: ['ache'],
        activity: 'sedentary',
        equipment: 'open_space',
        sessions: 3,
        intake: {
          duration_detail: '5y_plus',
          spread: 'moves',
          conditions: ['fibromyalgia'],
          movement_feel: ['guarded', 'unsafe'],
          intensity: 7,
          flare_settle: 'days',
          limitation: 'most_days',
          minutes: 15,
          ns: { predictable: 'no', small_triggers: 'yes', stress: 'yes', anticipation: 'yes', avoidance: 'yes' },
        },
      });
    case 'gym_returner':
      return makePersona({
        painType: ['ache'],
        activity: 'active',
        equipment: 'gym',
        goals: ['return_to_exercise'],
        sessions: 5,
        intake: {
          duration_detail: '3_12m',
          hard_now: ['exercise', 'bending'],
          movement_feel: ['weak'],
          intensity: 3,
          flare_settle: 'minutes',
          trend: 'better',
          limitation: 'little',
          minutes: 30,
        },
      });
    case 'postpartum':
      return makePersona({
        painType: ['ache'],
        activity: 'light',
        equipment: 'bands_dumbbells',
        sessions: 4,
        intake: {
          duration_detail: '3_12m',
          onset: 'pregnancy',
          conditions: ['postpartum'],
          movement_feel: ['weak', 'unstable'],
          intensity: 4,
          flare_settle: 'hours',
          minutes: 20,
        },
      });
    case 'upper_desk':
      return makePersona({
        location: 'upper',
        painType: ['stiffness'],
        activity: 'sedentary',
        equipment: 'bands_dumbbells',
        goals: ['mobility'],
        sessions: 4,
        intake: {
          duration_detail: '1_5y',
          hard_now: ['sitting', 'overhead'],
          movement_feel: ['stiff'],
          intensity: 3,
          flare_settle: 'hours',
          minutes: 15,
        },
      });
    case 'fearful_bender':
      return makePersona({
        painType: ['ache'],
        activity: 'light',
        equipment: 'open_space',
        sessions: 4,
        intake: {
          duration_detail: '1_5y',
          hard_now: ['bending', 'twisting'],
          movement_feel: ['unsafe'],
          intensity: 5,
          flare_settle: 'hours',
          minutes: 20,
          ns: { predictable: 'varies', anticipation: 'yes', avoidance: 'yes' },
        },
      });
    case 'one_sided_unstable':
      return makePersona({
        painType: ['ache'],
        activity: 'light',
        equipment: 'bands_dumbbells',
        sessions: 4,
        intake: {
          duration_detail: '3_12m',
          spread: 'one_side',
          movement_feel: ['uneven', 'unstable'],
          hard_now: ['stairs', 'walking'],
          intensity: 4,
          flare_settle: 'hours',
          minutes: 20,
        },
      });
    default:
      return makePersona();
  }
}

function doseLine(exercise: PlanExercise, perSide: boolean): string {
  const sets = exercise.sets ?? 0;
  let work = `${sets} x ${exercise.rest_seconds}s rest`;
  if (exercise.reps != null && exercise.duration_seconds != null) {
    work = `${sets} x ${exercise.reps} x ${exercise.duration_seconds}s`;
  } else if (exercise.reps != null) {
    work = `${sets} x ${exercise.reps} reps`;
  } else if (exercise.duration_seconds != null) {
    work = `${sets} x ${exercise.duration_seconds}s`;
  }
  const side = perSide ? ' each side' : '';
  return `${work}${side}  rest ${exercise.rest_seconds}s`;
}

export function formatPlan(
  name: string,
  inspection: Inspection,
  names: ReadonlyMap<string, string>,
  perSide: ReadonlyMap<string, boolean>,
): string {
  const profile = inspection.profile;
  const lines: string[] = [];
  lines.push(`=== ${name} ===`);
  lines.push(
    [
      `${inspection.plan.program_name}`,
      inspection.plan.subtitle ?? 'no subtitle',
      `${inspection.plan.duration_weeks} weeks x ${inspection.plan.sessions_per_week}`,
      `rules ${inspection.plan.rules_version}`,
    ].join(' | '),
  );
  lines.push(
    [
      `irritability ${profile.irritability} ${profile.irritabilityScore}`,
      `bias ${profile.bias} ${profile.biasStrength}`,
      `mode ${profile.mode}`,
      `sens ${profile.sensitization}`,
      `fear ${profile.fear}`,
      `radicular ${profile.radicular}`,
      `load ${profile.loadCap}`,
      `capacity ${profile.capacity}`,
      `tierCap ${profile.tierCap}`,
      `gentle ${profile.gentleStart}`,
      `earlyWeeks ${profile.earlyWeeks}`,
      `exposure ${profile.exposureBending}`,
    ].join(' | '),
  );
  lines.push(
    `emphasis m ${profile.emphasis.mobility} c ${profile.emphasis.control} s ${profile.emphasis.strength} r ${profile.emphasis.relaxation}`,
  );
  if (profile.avoid.length > 0) lines.push(`avoid: ${profile.avoid.join(', ')}`);
  if (profile.avoidEarly.length > 0) lines.push(`avoid early: ${profile.avoidEarly.join(', ')}`);
  for (const week of inspection.outline.weeks) {
    lines.push(
      `week ${week.week}  ${week.column}  ${week.mode}  tier ${week.target_tier}  avg ${week.avg_minutes} min  exercises ${week.exercise_count}`,
    );
    const sessions = inspection.plan.sessions.filter((session) => session.week_number === week.week);
    for (const session of sessions) {
      lines.push(
        `  ${session.session_number}  ${session.title}  ${session.estimated_minutes} min  ${session.phase}  tier ${session.intensity_tier}`,
      );
      for (const exercise of session.exercises) {
        const label = names.get(exercise.exercise_id) ?? exercise.exercise_id;
        lines.push(`    ${label}  ${doseLine(exercise, perSide.get(exercise.exercise_id) === true)}`);
      }
    }
  }
  lines.push('');
  return lines.join('\n');
}

function main(): void {
  const requested = process.argv[2] ?? 'all';
  const names: PersonaName[] =
    requested === 'all' ? [...PERSONA_NAMES] : PERSONA_NAMES.filter((name) => name === requested);
  if (names.length === 0) {
    console.error(`Unknown persona "${requested}". Use one of: ${PERSONA_NAMES.join(', ')}, all`);
    process.exit(1);
  }
  const engine = loadEngine();
  const fixture = loadFixture();
  const nameById = new Map(fixture.exercises.map((exercise) => [exercise.id, exercise.name]));
  const sideById = new Map(fixture.details.map((detail) => [detail.exercise_id, detail.per_side]));
  for (const name of names) {
    const persona = personaByName(name);
    const inspection = engine.inspectPlanV2({
      answers: persona.answers,
      intake: persona.intake,
      exercises: fixture.exercises,
      details: fixture.details,
    });
    process.stdout.write(formatPlan(name, inspection, nameById, sideById));
  }
}

const invoked = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (invoked === import.meta.url) main();
