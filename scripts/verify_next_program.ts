// Next-program rules + progression-level engine invariants.
// Usage: npx tsx --test scripts/verify_next_program.ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildPlan,
  clampProgressionLevel,
  MAX_PROGRESSION_LEVEL,
  MIN_PROGRESSION_LEVEL,
  type Answers,
  type AssignmentRulesConfig,
  type CatalogExercise,
  type ReplacementEntry,
  type ResolvedPlan,
  type TemplateInput,
} from '../supabase/functions/_shared/assignment/engine.ts';
import {
  answersForNextProgram,
  nextProgressionLevel,
  type ProgramCheckin,
  type SavedAnswers,
} from '../supabase/functions/_shared/assignment/nextProgram.ts';
import {
  nextProgramHighlights,
  painDropWorthShowing,
  summarizeProgram,
  TOP_PROGRESSION_LEVEL,
  type PlanShape,
} from '../lib/programSummary';

// ---------------------------------------------------------------------------
// Level math
// ---------------------------------------------------------------------------

const checkin = (over: Partial<ProgramCheckin>): ProgramCheckin => ({
  pain_change: 'better',
  difficulty: 'just_right',
  main_goal: ['reduce_pain'],
  pain_location: 'lower',
  sessions_per_week: 3,
  equipment: 'open_space',
  ...over,
});

test('continue always steps up one level, capped at the top', () => {
  assert.equal(nextProgressionLevel(0, { choice: 'continue' }), 1);
  assert.equal(nextProgressionLevel(-1, { choice: 'continue' }), 0);
  assert.equal(nextProgressionLevel(2, { choice: 'continue' }), 3);
  assert.equal(nextProgressionLevel(MAX_PROGRESSION_LEVEL, { choice: 'continue' }), MAX_PROGRESSION_LEVEL);
});

test('rebuild moves the level with reported difficulty', () => {
  const rebuild = (level: number, over: Partial<ProgramCheckin>) =>
    nextProgressionLevel(level, { choice: 'rebuild', checkin: checkin(over) });
  assert.equal(rebuild(0, { difficulty: 'too_easy' }), 2);
  assert.equal(rebuild(0, { difficulty: 'just_right' }), 1);
  assert.equal(rebuild(0, { difficulty: 'too_hard' }), -1);
  assert.equal(rebuild(2, { difficulty: 'too_easy' }), 3);
  assert.equal(rebuild(2, { difficulty: 'too_hard' }), 1);
  assert.equal(rebuild(MIN_PROGRESSION_LEVEL, { difficulty: 'too_hard' }), MIN_PROGRESSION_LEVEL);
});

test('worse pain never raises the level', () => {
  const worse = (level: number, difficulty: ProgramCheckin['difficulty']) =>
    nextProgressionLevel(level, {
      choice: 'rebuild',
      checkin: checkin({ pain_change: 'worse', difficulty }),
    });
  assert.equal(worse(1, 'too_easy'), 1);
  assert.equal(worse(1, 'just_right'), 1);
  assert.equal(worse(1, 'too_hard'), 0);
  for (const pain of ['much_better', 'better', 'same'] as const) {
    assert.equal(
      nextProgressionLevel(1, {
        choice: 'rebuild',
        checkin: checkin({ pain_change: pain, difficulty: 'just_right' }),
      }),
      2,
      pain,
    );
  }
});

test('garbage stored levels are treated as a first program', () => {
  assert.equal(clampProgressionLevel(Number.NaN), 0);
  assert.equal(clampProgressionLevel(null), 0);
  assert.equal(clampProgressionLevel(undefined), 0);
  assert.equal(clampProgressionLevel(99), MAX_PROGRESSION_LEVEL);
  assert.equal(clampProgressionLevel(-9), MIN_PROGRESSION_LEVEL);
  assert.equal(clampProgressionLevel(1.9), 1);
  assert.equal(nextProgressionLevel(Number.NaN, { choice: 'continue' }), 1);
});

// ---------------------------------------------------------------------------
// Answer merge
// ---------------------------------------------------------------------------

const saved: SavedAnswers = {
  pain_location: 'lower',
  pain_duration: 'chronic',
  pain_type: ['ache', 'sharp'],
  activity_level: 'light',
  pain_trigger: ['sitting', 'morning'],
  equipment: 'open_space',
  main_goal: ['reduce_pain'],
  sessions_per_week_preference: 4,
};

test('continue keeps saved answers and the finished cadence', () => {
  assert.deepEqual(answersForNextProgram(saved, 3, { choice: 'continue' }), saved);
  const legacy = { ...saved, sessions_per_week_preference: null };
  assert.equal(
    answersForNextProgram(legacy, 5, { choice: 'continue' }).sessions_per_week_preference,
    5,
  );
});

test('rebuild replaces only the four asked answers', () => {
  const next = answersForNextProgram(saved, 4, {
    choice: 'rebuild',
    checkin: checkin({
      pain_location: 'all',
      equipment: 'gym',
      main_goal: ['mobility', 'return_to_exercise', 'mobility'],
      sessions_per_week: 6,
    }),
  });
  assert.deepEqual(next, {
    ...saved,
    pain_location: 'all',
    equipment: 'gym',
    main_goal: ['mobility', 'return_to_exercise'],
    sessions_per_week_preference: 6,
  });
});

test('rebuild fills equipment missing from a half-finished row', () => {
  const next = answersForNextProgram({ ...saved, equipment: null }, 3, {
    choice: 'rebuild',
    checkin: checkin({ equipment: 'bands_dumbbells' }),
  });
  assert.equal(next.equipment, 'bands_dumbbells');
});

// ---------------------------------------------------------------------------
// Engine: progression level
// ---------------------------------------------------------------------------

const rules: AssignmentRulesConfig = {
  global: {
    duration_weeks: { acute: 10, subacute: 10, chronic: 12 },
    bodyweight_only_early_weeks: 2,
    early_weeks: 2,
    scoring: {
      effectiveness: 1,
      pain_area_match: 1,
      goal_weight: 1,
      trigger_match: 0.5,
      pain_type_pref: 0.5,
      usefulness: 0.5,
      phase_match: 1,
    },
  },
  activity_level: {
    intensity_multiplier: { sedentary: 0.8, light: 0.95, active: 1.1, athlete: 1.2 },
    rest_multiplier: { sedentary: 1.2, light: 1.05, active: 0.95, athlete: 0.85 },
    fatigue_budget: { sedentary: 8, light: 10, active: 13, athlete: 16 },
  },
  pain_duration: {
    starting_intensity_offset: { acute: -1, subacute: 0, chronic: 0 },
    strength_phase_start_fraction: { acute: 0.5, subacute: 0.4, chronic: 0.25 },
  },
  pain_location: {
    area_filter: {
      upper: ['upper', 'general'],
      lower: ['lower', 'general'],
      all: ['upper', 'lower', 'general'],
    },
    all_week_bias: { first_half: 'upper', second_half: 'lower' },
    contraindications: [],
    title_focus: { upper: 'Upper Back', lower: 'Lower Back', all: 'Full Back' },
  },
  pain_type: {
    require_pain_types_safe: { stiffness: false, ache: false, sharp: true, nerve: true },
    sharp_bodyweight_only_early: true,
    exclude_aggravates_early: { sharp: ['flexion_loaded'], nerve: ['flexion_loaded'] },
  },
  pain_trigger: { swap_per_session: 1, emphasis: {} },
  main_goal: {
    goal_key_for_weight: {
      reduce_pain: 'reduce_pain',
      return_to_exercise: 'return_to_exercise',
      sleep: 'sleep',
      mobility: 'mobility',
    },
    load_progression_accel_after_week: { return_to_exercise: 2 },
    title_focus: {
      reduce_pain: 'Pain Relief',
      return_to_exercise: 'Strength & Return',
      sleep: 'Recovery',
      mobility: 'Mobility',
    },
  },
  equipment: {
    tier_rank: { open_space: 0, bands_dumbbells: 1, gym: 2 },
    subtitle_when: {},
  },
  sessions_per_week_preference: {
    recommendation: { light: { acute: 3, subacute: 3, chronic: 4 } },
    options: [3, 4, 5, 6, 7],
    avoid_consecutive_for: ['acute'],
  },
};

function ex(over: Partial<CatalogExercise> & Pick<CatalogExercise, 'id' | 'movement_pattern' | 'phase'>): CatalogExercise {
  return {
    name: over.id,
    sets: 3,
    reps: 10,
    duration_seconds: null,
    rest_seconds: 45,
    equipment_tier: 'open_space',
    pain_areas: ['general'],
    intensity_tier: 1,
    pain_types_safe: ['all'],
    triggers_addressed: [],
    goals_weight: {},
    effectiveness: 3,
    fatigue_cost: 1,
    usefulness: 3,
    aggravates: [],
    duration_minutes_est: 3,
    ...over,
  };
}

const exercises: CatalogExercise[] = [
  ex({ id: 'cat_cow', movement_pattern: 'lumbar_mobility', phase: 'mobility', reps: 10 }),
  ex({ id: 'open_book', movement_pattern: 'thoracic_mobility', phase: 'mobility', reps: 8 }),
  ex({ id: 'bird_dog', movement_pattern: 'spinal_stability', phase: 'activation', intensity_tier: 2, reps: 5, duration_seconds: 10 }),
  ex({ id: 'side_plank_knees', movement_pattern: 'spinal_stability', phase: 'activation', intensity_tier: 3, reps: null, duration_seconds: 20 }),
  ex({ id: 'side_plank_full', movement_pattern: 'spinal_stability', phase: 'activation', intensity_tier: 4, reps: null, duration_seconds: 25 }),
  ex({ id: 'glute_bridge', movement_pattern: 'glute_activation', phase: 'activation', intensity_tier: 2, reps: 12 }),
  ex({ id: 'sl_bridge', movement_pattern: 'glute_activation', phase: 'activation', intensity_tier: 3, reps: 10 }),
  ex({ id: 'hip_thrust', movement_pattern: 'glute_activation', phase: 'strength', intensity_tier: 4, reps: 10, equipment_tier: 'gym', fatigue_cost: 3 }),
  ex({ id: 'dead_bug', movement_pattern: 'core_activation', phase: 'activation', intensity_tier: 2, reps: 8 }),
  ex({ id: 'bw_hinge', movement_pattern: 'hip_hinge', phase: 'strength', intensity_tier: 2, reps: 12 }),
  ex({ id: 'sl_rdl', movement_pattern: 'hip_hinge', phase: 'strength', intensity_tier: 3, reps: 10 }),
  ex({ id: 'kb_deadlift', movement_pattern: 'hip_hinge', phase: 'strength', intensity_tier: 4, reps: 12, equipment_tier: 'gym', fatigue_cost: 3, aggravates: ['flexion_loaded'] }),
  ex({ id: 'bw_squat', movement_pattern: 'lower_body_strength', phase: 'strength', intensity_tier: 2, reps: 14 }),
  ex({ id: 'split_squat', movement_pattern: 'lower_body_strength', phase: 'strength', intensity_tier: 3, reps: 10 }),
  ex({ id: 'leg_press', movement_pattern: 'lower_body_strength', phase: 'strength', intensity_tier: 4, reps: 12, equipment_tier: 'gym', fatigue_cost: 3 }),
  ex({ id: 'childs_pose', movement_pattern: 'stretch_recovery', phase: 'recovery', reps: null, duration_seconds: 30, sets: 2 }),
];

const replacements: ReplacementEntry[] = [
  { movement_pattern: 'hip_hinge', exercise_id: 'bw_hinge', priority: 1 },
  { movement_pattern: 'hip_hinge', exercise_id: 'sl_rdl', priority: 2 },
  { movement_pattern: 'hip_hinge', exercise_id: 'kb_deadlift', priority: 3 },
  { movement_pattern: 'glute_activation', exercise_id: 'glute_bridge', priority: 1 },
  { movement_pattern: 'glute_activation', exercise_id: 'sl_bridge', priority: 2 },
  { movement_pattern: 'glute_activation', exercise_id: 'hip_thrust', priority: 3 },
  { movement_pattern: 'spinal_stability', exercise_id: 'bird_dog', priority: 1 },
  { movement_pattern: 'spinal_stability', exercise_id: 'side_plank_knees', priority: 2 },
  { movement_pattern: 'spinal_stability', exercise_id: 'side_plank_full', priority: 3 },
];

const slot = (order: number, movement_pattern: string, phase: string) => ({
  slot_order: order,
  selection_criteria: { movement_pattern, phase },
});

const template: TemplateInput = {
  week_phase_plan: {},
  sessions: [
    {
      session_index: 1,
      title_template: 'Mobility & Relief — {area}',
      phase: 'mobility',
      slots: [
        slot(1, 'lumbar_mobility', 'mobility'),
        slot(2, 'glute_activation', 'activation'),
        slot(3, 'spinal_stability', 'activation'),
        slot(4, 'stretch_recovery', 'recovery'),
      ],
    },
    {
      session_index: 2,
      title_template: 'Stability & Core — {area}',
      phase: 'activation',
      slots: [
        slot(1, 'thoracic_mobility', 'mobility'),
        slot(2, 'core_activation', 'activation'),
        slot(3, 'spinal_stability', 'activation'),
        slot(4, 'glute_activation', 'activation'),
        slot(5, 'stretch_recovery', 'recovery'),
      ],
    },
    {
      session_index: 3,
      title_template: 'Strength & Function — {area}',
      phase: 'strength',
      slots: [
        slot(1, 'lumbar_mobility', 'mobility'),
        slot(2, 'hip_hinge', 'strength'),
        slot(3, 'lower_body_strength', 'strength'),
        slot(4, 'spinal_stability', 'activation'),
        slot(5, 'stretch_recovery', 'recovery'),
      ],
    },
  ],
};

const baseAnswers: Answers = {
  pain_location: 'lower',
  pain_duration: 'chronic',
  pain_type: ['ache'],
  activity_level: 'light',
  pain_trigger: ['sitting'],
  equipment: 'gym',
  main_goal: ['return_to_exercise'],
  sessions_per_week_preference: 3,
};

function plan(level: number | undefined, answers: Answers = baseAnswers): ResolvedPlan {
  return buildPlan({
    answers,
    rules,
    rulesVersion: 1,
    exercises,
    template,
    replacements,
    progressionLevel: level,
  });
}

const byId = new Map(exercises.map((e) => [e.id, e]));
const WORK_REPS_CAP = 15;

function slotKey(week: number, session: number, order: number) {
  return `${week}:${session}:${order}`;
}

test('level 0 is identical to a plan built before levels existed', () => {
  assert.deepEqual(plan(0), plan(undefined));
  assert.deepEqual(plan(0, { ...baseAnswers, pain_duration: 'acute' }), plan(undefined, { ...baseAnswers, pain_duration: 'acute' }));
});

test('each level raises (never lowers) the weekly intensity target', () => {
  for (const duration of ['acute', 'subacute', 'chronic'] as const) {
    const answers = { ...baseAnswers, pain_duration: duration };
    for (let level = MIN_PROGRESSION_LEVEL; level < MAX_PROGRESSION_LEVEL; level++) {
      const lower = plan(level, answers);
      const higher = plan(level + 1, answers);
      assert.equal(lower.sessions.length, higher.sessions.length, `${duration} L${level}`);
      assert.equal(lower.duration_weeks, higher.duration_weeks);
      let raised = 0;
      for (let i = 0; i < lower.sessions.length; i++) {
        assert.ok(
          higher.sessions[i].intensity_tier >= lower.sessions[i].intensity_tier,
          `${duration} L${level}→${level + 1} session ${i}`,
        );
        if (higher.sessions[i].intensity_tier > lower.sessions[i].intensity_tier) raised++;
      }
      assert.ok(raised > 0, `${duration} L${level}→${level + 1} changed nothing`);
    }
  }
});

test('level 1 starts week 1 one tier above a first program', () => {
  const first = plan(0);
  const next = plan(1);
  const week1 = (p: ResolvedPlan) => p.sessions.filter((s) => s.week_number === 1);
  for (let i = 0; i < week1(first).length; i++) {
    assert.equal(week1(next)[i].intensity_tier, Math.min(5, week1(first)[i].intensity_tier + 1));
  }
});

test('higher levels pick equal-or-harder variants and never cut reps on the same move', () => {
  const lower = plan(0);
  const higher = plan(2);
  let harder = 0;
  let compared = 0;
  for (let i = 0; i < lower.sessions.length; i++) {
    const a = lower.sessions[i];
    const b = higher.sessions[i];
    const aTier = a.exercises.reduce((sum, e) => sum + byId.get(e.exercise_id)!.intensity_tier, 0);
    const bTier = b.exercises.reduce((sum, e) => sum + byId.get(e.exercise_id)!.intensity_tier, 0);
    if (bTier > aTier) harder++;
    for (const eb of b.exercises) {
      const ea = a.exercises.find((e) => e.exercise_id === eb.exercise_id);
      if (!ea || ea.reps === null || eb.reps === null) continue;
      compared++;
      assert.ok(eb.reps >= ea.reps, `${eb.exercise_id} W${b.week_number}S${b.session_number}`);
    }
  }
  assert.ok(harder > 0, 'level 2 never selected a harder variant');
  assert.ok(compared > 10, `only ${compared} same-move comparisons`);
});

test('work reps stay capped and holds keep their dosing at every level', () => {
  const holds = new Map<string, number | null>();
  for (const e of plan(0).sessions.flatMap((s) =>
    s.exercises.map((x) => ({ key: slotKey(s.week_number, s.session_number, x.order_index), x })),
  )) {
    holds.set(`${e.key}:${e.x.exercise_id}`, e.x.duration_seconds);
  }
  let holdsCompared = 0;
  for (let level = MIN_PROGRESSION_LEVEL; level <= MAX_PROGRESSION_LEVEL; level++) {
    for (const s of plan(level).sessions) {
      for (const x of s.exercises) {
        const catalog = byId.get(x.exercise_id)!;
        if ((catalog.phase === 'strength' || catalog.phase === 'activation') && x.reps !== null) {
          assert.ok(x.reps <= WORK_REPS_CAP, `L${level} ${x.exercise_id} ${x.reps} reps`);
        }
        if (x.reps !== null) assert.ok(x.reps >= 3);
        assert.ok(x.load_tier >= 1 && x.load_tier <= 5);
        const key = `${slotKey(s.week_number, s.session_number, x.order_index)}:${x.exercise_id}`;
        if (holds.has(key) && x.duration_seconds !== null) {
          holdsCompared++;
          assert.equal(x.duration_seconds, holds.get(key), `L${level} ${key} hold changed`);
        }
      }
    }
  }
  assert.ok(holdsCompared > 10, `only ${holdsCompared} hold comparisons`);
});

function sameSlotPairs(a: ResolvedPlan, b: ResolvedPlan) {
  const pairs: { id: string; a: number; b: number }[] = [];
  for (let i = 0; i < a.sessions.length; i++) {
    for (const eb of b.sessions[i].exercises) {
      const ea = a.sessions[i].exercises.find(
        (e) => e.order_index === eb.order_index && e.exercise_id === eb.exercise_id,
      );
      if (ea && ea.reps !== null && eb.reps !== null) {
        pairs.push({ id: eb.exercise_id, a: ea.reps, b: eb.reps });
      }
    }
  }
  return pairs;
}

test('the top level still adds work volume once a bodyweight ladder has topped out', () => {
  const answers: Answers = { ...baseAnswers, equipment: 'open_space' };
  const work = sameSlotPairs(plan(MAX_PROGRESSION_LEVEL - 1, answers), plan(MAX_PROGRESSION_LEVEL, answers)).filter(
    (p) => ['strength', 'activation'].includes(byId.get(p.id)!.phase),
  );
  assert.ok(work.length > 0);
  assert.ok(work.every((p) => p.b >= p.a));
  assert.ok(work.some((p) => p.b > p.a), 'no work move gained reps at the top level');
});

test('warm-up and cooldown dosing does not change with the level', () => {
  const easy = sameSlotPairs(plan(0), plan(MAX_PROGRESSION_LEVEL)).filter((p) =>
    ['mobility', 'recovery'].includes(byId.get(p.id)!.phase),
  );
  assert.ok(easy.length > 5);
  for (const p of easy) assert.equal(p.b, p.a, p.id);
});

test('out-of-range levels clamp instead of overshooting', () => {
  assert.deepEqual(plan(99), plan(MAX_PROGRESSION_LEVEL));
  assert.deepEqual(plan(-99), plan(MIN_PROGRESSION_LEVEL));
});

test('sharp pain keeps early weeks bodyweight-only at every level', () => {
  const answers: Answers = { ...baseAnswers, pain_type: ['sharp'], equipment: 'gym' };
  for (let level = MIN_PROGRESSION_LEVEL; level <= MAX_PROGRESSION_LEVEL; level++) {
    for (const s of plan(level, answers).sessions.filter((x) => x.week_number <= 2)) {
      for (const x of s.exercises) {
        assert.equal(byId.get(x.exercise_id)!.equipment_tier, 'open_space', `L${level} W${s.week_number}`);
        assert.ok(!byId.get(x.exercise_id)!.aggravates.includes('flexion_loaded'));
      }
    }
  }
});

// ---------------------------------------------------------------------------
// Program-complete summary + reveal highlights (client)
// ---------------------------------------------------------------------------

test('client top level matches the engine', () => {
  assert.equal(TOP_PROGRESSION_LEVEL, MAX_PROGRESSION_LEVEL);
});

const completion = (id: string, iso: string, seconds: number | null = 600) => ({
  id,
  completed_at: iso,
  duration_seconds: seconds,
});

test('summary counts sessions, local days and minutes for this program only', () => {
  const noon = (d: number) => new Date(2026, 8, d, 12, 0, 0).toISOString();
  const summary = summarizeProgram(
    [
      completion('a', noon(1), 900),
      completion('b', noon(1), 300),
      completion('c', noon(3), null),
      completion('d', noon(4), 630),
    ],
    [],
  );
  assert.equal(summary.sessions, 4);
  assert.equal(summary.daysActive, 3);
  assert.equal(summary.minutes, 31);
  assert.equal(summary.painStart, null);
  assert.equal(summary.painEnd, null);
  assert.equal(painDropWorthShowing(summary), false);
});

test('pain trend compares the first and last few pre-session scores of this program', () => {
  const at = (h: number) => new Date(Date.UTC(2026, 8, 1, h)).toISOString();
  const completions = ['s1', 's2', 's3', 's4', 's5', 's6', 's7'].map((id, i) => completion(id, at(i)));
  const checkins = [
    { score: 7, recorded_at: at(0), session_completion_id: 's1' },
    { score: 6, recorded_at: at(1), session_completion_id: 's2' },
    { score: 6, recorded_at: at(2), session_completion_id: 's3' },
    { score: 5, recorded_at: at(3), session_completion_id: 's4' },
    { score: 4, recorded_at: at(4), session_completion_id: 's5' },
    { score: 3, recorded_at: at(5), session_completion_id: 's6' },
    { score: 3, recorded_at: at(6), session_completion_id: 's7' },
    // Belongs to another program's completion — ignored.
    { score: 10, recorded_at: at(7), session_completion_id: 'old' },
    // Orphaned (abandoned start) — ignored.
    { score: 10, recorded_at: at(8), session_completion_id: null },
  ];
  const summary = summarizeProgram(completions, [...checkins].reverse());
  assert.equal(summary.painStart, 6.3);
  assert.equal(summary.painEnd, 3.3);
  assert.equal(painDropWorthShowing(summary), true);
  const flat = summarizeProgram(completions.slice(0, 4), checkins.slice(0, 4).map((c) => ({ ...c, score: 5 })));
  assert.equal(flat.painStart, 5);
  assert.equal(painDropWorthShowing(flat), false);
  const tooFew = summarizeProgram(completions.slice(0, 3), checkins.slice(0, 3));
  assert.equal(tooFew.painStart, null);
});

const shape = (over: Partial<PlanShape>): PlanShape => ({
  main_goal: ['reduce_pain'],
  pain_location: 'lower',
  sessions_per_week: 3,
  equipment: 'open_space',
  ...over,
});

test('continue highlights describe the level step only', () => {
  const up = nextProgramHighlights({ fromLevel: 0, toLevel: 1, before: null, after: null });
  assert.deepEqual(up.map((h) => h.key), ['level', 'reps']);
  assert.equal(up[0].text, 'Harder progressions from week one');
  const top = nextProgramHighlights({ fromLevel: 3, toLevel: 3, before: null, after: null });
  assert.deepEqual(top.map((h) => h.text), ['Top progression level, same high challenge']);
});

test('rebuild highlights list only what changed, capped at four', () => {
  const same = nextProgramHighlights({ fromLevel: 1, toLevel: 1, before: shape({}), after: shape({}) });
  assert.deepEqual(same.map((h) => h.text), ['Same intensity as your last program']);
  const eased = nextProgramHighlights({
    fromLevel: 1,
    toLevel: 0,
    before: shape({}),
    after: shape({ equipment: 'gym' }),
  });
  assert.deepEqual(eased.map((h) => h.key), ['level', 'reps', 'equipment']);
  assert.equal(eased[2].text, 'Built for full gym access');
  const many = nextProgramHighlights({
    fromLevel: 0,
    toLevel: 2,
    before: shape({}),
    after: shape({
      equipment: 'bands_dumbbells',
      sessions_per_week: 5,
      main_goal: ['mobility', 'reduce_pain'],
      pain_location: 'upper',
    }),
  });
  assert.equal(many.length, 4);
  assert.equal(many[0].text, 'Two steps harder than your last program');
  assert.deepEqual(many.map((h) => h.key), ['level', 'reps', 'equipment', 'days']);
  const goalOnly = nextProgramHighlights({
    fromLevel: 0,
    toLevel: 1,
    before: shape({ main_goal: ['reduce_pain', 'sleep'] }),
    after: shape({ main_goal: ['sleep'] }),
  });
  assert.equal(goalOnly[2].text, 'Focused on sleeping better');
});

test('equipment ceiling holds at every level', () => {
  const answers: Answers = { ...baseAnswers, equipment: 'open_space' };
  for (let level = MIN_PROGRESSION_LEVEL; level <= MAX_PROGRESSION_LEVEL; level++) {
    for (const s of plan(level, answers).sessions) {
      for (const x of s.exercises) {
        assert.equal(byId.get(x.exercise_id)!.equipment_tier, 'open_space');
      }
    }
  }
});
