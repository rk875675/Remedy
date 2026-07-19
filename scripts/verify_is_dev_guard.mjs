// One-shot functional check for migration 034 (profiles is_dev INSERT guard).
// Signs up a throwaway user, tries to INSERT its profile with is_dev=true, and
// reports what actually landed. Run: node scripts/verify_is_dev_guard.mjs
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
);

const supabase = createClient(env.EXPO_PUBLIC_SUPABASE_URL, env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

const email = `verify034+${Date.now()}@example.com`;
const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
  email,
  password: `Vt-${crypto.randomUUID()}`,
});
if (signUpError || !signUpData.session) {
  console.log('FAIL: could not create test session:', signUpError?.message ?? 'no session');
  process.exit(1);
}
const userId = signUpData.user.id;

const { error: insertError } = await supabase
  .from('profiles')
  .insert({ id: userId, is_dev: true });

if (insertError) {
  console.log('INSERT rejected outright (also acceptable):', insertError.message);
} else {
  const { data: profile, error: selectError } = await supabase
    .from('profiles')
    .select('is_dev')
    .eq('id', userId)
    .maybeSingle();
  if (selectError || !profile) {
    console.log('FAIL: could not read back profile:', selectError?.message ?? 'missing row');
    process.exit(1);
  }
  console.log(profile.is_dev === false ? 'PASS: is_dev forced to false by trigger' : 'FAIL: is_dev is ' + profile.is_dev);
  process.exit(profile.is_dev === false ? 0 : 1);
}
