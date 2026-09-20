// Typed event definition.
//
// Every analytics event in the app is declared with defineEvent(), which returns
// the only function permitted to fire it. That gives three things at once:
//   - a compile-time contract (required properties are required, enumerated
//     values are unions, extra properties are rejected),
//   - a runtime contract in development (Zod validates the payload and loud
//     warnings surface anything that would corrupt the taxonomy),
//   - a registry, so a duplicated event name is caught at module load rather
//     than discovered months later as two half-populated rows in PostHog.
//
// Product code never calls capture() directly — see docs/ANALYTICS.md §8.

import { z } from 'zod';

import { capture } from '../facade';
import type { AnalyticsProperties } from '../facade';

/** Every event name declared anywhere, guarding against duplicate declarations. */
const registry = new Set<string>();

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Past-tense names that don't happen to end in "ed". */
const PAST_TENSE_EXCEPTIONS = new Set([
  'signed_out',
  'onboarding_hint_shown',
  'home_nudge_shown',
  'home_empty_state_shown',
  'review_ask_shown',
]);

/**
 * Properties where a UUID value is a deliberate, sanctioned breakdown dimension.
 * Anything else carrying a UUID is almost certainly an accident that will blow up
 * cardinality, so it warns.
 */
const ID_PROPERTIES = new Set([
  'plan_session_id',
  'exercise_id',
  'plan_id',
  'original_transaction_id',
  'paywall_variant_id',
  'paywall_experiment_id',
]);

/** Beyond this, a string is almost certainly free text rather than an enum. */
const MAX_STRING_LENGTH = 200;

/** Metro only. console.error/warn open a LogBox overlay on device. */
function analyticsDevLog(message: string): void {
  if (__DEV__) console.log(message);
}

function registerName(name: string): void {
  if (!SNAKE_CASE.test(name)) {
    analyticsDevLog(`[analytics] event name "${name}" is not snake_case — see docs/ANALYTICS.md §2.`);
  }
  if (!name.endsWith('ed') && !PAST_TENSE_EXCEPTIONS.has(name)) {
    analyticsDevLog(`[analytics] event name "${name}" does not look past-tense — see docs/ANALYTICS.md §2.`);
  }
  if (registry.has(name)) {
    analyticsDevLog(`[analytics] event "${name}" is declared twice. Names must be unique across domain modules.`);
  }
  registry.add(name);
}

function validatePayload(name: string, schema: z.ZodTypeAny, payload: unknown): void {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    analyticsDevLog(`[analytics] INVALID PAYLOAD for "${name}" — ${issues}`);
  }

  if (payload === null || typeof payload !== 'object') return;

  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (!SNAKE_CASE.test(key)) {
      analyticsDevLog(`[analytics] "${name}" property "${key}" is not snake_case.`);
    }
    if (typeof value !== 'string') continue;

    if (value.length > MAX_STRING_LENGTH) {
      analyticsDevLog(
        `[analytics] "${name}" property "${key}" is ${value.length} chars — that is free text, not an enum. ` +
          'Send metadata (a count, a boolean, a duration) instead. See docs/ANALYTICS.md §6.1.',
      );
    } else if (UUID.test(value) && !ID_PROPERTIES.has(key)) {
      analyticsDevLog(
        `[analytics] "${name}" property "${key}" holds a UUID but is not a sanctioned id property. ` +
          'This will explode breakdown cardinality. See docs/ANALYTICS.md §2.',
      );
    }
  }
}

/**
 * Declares an event and returns the function that fires it.
 *
 * The schema is the contract in both directions: it types the call site, and in
 * development it validates the payload actually passed.
 */
export function defineEvent<Schema extends z.ZodTypeAny>(
  name: string,
  schema: Schema,
): (properties: z.infer<Schema>) => void {
  if (__DEV__) registerName(name);

  return (properties: z.infer<Schema>): void => {
    try {
      if (__DEV__) validatePayload(name, schema, properties);
      capture(name, properties as AnalyticsProperties);
    } catch {
      // Analytics must never interrupt the user.
    }
  };
}

/** Declares an event that carries no properties of its own. */
export function defineEventWithoutProperties(name: string): () => void {
  if (__DEV__) registerName(name);

  return (): void => {
    try {
      capture(name);
    } catch {
      // Analytics must never interrupt the user.
    }
  };
}
