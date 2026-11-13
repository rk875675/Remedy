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
import {
  MAX_CUES,
  MAX_CUE_CHARS,
  createCoachMemory,
  exerciseCues,
  holdMoment,
  isHalfway,
  lineAllowed,
  nextIsFinal,
  takeCue,
} from '../lib/petCoach';
import { PET_GENERIC_CUES } from '../constants/petSessionLines';
import {
  exerciseClearRects,
  MIN_PET_SIZE,
  exerciseSpots,
  fitSpots,
  nextSpot,
  rectsIntersect,
  restClearRects,
  restSpots,
  type Rect,
  type Spot,
} from '../lib/petSpots';
import {
  ANGRY_HOLD_MS,
  STORM_TAPS,
  createLadder,
  createPatience,
  ladderTap,
  ladderTick,
  petSleepReason,
  type Patience,
} from '../lib/petTemper';

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

console.log('petSleepReason');
{
  const at = (month: number, day: number, hour: number, minute = 0) =>
    new Date(2026, month - 1, day, hour, minute);
  check('22:00 -> night', petSleepReason(at(3, 4, 22, 0), 'Biscuit') === 'night');
  check('23:59 -> night', petSleepReason(at(3, 4, 23, 59), 'Biscuit') === 'night');
  check('00:00 -> night', petSleepReason(at(3, 4, 0, 0), 'Biscuit') === 'night');
  check('04:59 -> night', petSleepReason(at(3, 4, 4, 59), 'Biscuit') === 'night');
  check('05:00 -> early', petSleepReason(at(3, 4, 5, 0), 'Biscuit') === 'early');
  check('06:59 -> early', petSleepReason(at(3, 4, 6, 59), 'Biscuit') === 'early');
  check('07:00 -> up', petSleepReason(at(3, 4, 7, 0), 'Biscuit') === null);
  check('10:00 -> up', petSleepReason(at(3, 4, 10, 0), 'Biscuit') === null);
  check('21:59 -> up', petSleepReason(at(3, 4, 21, 59), 'Biscuit') === null);

  // Nap days: same answer for the whole window, whatever the time of day, and mixed across days.
  let napDays = 0;
  let consistent = true;
  let outsideWindow = true;
  const days = 400;
  for (let i = 0; i < days; i += 1) {
    const day = new Date(2026, 0, 1 + i);
    const month = day.getMonth() + 1;
    const date = day.getDate();
    const first = petSleepReason(at(month, date, 13, 0), 'Biscuit');
    if (first === 'nap') napDays += 1;
    for (const [h, m] of [[13, 30], [14, 0], [15, 29]] as Array<[number, number]>) {
      if (petSleepReason(at(month, date, h, m), 'Biscuit') !== first) consistent = false;
    }
    if (petSleepReason(at(month, date, 15, 30), 'Biscuit') !== null) outsideWindow = false;
    if (petSleepReason(at(month, date, 12, 59), 'Biscuit') !== null) outsideWindow = false;
  }
  check('a nap day is stable across 13:00-15:29', consistent);
  check('never a nap at 12:59 or 15:30', outsideWindow);
  const share = napDays / days;
  check('about 45% of days are nap days', share > 0.35 && share < 0.55, `got ${(share * 100).toFixed(1)}%`);
  check('nap days vary with the pet', (() => {
    let differs = 0;
    for (let i = 0; i < 60; i += 1) {
      const day = new Date(2026, 5, 1 + i);
      const a = petSleepReason(at(day.getMonth() + 1, day.getDate(), 14), 'Biscuit');
      const b = petSleepReason(at(day.getMonth() + 1, day.getDate(), 14), 'Pebble');
      if (a !== b) differs += 1;
    }
    return differs > 0;
  })());
}

console.log('createPatience');
{
  const feed = (p: Patience, times: number[]) => times.map((t) => p.tap(t));

  const calm = createPatience();
  check(
    'calm taps (3 s apart) are always fine',
    feed(calm, [0, 3000, 6000, 9000, 12000, 15000, 18000, 21000]).every((v) => v === 'fine'),
  );

  const quick = createPatience();
  const warn = feed(quick, [0, 400, 800, 1200]);
  check('three quick taps are fine', warn.slice(0, 3).every((v) => v === 'fine'));
  check('the fourth tap inside 2.5 s warns', warn[3] === 'warn');
  check('the warning comes only once', feed(quick, [1500, 1800]).every((v) => v === 'fine'));
  check('the seventh tap snaps', quick.tap(2100) === 'snap');
  check('after a snap it starts over (fine)', quick.tap(2300) === 'fine');

  const slowFour = createPatience();
  check(
    'four taps spread over 3 s do not warn',
    feed(slowFour, [0, 1000, 2000, 3000]).every((v) => v === 'fine'),
  );

  const decay = createPatience();
  feed(decay, [0, 300, 600, 900]);
  check('a calm pause forgets the warning', decay.tap(5000) === 'fine');
  check(
    'and it can warn again afterwards',
    feed(decay, [5200, 5400, 5600]).includes('warn'),
  );

  const reset = createPatience();
  feed(reset, [0, 200, 400, 600]);
  reset.reset();
  check('reset() clears the count', feed(reset, [700, 800, 900]).every((v) => v === 'fine'));
}

console.log('ladder (warn -> angry -> storm, soften)');
{
  // Drive the patience counter and the ladder together, as the Home screen does.
  const run = (times: number[]) => {
    const p = createPatience();
    let state = createLadder();
    const actions: string[] = [];
    for (const t of times) {
      const verdict = state.phase === 'calm' ? p.tap(t) : 'fine';
      const step = ladderTap(state, t, verdict);
      state = step.state;
      if (step.action !== 'none') actions.push(`${step.action}@${t}`);
      // The pet is gone after a storm: later taps on the empty hill do nothing.
      if (step.action === 'storm') break;
    }
    return { actions, state };
  };
  const burst = (count: number, gap: number, start = 0) =>
    Array.from({ length: count }, (_, i) => Math.round(start + i * gap));

  const r20 = run(burst(20, 1000 / 6));
  check(
    'a 20-tap burst at 6 taps/s: warn, angry, storm, in that order, once each',
    r20.actions.length === 3 &&
      r20.actions[0]?.startsWith('warn@') === true &&
      r20.actions[1]?.startsWith('angry@') === true &&
      r20.actions[2]?.startsWith('storm@') === true,
    r20.actions.join(' '),
  );
  check('warn is the 4th tap (500 ms)', r20.actions[0] === 'warn@500', r20.actions[0]);
  check('angry is the 7th tap (1000 ms)', r20.actions[1] === 'angry@1000', r20.actions[1]);
  check('storm is 8 angry taps later (tap 15)', r20.actions[2] === 'storm@2333', r20.actions[2]);
  check('the storm hands back a fresh ladder', r20.state.phase === 'calm');

  const calmTaps = run([0, 3000, 6000, 9000, 12000]);
  check('calm taps never climb the ladder', calmTaps.actions.length === 0);

  const stopsAtAngry = run([...burst(7, 160), 3000, 6000]);
  check(
    'stop after 7 taps: warn then angry, no storm from slow taps',
    stopsAtAngry.actions.length === 2 && stopsAtAngry.actions[1]?.startsWith('angry@') === true,
    stopsAtAngry.actions.join(' '),
  );
  check('and it is still angry', stopsAtAngry.state.phase === 'angry');

  // The long way round: angry, then steady tapping for 5 s (taps 1.2 s apart).
  const slowStorm = run([...burst(7, 160), ...burst(7, 1200, 2000)]);
  check(
    'continued tapping for 5 s while angry also sends it off',
    slowStorm.actions.some((a) => a.startsWith('storm@')),
    slowStorm.actions.join(' '),
  );

  const angry = ladderTap(createLadder(), 0, 'snap');
  check('snap enters angry', angry.action === 'angry' && angry.state.phase === 'angry');
  check('angry does not soften early', ladderTick(angry.state, ANGRY_HOLD_MS - 1).action === 'none');
  check('angry softens after the hold', ladderTick(angry.state, ANGRY_HOLD_MS).action === 'soften');
  const poked = ladderTap(angry.state, 6000, 'fine');
  check('a tap while angry restarts the hold', ladderTick(poked.state, 6000 + ANGRY_HOLD_MS - 1).action === 'none');
  check('and it softens 12 s after that last tap', ladderTick(poked.state, 6000 + ANGRY_HOLD_MS).action === 'soften');
  check('calm never softens', ladderTick(createLadder(), 1e9).action === 'none');
  check('the hold is 12 s', ANGRY_HOLD_MS === 12000);
  check('a storm needs 8 taps', STORM_TAPS === 8);
}

console.log('petCoach (cues from the exercise text)');
{
  const birdDog = exerciseCues('Reach opposite arm and leg. Keep the back still and the hips level.', null);
  check(
    'two sentences become two cues',
    birdDog.length === 2 &&
      birdDog[0] === 'Reach opposite arm and leg.' &&
      birdDog[1] === 'Keep the back still and the hips level.',
    JSON.stringify(birdDog),
  );
  const catCow = exerciseCues('Inhale and arch; exhale and round. Let your head follow your spine.', null);
  check(
    'a semicolon splits a step, capitals and full stops are tidied',
    catCow.length === 3 && catCow[0] === 'Inhale and arch.' && catCow[1] === 'Exhale and round.',
    JSON.stringify(catCow),
  );
  const dash = exerciseCues(
    'Hands behind your head. Arch only the upper back over the chair \u2014 not the low back.',
    null,
  );
  check('a dash inside a short sentence is kept whole', dash.length === 2 && dash[1]?.includes('\u2014') === true, JSON.stringify(dash));
  const long = exerciseCues(
    'Stand tall with your feet hip width apart and slowly shift your weight forward onto the balls of both feet while keeping the chest open, then hold.',
    null,
  );
  check(
    'a too-long sentence is split at the comma or dropped, never over 70 characters',
    long.every((c) => c.length <= MAX_CUE_CHARS),
    JSON.stringify(long),
  );
  check('every cue is within 6-70 characters', [...birdDog, ...catCow, ...dash, ...long].every((c) => c.length >= 6 && c.length <= MAX_CUE_CHARS));
  check('never more than 4 cues', exerciseCues('One thing. Two things. Three things. Four things. Five things. Six things.', null).length === MAX_CUES);
  check('duplicates are dropped', exerciseCues('Breathe out. Breathe out. Breathe in.', null).length === 2);
  check('empty text falls back to generic reminders', exerciseCues(null, null).join('|') === PET_GENERIC_CUES.join('|'));
  check('blank text falls back too', exerciseCues('   ', '')[0] === 'Slow and smooth.');
  check(
    'description is used when there are no instructions',
    exerciseCues(null, 'Keep your neck long.')[0] === 'Keep your neck long.',
  );
  check('junk fragments are dropped', exerciseCues('Ok. Go. Keep your ribs down.', null).join('|') === 'Keep your ribs down.');

  const memory = createCoachMemory();
  const cycle = ['A one.', 'B two.', 'C three.'];
  check(
    'cues cycle in order and wrap',
    [takeCue(memory, cycle), takeCue(memory, cycle), takeCue(memory, cycle), takeCue(memory, cycle)].join(' ') ===
      'A one. B two. C three. A one.',
  );

  check('a normal line waits 6 s', !lineAllowed(5999, 0, false) && lineAllowed(6000, 0, false));
  check('a well-timed line waits 2 s', !lineAllowed(1999, 0, true) && lineAllowed(2000, 0, true));

  check('last 5 s of a 10 s hold', holdMoment(5, 10, 1, 3) === 'last-seconds');
  check('no countdown line on a short hold', holdMoment(5, 6, 1, 3) === null);
  check('last hold announced at its start', holdMoment(10, 10, 3, 3) === 'last-hold');
  check('not announced when there is only one hold', holdMoment(10, 10, 1, 1) === null);
  check('halfway through a long hold', holdMoment(15, 30, 1, 1) === 'halfway');
  check('nothing at zero', holdMoment(0, 10, 1, 1) === null);
  check('halfway through a 6-exercise session', isHalfway(2, 6) && !isHalfway(1, 6) && !isHalfway(3, 6));
  check('no halfway in a short session', !isHalfway(0, 3) && !isHalfway(1, 3));
  check('the rest before the last of 5 exercises', nextIsFinal(3, 5) && !nextIsFinal(2, 5));
  check('no final-next for a single exercise', !nextIsFinal(0, 1));
}

console.log('petSpots (clear of the video, top bar, buttons, name/set/countdown; the caption only for the bubble)');
{
  type Phone = { name: string; w: number; h: number; top: number; bottom: number; size: number; restSize: number };
  const phones: Phone[] = [
    { name: '375x667', w: 375, h: 667, top: 20, bottom: 0, size: 136, restSize: 150 },
    { name: '393x852', w: 393, h: 852, top: 59, bottom: 34, size: 184, restSize: 200 },
  ];
  // Measured the way the session screen lays itself out.
  const layoutFor = (p: Phone, nameBlock: { w: number; h: number }, captionH: number) => {
    const topBar: Rect = { x: 0, y: p.top, w: p.w, h: 72 };
    const video: Rect = { x: 0, y: topBar.y + topBar.h, w: p.w, h: p.w * 0.65 };
    const buttonH = 8 + 52 + Math.max(p.bottom, 24);
    const button: Rect = { x: 0, y: p.h - buttonH, w: p.w, h: buttonH };
    const infoText: Rect = { x: 24, y: video.y + video.h + 24, w: nameBlock.w, h: nameBlock.h };
    const caption: Rect = { x: 24, y: infoText.y + infoText.h, w: p.w - 48, h: captionH };
    return { topBar, video, button, infoText, caption };
  };
  const onScreen = (r: Rect, p: Phone) => r.x >= 0 && r.y >= 0 && r.x + r.w <= p.w && r.y + r.h <= p.h;
  const stageScale = (stage: number) => (stage === 5 ? 1 : stage === 4 ? 0.94 : stage === 3 ? 0.88 : 0.8);
  const exerciseSpotsBase = (name: Spot['name']): Spot => ({
    name,
    kind: 'floor',
    cx: 0,
    groundY: 0,
    scale: 1,
    faceRight: true,
    art: { x: 0, y: 0, w: 1, h: 1 },
    drawn: 1,
    bubble: null,
    coversCaption: false,
  });
  const nameCases = [
    ['short name', { w: 120, h: 98 }],
    ['long name', { w: 327, h: 132 }],
  ] as const;
  const captionCases = [
    ['1-line caption', 23],
    ['4-line caption', 92],
  ] as const;

  for (const p of phones) {
    for (const stage of [2, 3, 5]) {
      for (const [nameLabel, nameBlock] of nameCases) {
        for (const [captionLabel, captionH] of captionCases) {
          const lay = layoutFor(p, nameBlock, captionH);
          const { spots, size } = fitSpots(
            { screen: { w: p.w, h: p.h }, size: p.size, standScale: stageScale(stage), ...lay },
            exerciseSpots,
          );
          const clear = exerciseClearRects(lay);
          const tag = `${p.name} stage ${stage}, ${nameLabel}, ${captionLabel}`;
          check(
            `${tag}: no pet rect touches the name, set/countdown, counter, progress bar, Skip, exit, buttons or video`,
            spots.every((s) => clear.art.every((c) => !rectsIntersect(s.art, c))),
          );
          check(
            `${tag}: coversCaption is true exactly when he overlaps the caption`,
            spots.every((s) => s.coversCaption === (clear.caption !== null && rectsIntersect(s.art, clear.caption))),
          );
          check(
            `${tag}: no bubble touches any of them or the caption, and every bubble is fully on screen`,
            spots.every(
              (s) => s.bubble === null || (clear.bubble.every((c) => !rectsIntersect(s.bubble!.rect, c)) && onScreen(s.bubble!.rect, p)),
            ),
          );
          check(`${tag}: never cut off by the screen edge`, spots.every((s) => onScreen(s.art, p)));
          check(
            `${tag}: size stepped down only as far as 120`,
            spots.length === 0 || (size <= p.size && size >= MIN_PET_SIZE),
          );
          check(
            `${tag}: spot names are unique, all on the floor`,
            new Set(spots.map((s) => s.name)).size === spots.length && spots.every((s) => s.kind === 'floor' && s.scale > 1),
          );
        }
      }
    }
  }

  // The layouts the owner sees most: a normal phone with a short name and a short caption has places to go.
  {
    const lay = layoutFor(phones[1]!, { w: 120, h: 98 }, 23);
    const { spots, size } = fitSpots(
      { screen: { w: 393, h: 852 }, size: 184, standScale: 1, ...lay },
      exerciseSpots,
    );
    check('393x852 short name, 1-line caption, stage 5: at least 2 spots', spots.length >= 2, spots.map((s) => s.name).join(','));
    check('and he keeps his full size there', size === 184, String(size));
    check('at least one of them has a bubble', spots.some((s) => s.bubble !== null));
  }
  // Small phone: he may stand over the caption, so a short name still gives him a spot at full size;
  // a long name fills the space above the button and no spot is left.
  {
    const run = (name: { w: number; h: number }) =>
      fitSpots(
        { screen: { w: 375, h: 667 }, size: 136, standScale: 1, ...layoutFor(phones[0]!, name, 23) },
        exerciseSpots,
      );
    const short = run({ w: 120, h: 98 });
    check('375x667 short name: a spot at full size (136), over the caption', short.spots.length >= 1 && short.size === 136 && short.spots.every((s) => s.coversCaption));
    check('375x667 long name: no spot that would cover the name', run({ w: 327, h: 132 }).spots.length === 0);
  }
  // Normal phone: always a spot at full size, whatever the name and caption.
  for (const stage of [2, 5]) {
    for (const [, nameBlock] of nameCases) {
      for (const [, captionH] of captionCases) {
        const r = fitSpots(
          { screen: { w: 393, h: 852 }, size: 184, standScale: stageScale(stage), ...layoutFor(phones[1]!, nameBlock, captionH) },
          exerciseSpots,
        );
        check(`393x852 stage ${stage} name ${nameBlock.w} caption ${captionH}: full size 184, never hidden`, r.size === 184 && r.spots.length >= 1);
      }
    }
  }
  // The caption overlap is only used when nothing better exists.
  {
    const clean = { ...exerciseSpotsBase('floorLeft'), coversCaption: false };
    const over = { ...exerciseSpotsBase('floorRight'), coversCaption: true };
    let onlyClean = true;
    for (let i = 0; i < 100; i += 1) if (nextSpot([clean, over], null, null)?.name !== 'floorLeft') onlyClean = false;
    check('a spot clear of the caption is preferred', onlyClean);
    check('a caption-covering spot is used when it is the only one', nextSpot([over], null, null)?.name === 'floorRight');
  }

  // Rest.
  for (const p of phones) {
    const ring: Rect = { x: (p.w - 220) / 2, y: p.top + 96, w: 220, h: 220 };
    const exit: Rect = { x: 16, y: p.top + 12, w: 36, h: 36 };
    const skip: Rect = { x: (p.w - 150) / 2, y: ring.y + 220 + 150, w: 150, h: 46 };
    const { spots } = fitSpots(
      { screen: { w: p.w, h: p.h }, size: p.restSize, standScale: 1, ring, exit, skip },
      restSpots,
    );
    const clear = restClearRects({ ring, exit, skip });
    check(`${p.name} rest: two spots beside the ring`, spots.length === 2, spots.map((s) => s.name).join(','));
    check(
      `${p.name} rest: pet and bubble clear of the digits, exit and Skip Rest, never cut off`,
      spots.every(
        (s) =>
          clear.art.every((c) => !rectsIntersect(s.art, c)) &&
          onScreen(s.art, p) &&
          (s.bubble === null || (clear.bubble.every((c) => !rectsIntersect(s.bubble!.rect, c)) && onScreen(s.bubble!.rect, p))),
      ),
    );
  }

  // Choosing where to go next.
  {
    const base = {
      kind: 'floor' as const,
      cx: 0,
      groundY: 0,
      scale: 1,
      faceRight: true,
      art: { x: 0, y: 0, w: 1, h: 1 },
      drawn: 1,
      bubble: null,
      coversCaption: false,
    };
    const spots: Spot[] = [
      { ...base, name: 'floorLeft' },
      { ...base, name: 'floorMid' },
      { ...base, name: 'floorRight' },
    ];
    let never = true;
    for (let i = 0; i < 300; i += 1) {
      const next = nextSpot(spots, 'floorMid', 'floorLeft');
      if (!next || next.name !== 'floorRight') never = false;
    }
    check('never the same spot as now, never the one before that', never);
    check('with two spots he alternates', nextSpot(spots.slice(0, 2), 'floorLeft', 'floorMid')?.name === 'floorMid');
    check('one spot only: nowhere else to go', nextSpot([spots[0]!], 'floorLeft', null) === null);
    check('rectsIntersect is strict', !rectsIntersect({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 }));
  }
}
if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll pet checks passed');
