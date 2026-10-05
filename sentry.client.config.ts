/**
 * Sentry CLIENT (browser) init — auto-loaded by the `@sentry/astro`
 * integration (see astro.config.mjs). That integration is only ever added
 * to `integrations` when `PUBLIC_SENTRY_DSN` is set at BUILD time, so this
 * file — and the `@sentry/astro` client runtime it imports — never reaches
 * the client bundle at all otherwise; it is not enough to guard the
 * `Sentry.init()` call alone.
 *
 * `PUBLIC_SENTRY_DSN` IS A PUBLIC, BUILD-TIME VARIABLE, same posture as
 * `src/lib/turnstile.ts`'s `PUBLIC_TURNSTILE_SITE_KEY` (see that file's
 * header): Astro/Vite inlines any `PUBLIC_`-prefixed var into the bundle at
 * build time, not read from `process.env` at request time. The guard below
 * is still worth keeping (blank-is-off, like Turnstile) rather than trusting
 * astro.config.mjs's own gate never to drift out of sync with this file.
 *
 * Errors only: no performance/tracing data (`tracesSampleRate: 0`) and no
 * Session Replay (its integration is never added below — Sentry does not
 * enable Replay unless `Sentry.replayIntegration()` is explicitly listed).
 *
 * `dataCollection` (NOT the older, removed `sendDefaultPii` boolean — this
 * SDK's `Options` type has no such field, verified against the installed
 * @sentry/core@11.4.0 types) is this version's own, more granular
 * replacement: `userInfo: false` keeps the visitor's IP address out (it
 * defaults to true), `cookies: false` drops cookies entirely, and
 * `httpHeaders`' `deny` list drops just the cookie/authorization headers
 * while still collecting other, non-sensitive request headers. Every other
 * `dataCollection` category is left at its documented default.
 * `scrubSensitiveRequestData` is a defense-in-depth backstop for the same
 * two categories, shared with sentry.server.config.ts.
 */
import * as Sentry from '@sentry/astro';
import { scrubSensitiveRequestData } from './src/lib/sentryScrub';

const dsn = import.meta.env.PUBLIC_SENTRY_DSN?.trim();

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0,
    dataCollection: {
      // `userInfo` defaults to true, which attaches the visitor's IP address.
      userInfo: false,
      cookies: false,
      // A top-level `{ deny }` applies to both request and response headers
      // (`resolveHttpHeaders` in @sentry/core's resolveDataCollectionOptions).
      httpHeaders: { deny: ['cookie', 'set-cookie', 'authorization', 'proxy-authorization'] },
    },
    beforeSend(event) {
      scrubSensitiveRequestData(event as unknown as Record<string, unknown>);
      return event;
    },
    beforeSendTransaction(event) {
      scrubSensitiveRequestData(event as unknown as Record<string, unknown>);
      return event;
    },
  });
}
