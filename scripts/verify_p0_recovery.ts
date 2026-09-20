import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getRetakeStartWeek,
  retryWithBackoff,
  shouldClearPendingPurchase,
  shouldRetryProgramAssignment,
  shouldRetryPurchaseVerification,
} from '../lib/assignmentRecovery';

test('terminal and stale purchases are cleared', () => {
  for (const reason of [
    'transaction_already_linked',
    'transaction_expired',
    'transaction_revoked',
    'jws_signature_invalid',
  ]) {
    assert.equal(shouldClearPendingPurchase(reason), true, reason);
    assert.equal(shouldRetryPurchaseVerification(reason), false, reason);
  }
});

test('transient purchase failures remain recoverable', () => {
  for (const reason of [
    'apple_network_error',
    'apple_credentials_missing',
    'transaction_not_found',
    'rate_limited',
    'internal_error',
  ]) {
    assert.equal(shouldClearPendingPurchase(reason), false, reason);
    assert.equal(shouldRetryPurchaseVerification(reason), true, reason);
  }
});

test('retries are bounded and back off', async () => {
  const controller = new AbortController();
  let attempts = 0;
  const result = await retryWithBackoff(
    async () => {
      attempts += 1;
      return { reason: 'internal_error', attempt: attempts };
    },
    ({ reason }) => shouldRetryProgramAssignment(reason),
    controller.signal,
    [0, 0],
  );

  assert.equal(attempts, 3);
  assert.equal(result.attempt, 3);
});

test('watchdog abort prevents another retry attempt', async () => {
  const controller = new AbortController();
  let attempts = 0;

  await assert.rejects(
    retryWithBackoff(
      async () => {
        attempts += 1;
        return { reason: 'internal_error' };
      },
      ({ reason }) => {
        controller.abort();
        return shouldRetryProgramAssignment(reason);
      },
      controller.signal,
      [0, 0],
    ),
    { name: 'AbortError' },
  );
  assert.equal(attempts, 1);
});

test('retakes resume the current week or restart completed programs', () => {
  assert.equal(getRetakeStartWeek(3, 10), 3);
  assert.equal(getRetakeStartWeek(11, 10), 1);
  assert.equal(getRetakeStartWeek(null, null), 1);
});
