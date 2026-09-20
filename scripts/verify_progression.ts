// Simulate buildPlan() locally against the REAL remote rules/catalog/template
// and print week-by-week selections + dosing for three personas.
// Usage: node --experimental-strip-types scripts/verify_progression.ts
import { readFileSync } from 'node:fs';
import {
  buildPlan,
  type Answers,
  type AssignmentRulesConfig,
  type CatalogExercise,
  type ReplacementEntry,
  type TemplateInput,
} from '../supabase/functions/_shared/assignment/engine.ts';

const env = Object.fromEntries(
  ['.env', '.env.local']
    .flatMap((f) => {
      try {
        return readFileSync(f, 'utf8').split(/\r?\n/);
      } catch {
        return [] as string[];
      }
    })
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);

// Real environment wins, so credentials can be passed for a single run without being
// written into .env.local.
for (const [k, v] of Object.entries(process.env)) {
  if (v) env[k] = v;
}
const URL_ = env.EXPO_PUBLIC_SUPABASE_URL!;
const ANON = env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// The catalog tables below are `SELECT` for role `authenticated`, so this needs a real
// session. Two ways to get one, in order:
//
//   1. VERIFY_EMAIL / VERIFY_PASSWORD for an existing CONFIRMED account (.env.local).
//   2. An ad-hoc signup — only works while email confirmation is disabled.
//
// This used to do (2) unconditionally and read access_token off the signup response.
// Once email confirmation was switched on, signup stopped returning a session, so the
// script sent `Bearer undefined` and every read failed with a bare
// `401 Expected 3 parts in JWT; got 1`. It also used @example.com, which Supabase
// rejects with a 500.
async function getToken(): Promise<string> {
  const authHeaders = { apikey: ANON, 'Content-Type': 'application/json' };

  const password = async (email: string, pass: string): Promise<string | null> => {
    const res = await fetch(`${URL_}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({ email, password: pass }),
    });
    const body = (await res.json()) as { access_token?: string };
    return body.access_token ?? null;
  };

  if (env.VERIFY_EMAIL && env.VERIFY_PASSWORD) {
    const token = await password(env.VERIFY_EMAIL, env.VERIFY_PASSWORD);
    if (token) return token;
    throw new Error(
      'VERIFY_EMAIL / VERIFY_PASSWORD were set but sign-in failed. Check the credentials ' +
        'and that the account is confirmed.',
    );
  }

  const email = `verify+${Date.now()}@gmail.com`;
  const pass = `Verify-${Date.now()}!`;
  const res = await fetch(`${URL_}/auth/v1/signup`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({ email, password: pass }),
  });
  if (!res.ok) throw new Error(`signup -> ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { access_token?: string };
  if (body.access_token) return body.access_token;

  const token = await password(email, pass);
  if (token) return token;

  throw new Error(
    'Could not obtain a session: email confirmation is enabled, so a fresh signup cannot ' +
      'sign in. Add VERIFY_EMAIL and VERIFY_PASSWORD for an existing confirmed account to ' +
      '.env.local and re-run.',
  );
}

const token = await getToken();

async function q<T>(path: string): Promise<T> {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    headers: { apikey: ANON, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

const [rulesRows, exercises, templates, replacements] = await Promise.all([
  q<{ version: number; rules: AssignmentRulesConfig }[]>('assignment_rules?is_active=eq.true&select=version,rules'),
  q<CatalogExercise[]>('exercises?is_assignable=eq.true&select=*'),
  q<{ id: string; week_phase_plan: Record<string, Record<string, number>> }[]>(
    'program_templates?is_active=eq.true&select=id,week_phase_plan',
  ),
  q<ReplacementEntry[]>('exercise_replacement_groups?select=movement_pattern,exercise_id,priority'),
]);
const rules = rulesRows[0].rules;
const rulesVersion = rulesRows[0].version;
const templateId = templates[0].id;

const tSessions = await q<
  { id: string; session_index: number; title_template: string; phase: string }[]
>(`program_template_sessions?template_id=eq.${templateId}&select=id,session_index,title_template,phase&order=session_index`);
const tSlots = await q<
  { template_session_id: string; slot_order: number; selection_criteria: Record<string, unknown> }[]
>(`program_template_slots?template_session_id=in.(${tSessions.map((s) => s.id).join(',')})&select=template_session_id,slot_order,selection_criteria`);

const template: TemplateInput = {
  week_phase_plan: templates[0].week_phase_plan,
  sessions: tSessions.map((s) => ({
    session_index: s.session_index,
    title_template: s.title_template,
    phase: s.phase,
    slots: tSlots
      .filter((sl) => sl.template_session_id === s.id)
      .map((sl) => ({ slot_order: sl.slot_order, selection_criteria: sl.selection_criteria })),
  })),
};

const byId = new Map(exercises.map((e) => [e.id, e]));

const base: Omit<Answers, 'equipment' | 'activity_level'> = {
  pain_location: 'lower',
  pain_duration: 'chronic',
  pain_type: ['ache'],
  pain_trigger: ['bending', 'exercise'],
  main_goal: ['return_to_exercise'],
  sessions_per_week_preference: 3,
};

const personas: { label: string; answers: Answers }[] = [
  { label: 'A: no equipment / athlete / chronic', answers: { ...base, equipment: 'open_space', activity_level: 'athlete' } },
  { label: 'B: bands+dumbbells / active / chronic', answers: { ...base, equipment: 'bands_dumbbells', activity_level: 'active' } },
  { label: 'C: gym / athlete / chronic', answers: { ...base, equipment: 'gym', activity_level: 'athlete' } },
  {
    label: 'D: worst case — acute / sharp / sedentary / gym (bodyweight-only early + contraindications)',
    answers: {
      pain_location: 'lower',
      pain_duration: 'acute',
      pain_type: ['sharp'],
      activity_level: 'sedentary',
      pain_trigger: ['morning', 'sitting'],
      main_goal: ['reduce_pain'],
      equipment: 'gym',
      sessions_per_week_preference: 3,
    },
  },
];

for (const p of personas) {
  const plan = buildPlan({
    answers: p.answers,
    rules,
    rulesVersion,
    exercises,
    template,
    replacements,
  });
  console.log(`\n=================== ${p.label} ===================`);
  console.log(`${plan.program_name} — ${plan.duration_weeks} wks x ${plan.sessions_per_week}/wk`);
  for (const s of plan.sessions) {
    const lines = s.exercises.map((e) => {
      const ex = byId.get(e.exercise_id)!;
      const dose =
        e.reps && e.duration_seconds
          ? `${e.sets}x${e.reps}x${e.duration_seconds}s holds`
          : e.reps
            ? `${e.sets}x${e.reps}`
            : `${e.sets}x${e.duration_seconds}s`;
      return `${ex.name} [t${ex.intensity_tier}/${ex.phase}] ${dose}`;
    });
    console.log(`  W${s.week_number} S${s.session_number} (target t${s.intensity_tier}) ${s.title}`);
    for (const l of lines) console.log(`      ${l}`);
  }
}
