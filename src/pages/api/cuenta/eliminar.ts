/**
 * POST /api/cuenta/eliminar — delete the signed-in caller's account (owner
 * decision, 2026-10-04: "a user can delete their account"). Their
 * published/visible activities and curated exercises stay available, now
 * owned by ChuyoCode; their drafts, hearts, views and the account itself
 * are gone.
 *
 * ```
 * 1. locals.user null                               -> 401 (requireUser())
 * 2. body missing/malformed, or `confirm` is not     -> 400
 *    exactly "ELIMINAR" or "DELETE"                     { ok:false, error:'confirmation_required' }
 * 3. deleteAccount(user.id) fails                   -> 500
 *    (`src/lib/accountDeletion.ts`'s own step)          { ok:false, error: <its own error code> }
 * 4. success                                        -> 200 { ok: true }
 * ```
 *
 * Step 3's three possible error codes (`purge_failed`, `storage_cleanup_
 * failed`, `delete_user_failed`) are `deleteAccount`'s own — see that
 * module's header for exactly what ran and what did not before each one.
 * EVERY ONE OF THEM LEAVES THE ACCOUNT USABLE: nothing below reaches
 * `auth.admin.deleteUser` unless the steps before it already succeeded, so
 * a visitor who sees any of these three codes is still signed in with
 * their session untouched and may simply try again (the whole operation is
 * safe to retry — see `accountDeletion.ts`'s own ordering note).
 *
 * ONLY ON FULL SUCCESS does this route touch cookies at all — mirroring
 * `signout.ts` exactly for that one tail: a request-scoped session client
 * signs the caller out (best-effort; its own failure is logged and never
 * blocks the response, same posture `signout.ts` already documents — by
 * this point the `auth.users` row is already gone, so Supabase may well
 * have nothing left to revoke) and `flushSessionHeaders` puts the clearing
 * `Set-Cookie` directives on the response this route returns.
 *
 * Every response is private/no-store — it is read off `locals.user` and
 * mutates session state on success.
 */
import type { APIRoute } from 'astro';
import { jsonResponse, requireUser } from '@lib/apiResponse';
import { markPrivate } from '@lib/httpCache';
import { deleteAccount } from '@lib/accountDeletion';
import { createSessionClient, flushSessionHeaders } from '@lib/supabaseSession';

/**
 * The only two accepted confirmation words — "ELIMINAR" (es) or "DELETE"
 * (en), per the owner's own spec. Either is accepted regardless of which
 * locale the caller's UI happened to show: the server has no reliable
 * signal of the request's language on an unprefixed `/api/*` route
 * (`src/middleware.ts` never sets `locals.lang` there), and the deliberate
 * act of typing the EXACT word the dialog displayed is what this check
 * exists to prove — not which language that word was in.
 */
const CONFIRM_WORDS = new Set(['ELIMINAR', 'DELETE']);

function hasValidConfirmation(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const { confirm } = value as { confirm?: unknown };
  return typeof confirm === 'string' && CONFIRM_WORDS.has(confirm);
}

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) return requireUser();

  // `application/json` only: a cross-site form can post `text/plain` with a
  // JSON-shaped body, which `request.json()` parses. Astro's checkOrigin
  // already rejects cross-origin form posts; this is the second layer.
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return jsonResponse({ ok: false, error: 'confirmation_required' }, 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ ok: false, error: 'confirmation_required' }, 400);
  }
  if (!hasValidConfirmation(body)) {
    return jsonResponse({ ok: false, error: 'confirmation_required' }, 400);
  }

  const result = await deleteAccount(user.id);
  if (!result.ok) {
    // Nothing mutated the session: the account is exactly as it was.
    return jsonResponse({ ok: false, error: result.error }, 500);
  }

  // Reached only after the auth user itself is already gone — see file
  // header. Mirrors `signout.ts`: best-effort signOut, cookies ALWAYS
  // cleared on the response this route returns.
  const session = createSessionClient({
    request,
    isProd: import.meta.env?.PROD === true,
  });

  try {
    const { error } = await session.client.auth.signOut();
    if (error) {
      console.error('[cuenta/eliminar] signOut failed:', error.message);
    }
  } catch (err) {
    console.error('[cuenta/eliminar] signOut threw:', err);
  }

  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8' });
  flushSessionHeaders(headers, session);
  markPrivate(headers);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};
