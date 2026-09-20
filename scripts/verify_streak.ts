// Deterministic checks for this-week session copy in lib/streak.ts.
// Usage: npx tsx scripts/verify_streak.ts
import { countMissedThisWeek, showingUpCopy } from '../lib/streak';
import { activeWorkoutDaysThisWeek } from '../lib/workoutDays';

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function iso(y: number, mo: number, d: number, h = 12): string {
  return new Date(y, mo, d, h, 0, 0).toISOString();
}

// Wednesday Aug 12 2026
const WED = new Date(2026, 7, 12, 14, 0, 0);
const DAYS = [1, 2, 6]; // Tue, Wed, Sun

console.log('activeWorkoutDaysThisWeek');
{
  const thu = new Date(2026, 7, 13, 14, 0, 0); // Thu Aug 13 2026
  check(
    'mid-week start hides Mon/Tue this week',
    JSON.stringify(activeWorkoutDaysThisWeek([0, 2, 3, 5], '2026-08-13', thu)) === JSON.stringify([3, 5]),
  );
  check(
    'next week shows the full pattern',
    JSON.stringify(activeWorkoutDaysThisWeek([0, 2, 3, 5], '2026-08-13', new Date(2026, 7, 17, 14, 0, 0))) === JSON.stringify([0, 2, 3, 5]),
  );
}

console.log('countMissedThisWeek');
{
  check(
    'no completions on wed with tue planned → 1 missed',
    countMissedThisWeek([], DAYS, WED) === 1,
  );
  check(
    'tue done → 0 missed',
    countMissedThisWeek([{ completed_at: iso(2026, 7, 11) }], DAYS, WED) === 0,
  );
  check(
    'today is not counted as missed',
    countMissedThisWeek([], DAYS, WED) === 1,
  );
}

console.log('showingUpCopy');
{
  check(
    'no completions points at starting the week',
    showingUpCopy({
      sessionsThisWeek: 0,
      sessionsPerWeek: 3,
      missedThisWeek: 0,
      hasAnyCompletion: false,
    }).includes('start this week'),
  );
  check(
    'miss takes priority and is supportive',
    showingUpCopy({
      sessionsThisWeek: 1,
      sessionsPerWeek: 3,
      missedThisWeek: 1,
      hasAnyCompletion: true,
    }).includes('okay'),
  );
  check(
    'in-progress week names remaining sessions',
    showingUpCopy({
      sessionsThisWeek: 1,
      sessionsPerWeek: 3,
      missedThisWeek: 0,
      hasAnyCompletion: true,
    }).includes('2 sessions left'),
  );
  check(
    'complete week has no streak language',
    showingUpCopy({
      sessionsThisWeek: 3,
      sessionsPerWeek: 3,
      missedThisWeek: 0,
      hasAnyCompletion: true,
    }).includes("this week's sessions done") &&
      !showingUpCopy({
        sessionsThisWeek: 3,
        sessionsPerWeek: 3,
        missedThisWeek: 0,
        hasAnyCompletion: true,
      }).toLowerCase().includes('streak') &&
      !showingUpCopy({
        sessionsThisWeek: 3,
        sessionsPerWeek: 3,
        missedThisWeek: 0,
        hasAnyCompletion: true,
      }).includes('in a row'),
  );
}

if (failures > 0) {
  console.error(`\n${failures} failed`);
  process.exit(1);
}
console.log('\nall passed');
