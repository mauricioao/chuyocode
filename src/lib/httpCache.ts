/**
 * Cache safety for session-dependent responses (design §2, threat matrix T7).
 *
 * A page or endpoint whose output depends on `Astro.locals.user` must never
 * reach a shared cache. If it does, one anonymous visitor is served an
 * authenticated visitor's HTML — a data leak with no error and no log, caused by
 * infrastructure doing exactly what it was told.
 *
 * Two independent halves cover the hazard, and both are required:
 *  - This module, called explicitly by every auth-dependent page and endpoint.
 *  - `src/astroConfig.test.ts`, which forbids the adapter's on-demand page
 *    caching option from ever being switched on.
 *
 * Nothing here is clever. It exists so the directive is spelled in exactly one
 * place: a hand-typed `'private, no-store'` at fifteen call sites is fifteen
 * chances to typo it into something a CDN happily caches.
 */

/**
 * The `cache-control` value for any response that varies by session.
 *
 * `private` bars shared caches (Netlify's CDN). `no-store` bars the browser's
 * own disk cache, which matters on a shared machine after sign-out. Neither
 * directive alone is sufficient, so they always travel together.
 */
export const PRIVATE_CACHE_CONTROL = 'private, no-store';

/**
 * Mark a response as session-dependent and uncacheable.
 *
 * Call it from the frontmatter of every auth-dependent page
 * (`markPrivate(Astro.response.headers)`) and from every auth-dependent
 * endpoint before returning.
 *
 * Uses `set`, never `append`: the hazard is not a missing directive but a
 * permissive one already in place from a framework or adapter default, and an
 * appended `private` behind `public, max-age=3600` does not undo it. `set` also
 * makes the call idempotent, so a page and its layout may both call it.
 *
 * @param headers - The outgoing response headers, mutated in place.
 */
export function markPrivate(headers: Headers): void {
  headers.set('cache-control', PRIVATE_CACHE_CONTROL);
}
