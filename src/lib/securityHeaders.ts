/**
 * Security headers for every SSR response (hardening).
 *
 * This app is pure SSR — `output: 'server'` in `astro.config.mjs`, no
 * prerendered pages — and runs on Netlify Functions. Netlify's own
 * `netlify.toml`/`_headers` custom headers do NOT apply to function
 * responses (docs.netlify.com/manage/routing/headers: "custom headers won't
 * be applied to that content ... the function should return any required
 * headers instead"). So nothing upstream adds these; `src/middleware.ts` is
 * the one place that can apply them to every response — pages, API JSON,
 * redirects, 404s — without touching every route individually.
 *
 * `applySecurityHeaders` never overwrites a header a route already set for
 * itself (`.has()` guard), so a route's own, presumably more specific,
 * choice always wins over this blanket default.
 *
 * ## Flipping CSP from report-only to enforced at launch
 *
 * The full policy below ships `Report-Only` until production is verified
 * clean (LANZAMIENTO.md §2: needs a few days of real `[csp-report]` log
 * lines first). Enforcing it at launch needs NO code change: set the
 * server-side env var `CSP_ENFORCE=true` in Netlify's site settings (Site
 * configuration → Environment variables) and **redeploy** — see
 * {@link isCspEnforced}. A redeploy is required regardless of whether it
 * rebuilds from source: Netlify only injects current env vars into a
 * Function's `process.env` on a new deploy, never into an already-running
 * instance. Unset/anything else keeps today's report-only behaviour byte
 * for byte.
 */
import { defaultEnvSource, type EnvSource } from './env';
import { getPosthogHost } from './posthog';

/**
 * Whether the full CSP should be ENFORCED (`content-security-policy`, no
 * `-report-only` header) instead of the default report-only posture.
 *
 * Reads the SAME merged `import.meta.env` + `process.env` view
 * `src/lib/env.ts#defaultEnvSource` uses, for the SAME reason (that
 * module's own header): this SSR app is deployed as a Netlify Function, and
 * only variables Vite statically inlined at BUILD time survive in
 * `import.meta.env` — a var configured in Netlify's UI after that build
 * arrives at runtime through `process.env` instead, which a single
 * `import.meta.env` read would never see. Reading `import.meta.env` alone
 * would let flipping `CSP_ENFORCE` in Netlify's dashboard silently do
 * nothing until the next build happens to run with it already set.
 *
 * Read at request time (not cached at module init), from the default merged
 * source unless an explicit `source` is passed. The explicit-`source`
 * overload exists purely for deterministic unit tests of the resolution
 * order: Vitest's own `import.meta.env`, in this project's "node" test
 * environment, transparently falls through to a LIVE `process.env` read for
 * any key Vite did not statically define — so mutating the two ambient
 * globals in a test cannot actually reproduce "frozen at build time vs set
 * later at runtime" the way the real, deployed Netlify Function can (see
 * `src/lib/securityHeaders.test.ts`'s own note on this). An explicit
 * `EnvSource` sidesteps that quirk entirely, same reason `src/lib/env.ts`'s
 * `loadEnv` takes one. Deliberately NOT `PUBLIC_`-prefixed: this must stay a
 * server-side-only decision, never inlined into the client bundle.
 *
 * Only the exact string `"true"` or `"1"` enables it — anything else
 * (unset, `"false"`, `"yes"`, a stray space) is treated as OFF, so a typo in
 * Netlify's env var UI fails safe into report-only rather than silently
 * enforcing an unverified policy.
 */
export function isCspEnforced(source: EnvSource = defaultEnvSource()): boolean {
  const raw = source.CSP_ENFORCE;
  return raw === 'true' || raw === '1';
}

/**
 * The CSP source list shared by the report-only and the enforced policy,
 * built fresh on every call (never cached at module init — see
 * {@link isCspEnforced}'s own note on why `CSP_ENFORCE` is read per-request;
 * the PostHog host below is a `PUBLIC_`-prefixed, build-time var instead, so
 * it cannot actually change between requests, but it's cheap to recompute
 * and keeps both conditionally-built pieces of this policy the same shape).
 *
 * Every non-`'self'`/non-generic source is listed because something in
 * `src/` actually uses it; see the reason beside each one.
 *
 * UNLIKE every other third-party origin below (all allowed unconditionally,
 * since they cost nothing while unused), PostHog's host is added ONLY while
 * `getPosthogHost()` returns one — i.e. only once `PUBLIC_POSTHOG_KEY` is
 * actually set (owner decision: PostHog reaches a different kind of data —
 * product analytics on a minors-used site — than the others, so its CSP
 * footprint stays zero rather than merely unused until configured).
 */
function cspSourceDirectives(): string[] {
  const posthogHost = getPosthogHost();
  const posthogExtra = posthogHost ? ` ${posthogHost}` : '';

  return [
    "default-src 'self'",
    // Astro's inline per-island hydration bootstrap scripts have no nonce/hash
    // yet (that's a follow-up); 'unsafe-inline' keeps them working meanwhile.
    // Cloudflare Turnstile needs its widget script allowed ahead of time.
    // Cloudflare Web Analytics' beacon script (`BaseLayout.astro`) is allowed
    // unconditionally too, same posture as every other directive here — it is
    // simply unused while PUBLIC_CF_WEB_ANALYTICS_TOKEN is unset. PostHog's
    // host (`posthog-js`, loaded from `config.host` itself) is added only
    // while it is actually configured — see this function's own header.
    `script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com${posthogExtra}`,
    // Astro/Tailwind emit inline <style> for component-scoped CSS; Google Fonts
    // is loaded as a <link> stylesheet.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Sanity-hosted images (course/activity/book covers via @sanity/image-url),
    // Supabase Storage media (`src/lib/exerciseMedia.ts` allow-lists the
    // project's storage host alongside Sanity's CDN for the SAME media, so
    // img-src must allow both, not just Sanity), Google account avatars
    // (`lh3.googleusercontent.com`), and data:/blob: for inline-encoded and
    // client-generated images.
    "img-src 'self' data: blob: https://*.supabase.co https://cdn.sanity.io https://lh3.googleusercontent.com",
    // Google Fonts' font files.
    'font-src \'self\' https://fonts.gstatic.com',
    // Supabase REST/Auth/Storage calls (fetch/XHR from the browser client).
    // No `wss://` — grepped: nothing in this codebase uses Supabase Realtime
    // (`.channel(`) today, so there is nothing to allow a websocket for yet.
    // Sentry's ingest endpoint (error reporting, `sentry.client.config.ts`):
    // allowed unconditionally, same as every other directive here — it is
    // simply unused while PUBLIC_SENTRY_DSN is unset. Both known SaaS ingest
    // host shapes are covered: the plain `o<id>.ingest.sentry.io` and the
    // regionalized `o<id>.ingest.<region>.sentry.io` (today: us, de).
    // Cloudflare Web Analytics' own reporting origin (unused while
    // PUBLIC_CF_WEB_ANALYTICS_TOKEN is unset, same posture as above). PostHog's
    // host is added only while configured — see this function's own header.
    `connect-src 'self' https://*.supabase.co https://*.ingest.sentry.io https://*.ingest.us.sentry.io https://*.ingest.de.sentry.io https://cloudflareinsights.com${posthogExtra}`,
    // Exercise audio playback streams from Sanity assets and Supabase storage.
    "media-src 'self' https://cdn.sanity.io https://*.supabase.co",
    // Course/news embeds (YouTube nocookie, Vimeo) and Turnstile's widget iframe.
    "frame-src 'self' https://www.youtube-nocookie.com https://player.vimeo.com https://challenges.cloudflare.com",
    // pdf.js's worker is bundled locally (loaded as a same-origin blob: Worker).
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    // Google sign-in: entrar's <form> posts to /api/auth/google, which 303s to
    // Supabase's own /auth/v1/authorize, which 303s on to accounts.google.com.
    "form-action 'self' https://*.supabase.co https://accounts.google.com",
    "frame-ancestors 'self'",
  ];
}

/**
 * Both reporting directives, pointed at the SAME endpoint: `report-to` is
 * the modern Reporting API directive (Chromium only), `report-uri` is the
 * legacy one every browser still honors (Firefox/Safari never shipped
 * report-to). The `report-to` value names the `Reporting-Endpoints` entry
 * set below, not a URL directly. Kept in BOTH the report-only and the
 * enforced policy — violations stay collected at `POST /api/csp-report`
 * (`src/pages/api/csp-report.ts`) either way.
 */
const CSP_REPORTING_DIRECTIVES = ['report-to csp-endpoint', 'report-uri /api/csp-report'];

/**
 * The target Content-Security-Policy, shipped `Report-Only` while
 * {@link isCspEnforced} is off (today's default) so nothing breaks before it
 * is verified clean in production. Violations are collected at
 * `POST /api/csp-report` instead of only showing up in a visitor's own
 * console.
 *
 * NOT `upgrade-insecure-requests` here: CSP3 §6.2 (and MDN) say browsers
 * ignore that directive entirely in a Report-Only policy and log a console
 * error about it on every single page load. It belongs only in
 * {@link enforcedCsp}.
 */
function reportOnlyCsp(): string {
  return [...cspSourceDirectives(), ...CSP_REPORTING_DIRECTIVES].join('; ');
}

/**
 * The same policy, ENFORCED: adds `upgrade-insecure-requests` (meaningless,
 * and noisy in the console, under report-only — see {@link reportOnlyCsp}).
 * Reporting directives are kept so violations are still collected once
 * enforced, not just silently blocked.
 */
function enforcedCsp(): string {
  return [...cspSourceDirectives(), 'upgrade-insecure-requests', ...CSP_REPORTING_DIRECTIVES].join(
    '; ',
  );
}

/**
 * Apply the fixed set of security headers to `headers`, in place. Each is
 * set ONLY when the route has not already set it itself.
 *
 * Throws if `headers` carries the Fetch spec's "immutable" guard (e.g. a
 * response built with `Response.redirect()`) — this function only ever
 * mutates what it is given; `src/middleware.ts` is the caller that rebuilds
 * a fresh, mutable `Response` to recover from that.
 */
export function applySecurityHeaders(headers: Headers): void {
  if (!headers.has('x-frame-options')) {
    headers.set('x-frame-options', 'SAMEORIGIN');
  }
  if (!headers.has('referrer-policy')) {
    headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  }
  if (!headers.has('permissions-policy')) {
    // microphone stays available to OURSELVES (speaking-practice work is
    // planned); payment is deliberately NOT restricted — a payment provider
    // will need it later.
    headers.set('permissions-policy', 'camera=(), geolocation=(), microphone=(self)');
  }
  if (!headers.has('x-content-type-options')) {
    headers.set('x-content-type-options', 'nosniff');
  }
  const enforced = isCspEnforced();
  if (!headers.has('content-security-policy')) {
    // Default (unset/anything but exactly "true"/"1"): clickjacking only.
    // The rest of the policy ships report-only below until it is verified
    // clean. Once CSP_ENFORCE flips on, the full policy goes here instead.
    headers.set('content-security-policy', enforced ? enforcedCsp() : "frame-ancestors 'self'");
  }
  if (!enforced && !headers.has('content-security-policy-report-only')) {
    headers.set('content-security-policy-report-only', reportOnlyCsp());
  }
  if (!headers.has('reporting-endpoints')) {
    // Names the `csp-endpoint` the report-only policy's `report-to`
    // directive (above) points at. Only the Reporting API path needs this
    // header — `report-uri` carries its own target URL inline.
    headers.set('reporting-endpoints', 'csp-endpoint="/api/csp-report"');
  }
}

/**
 * Apply the security headers to `response`, returning a response that
 * definitely carries them.
 *
 * A response built with `Response.redirect()` (or anything else carrying the
 * Fetch spec's "immutable" header guard) throws on `.set()`. Every response
 * `src/middleware.ts` returns — including ones that came from Astro's own
 * internals via `next()` or `context.redirect()` — must still get the
 * headers, so a throw here rebuilds a fresh, mutable response from the same
 * body/status/headers and applies {@link applySecurityHeaders} to THAT
 * instead.
 */
export function withSecurityHeaders(response: Response): Response {
  try {
    applySecurityHeaders(response.headers);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    applySecurityHeaders(copy.headers);
    return copy;
  }
}
