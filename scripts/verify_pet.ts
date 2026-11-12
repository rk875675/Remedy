// Deterministic checks for the pet rules in lib/pet.ts.
// Usage: npx tsx scripts/verify_pet.ts
import {
  derivePetMood,
  petGrowthCopy,
  petStateSchema,
  sessionsUntilNextStage,
  stageProgress,
  type PetMoodInput,
  type PetState,
} from '../lib/pet';

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const THRESHOLDS = [0, 1, 4, 9, 15];

/** Same rule as public.pet_stage_for_sessions in 089_user_pets.sql. */
function stageFor(sessions: number): PetState['stage'] {
  const stage = Math.max(1, THRESHOLDS.filter((needed) => needed <= sessions).length);
  return stage as PetState['stage'];
}

function pet(sessions: number, name: string | null = 'Biscuit'): PetState {
  return {
    name,
    stage: stageFor(sessions),
    total_sessions: sessions,
    last_completed_at: null,
    thresholds: THRESHOLDS,
  };
}

console.log('petStateSchema');
{
  check('accepts the get_pet_state payload', petStateSchema.safeParse(pet(3)).success);
  check('accepts an unnamed pet', petStateSchema.safeParse(pet(0, null)).success);
  check(
    'rejects an unknown key (strict)',
    !petStateSchema.safeParse({ ...pet(3), streak: 2 }).success,
  );
  check('rejects stage 0', !petStateSchema.safeParse({ ...pet(3), stage: 0 }).success);
  check('rejects stage 6', !petStateSchema.safeParse({ ...pet(3), stage: 6 }).success);
  check(
    'rejects a thresholds array of the wrong length',
    !petStateSchema.safeParse({ ...pet(3), thresholds: [0, 1, 4] }).success,
  );
}

console.log('sessionsUntilNextStage');
{
  const expected: Array<[number, number | null]> = [
    [0, 1],
    [1, 3],
    [2, 2],
    [3, 1],
    [4, 5],
    [8, 1],
    [9, 6],
    [14, 1],
    [15, null],
    [40, null],
  ];
  for (const [sessions, want] of expected) {
    const got = sessionsUntilNextStage(pet(sessions));
    check(`${sessions} sessions -> ${want}`, got === want, `got ${got}`);
  }
  // Stage is a high-water mark: history can be deleted while the stage stays.
  const kept: PetState = { ...pet(0), stage: 3 };
  check('stage 3 with 0 sessions on record needs 9', sessionsUntilNextStage(kept) === 9);
  const ahead: PetState = { ...pet(20), stage: 2 };
  check('never reports less than 1 session to go', sessionsUntilNextStage(ahead) === 1);
}

console.log('stageProgress');
{
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
  check('0 sessions -> 0', near(stageProgress(pet(0)), 0));
  check('1 session (just reached stage 2) -> 0', near(stageProgress(pet(1)), 0));
  check('2 sessions -> 1/3', near(stageProgress(pet(2)), 1 / 3));
  check('6 sessions -> 2/5', near(stageProgress(pet(6)), 2 / 5));
  check('14 sessions -> 5/6', near(stageProgress(pet(14)), 5 / 6));
  check('fully grown -> 1', near(stageProgress(pet(15)), 1));
  check('clamps below 0', near(stageProgress({ ...pet(0), stage: 3 }), 0));
  check('clamps above 1', near(stageProgress({ ...pet(20), stage: 2 }), 1));
}

console.log('petGrowthCopy');
{
  check('plural', petGrowthCopy(pet(1)) === '3 sessions until Biscuit grows', petGrowthCopy(pet(1)));
  check('singular', petGrowthCopy(pet(3)) === '1 session until Biscuit grows', petGrowthCopy(pet(3)));
  check('unnamed', petGrowthCopy(pet(0, null)) === '1 session until it grows', petGrowthCopy(pet(0, null)));
  check('fully grown, named', petGrowthCopy(pet(15)) === 'Biscuit is fully grown');
  check('fully grown, unnamed', petGrowthCopy(pet(15, null)) === 'Fully grown');
}

console.log('derivePetMood');
{
  const base: PetMoodInput = {
    programComplete: false,
    isDoneToday: false,
    hasSessionToday: false,
    isRestDay: false,
    missedPlannedDays: 0,
    hour: 10,
  };
  const mood = (over: Partial<PetMoodInput>) => derivePetMood({ ...base, ...over });

  check('session waiting -> ready', mood({ hasSessionToday: true }) === 'ready');
  check(
    'session waiting after a missed day -> stiff',
    mood({ hasSessionToday: true, missedPlannedDays: 1 }) === 'stiff',
  );
  check('done today -> idle', mood({ isDoneToday: true }) === 'idle');
  check('done today, late -> sleepy', mood({ isDoneToday: true, hour: 23 }) === 'sleepy');
  check('rest day -> sleepy', mood({ isRestDay: true }) === 'sleepy');
  check('nothing scheduled, daytime -> idle', mood({}) === 'idle');
  check('nothing scheduled, 3am -> sleepy', mood({ hour: 3 }) === 'sleepy');
  check('5am counts as day', mood({ hour: 5 }) === 'idle');
  check('10pm counts as night', mood({ hour: 22 }) === 'sleepy');
  check(
    'program complete wins over everything',
    mood({ programComplete: true, hasSessionToday: true, missedPlannedDays: 3, hour: 23 }) === 'proud',
  );
  check(
    'done today wins over a missed day (no stiff once the session is done)',
    mood({ isDoneToday: true, missedPlannedDays: 2 }) === 'idle',
  );
  check(
    'a waiting session is never shown as sleepy, even late',
    mood({ hasSessionToday: true, hour: 23 }) === 'ready',
  );
  check(
    'missed days alone do not make a rest day stiff',
    mood({ isRestDay: true, missedPlannedDays: 2 }) === 'sleepy',
  );
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll pet checks passed');
