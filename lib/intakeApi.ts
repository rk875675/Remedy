// Persist the clinical intake after signup. A failure must not block assignment:
// the server then builds the program with engine v1.

import type { Intake } from './intake';
import { supabase } from './supabase';

export async function persistIntake(userId: string, intake: Intake): Promise<boolean> {
  try {
    const { error } = await supabase.from('user_intake').upsert(
      { user_id: userId, version: 1, answers: intake },
      { onConflict: 'user_id' },
    );
    return !error;
  } catch {
    return false;
  }
}
