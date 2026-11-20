// Intake schema, legacy derivation, and clinical profile.
// Expected profile numbers are hand-computed from spec 01, not from deriveProfile.
// Usage: npx tsx --test scripts/verify_intake.ts
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  deriveLegacyTriggers,
  deriveProfile,
  durationBucketFor,
  intakeSchema,
  isLegLike,
  normalizeIntake,
  nsScoreOf,
  type ClinicalProfile,
  type Intake,
  type LegacyAnswers,
} from '../lib/intake';

const QUIET_NS: Intake['ns'] = {
  predictable: 'yes',
  small_triggers: 'no',
  stress: 'no',
  anticipation: 'no',
  avoidance: 'no',
};

const QUIET_FLAGS: ClinicalProfile['flags'] = {
  redFlag: false,
  clinicianFirst: false,
  postSurgery: false,
  pregnant: false,
  postpartum: false,
  osteoporosis: false,
  fibromyalgia: false,
  olderAdult: false,
};

type IntakeOver = Partial<Omit<Intake, 'ns'>> & { ns?: Partial<Intake['ns']> };

function makeAnswers(over: Partial<LegacyAnswers> = {}): LegacyAnswers {
  return {
    pain_location: 'lower',
    pain_duration: 'chronic',
    pain_type: ['ache'],
    activity_level: 'light',
    pain_trigger: ['other'],
    equipment: 'open_space',
    main_goal: [],
    sessions_per_week_preference: 3,
    ...over,
  };
}

function makeIntake(over: IntakeOver = {}): Intake {
  const { ns: nsOver, ...rest } = over;
  return {
    v: 1,
    hard_now: [],
    spread: 'one_spot',
    leg_reach: null,
    duration_detail: '3_12m',
    onset: 'gradual',
    intensity: 0,
    movement_feel: [],
    relief_direction: 'neither',
    flare_settle: 'none',
    trend: 'same',
    limitation: 'none',
    tried: [],
    conditions: [],
    age_band: '30_44',
    minutes: 20,
    red_flags: [],
    red_flag_ack: false,
    ...rest,
    ns: { ...QUIET_NS, ...nsOver },
  };
}

function profile(answerOver?: Partial<LegacyAnswers>, intakeOver?: IntakeOver): ClinicalProfile {
  return deriveProfile(makeAnswers(answerOver), makeIntake(intakeOver));
}

function assertEmphasis(
  actual: ClinicalProfile['emphasis'],
  expected: ClinicalProfile['emphasis'],
): void {
  const keys = ['mobility', 'control', 'strength', 'relaxation'] as const;
  let total = 0;
  for (const key of keys) {
    assert.equal(actual[key].toFixed(3), expected[key].toFixed(3), key);
    total += Number(actual[key].toFixed(3).replace('.', ''));
  }
  assert.equal(total, 1000);
}

test('Deno mirror stays in sync with the client intake', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const client = readFileSync(join(root, 'lib/intake.ts'), 'utf8');
  const edge = readFileSync(join(root, 'supabase/functions/_shared/assignment/intake.ts'), 'utf8');
  const strip = (src: string) =>
    src
      .replace(/^[\s\S]*?\nexport const INTAKE_VERSION/m, 'export const INTAKE_VERSION')
      .replace(/\r\n/g, '\n');
  assert.equal(strip(client), strip(edge));
});

test('a valid intake parses and an unknown key is rejected', () => {
  const sample = makeIntake({
    hard_now: ['bed', 'sitting'],
    spread: 'leg',
    leg_reach: 'above_knee',
    duration_detail: '1_5y',
    onset: 'lifting',
    intensity: 4,
    movement_feel: ['stiff', 'weak'],
    relief_direction: 'extension',
    flare_settle: 'hours',
    trend: 'up_down',
    limitation: 'most_days',
    ns: { predictable: 'varies', small_triggers: 'sometimes' },
    tried: ['pt', 'rest'],
    conditions: ['arthritis'],
    age_band: '45_59',
    minutes: 15,
    red_flags: ['trauma'],
    red_flag_ack: true,
  });
  assert.equal(intakeSchema.safeParse(sample).success, true);
  assert.deepEqual(normalizeIntake(sample), sample);
  assert.equal(intakeSchema.safeParse({ ...sample, extra: 1 }).success, false);
  assert.equal(normalizeIntake({ ...sample, bonus: true }), null);
  assert.equal(
    intakeSchema.safeParse({ ...sample, ns: { ...sample.ns, extra: true } }).success,
    false,
  );
  const { intensity: _intensity, ...missing } = sample;
  assert.equal(normalizeIntake(missing), null);
  assert.equal(normalizeIntake({ ...sample, hard_now: ['bed', 'nope'] }), null);
});

test('normalizeIntake sorts arrays into enum order and clears leg reach when not asked', () => {
  const hardNow = ['sleep', 'bed', 'bed', 'walking'];
  const messy = {
    ...makeIntake(),
    hard_now: hardNow,
    movement_feel: ['guarded', 'stiff', 'stiff'],
    tried: ['rest', 'pt', 'pt'],
    conditions: ['pregnant', 'sciatica', 'sciatica'],
    red_flags: ['trauma', 'fever_unwell', 'trauma'],
    spread: 'one_spot' as const,
    leg_reach: 'foot' as const,
  };
  const out = normalizeIntake(messy);
  assert.deepEqual(out?.hard_now, ['bed', 'walking', 'sleep']);
  assert.deepEqual(out?.movement_feel, ['stiff', 'guarded']);
  assert.deepEqual(out?.tried, ['pt', 'rest']);
  const { tried: _droppedTried, ...withoutTried } = messy;
  assert.deepEqual(normalizeIntake(withoutTried)?.tried, []);
  assert.deepEqual(out?.conditions, ['sciatica', 'pregnant']);
  assert.deepEqual(out?.red_flags, ['fever_unwell', 'trauma']);
  assert.equal(out?.leg_reach, 'foot');
  assert.deepEqual(hardNow, ['sleep', 'bed', 'bed', 'walking']);

  assert.equal(
    normalizeIntake({ ...makeIntake(), spread: 'leg', leg_reach: 'below_knee' })?.leg_reach,
    'below_knee',
  );
  assert.equal(
    normalizeIntake({ ...makeIntake(), spread: 'one_spot', leg_reach: 'foot' }, ['ache', 'nerve'])
      ?.leg_reach,
    'foot',
  );
  assert.equal(
    normalizeIntake({ ...makeIntake(), conditions: ['sciatica'], leg_reach: 'foot' })?.leg_reach,
    'foot',
  );
});

test('deriveLegacyTriggers maps hard-now into the legacy trigger order', () => {
  assert.deepEqual(deriveLegacyTriggers([]), ['other']);
  assert.deepEqual(deriveLegacyTriggers(['stairs', 'twisting', 'overhead', 'sleep']), ['other']);
  assert.deepEqual(deriveLegacyTriggers(['walking']), ['standing']);
  assert.deepEqual(deriveLegacyTriggers(['standing', 'walking']), ['standing']);
  assert.deepEqual(deriveLegacyTriggers(['bed']), ['morning']);
  assert.deepEqual(deriveLegacyTriggers(['exercise', 'bed', 'sitting', 'bending', 'walking']), [
    'sitting',
    'bending',
    'standing',
    'morning',
    'exercise',
  ]);
  assert.deepEqual(deriveLegacyTriggers(['sleep', 'exercise', 'sleep']), ['exercise']);
});

test('duration detail buckets into the legacy pain duration', () => {
  assert.equal(durationBucketFor('lt_2w'), 'acute');
  assert.equal(durationBucketFor('2w_3m'), 'subacute');
  assert.equal(durationBucketFor('3_12m'), 'chronic');
  assert.equal(durationBucketFor('1_5y'), 'chronic');
  assert.equal(durationBucketFor('5y_plus'), 'chronic');
});

test('leg-like and nervous-system score helpers', () => {
  assert.equal(isLegLike(['ache'], 'leg'), true);
  assert.equal(isLegLike(['nerve'], 'one_spot'), true);
  assert.equal(isLegLike(['ache'], 'one_spot', ['sciatica']), true);
  assert.equal(isLegLike(['ache'], 'one_spot'), false);
  assert.equal(isLegLike(['ache'], undefined), false);
  assert.equal(isLegLike(['sharp'], 'moves', []), false);

  assert.equal(nsScoreOf(QUIET_NS, 'one_spot'), 0);
  assert.equal(
    nsScoreOf({ ...QUIET_NS, predictable: 'varies', small_triggers: 'sometimes' }, 'moves'),
    3,
  );
  assert.equal(
    nsScoreOf(
      {
        predictable: 'no',
        small_triggers: 'yes',
        stress: 'yes',
        anticipation: 'yes',
        avoidance: 'yes',
      },
      'moves',
    ),
    10,
  );
});

test('a quiet intake is a low-irritability build profile', () => {
  const p = profile();
  assert.equal(p.irritability, 'low');
  assert.equal(p.irritabilityScore, 0);
  assert.equal(p.bias, 'neutral');
  assert.equal(p.biasStrength, 'none');
  assert.equal(p.sensitization, 'low');
  assert.equal(p.nsScore, 0);
  assert.equal(p.fear, 'low');
  assert.equal(p.radicular, 'none');
  assert.equal(p.mode, 'build');
  assertEmphasis(p.emphasis, { mobility: 0.15, control: 0.3, strength: 0.5, relaxation: 0.05 });
  assert.equal(p.exposureBending, false);
  assert.equal(p.unilateralFocus, false);
  assert.deepEqual(p.functionTargets, []);
  assert.deepEqual(p.avoid, []);
  assert.deepEqual(p.avoidEarly, []);
  assert.equal(p.earlyWeeks, 0);
  assert.equal(p.gentleStart, false);
  assert.equal(p.loadCap, 'full');
  assert.equal(p.capacity, 2);
  assert.equal(p.tierCap, 5);
  assert.equal(p.slotDelta, 0);
  assert.deepEqual(p.flags, QUIET_FLAGS);
});

test('irritability is low just below 3', () => {
  const p = profile({}, { intensity: 7, limitation: 'some_days' });
  assert.equal(p.irritabilityScore, 2.5);
  assert.equal(p.irritability, 'low');
  assert.equal(p.mode, 'build');
});

test('irritability is moderate at 3', () => {
  const p = profile({ activity_level: 'athlete' }, { intensity: 8, limitation: 'none' });
  assert.equal(p.irritabilityScore, 3);
  assert.equal(p.irritability, 'moderate');
  assert.equal(p.mode, 'control');
  assert.equal(p.capacity, 1);
  assert.equal(p.slotDelta, 0);
  assert.equal(p.gentleStart, false);
});

test('irritability stays moderate just below 6.5', () => {
  const p = profile({}, { intensity: 8, flare_settle: 'days' });
  assert.equal(p.irritabilityScore, 6);
  assert.equal(p.irritability, 'moderate');
  assert.equal(p.mode, 'control');
  assert.equal(p.slotDelta, 0);
  assert.equal(p.gentleStart, false);
  assert.equal(p.capacity, 1);
});

test('irritability is high at 6.5', () => {
  const p = profile({}, { intensity: 8, flare_settle: 'days', limitation: 'some_days' });
  assert.equal(p.irritabilityScore, 6.5);
  assert.equal(p.irritability, 'high');
  assert.equal(p.mode, 'calm');
  assert.equal(p.capacity, 1);
  assert.equal(p.slotDelta, -1);
  assert.equal(p.gentleStart, true);
});

test('each irritability term adds its specified points', () => {
  const score = (answerOver?: Partial<LegacyAnswers>, intakeOver?: IntakeOver) =>
    profile(answerOver, intakeOver).irritabilityScore;

  for (const intensity of [0, 1, 2, 3]) assert.equal(score({}, { intensity }), 0, `i${intensity}`);
  assert.equal(score({}, { intensity: 4 }), 1);
  assert.equal(score({}, { intensity: 5 }), 1);
  assert.equal(score({}, { intensity: 6 }), 2);
  assert.equal(score({}, { intensity: 7 }), 2);
  assert.equal(score({}, { intensity: 8 }), 3);
  assert.equal(score({}, { intensity: 9 }), 3);
  assert.equal(score({}, { intensity: 10 }), 3);

  assert.equal(score({}, { flare_settle: 'none' }), 0);
  assert.equal(score({}, { flare_settle: 'minutes' }), 0);
  assert.equal(score({}, { flare_settle: 'hours' }), 1);
  assert.equal(score({}, { flare_settle: 'day' }), 2);
  assert.equal(score({}, { flare_settle: 'days' }), 3);

  assert.equal(score({}, { ns: { small_triggers: 'no' } }), 0);
  assert.equal(score({}, { ns: { small_triggers: 'sometimes' } }), 1);
  assert.equal(score({}, { ns: { small_triggers: 'yes' } }), 2);

  assert.equal(score({}, { limitation: 'none' }), 0);
  assert.equal(score({}, { limitation: 'little' }), 0);
  assert.equal(score({}, { limitation: 'unsure' }), 0);
  assert.equal(score({}, { limitation: 'some_days' }), 0.5);
  assert.equal(score({}, { limitation: 'most_days' }), 1);
  assert.equal(score({}, { limitation: 'a_lot' }), 1.5);

  assert.equal(score({}, { trend: 'same' }), 0);
  assert.equal(score({}, { trend: 'up_down' }), 0);
  assert.equal(score({}, { trend: 'worse' }), 1);
  assert.equal(score({}, { trend: 'better' }), 0);
  assert.equal(score({}, { intensity: 4, trend: 'better' }), 0.5);
  assert.equal(score({}, { intensity: 6, trend: 'better' }), 1.5);

  assert.equal(score({ pain_type: ['sharp'] }), 0.5);
  assert.equal(score({ pain_type: ['nerve'] }), 0.5);
  assert.equal(score({ pain_type: ['sharp', 'nerve'] }), 1);

  assert.equal(score({}, { duration_detail: 'lt_2w' }), 1);
  assert.equal(score({}, { duration_detail: '2w_3m' }), 0);
  assert.equal(score({}, { duration_detail: '5y_plus' }), 0);

  assert.equal(
    score({ pain_type: ['sharp'] }, { intensity: 6, limitation: 'some_days', trend: 'better' }),
    2.5,
  );
});

test('irritability clamps to 0 and 10 before rounding', () => {
  assert.equal(profile({}, { trend: 'better' }).irritabilityScore, 0);
  const topped = profile(
    { pain_type: ['sharp', 'nerve'] },
    {
      intensity: 10,
      flare_settle: 'days',
      limitation: 'a_lot',
      trend: 'worse',
      duration_detail: 'lt_2w',
      ns: { small_triggers: 'yes' },
    },
  );
  assert.equal(topped.irritabilityScore, 10);
  assert.equal(topped.irritability, 'high');
});

test('flexion bias boundaries and early flexion limits', () => {
  const bed = profile({}, { hard_now: ['bed'] });
  assert.equal(bed.bias, 'neutral');
  assert.equal(bed.biasStrength, 'none');
  assert.equal(bed.earlyWeeks, 0);
  assert.deepEqual(bed.avoidEarly, []);

  const sitting = profile({}, { hard_now: ['sitting'] });
  assert.equal(sitting.bias, 'flexion_sensitive');
  assert.equal(sitting.biasStrength, 'lean');
  assert.equal(sitting.earlyWeeks, 2);
  assert.deepEqual(sitting.avoidEarly, ['flexion_endrange', 'flexion_loaded']);
  assert.deepEqual(sitting.avoid, []);
  assert.equal(sitting.exposureBending, false);

  const sittingBed = profile({}, { hard_now: ['sitting', 'bed'] });
  assert.equal(sittingBed.biasStrength, 'lean');
  assert.equal(sittingBed.bias, 'flexion_sensitive');

  const clearPair = profile({}, { hard_now: ['sitting', 'bending'] });
  assert.equal(clearPair.bias, 'flexion_sensitive');
  assert.equal(clearPair.biasStrength, 'clear');
  assert.equal(clearPair.earlyWeeks, 3);
  assert.equal(clearPair.exposureBending, true);
  assert.deepEqual(clearPair.avoidEarly, ['flexion_endrange', 'flexion_loaded']);

  const relief = profile({}, { relief_direction: 'extension' });
  assert.equal(relief.bias, 'flexion_sensitive');
  assert.equal(relief.biasStrength, 'clear');
  assert.equal(relief.earlyWeeks, 3);

  const disc = profile({}, { conditions: ['herniated_disc'] });
  assert.equal(disc.bias, 'flexion_sensitive');
  assert.equal(disc.biasStrength, 'lean');
  assert.equal(disc.radicular, 'none');

  const discSitting = profile({}, { conditions: ['herniated_disc'], hard_now: ['sitting'] });
  assert.equal(discSitting.biasStrength, 'clear');

  const sciatica = profile({}, { conditions: ['sciatica'] });
  assert.equal(sciatica.bias, 'neutral');
  assert.equal(sciatica.biasStrength, 'none');
  assert.equal(sciatica.radicular, 'referred');

  const bedSciatica = profile({}, { conditions: ['sciatica'], hard_now: ['bed'] });
  assert.equal(bedSciatica.bias, 'flexion_sensitive');
  assert.equal(bedSciatica.biasStrength, 'lean');
  assert.deepEqual(bedSciatica.avoidEarly, ['flexion_endrange', 'flexion_loaded', 'neural_tension']);
  assert.equal(bedSciatica.earlyWeeks, 2);
});

test('extension bias boundaries and early extension limits', () => {
  const overhead = profile({}, { hard_now: ['overhead'] });
  assert.equal(overhead.bias, 'neutral');
  assert.equal(overhead.biasStrength, 'none');
  assert.deepEqual(overhead.avoidEarly, []);

  const standing = profile({}, { hard_now: ['standing'] });
  assert.equal(standing.bias, 'extension_sensitive');
  assert.equal(standing.biasStrength, 'lean');
  assert.equal(standing.earlyWeeks, 2);
  assert.deepEqual(standing.avoidEarly, ['extension_endrange', 'extension_loaded']);
  assert.deepEqual(standing.avoid, []);

  const walkStand = profile({}, { hard_now: ['standing', 'walking'] });
  assert.equal(walkStand.biasStrength, 'clear');
  assert.equal(walkStand.earlyWeeks, 3);
  assert.deepEqual(walkStand.avoidEarly, ['extension_endrange', 'extension_loaded']);

  const relief = profile({}, { relief_direction: 'flexion' });
  assert.equal(relief.bias, 'extension_sensitive');
  assert.equal(relief.biasStrength, 'clear');

  const deeper = profile({}, { hard_now: ['standing', 'walking', 'overhead'] });
  assert.equal(deeper.biasStrength, 'clear');

  const arthritis = profile({}, { conditions: ['arthritis'] });
  assert.equal(arthritis.bias, 'neutral');
  assert.deepEqual(arthritis.avoid, []);

  const arthritisOverhead = profile({}, { conditions: ['arthritis'], hard_now: ['overhead'] });
  assert.equal(arthritisOverhead.bias, 'extension_sensitive');
  assert.equal(arthritisOverhead.biasStrength, 'lean');

  const age60 = profile({}, { age_band: '60_69' });
  assert.equal(age60.bias, 'neutral');
  assert.equal(age60.tierCap, 4);
  assert.equal(age60.flags.olderAdult, true);
  assert.deepEqual(age60.avoidEarly, []);
  assert.equal(age60.earlyWeeks, 0);

  const age70 = profile({}, { age_band: '70p' });
  assert.equal(age70.bias, 'neutral');
  assert.equal(age70.tierCap, 3);
  assert.deepEqual(age70.avoidEarly, ['balance_challenge']);
  assert.equal(age70.earlyWeeks, 2);

  const age70Arthritis = profile({}, { age_band: '70p', conditions: ['arthritis'] });
  assert.equal(age70Arthritis.bias, 'extension_sensitive');
  assert.equal(age70Arthritis.biasStrength, 'lean');
  assert.deepEqual(age70Arthritis.avoidEarly, [
    'extension_endrange',
    'extension_loaded',
    'balance_challenge',
  ]);

  const cancelled = profile({}, { hard_now: ['sitting', 'bending', 'standing', 'walking'] });
  assert.equal(cancelled.bias, 'neutral');
  assert.equal(cancelled.biasStrength, 'none');
  assert.deepEqual(cancelled.avoid, []);
  assert.deepEqual(cancelled.avoidEarly, []);
  assert.equal(cancelled.earlyWeeks, 0);
});

test('high sensitization overrides a lean bias only', () => {
  const loud: IntakeOver['ns'] = {
    predictable: 'no',
    small_triggers: 'yes',
    stress: 'yes',
  };
  const overridden = profile({}, { hard_now: ['sitting'], spread: 'moves', duration_detail: '1_5y', ns: loud });
  assert.equal(overridden.nsScore, 7);
  assert.equal(overridden.sensitization, 'high');
  assert.equal(overridden.irritability, 'low');
  assert.equal(overridden.bias, 'neutral');
  assert.equal(overridden.biasStrength, 'none');
  assert.deepEqual(overridden.avoidEarly, []);

  const noSpread = profile({}, { hard_now: ['sitting'], spread: 'one_spot', duration_detail: '1_5y', ns: loud });
  assert.equal(noSpread.nsScore, 6);
  assert.equal(noSpread.sensitization, 'high');
  assert.equal(noSpread.bias, 'flexion_sensitive');
  assert.equal(noSpread.biasStrength, 'lean');

  const tooSoon = profile({}, { hard_now: ['sitting'], spread: 'moves', duration_detail: '2w_3m', ns: loud });
  assert.equal(tooSoon.sensitization, 'some');
  assert.equal(tooSoon.bias, 'flexion_sensitive');
  assert.equal(tooSoon.biasStrength, 'lean');

  const clear = profile({}, {
    relief_direction: 'extension',
    spread: 'moves',
    duration_detail: '5y_plus',
    ns: loud,
  });
  assert.equal(clear.sensitization, 'high');
  assert.equal(clear.bias, 'flexion_sensitive');
  assert.equal(clear.biasStrength, 'clear');
  assert.equal(clear.earlyWeeks, 3);

  const extensionLean = profile({}, {
    hard_now: ['standing'],
    spread: 'moves',
    conditions: ['fibromyalgia'],
    duration_detail: 'lt_2w',
  });
  assert.equal(extensionLean.sensitization, 'high');
  assert.equal(extensionLean.bias, 'neutral');
  assert.equal(extensionLean.biasStrength, 'none');
});

test('sensitization needs three months unless fibromyalgia is present', () => {
  const level = (intakeOver: IntakeOver) => {
    const p = profile({}, intakeOver);
    return { sensitization: p.sensitization, nsScore: p.nsScore };
  };

  assert.deepEqual(level({ duration_detail: '5y_plus', ns: { predictable: 'no' } }), {
    sensitization: 'low',
    nsScore: 2,
  });
  assert.deepEqual(
    level({
      duration_detail: 'lt_2w',
      ns: { predictable: 'varies', small_triggers: 'sometimes', stress: 'sometimes' },
    }),
    { sensitization: 'some', nsScore: 3 },
  );
  const six = { predictable: 'no' as const, small_triggers: 'yes' as const, stress: 'yes' as const };
  assert.equal(level({ duration_detail: '2w_3m', ns: six }).sensitization, 'some');
  assert.equal(level({ duration_detail: '3_12m', ns: six }).sensitization, 'high');
  assert.equal(level({ duration_detail: '1_5y', ns: six }).sensitization, 'high');
  assert.equal(level({ duration_detail: '5y_plus', ns: six }).sensitization, 'high');
  assert.equal(level({ duration_detail: 'lt_2w', ns: six }).sensitization, 'some');

  const five = { predictable: 'no' as const, small_triggers: 'yes' as const, stress: 'sometimes' as const };
  assert.deepEqual(level({ duration_detail: '5y_plus', spread: 'one_spot', ns: five }), {
    sensitization: 'some',
    nsScore: 5,
  });
  assert.deepEqual(level({ duration_detail: '3_12m', spread: 'moves', ns: five }), {
    sensitization: 'high',
    nsScore: 6,
  });

  const fibro = profile({}, { conditions: ['fibromyalgia'], duration_detail: '2w_3m' });
  assert.equal(fibro.nsScore, 0);
  assert.equal(fibro.sensitization, 'high');
  assert.equal(fibro.irritability, 'low');
  assert.equal(fibro.flags.fibromyalgia, true);
});

test('fear of movement thresholds', () => {
  assert.equal(profile().fear, 'low');
  assert.equal(profile({}, { ns: { avoidance: 'sometimes' } }).fear, 'some');
  assert.equal(profile({}, { movement_feel: ['unsafe'] }).fear, 'some');
  assert.equal(profile({}, { movement_feel: ['guarded'] }).fear, 'some');
  assert.equal(profile({}, { ns: { anticipation: 'yes' } }).fear, 'some');
  assert.equal(profile({}, { ns: { anticipation: 'sometimes' } }).fear, 'low');
  assert.equal(profile({}, { ns: { avoidance: 'yes' }, movement_feel: ['guarded'] }).fear, 'high');
  assert.equal(
    profile({}, {
      ns: { avoidance: 'yes', anticipation: 'yes' },
      movement_feel: ['unsafe', 'guarded'],
    }).fear,
    'high',
  );
});

test('radicular level follows leg-like spread, nerve pain, and sciatica', () => {
  const stray = profile({}, { spread: 'one_spot', leg_reach: 'foot' });
  assert.equal(stray.radicular, 'none');
  assert.deepEqual(stray.avoid, []);
  assert.deepEqual(stray.avoidEarly, []);

  const above = profile({}, { spread: 'leg', leg_reach: 'above_knee' });
  assert.equal(above.radicular, 'referred');
  assert.deepEqual(above.avoid, []);
  assert.deepEqual(above.avoidEarly, ['neural_tension']);
  assert.equal(above.earlyWeeks, 2);

  const missingReach = profile({}, { spread: 'leg', leg_reach: null });
  assert.equal(missingReach.radicular, 'referred');

  const below = profile({}, { spread: 'leg', leg_reach: 'below_knee' });
  assert.equal(below.radicular, 'below_knee');
  assert.deepEqual(below.avoid, ['neural_tension']);
  assert.deepEqual(below.avoidEarly, []);
  assert.equal(below.earlyWeeks, 0);

  const foot = profile({}, { spread: 'leg', leg_reach: 'foot' });
  assert.equal(foot.radicular, 'below_knee');
  assert.deepEqual(foot.avoid, ['neural_tension']);

  const nerve = profile({ pain_type: ['nerve'] }, { spread: 'one_side', leg_reach: 'above_knee' });
  assert.equal(nerve.radicular, 'referred');
  assert.equal(nerve.unilateralFocus, true);
  assert.deepEqual(nerve.avoidEarly, ['flexion_loaded', 'neural_tension']);
  assert.equal(nerve.earlyWeeks, 2);
  assert.equal(nerve.irritabilityScore, 0.5);

  const nerveFoot = profile({ pain_type: ['nerve'] }, { spread: 'one_spot', leg_reach: 'foot' });
  assert.equal(nerveFoot.radicular, 'below_knee');
  assert.deepEqual(nerveFoot.avoid, ['neural_tension']);
  assert.deepEqual(nerveFoot.avoidEarly, ['flexion_loaded']);

  const sciaticaBelow = profile({}, { conditions: ['sciatica'], spread: 'one_spot', leg_reach: 'below_knee' });
  assert.equal(sciaticaBelow.radicular, 'below_knee');
  assert.equal(sciaticaBelow.bias, 'neutral');
});

test('mode and starting capacity', () => {
  assert.equal(profile().mode, 'build');
  assert.equal(profile().capacity, 2);
  assert.equal(profile({ activity_level: 'sedentary' }).capacity, 2);
  assert.equal(profile({ activity_level: 'active' }, { limitation: 'none' }).capacity, 3);
  assert.equal(profile({ activity_level: 'athlete' }, { limitation: 'little' }).capacity, 3);
  assert.equal(profile({ activity_level: 'active' }, { limitation: 'some_days' }).capacity, 2);
  assert.equal(profile({ activity_level: 'active' }, { limitation: 'unsure' }).capacity, 2);

  const olderAthlete = profile({ activity_level: 'athlete' }, { limitation: 'none', age_band: '70p' });
  assert.equal(olderAthlete.capacity, 1);
  assert.equal(olderAthlete.mode, 'build');
  assert.equal(olderAthlete.bias, 'neutral');

  const sixties = profile({ activity_level: 'active' }, { limitation: 'none', age_band: '60_69' });
  assert.equal(sixties.capacity, 2);
  assert.equal(sixties.tierCap, 4);
  assert.deepEqual(sixties.avoidEarly, []);

  const moderate = profile({ activity_level: 'athlete' }, { intensity: 8, limitation: 'none' });
  assert.equal(moderate.mode, 'control');
  assert.equal(moderate.capacity, 1);

  const high = profile(
    { activity_level: 'athlete' },
    { intensity: 10, flare_settle: 'days', limitation: 'some_days' },
  );
  assert.equal(high.irritabilityScore, 6.5);
  assert.equal(high.mode, 'calm');
  assert.equal(high.capacity, 1);
});

test('tier cap takes the strictest matching limit', () => {
  assert.equal(profile().tierCap, 5);
  assert.equal(profile({}, { age_band: '60_69' }).tierCap, 4);
  assert.equal(profile({}, { age_band: '70p' }).tierCap, 3);
  assert.equal(profile({}, { conditions: ['pregnant'] }).tierCap, 2);
  assert.equal(profile({}, { conditions: ['post_surgery'] }).tierCap, 2);
  assert.equal(profile({}, { onset: 'surgery' }).tierCap, 2);
  assert.equal(profile({}, { conditions: ['postpartum'] }).tierCap, 3);
  assert.equal(profile({}, { onset: 'pregnancy' }).tierCap, 5);
  assert.equal(profile({}, { conditions: ['osteoporosis'] }).tierCap, 3);
  assert.equal(profile({}, { age_band: '70p', conditions: ['pregnant'] }).tierCap, 2);
  assert.equal(profile({}, { conditions: ['osteoporosis', 'post_surgery'] }).tierCap, 2);
  assert.equal(profile({}, { age_band: '60_69', conditions: ['postpartum'] }).tierCap, 3);
  assert.equal(profile({}, { age_band: '70p', conditions: ['osteoporosis'] }).tierCap, 3);
  assert.equal(profile({}, { conditions: ['pregnant', 'postpartum'] }).tierCap, 2);
  assert.equal(profile({}, { onset: 'pregnancy', conditions: ['post_surgery'] }).tierCap, 2);
});

test('load cap prefers bodyweight over light', () => {
  assert.equal(profile().loadCap, 'full');
  assert.equal(profile({}, { conditions: ['osteoporosis'] }).loadCap, 'light');
  assert.equal(profile({}, { conditions: ['postpartum'] }).loadCap, 'light');
  assert.equal(profile({}, { onset: 'pregnancy' }).loadCap, 'full');
  assert.equal(profile({}, { conditions: ['pregnant'] }).loadCap, 'bodyweight');
  assert.equal(profile({}, { conditions: ['post_surgery'] }).loadCap, 'bodyweight');
  assert.equal(profile({}, { onset: 'surgery' }).loadCap, 'bodyweight');
  assert.equal(profile({}, { red_flags: ['fever_unwell'] }).loadCap, 'bodyweight');
  assert.equal(profile({}, { conditions: ['osteoporosis', 'pregnant'] }).loadCap, 'bodyweight');
  assert.equal(profile({}, { conditions: ['osteoporosis'], red_flags: ['trauma'] }).loadCap, 'bodyweight');
  assert.equal(profile({}, { conditions: ['postpartum'], red_flags: ['weight_loss'] }).loadCap, 'bodyweight');
});

test('gentle start turns on for each listed trigger', () => {
  assert.equal(profile().gentleStart, false);

  const high = profile({}, { intensity: 8, flare_settle: 'days', limitation: 'some_days' });
  assert.equal(high.irritability, 'high');
  assert.equal(high.sensitization, 'low');
  assert.equal(high.gentleStart, true);

  const sens = profile({}, {
    duration_detail: '3_12m',
    ns: { predictable: 'no', small_triggers: 'yes', stress: 'yes' },
  });
  assert.equal(sens.irritabilityScore, 2);
  assert.equal(sens.irritability, 'low');
  assert.equal(sens.nsScore, 6);
  assert.equal(sens.sensitization, 'high');
  assert.equal(sens.gentleStart, true);
  assert.equal(sens.slotDelta, 0);
  assert.equal(sens.flags.fibromyalgia, false);

  const fibro = profile({}, { conditions: ['fibromyalgia'], duration_detail: '2w_3m' });
  assert.equal(fibro.irritabilityScore, 0);
  assert.equal(fibro.gentleStart, true);
  assert.equal(fibro.slotDelta, -1);

  const pregnant = profile({}, { conditions: ['pregnant'] });
  assert.equal(pregnant.irritability, 'low');
  assert.equal(pregnant.sensitization, 'low');
  assert.equal(pregnant.gentleStart, true);

  assert.equal(profile({}, { conditions: ['post_surgery'] }).gentleStart, true);
  assert.equal(profile({}, { onset: 'surgery' }).gentleStart, true);

  const red = profile({}, { red_flags: ['saddle_bladder'] });
  assert.equal(red.gentleStart, true);
  assert.equal(red.flags.redFlag, true);
  assert.equal(red.irritability, 'low');

  const acute = profile({}, { duration_detail: 'lt_2w' });
  assert.equal(acute.irritabilityScore, 1);
  assert.equal(acute.irritability, 'low');
  assert.equal(acute.sensitization, 'low');
  assert.equal(acute.flags.redFlag, false);
  assert.equal(acute.gentleStart, true);
});

test('slot delta drops only for fibromyalgia or high irritability', () => {
  assert.equal(profile().slotDelta, 0);
  assert.equal(profile({}, { conditions: ['fibromyalgia'] }).slotDelta, -1);
  assert.equal(
    profile({}, { intensity: 8, flare_settle: 'days', limitation: 'some_days' }).slotDelta,
    -1,
  );
  assert.equal(profile({}, { intensity: 8, flare_settle: 'days' }).slotDelta, 0);
  assert.equal(
    profile({}, { conditions: ['fibromyalgia'], intensity: 8, flare_settle: 'days', limitation: 'a_lot' })
      .slotDelta,
    -1,
  );
});

test('unilateral focus, bending exposure, and canonical function targets', () => {
  assert.equal(profile().unilateralFocus, false);
  assert.equal(profile().exposureBending, false);
  assert.equal(profile({}, { spread: 'one_side' }).unilateralFocus, true);
  assert.equal(profile({}, { movement_feel: ['uneven'] }).unilateralFocus, true);
  assert.equal(profile({}, { spread: 'moves' }).unilateralFocus, false);

  const bending = profile({}, { hard_now: ['bending'] });
  assert.equal(bending.fear, 'low');
  assert.equal(bending.exposureBending, true);
  assert.equal(bending.bias, 'flexion_sensitive');
  assert.equal(bending.biasStrength, 'lean');

  const afraid = profile({}, { ns: { avoidance: 'sometimes' } });
  assert.equal(afraid.fear, 'some');
  assert.equal(afraid.exposureBending, true);
  assert.deepEqual(afraid.functionTargets, []);

  const sitting = profile({}, { hard_now: ['sitting'] });
  assert.equal(sitting.fear, 'low');
  assert.equal(sitting.exposureBending, false);

  const targets = profile({}, { hard_now: ['exercise', 'sleep', 'bed', 'bed', 'stairs'] });
  assert.deepEqual(targets.functionTargets, ['bed', 'stairs', 'sleep', 'exercise']);
});

test('emphasis follows mode, feels, and goals, and sums to 1', () => {
  assertEmphasis(profile().emphasis, { mobility: 0.15, control: 0.3, strength: 0.5, relaxation: 0.05 });

  const control = profile({}, { intensity: 8 });
  assert.equal(control.mode, 'control');
  assertEmphasis(control.emphasis, { mobility: 0.2, control: 0.45, strength: 0.25, relaxation: 0.1 });

  const calm = profile({}, { intensity: 8, flare_settle: 'days', limitation: 'a_lot' });
  assert.equal(calm.irritabilityScore, 7.5);
  assert.equal(calm.mode, 'calm');
  assertEmphasis(calm.emphasis, { mobility: 0.35, control: 0.35, strength: 0.05, relaxation: 0.25 });

  assertEmphasis(profile({}, { movement_feel: ['stiff'] }).emphasis, {
    mobility: 0.261,
    control: 0.261,
    strength: 0.435,
    relaxation: 0.043,
  });
  const weak = profile({}, { movement_feel: ['weak'] });
  assertEmphasis(weak.emphasis, { mobility: 0.13, control: 0.262, strength: 0.565, relaxation: 0.043 });
  assert.equal(weak.emphasis.control.toFixed(3), '0.262');
  assertEmphasis(profile({}, { movement_feel: ['unstable'] }).emphasis, {
    mobility: 0.13,
    control: 0.392,
    strength: 0.435,
    relaxation: 0.043,
  });
  assertEmphasis(profile({}, { movement_feel: ['uneven'] }).emphasis, {
    mobility: 0.136,
    control: 0.364,
    strength: 0.455,
    relaxation: 0.045,
  });
  assertEmphasis(profile({}, { movement_feel: ['unsafe'] }).emphasis, {
    mobility: 0.143,
    control: 0.286,
    strength: 0.476,
    relaxation: 0.095,
  });
  assertEmphasis(profile({}, { movement_feel: ['guarded'] }).emphasis, {
    mobility: 0.136,
    control: 0.273,
    strength: 0.455,
    relaxation: 0.136,
  });

  assertEmphasis(profile({ main_goal: ['mobility'] }).emphasis, {
    mobility: 0.227,
    control: 0.273,
    strength: 0.455,
    relaxation: 0.045,
  });
  assertEmphasis(profile({ main_goal: ['return_to_exercise'] }).emphasis, {
    mobility: 0.13,
    control: 0.262,
    strength: 0.565,
    relaxation: 0.043,
  });
  assertEmphasis(profile({ main_goal: ['sleep'] }).emphasis, {
    mobility: 0.136,
    control: 0.273,
    strength: 0.455,
    relaxation: 0.136,
  });
  const reducePain = profile({ main_goal: ['reduce_pain'] });
  assertEmphasis(reducePain.emphasis, { mobility: 0.143, control: 0.333, strength: 0.476, relaxation: 0.048 });
  assert.ok(reducePain.emphasis.control > profile().emphasis.control);
  assert.ok(profile({}, { movement_feel: ['stiff'] }).emphasis.mobility > profile().emphasis.mobility);

  assertEmphasis(profile({ main_goal: ['mobility', 'reduce_pain'] }).emphasis, {
    mobility: 0.217,
    control: 0.305,
    strength: 0.435,
    relaxation: 0.043,
  });
  assertEmphasis(profile({}, { movement_feel: ['stiff', 'weak', 'unsafe'] }).emphasis, {
    mobility: 0.222,
    control: 0.223,
    strength: 0.481,
    relaxation: 0.074,
  });

  const sensBuild = profile({}, { conditions: ['fibromyalgia'] });
  assert.equal(sensBuild.mode, 'build');
  assert.equal(sensBuild.sensitization, 'high');
  assertEmphasis(sensBuild.emphasis, { mobility: 0.143, control: 0.286, strength: 0.381, relaxation: 0.19 });

  const sensCalm = profile({}, {
    conditions: ['fibromyalgia'],
    intensity: 8,
    flare_settle: 'days',
    limitation: 'some_days',
  });
  assert.equal(sensCalm.mode, 'calm');
  assert.equal(sensCalm.sensitization, 'high');
  assertEmphasis(sensCalm.emphasis, { mobility: 0.313, control: 0.312, strength: 0.018, relaxation: 0.357 });

  const controlStiff = profile({}, { intensity: 8, movement_feel: ['stiff'] });
  assert.equal(controlStiff.mode, 'control');
  assertEmphasis(controlStiff.emphasis, { mobility: 0.304, control: 0.392, strength: 0.217, relaxation: 0.087 });
});

test('stenosis moves extension limits onto the whole program', () => {
  const lean = profile({}, { conditions: ['stenosis'] });
  assert.equal(lean.bias, 'extension_sensitive');
  assert.equal(lean.biasStrength, 'lean');
  assert.equal(lean.earlyWeeks, 2);
  assert.deepEqual(lean.avoid, ['extension_endrange', 'extension_loaded']);
  assert.deepEqual(lean.avoidEarly, []);

  const clear = profile({}, { conditions: ['stenosis'], relief_direction: 'flexion' });
  assert.equal(clear.biasStrength, 'clear');
  assert.equal(clear.earlyWeeks, 3);
  assert.deepEqual(clear.avoid, ['extension_endrange', 'extension_loaded']);
  assert.deepEqual(clear.avoidEarly, []);

  const stenosisOverhead = profile({}, { conditions: ['stenosis'], hard_now: ['overhead'] });
  assert.equal(stenosisOverhead.biasStrength, 'clear');
  assert.deepEqual(stenosisOverhead.avoid, ['extension_endrange', 'extension_loaded']);

  const flexionWins = profile({}, {
    conditions: ['stenosis'],
    hard_now: ['sitting', 'bending'],
    relief_direction: 'extension',
  });
  assert.equal(flexionWins.bias, 'flexion_sensitive');
  assert.equal(flexionWins.biasStrength, 'clear');
  assert.deepEqual(flexionWins.avoid, []);
  assert.deepEqual(flexionWins.avoidEarly, ['flexion_endrange', 'flexion_loaded']);
});

test('condition, surgery, pregnancy, and legacy pain avoid tags', () => {
  const bone = profile({}, { conditions: ['osteoporosis'] });
  assert.deepEqual(bone.avoid, ['flexion_endrange', 'flexion_loaded', 'rotation_endrange', 'rotation_loaded']);
  assert.deepEqual(bone.avoidEarly, []);
  assert.equal(bone.loadCap, 'light');
  assert.equal(bone.tierCap, 3);
  assert.equal(bone.flags.osteoporosis, true);
  assert.equal(bone.flags.clinicianFirst, false);

  const pregnant = profile({}, { conditions: ['pregnant'] });
  assert.deepEqual(pregnant.avoid, ['flexion_loaded', 'prone', 'high_iap']);
  assert.deepEqual(pregnant.avoidEarly, []);
  assert.equal(pregnant.earlyWeeks, 0);
  assert.equal(pregnant.loadCap, 'bodyweight');
  assert.equal(pregnant.tierCap, 2);
  assert.equal(pregnant.flags.pregnant, true);
  assert.equal(pregnant.flags.postpartum, false);
  assert.equal(pregnant.flags.clinicianFirst, true);

  const postpartum = profile({}, { conditions: ['postpartum'] });
  assert.deepEqual(postpartum.avoid, []);
  assert.deepEqual(postpartum.avoidEarly, ['high_iap']);
  assert.equal(postpartum.earlyWeeks, 3);
  assert.equal(postpartum.loadCap, 'light');
  assert.equal(postpartum.tierCap, 3);
  assert.equal(postpartum.flags.postpartum, true);
  assert.equal(postpartum.flags.clinicianFirst, false);

  const onsetPregnancy = profile({}, { onset: 'pregnancy' });
  assert.equal(onsetPregnancy.flags.postpartum, false);
  assert.equal(onsetPregnancy.flags.pregnant, false);
  assert.deepEqual(onsetPregnancy.avoidEarly, []);
  assert.equal(onsetPregnancy.loadCap, 'full');

  const both = profile({}, { conditions: ['pregnant', 'postpartum'], onset: 'pregnancy' });
  assert.equal(both.flags.pregnant, true);
  assert.equal(both.flags.postpartum, false);
  assert.equal(both.earlyWeeks, 0);
  assert.deepEqual(both.avoidEarly, []);
  assert.deepEqual(both.avoid, ['flexion_loaded', 'prone', 'high_iap']);

  const surgery = profile({}, { conditions: ['post_surgery'] });
  assert.equal(surgery.flags.postSurgery, true);
  assert.equal(surgery.flags.clinicianFirst, true);
  assert.deepEqual(surgery.avoid, []);
  assert.deepEqual(surgery.avoidEarly, ['flexion_endrange', 'extension_endrange', 'rotation_endrange']);
  assert.equal(surgery.earlyWeeks, 3);
  assert.equal(surgery.loadCap, 'bodyweight');
  assert.equal(surgery.tierCap, 2);
  assert.equal(surgery.gentleStart, true);

  const onsetSurgery = profile({}, { onset: 'surgery' });
  assert.equal(onsetSurgery.flags.postSurgery, true);
  assert.deepEqual(onsetSurgery.avoid, surgery.avoid);
  assert.deepEqual(onsetSurgery.avoidEarly, surgery.avoidEarly);
  assert.equal(onsetSurgery.tierCap, 2);
  assert.equal(onsetSurgery.loadCap, 'bodyweight');

  const sharp = profile({ pain_type: ['sharp'] });
  assert.equal(sharp.radicular, 'none');
  assert.deepEqual(sharp.avoidEarly, ['flexion_loaded']);
  assert.equal(sharp.earlyWeeks, 2);
  assert.equal(sharp.irritabilityScore, 0.5);

  const nerve = profile({ pain_type: ['nerve'] });
  assert.equal(nerve.radicular, 'referred');
  assert.deepEqual(nerve.avoidEarly, ['flexion_loaded', 'neural_tension']);
  assert.equal(nerve.earlyWeeks, 2);
});

test('avoid and avoidEarly stay disjoint and early weeks take the max', () => {
  const boneFlex = profile({}, { conditions: ['osteoporosis'], hard_now: ['sitting', 'bending'] });
  assert.equal(boneFlex.biasStrength, 'clear');
  assert.deepEqual(boneFlex.avoid, [
    'flexion_endrange',
    'flexion_loaded',
    'rotation_endrange',
    'rotation_loaded',
  ]);
  assert.deepEqual(boneFlex.avoidEarly, []);
  assert.equal(boneFlex.earlyWeeks, 3);
  assert.equal(boneFlex.loadCap, 'light');

  const pregnantSharp = profile({ pain_type: ['sharp'] }, { conditions: ['pregnant'] });
  assert.deepEqual(pregnantSharp.avoid, ['flexion_loaded', 'prone', 'high_iap']);
  assert.deepEqual(pregnantSharp.avoidEarly, []);
  assert.equal(pregnantSharp.earlyWeeks, 2);
  assert.equal(pregnantSharp.irritabilityScore, 0.5);

  const nervePregnant = profile({ pain_type: ['nerve'] }, { conditions: ['pregnant'] });
  assert.equal(nervePregnant.radicular, 'referred');
  assert.deepEqual(nervePregnant.avoidEarly, ['neural_tension']);
  assert.ok(!nervePregnant.avoidEarly.includes('flexion_loaded'));
  assert.ok(nervePregnant.avoid.includes('flexion_loaded'));

  const stenosisSurgery = profile({}, { conditions: ['stenosis'], relief_direction: 'flexion', onset: 'surgery' });
  assert.equal(stenosisSurgery.bias, 'extension_sensitive');
  assert.equal(stenosisSurgery.biasStrength, 'clear');
  assert.equal(stenosisSurgery.flags.postSurgery, true);
  assert.deepEqual(stenosisSurgery.avoid, ['extension_endrange', 'extension_loaded']);
  assert.deepEqual(stenosisSurgery.avoidEarly, ['flexion_endrange', 'rotation_endrange']);
  assert.equal(stenosisSurgery.earlyWeeks, 3);
  assert.equal(stenosisSurgery.loadCap, 'bodyweight');
  assert.equal(stenosisSurgery.tierCap, 2);

  const stacked = profile({}, {
    onset: 'pregnancy',
    age_band: '70p',
    spread: 'leg',
    leg_reach: 'above_knee',
  });
  assert.equal(stacked.bias, 'neutral');
  assert.equal(stacked.radicular, 'referred');
  assert.equal(stacked.flags.postpartum, false);
  assert.equal(stacked.flags.olderAdult, true);
  assert.equal(stacked.flags.pregnant, false);
  assert.deepEqual(stacked.avoid, []);
  assert.deepEqual(stacked.avoidEarly, ['neural_tension', 'balance_challenge']);
  assert.equal(stacked.earlyWeeks, 2);
  assert.equal(stacked.loadCap, 'full');
  assert.equal(stacked.tierCap, 3);
  assert.equal(stacked.capacity, 1);

  const flexReferred = profile({}, { hard_now: ['sitting', 'bending'], spread: 'leg', leg_reach: 'above_knee' });
  assert.equal(flexReferred.earlyWeeks, 3);
  assert.deepEqual(flexReferred.avoidEarly, ['flexion_endrange', 'flexion_loaded', 'neural_tension']);

  const leanPostpartum = profile({}, { onset: 'pregnancy', hard_now: ['sitting'] });
  assert.equal(leanPostpartum.biasStrength, 'lean');
  assert.equal(leanPostpartum.earlyWeeks, 2);
  assert.deepEqual(leanPostpartum.avoidEarly, ['flexion_endrange', 'flexion_loaded']);

  for (const sample of [boneFlex, pregnantSharp, stenosisSurgery, stacked, flexReferred]) {
    for (const tag of sample.avoid) {
      assert.equal(sample.avoidEarly.includes(tag), false, tag);
    }
  }
});

test('flags follow red flags, surgery, pregnancy, bone, fibromyalgia, and age', () => {
  assert.deepEqual(profile().flags, QUIET_FLAGS);
  assert.equal(profile({}, { red_flag_ack: true }).flags.redFlag, false);

  const red = profile({}, { red_flags: ['cancer_history', 'leg_weakness'] });
  assert.equal(red.flags.redFlag, true);
  assert.equal(red.flags.clinicianFirst, true);
  assert.equal(red.flags.pregnant, false);
  assert.equal(red.loadCap, 'bodyweight');
  assert.equal(red.tierCap, 5);

  assert.equal(profile({}, { conditions: ['pregnant'] }).flags.clinicianFirst, true);
  assert.equal(profile({}, { conditions: ['post_surgery'] }).flags.clinicianFirst, true);
  assert.equal(profile({}, { onset: 'surgery' }).flags.postSurgery, true);
  assert.equal(profile({}, { conditions: ['postpartum'] }).flags.clinicianFirst, false);
  assert.equal(profile({}, { onset: 'pregnancy' }).flags.postpartum, false);
  assert.equal(profile({}, { conditions: ['pregnant'], onset: 'pregnancy' }).flags.postpartum, false);
  assert.equal(profile({}, { conditions: ['osteoporosis'] }).flags.osteoporosis, true);
  assert.equal(profile({}, { conditions: ['fibromyalgia'] }).flags.fibromyalgia, true);
  assert.equal(profile({}, { age_band: '60_69' }).flags.olderAdult, true);
  assert.equal(profile({}, { age_band: '70p' }).flags.olderAdult, true);
  assert.equal(profile({}, { age_band: '45_59' }).flags.olderAdult, false);
  assert.equal(profile({}, { age_band: 'u30' }).flags.olderAdult, false);
  assert.equal(profile({}, { age_band: '30_44' }).flags.olderAdult, false);

  const curve = profile({}, { conditions: ['scoliosis'] });
  assert.deepEqual(curve.flags, QUIET_FLAGS);
  assert.deepEqual(curve.avoid, []);
  assert.equal(curve.tierCap, 5);
  assert.equal(curve.bias, 'neutral');
});
