// Profile-summary copy, dose strings, sensitization preview, and the program date.
// Usage: npx tsx --test scripts/verify_intake_summary.ts
import assert from 'node:assert/strict';
import test from 'node:test';

import type { ClinicalProfile, Intake, LegacyAnswers } from '../lib/intake';
import {
  completeIntake,
  durationDetailLabel,
  equipmentLabel,
  formatDose,
  locationLabel,
  minutesLabel,
  nsLevelPreview,
  profileSummary,
  programEndDateLabel,
  programWeeksBeforeSafety,
  programWeeksFor,
} from '../lib/intakeSummary';

const QUIET_NS: Intake['ns'] = {
  predictable: 'yes',
  small_triggers: 'no',
  stress: 'no',
  anticipation: 'no',
  avoidance: 'no',
};

function answers(over: Partial<LegacyAnswers> = {}): LegacyAnswers {
  return {
    pain_location: 'lower',
    pain_duration: 'chronic',
    pain_type: ['ache'],
    activity_level: 'light',
    pain_trigger: ['other'],
    equipment: 'open_space',
    main_goal: ['reduce_pain'],
    sessions_per_week_preference: 4,
    ...over,
  };
}

function intake(over: Partial<Intake> = {}): Intake {
  return {
    v: 1,
    hard_now: [],
    spread: 'one_spot',
    leg_reach: null,
    duration_detail: '3_12m',
    onset: 'gradual',
    intensity: 4,
    movement_feel: [],
    relief_direction: 'neither',
    flare_settle: 'hours',
    trend: 'same',
    limitation: 'little',
    ns: QUIET_NS,
    tried: [],
    conditions: [],
    age_band: '30_44',
    minutes: 20,
    red_flags: [],
    red_flag_ack: false,
    ...over,
  };
}

function profile(over: Partial<ClinicalProfile> = {}): ClinicalProfile {
  return {
    irritability: 'low',
    irritabilityScore: 1,
    bias: 'neutral',
    biasStrength: 'none',
    sensitization: 'low',
    nsScore: 0,
    fear: 'low',
    radicular: 'none',
    mode: 'build',
    emphasis: { mobility: 0.25, control: 0.25, strength: 0.25, relaxation: 0.25 },
    exposureBending: false,
    unilateralFocus: false,
    functionTargets: [],
    avoid: [],
    avoidEarly: [],
    earlyWeeks: 2,
    gentleStart: false,
    loadCap: 'full',
    capacity: 2,
    tierCap: 5,
    slotDelta: 0,
    ...over,
    flags: { ...profileFlags(), ...over.flags },
  };
}

function profileFlags(): ClinicalProfile['flags'] {
  return {
    redFlag: false,
    clinicianFirst: false,
    postSurgery: false,
    pregnant: false,
    postpartum: false,
    osteoporosis: false,
    fibromyalgia: false,
    olderAdult: false,
  };
}

function summary(profileOver: Partial<ClinicalProfile> = {}, intakeOver: Partial<Intake> = {}) {
  return profileSummary(answers(), intake(intakeOver), profile(profileOver));
}

test('pattern copy follows bias', () => {
  const flexion = summary({ bias: 'flexion_sensitive', biasStrength: 'clear' });
  assert.equal(flexion.patternTitle, 'Bending-sensitive back');
  assert.equal(
    flexion.patternBody,
    'Sitting and bending stir it up. The plan starts by opening the other way.',
  );
  const extension = summary({ bias: 'extension_sensitive', biasStrength: 'lean' });
  assert.equal(extension.patternTitle, 'Arching-sensitive back');
  assert.equal(
    extension.patternBody,
    'Standing and arching stir it up. The plan starts with rounding, and skips deep back-bends.',
  );
  const mixed = summary({ bias: 'neutral' });
  assert.equal(mixed.patternTitle, 'Mixed pattern');
  assert.equal(
    mixed.patternBody,
    'No single direction sets it off. The plan moves a little each way, then builds.',
  );
});

test('start copy follows mode', () => {
  assert.equal(summary({ mode: 'calm' }).startTitle, 'Gentle start');
  assert.match(summary({ mode: 'calm' }).startBody, /first two weeks stay short and calm/);
  assert.equal(summary({ mode: 'control' }).startTitle, 'Steady start');
  assert.match(summary({ mode: 'control' }).startBody, /Control first, then strength/);
  assert.equal(summary({ mode: 'build' }).startTitle, 'Ready to build');
  assert.match(summary({ mode: 'build' }).startBody, /strength can start sooner/);
});

test('nervous-system copy follows sensitization', () => {
  assert.equal(summary({ sensitization: 'high' }).nsTitle, 'Nervous system: turned up');
  assert.match(summary({ sensitization: 'high' }).nsBody, /become protective/);
  assert.equal(summary({ sensitization: 'some' }).nsTitle, 'Nervous system: partly involved');
  assert.match(summary({ sensitization: 'some' }).nsBody, /calm-down drills/);
  assert.equal(summary({ sensitization: 'low' }).nsTitle, 'Nervous system: quiet');
  assert.match(summary({ sensitization: 'low' }).nsBody, /movement pattern/);
});

test('focus chips take the two strongest emphases, then the extras, capped at 5', () => {
  const tied = summary();
  assert.deepEqual(tied.focusChips, ['Mobility', 'Core control']);

  const strength = summary({
    emphasis: { mobility: 0.2, control: 0.1, strength: 0.6, relaxation: 0.1 },
    exposureBending: true,
    unilateralFocus: true,
    radicular: 'referred',
  });
  assert.deepEqual(strength.focusChips, [
    'Strength',
    'Mobility',
    'Hip hinge practice',
    'One-side balance',
    'Nerve-friendly moves',
  ]);
});

test('adaptations follow the copy table, including the caps and exclusions', () => {
  assert.deepEqual(
    summary({ radicular: 'below_knee' }).adaptations,
    ['No hamstring or nerve-stretching moves, because pain that travels below the knee does better without them.'],
  );
  assert.deepEqual(summary({ bias: 'flexion_sensitive', earlyWeeks: 3 }).adaptations, [
    'No deep forward bends or loaded rounding for the first 3 weeks.',
  ]);
  assert.deepEqual(summary({ bias: 'extension_sensitive', earlyWeeks: 2 }).adaptations, [
    'No deep back-bends for the first 2 weeks.',
  ]);
  assert.deepEqual(
    summary({ bias: 'extension_sensitive' }, { conditions: ['stenosis'] }).adaptations,
    ['No deep back-bends in this program.'],
  );
  assert.deepEqual(summary({ flags: { ...profileFlags(), osteoporosis: true } }).adaptations, [
    'No loaded bending or twisting, to protect your spine.',
  ]);
  assert.deepEqual(summary({ flags: { ...profileFlags(), pregnant: true } }).adaptations, [
    'Bodyweight only, nothing face-down, and nothing that strains your abdomen. Check with your midwife or doctor before starting.',
  ]);
  assert.deepEqual(
    summary({ flags: { ...profileFlags(), postpartum: true }, earlyWeeks: 3 }).adaptations,
    ['Deep core first, and no heavy abdominal pressure for the first 3 weeks.'],
  );
  assert.deepEqual(summary({ flags: { ...profileFlags(), postSurgery: true } }).adaptations, [
    "Bodyweight only and no loaded bending or twisting. Follow your surgeon's guidance first.",
  ]);
  assert.deepEqual(summary({ flags: { ...profileFlags(), fibromyalgia: true } }).adaptations, [
    'Shorter sessions with longer rests, because slow and steady works best with fibromyalgia.',
  ]);
  assert.deepEqual(summary({ gentleStart: true }).adaptations, [
    'Weeks 1 and 2 use lighter doses so your back can settle.',
  ]);
  assert.deepEqual(
    summary({ gentleStart: true, flags: { ...profileFlags(), pregnant: true } }).adaptations,
    [
      'Bodyweight only, nothing face-down, and nothing that strains your abdomen. Check with your midwife or doctor before starting.',
    ],
  );
  assert.deepEqual(
    summary({ gentleStart: true, flags: { ...profileFlags(), postSurgery: true } }).adaptations,
    ["Bodyweight only and no loaded bending or twisting. Follow your surgeon's guidance first."],
  );
  assert.deepEqual(
    summary({ gentleStart: true, flags: { ...profileFlags(), fibromyalgia: true } }).adaptations,
    ['Shorter sessions with longer rests, because slow and steady works best with fibromyalgia.'],
  );
  assert.deepEqual(summary({ flags: { ...profileFlags(), olderAdult: true } }).adaptations, [
    'Balance-heavy moves wait until week 3.',
  ]);
  assert.deepEqual(summary({ fear: 'high' }).adaptations, [
    'We bring back the moves you avoid in small, planned steps.',
  ]);

  const crowded = summary({
    radicular: 'below_knee',
    bias: 'flexion_sensitive',
    earlyWeeks: 3,
    gentleStart: true,
    fear: 'high',
    flags: {
      ...profileFlags(),
      osteoporosis: true,
      pregnant: true,
      postpartum: true,
      postSurgery: true,
      fibromyalgia: true,
      olderAdult: true,
    },
  });
  assert.equal(crowded.adaptations.length, 5);
  assert.deepEqual(crowded.adaptations, [
    'No hamstring or nerve-stretching moves, because pain that travels below the knee does better without them.',
    'No deep forward bends or loaded rounding for the first 3 weeks.',
    'No loaded bending or twisting, to protect your spine.',
    'Bodyweight only, nothing face-down, and nothing that strains your abdomen. Check with your midwife or doctor before starting.',
    'Deep core first, and no heavy abdominal pressure for the first 3 weeks.',
  ]);
});

test('goals map hard_now in array order', () => {
  const result = summary(
    {},
    {
      hard_now: ['bed', 'bending', 'stairs', 'walking', 'sitting', 'standing', 'twisting', 'overhead', 'sleep', 'exercise'],
    },
  );
  assert.deepEqual(result.goals, [
    'Getting out of bed without bracing',
    'Bending and lifting without that pause',
    'Stairs without thinking about it',
    'Walking further',
    'Sitting through the day',
    'Standing for longer',
    'Twisting and turning freely',
    'Reaching overhead',
    'Sleeping through the night',
    'Getting back to training',
  ]);
  assert.deepEqual(summary().goals, []);
});

test('formatDose covers reps, each side, seconds, and holds', () => {
  assert.equal(formatDose({ sets: 2, reps: 8, duration_seconds: null, per_side: false }), '2 x 8');
  assert.equal(formatDose({ sets: 3, reps: 10, duration_seconds: null, per_side: true }), '3 x 10 each side');
  assert.equal(formatDose({ sets: 2, reps: null, duration_seconds: 30, per_side: false }), '2 x 30s');
  assert.equal(
    formatDose({ sets: 3, reps: 4, duration_seconds: 10, per_side: true }),
    '3 x 4 x 10s holds each side',
  );
  assert.equal(formatDose({ sets: 2, reps: null, duration_seconds: 30, per_side: true }), '2 x 30s each side');
  assert.equal(formatDose({ sets: null, reps: 8, duration_seconds: null }), '');
});

test('nsLevelPreview stays low until the nervous-system answers are complete', () => {
  assert.equal(nsLevelPreview({}), 'low');
  assert.equal(nsLevelPreview({ ns: { predictable: 'no' } as Intake['ns'] }), 'low');
  assert.equal(nsLevelPreview({ conditions: ['fibromyalgia'] }), 'high');
});

test('nsLevelPreview scores ns, spread, duration, and fibromyalgia', () => {
  const quiet = { ...QUIET_NS };
  assert.equal(nsLevelPreview({ ns: quiet, spread: 'one_spot', duration_detail: 'lt_2w' }), 'low');

  const some = { ...QUIET_NS, predictable: 'varies' as const, small_triggers: 'sometimes' as const };
  assert.equal(nsLevelPreview({ ns: some, spread: 'one_spot' }), 'low');
  assert.equal(nsLevelPreview({ ns: some, spread: 'moves' }), 'some');

  const loud = {
    predictable: 'no' as const,
    small_triggers: 'yes' as const,
    stress: 'yes' as const,
    anticipation: 'yes' as const,
    avoidance: 'yes' as const,
  };
  assert.equal(nsLevelPreview({ ns: loud, duration_detail: 'lt_2w' }), 'some');
  assert.equal(nsLevelPreview({ ns: loud, duration_detail: '3_12m' }), 'high');
  assert.equal(nsLevelPreview({ ns: loud, duration_detail: '1_5y' }), 'high');
  assert.equal(nsLevelPreview({ ns: loud, duration_detail: '5y_plus' }), 'high');
  assert.equal(nsLevelPreview({ ns: quiet, conditions: ['fibromyalgia'], duration_detail: 'lt_2w' }), 'high');
});

test('labels, program length, and the end date', () => {
  assert.equal(locationLabel('upper'), 'Upper back');
  assert.equal(locationLabel('lower'), 'Lower back');
  assert.equal(locationLabel('all'), 'Whole back');
  assert.equal(durationDetailLabel('lt_2w'), 'Less than 2 weeks');
  assert.equal(durationDetailLabel('2w_3m'), '2 weeks to 3 months');
  assert.equal(durationDetailLabel('3_12m'), '3 to 12 months');
  assert.equal(durationDetailLabel('1_5y'), '1 to 5 years');
  assert.equal(durationDetailLabel('5y_plus'), 'More than 5 years');
  assert.equal(equipmentLabel('open_space'), 'Bodyweight');
  assert.equal(equipmentLabel('bands_dumbbells'), 'Bands and dumbbells');
  assert.equal(equipmentLabel('gym'), 'Full gym');
  assert.equal(minutesLabel(15), '15 min');
  assert.equal(minutesLabel(20), '20 min');
  assert.equal(minutesLabel(30), '30 min');
  const calm = { intensity: 2, flare_settle: 'minutes', trend: 'better' } as const;
  assert.equal(programWeeksFor(answers({ pain_duration: 'acute' }), intake({ ...calm, duration_detail: 'lt_2w' })), 10);
  assert.equal(programWeeksFor(answers({ pain_duration: 'subacute' }), intake({ ...calm, duration_detail: '2w_3m' })), 10);
  assert.equal(programWeeksFor(answers(), intake({ ...calm, duration_detail: '3_12m' })), 11);
  assert.equal(programWeeksFor(answers(), intake({ ...calm, duration_detail: '1_5y' })), 12);
  assert.equal(programWeeksFor(answers(), intake({ ...calm, duration_detail: '5y_plus' })), 13);
  const training = answers({ main_goal: ['return_to_exercise'] });
  assert.equal(programWeeksFor(training, intake({ ...calm, duration_detail: '5y_plus' })), 14);
  assert.equal(programWeeksFor(training, intake({ ...calm, duration_detail: '5y_plus', age_band: '70p' })), 15);
  const loud: Intake['ns'] = {
    predictable: 'no',
    small_triggers: 'yes',
    stress: 'yes',
    anticipation: 'yes',
    avoidance: 'yes',
  };
  const most = intake({ ...calm, duration_detail: '5y_plus', age_band: '70p', ns: loud });
  assert.equal(programWeeksFor(training, most), 16);
  assert.equal(programWeeksFor(training, { ...most, conditions: ['post_surgery'] }), 16);

  const { red_flags: _flags, red_flag_ack: _ack, ...beforeSafety } = intake({ ...calm, duration_detail: '1_5y' });
  assert.equal(programWeeksBeforeSafety(answers(), beforeSafety, 20), 12);
  assert.equal(programWeeksBeforeSafety(answers(), { duration_detail: '1_5y' }, 20), null);

  const fromNovember = programEndDateLabel(4, new Date(2026, 10, 21));
  assert.equal(fromNovember.replace(/[\u00a0\u202f]/g, ' '), 'Dec 19');
  const acrossYear = programEndDateLabel(2, new Date(2026, 11, 20));
  assert.equal(acrossYear.replace(/[\u00a0\u202f]/g, ' '), 'Jan 3');
});

test('completeIntake fills v and rejects an unfinished partial', () => {
  const partial = intake();
  const { v: _version, ...withoutVersion } = partial;
  const completed = completeIntake({ pain_type: ['nerve'] }, withoutVersion);
  assert.ok(completed);
  assert.equal(completed.v, 1);
  assert.equal(completed.leg_reach, null);
  assert.equal(completeIntake({ pain_type: ['ache'] }, { spread: 'one_spot' }), null);

  const withLeg = completeIntake(
    { pain_type: ['nerve'] },
    { ...withoutVersion, spread: 'leg', leg_reach: 'foot' },
  );
  assert.equal(withLeg?.leg_reach, 'foot');
  const cleared = completeIntake(
    { pain_type: ['ache'] },
    { ...withoutVersion, spread: 'one_spot', leg_reach: 'foot' },
  );
  assert.equal(cleared?.leg_reach, null);
});
