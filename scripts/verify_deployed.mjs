// Hit the DEPLOYED assign-program function (preview_only, inline answers) and
// print week-1 vs final-week sessions for three personas.
// Usage: node scripts/verify_deployed.mjs
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  ['.env', '.env.local']
    .flatMap((f) => {
      try {
        return readFileSync(f, 'utf8').split(/\r?\n/);
      } catch {
        return [];
      }
    })
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const base = {
  pain_location: 'lower',
  pain_duration: 'chronic',
  pain_type: ['ache'],
  pain_trigger: ['bending', 'exercise'],
  main_goal: ['return_to_exercise'],
  sessions_per_week_preference: 3,
};
const personas = [
  ['A: no equipment / athlete', { ...base, equipment: 'open_space', activity_level: 'athlete' }],
  ['B: bands / active', { ...base, equipment: 'bands_dumbbells', activity_level: 'active' }],
  ['C: gym / athlete', { ...base, equipment: 'gym', activity_level: 'athlete' }],
];

async function preview(answers, startWeek) {
  const res = await fetch(`${URL_}/functions/v1/assign-program`, {
    method: 'POST',
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${ANON}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ preview_only: true, answers, start_week: startWeek }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body)}`);
  return body;
}

for (const [label, answers] of personas) {
  const w1 = await preview(answers, 1);
  const wLast = await preview(answers, w1.duration_weeks);
  console.log(`\n=== ${label} — ${w1.program_name} (${w1.duration_weeks} wks) ===`);
  for (const [tag, resp] of [['WEEK 1', w1], [`WEEK ${w1.duration_weeks}`, wLast]]) {
    console.log(`  ${tag}:`);
    for (const s of resp.week_one) {
      const exs = s.exercises
        .map((e) => {
          const dose =
            e.reps && e.duration_seconds
              ? `${e.sets}x${e.reps}x${e.duration_seconds}s`
              : e.reps
                ? `${e.sets}x${e.reps}`
                : `${e.sets}x${e.duration_seconds}s`;
          return `${e.name} ${dose}`;
        })
        .join(' | ');
      console.log(`    S${s.session_number} (t${s.intensity_tier}) ${s.title}: ${exs}`);
    }
  }
}
