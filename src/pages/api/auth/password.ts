/**
 * POST /api/auth/password — email + password sign-in, sign-up and reset
 * (Login step 1). Three actions on one endpoint, chosen over three small
 * files because the body-parsing/action-dispatch path is identical and this
 * keeps the uniformity rule that only SOME of the three actions need
 * documented in one place rather than copied three times.
 *
 *  - `signin` — `signInWithPassword`. Unlike the magic-link endpoint, the
 *    response HAS to differ between success and failure (the caller needs to
 *    know whether it worked), so this action is not T3-uniform. What it must
 *    never do is distinguish WHY a failure happened: a wrong password and an
 *    unknown address answer the identical generic "invalid credentials" —
 *    same doctrine as `signin.ts`'s header, errors are logged server-side
 *    and never surfaced.
 *  - `signup` — `signUp`, uniform like the magic-link endpoint: the same
 *    `{ ok: true, signedIn }` shape whether or not the address already has
 *    an account. This relies on Supabase's own signup-uniformity guarantee
 *    (an existing CONFIRMED address gets an obfuscated success, no error)
 *    and on every error being swallowed rather than surfaced — the same
 *    "log it, never return it" rule `signin.ts` follows. `signedIn: true`
 *    fires only when Supabase hands back a session immediately, which is a
 *    PROJECT-WIDE setting (email confirmation disabled), never a
 *    per-address signal, so it cannot become an oracle either.
 *
 *    🔴 `consent` (REQUIRED, `signup` only) — Ley N° 29733 age/legal consent
 *    checkbox. Rejected with a plain `badRequest()` unless it is literally
 *    `true`, before Supabase is ever called — the client's disabled-submit
 *    button (`PasswordAuthForm`) is UI only, never trusted. Recorded via
 *    `@lib/ageConsent#recordAgeConsent` ONLY once `signedIn` is actually
 *    true for THIS request (see `handleSignUp`'s own comment on why that,
 *    not `!error`, is the correct branch — the uniformity guarantee above is
 *    exactly what makes "no error" insufficient on its own).
 *  - `reset` — `resetPasswordForEmail`, uniform for the same T3 reason as
 *    `signin.ts`: the caller must not learn whether an address has an
 *    account by asking it to reset the password on one.
 *
 * Every response is private/no-store (T7): all three actions mint or rotate
 * session cookies, `signin` and `signup` on success, `reset` because it
 * still exercises the session client.
 *
 * 🔴 `captchaToken` (OPTIONAL) — Cloudflare Turnstile. `normalizeCaptchaToken`
 * (`@lib/turnstile`) reduces it to a usable string or `undefined` before it
 * ever reaches Supabase; `undefined` means "call Supabase exactly as before
 * this field existed" for every action, which is what keeps the endpoint
 * inert while `PUBLIC_TURNSTILE_SITE_KEY` is unset (no caller can send a
 * token for a widget that was never rendered). When Supabase's CAPTCHA
 * protection is on and rejects the token, `isCaptchaError` maps that one
 * failure to `{ ok: false, error: 'captcha_failed' }` on all three actions —
 * including `signup` and `reset`, which otherwise swallow every Supabase
 * error into the same uniform success body. This is safe for T3: a captcha
 * failure depends only on the submitted token, never on whether `email` has
 * an account, so it is identical for a known and an unknown address and
 * cannot become a new enumeration oracle.
 */
import type { APIRoute } from 'astro';
import { recordAgeConsent } from '@lib/ageConsent';
import { safeNextPath } from '@lib/authRedirect';
import { looksLikeEmail, isValidPassword } from '@lib/authValidation';
import { markPrivate } from '@lib/httpCache';
import { DEFAULT_LANG, isValidLang, type Lang } from '@lib/i18n';
import {
  createSessionClient,
  flushSessionHeaders,
  type SessionClient,
} from '@lib/supabaseSession';
import { isCaptchaError, normalizeCaptchaToken } from '@lib/turnstile';

interface PasswordBody {
  action?: unknown;
  email?: unknown;
  password?: unknown;
  lang?: unknown;
  next?: unknown;
  captchaToken?: unknown;
  /** Age/legal consent checkbox (Ley N° 29733). Required for `signup` only. */
  consent?: unknown;
}

function json(body: unknown, status: number, session: SessionClient): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
  });
  flushSessionHeaders(headers, session);
  markPrivate(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

function badRequest(): Response {
  const headers = new Headers();
  markPrivate(headers);
  return new Response(null, { status: 400, statusText: 'Bad Request', headers });
}

/** The one response every action maps a Supabase captcha rejection to. */
function captchaFailed(session: SessionClient): Response {
  return json({ ok: false, error: 'captcha_failed' }, 400, session);
}

/** Build the confirm-route URL every action here redirects/redeems through. */
function confirmUrl(request: Request, next: string): string {
  const url = new URL('/api/auth/confirm', request.url);
  url.searchParams.set('next', next);
  return url.toString();
}

function newSession(request: Request): SessionClient {
  return createSessionClient({
    request,
    isProd: import.meta.env?.PROD === true,
  });
}

async function handleSignIn(
  request: Request,
  email: string,
  password: string,
  captchaToken: string | undefined,
): Promise<Response> {
  const session = newSession(request);

  try {
    const { data, error } = await session.client.auth.signInWithPassword({
      email,
      password,
      ...(captchaToken ? { options: { captchaToken } } : {}),
    });
    if (error || !data.session) {
      if (error) {
        console.error('[auth/password] signInWithPassword failed:', error.message);
        if (isCaptchaError(error)) {
          return captchaFailed(session);
        }
      }
      return json({ ok: false, error: 'invalid_credentials' }, 401, session);
    }
  } catch (err) {
    // An unreachable Supabase throws. The caller gets the same generic
    // failure a wrong password would — a 500 here would tell an attacker
    // this address is different from one that merely typed the wrong
    // password, which is exactly the distinction that must never surface.
    console.error('[auth/password] signInWithPassword threw:', err);
    return json({ ok: false, error: 'invalid_credentials' }, 401, session);
  }

  return json({ ok: true }, 200, session);
}

async function handleSignUp(
  request: Request,
  email: string,
  password: string,
  lang: Lang,
  rawNext: unknown,
  captchaToken: string | undefined,
): Promise<Response> {
  const next = safeNextPath(typeof rawNext === 'string' ? rawNext : null);
  const session = newSession(request);
  let signedIn = false;

  try {
    const { data, error } = await session.client.auth.signUp({
      email,
      password,
      options: {
        // Read back server-side like the magic-link signup path (design §9).
        data: { lang },
        emailRedirectTo: confirmUrl(request, next),
        ...(captchaToken ? { captchaToken } : {}),
      },
    });
    if (error) {
      // Logged, never returned — this is what keeps an existing-address
      // signup (Supabase may answer "User already registered" once
      // confirmations are disabled project-wide) indistinguishable from a
      // brand new one at this endpoint's boundary. The ONE exception is a
      // captcha rejection (see the file header): it depends only on the
      // token, never on the address, so surfacing it cannot reopen that.
      console.error('[auth/password] signUp failed:', error.message);
      if (isCaptchaError(error)) {
        return captchaFailed(session);
      }
    } else if (data.session) {
      signedIn = true;
      // Record consent for the account THIS request just actually created —
      // confirmed by the presence of a live session, not merely the absence
      // of an error. Supabase's own signup-uniformity guarantee (file
      // header) means a `signUp()` call for an ALREADY-registered, confirmed
      // address can also return no error and no session; branching on
      // `data.session` here, not on `!error`, is what keeps this from ever
      // touching an existing, unrelated account's consent record.
      if (data.user) {
        await recordAgeConsent(data.user.id, data.user.app_metadata);
      }
    }
  } catch (err) {
    console.error('[auth/password] signUp threw:', err);
  }

  return json({ ok: true, signedIn }, 200, session);
}

async function handleReset(
  request: Request,
  email: string,
  lang: Lang,
  captchaToken: string | undefined,
): Promise<Response> {
  const session = newSession(request);
  // The one legitimate exception to `safeNextPath`'s default auth-page block
  // (see its own header): the reset flow's whole point is to land back on
  // `/auth/nueva-clave` after redemption.
  const next = safeNextPath(`/${lang}/auth/nueva-clave`, { allowAuthPages: true });

  try {
    const { error } = await session.client.auth.resetPasswordForEmail(email, {
      redirectTo: confirmUrl(request, next),
      ...(captchaToken ? { captchaToken } : {}),
    });
    if (error) {
      console.error('[auth/password] resetPasswordForEmail failed:', error.message);
      // Stays uniform ACROSS EMAILS (see the file header): both a known and
      // an unknown address get this same captcha_failed body for the same
      // bad token, and both still get the same `{ ok: true }` for a good
      // one. Only Supabase's own `error` (e.g. a nonexistent address, which
      // it already answers as if it succeeded) keeps falling through below.
      if (isCaptchaError(error)) {
        return captchaFailed(session);
      }
    }
  } catch (err) {
    console.error('[auth/password] resetPasswordForEmail threw:', err);
  }

  return json({ ok: true }, 200, session);
}

export const POST: APIRoute = async ({ request }) => {
  let body: PasswordBody;
  try {
    body = (await request.json()) as PasswordBody;
  } catch {
    return badRequest();
  }

  if (!looksLikeEmail(body?.email)) {
    return badRequest();
  }
  const email = body.email;
  const lang = isValidLang(body?.lang) ? body.lang : DEFAULT_LANG;
  const captchaToken = normalizeCaptchaToken(body?.captchaToken);

  switch (body?.action) {
    case 'signin': {
      if (typeof body.password !== 'string' || body.password === '') {
        return badRequest();
      }
      return handleSignIn(request, email, body.password, captchaToken);
    }
    case 'signup': {
      if (!isValidPassword(body.password)) {
        return badRequest();
      }
      // Age/legal consent (Ley N° 29733): REQUIRED, server-enforced — never
      // trust the client's own disabled-submit-button UI. Checked before any
      // Supabase call, same tier as the email/password shape checks above.
      if (body.consent !== true) {
        return badRequest();
      }
      return handleSignUp(request, email, body.password, lang, body.next, captchaToken);
    }
    case 'reset':
      return handleReset(request, email, lang, captchaToken);
    default:
      return badRequest();
  }
};
