/**
 * Client-side password validation and user-facing auth error copy.
 *
 * Password rules must match the server-side Supabase setting:
 *   lower_upper_letters_digits → /[a-z]/ && /[A-Z]/ && /[0-9]/
 *   minimum_password_length    → 8
 *
 * Pitfall 14: Supabase emits raw complexity / API messages that leak implementation
 * details. Every screen must run backend errors through friendlyAuthError() — never
 * render err.message as-is.
 */

export function passwordMeetsComplexity(pw: string): boolean {
  return /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

export function passwordRequirementHint(): string {
  return 'At least 8 characters with uppercase, lowercase, and a number.';
}

function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return '';
}

function extractCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return '';
}

/**
 * Maps any Supabase / network / validation error to a short, safe sentence.
 * Never returns raw backend text.
 */
export function friendlyAuthError(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  const code = extractCode(error);
  const raw = extractMessage(error);

  switch (code) {
    case 'invalid_credentials':
      return 'Email or password is incorrect.';
    case 'email_not_confirmed':
      return 'Confirm your email first — tap the link we sent you, then sign in.';
    case 'user_already_exists':
    case 'email_exists':
      return 'An account with this email already exists. Try signing in instead.';
    case 'weak_password':
      return 'Password must include uppercase, lowercase, and a number.';
    case 'validation_failed':
      return 'Please check your email and password, then try again.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Wait a minute, then try again.';
    case 'otp_expired':
    case 'otp_disabled':
      return 'This link has expired. Request a new one and try again.';
    case 'same_password':
      return 'Choose a password you haven’t used before.';
  }

  if (
    /contain at least one character of each/i.test(raw) ||
    /password.*weak/i.test(raw) ||
    /abcdefghijklmnopqrstuvwxyz/i.test(raw) ||
    /Password should be/i.test(raw)
  ) {
    return 'Password must include uppercase, lowercase, and a number.';
  }
  if (/at least \d+ character/i.test(raw) || /password.*too short/i.test(raw)) {
    return 'Password must be at least 8 characters.';
  }
  if (/already registered/i.test(raw) || /user already exists/i.test(raw) || /email.*exists/i.test(raw)) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (/invalid login credentials/i.test(raw) || /invalid.*(email|password)/i.test(raw)) {
    return 'Email or password is incorrect.';
  }
  if (/email not confirmed/i.test(raw)) {
    return 'Confirm your email first — tap the link we sent you, then sign in.';
  }
  if (/invalid.*email|unable to validate email/i.test(raw)) {
    return 'Please enter a valid email address.';
  }
  if (/rate limit|only request this after|too many/i.test(raw)) {
    return 'Too many attempts. Wait a minute, then try again.';
  }
  if (/expired|token.*invalid|otp/i.test(raw)) {
    return 'This link has expired. Request a new one and try again.';
  }
  if (/network|fetch|failed to fetch|timed? ?out/i.test(raw)) {
    return 'Check your connection and try again.';
  }

  return fallback;
}

/** @deprecated Prefer friendlyAuthError — kept so existing call sites stay typed. */
export function friendlyPasswordError(raw: string): string {
  return friendlyAuthError(raw, 'Password must include uppercase, lowercase, and a number.');
}
