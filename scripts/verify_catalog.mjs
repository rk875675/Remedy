// Verify catalog v3 state on the linked remote DB (auth via throwaway signup).
// Usage: node scripts/verify_catalog.mjs
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
if (!URL_ || !ANON) throw new Error('Missing Supabase env vars in .env');

const email = `verify+${Date.now()}@example.com`;
const signup = await fetch(`${URL_}/auth/v1/signup`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password: 'Verify-12345!' }),
});
const session = await signup.json();
const token = session.access_token;
if (!token) throw new Error(`signup failed: ${JSON.stringify(session)}`);

async function q(path) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return res.json();
}

const exercises = await q(
  'exercises?is_assignable=eq.true&select=id,name,equipment_tier,intensity_tier,movement_pattern,phase,sets,reps,duration_seconds,rest_seconds&order=movement_pattern,intensity_tier',
);
console.log(`Assignable exercises: ${exercises.length}`);
const byTier = {};
for (const e of exercises) byTier[e.equipment_tier] = (byTier[e.equipment_tier] ?? 0) + 1;
console.log('By tier:', byTier);
console.log('\npattern | name | tier | intensity | phase | dosing');
for (const e of exercises) {
  const dose = e.reps && e.duration_seconds
    ? `${e.sets}x${e.reps} holds of ${e.duration_seconds}s`
    : e.reps
      ? `${e.sets}x${e.reps}`
      : `${e.sets}x${e.duration_seconds}s`;
  console.log(
    `${e.movement_pattern} | ${e.name} | ${e.equipment_tier} | t${e.intensity_tier} | ${e.phase} | ${dose} rest ${e.rest_seconds}s`,
  );
}

const ladders = await q(
  'exercise_replacement_groups?select=movement_pattern,priority,exercises(name,intensity_tier,equipment_tier,is_assignable)&order=movement_pattern,priority',
);
console.log('\n--- Replacement ladders ---');
let cur = '';
for (const r of ladders) {
  if (r.movement_pattern !== cur) {
    cur = r.movement_pattern;
    console.log(`\n${cur}:`);
  }
  const e = r.exercises;
  console.log(`  p${r.priority} ${e.name} (t${e.intensity_tier}, ${e.equipment_tier}, assignable=${e.is_assignable})`);
}

// Soft-deleted check
const cut = await q(
  'exercises?is_assignable=eq.false&select=name&order=name',
);
console.log('\nSoft-deleted (never assigned):', cut.map((c) => c.name).join(', '));
