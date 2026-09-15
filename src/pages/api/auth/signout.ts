/**
 * POST /api/auth/signout — end the session.
 *
 * `signOut()` clears the session cookies through the same `setAll` adapter the
 * confirm route sets them with: the library hands back an empty value per
 * cookie, and `src/lib/supabaseSession.ts` turns that into `cookies.delete`.
 * That is what makes the CHUNKED `sb-…-auth-token.0` / `.1` pair a real JWT
 * produces disappear together — the route never names a cookie itself, so it
 * cannot miss one when the chunk count changes.
 *
 * 🔴 POST-ONLY, AND THAT IS A SECURITY PROPERTY, NOT A STYLE CHOICE. With
 * `sameSite: 'lax'` the browser does not attach the session cookie to a
 * cross-site POST, which is precisely what makes lax cookies the CSRF defense
 * for this feature (design §1). A GET sign-out would be triggerable by any
 * `<img src>` on any page, and by any prefetch or link preview.
 *
 * Every path ends in a 303 to a safe same-site page, failures included: a
 * visitor who asked to leave must never be stranded on an error page with a
 * signed-in browser and no obvious way out.
 */
import type { APIRoute } from 'astro';
import { safeNextPath } from '@lib/authRedirect';
import { markPrivate } from '@lib/httpCache';
import { createSessionClient } from '@lib/supabaseSession';

export const POST: APIRoute = async ({ request, cookies }) => {
  const url = new URL(request.url);

  // Home by default — `safeNextPath(null)` IS the default-locale home. An
  // explicit `next` keeps an English reader on the English side of the site,
  // and goes through the same guard the magic-link routes use so a sign-out
  // link cannot become an open redirect either.
  const target = safeNextPath(url.searchParams.get('next'));

  const { client, pendingHeaders } = createSessionClient({
    request,
    cookies,
    isProd: import.meta.env?.PROD === true,
  });

  try {
    const { error } = await client.auth.signOut();
    if (error) {
      console.error('[auth/signout] signOut failed:', error.message);
    }
  } catch (err) {
    console.error('[auth/signout] signOut threw:', err);
  }

  const headers = new Headers({ location: target });
  for (const [key, value] of pendingHeaders) {
    headers.set(key, value);
  }
  // Applied last: the response carries the cookie deletions, and a cached copy
  // would either hand a later visitor a sign-out or hide this one.
  markPrivate(headers);

  return new Response(null, { status: 303, statusText: 'See Other', headers });
};
