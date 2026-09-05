/**
 * Centralized cache policy for Netlify CDN edge caching.
 *
 * This module owns all cache directives for HTTP responses. Policies are pure
 * functions that return header name/value pairs, ready for `Astro.response.headers.set()`.
 *
 * Design:
 * - Pure functions (zero I/O, zero Astro imports) → testable in node environment.
 * - Single audit point for the security gate (cache keys + directives).
 * - Pages call the appropriate policy function and apply the returned headers.
 *
 * Netlify's security model: responses are NOT cached by default (default-deny).
 * Only responses WITH cache-control directives AND no `private`/`no-cache`/`no-store`
 * AND a `max-age` or `s-maxage` >= 1 second will be stored. This is opt-in.
 *
 * See: https://docs.netlify.com/platform/netlify-cdn/#cache-control
 */

/** Plain object mapping header name → value. */
export type HeaderDict = Record<string, string>;

/** A cache policy is a pure function returning HTTP headers. */
export type CachePolicy = () => HeaderDict;

/**
 * Public content cache policy.
 *
 * Applies to routes that are byte-identical for every visitor (e.g., language-
 * parameterized home pages, news articles). Uses Netlify's edge CDN with
 * stale-while-revalidate for graceful degradation.
 *
 * Policy:
 * - `public`: Cacheable by browser and CDN.
 * - `s-maxage=3600`: Cache at the edge for 1 hour.
 * - `stale-while-revalidate=86400`: Serve stale for up to 24 hours while revalidating in background.
 * - Omit `private`, `no-cache`, `no-store` (Netlify would refuse to cache).
 *
 * Applied to: `/[lang]/index.astro` (homepage), news articles.
 */
export function publicCachePolicy(): HeaderDict {
  return {
    'CDN-Cache-Control':
      'public, s-maxage=3600, stale-while-revalidate=86400',
  };
}

/**
 * No-store cache policy (defense-in-depth).
 *
 * Applies to routes that contain user-sensitive or gated content. Explicitly
 * tells Netlify NOT to cache (redundant with Netlify's default-deny, but
 * defense-in-depth). Used for pass-gated routes and dynamic content.
 *
 * Policy:
 * - `no-store`: Do not cache anywhere (browser or CDN).
 * - Fail-safe: even if a route accidentally has user state, this directive
 *   ensures Netlify will NOT store it.
 *
 * Applied to: `/[lang]/libros/[slug].astro` (pass-gated), any other user-
 * dependent route.
 */
export function noStorePolicy(): HeaderDict {
  return {
    'CDN-Cache-Control': 'no-store',
  };
}
