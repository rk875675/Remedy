// One-shot check that entitlements.is_sandbox exists (migration 035). Selecting a
// missing column through PostgREST errors; an empty result proves the column is live.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);
const { error: signUpError, data } = await supabase.auth.signUp({
  email: `verify035+${Date.now()}@example.com`,
  password: `Vt-${crypto.randomUUID()}`,
});
if (signUpError || !data.session) {
  console.log('FAIL: no test session:', signUpError?.message);
  process.exit(1);
}
const { error } = await supabase.from('entitlements').select('is_sandbox').limit(1);
console.log(error ? `FAIL: ${error.message}` : 'PASS: entitlements.is_sandbox column exists');
process.exit(error ? 1 : 0);
