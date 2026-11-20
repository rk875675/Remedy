import { supabase } from './supabase';
import { petStateSchema, type PetState } from './pet';
import { rememberPetName } from './petNameCache';
import { refreshScheduledRemindersForPetName } from './notifications';

// Bumped when a name is saved, so a fetch that started earlier cannot write
// the previous name back over the one the user just chose.
let nameRevision = 0;

/** Null on any failure: the pet must never break the screen it sits on. */
export async function fetchPetState(): Promise<PetState | null> {
  const seen = nameRevision;
  try {
    const { data, error } = await supabase.rpc('get_pet_state');
    if (error || data == null) return null;
    const parsed = petStateSchema.safeParse(data);
    if (!parsed.success) return null;
    if (seen === nameRevision) void rememberPetName(parsed.data.name);
    return parsed.data;
  } catch {
    return null;
  }
}

export async function setPetName(
  name: string,
): Promise<{ ok: true; state: PetState } | { ok: false; reason: 'invalid' | 'failed' }> {
  try {
    const { data, error } = await supabase.rpc('set_pet_name', { p_name: name });
    if (error) {
      return { ok: false, reason: error.message.includes('invalid_pet_name') ? 'invalid' : 'failed' };
    }
    const parsed = petStateSchema.safeParse(data);
    if (parsed.success) {
      nameRevision += 1;
      // Memory updates before the first await, so the refresh below reads the new name.
      void rememberPetName(parsed.data.name);
      refreshScheduledRemindersForPetName();
    }
    return parsed.success ? { ok: true, state: parsed.data } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
