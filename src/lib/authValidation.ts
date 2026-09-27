/**
 * Shared, local, syntactic-only validation for the email + password routes
 * (`src/pages/api/auth/password.ts`, `src/pages/api/auth/nueva-clave.ts`).
 *
 * Deliberately permissive on the email shape, same posture as
 * `src/pages/api/auth/signin.ts`'s own local `looksLikeEmail`: the job is to
 * catch a form that submitted nothing useful, not to adjudicate RFC 5322.
 * Real validation of both values is Supabase's, and — for `email` — its
 * verdict must never be surfaced, because these values depend only on the
 * submitted string and never on whether an account exists, answering 400
 * here leaks nothing an account-dependent response would not.
 */

/** Is `value` a string that looks like an email address? */
export function looksLikeEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Minimum password length, enforced server-side (never trust the client alone). */
export const MIN_PASSWORD_LENGTH = 8;

/** Is `value` a string meeting the minimum password length? */
export function isValidPassword(value: unknown): value is string {
  return typeof value === 'string' && value.length >= MIN_PASSWORD_LENGTH;
}
