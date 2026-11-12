import { supabase } from './supabase';
import { petStateSchema, type PetState } from './pet';

/** Null on any failure: the pet must never break the screen it sits on. */
export async function fetchPetState(): Promise<PetState | null> {
  try {
    const { data, error } = await supabase.rpc('get_pet_state');
    if (error || data == null) return null;
    const parsed = petStateSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
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
    return parsed.success ? { ok: true, state: parsed.data } : { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
