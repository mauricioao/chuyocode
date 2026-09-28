/**
 * POST /api/auth/nueva-clave — set a new password for the already signed-in
 * caller (second half of the password-reset flow; Login step 1).
 *
 * Reached only from `/[lang]/auth/nueva-clave.astro`, itself reachable only
 * once `/api/auth/confirm` has redeemed the reset link and left the caller
 * signed in. That IS the authorization for changing a password with no
 * "current password" re-entry: possession of the session the reset link
 * granted. `locals.user` — server-verified by middleware via `getUser()` —
 * is checked before anything else, same T3-adjacent posture as
 * `src/pages/api/ejercicios/[id]/guardar.ts`.
 *
 * POST-only, no separate CSRF token: `sameSite: 'lax'` session cookies are
 * this feature's whole CSRF defense, same posture as every other mutating
 * route in it.
 *
 * Every response is private/no-store (T7): it is read off `locals.user` and
 * may rotate the session.
 */
import type { APIRoute } from 'astro';
import { isValidPassword } from '@lib/authValidation';
import { markPrivate } from '@lib/httpCache';
import {
  createSessionClient,
  flushSessionHeaders,
  type SessionClient,
} from '@lib/supabaseSession';

function respond(
  body: unknown,
  status: number,
  session?: SessionClient,
): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
  });
  if (session) {
    flushSessionHeaders(headers, session);
  }
  markPrivate(headers);
  return new Response(JSON.stringify(body), { status, headers });
}

export const POST: APIRoute = async ({ request, locals }) => {
  // T3-adjacent: no session, no read, no write — checked before anything
  // else, same rule as `guardar.ts`.
  if (!locals.user) {
    return respond({ ok: false, error: 'unauthorized' }, 401);
  }

  let body: { password?: unknown };
  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    return respond({ ok: false, error: 'bad_request' }, 400);
  }

  if (!isValidPassword(body?.password)) {
    return respond({ ok: false, error: 'bad_request' }, 400);
  }

  const session = createSessionClient({
    request,
    isProd: import.meta.env?.PROD === true,
  });

  try {
    const { error } = await session.client.auth.updateUser({
      password: body.password,
    });
    if (error) {
      console.error('[auth/nueva-clave] updateUser failed:', error.message);
      return respond({ ok: false, error: 'update_failed' }, 500, session);
    }
  } catch (err) {
    // An unreachable Supabase throws; degrade to the same failure shape
    // rather than letting an uncaught rejection become an unhandled 500 with
    // no `Set-Cookie` at all.
    console.error('[auth/nueva-clave] updateUser threw:', err);
    return respond({ ok: false, error: 'update_failed' }, 500, session);
  }

  return respond({ ok: true }, 200, session);
};
