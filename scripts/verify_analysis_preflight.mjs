// Negative test: does the preflight actually reject bad references, or does it pass
// everything? Injects three known-bad insights into a copy of the script and asserts each
// one is caught.
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { execSync } from 'node:child_process';

const path = 'scripts/posthog_analysis_layer.mjs';
const tmp = 'scripts/_preflight_negtest_copy.mjs';
const src = readFileSync(path, 'utf8');

const bad = `
DASHBOARDS[0].insights.push(
  { name: 'BAD event', description: '', query: trends([ev('sessions_completed', { math: 'total' })]) },
  { name: 'BAD event prop', description: '', query: trends([ev('session_completed', { math: 'total' })], byEventProp('reasonn')) },
  { name: 'BAD person prop', description: '', query: trends([ev('session_completed', { math: 'total' })], byPersonProp('is_premiumm')) },
);
`;

// Insert right before the preflight runs.
const marker = '// --- preflight:';
writeFileSync(tmp, src.replace(marker, bad + '\n' + marker));

let output = '';
let code = 0;
try {
  output = execSync(`node ${tmp}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  code = e.status;
  output = (e.stdout ?? '') + (e.stderr ?? '');
}
unlinkSync(tmp);

const checks = [
  ['exits non-zero on bad references', code !== 0],
  ['catches unknown event name', /event "sessions_completed" is not in the taxonomy/.test(output)],
  ['catches unknown event property', /property "reasonn" is on none of/.test(output)],
  ['catches undeclared person property', /person property "is_premiumm" is not declared/.test(output)],
];

let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`);
  if (!ok) failed++;
}
if (failed) console.log('\n--- output ---\n' + output);
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
