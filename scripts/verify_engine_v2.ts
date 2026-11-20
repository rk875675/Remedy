// Engine v2 invariants. Usage: npx tsx --test scripts/verify_engine_v2.ts
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import {
  AGE_BAND,
  CONDITIONS,
  DURATION_DETAIL,
  FLARE_SETTLE,
  HARD_NOW,
  LEG_REACH,
  LIMITATION,
  MOVEMENT_FEEL,
  ONSET,
  RED_FLAGS,
  RELIEF_DIRECTION,
  SPREAD,
  TREND,
  MAX_PROGRAM_WEEKS,
  MIN_PROGRAM_WEEKS,
  deriveProfile,
  intakeSchema,
  programWeeks,
  type Intake,
  type LegacyAnswers,
} from '../lib/intake';
import {
  PERSONA_NAMES,
  loadEngine,
  loadFixture,
  makePersona,
  personaByName,
  type EngineModule,
  type Inspection,
  type PlanInput,
  type ResolvedPlan,
} from './print_plan_v2';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const engine: EngineModule = loadEngine();
const fixture = loadFixture();
const require = createRequire(pathToFileURL(join(root, 'package.json')));
const schema = require(join(root, 'supabase/functions/_shared/assignment/schema.ts')) as {
  resolvedPlanSchema: { safeParse: (value: unknown) => { success: boolean } };
};

const byId = new Map(fixture.exercises.map((exercise) => [exercise.id, exercise]));
const detailById = new Map(fixture.details.map((detail) => [detail.exercise_id, detail]));
const nameById = new Map(fixture.exercises.map((exercise) => [exercise.id, exercise.name]));

const EQUIPMENT_RANK: Record<string, number> = { open_space: 0, bands_dumbbells: 1, gym: 2 };
const PAIN_TYPES = ['stiffness', 'ache', 'sharp', 'nerve'] as const;
const ACTIVITIES = ['sedentary', 'light', 'active', 'athlete'] as const;
const TRIGGERS = ['sitting', 'bending', 'standing', 'morning', 'exercise', 'other'] as const;
const GOALS = ['reduce_pain', 'return_to_exercise', 'sleep', 'mobility'] as const;
const LOCATIONS = ['upper', 'lower', 'all'] as const;
const EQUIPMENT = ['open_space', 'bands_dumbbells', 'gym'] as const;
const NS_LEVEL = ['no', 'sometimes', 'yes'] as const;
const NS_PREDICTABLE = ['yes', 'varies', 'no'] as const;
const LEVELS = [-1, 0, 1, 3] as const;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)] as T;
}

function someOf<T>(rng: () => number, values: readonly T[]): T[] {
  const chosen = values.filter(() => rng() < 0.35);
  return chosen.length > 0 ? chosen : [pick(rng, values)];
}

function ordered<T extends string>(rng: () => number, values: readonly T[]): T[] {
  const chosen = new Set(someOf(rng, values));
  return values.filter((value) => chosen.has(value));
}

function randomPair(rng: () => number): { answers: LegacyAnswers; intake: Intake } {
  const painType = someOf(rng, PAIN_TYPES);
  const spread = pick(rng, SPREAD);
  const keepsLeg = spread === 'leg' || painType.includes('nerve');
  const intake: Intake = {
    v: 1,
    hard_now: ordered(rng, HARD_NOW).slice(0, 4),
    spread,
    leg_reach: keepsLeg ? pick(rng, LEG_REACH) : null,
    duration_detail: pick(rng, DURATION_DETAIL),
    onset: pick(rng, ONSET),
    intensity: Math.floor(rng() * 11),
    movement_feel: ordered(rng, MOVEMENT_FEEL),
    relief_direction: pick(rng, RELIEF_DIRECTION),
    flare_settle: pick(rng, FLARE_SETTLE),
    trend: pick(rng, TREND),
    limitation: pick(rng, LIMITATION),
    ns: {
      predictable: pick(rng, NS_PREDICTABLE),
      small_triggers: pick(rng, NS_LEVEL),
      stress: pick(rng, NS_LEVEL),
      anticipation: pick(rng, NS_LEVEL),
      avoidance: pick(rng, NS_LEVEL),
    },
    tried: [],
    conditions: ordered(rng, CONDITIONS).filter(() => rng() < 0.7),
    age_band: pick(rng, AGE_BAND),
    minutes: pick(rng, [15, 20, 30] as const),
    red_flags: rng() < 0.85 ? [] : ordered(rng, RED_FLAGS).slice(0, 2),
    red_flag_ack: rng() < 0.5,
  };
  const duration =
    intake.duration_detail === 'lt_2w' ? 'acute' : intake.duration_detail === '2w_3m' ? 'subacute' : 'chronic';
  const answers: LegacyAnswers = {
    pain_location: pick(rng, LOCATIONS),
    pain_duration: duration,
    pain_type: painType,
    activity_level: pick(rng, ACTIVITIES),
    pain_trigger: someOf(rng, TRIGGERS),
    equipment: pick(rng, EQUIPMENT),
    main_goal: someOf(rng, GOALS),
    sessions_per_week_preference: rng() < 0.2 ? null : 3 + Math.floor(rng() * 5),
  };
  return { answers, intake };
}

function inputFor(
  pair: { answers: LegacyAnswers; intake: Intake },
  level?: number,
  startWeek?: number,
): PlanInput {
  return {
    answers: pair.answers,
    intake: pair.intake,
    exercises: fixture.exercises,
    details: fixture.details,
    ...(level !== undefined ? { progressionLevel: level } : {}),
    ...(startWeek !== undefined ? { startWeek } : {}),
  };
}

function sumEmphasis(profile: ReturnType<typeof deriveProfile>): number {
  const emphasis = profile.emphasis;
  return emphasis.mobility + emphasis.control + emphasis.strength + emphasis.relaxation;
}

function intersects(left: readonly string[], right: readonly string[]): boolean {
  const set = new Set(right);
  return left.some((item) => set.has(item));
}

function sessionsPerWeek(answers: LegacyAnswers): number {
  if (answers.sessions_per_week_preference != null) {
    return Math.max(3, Math.min(7, answers.sessions_per_week_preference));
  }
  const table: Record<string, Record<string, number>> = {
    sedentary: { acute: 3, subacute: 3, chronic: 3 },
    light: { acute: 3, subacute: 3, chronic: 4 },
    active: { acute: 3, subacute: 4, chronic: 4 },
    athlete: { acute: 4, subacute: 4, chronic: 5 },
  };
  return table[answers.activity_level]?.[answers.pain_duration] ?? 3;
}

function assertPlanShape(plan: ResolvedPlan, pair: { answers: LegacyAnswers; intake: Intake }, profile: Inspection['profile']): void {
  const parsed = schema.resolvedPlanSchema.safeParse(plan);
  assert.equal(parsed.success, true);
  const weeks = plan.duration_weeks;
  assert.ok(weeks >= MIN_PROGRAM_WEEKS && weeks <= MAX_PROGRAM_WEEKS, `${weeks} weeks`);
  assert.equal(weeks, programWeeks(pair.answers, pair.intake, profile));
  const perWeek = sessionsPerWeek(pair.answers);
  assert.equal(plan.sessions.length, (weeks - plan.start_week + 1) * perWeek);
  assert.equal(plan.rules_version, 2);
  assert.equal(plan.sessions_per_week, perWeek);
  const seenWeeks = new Set<number>();
  for (const session of plan.sessions) {
    seenWeeks.add(session.week_number);
    assert.ok(session.exercises.length >= 3 && session.exercises.length <= 6, `${session.exercises.length} exercises`);
    const ids = session.exercises.map((exercise) => exercise.exercise_id);
    assert.equal(new Set(ids).size, ids.length);
    session.exercises.forEach((exercise, index) => {
      assert.equal(exercise.order_index, index + 1);
      assert.ok(exercise.sets != null && exercise.sets >= 1 && exercise.sets <= 4);
      assert.ok(exercise.rest_seconds >= 10 && exercise.rest_seconds <= 120);
      assert.equal(exercise.rest_seconds % 5, 0);
      const catalog = byId.get(exercise.exercise_id);
      const detail = detailById.get(exercise.exercise_id);
      assert.ok(catalog && detail);
      assert.ok((EQUIPMENT_RANK[catalog.equipment_tier] ?? 99) <= (EQUIPMENT_RANK[pair.answers.equipment] ?? 0));
      if (profile.loadCap === 'bodyweight') assert.equal(catalog.equipment_tier, 'open_space');
      if (profile.loadCap === 'light') {
        assert.notEqual(catalog.equipment_tier, 'gym');
        assert.ok(catalog.intensity_tier <= 3);
      }
      assert.ok(!intersects(detail.contra, profile.avoid));
      if (session.week_number <= profile.earlyWeeks) assert.ok(!intersects(detail.contra, profile.avoidEarly));
      if (exercise.reps != null && exercise.duration_seconds != null) assert.ok(exercise.duration_seconds <= 10);
      if (detail.dose_class === 'loaded_strength' && exercise.reps != null) assert.ok(exercise.reps <= 12);
      assert.ok(catalog.intensity_tier <= Math.max(2, profile.tierCap));
    });
  }
  const weekList = [...seenWeeks].sort((a, b) => a - b);
  weekList.forEach((week, index) => {
    assert.equal(week, plan.start_week + index);
    const numbers = plan.sessions
      .filter((session) => session.week_number === week)
      .map((session) => session.session_number)
      .sort((a, b) => a - b);
    assert.deepEqual(numbers, Array.from({ length: perWeek }, (_, i) => i + 1));
  });
}

function assertHolds(holds: Inspection['holds']): void {
  const byKey = new Map<string, { week: number; exerciseId: string }[]>();
  for (const hold of holds) {
    const list = byKey.get(hold.key) ?? [];
    list.push(hold);
    byKey.set(hold.key, list);
  }
  for (const [key, list] of byKey) {
    list.sort((a, b) => a.week - b.week);
    let runId = list[0]?.exerciseId ?? '';
    let run = 0;
    let previousWeek = 0;
    for (const item of list) {
      const consecutive = run > 0 && item.week === previousWeek + 1;
      if (!consecutive) {
        runId = item.exerciseId;
        run = 1;
      } else if (item.exerciseId === runId) {
        run += 1;
      } else {
        assert.ok(run >= 2, `${key} changed after ${run} week`);
        runId = item.exerciseId;
        run = 1;
      }
      previousWeek = item.week;
    }
  }
}

test('Deno intake mirror matches the client after the header', () => {
  const client = readFileSync(join(root, 'lib/intake.ts'), 'utf8');
  const edge = readFileSync(join(root, 'supabase/functions/_shared/assignment/intake.ts'), 'utf8');
  const strip = (src: string) =>
    src.replace(/^[\s\S]*?\nexport const INTAKE_VERSION/m, 'export const INTAKE_VERSION').replace(/\r\n/g, '\n');
  assert.equal(strip(client), strip(edge));
});

test('profile: quiet build, score boundaries, and emphasis sums to 1', () => {
  const quiet = makePersona({
    goals: ['reduce_pain'],
    intake: { intensity: 0, flare_settle: 'none', limitation: 'none', trend: 'same', hard_now: [] },
  });
  const quietProfile = deriveProfile(quiet.answers, quiet.intake);
  assert.equal(quietProfile.irritability, 'low');
  assert.equal(quietProfile.irritabilityScore, 0);
  assert.equal(quietProfile.mode, 'build');
  assert.equal(quietProfile.capacity, 2);
  assert.equal(quietProfile.sensitization, 'low');
  assert.equal(quietProfile.fear, 'low');
  assert.equal(quietProfile.bias, 'neutral');
  assert.equal(quietProfile.radicular, 'none');
  assert.equal(quietProfile.gentleStart, false);
  assert.equal(quietProfile.slotDelta, 0);
  assert.deepEqual(quietProfile.avoid, []);
  assert.deepEqual(quietProfile.avoidEarly, []);
  assert.equal(Math.abs(sumEmphasis(quietProfile) - 1) < 0.001, true);
  assert.equal(quietProfile.emphasis.mobility, 0.143);
  assert.equal(quietProfile.emphasis.control, 0.333);
  assert.equal(quietProfile.emphasis.strength, 0.476);
  assert.equal(quietProfile.emphasis.relaxation, 0.048);

  const below = deriveProfile(
    makePersona({ intake: { intensity: 4, flare_settle: 'hours', limitation: 'some_days' } }).answers,
    makePersona({ intake: { intensity: 4, flare_settle: 'hours', limitation: 'some_days' } }).intake,
  );
  assert.equal(below.irritabilityScore, 2.5);
  assert.equal(below.irritability, 'low');

  const at3 = makePersona({
    intake: { intensity: 4, flare_settle: 'hours', limitation: 'none', ns: { small_triggers: 'sometimes' } },
  });
  const moderate = deriveProfile(at3.answers, at3.intake);
  assert.equal(moderate.irritabilityScore, 3);
  assert.equal(moderate.irritability, 'moderate');
  assert.equal(moderate.mode, 'control');

  const at6 = makePersona({
    intake: { intensity: 8, flare_settle: 'hours', limitation: 'none', ns: { small_triggers: 'yes' } },
  });
  const stillModerate = deriveProfile(at6.answers, at6.intake);
  assert.equal(stillModerate.irritabilityScore, 6);
  assert.equal(stillModerate.irritability, 'moderate');

  const at65 = makePersona({
    intake: { intensity: 8, flare_settle: 'day', limitation: 'some_days', ns: { small_triggers: 'sometimes' } },
  });
  const high = deriveProfile(at65.answers, at65.intake);
  assert.equal(high.irritabilityScore, 6.5);
  assert.equal(high.irritability, 'high');
  assert.equal(high.mode, 'calm');
  assert.equal(high.capacity, 1);
  assert.equal(high.gentleStart, true);
  assert.equal(high.slotDelta, -1);
});

test('profile: bias, sensitization override, and the three-month rule', () => {
  const clear = makePersona({
    intake: { hard_now: ['sitting', 'bending'], relief_direction: 'extension', intensity: 0, flare_settle: 'none', limitation: 'none' },
  });
  const clearProfile = deriveProfile(clear.answers, clear.intake);
  assert.equal(clearProfile.bias, 'flexion_sensitive');
  assert.equal(clearProfile.biasStrength, 'clear');
  assert.equal(clearProfile.earlyWeeks, 3);
  assert.deepEqual(clearProfile.avoidEarly, ['flexion_endrange', 'flexion_loaded']);

  const lean = makePersona({
    intake: { hard_now: ['sitting'], relief_direction: 'neither', intensity: 0, flare_settle: 'none', limitation: 'none' },
  });
  const leanProfile = deriveProfile(lean.answers, lean.intake);
  assert.equal(leanProfile.bias, 'flexion_sensitive');
  assert.equal(leanProfile.biasStrength, 'lean');
  assert.equal(leanProfile.earlyWeeks, 2);

  const stenosis = deriveProfile(
    personaByName('stenosis_older').answers,
    personaByName('stenosis_older').intake,
  );
  assert.equal(stenosis.bias, 'extension_sensitive');
  assert.equal(stenosis.biasStrength, 'clear');
  assert.ok(stenosis.avoid.includes('extension_endrange'));
  assert.ok(stenosis.avoid.includes('extension_loaded'));
  assert.equal(stenosis.avoidEarly.includes('extension_endrange'), false);
  assert.ok(stenosis.avoidEarly.includes('balance_challenge'));

  const shortHighNs = makePersona({
    intake: {
      duration_detail: '2w_3m',
      spread: 'one_spot',
      ns: { predictable: 'no', small_triggers: 'yes', stress: 'yes', anticipation: 'yes', avoidance: 'no' },
    },
  });
  const shortProfile = deriveProfile(shortHighNs.answers, shortHighNs.intake);
  assert.ok(shortProfile.nsScore >= 6);
  assert.equal(shortProfile.sensitization, 'some');

  const fibro = makePersona({
    painType: ['ache'],
    intake: { duration_detail: 'lt_2w', conditions: ['fibromyalgia'], intensity: 0, flare_settle: 'none', limitation: 'none' },
  });
  const fibroProfile = deriveProfile(fibro.answers, fibro.intake);
  assert.equal(fibroProfile.sensitization, 'high');
  assert.equal(fibroProfile.gentleStart, true);

  const overridden = makePersona({
    intake: {
      duration_detail: '1_5y',
      spread: 'moves',
      hard_now: ['sitting'],
      relief_direction: 'neither',
      ns: { predictable: 'no', small_triggers: 'yes', stress: 'yes', anticipation: 'yes', avoidance: 'yes' },
    },
  });
  const overriddenProfile = deriveProfile(overridden.answers, overridden.intake);
  assert.equal(overriddenProfile.sensitization, 'high');
  assert.equal(overriddenProfile.bias, 'neutral');
  assert.equal(overriddenProfile.biasStrength, 'none');
});

test('profile: fear, radicular, caps, and avoid lists stay disjoint', () => {
  const afraid = makePersona({
    intake: { movement_feel: ['unsafe'], ns: { avoidance: 'yes' }, intensity: 0, flare_settle: 'none', limitation: 'none' },
  });
  assert.equal(deriveProfile(afraid.answers, afraid.intake).fear, 'high');
  const uneasy = makePersona({
    intake: { ns: { avoidance: 'sometimes' }, intensity: 0, flare_settle: 'none', limitation: 'none' },
  });
  assert.equal(deriveProfile(uneasy.answers, uneasy.intake).fear, 'some');
  const calm = makePersona({ intake: { intensity: 0, flare_settle: 'none', limitation: 'none' } });
  assert.equal(deriveProfile(calm.answers, calm.intake).fear, 'low');

  const below = deriveProfile(personaByName('sciatica_below_knee').answers, personaByName('sciatica_below_knee').intake);
  assert.equal(below.radicular, 'below_knee');
  assert.ok(below.avoid.includes('neural_tension'));
  const referred = makePersona({
    painType: ['ache'],
    intake: { spread: 'leg', leg_reach: 'above_knee', intensity: 0, flare_settle: 'none', limitation: 'none' },
  });
  const referredProfile = deriveProfile(referred.answers, referred.intake);
  assert.equal(referredProfile.radicular, 'referred');
  assert.ok(referredProfile.avoidEarly.includes('neural_tension'));
  assert.equal(referredProfile.avoid.includes('neural_tension'), false);

  const pregnant = makePersona({
    intake: { conditions: ['pregnant'], red_flags: [], intensity: 0, flare_settle: 'none', limitation: 'none' },
  });
  const pregnantProfile = deriveProfile(pregnant.answers, pregnant.intake);
  assert.equal(pregnantProfile.tierCap, 2);
  assert.equal(pregnantProfile.loadCap, 'bodyweight');
  assert.equal(pregnantProfile.flags.pregnant, true);
  assert.ok(pregnantProfile.avoid.includes('prone'));
  assert.ok(pregnantProfile.avoid.includes('high_iap'));

  const boneAndFlag = makePersona({
    intake: {
      conditions: ['osteoporosis'],
      red_flags: ['trauma'],
      age_band: '60_69',
      intensity: 0,
      flare_settle: 'none',
      limitation: 'none',
    },
  });
  const boneProfile = deriveProfile(boneAndFlag.answers, boneAndFlag.intake);
  assert.equal(boneProfile.loadCap, 'bodyweight');
  assert.equal(boneProfile.tierCap, 3);
  assert.equal(boneProfile.flags.clinicianFirst, true);

  const older = makePersona({
    activity: 'active',
    intake: { age_band: '70p', limitation: 'little', intensity: 0, flare_settle: 'none' },
  });
  const olderProfile = deriveProfile(older.answers, older.intake);
  assert.equal(olderProfile.capacity, 1);
  assert.equal(olderProfile.tierCap, 3);
  assert.ok(olderProfile.avoidEarly.includes('balance_challenge'));

  const postpartum = deriveProfile(personaByName('postpartum').answers, personaByName('postpartum').intake);
  assert.equal(postpartum.loadCap, 'light');
  assert.equal(postpartum.tierCap, 3);
  assert.ok(postpartum.earlyWeeks >= 3);
  assert.ok(postpartum.avoidEarly.includes('high_iap'));
  assert.equal(postpartum.flags.postpartum, true);
  assert.equal(postpartum.flags.pregnant, false);

  for (const name of PERSONA_NAMES) {
    const persona = personaByName(name);
    const profile = deriveProfile(persona.answers, persona.intake);
    assert.equal(Math.abs(sumEmphasis(profile) - 1) < 0.001, true, name);
    for (const tag of profile.avoid) assert.equal(profile.avoidEarly.includes(tag), false, tag);
  }
});

test('random plans stay inside the clinical and schema bounds', { timeout: 180_000 }, () => {
  const rng = mulberry32(20261115);
  const emptyTotals: Record<string, number> = {
    prep: 0,
    mobility: 0,
    control: 0,
    glute: 0,
    hinge: 0,
    legs: 0,
    pull: 0,
    cooldown: 0,
  };
  const budgetStats = {
    total: 0,
    within: 0,
    overHard: 0,
    byMinutes: {
      15: { total: 0, within: 0, overHard: 0 },
      20: { total: 0, within: 0, overHard: 0 },
      30: { total: 0, within: 0, overHard: 0 },
    } as Record<15 | 20 | 30, { total: number; within: number; overHard: number }>,
  };
  const deltaCounts = new Map<number, number>();
  let gentleChecked = 0;
  let plans = 0;

  for (let index = 0; index < 3000; index++) {
    const pair = randomPair(rng);
    assert.equal(intakeSchema.safeParse(pair.intake).success, true, `intake ${index}`);
    for (const level of LEVELS) {
      const input = inputFor(pair, level);
      const inspected = engine.inspectPlanV2(input);
      const again = engine.buildPlanV2(input);
      assert.deepEqual(again, inspected.plan);
      assertPlanShape(inspected.plan, pair, inspected.profile);
      assertPatternLadder(inspected.plan);
      plans += 1;
      for (const [kind, count] of Object.entries(inspected.emptyByKind)) {
        emptyTotals[kind] = (emptyTotals[kind] ?? 0) + count;
      }
      if (inspected.profile.gentleStart) {
        gentleChecked += 1;
        for (const session of inspected.plan.sessions) {
          if (session.week_number > 2) continue;
          for (const exercise of session.exercises) {
            const catalog = byId.get(exercise.exercise_id);
            assert.ok(catalog);
            const setCap = pair.intake.age_band === '70p' ? 2 : 4;
            assert.ok((exercise.sets ?? 0) <= setCap);
            assert.ok(catalog.intensity_tier <= Math.max(2, inspected.profile.tierCap));
          }
        }
      }
      for (const session of inspected.plan.sessions) {
        const budget = pair.intake.minutes;
        const delta = session.estimated_minutes - budget;
        budgetStats.total += 1;
        budgetStats.byMinutes[budget].total += 1;
        if (delta >= -8 && delta <= 4) {
          budgetStats.within += 1;
          budgetStats.byMinutes[budget].within += 1;
        }
        if (delta > 6) {
          budgetStats.overHard += 1;
          budgetStats.byMinutes[budget].overHard += 1;
        }
        deltaCounts.set(delta, (deltaCounts.get(delta) ?? 0) + 1);
      }
    }
  }

  console.log(`plans ${plans}, gentle-start plans ${gentleChecked}`);
  console.log(`empty slots ${JSON.stringify(emptyTotals)}`);
  console.log(`time budget ${JSON.stringify(budgetStats)}`);
  const deltas = [...deltaCounts.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`minute deltas ${deltas.map(([delta, count]) => `${delta}:${count}`).join(' ')}`);
  assert.ok(gentleChecked > 0);
  assert.equal(budgetStats.overHard, 0);
});

test('start week 3 is the tail of the full plan', () => {
  const pair = personaByName('desk_chronic');
  const full = engine.buildPlanV2(inputFor(pair));
  const tail = engine.buildPlanV2(inputFor(pair, undefined, 3));
  assert.equal(tail.start_week, 3);
  assert.deepEqual(
    tail.sessions,
    full.sessions.filter((session) => session.week_number >= 3),
  );
  const reset = engine.buildPlanV2(inputFor(pair, undefined, 99));
  assert.equal(reset.start_week, 1);
  assert.deepEqual(reset.sessions, full.sessions);
});

test('direction: flexion prep, stenosis extension ban, below-knee hamstring ban', () => {
  const desk = engine.inspectPlanV2(inputFor(personaByName('desk_chronic')));
  const week1 = desk.plan.sessions.filter((session) => session.week_number === 1);
  assert.ok(week1.length > 0);
  for (const session of week1) {
    assert.equal(nameById.get(session.exercises[0]?.exercise_id ?? ''), 'McKenzie Press-Up');
  }
  for (const session of desk.plan.sessions) {
    if (session.week_number > 3) continue;
    for (const exercise of session.exercises) {
      assert.notEqual(nameById.get(exercise.exercise_id), "Child's Pose Hold");
    }
  }

  const stenosis = engine.inspectPlanV2(inputFor(personaByName('stenosis_older')));
  let eased = false;
  for (const session of stenosis.plan.sessions) {
    for (const exercise of session.exercises) {
      const name = nameById.get(exercise.exercise_id);
      assert.notEqual(name, 'McKenzie Press-Up');
      assert.notEqual(name, 'Back Extension (45°)');
      if (name === "Child's Pose Hold" || name === 'Cat-Cow Stretch') eased = true;
    }
  }
  assert.equal(eased, true);

  const sciatica = engine.inspectPlanV2(inputFor(personaByName('sciatica_below_knee')));
  for (const session of sciatica.plan.sessions) {
    for (const exercise of session.exercises) {
      assert.notEqual(nameById.get(exercise.exercise_id), 'Supine Hamstring Stretch');
    }
  }
});

function assertPatternLadder(plan: ResolvedPlan): void {
  const ladder = new Set([
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
  const progress = new Map<string, { tier: number; weeks: Set<number> }>();
  const weeks = [...new Set(plan.sessions.map((session) => session.week_number))].sort((a, b) => a - b);
  for (const week of weeks) {
    const seen = new Map<string, number>();
    for (const session of plan.sessions) {
      if (session.week_number !== week) continue;
      for (const exercise of session.exercises) {
        const catalog = byId.get(exercise.exercise_id);
        if (!catalog || !ladder.has(catalog.movement_pattern)) continue;
        const current = seen.get(catalog.movement_pattern) ?? 0;
        if (catalog.intensity_tier > current) seen.set(catalog.movement_pattern, catalog.intensity_tier);
      }
    }
    for (const [pattern, tier] of seen) {
      const prior = progress.get(pattern);
      if (!prior) {
        progress.set(pattern, { tier, weeks: new Set([week]) });
        continue;
      }
      if (tier > prior.tier) {
        assert.equal(tier, prior.tier + 1, `${pattern} skipped a rung in week ${week}`);
        assert.ok(prior.weeks.size >= 2, `${pattern} rose after ${prior.weeks.size} week(s)`);
        prior.tier = tier;
        prior.weeks = new Set([week]);
      } else if (tier === prior.tier) {
        prior.weeks.add(week);
      }
    }
  }
}

test('gentle weeks stay inside the three to six slot range', () => {
  for (const name of ['acute_sharp', 'sensitized_fibro'] as const) {
    const plan = engine.buildPlanV2(inputFor(personaByName(name)));
    for (const session of plan.sessions) {
      assert.ok(
        session.exercises.length >= 3 && session.exercises.length <= 6,
        `${name} week ${session.week_number} has ${session.exercises.length}`,
      );
    }
  }
});

test('control slots alternate across a lower-back bodyweight week', () => {
  const plan = engine.inspectPlanV2(inputFor(personaByName('desk_chronic'))).plan;
  const control = new Set(['core_activation', 'spinal_stability', 'anti_rotation']);
  for (let week = 1; week <= plan.duration_weeks; week++) {
    const ids = new Set<string>();
    let sessionsWithControl = 0;
    for (const session of plan.sessions) {
      if (session.week_number !== week) continue;
      const found = session.exercises.filter((exercise) =>
        control.has(byId.get(exercise.exercise_id)?.movement_pattern ?? ''),
      );
      if (found.length === 0) continue;
      sessionsWithControl += 1;
      for (const exercise of found) ids.add(exercise.exercise_id);
    }
    if (sessionsWithControl >= 2) {
      assert.ok(ids.size >= 2, `week ${week} repeated one control exercise`);
    }
  }
});

test('an extra set does not remove an exercise', () => {
  const desk = engine.inspectPlanV2(inputFor(personaByName('desk_chronic')));
  for (const session of desk.plan.sessions) {
    const boosted = session.exercises.some((exercise) => {
      const catalog = byId.get(exercise.exercise_id);
      return catalog != null && catalog.sets != null && exercise.sets != null && exercise.sets > catalog.sets;
    });
    if (!boosted) continue;
    assert.ok(session.estimated_minutes <= 18);
    assert.ok(session.exercises.length >= 3);
  }
  const rng = mulberry32(7);
  for (let index = 0; index < 40; index++) {
    const pair = randomPair(rng);
    const inspected = engine.inspectPlanV2(inputFor(pair, 0));
    for (const session of inspected.plan.sessions) {
      const boosted = session.exercises.some((exercise) => {
        const catalog = byId.get(exercise.exercise_id);
        return catalog != null && catalog.sets != null && exercise.sets != null && exercise.sets > catalog.sets;
      });
      if (!boosted) continue;
      assert.ok(session.estimated_minutes <= pair.intake.minutes + 3);
      assert.ok(session.exercises.length >= 3);
    }
  }
});

test('low-irritability gym work gets harder, and a level never lowers the target', () => {
  const pair = makePersona({
    activity: 'light',
    equipment: 'gym',
    goals: ['return_to_exercise'],
    sessions: 4,
    intake: {
      duration_detail: '5y_plus',
      intensity: 1,
      flare_settle: 'none',
      limitation: 'some_days',
      trend: 'better',
      hard_now: ['exercise'],
      minutes: 30,
      movement_feel: ['weak'],
    },
  });
  const level0 = engine.inspectPlanV2(inputFor(pair, 0));
  const level1 = engine.inspectPlanV2(inputFor(pair, 1));
  assert.equal(level0.profile.irritability, 'low');
  assert.equal(level0.profile.capacity, 2);
  const maxTier = (inspection: Inspection, week: number) =>
    Math.max(
      ...inspection.plan.sessions
        .filter((session) => session.week_number === week)
        .flatMap((session) => session.exercises.map((exercise) => byId.get(exercise.exercise_id)?.intensity_tier ?? 0)),
    );
  assert.ok(maxTier(level0, level0.plan.duration_weeks) > maxTier(level0, 1));
  for (let index = 0; index < level0.outline.weeks.length; index++) {
    const early = level0.outline.weeks[index];
    const later = level1.outline.weeks[index];
    assert.ok(early && later);
    assert.ok(later.target_tier >= early.target_tier);
  }
  assertHolds(level0.holds);
  assertHolds(engine.inspectPlanV2(inputFor(personaByName('gym_returner'))).holds);
});

test('long programs never repeat the same week three times in a row', () => {
  for (const name of PERSONA_NAMES) {
    for (const level of LEVELS) {
      const plan = engine.buildPlanV2(inputFor(personaByName(name), level));
      const weekSignature = (week: number) =>
        JSON.stringify(
          plan.sessions
            .filter((session) => session.week_number === week)
            .map((session) =>
              session.exercises.map((exercise) => [
                exercise.exercise_id,
                exercise.sets,
                exercise.reps,
                exercise.duration_seconds,
                exercise.load_tier,
              ]),
            ),
        );
      let repeats = 0;
      for (let week = 2; week <= plan.duration_weeks; week++) {
        repeats = weekSignature(week) === weekSignature(week - 1) ? repeats + 1 : 0;
        assert.ok(repeats < 2, `${name} level ${level}: week ${week} repeats`);
      }
    }
  }
});
