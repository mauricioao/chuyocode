/**
 * POST /api/cuenta/contrasena — change the signed-in caller's own password
 * (Perfil page, T3). Email/password accounts ONLY — a Google-only account
 * has no password to change, checked both here (`user.identities`) and by
 * the page's own UI, which shows a short note instead of this form for such
 * an account (never trust the client alone for that gate).
 *
 * VERIFIES THE CURRENT PASSWORD by signing in with it
 * (`signInWithPassword`) BEFORE updating — rather than Supabase's own
 * `current_password` parameter on `updateUser`, whose check is gated behind
 * a project-level GoTrue setting
 * (`GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD`) this codebase
 * has no visibility into from here; a plain sign-in always checks the
 * password against the stored hash, regardless of that setting. This also
 * means the session is freshly re-established by the time `updateUser` runs
 * below, which is exactly what satisfies Supabase's OWN "recently signed
 * in" requirement — so `reauthentication_needed` (see the task below) should
 * never actually fire in this flow; it is still handled defensively, never
 * surfaced as a raw error.
 *
 * ```
 * 1. locals.user null                               -> 401 (requireUser())
 * 2. body missing/malformed, or either password       -> 400
 *    field fails validation (currentPassword non-         { ok:false, error:'bad_request' }
 *    empty string, newPassword passes isValidPassword)
 * 3. no email/password identity on this account      -> 400
 *                                                        { ok:false, error:'no_password_identity' }
 * 4. signInWithPassword(currentPassword) fails:
 *    - Supabase's captcha rejection (isCaptchaError)  -> 400
 *                                                        { ok:false, error:'captcha_failed' }
 *    - anything else                                 -> 401
 *                                                        { ok:false, error:'invalid_current_password' }
 * 5. updateUser({password}) fails, mapped by
 *    Supabase's own error code:
 *    - reauthentication_needed  -> 400 { ok:false, error:'reauthentication_needed' }
 *    - same_password            -> 400 { ok:false, error:'same_password' }
 *    - weak_password            -> 400 { ok:false, error:'weak_password' }
 *    - anything else            -> 500 { ok:false, error:'update_failed' }
 * 6. success                                         -> 200 { ok:true }
 * ```
 *
 * Accepts ONLY `application/json`, checked on the `content-type` header
 * before parsing (a cross-site form can post `text/plain` with a JSON-shaped
 * body, which `request.json()` parses) — same guard as `nombre.ts` and
 * `src/pages/api/auth/consentimiento.ts`.
 *
 * 🔴 `captchaToken` (OPTIONAL) — Cloudflare Turnstile, same posture as
 * `src/pages/api/auth/password.ts`. `normalizeCaptchaToken` (`@lib/turnstile`)
 * reduces it to a usable string or `undefined` before it ever reaches the
 * CURRENT-password `signInWithPassword` check below (`updateUser` is never
 * captcha-gated by Supabase, so it is never forwarded there); `undefined`
 * keeps this endpoint inert while `PUBLIC_TURNSTILE_SITE_KEY` is unset, same
 * as before this field existed. When Supabase's CAPTCHA protection is on and
 * rejects the token, `isCaptchaError` maps that failure to a dedicated
 * `captcha_failed` code — distinct from `invalid_current_password`, so the
 * form can tell a visitor "we could not verify you're human" instead of
 * "your current password is wrong".
 *
 * Every response is private/no-store (T7); never echoes either password
 * back, and only ever logs `error.code`/`error.message`, never the request
 * body.
 */
import type { APIRoute } from 'astro';
import { jsonResponse, requireUser } from '@lib/apiResponse';
import { isValidPassword } from '@lib/authValidation';
import { createSessionClient, flushSessionHeaders, type SessionClient } from '@lib/supabaseSession';
import { isCaptchaError, normalizeCaptchaToken } from '@lib/turnstile';

/** `jsonResponse` (private/no-store JSON, `@lib/apiResponse`) plus an optional session-cookie flush, once a session client exists. */
function respond(body: unknown, status: number, session?: SessionClient): Response {
  if (!session) return jsonResponse(body, status);
  const headers = new Headers();
  flushSessionHeaders(headers, session);
  return jsonResponse(body, status, { headers });
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return respond({ ok: false, error: 'bad_request' }, 400);
  }

  let body: { currentPassword?: unknown; newPassword?: unknown; captchaToken?: unknown };
  try {
    body = (await request.json()) as {
      currentPassword?: unknown;
      newPassword?: unknown;
      captchaToken?: unknown;
    };
  } catch {
    return respond({ ok: false, error: 'bad_request' }, 400);
  }

  const { currentPassword, newPassword } = body ?? {};
  if (typeof currentPassword !== 'string' || currentPassword === '' || !isValidPassword(newPassword)) {
    return respond({ ok: false, error: 'bad_request' }, 400);
  }
  const captchaToken = normalizeCaptchaToken(body?.captchaToken);

  const hasPasswordIdentity = (user.identities ?? []).some((identity) => identity.provider === 'email');
  if (!hasPasswordIdentity) {
    return respond({ ok: false, error: 'no_password_identity' }, 400);
  }

  const session = createSessionClient({
    request,
    isProd: import.meta.env?.PROD === true,
  });

  try {
    const { error: verifyError } = await session.client.auth.signInWithPassword({
      email: user.email ?? '',
      password: currentPassword,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
    if (verifyError) {
      console.error('[cuenta/contrasena] current-password sign-in failed:', verifyError.code ?? verifyError.message);
      if (isCaptchaError(verifyError)) {
        return respond({ ok: false, error: 'captcha_failed' }, 400, session);
      }
      return respond({ ok: false, error: 'invalid_current_password' }, 401, session);
    }
  } catch (err) {
    console.error('[cuenta/contrasena] current-password sign-in threw:', err);
    return respond({ ok: false, error: 'invalid_current_password' }, 401, session);
  }

  try {
    const { error } = await session.client.auth.updateUser({ password: newPassword });
    if (error) {
      console.error('[cuenta/contrasena] updateUser failed:', error.code ?? error.message);
      if (error.code === 'reauthentication_needed') {
        return respond({ ok: false, error: 'reauthentication_needed' }, 400, session);
      }
      if (error.code === 'same_password') {
        return respond({ ok: false, error: 'same_password' }, 400, session);
      }
      if (error.code === 'weak_password') {
        return respond({ ok: false, error: 'weak_password' }, 400, session);
      }
      return respond({ ok: false, error: 'update_failed' }, 500, session);
    }
  } catch (err) {
    // An unreachable Supabase throws; degrade to the same failure shape
    // rather than an uncaught rejection with no `Set-Cookie` at all.
    console.error('[cuenta/contrasena] updateUser threw:', err);
    return respond({ ok: false, error: 'update_failed' }, 500, session);
  }

  return respond({ ok: true }, 200, session);
};
