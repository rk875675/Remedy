import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  answersEqual,
  classifyAnswerDiff,
  isPendingApplyDue,
  pendingApplyDecision,
  pickEquipmentSwap,
  sessionSlotsToAdd,
  sessionsToDrop,
  shouldAdvanceAfterSpwDecrease,
  type AnswerSnapshot,
  type PatchExercise,
  type ReplacementRung,
} from '../lib/programAnswers';

const base: AnswerSnapshot = {
  pain_location: 'lower',
  pain_duration: 'chronic',
  pain_type: ['ache'],
  activity_level: 'light',
  pain_trigger: ['sitting'],
  equipment: 'open_space',
  main_goal: ['reduce_pain'],
  sessions_per_week_preference: 3,
};

test('array order does not count as a change', () => {
  const shuffled: AnswerSnapshot = {
    ...base,
    pain_type: ['sharp', 'ache'],
    main_goal: ['mobility', 'reduce_pain'],
  };
  const same: AnswerSnapshot = {
    ...base,
    pain_type: ['ache', 'sharp'],
    main_goal: ['reduce_pain', 'mobility'],
  };
  assert.equal(answersEqual(shuffled, same), true);
  assert.equal(classifyAnswerDiff(shuffled, same).unchanged, true);
});

test('equipment-only is cheap', () => {
  const next = { ...base, equipment: 'gym' as const };
  const diff = classifyAnswerDiff(base, next);
  assert.deepEqual(diff.cheap, ['equipment']);
  assert.deepEqual(diff.expensive, []);
  assert.equal(diff.unchanged, false);
});

test('sessions-per-week-only is cheap', () => {
  const next = { ...base, sessions_per_week_preference: 5 };
  const diff = classifyAnswerDiff(base, next);
  assert.deepEqual(diff.cheap, ['sessions_per_week_preference']);
  assert.deepEqual(diff.expensive, []);
});

test('pain location is expensive', () => {
  const next = { ...base, pain_location: 'upper' as const };
  const diff = classifyAnswerDiff(base, next);
  assert.deepEqual(diff.expensive, ['pain_location']);
  assert.deepEqual(diff.cheap, []);
});

test('mixed cheap and expensive are both reported', () => {
  const next = { ...base, equipment: 'gym' as const, activity_level: 'athlete' as const };
  const diff = classifyAnswerDiff(base, next);
  assert.deepEqual(diff.cheap, ['equipment']);
  assert.deepEqual(diff.expensive, ['activity_level']);
});

test('pending apply waits for the next program week', () => {
  assert.deepEqual(pendingApplyDecision(2, 5, true), {
    pending_apply_week: 3,
    apply_now: false,
  });
  assert.equal(isPendingApplyDue(3, 2), false);
  assert.equal(isPendingApplyDue(3, 3), true);
});

test('last week applies remaining sessions now', () => {
  assert.deepEqual(pendingApplyDecision(5, 5, true), {
    pending_apply_week: 5,
    apply_now: true,
  });
});

test('finished program only saves', () => {
  assert.deepEqual(pendingApplyDecision(6, 5, true), {
    pending_apply_week: null,
    apply_now: false,
  });
});

test('cheap-only never schedules a week-boundary apply', () => {
  assert.deepEqual(pendingApplyDecision(2, 5, false), {
    pending_apply_week: null,
    apply_now: false,
  });
});

const bodyweight: PatchExercise = {
  id: 'bw',
  equipment_tier: 'open_space',
  movement_pattern: 'hinge',
};
const bands: PatchExercise = {
  id: 'bands',
  equipment_tier: 'bands_dumbbells',
  movement_pattern: 'hinge',
};
const gym: PatchExercise = {
  id: 'gym',
  equipment_tier: 'gym',
  movement_pattern: 'hinge',
};
const other: PatchExercise = {
  id: 'other',
  equipment_tier: 'open_space',
  movement_pattern: 'core',
};
const pool = [bodyweight, bands, gym, other];
const ladder: ReplacementRung[] = [
  { movement_pattern: 'hinge', exercise_id: 'bw', priority: 1 },
  { movement_pattern: 'hinge', exercise_id: 'bands', priority: 2 },
  { movement_pattern: 'hinge', exercise_id: 'gym', priority: 3 },
];

test('equipment downgrade swaps off a gym move', () => {
  assert.equal(pickEquipmentSwap(gym, pool, ladder, 1), 'bw');
});

test('equipment upgrade climbs the same ladder', () => {
  assert.equal(pickEquipmentSwap(bodyweight, pool, ladder, 2), 'gym');
});

test('same-tier equipment keeps the current move', () => {
  assert.equal(pickEquipmentSwap(bands, pool, ladder, 1), null);
});

test('used ids are skipped when downgrading', () => {
  assert.equal(pickEquipmentSwap(gym, pool, ladder, 0, undefined, new Set(['bw'])), null);
});

test('spw decrease drops leftover future sessions only', () => {
  const dropped = sessionsToDrop(
    [
      { week_number: 2, session_number: 1 },
      { week_number: 2, session_number: 4 },
      { week_number: 2, session_number: 5 },
      { week_number: 3, session_number: 4 },
      { week_number: 3, session_number: 5 },
    ],
    2,
    2,
    3,
  );
  assert.deepEqual(dropped, [
    { week_number: 2, session_number: 4 },
    { week_number: 2, session_number: 5 },
    { week_number: 3, session_number: 4 },
    { week_number: 3, session_number: 5 },
  ]);
});

test('spw decrease does not drop completed extras this week', () => {
  const dropped = sessionsToDrop(
    [
      { week_number: 2, session_number: 4 },
      { week_number: 2, session_number: 5 },
    ],
    2,
    5,
    3,
  );
  assert.deepEqual(dropped, [{ week_number: 2, session_number: 5 }]);
});

test('spw increase adds only remaining extra slots', () => {
  const added = sessionSlotsToAdd([2, 3], 3, 5, 2, 2);
  assert.deepEqual(added, [
    { week_number: 2, session_number: 4 },
    { week_number: 2, session_number: 5 },
    { week_number: 3, session_number: 4 },
    { week_number: 3, session_number: 5 },
  ]);
});

test('pointer advances when current session no longer exists', () => {
  assert.equal(shouldAdvanceAfterSpwDecrease(4, 3), true);
  assert.equal(shouldAdvanceAfterSpwDecrease(2, 3), false);
});

test('Deno mirror stays in sync with the client rules', () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const client = readFileSync(join(root, 'lib/programAnswers.ts'), 'utf8');
  const edge = readFileSync(
    join(root, 'supabase/functions/_shared/assignment/programAnswers.ts'),
    'utf8',
  );
  const strip = (src: string) =>
    src
      .replace(/^[\s\S]*?\nexport const CHEAP_ANSWER_KEYS/m, 'export const CHEAP_ANSWER_KEYS')
      .replace(/\r\n/g, '\n');
  assert.equal(strip(client), strip(edge));
});
