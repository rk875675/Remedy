const TERMINAL_PURCHASE_ERRORS = new Set([
  'transaction_already_linked',
  'bundle_id_mismatch',
  'product_id_mismatch',
  'transaction_revoked',
  'transaction_expired',
  'jws_header_invalid',
  'missing_x5c_chain',
  'root_not_apple_g3',
  'cert_chain_invalid',
  'cert_chain_verify_failed',
  'jws_signature_invalid',
  'jws_payload_invalid',
  'invalid_receipt',
  'invalid_body',
]);

const TERMINAL_ASSIGNMENT_ERRORS = new Set([
  'invalid_request',
  'unauthorized',
  'not_entitled',
  'no_onboarding_answers',
  'missing_equipment',
  'plan_validation_failed',
  'rebuild_cooldown',
]);

export function shouldClearPendingPurchase(reason: string): boolean {
  return TERMINAL_PURCHASE_ERRORS.has(reason);
}

export function shouldRetryPurchaseVerification(reason: string): boolean {
  return !shouldClearPendingPurchase(reason);
}

export function shouldRetryProgramAssignment(reason: string): boolean {
  return !TERMINAL_ASSIGNMENT_ERRORS.has(reason);
}

export function getRetakeStartWeek(
  currentWeek: number | null | undefined,
  durationWeeks: number | null,
): number {
  const week = Math.max(1, currentWeek ?? 1);
  return durationWeeks !== null && week > durationWeeks ? 1 : week;
}

function abortError(): Error {
  const error = new Error('operation_aborted');
  error.name = 'AbortError';
  return error;
}

async function waitForRetry(delayMs: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw abortError();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, delayMs);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(abortError());
      },
      { once: true },
    );
  });
}

export async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  shouldRetry: (result: T) => boolean,
  signal: AbortSignal,
  delaysMs: readonly number[] = [500, 1500],
): Promise<T> {
  let result = await operation();
  for (const delayMs of delaysMs) {
    if (signal.aborted || !shouldRetry(result)) return result;
    await waitForRetry(delayMs, signal);
    result = await operation();
  }
  return result;
}
