import { defineMiddleware } from 'astro:middleware';
import { DEFAULT_LANG, isValidLang, type Lang } from '@lib/i18n';

/**
 * Locale routing middleware (spec 5: Lang Routing).
 *
 * Runs on every request and enforces the `[lang]` contract:
 *  - `/`                -> 302 redirect to `/{DEFAULT_LANG}/` (root redirect).
 *  - `/{valid-lang}/…`  -> passes through; exposes `locals.lang` to pages.
 *  - `/{invalid-lang}/…`-> 404 (invalid lang segment).
 *  - Non-localized paths (assets, `/api/…`, `/404`) pass through untouched.
 *
 * Astro's own `i18n.routing.prefixDefaultLocale: true` handles the catch-all
 * for unmatched routes; this middleware makes the root redirect and the
 * invalid-lang 404 explicit and testable, and hands the validated `lang` to
 * pages via `context.locals` so they don't re-parse the URL.
 */
export const onRequest = defineMiddleware((context, next) => {
  const { pathname } = context.url;

  // Root: redirect to the default locale home (spec 5: root redirect).
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

  if (isNonLocalePath) {
    return next();
  }

  // A locale-looking first segment MUST be a supported language.
  if (!isValidLang(firstSegment)) {
    // Invalid lang segment -> 404 (spec 5: invalid lang).
    return new Response(null, {
      status: 404,
      statusText: 'Not Found',
    });
  }

  // Valid lang: expose it to pages so they don't re-parse the URL.
  context.locals.lang = firstSegment as Lang;
  return next();
});
