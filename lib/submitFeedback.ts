import Constants from 'expo-constants';
import { supabase } from './supabase';
import { extractInvokeError } from './functionsError';
import { submitFeedbackInputSchema, type SubmitFeedbackInput } from './schemas';

export type SubmitFeedbackError = 'rate_limited' | 'invalid_body' | 'duplicate' | 'request_failed';

export type SubmitFeedbackResult =
  | { ok: true }
  | { ok: false; error: SubmitFeedbackError };

function mapError(raw: string): SubmitFeedbackResult {
  if (raw === 'rate_limited') return { ok: false, error: 'rate_limited' };
  if (raw === 'duplicate') return { ok: false, error: 'duplicate' };
  if (raw === 'invalid_body' || raw === 'invalid_json' || raw === 'payload_too_large') {
    return { ok: false, error: 'invalid_body' };
  }
  return { ok: false, error: 'request_failed' };
}

export async function submitFeedback(
  input: Omit<SubmitFeedbackInput, 'app_version'>,
): Promise<SubmitFeedbackResult> {
  const appVersion = Constants.expoConfig?.version?.slice(0, 32);
  const parsed = submitFeedbackInputSchema.safeParse({
    ...input,
    app_version: appVersion,
  });
  if (!parsed.success) return { ok: false, error: 'invalid_body' };

  try {
    const { data, error } = await supabase.functions.invoke<{
      success?: boolean;
      error?: string;
    }>('submit-feedback', { body: parsed.data });

    if (data?.success) return { ok: true };
    return mapError(await extractInvokeError(data, error));
  } catch {
    return { ok: false, error: 'request_failed' };
  }
}
