import { defineMiddleware } from 'astro:middleware';
import { hasAccess, requiresLogin } from '@lib/access';
import { safeNextPath } from '@lib/authRedirect';
import { markPrivate } from '@lib/httpCache';
import { DEFAULT_LANG, isValidLang, type Lang } from '@lib/i18n';
import {
  createSessionClient,
  flushSessionHeaders,
} from '@lib/supabaseSession';

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
 *  - Identity resolution fails OPEN. A token Supabase dislikes already comes
 *    back as a value (`{ data: { user: null }, error }`), but an unreachable
 *    Supabase THROWS, and an uncaught throw in middleware is a 500 on every
 *    page. So the call is wrapped, and a rejection degrades to
 *    `locals.user = null` and renders.
 *
 * That last rule is deliberate, and it is deliberately the OPPOSITE of what
 * `src/lib/roles.ts` is specified to do. They are different jobs with different
 * blast radii:
 *
 *  - Resolving identity answers "who is this?". Answering "nobody" during an
 *    outage costs one visitor a session they already had. THROWING costs every
 *    visitor every page — books, news and exercises included, none of which
 *    read `locals.user` at all. So it fails OPEN.
 *  - Enforcing permission answers "may they do this?". Answering "yes" when it
 *    cannot tell hands out access nobody granted. So it fails CLOSED.
 *
 * Failing open here opens nothing: with no user, every downstream role guard
 * and every mutating endpoint denies exactly as it would for an anonymous
 * visitor. Do not "fix" one direction to match the other.
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

  const session = createSessionClient({
    request: context.request,
    // `secure` is the one cookie flag that moves with the environment: a
    // browser discards a `Secure` cookie on `http://localhost`, which would
    // make local sign-in impossible. Same house rule as
    // `src/pages/api/descargar/[slug].ts`.
    isProd: import.meta.env?.PROD === true,
  });

  // `getUser()` is both the identity check and the session refresh. It costs one
  // authenticated round trip per request, which is the documented safe price of
  // a server-verified session.
  //
  // The `try` wraps this ONE call and nothing else, so a bug anywhere later in
  // the handler still surfaces as the error it is.
  try {
    const { data } = await session.client.auth.getUser();
    context.locals.user = data.user ?? null;
  } catch (err) {
    // `locals.user` is still the `null` assigned at the top of the handler, so
    // the request renders signed out rather than dying. Reported, never
    // swallowed: a silent catch would hide a programming error behind a site
    // that is permanently anonymous, which is worse than the 500 it replaced.
    console.error('[middleware] getUser() threw:', err);
  }

  // Gate Inglés/Cursos (`@lib/access`) HERE, in the one place no page can
  // forget it, rather than per-page like `/[lang]/crear` does. Scoped to
  // lang-prefixed pages only (`isNonLocalePath` false) — `requiresLogin`
  // inspects the THIRD path segment on the assumption the second one is a
  // lang, so checking it against `/api/...` or an asset path would be
  // meaningless. Libros, Noticias and the home page are untouched: they are
  // simply never `requiresLogin`.
  const gated = !isNonLocalePath && requiresLogin(pathname);

  if (gated && !hasAccess(context.locals.user, pathname)) {
    // `next`, via `safeNextPath` — same open-redirect guard the magic-link
    // routes use, since a query string is attacker-controlled.
    const next = safeNextPath(`${pathname}${context.url.search}`);
    const headers = new Headers({
      location: `/${context.locals.lang}/auth/entrar?next=${encodeURIComponent(next)}`,
    });
    // Flushed even on this exit: a rotated/cleared session cookie must reach
    // the browser on every response, redirects included (same rule the auth
    // endpoints follow).
    flushSessionHeaders(headers, session);
    // 🔴 NEVER CACHEABLE. A CDN caching this redirect would serve it to a
    // visitor who IS signed in, or — worse — cache a signed-in visitor's
    // gated page under this same key and hand it to the next anonymous
    // request. See `src/lib/httpCache.ts` (design §2 / T7).
    markPrivate(headers);

    return new Response(null, { status: 303, statusText: 'See Other', headers });
  }

  const response = await next();

  // Supabase may have rotated the session while resolving identity, and asked
  // for response headers alongside it. Both were buffered because the
  // `Response` did not exist until now — which is the same reason the auth
  // endpoints flush onto the `Response` they build: a rotated cookie that never
  // reaches the browser is a silent logout on the request after this one.
  flushSessionHeaders(response.headers, session);

  // Defense in depth for the same T7 hazard as above: even a SIGNED-IN
  // visitor's gated page must never reach a shared cache, because that cached
  // copy would then be handed to the NEXT visitor's request for the same URL,
  // anonymous or not. Applied here rather than trusted to each gated page,
  // exactly like the redirect above — a page under `ingles`/`cursos` that
  // forgets `markPrivate` itself is still covered.
  if (gated) {
    markPrivate(response.headers);
  }

  return response;
});
