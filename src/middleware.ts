import { defineMiddleware } from 'astro:middleware';
import { DEFAULT_LANG, isValidLang, type Lang } from '@lib/i18n';
import { createSessionClient } from '@lib/supabaseSession';

/**
 * Locale routing and identity resolution (spec 5: Lang Routing · user-identity).
 *
 * Runs on every request. It does two jobs, in a fixed order.
 *
 * Locale contract, unchanged:
 *  - `/`                -> 302 redirect to `/{DEFAULT_LANG}/` (root redirect).
 *  - `/{valid-lang}/…`  -> passes through; exposes `locals.lang` to pages.
 *  - `/{invalid-lang}/…`-> 404 (invalid lang segment).
 *  - Non-localized paths (assets, `/api/…`, `/404`) get no `locals.lang`.
 *
 * Identity contract, new:
 *  - `locals.user` is assigned on EVERY path, and assigned `null` first.
 *  - Paths that render nothing (`/` and the invalid-lang 404) do no session
 *    work at all, because there is no markup for an identity to influence.
 *  - Everything else resolves the caller through `getUser()`, which is the only
 *    Supabase call that revalidates the token server-side. `getSession()` is
 *    never used for an authorization decision anywhere in this codebase.
 *
 * Ordering is the design (design §1) and is not incidental: the redirect and the
 * 404 come before the session gate so they cost no round trip, and the header
 * flush comes after `next()` because middleware cannot reach the `Response`
 * before then.
 */

/**
 * Whether a request path should resolve a session.
 *
 * This is the only thing between the site and one authenticated Supabase round
 * trip per static asset, so it is a pure exported predicate with its own unit
 * tests rather than an inline condition.
 *
 * `false` for Astro's build output (`_astro/*`) and for anything whose FIRST
 * segment carries a dot — `/favicon.ico`, `/robots.txt`, `/sitemap.xml`. A dot
 * deeper in the path belongs to a page slug, not to a file, so it still needs a
 * session. Everything else is `true`, including `/api/*`: the auth routes and
 * every mutating guard live there.
 *
 * @param pathname - Request path, e.g. `/es/libros`.
 */
export function needsSession(pathname: string): boolean {
  const firstSegment = pathname.split('/')[1] ?? '';
  return firstSegment !== '_astro' && !firstSegment.includes('.');
}

export const onRequest = defineMiddleware(async (context, next) => {
  // FIRST, always, on every path. `App.Locals.user` is `User | null` and never
  // optional, so a path that forgets this assignment is a type error rather
  // than a visitor who is silently never signed in.
  context.locals.user = null;

  const { pathname } = context.url;

  // Root: redirect to the default locale home (spec 5: root redirect).
  // Nothing renders, so no session work.
  if (pathname === '/') {
    return context.redirect(`/${DEFAULT_LANG}/`, 302);
  }

  const firstSegment = pathname.split('/')[1] ?? '';

  // Paths that are not locale-prefixed pages: let Astro route them.
  // (API routes, static assets with a file extension, and Astro internals.)
  const isNonLocalePath =
    firstSegment === '' ||
    firstSegment === 'api' ||
    firstSegment === '_astro' ||
    firstSegment.includes('.');

  if (!isNonLocalePath) {
    // A locale-looking first segment MUST be a supported language.
    if (!isValidLang(firstSegment)) {
      // Invalid lang segment -> 404 (spec 5: invalid lang). Nothing renders,
      // so no session work.
      return new Response(null, {
        status: 404,
        statusText: 'Not Found',
      });
    }

    // Valid lang: expose it to pages so they don't re-parse the URL.
    context.locals.lang = firstSegment as Lang;
  }

  if (!needsSession(pathname)) {
    return next();
  }

  const { client, pendingHeaders } = createSessionClient({
    request: context.request,
    cookies: context.cookies,
    // `secure` is the one cookie flag that moves with the environment: a
    // browser discards a `Secure` cookie on `http://localhost`, which would
    // make local sign-in impossible. Same house rule as
    // `src/pages/api/descargar/[slug].ts`.
    isProd: import.meta.env?.PROD === true,
  });

  // `getUser()` is both the identity check and the session refresh. It costs one
  // authenticated round trip per request, which is the documented safe price of
  // a server-verified session.
  const { data } = await client.auth.getUser();
  context.locals.user = data.user ?? null;

  const response = await next();

  // Supabase may have asked for response headers while refreshing the session.
  // They were buffered because the `Response` did not exist until now.
  for (const [key, value] of pendingHeaders) {
    response.headers.set(key, value);
  }

  return response;
});
