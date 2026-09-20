// Deterministic checks for lib/greeting.ts. Usage: npx tsx scripts/verify_greeting.ts
import {
  clearRememberedDisplayName,
  firstNameFromDisplayName,
  formatHomeGreeting,
  getTimeOfDayGreeting,
  rememberDisplayName,
  resolveDisplayName,
} from '../lib/greeting';

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  if (cond) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function atHour(hour: number): Date {
  return new Date(2026, 7, 13, hour, 0, 0);
}

console.log('getTimeOfDayGreeting (local hours)');
check('04:00 night', getTimeOfDayGreeting(atHour(4)) === 'Good night');
check('05:00 morning', getTimeOfDayGreeting(atHour(5)) === 'Good morning');
check('11:00 morning', getTimeOfDayGreeting(atHour(11)) === 'Good morning');
check('12:00 afternoon', getTimeOfDayGreeting(atHour(12)) === 'Good afternoon');
check('16:00 afternoon', getTimeOfDayGreeting(atHour(16)) === 'Good afternoon');
check('17:00 night', getTimeOfDayGreeting(atHour(17)) === 'Good night');
check('23:00 night', getTimeOfDayGreeting(atHour(23)) === 'Good night');

console.log('formatHomeGreeting');
check('uses first token of display name', formatHomeGreeting('name', atHour(9)) === 'Good morning, name');
check('full name → first name', formatHomeGreeting('rahul kumar', atHour(9)) === 'Good morning, rahul');
check('no name → greeting only', formatHomeGreeting(null, atHour(21)) === 'Good night');
check('whitespace only → greeting only', formatHomeGreeting('   ', atHour(14)) === 'Good afternoon');
check('firstNameFromDisplayName', firstNameFromDisplayName('  Jane  Doe ') === 'Jane');

console.log('resolveDisplayName');
clearRememberedDisplayName();
check(
  'profile name wins',
  resolveDisplayName('Rahul', { id: 'u1', email: 'rkuma@example.com', user_metadata: { name: 'Other' } }) === 'Rahul',
);
check(
  'falls back to metadata',
  resolveDisplayName(null, { id: 'u1', user_metadata: { full_name: 'Rahul Kumar' } }) === 'Rahul Kumar',
);
check(
  'falls back to email local-part',
  resolveDisplayName(null, { id: 'u1', email: 'rkuma@example.com' }) === 'rkuma',
);
rememberDisplayName('u1', 'Edited');
check(
  'remembered name wins over stale profile',
  resolveDisplayName('Old', { id: 'u1', email: 'rkuma@example.com' }) === 'Edited',
);
check(
  'remembered name is user-scoped',
  resolveDisplayName('Old', { id: 'u2', email: 'other@example.com' }) === 'Old',
);
clearRememberedDisplayName();
check('null when nothing to resolve', resolveDisplayName(null, null) === null);

if (failures > 0) {
  console.error(`\n${failures} failure(s)`);
  process.exit(1);
}
console.log('\nall passed');
