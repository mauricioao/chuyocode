/**
 * GET /api/auth/confirm — the magic link lands here. Step two of two.
 *
 * Verifies the emailed `token_hash` server-side with `verifyOtp`, which is what
 * makes the session cookies appear: the Supabase client writes them through the
 * `setAll` adapter in `src/lib/supabaseSession.ts`. It is GET because a link in
 * an email can only be a GET.
 *
 * 🔴 `token_hash` AND `type` ARE STRIPPED BEFORE THE 303, NOT AFTER (T2).
 * `token_hash` is a single-use session credential travelling in a URL. Anything
 * that survives into the `Location` header is written to the browser's history
 * and sent in the `Referer` of the next request the destination page makes — so
 * the credential would reach every third-party asset that page loads. Two
 * independent barriers cover it:
 *   1. The target is built from `next` ALONE, never from this route's own URL,
 *      so the incoming parameters have no path into it by default.
 *   2. `stripAuthParams` then removes them from `next` as well, because `next`
 *      is attacker-supplied and can carry a copy.
 *
 * 🔴 THE `type` PARAMETER IN THE URL IS IGNORED. `verifyOtp` is always called
 * with `type: 'email'`, per design §1 and the `user-identity` spec. Forwarding
 * the claimed value would let a crafted link choose which verification flow
 * runs; the server decides that, not the link.
 *
 * Every exit is a 303 to a safe same-site path, including every failure. There
 * is no body to render an error into, so a rejected link redirects with the
 * `auth=link-invalid` marker and the sign-in page renders the invitation to
 * request a new one.
 */
import type { APIRoute } from 'astro';
import {
  safeNextPath,
  stripAuthParams,
  withAuthError,
} from '@lib/authRedirect';
import { markPrivate } from '@lib/httpCache';
import { createSessionClient } from '@lib/supabaseSession';

/**
 * Build the 303.
 *
 * `pendingHeaders` is flushed FIRST and the cache directive applied AFTER, so a
 * permissive value the library asked for cannot end up caching a response that
 * carries a freshly minted session cookie.
 */
function redirect(target: string, pendingHeaders: Map<string, string>) {
  const headers = new Headers({ location: target });
  for (const [key, value] of pendingHeaders) {
    headers.set(key, value);
  }
  markPrivate(headers);

  return new Response(null, {
    status: 303,
    statusText: 'See Other',
    headers,
  });
}

export const GET: APIRoute = async ({ request, cookies }) => {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');

  // Built from `next` alone. The incoming `token_hash`/`type` are never a source
  // for this value, which is the first of the two T2 barriers.
  const target = stripAuthParams(safeNextPath(url.searchParams.get('next')));

  const { client, pendingHeaders } = createSessionClient({
    request,
    cookies,
    isProd: import.meta.env?.PROD === true,
  });

  // A bare `/api/auth/confirm` is a crawler or a truncated link, not a visitor
  // holding a credential. Nothing to verify, so no round trip is spent on it.
  if (!tokenHash) {
    return redirect(withAuthError(target), pendingHeaders);
  }

  try {
    const { error } = await client.auth.verifyOtp({
      type: 'email',
      token_hash: tokenHash,
    });

    if (error) {
      // Expired, already consumed, or never valid. No session was created, and
      // the three cases are one outcome for the visitor: ask for a new link.
      console.error('[auth/confirm] verifyOtp rejected:', error.message);
      return redirect(withAuthError(target), pendingHeaders);
    }
  } catch (err) {
    // An unreachable Supabase throws. A 500 here would be a dead end on a link
    // the visitor did nothing wrong to receive; the invitation is actionable.
    console.error('[auth/confirm] verifyOtp threw:', err);
    return redirect(withAuthError(target), pendingHeaders);
  }

  return redirect(target, pendingHeaders);
};
