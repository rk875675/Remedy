// Persona verification harness for the pure assignment engine (Phase 6).
//
// Run with Node's TypeScript type-stripping (no extra deps):
//   node --experimental-strip-types supabase/functions/_shared/assignment/verify.ts
//
// The rules / catalog / template below mirror migrations 014 + 015 so the engine can be
// exercised offline. Keep in rough sync if those seeds change. This is a verification
// tool, not production code.

import {
  buildPlan,
  type AssignmentRulesConfig,
  type Answers,
  type CatalogExercise,
  type ReplacementEntry,
  type TemplateInput,
} from './engine.ts';

const rules = {
  global: {
    duration_weeks: { acute: 4, subacute: 5, chronic: 6 },
    bodyweight_only_early_weeks: 2,
    early_weeks: 2,
    scoring: {
      effectiveness: 2.0,
      pain_area_match: 3.0,
      goal_weight: 2.5,
      trigger_match: 1.5,
      pain_type_pref: 1.0,
      usefulness: 0.5,
      phase_match: 1.5,
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
      middle: ['middle', 'general'],
      lower: ['lower', 'general'],
      all: ['upper', 'middle', 'lower', 'general'],
    },
    all_week_bias: { first_half: 'upper', second_half: 'lower' },
    contraindications: [
      {
        when: { pain_location: ['lower'], pain_type: ['sharp'], pain_duration: ['acute'] },
        exclude_aggravates: ['flexion_loaded'],
        apply_until_week_fraction: 0.5,
      },
    ],
    title_focus: { upper: 'Upper Back', middle: 'Mid Back', lower: 'Lower Back', all: 'Full Back' },
  },
  pain_type: {
    require_pain_types_safe: { sharp: true, stiffness: false, ache: false },
    sharp_bodyweight_only_early: true,
    exclude_aggravates_early: {
      sharp: ['flexion_loaded'],
    },
  },
  pain_trigger: {
    swap_per_session: 2,
    emphasis: {
      sitting: { movement_patterns: ['hip_mobility', 'thoracic_mobility', 'glute_activation'] },
      bending: { movement_patterns: ['hip_hinge', 'glute_activation'], exclude_aggravates_early: ['flexion_loaded'] },
      morning: { movement_patterns: ['lumbar_mobility', 'thoracic_mobility'], first_session_mobility_bias: true },
      exercise: { movement_patterns: ['core_activation', 'posterior_chain_strength'] },
      standing: { movement_patterns: ['spinal_stability', 'glute_activation'] },
    },
  },
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
    subtitle_when: { open_space: 'Bodyweight' },
  },
  sessions_per_week_preference: {
    recommendation: {
      sedentary: { acute: 3, subacute: 3, chronic: 3 },
      light: { acute: 3, subacute: 3, chronic: 4 },
      active: { acute: 3, subacute: 4, chronic: 4 },
      athlete: { acute: 4, subacute: 4, chronic: 5 },
    },
    options: [2, 3, 4, 5],
    avoid_consecutive_for: ['acute'],
  },
} as unknown as AssignmentRulesConfig;

type Ex = Omit<CatalogExercise, 'sets' | 'reps' | 'duration_seconds' | 'rest_seconds'> &
  Partial<Pick<CatalogExercise, 'sets' | 'reps' | 'duration_seconds' | 'rest_seconds'>>;

function ex(p: Ex): CatalogExercise {
  return {
    sets: 3,
    reps: 10,
    duration_seconds: null,
    rest_seconds: 30,
    ...p,
  };
}

const exercises: CatalogExercise[] = [
  ex({ id: 'C01', name: 'Cat-Cow', equipment_tier: 'open_space', pain_areas: ['lower', 'general'], intensity_tier: 1, movement_pattern: 'lumbar_mobility', pain_types_safe: ['all'], triggers_addressed: ['morning', 'sitting'], goals_weight: { reduce_pain: 0.6, mobility: 0.8 }, effectiveness: 4, fatigue_cost: 1, usefulness: 5, aggravates: [], phase: 'mobility', duration_minutes_est: 4 }),
  ex({ id: 'C02', name: 'Thoracic Extension', equipment_tier: 'open_space', pain_areas: ['upper', 'middle', 'general'], intensity_tier: 1, movement_pattern: 'thoracic_mobility', pain_types_safe: ['all'], triggers_addressed: ['sitting'], goals_weight: { reduce_pain: 0.6, mobility: 0.8 }, effectiveness: 4, fatigue_cost: 1, usefulness: 4, aggravates: [], phase: 'mobility', duration_minutes_est: 4 }),
  ex({ id: 'C03', name: 'Open-Book Rotation', equipment_tier: 'open_space', pain_areas: ['upper', 'middle'], intensity_tier: 1, movement_pattern: 'thoracic_mobility', pain_types_safe: ['all'], triggers_addressed: ['sitting', 'morning'], goals_weight: { reduce_pain: 0.5, mobility: 0.8 }, effectiveness: 3, fatigue_cost: 1, usefulness: 4, aggravates: [], phase: 'mobility', duration_minutes_est: 4 }),
  ex({ id: 'C04', name: 'Hip Flexor Stretch', equipment_tier: 'open_space', pain_areas: ['lower', 'general'], intensity_tier: 1, movement_pattern: 'hip_mobility', pain_types_safe: ['all'], triggers_addressed: ['sitting', 'standing'], goals_weight: { reduce_pain: 0.6, mobility: 0.7 }, effectiveness: 4, fatigue_cost: 1, usefulness: 4, aggravates: [], phase: 'mobility', duration_seconds: 30, reps: null, duration_minutes_est: 3 }),
  ex({ id: 'C05', name: 'Knee-to-Chest', equipment_tier: 'open_space', pain_areas: ['lower'], intensity_tier: 1, movement_pattern: 'lumbar_mobility', pain_types_safe: ['stiffness', 'ache', 'all'], triggers_addressed: ['morning'], goals_weight: { reduce_pain: 0.7, mobility: 0.6 }, effectiveness: 3, fatigue_cost: 1, usefulness: 4, aggravates: [], phase: 'mobility', duration_seconds: 30, reps: null, duration_minutes_est: 3 }),
  ex({ id: 'C06', name: 'Bird Dog', equipment_tier: 'open_space', pain_areas: ['lower', 'general'], intensity_tier: 2, movement_pattern: 'spinal_stability', pain_types_safe: ['all'], triggers_addressed: ['bending', 'standing'], goals_weight: { reduce_pain: 0.8, return_to_exercise: 0.6 }, effectiveness: 5, fatigue_cost: 2, usefulness: 5, aggravates: [], phase: 'activation', reps: 8, duration_minutes_est: 4 }),
  ex({ id: 'C07', name: 'Dead Bug', equipment_tier: 'open_space', pain_areas: ['lower', 'general'], intensity_tier: 2, movement_pattern: 'core_activation', pain_types_safe: ['all'], triggers_addressed: ['bending'], goals_weight: { reduce_pain: 0.8, return_to_exercise: 0.6 }, effectiveness: 5, fatigue_cost: 2, usefulness: 5, aggravates: [], phase: 'activation', duration_seconds: 45, reps: null, duration_minutes_est: 4 }),
  ex({ id: 'C08', name: 'Glute Bridge', equipment_tier: 'open_space', pain_areas: ['lower', 'general'], intensity_tier: 2, movement_pattern: 'glute_activation', pain_types_safe: ['all'], triggers_addressed: ['sitting', 'standing'], goals_weight: { reduce_pain: 0.7, return_to_exercise: 0.6 }, effectiveness: 4, fatigue_cost: 2, usefulness: 5, aggravates: [], phase: 'activation', reps: 12, duration_minutes_est: 4 }),
  ex({ id: 'C09', name: 'Side Plank', equipment_tier: 'open_space', pain_areas: ['lower', 'general'], intensity_tier: 3, movement_pattern: 'spinal_stability', pain_types_safe: ['ache', 'stiffness', 'all'], triggers_addressed: ['standing'], goals_weight: { reduce_pain: 0.7, return_to_exercise: 0.7 }, effectiveness: 4, fatigue_cost: 3, usefulness: 4, aggravates: [], phase: 'activation', duration_seconds: 30, reps: null, duration_minutes_est: 3 }),
  ex({ id: 'C10', name: 'Banded Clamshell', equipment_tier: 'bands_dumbbells', pain_areas: ['lower', 'general'], intensity_tier: 2, movement_pattern: 'glute_activation', pain_types_safe: ['all'], triggers_addressed: ['sitting', 'standing'], goals_weight: { reduce_pain: 0.6, return_to_exercise: 0.6 }, effectiveness: 3, fatigue_cost: 2, usefulness: 4, aggravates: [], phase: 'activation', reps: 15, duration_minutes_est: 4 }),
  ex({ id: 'C11', name: 'Bodyweight Hip Hinge', equipment_tier: 'open_space', pain_areas: ['lower'], intensity_tier: 2, movement_pattern: 'hip_hinge', pain_types_safe: ['all'], triggers_addressed: ['bending'], goals_weight: { reduce_pain: 0.7, return_to_exercise: 0.7 }, effectiveness: 4, fatigue_cost: 2, usefulness: 5, aggravates: [], phase: 'strength', reps: 12, duration_minutes_est: 4 }),
  ex({ id: 'C12', name: 'Banded RDL', equipment_tier: 'bands_dumbbells', pain_areas: ['lower', 'general'], intensity_tier: 3, movement_pattern: 'hip_hinge', pain_types_safe: ['ache', 'stiffness', 'all'], triggers_addressed: ['bending', 'exercise'], goals_weight: { return_to_exercise: 0.8, reduce_pain: 0.5 }, effectiveness: 4, fatigue_cost: 3, usefulness: 4, aggravates: [], phase: 'strength', reps: 12, duration_minutes_est: 5 }),
  ex({ id: 'C13', name: 'Dumbbell RDL', equipment_tier: 'bands_dumbbells', pain_areas: ['lower', 'general'], intensity_tier: 4, movement_pattern: 'posterior_chain_strength', pain_types_safe: ['ache', 'all'], triggers_addressed: ['bending', 'exercise'], goals_weight: { return_to_exercise: 0.9 }, effectiveness: 4, fatigue_cost: 4, usefulness: 4, aggravates: [], phase: 'strength', reps: 10, duration_minutes_est: 5 }),
  ex({ id: 'C14', name: 'Goblet Squat', equipment_tier: 'bands_dumbbells', pain_areas: ['lower', 'general'], intensity_tier: 3, movement_pattern: 'lower_body_strength', pain_types_safe: ['ache', 'all'], triggers_addressed: ['exercise', 'standing'], goals_weight: { return_to_exercise: 0.8, reduce_pain: 0.4 }, effectiveness: 4, fatigue_cost: 3, usefulness: 4, aggravates: [], phase: 'strength', reps: 10, duration_minutes_est: 5 }),
  ex({ id: 'C15', name: 'Barbell Hip Thrust', equipment_tier: 'gym', pain_areas: ['lower', 'general'], intensity_tier: 4, movement_pattern: 'glute_activation', pain_types_safe: ['ache', 'all'], triggers_addressed: ['exercise', 'sitting'], goals_weight: { return_to_exercise: 0.9, reduce_pain: 0.4 }, effectiveness: 5, fatigue_cost: 4, usefulness: 4, aggravates: [], phase: 'strength', reps: 10, duration_minutes_est: 6 }),
  ex({ id: 'C16', name: 'Seated Cable Row', equipment_tier: 'gym', pain_areas: ['upper', 'middle', 'general'], intensity_tier: 3, movement_pattern: 'posterior_chain_strength', pain_types_safe: ['all'], triggers_addressed: ['sitting'], goals_weight: { return_to_exercise: 0.8, reduce_pain: 0.5 }, effectiveness: 4, fatigue_cost: 3, usefulness: 4, aggravates: [], phase: 'strength', reps: 12, duration_minutes_est: 5 }),
  ex({ id: 'C17', name: 'Leg Press', equipment_tier: 'gym', pain_areas: ['lower', 'general'], intensity_tier: 4, movement_pattern: 'lower_body_strength', pain_types_safe: ['ache', 'all'], triggers_addressed: ['exercise'], goals_weight: { return_to_exercise: 0.9 }, effectiveness: 4, fatigue_cost: 4, usefulness: 3, aggravates: [], phase: 'strength', reps: 12, duration_minutes_est: 5 }),
  ex({ id: 'C18', name: "Child's Pose", equipment_tier: 'open_space', pain_areas: ['lower', 'general'], intensity_tier: 1, movement_pattern: 'stretch_recovery', pain_types_safe: ['all'], triggers_addressed: ['morning'], goals_weight: { reduce_pain: 0.6, sleep: 0.7, mobility: 0.5 }, effectiveness: 3, fatigue_cost: 1, usefulness: 4, aggravates: [], phase: 'recovery', duration_seconds: 40, reps: null, duration_minutes_est: 3 }),
  ex({ id: 'C19', name: 'Figure-4 Stretch', equipment_tier: 'open_space', pain_areas: ['lower'], intensity_tier: 1, movement_pattern: 'stretch_recovery', pain_types_safe: ['all'], triggers_addressed: ['sitting'], goals_weight: { reduce_pain: 0.6, sleep: 0.6, mobility: 0.5 }, effectiveness: 3, fatigue_cost: 1, usefulness: 4, aggravates: [], phase: 'recovery', duration_seconds: 30, reps: null, duration_minutes_est: 3 }),
  ex({ id: 'C20', name: 'Weighted Sit-Up', equipment_tier: 'bands_dumbbells', pain_areas: ['general'], intensity_tier: 3, movement_pattern: 'core_activation', pain_types_safe: ['ache', 'all'], triggers_addressed: ['exercise'], goals_weight: { return_to_exercise: 0.5 }, effectiveness: 3, fatigue_cost: 3, usefulness: 2, aggravates: ['flexion_loaded'], phase: 'strength', reps: 12, duration_minutes_est: 4 }),
];

const template: TemplateInput = {
  week_phase_plan: {
    early: { mobility: 0.6, activation: 0.4 },
    mid: { mobility: 0.25, activation: 0.4, strength: 0.35 },
    late: { mobility: 0.2, activation: 0.3, strength: 0.4, recovery: 0.1 },
  },
  sessions: [
    {
      session_index: 1,
      title_template: '{area} Mobility & Foundation',
      phase: 'mobility',
      slots: [
        { slot_order: 1, selection_criteria: { phase: 'mobility', movement_pattern: 'thoracic_mobility', pain_area_bias: 'match_user' } },
        { slot_order: 2, selection_criteria: { phase: 'mobility', movement_pattern: 'lumbar_mobility' } },
        { slot_order: 3, selection_criteria: { phase: 'mobility', movement_pattern: 'hip_mobility' } },
        { slot_order: 4, selection_criteria: { phase: 'recovery', movement_pattern: 'stretch_recovery' } },
      ],
    },
    {
      session_index: 2,
      title_template: '{area} Stability Foundation',
      phase: 'activation',
      slots: [
        { slot_order: 1, selection_criteria: { phase: 'mobility', movement_pattern: 'thoracic_mobility' } },
        { slot_order: 2, selection_criteria: { phase: 'activation', movement_pattern: 'core_activation' } },
        { slot_order: 3, selection_criteria: { phase: 'activation', movement_pattern: 'glute_activation' } },
        { slot_order: 4, selection_criteria: { phase: 'activation', movement_pattern: 'spinal_stability' } },
      ],
    },
    {
      session_index: 3,
      title_template: '{area} Strength & Control',
      phase: 'strength',
      slots: [
        { slot_order: 1, selection_criteria: { phase: 'mobility' } },
        { slot_order: 2, selection_criteria: { phase: 'activation', movement_pattern: 'glute_activation' } },
        { slot_order: 3, selection_criteria: { phase: 'strength', movement_pattern: 'hip_hinge' } },
        { slot_order: 4, selection_criteria: { phase: 'strength', movement_pattern: 'posterior_chain_strength' } },
      ],
    },
    {
      session_index: 4,
      title_template: '{area} Mobility & Recovery',
      phase: 'recovery',
      slots: [
        { slot_order: 1, selection_criteria: { phase: 'mobility', movement_pattern: 'lumbar_mobility' } },
        { slot_order: 2, selection_criteria: { phase: 'mobility', movement_pattern: 'hip_mobility' } },
        { slot_order: 3, selection_criteria: { phase: 'recovery', movement_pattern: 'stretch_recovery' } },
      ],
    },
    {
      session_index: 5,
      title_template: '{area} Strength & Endurance',
      phase: 'strength',
      slots: [
        { slot_order: 1, selection_criteria: { phase: 'activation', movement_pattern: 'core_activation' } },
        { slot_order: 2, selection_criteria: { phase: 'strength', movement_pattern: 'lower_body_strength' } },
        { slot_order: 3, selection_criteria: { phase: 'strength', movement_pattern: 'posterior_chain_strength' } },
        { slot_order: 4, selection_criteria: { phase: 'activation', movement_pattern: 'spinal_stability' } },
      ],
    },
  ],
};

const replacements: ReplacementEntry[] = [
  { movement_pattern: 'thoracic_mobility', exercise_id: 'C02', priority: 10 },
  { movement_pattern: 'thoracic_mobility', exercise_id: 'C03', priority: 20 },
  { movement_pattern: 'lumbar_mobility', exercise_id: 'C01', priority: 10 },
  { movement_pattern: 'lumbar_mobility', exercise_id: 'C05', priority: 20 },
  { movement_pattern: 'hip_mobility', exercise_id: 'C04', priority: 10 },
  { movement_pattern: 'core_activation', exercise_id: 'C07', priority: 10 },
  { movement_pattern: 'core_activation', exercise_id: 'C20', priority: 30 },
  { movement_pattern: 'glute_activation', exercise_id: 'C08', priority: 10 },
  { movement_pattern: 'glute_activation', exercise_id: 'C10', priority: 20 },
  { movement_pattern: 'glute_activation', exercise_id: 'C15', priority: 30 },
  { movement_pattern: 'spinal_stability', exercise_id: 'C06', priority: 10 },
  { movement_pattern: 'spinal_stability', exercise_id: 'C09', priority: 20 },
  { movement_pattern: 'hip_hinge', exercise_id: 'C11', priority: 10 },
  { movement_pattern: 'hip_hinge', exercise_id: 'C12', priority: 20 },
  { movement_pattern: 'posterior_chain_strength', exercise_id: 'C13', priority: 10 },
  { movement_pattern: 'posterior_chain_strength', exercise_id: 'C16', priority: 20 },
  { movement_pattern: 'lower_body_strength', exercise_id: 'C14', priority: 10 },
  { movement_pattern: 'lower_body_strength', exercise_id: 'C17', priority: 20 },
  { movement_pattern: 'stretch_recovery', exercise_id: 'C18', priority: 10 },
  { movement_pattern: 'stretch_recovery', exercise_id: 'C19', priority: 20 },
];

const byId = new Map(exercises.map((e) => [e.id, e]));

const personas: { name: string; answers: Answers }[] = [
  {
    name: 'A: open_space / acute / [sharp] / lower / sedentary / [sitting] / [reduce_pain]',
    answers: { pain_location: 'lower', pain_duration: 'acute', pain_type: ['sharp'], activity_level: 'sedentary', pain_trigger: ['sitting'], equipment: 'open_space', main_goal: ['reduce_pain'], sessions_per_week_preference: 3 },
  },
  {
    name: 'B: gym / subacute / [ache] / lower / athlete / [exercise] / [return_to_exercise]',
    answers: { pain_location: 'lower', pain_duration: 'subacute', pain_type: ['ache'], activity_level: 'athlete', pain_trigger: ['exercise'], equipment: 'gym', main_goal: ['return_to_exercise'], sessions_per_week_preference: 4 },
  },
  {
    name: 'C: bands / chronic / [stiffness] / all / active / [morning] / [mobility]',
    answers: { pain_location: 'all', pain_duration: 'chronic', pain_type: ['stiffness'], activity_level: 'active', pain_trigger: ['morning'], equipment: 'bands_dumbbells', main_goal: ['mobility'], sessions_per_week_preference: 4 },
  },
  {
    name: 'D: open_space / subacute / [sharp,stiffness] / lower / light / [sitting,morning] / [reduce_pain,mobility]',
    answers: { pain_location: 'lower', pain_duration: 'subacute', pain_type: ['sharp', 'stiffness'], activity_level: 'light', pain_trigger: ['sitting', 'morning'], equipment: 'open_space', main_goal: ['reduce_pain', 'mobility'], sessions_per_week_preference: 3 },
  },
];

function weekOneIds(answers: Answers): Set<string> {
  const plan = buildPlan({ answers, rules, rulesVersion: 1, exercises, template, replacements });
  const ids = new Set<string>();
  for (const s of plan.sessions.filter((x) => x.week_number === 1)) {
    for (const e of s.exercises) ids.add(e.exercise_id);
  }
  return ids;
}

function overlapPct(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : Math.round((inter / union) * 100);
}

console.log('=== Persona assignment verification ===\n');
const results = personas.map((p) => {
  const plan = buildPlan({ answers: p.answers, rules, rulesVersion: 1, exercises, template, replacements });
  console.log(`### ${p.name}`);
  console.log(`  name: ${plan.program_name}${plan.subtitle ? ` (${plan.subtitle})` : ''}`);
  console.log(`  duration_weeks=${plan.duration_weeks}  sessions/week=${plan.sessions_per_week}`);
  console.log(`  tagline: ${plan.tagline}`);
  for (const s of plan.sessions.filter((x) => x.week_number === 1)) {
    const names = s.exercises.map((e) => byId.get(e.exercise_id)?.name ?? e.exercise_id);
    const tiers = s.exercises.map((e) => byId.get(e.exercise_id)?.equipment_tier);
    const fatigue = s.exercises.reduce((sum, e) => sum + (byId.get(e.exercise_id)?.fatigue_cost ?? 0), 0);
    console.log(`  W1S${s.session_number} "${s.title}" (${s.estimated_minutes}m, fatigue=${fatigue}): ${names.join(', ')}`);
    console.log(`        tiers: ${tiers.join(', ')}`);
  }
  console.log('');
  return { persona: p, plan, w1: weekOneIds(p.answers) };
});

// --- Checks ---------------------------------------------------------------
let pass = true;
const A = results[0];
const B = results[1];
const C = results[2];
// D is a multi-select persona (sharp+stiffness, sitting+morning, reduce_pain+mobility)

const olAB = overlapPct(A.w1, B.w1);
console.log(`Week-1 overlap A vs B (extremes): ${olAB}%  -> ${olAB < 70 ? 'PASS (<70%)' : 'FAIL'}`);
if (olAB >= 70) pass = false;

const olAC = overlapPct(A.w1, C.w1);
const olBC = overlapPct(B.w1, C.w1);
console.log(`Week-1 overlap A vs C: ${olAC}%   B vs C: ${olBC}%`);

// open_space user must never get a higher-tier exercise.
const aTiers = [...A.w1].map((id) => byId.get(id)?.equipment_tier);
const aClean = aTiers.every((t) => t === 'open_space');
console.log(`open_space user (A) only open_space tier: ${aClean ? 'PASS' : 'FAIL'} (${[...new Set(aTiers)].join(',')})`);
if (!aClean) pass = false;

// Contraindication: lower+sharp+acute excludes flexion_loaded (C20) in early weeks.
const aHasFlexion = [...A.w1].some((id) => (byId.get(id)?.aggravates ?? []).includes('flexion_loaded'));
console.log(`A excludes flexion_loaded in week 1: ${!aHasFlexion ? 'PASS' : 'FAIL'}`);
if (aHasFlexion) pass = false;

// Fatigue budget respected per session.
let fatigueOk = true;
for (const r of results) {
  const budget = rules.activity_level.fatigue_budget[r.persona.answers.activity_level];
  for (const s of r.plan.sessions) {
    const f = s.exercises.reduce((sum, e) => sum + (byId.get(e.exercise_id)?.fatigue_cost ?? 0), 0);
    // First slot may exceed if nothing else fits; allow a small grace of one item.
    if (s.exercises.length > 1 && f > budget) {
      console.log(`  fatigue over budget: ${r.persona.name} W${s.week_number}S${s.session_number} ${f}>${budget}`);
      fatigueOk = false;
    }
  }
}
console.log(`Fatigue budget respected: ${fatigueOk ? 'PASS' : 'FAIL'}`);
if (!fatigueOk) pass = false;

console.log(`\n=== ${pass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'} ===`);
if (!pass) process.exit(1);
