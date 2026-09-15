/**
 * GET /api/auth/confirm — the magic link lands here. Step two of two.
 *
 * Establishes the session server-side, which is what makes the session cookies
 * appear: the Supabase client writes them through the `setAll` adapter in
 * `src/lib/supabaseSession.ts`. It is GET because a link in an email can only
 * be a GET.
 *
 * 🔴 TWO CREDENTIALS ARRIVE HERE, AND THE ROUTE MUST KNOW BOTH.
 * Supabase hands over a different credential depending on which email template
 * sent the link, and the difference is not cosmetic:
 *
 *   - `?code=…` — what the DEFAULT template sends. `@supabase/ssr` hardcodes
 *     `flowType: 'pkce'` in `createServerClient` (it is set AFTER the caller's
 *     `auth` options, so it cannot be overridden), and under PKCE the verify
 *     endpoint redirects here with the auth code as a QUERY parameter.
 *     Redeemed with `exchangeCodeForSession`.
 *   - `?token_hash=…` — what a CUSTOM template sends. Redeemed with `verifyOtp`.
 *
 * The distinction matters because the default template's OTHER behaviour is
 * useless to a server: without a custom template Supabase returns the session in
 * the URL FRAGMENT, and a fragment is never transmitted to the server. The
 * query-parameter `code` is the only thing on that redirect this route can read
 * — which is precisely why handling it is not optional. Custom email templates
 * are a paid Supabase capability this project does not have, so every link it
 * sends today is the default one and arrives as `?code=`. A route that knew only
 * `token_hash` would sign nobody in.
 *
 * 🔴 PRECEDENCE WHEN BOTH ARE PRESENT: `code` WINS, WITH NO FALLBACK.
 * Supabase never sends both, so a URL carrying both was composed by hand, and
 * the order is a security decision rather than a formality. `code` is bound to a
 * PKCE code verifier held only by the browser that requested the link, so a code
 * an attacker pastes into someone else's URL cannot be redeemed in the victim's
 * browser. `token_hash` is an UNBOUND BEARER credential: whoever holds it can
 * redeem it from any device. Preferring the bearer credential would hand an
 * attacker a session-fixation attack — append your own `token_hash` to a link,
 * send it to a victim, and their browser signs in as YOU, after which everything
 * they author lands in your account. So the bound credential is tried first, and
 * a failed exchange does NOT fall through to the bearer one: falling through
 * would reopen exactly the hole the precedence closes.
 *
 * ⚠️ PKCE IS BROWSER-BOUND, AND THAT IS A REAL LIMITATION, NOT A DETAIL.
 * Requesting a link stores the code verifier in a cookie on the sign-in
 * response, and `exchangeCodeForSession` needs that cookie back. The click must
 * therefore happen IN THE SAME BROWSER that requested the link. Request it on a
 * laptop, open the mail on a phone, and there is no verifier: the exchange fails
 * and the visitor gets the "ask for a new link" invitation. This is inherent to
 * PKCE and cannot be fixed inside this route.
 *
 * The `token_hash` path is kept for exactly that reason, even though nothing
 * sends it today. It needs no verifier, so it is the device-independent option
 * the moment a custom email template becomes available. Deleting it as dead code
 * would discard the only escape from the limitation above.
 *
 * 🔴 EVERY CREDENTIAL IS STRIPPED BEFORE THE 303, NOT AFTER (T2).
 * `code` and `token_hash` are both single-use session credentials travelling in
 * a URL. Anything that survives into the `Location` header is written to the
 * browser's history and sent in the `Referer` of the next request the
 * destination page makes — so the credential would reach every third-party asset
 * that page loads. Two independent barriers cover it:
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

/** Which of the two credentials the link carried, and its value. */
type Credential =
  | { kind: 'code'; value: string }
  | { kind: 'token_hash'; value: string };

/**
 * Pick the credential to redeem, or `null` when the link carried none.
 *
 * Pure, and deliberately the ONLY place the precedence is expressed: the rule
 * argued in the module header is one readable `if` order here rather than a
 * property of whichever branch the handler happens to test first.
 *
 * @param params - The confirm URL's query parameters.
 */
function selectCredential(params: URLSearchParams): Credential | null {
  // `code` first — it is the browser-bound credential. See the module header.
  const code = params.get('code');
  if (code) {
    return { kind: 'code', value: code };
  }

  const tokenHash = params.get('token_hash');
  if (tokenHash) {
    return { kind: 'token_hash', value: tokenHash };
  }

  return null;
}

export const GET: APIRoute = async ({ request, cookies }) => {
  const url = new URL(request.url);
  const credential = selectCredential(url.searchParams);

  // Built from `next` alone. The incoming credentials and `type` are never a
  // source for this value, which is the first of the two T2 barriers.
  const target = stripAuthParams(safeNextPath(url.searchParams.get('next')));

  const { client, pendingHeaders } = createSessionClient({
    request,
    cookies,
    isProd: import.meta.env?.PROD === true,
  });

  // A bare `/api/auth/confirm` is a crawler or a truncated link, not a visitor
  // holding a credential. Nothing to redeem, so no round trip is spent on it.
  if (!credential) {
    return redirect(withAuthError(target), pendingHeaders);
  }

  try {
    // Exactly ONE redemption runs. A failed `code` exchange does not retry as a
    // `token_hash`; the module header explains why that fallback is an attack.
    const { error } =
      credential.kind === 'code'
        ? await client.auth.exchangeCodeForSession(credential.value)
        : await client.auth.verifyOtp({
            type: 'email',
            token_hash: credential.value,
          });

    if (error) {
      // Expired, already consumed, never valid, or — for `code` — opened in a
      // browser that holds no PKCE verifier. Every cause is one outcome for the
      // visitor: ask for a new link.
      console.error(
        `[auth/confirm] ${credential.kind} rejected:`,
        error.message,
      );
      return redirect(withAuthError(target), pendingHeaders);
    }
  } catch (err) {
    // An unreachable Supabase throws. A 500 here would be a dead end on a link
    // the visitor did nothing wrong to receive; the invitation is actionable.
    console.error(`[auth/confirm] ${credential.kind} threw:`, err);
    return redirect(withAuthError(target), pendingHeaders);
  }

  return redirect(target, pendingHeaders);
};
