/**
 * Cloudflare Turnstile support shared by the email/password auth routes and
 * their islands (`src/pages/api/auth/password.ts`, `signin.ts`,
 * `src/components/islands/PasswordAuthForm.tsx`, `SignInForm.tsx`,
 * `TurnstileWidget.tsx`).
 *
 * 🔴 `PUBLIC_TURNSTILE_SITE_KEY` IS A PUBLIC, BUILD-TIME VARIABLE. Unlike
 * `src/lib/env.ts`'s server-only keys, Astro/Vite inline any `PUBLIC_`-
 * prefixed variable into the CLIENT bundle at BUILD time — it is not read
 * from `process.env` at request time the way Netlify's runtime env vars are.
 * It MUST be set in Netlify's build environment (not only "available at
 * runtime") before a deploy, or every client bundle from that deploy ships
 * with it blank, permanently, until the next build.
 *
 * {@link getTurnstileSiteKey} returning `null` is this feature's OFF switch:
 * every call site below treats `null` as "render nothing, load nothing, send
 * nothing" — see `TurnstileWidget.tsx` and the two island forms. That keeps
 * the feature inert until configured, by construction, rather than by a
 * separate flag.
 *
 * 🔴 ENABLE SUPABASE'S CAPTCHA PROTECTION ONLY AFTER A DEPLOY WITH THIS KEY
 * LIVE IN PRODUCTION. The dashboard toggle is global and immediate: the
 * instant it is on, Supabase starts requiring a valid `captchaToken` on
 * `signUp`/`signInWithPassword`/`resetPasswordForEmail`/`signInWithOtp` for
 * EVERY caller, including anyone still served an older bundle with no widget
 * at all — their forms would start failing with `captcha_failed` for a
 * token they have no way to produce. Flip it only once the widget is
 * confirmed live.
 */

/** Longest `captchaToken` accepted from a request body; see {@link normalizeCaptchaToken}. */
export const MAX_CAPTCHA_TOKEN_LENGTH = 2048;

/**
 * The Turnstile site key to render the widget with, or `null` when unset.
 *
 * Blank/whitespace-only counts as unset, same posture as
 * `src/lib/env.ts`'s `isUsable`. This is the ONE switch every call site
 * checks before rendering a widget, loading Turnstile's script, or sending a
 * token — see the file header.
 */
export function getTurnstileSiteKey(): string | null {
  const raw = import.meta.env.PUBLIC_TURNSTILE_SITE_KEY;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Normalize a request body's `captchaToken` field to either a usable string
 * or `undefined` — never anything else, so a caller can spread it straight
 * into a Supabase `options` bag (`...(token ? { captchaToken: token } : {})`)
 * and omit the field entirely when there is nothing usable, exactly like a
 * request with no key configured.
 *
 * Anything that is not a non-empty, length-bounded string — missing, wrong
 * type, blank after trimming, or longer than {@link MAX_CAPTCHA_TOKEN_LENGTH}
 * (real Turnstile tokens are far shorter) — is treated as absent rather than
 * forwarded to Supabase or rejected with a 400: a visitor with Turnstile
 * disabled, or whose widget has not responded yet, must still be able to
 * submit exactly as before this feature existed.
 */
export function normalizeCaptchaToken(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > MAX_CAPTCHA_TOKEN_LENGTH) {
    return undefined;
  }
  return trimmed;
}

/** The structural slice of Supabase's `AuthError` {@link isCaptchaError} reads. */
export interface CaptchaCheckableError {
  code?: string | null;
  message?: string | null;
}

/**
 * Is `error` Supabase's captcha-rejection error (a missing or invalid
 * `captchaToken` once CAPTCHA protection is enabled in the dashboard)?
 *
 * Checks `error.code === 'captcha_failed'` first — the documented, stable
 * signal (`@supabase/auth-js`'s `ErrorCode` union). Falls back to a
 * case-insensitive match on "captcha" in `error.message` for older SDK
 * responses that carry no `code`, so the mapping degrades gracefully rather
 * than silently stopping if Supabase ever omits it.
 *
 * Safe to use on every auth route regardless of enumeration sensitivity: a
 * captcha failure depends only on the submitted token, never on whether the
 * request's email has an account, so branching on it cannot reopen an
 * enumeration oracle (see `password.ts`/`signin.ts` for where this matters).
 */
export function isCaptchaError(
  error: CaptchaCheckableError | null | undefined,
): boolean {
  if (!error) {
    return false;
  }
  if (error.code === 'captcha_failed') {
    return true;
  }
  return typeof error.message === 'string' && /captcha/i.test(error.message);
}
