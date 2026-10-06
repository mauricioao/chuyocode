/**
 * Cloudflare Web Analytics — cookieless, no-personal-data page-view tracking
 * (a launch "must" per the PRD).
 *
 * 🔴 `PUBLIC_CF_WEB_ANALYTICS_TOKEN` IS A PUBLIC, BUILD-TIME VARIABLE, same
 * posture as `src/lib/turnstile.ts`'s `PUBLIC_TURNSTILE_SITE_KEY` and
 * `PUBLIC_SENTRY_DSN` (`sentry.client.config.ts`'s header). Astro/Vite
 * inline any `PUBLIC_`-prefixed variable into the CLIENT bundle at BUILD
 * time — it must be set in Netlify's build environment (not only "available
 * at runtime") before a deploy, or every client bundle from that deploy
 * ships with it blank, permanently, until the next build.
 *
 * {@link getWebAnalyticsToken} (and {@link getWebAnalyticsBeaconPayload} on
 * top of it) returning `null` is this feature's OFF switch:
 * `src/layouts/BaseLayout.astro` renders no script element and no Cloudflare
 * origin appears anywhere in the page while it is unset.
 */

/**
 * The Cloudflare Web Analytics token, or `null` when unset.
 *
 * Blank/whitespace-only counts as unset, same posture as
 * `src/lib/turnstile.ts`'s `getTurnstileSiteKey`.
 */
export function getWebAnalyticsToken(): string | null {
  const raw = import.meta.env.PUBLIC_CF_WEB_ANALYTICS_TOKEN;
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * The exact `data-cf-beacon` attribute value Cloudflare's documented
 * snippet expects (`{"token":"..."}`), or `null` while
 * {@link getWebAnalyticsToken} is unset — `BaseLayout.astro` renders no
 * script element at all in that case.
 *
 * `JSON.stringify` guards a token containing a `"` or `\` (not a real
 * Cloudflare token shape, but cheap to get right); Astro's own attribute
 * serialization HTML-escapes the result on top of that for safe embedding.
 */
export function getWebAnalyticsBeaconPayload(): string | null {
  const token = getWebAnalyticsToken();
  return token === null ? null : JSON.stringify({ token });
}
