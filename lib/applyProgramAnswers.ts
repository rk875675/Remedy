import { supabase } from './supabase';
import { extractInvokeError } from './functionsError';
import { applyProgramAnswersResultSchema, assignPendingSkipSchema, assignResultSchema } from './schemas';
import type { OnboardingAnswersInput } from './schemas';

function friendlyApplyError(code: string): string {
  if (code === 'rate_limited') {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  return 'Could not save. Check your connection and try again.';
}

export type ApplyProgramAnswersResult = {
  saved: true;
  patched: Array<'equipment' | 'sessions_per_week_preference'>;
  pending_apply_week: number | null;
  apply_now: boolean;
  action: 'noop' | 'patched' | 'scheduled' | 'apply_now' | 'saved_only';
};

export async function saveProgramAnswers(
  answers: OnboardingAnswersInput,
): Promise<{ ok: true; data: ApplyProgramAnswersResult } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke('apply-program-answers', {
    body: { answers },
  });
  if (error) {
    const code = await extractInvokeError(
      data && typeof data === 'object' ? (data as { error?: string }) : null,
      error,
    );
    return { ok: false, error: friendlyApplyError(code) };
  }
  const parsed = applyProgramAnswersResultSchema.safeParse(data);
  if (!parsed.success) {
    const reason =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'invalid_response';
    return { ok: false, error: friendlyApplyError(reason) };
  }
  return { ok: true, data: parsed.data };
}

export async function flushPendingProgramApply(): Promise<'applied' | 'skipped' | 'failed'> {
  const { data, error } = await supabase.functions.invoke('assign-program', {
    body: { apply_pending: true },
  });
  if (error) return 'failed';
  if (assignPendingSkipSchema.safeParse(data).success) return 'skipped';
  if (assignResultSchema.safeParse(data).success) return 'applied';
  return 'failed';
}

function patchedNowCopy(result: ApplyProgramAnswersResult): string | null {
  if (result.patched.length === 0) return null;
  if (result.patched.includes('equipment') && result.patched.includes('sessions_per_week_preference')) {
    return 'Remaining sessions now match your equipment and weekly cadence.';
  }
  if (result.patched.includes('equipment')) {
    return 'Remaining sessions now match your equipment.';
  }
  return 'Remaining weeks now use your new session count.';
}

export function applyStatusCopy(result: ApplyProgramAnswersResult): string {
  if (result.action === 'apply_now') {
    return 'Answers saved. Updating the sessions you have left this week.';
  }
  const now = patchedNowCopy(result);
  if (result.action === 'scheduled' && result.pending_apply_week !== null) {
    if (now) {
      return `${now} Other changes update at the start of week ${result.pending_apply_week}.`;
    }
    return `Answers saved. Your plan updates at the start of week ${result.pending_apply_week}.`;
  }
  if (result.action === 'patched' && now) {
    return now;
  }
  if (result.action === 'saved_only') {
    return 'Answers saved. They will apply on your next program.';
  }
  return 'Answers saved.';
}
