// Pull the meaningful error out of a supabase.functions.invoke result. On a non-2xx the
// edge function's JSON body ({ success:false, error:'...' }) is NOT in `data` —
// supabase-js puts it on the thrown FunctionsHttpError's `.context` (a Response). Read it
// so the real reason (transaction_already_linked, transaction_not_found, etc.) is
// preserved instead of the opaque "Edge Function returned a non-2xx status code".
export async function extractInvokeError(
  data: { error?: string } | null,
  error: unknown,
): Promise<string> {
  if (data?.error) return data.error;
  if (error && typeof error === 'object') {
    const ctx = (error as { context?: unknown }).context;
    if (ctx && typeof (ctx as Response).json === 'function') {
      try {
        const body = (await (ctx as Response).json()) as { error?: string };
        if (body?.error) return body.error;
      } catch {
        // Body unreadable / already consumed — fall back to the error message below.
      }
    }
    const msg = (error as { message?: string }).message;
    if (msg) return msg;
  }
  return 'unknown_error';
}
