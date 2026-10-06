/**
 * POST /api/cuenta/nombre — update the signed-in caller's own display name
 * (Perfil page, T3). Stores the normalized value under
 * `DISPLAY_NAME_METADATA_KEY` (`src/lib/profile.ts`'s own dedicated key —
 * never Google's `full_name`/`name`, so a later Google re-sign-in can never
 * silently overwrite a name the visitor chose here; see that module's
 * header for the exact resolution order).
 *
 * ```
 * 1. locals.user null                              -> 401 (requireUser())
 * 2. body missing/malformed, or `name` fails         -> 400
 *    normalizeDisplayName (trim, collapse               { ok:false, error:'invalid_name' }
 *    whitespace, 1-60 chars, no control chars)
 * 3. updateUser({data}) fails                       -> 500
 *                                                       { ok:false, error:'update_failed' }
 * 4. success                                        -> 200 { ok:true, name:<normalized> }
 * ```
 *
 * Accepts ONLY `application/json`, checked on the `content-type` header
 * before parsing: a cross-site form can post `text/plain` with a JSON-shaped
 * body, which `request.json()` parses without complaint. Anything else maps
 * to the same 400 `invalid_name` a malformed JSON body gets (same guard as
 * `src/pages/api/auth/consentimiento.ts`).
 *
 * Every response is private/no-store (T7) — it is read off `locals.user`
 * and `updateUser` may rotate the session.
 */
import type { APIRoute } from 'astro';
import { jsonResponse, requireUser } from '@lib/apiResponse';
import { DISPLAY_NAME_METADATA_KEY, normalizeDisplayName } from '@lib/displayName';
import { createSessionClient, flushSessionHeaders, type SessionClient } from '@lib/supabaseSession';

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
    return respond({ ok: false, error: 'invalid_name' }, 400);
  }

  let body: { name?: unknown };
  try {
    body = (await request.json()) as { name?: unknown };
  } catch {
    return respond({ ok: false, error: 'invalid_name' }, 400);
  }

  const name = normalizeDisplayName(body?.name);
  if (name === null) {
    return respond({ ok: false, error: 'invalid_name' }, 400);
  }

  const session = createSessionClient({
    request,
    isProd: import.meta.env?.PROD === true,
  });

  try {
    const { error } = await session.client.auth.updateUser({
      data: { [DISPLAY_NAME_METADATA_KEY]: name },
    });
    if (error) {
      console.error('[cuenta/nombre] updateUser failed:', error.message);
      return respond({ ok: false, error: 'update_failed' }, 500, session);
    }
  } catch (err) {
    // An unreachable Supabase throws; degrade to the same failure shape
    // rather than an uncaught rejection with no `Set-Cookie` at all.
    console.error('[cuenta/nombre] updateUser threw:', err);
    return respond({ ok: false, error: 'update_failed' }, 500, session);
  }

  return respond({ ok: true, name }, 200, session);
};
