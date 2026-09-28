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
 *  - `reset` — `resetPasswordForEmail`, uniform for the same T3 reason as
 *    `signin.ts`: the caller must not learn whether an address has an
 *    account by asking it to reset the password on one.
 *
 * Every response is private/no-store (T7): all three actions mint or rotate
 * session cookies, `signin` and `signup` on success, `reset` because it
 * still exercises the session client.
 */
import type { APIRoute } from 'astro';
import { safeNextPath } from '@lib/authRedirect';
import { looksLikeEmail, isValidPassword } from '@lib/authValidation';
import { markPrivate } from '@lib/httpCache';
import { DEFAULT_LANG, isValidLang, type Lang } from '@lib/i18n';
import {
  createSessionClient,
  flushSessionHeaders,
  type SessionClient,
} from '@lib/supabaseSession';

interface PasswordBody {
  action?: unknown;
  email?: unknown;
  password?: unknown;
  lang?: unknown;
  next?: unknown;
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
): Promise<Response> {
  const session = newSession(request);

  try {
    const { data, error } = await session.client.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.session) {
      if (error) {
        console.error('[auth/password] signInWithPassword failed:', error.message);
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
      },
    });
    if (error) {
      // Logged, never returned — this is what keeps an existing-address
      // signup (Supabase may answer "User already registered" once
      // confirmations are disabled project-wide) indistinguishable from a
      // brand new one at this endpoint's boundary.
      console.error('[auth/password] signUp failed:', error.message);
    } else if (data.session) {
      signedIn = true;
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
): Promise<Response> {
  const session = newSession(request);
  // The one legitimate exception to `safeNextPath`'s default auth-page block
  // (see its own header): the reset flow's whole point is to land back on
  // `/auth/nueva-clave` after redemption.
  const next = safeNextPath(`/${lang}/auth/nueva-clave`, { allowAuthPages: true });

  try {
    const { error } = await session.client.auth.resetPasswordForEmail(email, {
      redirectTo: confirmUrl(request, next),
    });
    if (error) {
      console.error('[auth/password] resetPasswordForEmail failed:', error.message);
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

  switch (body?.action) {
    case 'signin': {
      if (typeof body.password !== 'string' || body.password === '') {
        return badRequest();
      }
      return handleSignIn(request, email, body.password);
    }
    case 'signup': {
      if (!isValidPassword(body.password)) {
        return badRequest();
      }
      return handleSignUp(request, email, body.password, lang, body.next);
    }
    case 'reset':
      return handleReset(request, email, lang);
    default:
      return badRequest();
  }
};
